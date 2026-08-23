// SERVER-ONLY. The Survive-owned half of Site QA: the qa_verifications store
// plus live routable-page counts and representative example URLs, all from
// Supabase via the service-role client. No traffic/error data lives here.
//
// Every read is wrapped so a missing qa_verifications table (migration not yet
// applied) degrades to "nothing verified yet" rather than crashing the cockpit.

import { GENERATED_SCHOOLS } from "@/lib/schools.generated";
import { orgSlugify } from "@/lib/partners";
import { goPath } from "@/lib/greek-go.functions";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import type { QaExample } from "./types";

export type { QaExample };
export interface VerificationRow {
  template_id: string;
  verified_at: string | null;
  verified_by: string | null;
  verified_version: string | null;
  verified_sha: string | null;
  note: string | null;
  pinned_examples: QaExample[];
  updated_at: string | null;
}
export interface PageCounts {
  campus: number;
  greekChapter: number;
  council: number;
  nationalOrg: number;
  foundationsScenario: number;
  campusesCovered: number;
}

// The service-role client's fluent query builder is deeply chained; the repo's
// other admin modules type it the same loose way.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = { from: (t: string) => any; auth: any };
async function db(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

const TEST_CAMPUS_SLUG = "test-university";

// ── qa_verifications store ─────────────────────────────────────────────────

/** All verification rows, keyed by template_id. Empty map if the table is
 *  absent or unreadable — the cockpit then treats everything as never-verified. */
export async function readVerifications(): Promise<Record<string, VerificationRow>> {
  try {
    const d = await db();
    const { data, error } = await d
      .from("qa_verifications")
      .select(
        "template_id, verified_at, verified_by, verified_version, verified_sha, note, pinned_examples, updated_at",
      );
    if (error || !data) return {};
    const out: Record<string, VerificationRow> = {};
    for (const r of data as VerificationRow[]) {
      out[r.template_id] = {
        ...r,
        pinned_examples: Array.isArray(r.pinned_examples) ? r.pinned_examples : [],
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function upsert(
  templateId: string,
  patch: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const d = await db();
    const { error } = await d
      .from("qa_verifications")
      .upsert(
        { template_id: templateId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "template_id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
}

export function markVerified(
  templateId: string,
  v: {
    verifiedBy: string;
    verifiedVersion: string | null;
    verifiedSha: string | null;
    note?: string | null;
  },
) {
  const patch: Record<string, unknown> = {
    verified_at: new Date().toISOString(),
    verified_by: v.verifiedBy,
    verified_version: v.verifiedVersion,
    verified_sha: v.verifiedSha,
  };
  if (v.note !== undefined) patch.note = v.note;
  return upsert(templateId, patch);
}

export function setNote(templateId: string, note: string | null) {
  return upsert(templateId, { note });
}

export function setPins(templateId: string, pins: QaExample[]) {
  return upsert(templateId, { pinned_examples: pins });
}

// ── live page counts + examples ────────────────────────────────────────────

interface ChapterRow {
  slug: string | null;
  campus_id: string | null;
  council: string | null;
  greek_org_id: string | null;
}

/** Page all routable Greek chapters (PostgREST caps at 1000 rows/request). */
async function fetchRoutableChapters(d: DB): Promise<ChapterRow[]> {
  const all: ChapterRow[] = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const { data, error } = await d
      .from("campus_greek_chapters")
      .select("slug, campus_id, council, greek_org_id")
      .not("slug", "is", null)
      .is("archived_at", null)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as ChapterRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export interface CountsAndExamples {
  counts: PageCounts;
  examplesByTemplate: Record<string, QaExample[]>;
}

/** Counts + a few representative example URLs per dynamic template. Resilient:
 *  any failure yields zeros/empties rather than throwing. */
export async function getCountsAndExamples(): Promise<CountsAndExamples> {
  const campusSchools = GENERATED_SCHOOLS.filter((s) => s.slug !== TEST_CAMPUS_SLUG);
  const empty: PageCounts = {
    campus: campusSchools.length,
    greekChapter: 0,
    council: 0,
    nationalOrg: 0,
    foundationsScenario: 0,
    campusesCovered: 0,
  };
  const examplesByTemplate: Record<string, QaExample[]> = {};

  // Campus-derived examples (no DB needed) — first few schools by name.
  const campusPick = [...campusSchools].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 3);
  examplesByTemplate["campus-page"] = campusPick.map((s) => ({ label: s.name, url: `/${s.slug}` }));
  examplesByTemplate["student-player"] = campusPick.map((s) => ({
    label: `${s.name}${s.courseCode ? " · " + s.courseCode : ""}`,
    url: `/${s.slug}`,
  }));
  examplesByTemplate["rep-page"] = campusPick.map((s) => ({
    label: s.name,
    url: `/${s.slug}/rep`,
  }));
  examplesByTemplate["prof-campus-landing"] = campusPick.map((s) => ({
    label: s.name,
    url: `/outreach/school/${s.slug}`,
  }));

  let d: DB;
  try {
    d = await db();
  } catch {
    return { counts: empty, examplesByTemplate };
  }

  // Campuses: id → { slug, name }, excluding archived + the Test University.
  const campusById = new Map<string, { slug: string; name: string }>();
  try {
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await d
        .from("campuses")
        .select("id, slug, name, archived_at")
        .is("archived_at", null)
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      for (const c of data as { id: string; slug: string | null; name: string | null }[]) {
        if (c.slug && c.slug !== TEST_CAMPUS_SLUG)
          campusById.set(c.id, { slug: c.slug, name: c.name ?? c.slug });
      }
      if (data.length < PAGE) break;
    }
  } catch {
    /* leave campusById empty → greek counts become 0 */
  }

  // Greek org id → name.
  const orgName = new Map<string, string>();
  try {
    const { data } = await d.from("greek_orgs").select("id, name");
    for (const o of (data ?? []) as { id: string; name: string | null }[])
      orgName.set(o.id, o.name ?? "");
  } catch {
    /* ignore */
  }

  const chapters = await fetchRoutableChapters(d).catch(() => [] as ChapterRow[]);

  // Only chapters on a valid (non-archived, non-test) campus are routable pages.
  const routable = chapters.filter((c) => c.campus_id && campusById.has(c.campus_id) && c.slug);
  const campusesCovered = new Set(routable.map((c) => c.campus_id!)).size;

  // Council pages: distinct (campus, council) that a chapter matches into.
  const councilKeys = new Set<string>();
  const councilExamples: QaExample[] = [];
  for (const c of routable) {
    for (const council of COUNCILS) {
      if (councilMatches(council, c.council)) {
        const camp = campusById.get(c.campus_id!)!;
        const key = `${camp.slug}:${council.slug}`;
        if (!councilKeys.has(key)) {
          councilKeys.add(key);
          if (councilExamples.length < 3)
            councilExamples.push({
              label: `${camp.name} · ${council.name}`,
              url: `/partners/council/${camp.slug}/${council.slug}`,
            });
        }
      }
    }
  }

  // National org pages: distinct orgSlugify(name) among routable chapters.
  const orgSlugs = new Set<string>();
  const orgExampleByslug = new Map<string, string>();
  for (const c of routable) {
    const name = c.greek_org_id ? orgName.get(c.greek_org_id) : "";
    if (!name) continue;
    const slug = orgSlugify(name);
    if (!slug) continue;
    orgSlugs.add(slug);
    if (!orgExampleByslug.has(slug)) orgExampleByslug.set(slug, name);
  }

  // Chapter examples: first few routable chapters by campus then slug.
  const chapterExamples: QaExample[] = [];
  const kitExamples: QaExample[] = [];
  const sortedChapters = [...routable].sort((a, b) => {
    const ca = campusById.get(a.campus_id!)!.name;
    const cb = campusById.get(b.campus_id!)!.name;
    return ca.localeCompare(cb) || (a.slug ?? "").localeCompare(b.slug ?? "");
  });
  for (const c of sortedChapters) {
    if (chapterExamples.length >= 3) break;
    const camp = campusById.get(c.campus_id!)!;
    const name = c.greek_org_id ? orgName.get(c.greek_org_id) : "";
    const label = `${camp.name} · ${name || c.slug}`;
    chapterExamples.push({ label, url: goPath(camp.slug, c.slug!) });
    kitExamples.push({ label, url: `/chapters/kit/${camp.slug}/${c.slug}` });
  }

  examplesByTemplate["greek-chapter-page"] = chapterExamples;
  examplesByTemplate["chapter-claim"] = chapterExamples;
  examplesByTemplate["chapter-kit"] = kitExamples;
  examplesByTemplate["chapter-finder"] = campusPick.map((s) => ({
    label: s.name,
    url: `/go/${s.slug}`,
  }));
  examplesByTemplate["council-partner-page"] = councilExamples;
  examplesByTemplate["council-private-page"] = councilExamples.slice(0, 2).map((e) => ({
    label: e.label,
    url: e.url.replace("/partners/council/", "/go/").replace(/\/([^/]+)$/, "/council/$1"),
  }));
  examplesByTemplate["national-org-page"] = [...orgExampleByslug.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, 3)
    .map(([slug, name]) => ({ label: name, url: `/partners/national/${slug}` }));

  // Foundations scenario pages (mirror of scripts/gen-sitemap.ts).
  let foundationsScenario = 0;
  try {
    const { data: course } = await d
      .from("courses")
      .select("id")
      .eq("course_family", "foundations")
      .maybeSingle();
    if (course?.id) {
      const { data: chs } = await d.from("chapters").select("id").eq("course_id", course.id);
      const ids = ((chs ?? []) as { id: string }[]).map((c) => c.id);
      if (ids.length) {
        const { data: scs } = await d.from("je_scenarios").select("slug").in("chapter_id", ids);
        foundationsScenario = ((scs ?? []) as unknown[]).length;
      }
    }
  } catch {
    /* ignore */
  }

  const counts: PageCounts = {
    campus: campusSchools.length,
    greekChapter: routable.length,
    council: councilKeys.size,
    nationalOrg: orgSlugs.size,
    foundationsScenario,
    campusesCovered,
  };
  return { counts, examplesByTemplate };
}
