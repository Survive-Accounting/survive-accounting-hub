// Greek org registry — data layer. Registry only: NO outreach, NO scraping.
// Built on the existing normalized model: national catalog `greek_orgs` (name) ←
// per-campus `campus_greek_chapters`. Anon Supabase client (AdminGate'd UI),
// mirroring the reddit/parent-groups pattern.
import { supabase } from "@/integrations/supabase/client";

export interface GreekCampus {
  id: string;
  name: string;
  state: string | null;
  city: string | null;
  fsl_url: string | null;
}

/** A per-campus chapter row joined to the national org name (client-side). */
export interface GreekChapter {
  id: string;
  campus_id: string | null;
  greek_org_id: string | null;
  national_org: string; // resolved from the catalog
  chapter_designation: string | null;
  council: string | null;
  council_raw: string | null;
  letters: string | null;
  status: string;
  house_corp_name: string | null;
  house_corp_990_url: string | null;
  advisor_name: string | null;
  advisor_notes: string | null;
  member_count_estimate: number | null; // stored in chapter_size
  notes: string | null;
  created_at: string | null;
}

export const COUNCILS = ["ifc", "panhellenic", "nphc", "mgc", "other"] as const;
export const GREEK_STATUSES = [
  "identified",
  "researching",
  "pilot",
  "active",
  "declined",
  "dormant",
] as const;
export type GreekStatus = (typeof GREEK_STATUSES)[number];

export function nextGreekStatus(s: string): GreekStatus {
  const i = GREEK_STATUSES.indexOf(s as GreekStatus);
  return GREEK_STATUSES[(i + 1) % GREEK_STATUSES.length];
}

const COUNCIL_LABEL: Record<string, string> = {
  ifc: "IFC",
  panhellenic: "Panhellenic",
  nphc: "NPHC",
  mgc: "MGC",
  other: "Other",
};
export const councilLabel = (c: string | null) => (c ? (COUNCIL_LABEL[c] ?? c) : "—");

// --- Research link helpers (links only) ---------------------------------------
const STATE_NAME: Record<string, string> = {
  AL: "Alabama",
  AR: "Arkansas",
  FL: "Florida",
  GA: "Georgia",
  KY: "Kentucky",
  LA: "Louisiana",
  MS: "Mississippi",
  MO: "Missouri",
  OK: "Oklahoma",
  SC: "South Carolina",
  TN: "Tennessee",
  TX: "Texas",
};
export const stateName = (s: string | null) => (s ? (STATE_NAME[s] ?? s) : "");

/** ProPublica nonprofit search. With a chapter designation: "{org} {designation}";
 *  otherwise fall back to "{org} {campus city}". */
export function proPublicaUrl(
  nationalOrg: string,
  chapterDesignation: string | null,
  city: string | null,
): string {
  const q = chapterDesignation
    ? `${nationalOrg} ${chapterDesignation}`.trim()
    : `${nationalOrg} ${city ?? ""}`.trim();
  return `https://projects.propublica.org/nonprofits/search?q=${encodeURIComponent(q)}`;
}

export function linkedInAdvisorUrl(nationalOrg: string, campusName: string): string {
  const kw = `"chapter advisor" ${nationalOrg} ${campusName}`;
  return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}`;
}

// State Secretary-of-State business search. Direct entry where known (link-only —
// these sites don't take a simple GET query param); otherwise a Google fallback so
// the link always works. Fill in more direct URLs over time.
const SOS_DIRECT: Record<string, string> = {
  MS: "https://corp.sos.ms.gov/corp/portal/c/page/corpBusinessIdSearch",
};
export function sosSearchUrl(state: string | null): string {
  if (state && SOS_DIRECT[state]) return SOS_DIRECT[state];
  const q = `${stateName(state)} secretary of state business entity search`;
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// --- Data access --------------------------------------------------------------
export async function fetchGreekCampuses(): Promise<GreekCampus[]> {
  const { data, error } = await (supabase.from("campuses" as never) as any)
    .select("id, name, state, city, fsl_url")
    .eq("active_roster", "sec")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GreekCampus[];
}

export async function updateCampusFslUrl(id: string, fslUrl: string): Promise<void> {
  const { error } = await (supabase.from("campuses" as never) as any)
    .update({ fsl_url: fslUrl.trim() || null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export interface GreekOrgCatalog {
  id: string;
  name: string;
  ein: string | null;
  address: string | null;
  propublica_url: string | null;
}

/** National catalog with enrichment fields, for the picker + org-level rendering. */
export async function fetchGreekCatalog(): Promise<GreekOrgCatalog[]> {
  const { data, error } = await (supabase.from("greek_orgs" as never) as any)
    .select("id, name, ein, address, propublica_url")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GreekOrgCatalog[];
}

const CHAPTER_COLS =
  "id, campus_id, greek_org_id, chapter_designation, council, council_raw, letters, status, house_corp_name, house_corp_990_url, advisor_name, advisor_notes, chapter_size, notes, created_at";

/** All chapters, with the national org name resolved from the catalog client-side. */
export async function listGreekChapters(): Promise<GreekChapter[]> {
  const [{ data, error }, catalog] = await Promise.all([
    (supabase.from("campus_greek_chapters" as never) as any)
      .select(CHAPTER_COLS)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    fetchGreekCatalog(),
  ]);
  if (error) throw new Error(error.message);
  const nameById = new Map(catalog.map((o) => [o.id, o.name]));
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    campus_id: r.campus_id,
    greek_org_id: r.greek_org_id,
    national_org: nameById.get(r.greek_org_id) ?? "(unknown org)",
    chapter_designation: r.chapter_designation,
    council: r.council,
    council_raw: r.council_raw,
    letters: r.letters,
    status: r.status ?? "identified",
    house_corp_name: r.house_corp_name,
    house_corp_990_url: r.house_corp_990_url,
    advisor_name: r.advisor_name,
    advisor_notes: r.advisor_notes,
    member_count_estimate: r.chapter_size,
    notes: r.notes,
    created_at: r.created_at,
  }));
}

/** Find a catalog org by name (case-insensitive), creating it if absent. */
export async function resolveOrCreateOrg(name: string): Promise<string> {
  const trimmed = name.trim();
  const { data: found } = await (supabase.from("greek_orgs" as never) as any)
    .select("id")
    .ilike("name", trimmed)
    .maybeSingle();
  if (found?.id) return found.id as string;
  const { data: created, error } = await (supabase.from("greek_orgs" as never) as any)
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id as string;
}

export async function addGreekChapter(input: {
  campus_id: string;
  national_org: string;
  chapter_designation?: string | null;
  council?: string | null;
  letters?: string | null;
  status?: string;
}): Promise<void> {
  const greek_org_id = await resolveOrCreateOrg(input.national_org);
  const { error } = await (supabase.from("campus_greek_chapters" as never) as any).insert({
    campus_id: input.campus_id,
    greek_org_id,
    chapter_designation: input.chapter_designation?.trim() || null,
    council: input.council || null,
    letters: input.letters?.trim() || null,
    status: input.status || "identified",
  });
  if (error) throw new Error(error.message);
}

export async function updateGreekChapter(
  id: string,
  patch: {
    status?: string;
    council?: string | null;
    letters?: string | null;
    chapter_designation?: string | null;
    house_corp_name?: string | null;
    house_corp_990_url?: string | null;
    advisor_name?: string | null;
    advisor_notes?: string | null;
    member_count_estimate?: number | null;
    notes?: string | null;
  },
): Promise<void> {
  const { member_count_estimate, ...rest } = patch;
  const row: Record<string, unknown> = { ...rest };
  if (member_count_estimate !== undefined) row.chapter_size = member_count_estimate;
  const { error } = await (supabase.from("campus_greek_chapters" as never) as any)
    .update(row)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteGreekChapter(id: string): Promise<void> {
  const { error } = await (supabase.from("campus_greek_chapters" as never) as any)
    .delete()
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// --- CSV import (headers: campus_slug, national_org, chapter_designation, council, letters) ---
/** Minimal CSV parser (handles quoted fields + commas within quotes). */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

export interface CsvImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

/** Import chapters from CSV rows. Resolves campus by slug and org by name (creating
 *  catalog entries as needed). Rows with an unknown campus_slug are reported. */
export async function importGreekChaptersCsv(text: string): Promise<CsvImportResult> {
  const rows = parseCsv(text);
  const { data: campuses } = await (supabase.from("campuses" as never) as any).select("id, slug");
  const bySlug = new Map(((campuses ?? []) as any[]).map((c) => [String(c.slug), c.id]));
  const result: CsvImportResult = { inserted: 0, skipped: 0, errors: [] };
  for (const [i, r] of rows.entries()) {
    const slug = r["campus_slug"];
    const org = r["national_org"];
    if (!slug || !org) {
      result.skipped++;
      result.errors.push(`Row ${i + 2}: missing campus_slug or national_org`);
      continue;
    }
    const campus_id = bySlug.get(slug);
    if (!campus_id) {
      result.skipped++;
      result.errors.push(`Row ${i + 2}: unknown campus_slug "${slug}"`);
      continue;
    }
    try {
      await addGreekChapter({
        campus_id: campus_id as string,
        national_org: org,
        chapter_designation: r["chapter_designation"] || null,
        council: r["council"] || null,
        letters: r["letters"] || null,
      });
      result.inserted++;
    } catch (e) {
      result.skipped++;
      result.errors.push(`Row ${i + 2}: ${e instanceof Error ? e.message : "insert failed"}`);
    }
  }
  return result;
}

// --- ProPublica filings (per national org) ------------------------------------
export interface GreekFiling {
  id: string;
  org_id: string;
  tax_year: number | null;
  revenue: number | null;
  expenses: number | null;
  assets_eoy: number | null;
  liabilities_eoy: number | null;
  pdf_url: string | null;
  object_id: string | null;
  source: string;
  // Itemized "from the PDF" fields (manual entry v1) — all nullable.
  contributions: number | null;
  program_revenue_detail: Record<string, number> | null;
  salaries: number | null;
  employees_count: number | null;
  food_expense: number | null;
  repairs_expense: number | null;
  insurance_expense: number | null;
  interest_expense: number | null;
  grants_paid: number | null;
  land_buildings_gross: number | null;
  accum_depreciation: number | null;
  mortgages_payable: number | null;
  fundraiser_firm: string | null;
  fundraiser_fee: number | null;
  preparer_firm: string | null;
}

/** Editable itemized fields on a filing (the "from the PDF" drawer). */
export const FILING_ITEM_FIELDS = [
  "contributions",
  "salaries",
  "employees_count",
  "grants_paid",
  "food_expense",
  "repairs_expense",
  "insurance_expense",
  "interest_expense",
  "land_buildings_gross",
  "accum_depreciation",
  "mortgages_payable",
  "fundraiser_fee",
] as const;

export async function updateGreekFiling(id: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.from("greek_org_filings" as never) as any)
    .update(patch)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listGreekFilings(orgId: string): Promise<GreekFiling[]> {
  const { data, error } = await (supabase.from("greek_org_filings" as never) as any)
    .select("*")
    .eq("org_id", orgId)
    .order("tax_year", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GreekFiling[];
}

// --- People / tenure (THE LEADS) ----------------------------------------------
export interface GreekPerson {
  id: string;
  org_id: string;
  person_name: string;
  titles: string[] | null;
  years: number[] | null;
  first_year: number | null;
  last_year: number | null;
  years_count: number;
  is_current: boolean;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  source: string;
}

export async function listGreekPeople(): Promise<GreekPerson[]> {
  const { data, error } = await (supabase.from("greek_org_people" as never) as any)
    .select("*")
    .order("years_count", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as GreekPerson[];
}

export async function updateGreekPerson(
  id: string,
  patch: Partial<Pick<GreekPerson, "email" | "phone" | "linkedin_url" | "notes">>,
): Promise<void> {
  const { error } = await (supabase.from("greek_org_people" as never) as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Accumulate parsed officers into greek_org_people for a given tax year. Upserts
 *  by (org_id, person_name): unions titles + the year-set, recomputes first/last/
 *  count, and flags is_current when the person appears in the org's latest filing
 *  year. Idempotent — re-pasting the same year doesn't inflate years_count. */
export async function accumulateOfficers(
  orgId: string,
  officers: { name: string; title: string }[],
  taxYear: number,
): Promise<{ inserted: number; updated: number }> {
  // Latest filing year for "is_current".
  const { data: fy } = await (supabase.from("greek_org_filings" as never) as any)
    .select("tax_year")
    .eq("org_id", orgId)
    .order("tax_year", { ascending: false })
    .limit(1);
  const latestYear = (fy?.[0]?.tax_year as number | undefined) ?? taxYear;

  // Collapse duplicate names within this paste, unioning their titles.
  const byName = new Map<string, Set<string>>();
  for (const o of officers) {
    const n = o.name.trim();
    if (!n) continue;
    (byName.get(n) ?? byName.set(n, new Set()).get(n)!).add(o.title.trim());
  }

  let inserted = 0;
  let updated = 0;
  for (const [name, titleSet] of byName) {
    const { data: existing } = await (supabase.from("greek_org_people" as never) as any)
      .select("id, titles, years")
      .eq("org_id", orgId)
      .eq("person_name", name)
      .maybeSingle();

    const titles = [...new Set([...(existing?.titles ?? []), ...titleSet])];
    const years = [...new Set([...(existing?.years ?? []), taxYear])].sort((a, b) => a - b);
    const row = {
      org_id: orgId,
      person_name: name,
      titles,
      years,
      first_year: years[0],
      last_year: years[years.length - 1],
      years_count: years.length,
      is_current: years[years.length - 1] >= latestYear,
      source: "propublica_officers",
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await (supabase.from("greek_org_people" as never) as any)
        .update(row)
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      updated++;
    } else {
      const { error } = await (supabase.from("greek_org_people" as never) as any).insert(row);
      if (error) throw new Error(error.message);
      inserted++;
    }
  }
  return { inserted, updated };
}

// --- Cross-org filings (for signal computation across the whole registry) ------
const SIGNAL_FILING_COLS =
  "id, org_id, tax_year, revenue, contributions, grants_paid, accum_depreciation, land_buildings_gross, fundraiser_firm, employees_count";

export async function listAllFilings(): Promise<
  Pick<
    GreekFiling,
    | "id"
    | "org_id"
    | "tax_year"
    | "revenue"
    | "contributions"
    | "grants_paid"
    | "accum_depreciation"
    | "land_buildings_gross"
    | "fundraiser_firm"
    | "employees_count"
  >[]
> {
  const { data, error } = await (supabase.from("greek_org_filings" as never) as any).select(
    SIGNAL_FILING_COLS,
  );
  if (error) throw new Error(error.message);
  return (data ?? []) as any;
}

// --- Campus context -----------------------------------------------------------
export interface CampusContext {
  campus_id: string;
  enrollment: number | null;
  undergrad_enrollment: number | null;
  business_enrollment: number | null;
  tuition_in_state: number | null;
  tuition_out_state: number | null;
  greek_population_pct: number | null;
  rush_fall_start: string | null;
  rush_spring_start: string | null;
  semester_start: string | null;
  semester_end: string | null;
  midterm_window: string | null;
  finals_window: string | null;
  football_schedule_url: string | null;
  fsl_grade_report_url: string | null;
  notes: string | null;
}

export async function fetchCampusContext(campusId: string): Promise<CampusContext | null> {
  const { data, error } = await (supabase.from("campus_context" as never) as any)
    .select("*")
    .eq("campus_id", campusId)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as CampusContext | null;
}

export async function upsertCampusContext(
  campusId: string,
  patch: Partial<Omit<CampusContext, "campus_id">>,
): Promise<void> {
  const { error } = await (supabase.from("campus_context" as never) as any).upsert(
    { campus_id: campusId, ...patch, updated_at: new Date().toISOString() },
    { onConflict: "campus_id" },
  );
  if (error) throw new Error(error.message);
}

// --- Chapter GPA (per org, per term) ------------------------------------------
export interface ChapterGpa {
  id: string;
  greek_org_id: string;
  term: string | null;
  gpa: number | null;
  campus_rank: number | null;
  member_count: number | null;
  source_url: string | null;
}

export async function listChapterGpa(): Promise<ChapterGpa[]> {
  const { data, error } = await (supabase.from("chapter_gpa" as never) as any).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as ChapterGpa[];
}

const normOrg = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const orgTokens = (s: string) => new Set(normOrg(s).split(" ").filter(Boolean));
function jaccard(a: string, b: string): number {
  const A = orgTokens(a);
  const B = orgTokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / new Set([...A, ...B]).size;
}

/** Match an org name to the catalog: normalized-exact first, then best token
 *  overlap (Jaccard ≥ 0.6). Returns the org id or null. */
export function matchOrgName(name: string, catalog: { id: string; name: string }[]): string | null {
  const n = normOrg(name);
  const exact = catalog.find((o) => normOrg(o.name) === n);
  if (exact) return exact.id;
  let best: { id: string; score: number } | null = null;
  for (const o of catalog) {
    const score = jaccard(name, o.name);
    if (score >= 0.6 && (!best || score > best.score)) best = { id: o.id, score };
  }
  return best?.id ?? null;
}

export interface GpaImportResult {
  imported: number;
  unmatched: { org: string; gpa: number | null }[];
}

/** Bulk GPA import from a pasted TSV (org<TAB>gpa<TAB>rank<TAB>members). Fuzzy-
 *  matches org names to the catalog; unmatched rows are returned for manual
 *  pairing. Upserts by (greek_org_id, term). */
export async function importChapterGpaTsv(
  tsv: string,
  term: string,
  sourceUrl: string | null,
): Promise<GpaImportResult> {
  const catalog = await fetchGreekCatalog();
  const rows = tsv
    .split(/\r?\n/)
    .map((l) => l.split("\t").map((c) => c.trim()))
    .filter((r) => r[0]);
  const result: GpaImportResult = { imported: 0, unmatched: [] };
  for (const r of rows) {
    const org = r[0];
    const gpa = r[1] != null && r[1] !== "" ? Number(r[1]) : null;
    if (gpa == null || Number.isNaN(gpa)) continue; // header or bad row
    const orgId = matchOrgName(org, catalog);
    if (!orgId) {
      result.unmatched.push({ org, gpa });
      continue;
    }
    const rank = r[2] ? Number(r[2].replace(/[^\d]/g, "")) || null : null;
    const members = r[3] ? Number(r[3].replace(/[^\d]/g, "")) || null : null;
    const { error } = await (supabase.from("chapter_gpa" as never) as any).upsert(
      {
        greek_org_id: orgId,
        term,
        gpa,
        campus_rank: rank,
        member_count: members,
        source_url: sourceUrl,
      },
      { onConflict: "greek_org_id,term" },
    );
    if (error) throw new Error(error.message);
    result.imported++;
  }
  return result;
}
