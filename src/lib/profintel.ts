// ProfIntel — data layer for the careful, one-lead-at-a-time professor outreach
// flow. Anon Supabase client (AdminGate'd UI), matching the outreach pattern.
// Nothing sends automatically: drafts are saved/scheduled for review only.
import { supabase } from "@/integrations/supabase/client";

export interface ProfIntelTemplate {
  subject: string;
  body: string;
}

export interface ProfIntelLead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  is_phd: boolean;
  /** Faculty/department page the lead was scraped from (for grabbing a missing email). */
  source_url: string | null;
  rmp_profile_url: string | null;
  rmp_rating: number | null;
  rmp_num_ratings: number | null;
  rmp_course_match_json: Record<string, { code: string; count: number }> | null;
  mobility_status?: string | null;
}

export interface ProfIntelSend {
  id: string;
  campus_id: string | null;
  lead_id: string | null;
  to_name: string | null;
  to_email: string | null;
  school: string | null;
  course_matches: string | null;
  subject: string | null;
  body: string | null;
  ready: boolean;
  scheduled_at: string | null;
  status: string;
  created_at: string;
}

/** Comma-joined matched RMP course codes for a lead, e.g. "ACCT 2101, ACCT 2102". */
export function courseMatchesText(j: ProfIntelLead["rmp_course_match_json"]): string {
  if (!j) return "";
  return Object.values(j).map((m) => m.code).filter(Boolean).join(", ");
}

/** Dominant course prefix from a lead's matched RMP codes, e.g. "ACCT 2101" → "ACCT".
 * Mirrors the send-email function's coursePrefix() so subjects match live sends. */
export function coursePrefix(j: ProfIntelLead["rmp_course_match_json"]): string {
  if (!j) return "";
  const counts = new Map<string, number>();
  for (const m of Object.values(j)) {
    const mm = (m.code ?? "").trim().match(/^([A-Za-z&-]+)/);
    if (mm) {
      const k = mm[1].toUpperCase();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  let best = "", n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

/** How to address the lead in a greeting, matching the old email template's rule:
 * PhDs are "Dr. Lastname"; everyone else gets their first name (no reliable gender
 * data, so first name avoids any chance of misgendering). */
export function recipientName(lead: Pick<ProfIntelLead, "first_name" | "last_name" | "is_phd">): string {
  const first = (lead.first_name ?? "").trim();
  const last = (lead.last_name ?? "").trim();
  if (lead.is_phd && last) return `Dr. ${last}`;
  return first || "there";
}

/** Fill the template tokens for one lead. */
export function renderTemplate(tpl: ProfIntelTemplate, lead: ProfIntelLead, school: string): { subject: string; body: string } {
  const first = (lead.first_name ?? "").trim();
  const last = (lead.last_name ?? "").trim();
  const tokens: Record<string, string> = {
    first_name: first || "there",
    last_name: last,
    full_name: `${first} ${last}`.trim(),
    recipient_name: recipientName(lead),
    school,
    course: courseMatchesText(lead.rmp_course_match_json),
    course_prefix: coursePrefix(lead.rmp_course_match_json),
    rmp_rating: lead.rmp_rating != null ? lead.rmp_rating.toFixed(1) : "",
  };
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? "");
  return { subject: sub(tpl.subject), body: sub(tpl.body) };
}

/** The base template Lee wants new drafts seeded from — matches his hand-written
 * outreach email. Subject is just the campus course prefix; the greeting uses the
 * Dr./Mr./Ms. rule. The "Load default" button in the editor writes this to the DB. */
export const DEFAULT_PROFINTEL_TEMPLATE: ProfIntelTemplate = {
  subject: "If any {course_prefix} students need a tutor this July",
  body: `Hi {recipient_name},

I'm Lee Ingram — an Ole Miss alum who tutors Intro and Intermediate Accounting full-time. I'd love to be a resource for any of your {course_prefix} students who want extra help this July.

They can text me anytime at (662) 565-8818.

Thanks,
Lee Ingram
surviveaccounting.com

—

A bit more, if you're curious before sharing ↓

• I've tutored since 2015 and genuinely love it — I treat every student with a lot of care.
• I supplement your lectures, not replace them; my focus is simply building exam confidence and enjoyment of the material.
• Happy to share reviews from past students anytime.`,
};

export async function getTemplate(): Promise<ProfIntelTemplate> {
  const { data, error } = await (supabase.from("profintel_template" as never) as any)
    .select("subject, body").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return { subject: data?.subject ?? "", body: data?.body ?? "" };
}

export async function saveTemplate(t: ProfIntelTemplate): Promise<void> {
  const { error } = await (supabase.from("profintel_template" as never) as any)
    .update({ subject: t.subject, body: t.body, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** RMP-matched leads for a campus, most-rated first (the ProfIntel target set). */
export async function fetchCampusRmpLeads(campusId: string): Promise<ProfIntelLead[]> {
  const { data, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .select("id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count")
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as any[])
    .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
    .sort((a, b) => (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) || (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1));
  // Wider net: also include other research modes that have an RMP match.
  if (rows.length === 0) {
    const { data: any2 } = await (supabase.from("campus_lead_suggestions" as never) as any)
      .select("id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count")
      .eq("campus_id", campusId).is("archived_at", null);
    return ((any2 ?? []) as any[])
      .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
      .sort((a, b) => (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) || (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1));
  }
  return rows;
}

const LEAD_COLS =
  "id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count, mobility_status";

const byRmpDesc = (a: any, b: any) =>
  (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) || (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1);

/** Active faculty for a campus, split into the curated RMP-matched target set and
 * the full active roster. The UI shows `matched` when it exists (the original
 * behavior), and falls back to `all` for campuses we've only just scraped or
 * hand-entered (no RMP cross-reference yet). Moved/retired leads are excluded. */
export async function fetchProfintelLeads(campusId: string): Promise<{ matched: ProfIntelLead[]; all: ProfIntelLead[] }> {
  const { data, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .select(LEAD_COLS)
    .eq("campus_id", campusId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  const active = ((data ?? []) as any[]).filter((r) => (r.mobility_status ?? "active") === "active");
  const all = [...active].sort(byRmpDesc) as ProfIntelLead[];
  const matched = active.filter((r) => (r.rmp_course_match_count ?? 0) > 0).sort(byRmpDesc) as ProfIntelLead[];
  return { matched, all };
}

// --- Faculty mobility (retire / moved) -------------------------------------

async function insertMove(row: Record<string, unknown>): Promise<void> {
  const { error } = await (supabase.from("faculty_moves" as never) as any).insert(row);
  if (error) throw new Error(error.message);
}

function leadDisplayName(l: Pick<ProfIntelLead, "first_name" | "last_name">): string {
  return `${l.first_name ?? ""} ${l.last_name ?? ""}`.trim();
}

/** Mark a lead as retired (no longer teaching anywhere) and record the event. */
export async function retireLead(lead: ProfIntelLead, fromCampusId: string, note?: string): Promise<void> {
  await insertMove({
    kind: "retired",
    person_name: leadDisplayName(lead) || null,
    from_campus_id: fromCampusId,
    from_lead_id: lead.id,
    rmp_from_rating: lead.rmp_rating,
    rmp_from_num: lead.rmp_num_ratings,
    note: note ?? null,
  });
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .update({ mobility_status: "retired", mobility_note: note ?? null, mobility_updated_at: new Date().toISOString() })
    .eq("id", lead.id);
  if (error) throw new Error(error.message);
}

/** Mark a lead as moved to another campus and record the edge. The destination
 * lead is created lazily (see acceptIncomingMove) when that campus is next opened. */
export async function moveLead(lead: ProfIntelLead, fromCampusId: string, toCampusId: string, note?: string): Promise<void> {
  await insertMove({
    kind: "moved",
    person_name: leadDisplayName(lead) || null,
    from_campus_id: fromCampusId,
    from_lead_id: lead.id,
    to_campus_id: toCampusId,
    rmp_from_rating: lead.rmp_rating,
    rmp_from_num: lead.rmp_num_ratings,
    note: note ?? null,
  });
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .update({
      mobility_status: "moved",
      moved_to_campus_id: toCampusId,
      mobility_note: note ?? null,
      mobility_updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (error) throw new Error(error.message);
}

export interface IncomingMove {
  id: string;
  person_name: string | null;
  from_campus_id: string | null;
  rmp_from_rating: number | null;
  rmp_from_num: number | null;
}

/** Professors recorded as having moved TO this campus, not yet added as leads. */
export async function listIncomingMoves(campusId: string): Promise<IncomingMove[]> {
  const { data, error } = await (supabase.from("faculty_moves" as never) as any)
    .select("id, person_name, from_campus_id, rmp_from_rating, rmp_from_num")
    .eq("to_campus_id", campusId)
    .eq("kind", "moved")
    .is("to_lead_id", null);
  if (error) throw new Error(error.message);
  return (data ?? []) as IncomingMove[];
}

/** Create the destination lead for an incoming move and close the edge. */
export async function acceptIncomingMove(move: IncomingMove, campusId: string): Promise<void> {
  const parts = (move.person_name ?? "").trim().split(/\s+/);
  const first = parts[0] || null;
  const last = parts.slice(1).join(" ") || null;
  const { data: ins, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .insert({
      campus_id: campusId,
      first_name: first,
      last_name: last,
      research_mode: "faculty_scrape",
      status: "needs_review",
      mobility_status: "active",
      rmp_rating: move.rmp_from_rating ?? null,
      rmp_num_ratings: move.rmp_from_num ?? null,
      notes: "Added from a recorded faculty move.",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const { error: upErr } = await (supabase.from("faculty_moves" as never) as any)
    .update({ to_lead_id: ins.id }).eq("id", move.id);
  if (upErr) throw new Error(upErr.message);
}

// --- Manual lead entry (paste from a spreadsheet) ---------------------------

export interface ManualLeadInput {
  name: string;
  rmpRating: number | null;
  rmpNum: number | null;
  courseMatches: string;
  email: string | null;
}

/** Parse pasted rows: one professor per line, columns tab- or comma-separated in
 * the order Name, RMP rating, # ratings, RMP course matches, email. Course matches
 * may themselves be comma-separated, so we prefer TAB splitting and only fall back
 * to comma when there are no tabs. */
export function parseManualLeads(text: string): ManualLeadInput[] {
  const out: ManualLeadInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cols = line.includes("\t") ? line.split("\t") : line.split(",");
    const name = (cols[0] ?? "").trim();
    if (!name) continue;
    const num = (s: string | undefined) => {
      const n = parseFloat((s ?? "").replace(/[^\d.]/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    out.push({
      name,
      rmpRating: num(cols[1]),
      rmpNum: cols[2] != null && cols[2].trim() ? Math.round(num(cols[2]) ?? 0) || null : null,
      courseMatches: (cols[3] ?? "").trim(),
      email: (cols[4] ?? "").trim() || null,
    });
  }
  return out;
}

/** Insert hand-entered leads for a campus. Course matches become an RMP-match JSON
 * so they surface in the curated target list just like scraped+matched leads. */
export async function createManualLeads(campusId: string, rows: ManualLeadInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const toInsert = rows.map((r) => {
    const parts = r.name.trim().split(/\s+/);
    const first = parts[0] || null;
    const last = parts.slice(1).join(" ") || null;
    const codes = r.courseMatches.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const json: Record<string, { code: string; count: number }> = {};
    codes.forEach((c, i) => { json[`m${i}`] = { code: c, count: 1 }; });
    return {
      campus_id: campusId,
      first_name: first,
      last_name: last,
      email: r.email,
      research_mode: "faculty_scrape",
      status: "needs_review",
      mobility_status: "active",
      rmp_rating: r.rmpRating,
      rmp_num_ratings: r.rmpNum,
      rmp_course_match_json: codes.length ? json : null,
      rmp_course_match_count: codes.length,
      notes: "Hand-entered in ProfIntel.",
    };
  });
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any).insert(toInsert);
  if (error) throw new Error(error.message);
  return toInsert.length;
}

/** Create one draft per selected lead, pre-filled from the template. */
export async function createDrafts(input: {
  campusId: string;
  school: string;
  template: ProfIntelTemplate;
  leads: ProfIntelLead[];
}): Promise<number> {
  if (input.leads.length === 0) return 0;
  const rows = input.leads.map((lead) => {
    const { subject, body } = renderTemplate(input.template, lead, input.school);
    return {
      campus_id: input.campusId,
      lead_id: lead.id,
      to_name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || null,
      to_email: lead.email ?? null,
      school: input.school,
      course_matches: courseMatchesText(lead.rmp_course_match_json) || null,
      subject,
      body,
      ready: false,
      status: "draft",
    };
  });
  const { error } = await (supabase.from("profintel_sends" as never) as any).insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function listSends(opts?: { campusId?: string }): Promise<ProfIntelSend[]> {
  let q = (supabase.from("profintel_sends" as never) as any)
    .select("id, campus_id, lead_id, to_name, to_email, school, course_matches, subject, body, ready, scheduled_at, status, created_at")
    .order("created_at", { ascending: false });
  if (opts?.campusId) q = q.eq("campus_id", opts.campusId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ProfIntelSend[];
}

export async function updateSend(id: string, patch: Partial<Pick<ProfIntelSend, "to_name" | "to_email" | "subject" | "body" | "ready" | "scheduled_at" | "status">>): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSend(id: string): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Delete every ProfIntel draft for a campus — the "Reset / start from scratch" action. */
export async function clearDrafts(campusId: string): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .delete().eq("campus_id", campusId);
  if (error) throw new Error(error.message);
}

/** Persist an email a lead was missing (edited inline in the Step 2 leads table),
 * so it carries into any draft created afterward. */
export async function updateLeadEmail(leadId: string, email: string | null): Promise<void> {
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .update({ email }).eq("id", leadId);
  if (error) throw new Error(error.message);
}
