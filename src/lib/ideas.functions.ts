// IDEAS TO SAVE — server side. Two calls: list them, save one.
//
// Deliberately thin. The whole product promise is "ten seconds and back to
// work", so there is no validation ceremony beyond what the column types
// need, and NO DELETE — PARKED is the archive.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { CATEGORIES, STATUSES, type Idea } from "@/components/ideas/model";

const MISSING = "ideas table missing — apply migration/supabase-migrations/20260831_0900_ideas_vault.sql";

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

/** The table not existing yet is a SETUP problem, not a bug — say which file
 *  fixes it rather than surfacing a raw Postgres code. */
function rethrow(e: { code?: string; message: string }): never {
  if (e.code === "42P01" || /relation .*ideas.* does not exist/i.test(e.message)) throw new Error(MISSING);
  throw new Error(e.message);
}

interface Row {
  id: string; title: string; body: string; categories: string[] | null; subcategory: string;
  status: string; source_path: string; context: Record<string, string> | null;
  prompt_md: string | null; prompt_filename: string | null;
  created_at: string; updated_at: string;
}

const toIdea = (r: Row): Idea => ({
  id: r.id, title: r.title, body: r.body,
  categories: (r.categories ?? []).filter((c): c is Idea["categories"][number] => (CATEGORIES as readonly string[]).includes(c)),
  subcategory: r.subcategory ?? "",
  status: (STATUSES as readonly string[]).includes(r.status) ? (r.status as Idea["status"]) : "IDEA",
  sourcePath: r.source_path ?? "",
  context: r.context ?? {},
  promptMd: r.prompt_md, promptFilename: r.prompt_filename,
  createdAt: r.created_at, updatedAt: r.updated_at,
});

export const listIdeas = createServerFn({ method: "POST" }).handler(async (): Promise<{ ideas: Idea[] }> => {
  const db = await admin();
  const { data, error } = await db.from("ideas").select("*").order("updated_at", { ascending: false });
  if (error) rethrow(error);
  return { ideas: (data as Row[]).map(toIdea) };
});

const ideaInput = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(300).default(""),
  body: z.string().max(20_000).default(""),
  categories: z.array(z.enum(CATEGORIES)).max(7).default([]),
  subcategory: z.string().max(120).default(""),
  status: z.enum(STATUSES).default("IDEA"),
  sourcePath: z.string().max(300).default(""),
  context: z.record(z.string(), z.string()).default({}),
  // The prompt Lee wrote elsewhere with Claude. Generous cap: these are whole
  // build prompts, and truncating one silently would be worse than a failure.
  promptMd: z.string().max(400_000).nullable().default(null),
  promptFilename: z.string().max(200).nullable().default(null),
});

export const saveIdea = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ideaInput.parse(d))
  .handler(async ({ data }): Promise<{ idea: Idea }> => {
    const db = await admin();
    const now = new Date().toISOString();
    const { data: out, error } = await db.from("ideas").upsert({
      id: data.id,
      title: data.title,
      body: data.body,
      categories: data.categories,
      subcategory: data.subcategory,
      status: data.status,
      source_path: data.sourcePath,
      context: data.context,
      prompt_md: data.promptMd,
      prompt_filename: data.promptFilename,
      updated_at: now,
    }, { onConflict: "id" }).select().single();
    if (error) rethrow(error);
    return { idea: toIdea(out as Row) };
  });
