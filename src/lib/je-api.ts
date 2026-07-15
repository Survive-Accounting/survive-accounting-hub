// JE Scenario Engine data layer — the thin DB boundary (parallel to ceq-api.ts).
// The /je route goes through THIS file; it must not import the Supabase client itself.
// je-engine.ts stays pure; this is where I/O lives.
import { supabase } from "@/integrations/supabase/client";
import { fetchChartOfAccounts } from "@/lib/ceq-api";
import type { AccountMeta, AccountType, ScenarioDoc } from "@/lib/je-engine";
import { isMissingSchema } from "@/lib/pg-errors";
import { reportMissingMigration } from "@/lib/missing-migration";

// ---- Scenarios ----

export interface ScenarioRow {
  id: string;
  slug: string;
  title: string;
  doc: ScenarioDoc;
  chapter_id: string | null; // v2: links a scenario to an existing chapters row (migration 0025)
  /** Content-reset lifecycle (migration 0087). undefined = 0087 not applied yet —
   *  the canvas fails loud on that; /je keeps working treating rows as active. */
  status?: "active" | "archived";
  source?: "authored" | "imported";
  sort_order?: number | null;
}

// chapter_id may not exist yet (before 0025 is applied). We try the chapter-aware select
// first and quietly fall back to the basic shape, so the tool keeps working on a DB that
// hasn't had 0025 run — every scenario simply shows up "unassigned" until then.
const MISSING_COLUMN = Symbol("missing-column");

// isMissingSchema also catches PGRST204/205 (PostgREST's own "column/table not
// in the schema cache" codes) — a plain 42703/message-regex check misses those,
// which is exactly the bug that made the canvas fail-loud banners fail silent
// (see src/lib/pg-errors.ts). Every tolerant-fallback select in this file goes
// through this one function so that fix applies everywhere, not just canvas.
function isMissingColumn(error: any): boolean {
  return isMissingSchema(error ?? {}, /chapter_id|status|source|sort_order|subtitle/i);
}

/** List all scenarios (lightweight — full doc included; the prototype set is small).
 *  Tries the content-reset shape (0087) first and steps down so /je keeps working
 *  on an un-migrated DB; rows then carry status/source = undefined, which the
 *  CANVAS treats as "apply 0087" (fail loud there, tolerant here). */
export async function fetchScenarios(): Promise<ScenarioRow[]> {
  let res = await runScenarioSelect("id,slug,title,doc,chapter_id,status,source,sort_order", (q) => q.order("title"));
  if (res === MISSING_COLUMN) res = await runScenarioSelect("id,slug,title,doc,chapter_id", (q) => q.order("title"));
  if (res === MISSING_COLUMN) res = await runScenarioSelect("id,slug,title,doc", (q) => q.order("title"));
  return ((res as any[]) ?? []).map(toScenarioRow);
}

export async function fetchScenarioBySlug(slug: string): Promise<ScenarioRow | null> {
  let res = await runScenarioSelect("id,slug,title,doc,chapter_id", (q) => q.eq("slug", slug).maybeSingle());
  if (res === MISSING_COLUMN) res = await runScenarioSelect("id,slug,title,doc", (q) => q.eq("slug", slug).maybeSingle());
  const data = res as any;
  return data ? toScenarioRow(data) : null;
}

/** Run a je_scenarios select; return MISSING_COLUMN when the select referenced chapter_id pre-0025. */
async function runScenarioSelect(
  cols: string,
  refine: (q: any) => any,
): Promise<any | typeof MISSING_COLUMN> {
  // je_scenarios is not in the generated Supabase types yet, so we cast like ceq-api does.
  const { data, error } = await refine((supabase.from("je_scenarios" as never) as any).select(cols));
  if (error) {
    if (isMissingColumn(error)) return MISSING_COLUMN;
    throw error;
  }
  return data ?? [];
}

function toScenarioRow(r: any): ScenarioRow {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    doc: (r.doc ?? {}) as ScenarioDoc,
    chapter_id: r.chapter_id ?? null,
    status: r.status,
    source: r.source,
    sort_order: r.sort_order,
  };
}

// ---- Chapter browser tree (course → chapter → scenarios) ----
// Reuses the EXISTING chapters/courses tables (see migration 0002). Scenarios link to a
// chapter via je_scenarios.chapter_id (0025). Built so it generalizes to any campus/course —
// nothing here is Ole-Miss-specific; the tree is driven entirely by what scenarios link to.

export interface BrowserScenario {
  id: string;
  slug: string;
  title: string;
  doc: ScenarioDoc;
  chapter_id: string | null;
  status?: "active" | "archived";
  source?: "authored" | "imported";
  sort_order?: number | null;
}

export interface BrowserChapter {
  id: string; // "__unassigned__" for scenarios with no chapter
  chapter_number: number | null;
  chapter_name: string | null;
  /** Course-structure-cleanup lifecycle (migration 0089). undefined = not
   *  applied yet — callers treat that as active (no archived chapters exist
   *  pre-migration anyway). */
  status?: "active" | "archived";
  scenarios: BrowserScenario[];
}

export interface BrowserCourse {
  id: string | null; // null for the synthetic "Unassigned" group
  code: string | null;
  course_name: string | null;
  chapters: BrowserChapter[];
}

export interface JeBrowserTree {
  courses: BrowserCourse[];
  flat: BrowserScenario[]; // every scenario, flat, for slug lookups
}

const UNASSIGNED_CHAPTER = "__unassigned__";

export interface PrincipleTag {
  id: string;
  name: string;
  kind: "assumption" | "principle";
  slug: string;
}

/** The taggable principles vocabulary (0093 `principles` table — distinct from
 *  the /je `je_principles` reference read by fetchPrinciples). 4 assumptions + 4
 *  principles. Returns [] when the table isn't there yet (pre-0093) so tag
 *  pickers render an empty, non-crashing state. */
export async function fetchPrincipleTags(): Promise<PrincipleTag[]> {
  const { data, error } = await (supabase.from("principles" as never) as any)
    .select("id,name,kind,slug").order("sort", { ascending: true });
  if (error) {
    if (isMissingSchema(error, /principles/i)) { reportMissingMigration("0093_principles_and_tags.sql"); return []; }
    throw error;
  }
  return ((data ?? []) as any[]).map((r) => ({ id: r.id, name: r.name, kind: r.kind, slug: r.slug }));
}

export interface Placement {
  scenario_id: string;
  course_id: string | null;
  chapter_id: string;
  sort_order: number;
}

/** scenario_placements (0091) — a scenario may appear in MANY course-chapters.
 *  Returns null when the table isn't there yet (pre-0091): callers fall back to
 *  the legacy je_scenarios.chapter_id single-placement path so the tool keeps
 *  working on an un-migrated DB. */
export async function fetchScenarioPlacements(): Promise<Placement[] | null> {
  const { data, error } = await (supabase.from("scenario_placements" as never) as any)
    .select("scenario_id,course_id,chapter_id,sort_order");
  if (error) {
    if (isMissingSchema(error, /scenario_placements/i)) { reportMissingMigration("0091_scenario_placements.sql"); return null; }
    throw error;
  }
  return ((data ?? []) as any[]).map((r) => ({
    scenario_id: r.scenario_id,
    course_id: r.course_id ?? null,
    chapter_id: r.chapter_id,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : 0,
  }));
}

/**
 * One call that returns the whole browse tree AND the flat scenario list. Empty sibling
 * chapters (a chapter in a course that has scenarios, but none of its own yet) are included
 * so Lee can see where content still needs authoring. Scenarios with no chapter land under a
 * synthetic "Unassigned" course so they stay reachable (also the pre-0025 state of every row).
 *
 * Scenarios and the (tiny) chapters-with-course reference table load in PARALLEL — the old
 * three-step discovery waterfall (linked chapters → sibling chapters → courses) added ~0.7s
 * of sequential round-trips to every cold load for nothing.
 */
export async function fetchJeBrowserTree(): Promise<JeBrowserTree> {
  const [scenarios, chaptersRes, placements] = await Promise.all([
    fetchScenarios(),
    supabase
      .from("chapters")
      .select("id,chapter_number,chapter_name,course_id,status,courses(id,code,course_name)" as never)
      .order("chapter_number", { ascending: true }),
    fetchScenarioPlacements(),
  ]);
  let allChapters: any[];
  if (chaptersRes.error) {
    if (isMissingColumn(chaptersRes.error)) {
      const fallback = await supabase
        .from("chapters")
        .select("id,chapter_number,chapter_name,course_id,courses(id,code,course_name)")
        .order("chapter_number", { ascending: true });
      if (fallback.error) throw fallback.error;
      allChapters = (fallback.data ?? []) as any[];
    } else {
      throw chaptersRes.error;
    }
  } else {
    allChapters = (chaptersRes.data ?? []) as any[];
  }

  const flat: BrowserScenario[] = scenarios.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    doc: s.doc,
    chapter_id: s.chapter_id,
    status: s.status,
    source: s.source,
    sort_order: s.sort_order,
  }));

  // scenarios per chapter. With placements (0091) a scenario appears in MANY
  // chapters — one BrowserScenario COPY per placement, carrying that placement's
  // sort_order so the picker orders each chapter independently. Pre-0091 (null),
  // fall back to the legacy je_scenarios.chapter_id single-placement path.
  const byId = new Map(flat.map((s) => [s.id, s]));
  const scenariosByChapter = new Map<string, BrowserScenario[]>();
  if (placements) {
    for (const p of placements) {
      const s = byId.get(p.scenario_id);
      if (!s) continue;
      const list = scenariosByChapter.get(p.chapter_id) ?? [];
      list.push({ ...s, chapter_id: p.chapter_id, sort_order: p.sort_order });
      scenariosByChapter.set(p.chapter_id, list);
    }
  } else {
    for (const s of flat) {
      if (!s.chapter_id) continue;
      const list = scenariosByChapter.get(s.chapter_id) ?? [];
      list.push(s);
      scenariosByChapter.set(s.chapter_id, list);
    }
  }

  // Courses that have at least one chapter with scenarios; keep ALL chapters of those courses.
  const linkedCourseIds = new Set(
    allChapters.filter((c) => scenariosByChapter.has(c.id) && c.course_id).map((c) => c.course_id as string),
  );

  const courseById = new Map<string, BrowserCourse>();
  for (const c of allChapters) {
    if (!c.course_id || !linkedCourseIds.has(c.course_id)) continue;
    let course = courseById.get(c.course_id);
    if (!course) {
      course = {
        id: c.course_id,
        code: c.courses?.code ?? null,
        course_name: c.courses?.course_name ?? null,
        chapters: [],
      };
      courseById.set(c.course_id, course);
    }
    course.chapters.push({
      id: c.id,
      chapter_number: c.chapter_number ?? null,
      chapter_name: c.chapter_name ?? null,
      status: c.status,
      scenarios: scenariosByChapter.get(c.id) ?? [],
    });
  }

  const courses: BrowserCourse[] = [...courseById.values()].sort((a, b) =>
    (a.code ?? a.course_name ?? "").localeCompare(b.code ?? b.course_name ?? ""),
  );

  // Any scenario whose chapter_id didn't resolve to a fetched chapter → Unassigned.
  const placed = new Set<string>();
  for (const co of courses) for (const ch of co.chapters) for (const s of ch.scenarios) placed.add(s.id);
  const orphans = flat.filter((s) => !placed.has(s.id));
  if (orphans.length > 0) courses.push(unassignedCourse(orphans));

  return { courses, flat };
}

function unassignedCourse(scenarios: BrowserScenario[]): BrowserCourse {
  return {
    id: null,
    code: null,
    course_name: "Unassigned",
    chapters: [{ id: UNASSIGNED_CHAPTER, chapter_number: null, chapter_name: "Not yet tagged to a chapter", scenarios }],
  };
}

// ---- Course options (scene course context — content reset) -------------------
// Every course with its chapters, whether or not it has scenarios yet — the
// canvas course dropdown must show empty courses (Foundations starts empty).

export interface CourseOption {
  id: string;
  code: string | null;
  course_name: string | null;
  course_family: string | null;
  chapters: { id: string; number: number | null; name: string | null; status?: "active" | "archived"; subtitle?: string | null }[];
}

/** Course dropdowns show the clean course_name; code is now a legacy fallback
 *  only (migration 0089 renamed both to the same clean string anyway). */
export function courseLabel(c: { code: string | null; course_name: string | null }): string {
  return c.course_name ?? c.code ?? "Course";
}

/** Chapter dropdown label — ONE format everywhere it appears (chapter
 *  dropdowns, scenario picker, Manage course): "Ch N · Name". Archived
 *  chapters stay selectable (existing refs keep working) but are marked so
 *  Lee doesn't file NEW content under one. */
export function chapterLabel(ch: { number: number | null; name: string | null; status?: "active" | "archived" }): string {
  const base = ch.number != null ? `Ch ${ch.number} · ${ch.name ?? ""}` : (ch.name ?? "");
  return ch.status === "archived" ? `${base} (archived)` : base;
}

export async function fetchCourseOptions(): Promise<CourseOption[]> {
  let coursesRes = await supabase
    .from("courses")
    .select("id,code,course_name,course_family,status" as never)
    .eq("status" as never, "active")
    .order("course_name");
  if (coursesRes.error && isMissingColumn(coursesRes.error)) {
    coursesRes = await supabase.from("courses").select("id,code,course_name,course_family" as never).order("course_name");
  }
  if (coursesRes.error) throw coursesRes.error;

  let chaptersRes = await supabase
    .from("chapters")
    .select("id,chapter_number,chapter_name,course_id,status,subtitle" as never)
    .order("chapter_number", { ascending: true });
  if (chaptersRes.error && isMissingColumn(chaptersRes.error)) {
    chaptersRes = await supabase.from("chapters").select("id,chapter_number,chapter_name,course_id" as never).order("chapter_number", { ascending: true });
  }
  if (chaptersRes.error) throw chaptersRes.error;

  const chaptersByCourse = new Map<string, CourseOption["chapters"]>();
  for (const c of (chaptersRes.data ?? []) as any[]) {
    if (!c.course_id) continue;
    const list = chaptersByCourse.get(c.course_id) ?? [];
    list.push({ id: c.id, number: c.chapter_number ?? null, name: c.chapter_name ?? null, status: c.status, subtitle: c.subtitle ?? null });
    chaptersByCourse.set(c.course_id, list);
  }
  return ((coursesRes.data ?? []) as any[]).map((c) => ({
    id: c.id,
    code: c.code ?? null,
    course_name: c.course_name ?? null,
    course_family: c.course_family ?? null,
    chapters: chaptersByCourse.get(c.id) ?? [],
  }));
}

// ---- Principles (reference table) ----

export interface PrincipleRow {
  key: string;
  label: string;
  short_desc: string | null;
  sort: number | null;
}

export async function fetchPrinciples(): Promise<PrincipleRow[]> {
  const { data, error } = await (supabase.from("je_principles" as never) as any)
    .select("key,label,short_desc,sort")
    .order("sort");
  if (error) throw error;
  return (data ?? []) as PrincipleRow[];
}

// ---- Account metadata (reuse the chart-of-accounts fetch; map rows → AccountMeta) ----

const KNOWN_ACCOUNT_TYPES = new Set<AccountType>([
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
  "contra_asset",
  "contra_liability",
  "contra_equity",
  "contra_revenue",
  "liability_adjunct",
]);

/** Chart of accounts → AccountMeta[], the shape the pure engine consumes. */
export async function fetchAccountMeta(): Promise<AccountMeta[]> {
  const rows = await fetchChartOfAccounts();
  return rows.map((r) => ({
    canonical_name: r.canonical_name,
    account_type: KNOWN_ACCOUNT_TYPES.has(r.account_type as AccountType)
      ? (r.account_type as AccountType)
      : ("asset" as AccountType), // defensive fallback for unexpected types
    normal_balance: r.normal_balance === "credit" ? "credit" : "debit",
  }));
}

// ---- Public (free) tier reads for the indexable /study pages ------------------------------
// Only the "foundations" course family is public. Everything else stays behind the
// interactive /study tool (no per-scenario public URL). These reads are lean (no 600KB
// library pull) so the SSR'd public pages stay fast.

export const PUBLIC_COURSE_FAMILY = "foundations";

export interface PublicScenarioCard {
  slug: string;
  title: string;
}
export interface PublicChapter {
  id: string;
  number: number | null;
  name: string | null;
  scenarios: PublicScenarioCard[];
}
export interface FoundationsIndex {
  courseName: string;
  chapters: PublicChapter[];
}

/** The /study/foundations landing: the foundations course, its chapters, and their scenarios. */
export async function fetchFoundationsIndex(): Promise<FoundationsIndex | null> {
  const { data: course } = await supabase
    .from("courses")
    .select("id,course_name")
    .eq("course_family" as never, PUBLIC_COURSE_FAMILY)
    .maybeSingle();
  if (!course) return null;
  const courseId = (course as { id: string }).id;

  let chsRes: { data: unknown; error: any } = await supabase
    .from("chapters")
    .select("id,chapter_number,chapter_name,status" as never)
    .eq("course_id", courseId)
    .eq("status" as never, "active")
    .order("chapter_number", { ascending: true });
  if (chsRes.error && isMissingColumn(chsRes.error)) {
    chsRes = await supabase.from("chapters").select("id,chapter_number,chapter_name" as never).eq("course_id", courseId).order("chapter_number", { ascending: true });
  }
  const chapters = (chsRes.data ?? []) as { id: string; chapter_number: number | null; chapter_name: string | null }[];
  const chapterIds = chapters.map((c) => c.id);

  const scRes = chapterIds.length
    ? await (supabase.from("je_scenarios" as never) as any).select("slug,title,chapter_id").in("chapter_id", chapterIds)
    : { data: [] as any[] };
  const byChapter = new Map<string, PublicScenarioCard[]>();
  for (const s of (scRes.data ?? []) as { slug: string; title: string; chapter_id: string }[]) {
    const list = byChapter.get(s.chapter_id) ?? [];
    list.push({ slug: s.slug, title: s.title });
    byChapter.set(s.chapter_id, list);
  }

  return {
    courseName: (course as { course_name: string | null }).course_name ?? "Accounting Foundations",
    chapters: chapters.map((c) => ({
      id: c.id,
      number: c.chapter_number,
      name: c.chapter_name,
      scenarios: (byChapter.get(c.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    })),
  };
}

export interface PublicScenario {
  slug: string;
  title: string;
  doc: ScenarioDoc;
  chapter: { id: string; number: number | null; name: string | null };
  courseName: string;
  siblings: PublicScenarioCard[]; // up to 2 sibling scenarios in the same chapter
}

/**
 * One public scenario by slug — but ONLY if it belongs to the public (foundations) family.
 * Returns null for a missing slug OR a non-public scenario; the route redirects those to the
 * interactive /study tool rather than exposing a gated teaser.
 */
export async function fetchPublicScenario(slug: string): Promise<PublicScenario | null> {
  const { data: row } = await (supabase.from("je_scenarios" as never) as any)
    .select("slug,title,doc,chapter_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!row || !row.chapter_id) return null;

  const { data: ch } = await supabase
    .from("chapters")
    .select("id,chapter_number,chapter_name,course_id")
    .eq("id", row.chapter_id)
    .maybeSingle();
  if (!ch) return null;

  // course_family isn't in the generated Supabase types yet (added by migration 0048), so
  // the select is typed as an error — cast through unknown like the rest of this file.
  const { data: coData } = await supabase
    .from("courses")
    .select("course_name,course_family")
    .eq("id", (ch as { course_id: string }).course_id)
    .maybeSingle();
  const co = coData as unknown as { course_name: string | null; course_family: string | null } | null;
  if (!co || co.course_family !== PUBLIC_COURSE_FAMILY) return null;

  // Related patterns: same-chapter siblings first, then fall back to the rest of the
  // foundations course so single-scenario chapters still surface 2 related links.
  const { data: sameCh } = await (supabase.from("je_scenarios" as never) as any)
    .select("slug,title")
    .eq("chapter_id", row.chapter_id)
    .neq("slug", slug)
    .limit(3);
  const siblings = ((sameCh ?? []) as { slug: string; title: string }[]).map((s) => ({ slug: s.slug, title: s.title }));
  if (siblings.length < 2) {
    const { data: courseChs } = await supabase
      .from("chapters")
      .select("id")
      .eq("course_id", (ch as { course_id: string }).course_id);
    const otherChIds = ((courseChs ?? []) as { id: string }[]).map((c) => c.id).filter((id) => id !== row.chapter_id);
    if (otherChIds.length) {
      const { data: courseSibs } = await (supabase.from("je_scenarios" as never) as any)
        .select("slug,title")
        .in("chapter_id", otherChIds)
        .neq("slug", slug)
        .limit(4);
      for (const s of (courseSibs ?? []) as { slug: string; title: string }[]) {
        if (siblings.length >= 2) break;
        if (!siblings.some((x) => x.slug === s.slug)) siblings.push({ slug: s.slug, title: s.title });
      }
    }
  }
  siblings.splice(2);

  return {
    slug: row.slug,
    title: row.title,
    doc: row.doc as ScenarioDoc,
    chapter: {
      id: (ch as { id: string }).id,
      number: (ch as { chapter_number: number | null }).chapter_number,
      name: (ch as { chapter_name: string | null }).chapter_name,
    },
    courseName: co.course_name ?? "Accounting Foundations",
    siblings,
  };
}
