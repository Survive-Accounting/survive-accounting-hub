// Server-only helpers for the overnight faculty auto-import worker.
// Loads supabaseAdmin and the scrape server fn. NEVER import this from a
// client-reachable module at top level — only from server routes / inside
// server-fn handlers via `await import()`.
import { scrapeCampusFaculty, autoDiscoverCampusFaculty } from "@/lib/faculty-scrape.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


// Auto-tag regex: matches any title containing one of these whole words.
// Mirrors what Lee was doing by hand in Step #3.
const TITLE_MATCH_RE =
  /\b(instructor|adjunct|associate|assistant|lecturer|teaching)\b/i;
const AUTO_TAG = "Intro Target";

export type CampusRunResult = {
  scraped: number;
  tagged: number;
  imported: number;
  skipped: number;
  error: string | null;
};

function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const t = (raw ?? "").trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Run scrape → auto-tag → import for a single campus. Never throws; failures
 *  are returned as `{ error }` so the batch loop can keep going. */
export async function processOneCampus(campusId: string): Promise<CampusRunResult> {
  const result: CampusRunResult = { scraped: 0, tagged: 0, imported: 0, skipped: 0, error: null };

  // 1. Read faculty URLs off the campus.
  const { data: campus, error: campusErr } = await supabaseAdmin
    .from("campuses")
    .select("faculty_page_url")
    .eq("id", campusId)
    .maybeSingle();
  if (campusErr) { result.error = `campus read: ${campusErr.message}`; return result; }
  if (!campus) { result.error = "campus not found"; return result; }
  const urls = ((campus.faculty_page_url as string | null) ?? "")
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 10);
  if (urls.length === 0) { result.error = "no faculty_page_url"; return result; }

  // 2. Scrape (this populates campus_lead_suggestions).
  try {
    const scrape = await scrapeCampusFaculty({ data: { campusId, urls } }) as {
      perPage?: Array<{ inserted?: number }>;
    };
    result.scraped = (scrape.perPage ?? []).reduce((n, p) => n + (p.inserted ?? 0), 0);
  } catch (e) {
    result.error = `scrape: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }

  // 3. Pull every fresh suggestion for this campus and auto-tag matches.
  const { data: sugs, error: sugErr } = await supabaseAdmin
    .from("campus_lead_suggestions")
    .select("id,title,title_tags")
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null);
  if (sugErr) { result.error = `read suggestions: ${sugErr.message}`; return result; }

  const matches = (sugs ?? []).filter((r: { title: string | null }) =>
    TITLE_MATCH_RE.test((r.title ?? "")),
  ) as Array<{ id: string; title: string | null; title_tags: string[] | null }>;
  for (const r of matches) {
    const next = uniq([...(r.title_tags ?? []), AUTO_TAG]);
    await supabaseAdmin
      .from("campus_lead_suggestions")
      .update({ title_tags: next, status: "accepted" })
      .eq("id", r.id);
  }
  result.tagged = matches.length;
  if (matches.length === 0) return result;

  // 4. Import: insert any tagged row (with email) into outreach_leads, dedupe
  //    by email, archive the suggestion. Mirrors importTaggedLeads but uses
  //    the service-role client.
  const { data: tagged, error: tagErr } = await supabaseAdmin
    .from("campus_lead_suggestions")
    .select("id,first_name,last_name,email,title,is_phd,notes,title_tags")
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null)
    .not("title_tags", "is", null);
  if (tagErr) { result.error = `read tagged: ${tagErr.message}`; return result; }
  const rows = ((tagged ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    title: string | null;
    is_phd: boolean | null;
    notes: string | null;
    title_tags: string[] | null;
  }>).filter((r) => (r.title_tags ?? []).length > 0);

  const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
  if (withEmail.length === 0) {
    result.skipped = rows.length;
    return result;
  }

  const emails = withEmail.map((r) => r.email!.toLowerCase());
  const { data: existing } = await supabaseAdmin
    .from("outreach_leads")
    .select("id,email,title_tags")
    .eq("campus_id", campusId)
    .in("email", emails);
  const existingByEmail = new Map(
    ((existing ?? []) as Array<{ id: string; email: string | null; title_tags: string[] | null }>)
      .map((r) => [(r.email ?? "").toLowerCase(), r]),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  for (const r of withEmail) {
    const key = r.email!.toLowerCase();
    const tags = uniq(r.title_tags ?? []);
    const match = existingByEmail.get(key);
    if (match) {
      const merged = uniq([...(match.title_tags ?? []), ...tags]);
      if (merged.length !== (match.title_tags ?? []).length) {
        await supabaseAdmin
          .from("outreach_leads")
          .update({ title_tags: merged })
          .eq("id", match.id);
      }
      continue;
    }
    toInsert.push({
      campus_id: campusId,
      first_name: r.first_name,
      last_name: r.last_name,
      email: key,
      affiliation: r.title,
      is_phd: r.is_phd ?? false,
      status: "new",
      source: "faculty_scrape",
      notes: r.notes,
      title_tags: tags,
    });
  }

  if (toInsert.length > 0) {
    const { error: insErr } = await supabaseAdmin
      .from("outreach_leads")
      .insert(toInsert as never);
    if (insErr) { result.error = `insert leads: ${insErr.message}`; return result; }
    result.imported = toInsert.length;
  }
  result.skipped = withEmail.length - result.imported;

  // Archive every tagged row so triage clears out.
  const ids = rows.map((r) => r.id);
  if (ids.length > 0) {
    await supabaseAdmin
      .from("campus_lead_suggestions")
      .update({
        archived_at: new Date().toISOString(),
        archived_reason: "imported",
        archive_label: "faculty_overnight_auto",
      })
      .in("id", ids);
  }

  return result;
}
