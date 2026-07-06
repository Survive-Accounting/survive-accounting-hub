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
  profintel_score?: number | null;
  sent_at?: string | null;
  opened_at?: string | null;
  replied_at?: string | null;
  open_count?: number | null;
  variant?: string | null;
  clicked_at?: string | null;
  click_count?: number | null;
  last_clicked_url?: string | null;
}

/** Comma-joined matched RMP course codes for a lead, e.g. "ACCT 2101, ACCT 2102". */
export function courseMatchesText(j: ProfIntelLead["rmp_course_match_json"]): string {
  if (!j) return "";
  return Object.values(j)
    .map((m) => m.code)
    .filter(Boolean)
    .join(", ");
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
  let best = "",
    n = 0;
  for (const [k, v] of counts)
    if (v > n) {
      best = k;
      n = v;
    }
  return best;
}

/** How to address the lead in a greeting, matching the old email template's rule:
 * PhDs are "Dr. Lastname"; everyone else gets their first name (no reliable gender
 * data, so first name avoids any chance of misgendering). */
export function recipientName(
  lead: Pick<ProfIntelLead, "first_name" | "last_name" | "is_phd">,
): string {
  const first = (lead.first_name ?? "").trim();
  const last = (lead.last_name ?? "").trim();
  if (lead.is_phd && last) return `Dr. ${last}`;
  return first || "there";
}

/** Fill the template tokens for one lead. */
export function renderTemplate(
  tpl: ProfIntelTemplate,
  lead: ProfIntelLead,
  school: string,
): { subject: string; body: string } {
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
https://surviveaccounting.com

—

A bit more, if you're curious before sharing ↓

• I've tutored since 2015 and genuinely love it — I treat every student with a lot of care.
• I supplement your lectures, not replace them; my focus is simply building exam confidence and enjoyment of the material.
• Happy to share reviews from past students anytime.`,
};

export async function getTemplate(): Promise<ProfIntelTemplate> {
  const { data, error } = await (supabase.from("profintel_template" as never) as any)
    .select("subject, body")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { subject: data?.subject ?? "", body: data?.body ?? "" };
}

export async function saveTemplate(t: ProfIntelTemplate): Promise<void> {
  const { error } = await (supabase.from("profintel_template" as never) as any)
    .update({ subject: t.subject, body: t.body, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** A/B config: variant A is the base subject/body; variant B is optional. When
 *  abEnabled, createDrafts splits sends ~50/50 between A and B. */
export interface ProfIntelTemplateConfig {
  a: ProfIntelTemplate;
  b: ProfIntelTemplate;
  abEnabled: boolean;
}

/** Load both variants + the A/B flag. Falls back gracefully if 0050 isn't applied
 *  (returns A only, abEnabled false). */
export async function getTemplateConfig(): Promise<ProfIntelTemplateConfig> {
  const base = { a: { subject: "", body: "" }, b: { subject: "", body: "" }, abEnabled: false };
  const ext = await (supabase.from("profintel_template" as never) as any)
    .select("subject, body, subject_b, body_b, ab_enabled")
    .eq("id", 1)
    .maybeSingle();
  if (ext.error) {
    const a = await getTemplate();
    return { ...base, a };
  }
  const d = ext.data ?? {};
  return {
    a: { subject: d.subject ?? "", body: d.body ?? "" },
    b: { subject: d.subject_b ?? "", body: d.body_b ?? "" },
    abEnabled: !!d.ab_enabled,
  };
}

export async function saveTemplateConfig(cfg: ProfIntelTemplateConfig): Promise<void> {
  const { error } = await (supabase.from("profintel_template" as never) as any)
    .update({
      subject: cfg.a.subject,
      body: cfg.a.body,
      subject_b: cfg.b.subject,
      body_b: cfg.b.body,
      ab_enabled: cfg.abEnabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** RMP-matched leads for a campus, most-rated first (the ProfIntel target set). */
export async function fetchCampusRmpLeads(campusId: string): Promise<ProfIntelLead[]> {
  const { data, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .select(
      "id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count",
    )
    .eq("campus_id", campusId)
    .eq("research_mode", "faculty_scrape")
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as any[])
    .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) ||
        (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1),
    );
  // Wider net: also include other research modes that have an RMP match.
  if (rows.length === 0) {
    const { data: any2 } = await (supabase.from("campus_lead_suggestions" as never) as any)
      .select(
        "id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count",
      )
      .eq("campus_id", campusId)
      .is("archived_at", null);
    return ((any2 ?? []) as any[])
      .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) ||
          (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1),
      );
  }
  return rows;
}

const LEAD_COLS =
  "id, first_name, last_name, email, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count, mobility_status";

const byRmpDesc = (a: any, b: any) =>
  (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) ||
  (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1);

/** Active faculty for a campus, split into the curated RMP-matched target set and
 * the full active roster. The UI shows `matched` when it exists (the original
 * behavior), and falls back to `all` for campuses we've only just scraped or
 * hand-entered (no RMP cross-reference yet). Moved/retired leads are excluded. */
export async function fetchProfintelLeads(
  campusId: string,
): Promise<{ matched: ProfIntelLead[]; all: ProfIntelLead[] }> {
  const { data, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .select(LEAD_COLS)
    .eq("campus_id", campusId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  const active = ((data ?? []) as any[]).filter(
    (r) => (r.mobility_status ?? "active") === "active",
  );
  const all = [...active].sort(byRmpDesc) as ProfIntelLead[];
  const matched = active
    .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
    .sort(byRmpDesc) as ProfIntelLead[];
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
export async function retireLead(
  lead: ProfIntelLead,
  fromCampusId: string,
  note?: string,
): Promise<void> {
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
    .update({
      mobility_status: "retired",
      mobility_note: note ?? null,
      mobility_updated_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (error) throw new Error(error.message);
}

/** Mark a lead as moved to another campus and record the edge. The destination
 * lead is created lazily (see acceptIncomingMove) when that campus is next opened. */
export async function moveLead(
  lead: ProfIntelLead,
  fromCampusId: string,
  toCampusId: string,
  note?: string,
): Promise<void> {
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
    .update({ to_lead_id: ins.id })
    .eq("id", move.id);
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
export async function createManualLeads(
  campusId: string,
  rows: ManualLeadInput[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const toInsert = rows.map((r) => {
    const parts = r.name.trim().split(/\s+/);
    const first = parts[0] || null;
    const last = parts.slice(1).join(" ") || null;
    const codes = r.courseMatches
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const json: Record<string, { code: string; count: number }> = {};
    codes.forEach((c, i) => {
      json[`m${i}`] = { code: c, count: 1 };
    });
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
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any).insert(
    toInsert,
  );
  if (error) throw new Error(error.message);
  return toInsert.length;
}

export interface CourseFamilyCodes {
  intro_1: string;
  intro_2: string;
  intermediate_1: string;
  intermediate_2: string;
}

/** Tolerantly read a jsonb code map. Some campus rows are double-encoded — the
 * jsonb holds a JSON *string* (e.g. '{"intro_1":"ACCT 2101"}') rather than an
 * object — so a plain key access returns nothing. Parse the string when needed. */
function asCodeObject(raw: unknown): Record<string, string> {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  return v && typeof v === "object" ? (v as Record<string, string>) : {};
}

/** Read a campus's current four course codes from course_family_codes_json. */
export async function fetchCampusCourseCodes(campusId: string): Promise<CourseFamilyCodes> {
  const { data, error } = await (supabase.from("campuses" as never) as any)
    .select("course_family_codes_json")
    .eq("id", campusId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const c = asCodeObject(data?.course_family_codes_json);
  return {
    intro_1: c.intro_1 ?? "",
    intro_2: c.intro_2 ?? "",
    intermediate_1: c.intermediate_1 ?? "",
    intermediate_2: c.intermediate_2 ?? "",
  };
}

/** Save the four per-campus course codes to campuses.course_family_codes_json
 * (anon UPDATE is allowed by RLS). Only non-empty codes are written, so a campus
 * is never left with blank "" placeholders. This is the field onboarding + the
 * email merge read, so a moved-faculty campus is usable the moment Lee fills it. */
export async function saveCampusCourseCodes(
  campusId: string,
  codes: Partial<CourseFamilyCodes>,
): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(codes)) {
    const t = (v ?? "").trim();
    if (t) clean[k] = t;
  }
  const { error } = await (supabase.from("campuses" as never) as any)
    .update({ course_family_codes_json: clean })
    .eq("id", campusId);
  if (error) throw new Error(error.message);
}

/** Campus ids on the active roster (SEC scope). Returns null when the
 * active_roster column isn't present in this environment — the caller then shows
 * all campuses (graceful, cross-branch-safe). */
export async function fetchActiveRosterCampusIds(): Promise<Set<string> | null> {
  const { data, error } = await (supabase.from("campuses" as never) as any)
    .select("id")
    .not("active_roster", "is", null);
  if (error) return null;
  return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
}

// ===================== ProfIntel V2 =====================

/** One professor row for the V2 targeting table (columns come from 0045 rollup). */
export interface ProfIntelV2Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  title: string | null;
  is_phd: boolean;
  source_url: string | null;
  rmp_profile_url: string | null;
  rmp_rating: number | null;
  rmp_num_ratings: number | null;
  rmp_difficulty: number | null;
  rmp_would_take_again: number | null;
  rmp_course_match_count: number | null;
  rmp_course_match_json: Record<string, { code: string; count: number }> | null;
  rmp_latest_target_course_code: string | null;
  rmp_latest_target_rating_date: string | null;
  rmp_target_course_counts_json: Record<string, number> | null;
  rmp_terms_taught_estimate_json: { total?: number; terms?: string[] } | null;
  rmp_recent_target_match: boolean | null;
  rmp_taught_this_time_last_year: boolean | null;
  rmp_target_confidence: string | null;
  profintel_score: number | null;
  profintel_reason: string | null;
  profintel_v2_status: string | null;
}

const V2_LEAD_COLS =
  "id, first_name, last_name, email, title, is_phd, source_url, rmp_profile_url, rmp_rating, rmp_num_ratings, " +
  "rmp_difficulty, rmp_would_take_again, rmp_course_match_count, rmp_course_match_json, rmp_latest_target_course_code, " +
  "rmp_latest_target_rating_date, rmp_target_course_counts_json, rmp_terms_taught_estimate_json, " +
  "rmp_recent_target_match, rmp_taught_this_time_last_year, rmp_target_confidence, profintel_score, " +
  "profintel_reason, profintel_v2_status, mobility_status";

/** Active faculty for a campus with the V2 rollup columns, best score first. */
export async function fetchProfintelV2Leads(campusId: string): Promise<ProfIntelV2Lead[]> {
  const { data, error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .select(V2_LEAD_COLS)
    .eq("campus_id", campusId)
    .is("archived_at", null);
  if (error) throw new Error(error.message);
  return ((data ?? []) as any[])
    .filter((r) => (r.mobility_status ?? "active") === "active")
    .sort((a, b) => (b.profintel_score ?? 0) - (a.profintel_score ?? 0)) as ProfIntelV2Lead[];
}

const normNameKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export interface PastedLead {
  name: string;
  email: string | null;
  title: string | null;
  rmpRating: number | null;
  rmpNum: number | null;
  courseMatches: string | null;
  rmpProfileUrl: string | null;
}

/** Parse pasted V2 leads: one professor per line, TAB- or comma-separated, columns
 *  in order Name, Email, [Title, RMP rating, # ratings, Course matches, RMP URL].
 *  Name is required; everything else optional. */
export function parseV2Leads(text: string): PastedLead[] {
  const out: PastedLead[] = [];
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
    const emailRaw = (cols[1] ?? "").trim();
    out.push({
      name,
      email: /\S+@\S+\.\S+/.test(emailRaw) ? emailRaw.toLowerCase() : null,
      title: (cols[2] ?? "").trim() || null,
      rmpRating: num(cols[3]),
      rmpNum: cols[4] != null && cols[4].trim() ? Math.round(num(cols[4]) ?? 0) || null : null,
      courseMatches: (cols[5] ?? "").trim() || null,
      rmpProfileUrl: (cols[6] ?? "").trim() || null,
    });
  }
  return out;
}

/** Upsert pasted V2 leads for a campus, de-duping against existing leads by email
 *  or normalized full name (never duplicates a professor already on the campus).
 *  New rows are tagged research_label='manual_profintel_v2'. Existing rows are
 *  only enriched where a field is currently empty (never clobbered). */
export async function pasteImportLeads(
  campusId: string,
  rows: PastedLead[],
): Promise<{ inserted: number; updated: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };
  const { data: existing, error: exErr } = await (
    supabase.from("campus_lead_suggestions" as never) as any
  )
    .select(
      "id, first_name, last_name, email, title, rmp_profile_url, rmp_rating, rmp_num_ratings, research_label",
    )
    .eq("campus_id", campusId)
    .is("archived_at", null);
  if (exErr) throw new Error(exErr.message);

  const byEmail = new Map<string, any>();
  const byName = new Map<string, any>();
  for (const e of (existing ?? []) as any[]) {
    if (e.email) byEmail.set(String(e.email).toLowerCase(), e);
    const nk = normNameKey(`${e.first_name ?? ""} ${e.last_name ?? ""}`);
    if (nk) byName.set(nk, e);
  }

  const toInsert: any[] = [];
  let updated = 0;
  for (const r of rows) {
    const parts = r.name.trim().split(/\s+/);
    const first = parts[0] || null;
    const last = parts.slice(1).join(" ") || null;
    const match = (r.email && byEmail.get(r.email)) || byName.get(normNameKey(r.name));
    if (match) {
      // Fill only empties — don't overwrite existing curated data.
      const patch: Record<string, unknown> = {};
      if (r.email && !match.email) patch.email = r.email;
      if (r.title && !match.title) patch.title = r.title;
      if (r.rmpProfileUrl && !match.rmp_profile_url) patch.rmp_profile_url = r.rmpProfileUrl;
      if (r.rmpRating != null && match.rmp_rating == null) patch.rmp_rating = r.rmpRating;
      if (r.rmpNum != null && match.rmp_num_ratings == null) patch.rmp_num_ratings = r.rmpNum;
      if (!match.research_label) patch.research_label = "manual_profintel_v2";
      if (Object.keys(patch).length > 0) {
        const { error } = await (supabase.from("campus_lead_suggestions" as never) as any)
          .update(patch)
          .eq("id", match.id);
        if (error) throw new Error(error.message);
      }
      updated += 1;
      continue;
    }
    toInsert.push({
      campus_id: campusId,
      first_name: first,
      last_name: last,
      email: r.email,
      title: r.title,
      rmp_profile_url: r.rmpProfileUrl,
      rmp_rating: r.rmpRating,
      rmp_num_ratings: r.rmpNum,
      rmp_course_codes: r.courseMatches
        ? r.courseMatches
            .split(/[,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : null,
      research_mode: "manual",
      research_label: "manual_profintel_v2",
      status: "needs_review",
      mobility_status: "active",
      profintel_v2_status: "candidate",
      notes: "Pasted in ProfIntel V2.",
    });
  }
  if (toInsert.length > 0) {
    const { error } = await (supabase.from("campus_lead_suggestions" as never) as any).insert(
      toInsert,
    );
    if (error) throw new Error(error.message);
  }
  return { inserted: toInsert.length, updated };
}

/** Balanced 50/50 A/B labels for n sends, shuffled so neither variant is biased
 *  toward the higher-scored (earlier) leads. */
function abLabels(n: number): ("A" | "B")[] {
  const labels: ("A" | "B")[] = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? "A" : "B"));
  for (let i = labels.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [labels[i], labels[j]] = [labels[j], labels[i]];
  }
  return labels;
}

/** Create one draft per selected lead, pre-filled from the template. When the
 *  config has A/B enabled (and a non-empty B), sends split ~50/50 between the two
 *  variants; each row records which `variant` it used. */
export async function createDrafts(input: {
  campusId: string;
  school: string;
  template: ProfIntelTemplate | ProfIntelTemplateConfig;
  leads: ProfIntelLead[];
}): Promise<number> {
  if (input.leads.length === 0) return 0;
  // Accept either a single template (variant A only) or a full A/B config.
  const cfg: ProfIntelTemplateConfig =
    "a" in input.template
      ? input.template
      : { a: input.template, b: { subject: "", body: "" }, abEnabled: false };
  const abLive = cfg.abEnabled && !!cfg.b.subject.trim() && !!cfg.b.body.trim();
  const labels = abLive ? abLabels(input.leads.length) : [];

  const rows = input.leads.map((lead, i) => {
    const variant = abLive ? labels[i] : null;
    const tpl = variant === "B" ? cfg.b : cfg.a;
    const { subject, body } = renderTemplate(tpl, lead, input.school);
    return {
      campus_id: input.campusId,
      lead_id: lead.id,
      to_name: `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() || null,
      to_email: lead.email ?? null,
      school: input.school,
      course_matches: courseMatchesText(lead.rmp_course_match_json) || null,
      // Denormalize the targeting score so scheduling can order sends by it.
      profintel_score: (lead as { profintel_score?: number | null }).profintel_score ?? null,
      variant,
      subject,
      body,
      ready: false,
      status: "draft",
    };
  });
  const { error } = await (supabase.from("profintel_sends" as never) as any).insert(rows);
  if (error) {
    // Newer columns (profintel_score/variant) may not exist yet — retry without them.
    const stripped = rows.map(({ profintel_score, variant, ...r }) => r);
    const r2 = await (supabase.from("profintel_sends" as never) as any).insert(stripped);
    if (r2.error) throw new Error(r2.error.message);
  }
  return rows.length;
}

/** Deliverability-friendly send times: weekday Tue/Wed/Thu, 10:00 AM–3:00 PM local,
 *  jittered minutes (never on the hour), ~perDay/day, starting the next such
 *  weekday. Returned in chronological order — the caller assigns the earliest
 *  slots to the highest-scored leads. */
export function spreadSendTimes(n: number, perDay = 12): string[] {
  const dayList: Date[] = [];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  day.setDate(day.getDate() + 1); // start tomorrow
  let guard = 0;
  while (dayList.length < Math.ceil(n / perDay) && guard++ < 200) {
    const dow = day.getDay(); // 2=Tue, 3=Wed, 4=Thu
    if (dow >= 2 && dow <= 4) dayList.push(new Date(day));
    day.setDate(day.getDate() + 1);
  }
  const out: string[] = [];
  let i = 0;
  for (const d of dayList) {
    const slots: string[] = [];
    for (let k = 0; k < perDay && i < n; k++, i++) {
      const hour = 10 + Math.floor(Math.random() * 5); // 10..14 → 10:00–2:59 PM
      const min = Math.floor(Math.random() * 60);
      slots.push(new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, min).toISOString());
    }
    slots.sort();
    out.push(...slots);
  }
  return out;
}

/** Schedule a set of drafts, highest ProfIntel score first (earliest slots),
 *  across the spread window. Returns the assigned send times (chronological). */
export async function scheduleCampaignDrafts(drafts: ProfIntelSend[]): Promise<string[]> {
  const pending = drafts.filter((d) => d.status === "draft");
  if (pending.length === 0) return [];
  const ordered = [...pending].sort(
    (a, b) => (b.profintel_score ?? -1) - (a.profintel_score ?? -1),
  );
  const times = spreadSendTimes(ordered.length);
  for (let i = 0; i < ordered.length; i++) {
    await updateSend(ordered[i].id, { scheduled_at: times[i], ready: true, status: "scheduled" });
  }
  return times;
}

const SEND_BASE_COLS =
  "id, campus_id, lead_id, to_name, to_email, school, course_matches, subject, body, ready, scheduled_at, status, created_at";
const SEND_EXT_COLS =
  SEND_BASE_COLS +
  ", profintel_score, sent_at, opened_at, replied_at, open_count, variant, clicked_at, click_count, last_clicked_url";

export async function listSends(opts?: { campusId?: string }): Promise<ProfIntelSend[]> {
  const run = async (cols: string) => {
    let q = (supabase.from("profintel_sends" as never) as any)
      .select(cols)
      .order("created_at", { ascending: false });
    if (opts?.campusId) q = q.eq("campus_id", opts.campusId);
    return q;
  };
  // Prefer the tracking columns; fall back to base if 0048 isn't applied yet.
  const first = await run(SEND_EXT_COLS);
  let data = first.data;
  if (first.error) {
    const r = await run(SEND_BASE_COLS);
    if (r.error) throw new Error(r.error.message);
    data = r.data;
  }
  return (data ?? []) as ProfIntelSend[];
}

export interface ProfIntelSettings {
  sending_enabled: boolean;
  daily_send_cap: number;
  sent_today: number;
  sent_today_date: string | null;
  last_run_at: string | null;
  warmup_start_date: string | null;
}

// Automatic cold-domain warmup. Cap ramps weekly, anchored to the first send
// date, and never exceeds the ceiling (daily_send_cap). Keep in sync with the
// copy in supabase/functions/profintel-send-worker/index.ts.
const WARMUP_STEPS = [15, 22, 30, 38]; // weeks 1..4; week 5+ = ceiling
function warmupCap(days: number, ceiling: number): number {
  const wk = Math.floor(Math.max(0, days) / 7);
  const base = wk < WARMUP_STEPS.length ? WARMUP_STEPS[wk] : ceiling;
  return Math.min(base, ceiling);
}
/** Today's effective daily cap given the warmup ramp. Returns the starting cap
 *  until the first email sends (warmup_start_date is null). */
export function effectiveDailyCap(s: ProfIntelSettings | null): number {
  const ceiling = s?.daily_send_cap ?? 40;
  if (!s?.warmup_start_date) return Math.min(WARMUP_STEPS[0], ceiling);
  const start = Date.parse(`${s.warmup_start_date}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((today - start) / 86_400_000));
  return warmupCap(days, ceiling);
}
/** Human label for where the ramp is today (e.g. "warming up · week 2 of 4"). */
export function warmupStatus(s: ProfIntelSettings | null): string {
  const ceiling = s?.daily_send_cap ?? 40;
  const cap = effectiveDailyCap(s);
  if (cap >= ceiling) return "at full volume";
  if (!s?.warmup_start_date) return `warmup starts at first send`;
  const start = Date.parse(`${s.warmup_start_date}T00:00:00Z`);
  const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  const days = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((today - start) / 86_400_000));
  return `warming up · week ${Math.floor(days / 7) + 1} of ${WARMUP_STEPS.length + 1}`;
}

/** Global send settings (kill-switch + cap). Null if 0048 isn't applied yet. */
export async function getProfintelSettings(): Promise<ProfIntelSettings | null> {
  const { data, error } = await (supabase.from("profintel_settings" as never) as any)
    .select(
      "sending_enabled, daily_send_cap, sent_today, sent_today_date, last_run_at, warmup_start_date",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as ProfIntelSettings | null;
}

export async function updateProfintelSettings(
  patch: Partial<Pick<ProfIntelSettings, "sending_enabled">>,
): Promise<void> {
  const { error } = await (supabase.from("profintel_settings" as never) as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

/** Manual reply marker (fallback until inbound-reply capture is configured). */
export async function markReplied(id: string, replied: boolean): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .update({ replied_at: replied ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateSend(
  id: string,
  patch: Partial<
    Pick<
      ProfIntelSend,
      "to_name" | "to_email" | "subject" | "body" | "ready" | "scheduled_at" | "status"
    >
  >,
): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSend(id: string): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Delete every ProfIntel draft for a campus — the "Reset / start from scratch" action. */
export async function clearDrafts(campusId: string): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .delete()
    .eq("campus_id", campusId);
  if (error) throw new Error(error.message);
}

/** Persist an email a lead was missing (edited inline in the Step 2 leads table),
 * so it carries into any draft created afterward. */
export async function updateLeadEmail(leadId: string, email: string | null): Promise<void> {
  const { error } = await (supabase.from("campus_lead_suggestions" as never) as any)
    .update({ email })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}
