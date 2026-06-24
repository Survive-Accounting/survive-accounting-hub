// JE Scenario Engine data layer — the thin DB boundary (parallel to ceq-api.ts).
// The /je route goes through THIS file; it must not import the Supabase client itself.
// je-engine.ts stays pure; this is where I/O lives.
import { supabase } from "@/integrations/supabase/client";
import { fetchChartOfAccounts } from "@/lib/ceq-api";
import type { AccountMeta, AccountType, ScenarioDoc } from "@/lib/je-engine";

// ---- Scenarios ----

export interface ScenarioRow {
  id: string;
  slug: string;
  title: string;
  doc: ScenarioDoc;
  chapter_id: string | null; // v2: links a scenario to an existing chapters row (migration 0025)
}

// chapter_id may not exist yet (before 0025 is applied). We try the chapter-aware select
// first and quietly fall back to the basic shape, so the tool keeps working on a DB that
// hasn't had 0025 run — every scenario simply shows up "unassigned" until then.
const MISSING_COLUMN = Symbol("missing-column");

function isMissingColumn(error: any): boolean {
  return (
    error?.code === "42703" || // undefined_column
    /column .*chapter_id.* does not exist/i.test(error?.message ?? "")
  );
}

/** List all scenarios (lightweight — full doc included; the prototype set is small). */
export async function fetchScenarios(): Promise<ScenarioRow[]> {
  let res = await runScenarioSelect("id,slug,title,doc,chapter_id", (q) => q.order("title"));
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
}

export interface BrowserChapter {
  id: string; // "__unassigned__" for scenarios with no chapter
  chapter_number: number | null;
  chapter_name: string | null;
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

/**
 * One call that returns the whole browse tree AND the flat scenario list. Empty sibling
 * chapters (a chapter in a course that has scenarios, but none of its own yet) are included
 * so Lee can see where content still needs authoring. Scenarios with no chapter land under a
 * synthetic "Unassigned" course so they stay reachable (also the pre-0025 state of every row).
 */
export async function fetchJeBrowserTree(): Promise<JeBrowserTree> {
  const scenarios = await fetchScenarios();
  const flat: BrowserScenario[] = scenarios.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    doc: s.doc,
    chapter_id: s.chapter_id,
  }));

  const linkedChapterIds = [...new Set(flat.map((s) => s.chapter_id).filter((x): x is string => !!x))];

  // No chapter links yet → single Unassigned group with everything in it.
  if (linkedChapterIds.length === 0) {
    return { courses: [unassignedCourse(flat)], flat };
  }

  // 1) The linked chapters → discover their courses.
  const { data: linkedChapters, error: e1 } = await supabase
    .from("chapters")
    .select("id,course_id")
    .in("id", linkedChapterIds);
  if (e1) throw e1;
  const courseIds = [
    ...new Set(((linkedChapters ?? []) as any[]).map((c) => c.course_id).filter((x): x is string => !!x)),
  ];

  // 2) ALL chapters for those courses (includes empty siblings), ordered.
  const { data: allChapters, error: e2 } = courseIds.length
    ? await supabase
        .from("chapters")
        .select("id,chapter_number,chapter_name,course_id")
        .in("course_id", courseIds)
        .order("chapter_number", { ascending: true })
    : { data: [] as any[], error: null };
  if (e2) throw e2;

  // 3) The courses themselves.
  const { data: courseRows, error: e3 } = courseIds.length
    ? await supabase.from("courses").select("id,code,course_name").in("id", courseIds)
    : { data: [] as any[], error: null };
  if (e3) throw e3;

  // Assemble: course → its chapters → scenarios that point at each chapter.
  const scenariosByChapter = new Map<string, BrowserScenario[]>();
  for (const s of flat) {
    if (!s.chapter_id) continue;
    const list = scenariosByChapter.get(s.chapter_id) ?? [];
    list.push(s);
    scenariosByChapter.set(s.chapter_id, list);
  }

  const chaptersByCourse = new Map<string, BrowserChapter[]>();
  for (const c of (allChapters ?? []) as any[]) {
    const list = chaptersByCourse.get(c.course_id) ?? [];
    list.push({
      id: c.id,
      chapter_number: c.chapter_number ?? null,
      chapter_name: c.chapter_name ?? null,
      scenarios: scenariosByChapter.get(c.id) ?? [],
    });
    chaptersByCourse.set(c.course_id, list);
  }

  const courses: BrowserCourse[] = ((courseRows ?? []) as any[])
    .map((co) => ({
      id: co.id,
      code: co.code ?? null,
      course_name: co.course_name ?? null,
      chapters: chaptersByCourse.get(co.id) ?? [],
    }))
    .sort((a, b) => (a.code ?? a.course_name ?? "").localeCompare(b.code ?? b.course_name ?? ""));

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
