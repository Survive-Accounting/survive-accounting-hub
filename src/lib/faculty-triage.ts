// Client-side helpers for the faculty triage workflow.
// All operations use the regular (anon) Supabase client; RLS allows
// anon CRUD on outreach_leads and campus_lead_suggestions in this project.
import { supabase } from "@/integrations/supabase/client";

export type TriageRow = {
  id: string;
  campus_id: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  source_url: string | null;
  is_phd: boolean | null;
  is_cpa: boolean | null;
  status: string | null;
  notes: string | null;
  created_at: string;
  title_tags: string[] | null;
  rmp_rating: number | null;
  rmp_num_ratings: number | null;
  rmp_difficulty: number | null;
  rmp_would_take_again: number | null;
  rmp_profile_url: string | null;
  /** outreach_leads.id if this person has already been imported as a lead for this campus. */
  imported_lead_id: string | null;
  /** How the email was sourced. 'verified' = scraped directly; 'directory' =
   *  found near the name on the dept directory; 'inferred' = synthesized
   *  from the dept's dominant email pattern (needs spot-check); 'news' =
   *  pulled from a blog/spotlight page (likely not faculty). */
  email_confidence: "verified" | "directory" | "inferred" | "news" | null;
  /** Number of paginated pages the scraper walked to reach this row, when
   *  the source directory was JS-paginated (URL doesn't change). null if the
   *  row came from a single-page scrape. */
  pagination_pages_walked: number | null;

};

export async function fetchTriageRows(campusId: string): Promise<TriageRow[]> {
  const { data, error } = await supabase
    .from("campus_lead_suggestions")
    .select("id,campus_id,first_name,last_name,title,email,source_url,is_phd,is_cpa,status,notes,created_at,title_tags,rmp_rating,rmp_num_ratings,rmp_difficulty,rmp_would_take_again,rmp_profile_url,raw_payload")
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const rawRows = (data ?? []) as Array<Omit<TriageRow, "imported_lead_id" | "email_confidence"> & { raw_payload: unknown }>;
  const rows: Omit<TriageRow, "imported_lead_id">[] = rawRows.map((r) => {
    const payload = (r.raw_payload ?? null) as { email_confidence?: string | null } | null;
    const conf = payload?.email_confidence;
    const email_confidence: TriageRow["email_confidence"] =
      conf === "inferred" || conf === "directory" || conf === "verified" || conf === "news" ? conf : null;
    return {
      id: r.id,
      campus_id: r.campus_id,
      first_name: r.first_name,
      last_name: r.last_name,
      title: r.title,
      email: r.email,
      source_url: r.source_url,
      is_phd: r.is_phd,
      is_cpa: r.is_cpa,
      status: r.status,
      notes: r.notes,
      created_at: r.created_at,
      title_tags: r.title_tags,
      rmp_rating: r.rmp_rating,
      rmp_num_ratings: r.rmp_num_ratings,
      rmp_difficulty: r.rmp_difficulty,
      rmp_would_take_again: r.rmp_would_take_again,
      rmp_profile_url: r.rmp_profile_url,
      email_confidence,
    };
  });

  // Mark rows that are already imported as outreach_leads (by email match
  // within this campus). Lets the triage UI pre-check those boxes and offer
  // an "un-import" toggle without re-importing duplicates.
  const emails = Array.from(new Set(
    rows.map((r) => (r.email ?? "").toLowerCase().trim()).filter(Boolean),
  ));
  const importedByEmail = new Map<string, string>();
  if (emails.length > 0) {
    const { data: leads } = await supabase
      .from("outreach_leads")
      .select("id,email")
      .eq("campus_id", campusId)
      .in("email", emails);
    for (const l of (leads ?? []) as Array<{ id: string; email: string | null }>) {
      const key = (l.email ?? "").toLowerCase();
      if (key && !importedByEmail.has(key)) importedByEmail.set(key, l.id);
    }
  }
  return rows.map((r) => ({
    ...r,
    imported_lead_id: importedByEmail.get((r.email ?? "").toLowerCase()) ?? null,
  }));
}

/** Delete the outreach_lead row for this suggestion's email (un-import).
 *  Cascades clean up campaign_leads / send_log / email_events. */
export async function unimportLead(leadId: string): Promise<void> {
  const { error } = await supabase.from("outreach_leads").delete().eq("id", leadId);
  if (error) throw error;
}




export async function setTriageFlag(id: string, patch: { is_phd?: boolean; is_cpa?: boolean }) {
  const { error } = await supabase.from("campus_lead_suggestions").update(patch).eq("id", id);
  if (error) throw error;
}

const TRIAGE_TO_DB_STATUS = {
  pending_triage: "pending",
  kept: "accepted",
  skipped: "rejected",
} as const;

export async function setTriageStatus(id: string, status: "pending_triage" | "kept" | "skipped") {
  const { error } = await supabase.from("campus_lead_suggestions").update({ status: TRIAGE_TO_DB_STATUS[status] }).eq("id", id);
  if (error) throw error;
}

function uniq(arr: string[]): string[] {
  // Case-insensitive dedupe; keep first occurrence's casing so "PhD" wins over
  // a later "phd". Prevents the same tag showing up twice on a lead.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function setTriageTagsBulk(
  ids: string[],
  mode: "add" | "remove" | "replace",
  tags: string[],
  currentById: Map<string, string[]>,
): Promise<void> {
  if (ids.length === 0) return;
  const clean = uniq(tags);
  for (const id of ids) {
    const current = currentById.get(id) ?? [];
    let next: string[];
    if (mode === "replace") next = clean;
    else if (mode === "add") next = uniq([...current, ...clean]);
    else next = current.filter((t) => !clean.includes(t));
    const { error } = await supabase
      .from("campus_lead_suggestions")
      .update({ title_tags: next })
      .eq("id", id);
    if (error) throw error;
  }
}

export async function fetchDistinctLeadTitleTags(): Promise<string[]> {
  // Pull a wide slice and unique client-side. text[] columns can't be DISTINCT'd
  // through PostgREST cleanly, so this is the simplest path.
  const { data, error } = await supabase
    .from("outreach_leads")
    .select("title_tags")
    .not("title_tags", "is", null)
    .limit(5000);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ title_tags: string[] | null }>) {
    for (const t of r.title_tags ?? []) if (t) set.add(t);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** Pull (title, title_tags) pairs from triage rows on *other* campuses so we
 *  can surface tags previously used on the same kinds of titles seen here.
 *  Returns a list of { tag, sourceTitle } pairs deduped by tag. */
export async function fetchTagsFromOtherCampuses(
  excludeCampusId: string,
): Promise<Array<{ tag: string; sourceTitle: string }>> {
  const { data, error } = await supabase
    .from("campus_lead_suggestions")
    .select("title,title_tags")
    .neq("campus_id", excludeCampusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null)
    .not("title_tags", "is", null)
    .limit(5000);
  if (error) throw error;
  const seen = new Set<string>();
  const out: Array<{ tag: string; sourceTitle: string }> = [];
  for (const r of (data ?? []) as Array<{ title: string | null; title_tags: string[] | null }>) {
    const title = (r.title ?? "").trim();
    if (!title) continue;
    for (const raw of r.title_tags ?? []) {
      const tag = (raw ?? "").trim();
      if (!tag) continue;
      const key = tag.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ tag, sourceTitle: title });
    }
  }
  return out;
}


/** Import every triage row that has at least one tag applied. Tagging IS the
 *  keep signal — there is no separate Keep/Skip step anymore. Untagged rows
 *  are left in triage so the user can revisit. */
export async function importTaggedLeads(campusId: string): Promise<{ inserted: number; skipped: number; mergedTags: number }> {
  const { data, error } = await supabase
    .from("campus_lead_suggestions")
    .select("id,first_name,last_name,email,title,is_phd,notes,title_tags")
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null)
    .not("title_tags", "is", null);
  if (error) throw error;
  const rows = ((data ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    title: string | null;
    is_phd: boolean | null;
    notes: string | null;
    title_tags: string[] | null;
  }>).filter((r) => (r.title_tags ?? []).length > 0);
  if (rows.length === 0) return { inserted: 0, skipped: 0, mergedTags: 0 };

  const withEmail = rows.filter((r) => r.email && r.email.includes("@"));
  if (withEmail.length === 0) return { inserted: 0, skipped: rows.length, mergedTags: 0 };

  // De-dupe against existing outreach_leads for this campus
  const emails = withEmail.map((r) => r.email!.toLowerCase());
  const { data: existing } = await supabase
    .from("outreach_leads")
    .select("id,email,title_tags")
    .eq("campus_id", campusId)
    .in("email", emails);
  const existingByEmail = new Map(
    ((existing ?? []) as Array<{ id: string; email: string | null; title_tags: string[] | null }>)
      .map((r) => [(r.email ?? "").toLowerCase(), r]),
  );

  const toInsert: Array<Record<string, unknown>> = [];
  let mergedTags = 0;
  for (const r of withEmail) {
    const key = r.email!.toLowerCase();
    const tags = uniq(r.title_tags ?? []);
    const match = existingByEmail.get(key);
    if (match) {
      const merged = uniq([...(match.title_tags ?? []), ...tags]);
      if (merged.length !== (match.title_tags ?? []).length) {
        const { error } = await supabase
          .from("outreach_leads")
          .update({ title_tags: merged })
          .eq("id", match.id);
        if (!error) mergedTags += 1;
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

  let inserted = 0;
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from("outreach_leads").insert(toInsert as never);
    if (insErr) throw insErr;
    inserted = toInsert.length;
  }

  // NOTE: we intentionally do NOT archive the suggestions after import. They
  // stay in triage so Lee can see which rows are already imported (checkbox
  // pre-filled via imported_lead_id) and toggle them off to un-import.

  return { inserted, skipped: withEmail.length - inserted, mergedTags };
}


/** @deprecated Kept/Skip flow removed — use importTaggedLeads. */
export const importKeptLeads = importTaggedLeads;

export async function archiveAllLeads(): Promise<{
  outreach_leads_archived: number;
  suggestions_archived: number;
  campaign_leads_removed: number;
}> {
  // 1) Archive every outreach_lead not already archived.
  //    Use head:true + count:'exact' so we get the true count — the default
  //    PostgREST SELECT caps at 1000 rows, which previously made the toast
  //    under-report when there were thousands of leads. The UPDATE itself
  //    is not row-limited, but the count was.
  const { count: leadCount } = await supabase
    .from("outreach_leads")
    .select("id", { count: "exact", head: true })
    .neq("status", "archived");
  if ((leadCount ?? 0) > 0) {
    const { error } = await supabase
      .from("outreach_leads")
      .update({
        status: "archived",
        sequence_stopped_at: new Date().toISOString(),
        sequence_stopped_reason: "manual_reset",
      })
      .neq("status", "archived");
    if (error) throw error;
  }

  // 2) Archive every campus_lead_suggestion still in flight
  const { count: sugCount } = await supabase
    .from("campus_lead_suggestions")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);
  if ((sugCount ?? 0) > 0) {
    const { error } = await supabase
      .from("campus_lead_suggestions")
      .update({
        archived_at: new Date().toISOString(),
        archived_reason: "manual_reset",
        archive_label: "reset",
      })
      .is("archived_at", null);
    if (error) throw error;
  }

  // 3) Remove campaign_leads tied to non-completed campaigns so the
  //    new approved leads start clean.
  const { data: liveCampaigns } = await supabase
    .from("outreach_campaigns")
    .select("id,status");
  const liveIds = (liveCampaigns ?? [])
    .filter((c: { status: string | null }) => c.status !== "completed")
    .map((c: { id: string }) => c.id);
  let removed = 0;
  if (liveIds.length > 0) {
    const { count: clCount } = await supabase
      .from("outreach_campaign_leads")
      .select("id", { count: "exact", head: true })
      .in("campaign_id", liveIds);
    removed = clCount ?? 0;
    if (removed > 0) {
      const { error } = await supabase
        .from("outreach_campaign_leads")
        .delete()
        .in("campaign_id", liveIds);
      if (error) throw error;
    }
  }

  return {
    outreach_leads_archived: leadCount ?? 0,
    suggestions_archived: sugCount ?? 0,
    campaign_leads_removed: removed,
  };
}
