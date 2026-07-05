// Scenario importer — `bun run scenarios:import`
//
// Reads every data/scenarios/*.json, Zod-validates it against the full ScenarioDoc v2
// schema, and UPSERTS je_scenarios by slug (idempotent — re-running updates in place).
// Each scenario is linked to its chapter under the CANONICAL course (default: the
// generic IA2 row, Ch. 13 "Long-Term Liabilities" — created if missing). Files may
// override the target via their optional `chapter` directive.
//
// Fail-loud per file: one bad file reports its errors and the run continues with the
// others; the process exits non-zero if anything failed. Prints a per-file result table.
//
// Uses the SERVICE-ROLE key (bun auto-loads .env) because je_scenarios has no anon
// write policy — this is an operator tool, never shipped to the browser.

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

import { scenarioFileSchema } from "../src/lib/je/scenario-schema";

const SCENARIOS_DIR = resolve(import.meta.dir, "../data/scenarios");

// Canonical default target (STEP A dedupe made this THE IA2 row).
const DEFAULT_CHAPTER = {
  courseFamily: "intermediate_2",
  courseSlug: "intermediate-accounting-2",
  number: 13,
  name: "Long-Term Liabilities",
};

interface RowResult {
  file: string;
  slug: string;
  action: "inserted" | "updated" | "FAILED";
  chapter: string;
  detail: string;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name} (expected in .env)`);
  return v;
}

async function main(): Promise<void> {
  const supabase = createClient(
    process.env.SUPABASE_URL ?? env("VITE_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );

  const files = readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (files.length === 0) {
    console.log(`No .json files in ${SCENARIOS_DIR} — nothing to import.`);
    return;
  }

  const results: RowResult[] = [];

  for (const file of files) {
    try {
      results.push(await importOne(supabase, file));
    } catch (err) {
      results.push({
        file,
        slug: "—",
        action: "FAILED",
        chapter: "—",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ---- result table ----
  const w = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
  console.log("");
  console.log(`${w("FILE", 44)} ${w("SLUG", 30)} ${w("ACTION", 9)} ${w("CHAPTER", 26)} DETAIL`);
  console.log("-".repeat(130));
  for (const r of results) {
    console.log(`${w(r.file, 44)} ${w(r.slug, 30)} ${w(r.action, 9)} ${w(r.chapter, 26)} ${r.detail}`);
  }
  const failed = results.filter((r) => r.action === "FAILED").length;
  console.log("");
  console.log(`${results.length} file(s): ${results.length - failed} ok, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

async function importOne(
  supabase: ReturnType<typeof createClient>,
  file: string,
): Promise<RowResult> {
  const raw = readFileSync(join(SCENARIOS_DIR, file), "utf8");

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new Error(`invalid JSON: ${e instanceof Error ? e.message : e}`);
  }

  const parsed = scenarioFileSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join(" | ");
    throw new Error(`schema validation failed → ${issues}`);
  }
  const { doc } = parsed.data;
  const directive = { ...DEFAULT_CHAPTER, ...(parsed.data.chapter ?? {}) };

  // ---- resolve the canonical course (family column first; slug/code fallbacks so this
  // works even before migration 0048 adds course_family) ----
  let courseId: string | null = null;
  if (directive.courseFamily) {
    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("course_family" as never, directive.courseFamily)
      .maybeSingle();
    courseId = (data as { id: string } | null)?.id ?? null;
  }
  if (!courseId && directive.courseSlug) {
    const { data } = await supabase
      .from("courses")
      .select("id")
      .eq("slug", directive.courseSlug)
      .maybeSingle();
    courseId = (data as { id: string } | null)?.id ?? null;
  }
  if (!courseId) throw new Error(`canonical course not found (family=${directive.courseFamily}, slug=${directive.courseSlug})`);

  // ---- find-or-create the chapter under that course ----
  const { data: chRow, error: chErr } = await supabase
    .from("chapters")
    .select("id,chapter_name,chapter_number")
    .eq("course_id", courseId)
    .eq("chapter_number", directive.number)
    .maybeSingle();
  if (chErr) throw new Error(`chapter lookup failed: ${chErr.message}`);

  let chapterId: string;
  let chapterLabel: string;
  if (chRow) {
    chapterId = (chRow as { id: string }).id;
    chapterLabel = `Ch ${directive.number} · ${(chRow as { chapter_name: string | null }).chapter_name ?? "?"}`;
  } else {
    const { data: created, error: insErr } = await supabase
      .from("chapters")
      .insert({
        course_id: courseId,
        chapter_number: directive.number,
        chapter_name: directive.name ?? `Chapter ${directive.number}`,
      } as never)
      .select("id")
      .single();
    if (insErr) throw new Error(`chapter create failed: ${insErr.message}`);
    chapterId = (created as { id: string }).id;
    chapterLabel = `Ch ${directive.number} · ${directive.name ?? "?"} (created)`;
  }

  // ---- upsert the scenario by slug ----
  const { data: existing, error: exErr } = await (supabase.from("je_scenarios" as never) as any)
    .select("id")
    .eq("slug", doc.slug)
    .maybeSingle();
  if (exErr) throw new Error(`scenario lookup failed: ${exErr.message}`);

  const payload = { slug: doc.slug, title: doc.title, doc, chapter_id: chapterId };
  if (existing) {
    const { error } = await (supabase.from("je_scenarios" as never) as any)
      .update(payload)
      .eq("slug", doc.slug);
    if (error) throw new Error(`update failed: ${error.message}`);
    return { file, slug: doc.slug, action: "updated", chapter: chapterLabel, detail: "upserted in place" };
  }
  const { error } = await (supabase.from("je_scenarios" as never) as any).insert(payload);
  if (error) throw new Error(`insert failed: ${error.message}`);
  return { file, slug: doc.slug, action: "inserted", chapter: chapterLabel, detail: "new row" };
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
