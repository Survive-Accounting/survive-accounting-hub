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

/** ProPublica nonprofit search. With a chapter designation: "{org} {designation}
 *  {state name}"; otherwise fall back to "{org} house {city}". */
export function proPublicaUrl(
  nationalOrg: string,
  chapterDesignation: string | null,
  state: string | null,
  city: string | null,
): string {
  const q = chapterDesignation
    ? `${nationalOrg} ${chapterDesignation} ${stateName(state)}`.trim()
    : `${nationalOrg} house ${city ?? ""}`.trim();
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

/** National catalog (id → name), for the quick-add picker and CSV resolution. */
export async function fetchGreekCatalog(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await (supabase.from("greek_orgs" as never) as any)
    .select("id, name")
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string }[];
}

const CHAPTER_COLS =
  "id, campus_id, greek_org_id, chapter_designation, council, letters, status, house_corp_name, house_corp_990_url, advisor_name, advisor_notes, chapter_size, notes, created_at";

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
