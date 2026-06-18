// Real data layer — maps the migrated database to the UI shapes in outreach-mock.
// Falls back gracefully: callers should catch and use mock data if these throw.
import { supabase } from "@/integrations/supabase/client";
import type {
  AssignmentStatus,
  ApprovalStatus,
  Campus,
  EmailTemplate,
  TemplateKind,
  TemplateVariant,
} from "@/lib/outreach-mock";
import {
  getSupportedTextbookFamilies,
  campusHasSupportedTextbook,
  type SupportedTextbookFamily,
} from "@/lib/textbook-matcher";

const APPROVAL_VALUES: ApprovalStatus[] = ["not_reviewed", "needs_review", "approved", "needs_fix"];
const ASSIGNMENT_VALUES: AssignmentStatus[] = ["not_assigned", "assigned", "in_progress", "approved", "blocked"];

const CAMPUS_SELECT =
  "id,name,slug,state,region,is_sec,archived_at,accounting_department_name,annual_tuition_in_state_cents,annual_tuition_out_state_cents,tuition_source,tuition_notes,total_enrollment,approval_status,ready_for_outreach,assignment_status,assigned_to,assignment_batch,due_date,course_codes_json,course_family_codes_json,course_family_titles_json,course_family_status_json,course_family_textbooks_json,course_family_terms_json,ai_research_debug_json,use_school_colors,landing_page_reviewed,use_personal_phone";

function extractCourseCodes(json: unknown): string[] {
  if (Array.isArray(json)) return json.filter((x): x is string => typeof x === "string");
  return [];
}

function asRecord(json: unknown): Record<string, string> | undefined {
  if (json && typeof json === "object" && !Array.isArray(json)) return json as Record<string, string>;
  return undefined;
}

function mapConfidence(label: string | null): Campus["tam_confidence"] {
  if (!label) return null;
  const l = label.toLowerCase();
  if (l.startsWith("high")) return "high";
  if (l.startsWith("med")) return "med";
  if (l.startsWith("low")) return "low";
  return null;
}

function mapTuitionSource(src: string | null): Campus["tuition_source"] {
  if (src === "college_scorecard" || src === "ipeds") return "ipeds";
  if (src === "ai_estimate") return "ai_estimate";
  return null;
}

export async function fetchCampuses(): Promise<Campus[]> {
  const { data, error } = await supabase.from("campuses").select(CAMPUS_SELECT);
  if (error) throw error;
  const rows = (data ?? []) as any[];

  // Merge TAM estimates (separate table, like the original app did).
  const tamById = new Map<string, any>();
  try {
    const ids = rows.map((c) => c.id);
    if (ids.length) {
      const { data: tams } = await supabase
        .from("campus_tam_estimates")
        .select("campus_id,tam_total_base,confidence_label")
        .in("campus_id", ids);
      (tams ?? []).forEach((t: any) => tamById.set(t.campus_id, t));
    }
  } catch {
    // TAM is decorative — keep going without it.
  }

  // Landing-page view/click counts per campus (best-effort).
  const landingCounts = new Map<string, { views: number; clicks: number }>();
  try {
    const { data: events } = await supabase
      .from("landing_page_events" as never)
      .select("campus_id,kind") as { data: { campus_id: string | null; kind: string }[] | null };
    for (const e of events ?? []) {
      if (!e.campus_id) continue;
      const cur = landingCounts.get(e.campus_id) ?? { views: 0, clicks: 0 };
      if (e.kind === "view") cur.views++;
      else if (e.kind === "click") cur.clicks++;
      landingCounts.set(e.campus_id, cur);
    }
  } catch { /* table may not exist yet */ }

  return rows.map((c): Campus => {
    const tam = tamById.get(c.id);
    const approval = APPROVAL_VALUES.includes(c.approval_status) ? c.approval_status : "not_reviewed";
    const assignment = ASSIGNMENT_VALUES.includes(c.assignment_status) ? c.assignment_status : "not_assigned";
    return {
      id: c.id,
      school_name: c.name ?? "",
      slug: c.slug ?? "",
      state: c.state ?? "",
      region: c.region ?? "",
      is_sec: !!c.is_sec,
      archived: !!c.archived_at,
      tam_total: tam?.tam_total_base ?? null,
      tam_confidence: mapConfidence(tam?.confidence_label ?? null),
      tuition_in_state: c.annual_tuition_in_state_cents != null ? Math.round(c.annual_tuition_in_state_cents / 100) : null,
      tuition_out_state: c.annual_tuition_out_state_cents != null ? Math.round(c.annual_tuition_out_state_cents / 100) : null,
      tuition_source: mapTuitionSource(c.tuition_source),
      tuition_notes: c.tuition_notes ?? null,
      total_enrollment: c.total_enrollment != null ? Number(c.total_enrollment) : null,
      approval_status: approval,
      ready_for_outreach: !!c.ready_for_outreach,
      emails_sent: false,
      assignment_status: assignment,
      assigned_to: c.assigned_to ?? null,
      assignment_batch: c.assignment_batch ?? null,
      due_date: c.due_date ?? null,
      landing_views: landingCounts.get(c.id)?.views ?? 0,
      landing_clicks: landingCounts.get(c.id)?.clicks ?? 0,
      course_codes: extractCourseCodes(c.course_codes_json),
      course_family_codes_json: asRecord(c.course_family_codes_json),
      course_family_titles_json: asRecord(c.course_family_titles_json),
      course_family_status_json: asRecord(c.course_family_status_json),
      course_family_textbooks_json: (c.course_family_textbooks_json ?? undefined) as Campus["course_family_textbooks_json"],
      course_family_terms_json: (c.course_family_terms_json ?? undefined) as Campus["course_family_terms_json"],
      ai_research_debug_json: (c.ai_research_debug_json ?? undefined) as Campus["ai_research_debug_json"],
      accounting_department_name: c.accounting_department_name ?? null,
      use_school_colors: c.use_school_colors ?? true,
      landing_page_reviewed: !!c.landing_page_reviewed,
      use_personal_phone: !!c.use_personal_phone,
    };
  });
}

/** Map a UI-side Campus patch back to database columns. */
export async function patchCampusDb(id: string, patch: Partial<Campus>): Promise<void> {
  const db: Record<string, unknown> = {};
  if ("course_family_codes_json" in patch) db.course_family_codes_json = patch.course_family_codes_json ?? {};
  if ("course_family_titles_json" in patch) db.course_family_titles_json = patch.course_family_titles_json ?? {};
  if ("course_family_status_json" in patch) db.course_family_status_json = patch.course_family_status_json ?? {};
  if ("course_family_textbooks_json" in patch) db.course_family_textbooks_json = patch.course_family_textbooks_json ?? {};
  if ("course_family_terms_json" in patch) db.course_family_terms_json = patch.course_family_terms_json ?? {};
  if ("ai_research_debug_json" in patch) db.ai_research_debug_json = patch.ai_research_debug_json ?? null;
  if ("accounting_department_name" in patch) db.accounting_department_name = patch.accounting_department_name;
  if ("course_codes" in patch) {
    db.course_codes_json = patch.course_codes ?? [];
    db.course_codes_reviewed = (patch.course_codes ?? []).length > 0;
  }
  if ("approval_status" in patch) {
    db.approval_status = patch.approval_status;
    if (patch.approval_status === "approved") db.approved_at = new Date().toISOString();
  }
  if ("ready_for_outreach" in patch) db.ready_for_outreach = patch.ready_for_outreach;
  if ("assigned_to" in patch) db.assigned_to = patch.assigned_to;
  if ("due_date" in patch) db.due_date = patch.due_date;
  if ("assignment_status" in patch) db.assignment_status = patch.assignment_status;
  if ("use_personal_phone" in patch) db.use_personal_phone = !!patch.use_personal_phone;
  if (Object.keys(db).length === 0) return;
  const { error } = await supabase.from("campuses").update(db as never).eq("id", id);
  if (error) throw error;
}

// ----- Create campus -----
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function findCampusBySlug(
  slug: string,
): Promise<{ id: string; name: string; slug: string } | null> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id,name,slug")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return (data as any) ?? null;
}

export interface CreateCampusInput {
  name: string;
  state?: string | null;
  website_url?: string | null;
  accounting_department_url?: string | null;
}

/**
 * Insert a new campus row with safe defaults (needs_review, not assigned,
 * not ready for outreach). Returns the new id and slug.
 */
export async function createCampus(
  input: CreateCampusInput,
): Promise<{ id: string; slug: string; name: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Campus name is required");
  let slug = slugify(name);
  if (!slug) slug = `campus-${Date.now().toString(36)}`;

  // Make slug unique (append -2, -3, …) if a collision exists.
  // eslint-disable-next-line no-constant-condition
  for (let i = 1; ; i++) {
    const candidate = i === 1 ? slug : `${slug}-${i}`;
    const existing = await findCampusBySlug(candidate);
    if (!existing) { slug = candidate; break; }
    if (i > 25) { slug = `${slug}-${Date.now().toString(36)}`; break; }
  }

  const row: Record<string, unknown> = {
    name,
    slug,
    state: input.state?.trim() || null,
    website_url: input.website_url?.trim() || null,
    accounting_department_url: input.accounting_department_url?.trim() || null,
    approval_status: "needs_review",
    ready_for_outreach: false,
    assignment_status: "not_assigned",
  };
  const { data, error } = await supabase
    .from("campuses")
    .insert(row as never)
    .select("id,slug,name")
    .single();
  if (error) throw error;
  return data as { id: string; slug: string; name: string };
}

// ----- Email templates -----
export async function fetchTemplates(): Promise<EmailTemplate[]> {
  let { data, error } = await supabase
    .from("outreach_email_templates")
    .select("id,name,subject,body,is_locked,is_active,kind,variant,lead_type" as never);
  if (error && /lead_type/.test(error.message ?? "")) {
    // Migration 0017 not applied yet - read without the column, default it.
    ({ data, error } = await supabase
      .from("outreach_email_templates")
      .select("id,name,subject,body,is_locked,is_active,kind,variant" as never));
  }
  if (error) throw error;
  return (data ?? []).map((t: any): EmailTemplate => ({
    id: t.id,
    name: t.name ?? "",
    subject: t.subject ?? "",
    body: t.body ?? "",
    is_locked: !!t.is_locked,
    is_active: !!t.is_active,
    kind: (t.kind ?? "initial") as TemplateKind,
    variant: (t.variant ?? "default") as TemplateVariant,
    lead_type: (t as any).lead_type ?? "professors",
  }));
}

export async function saveTemplateDb(
  payload: Omit<EmailTemplate, "id">,
  existingId?: string,
): Promise<void> {
  const { lead_type: _lt, ...payloadForDb } = payload as typeof payload & { lead_type?: string };
  if (payloadForDb.is_active) {
    // Single active row per (kind, variant) — same rule as the original app.
    let q = supabase
      .from("outreach_email_templates")
      .update({ is_active: false })
      .eq("kind", payload.kind)
      .eq("variant", payload.variant);
    if (existingId) q = q.neq("id", existingId);
    await q;
  }
  if (existingId) {
    const { error } = await supabase.from("outreach_email_templates").update(payloadForDb as never).eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("outreach_email_templates").insert(payloadForDb as never);
    if (error) throw error;
  }
}

// ----- VA week assignments (the week strip + today checklist) -----
export async function fetchWeekCounts(startISO: string, endISO: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("outreach_va_campus_assignments")
    .select("assigned_for_date")
    .gte("assigned_for_date", startISO)
    .lte("assigned_for_date", endISO);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as any[]) {
    const k = r.assigned_for_date as string;
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

export async function fetchCampusIdsForDate(dateISO: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("outreach_va_campus_assignments")
    .select("campus_id")
    .eq("assigned_for_date", dateISO);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => r.campus_id).filter(Boolean);
}

// ----- Professor leads -----
export interface Lead {
  id: string;
  campus_id: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  is_phd: boolean;
  status: string | null;
  created_at: string | null;
  landing_token: string | null;
  sent_at: string | null;
  opens_count: number;
  clicks_count: number;
  scheduled_send_at: string | null;
  sequence_stopped_at: string | null;
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("outreach_leads")
    .select("id,campus_id,email,first_name,last_name,is_phd,status,created_at,landing_token,sent_at,opens_count,clicks_count,scheduled_send_at,sequence_stopped_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((l: any) => ({
    id: l.id,
    campus_id: l.campus_id ?? null,
    email: l.email ?? "",
    first_name: l.first_name ?? null,
    last_name: l.last_name ?? null,
    is_phd: !!l.is_phd,
    status: l.status ?? null,
    created_at: l.created_at ?? null,
    landing_token: l.landing_token ?? null,
    sent_at: l.sent_at ?? null,
    opens_count: Number(l.opens_count ?? 0),
    clicks_count: Number(l.clicks_count ?? 0),
    scheduled_send_at: l.scheduled_send_at ?? null,
    sequence_stopped_at: l.sequence_stopped_at ?? null,
  }));
}

/** Two business days out, at 9:30 AM Central (15:30 UTC during DST). */
export function importSendTime(): Date {
  const d = new Date();
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  d.setUTCHours(15, 30, 0, 0);
  return d;
}

/**
 * Insert leads for one campus, deduping by email across all existing leads.
 * Auto-scheduling on import is admin-controlled (Email Queue → Settings).
 * When OFF, leads land as "ready"; you batch-schedule from the Leads table.
 */
export async function importLeads(
  campusId: string,
  rows: { email: string; first_name: string; last_name: string; is_phd: boolean }[],
): Promise<{ imported: number; duplicates: number; autoScheduled: boolean }> {
  const autoSchedule = await fetchAutoScheduleSetting();
  const scheduledISO = autoSchedule ? importSendTime().toISOString() : null;
  const { data: existing, error: exErr } = await supabase.from("outreach_leads").select("email");
  if (exErr) throw exErr;
  const existingSet = new Set<string>(((existing ?? []) as any[]).map((x) => (x.email ?? "").toLowerCase()));

  let imported = 0, duplicates = 0;
  for (const r of rows) {
    const email = r.email.trim().toLowerCase();
    if (!email) continue;
    if (existingSet.has(email)) { duplicates++; continue; }
    const { error } = await supabase.from("outreach_leads").insert({
      email,
      first_name: r.first_name.trim() || null,
      last_name: r.last_name.trim() || null,
      is_phd: r.is_phd,
      campus_id: campusId,
      status: autoSchedule ? "queued" : "ready",
      scheduled_send_at: scheduledISO,
      // Per-professor landing URL token: /outreach/school/{slug}?p={token}
      landing_token: crypto.randomUUID().replace(/-/g, "").slice(0, 10),
    } as never);
    if (error) throw error;
    existingSet.add(email);
    imported++;
  }
  return { imported, duplicates, autoScheduled: autoSchedule };
}

/** Look up a lead by its landing token (for personalized landing pages). */
export async function fetchLeadByToken(token: string): Promise<Lead | null> {
  // Cast: landing_token is added by migration 0007; regenerated types catch up on next sync.
  const { data, error } = await (supabase.from("outreach_leads") as any)
    .select("id,campus_id,email,first_name,last_name,is_phd,status,created_at,landing_token")
    .eq("landing_token", token)
    .maybeSingle();
  if (error || !data) return null;
  const l = data as any;
  return {
    id: l.id, campus_id: l.campus_id ?? null, email: l.email ?? "",
    first_name: l.first_name ?? null, last_name: l.last_name ?? null,
    is_phd: !!l.is_phd, status: l.status ?? null, created_at: l.created_at ?? null,
    landing_token: l.landing_token ?? null,
    sent_at: null, opens_count: 0, clicks_count: 0,
    scheduled_send_at: null, sequence_stopped_at: null,
  };
}

/** Load a campus landing page by slug (public, anon-readable). */
export async function fetchCampusBySlug(slug: string): Promise<{
  id: string; name: string; slug: string; course_codes: string[];
  course_family_codes: Record<string, string>;
  color_primary: string | null; color_secondary: string | null; use_school_colors: boolean;
} | null> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id,name,slug,course_codes_json,course_family_codes_json,color_primary,color_secondary,use_school_colors")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const c = data as any;
  const codes = Array.isArray(c.course_codes_json)
    ? c.course_codes_json.filter((x: unknown): x is string => typeof x === "string")
    : [];
  const familyCodes: Record<string, string> =
    c.course_family_codes_json && typeof c.course_family_codes_json === "object" && !Array.isArray(c.course_family_codes_json)
      ? (c.course_family_codes_json as Record<string, string>)
      : {};
  return {
    id: c.id, name: c.name ?? "", slug: c.slug ?? "",
    course_codes: codes,
    course_family_codes: familyCodes,
    color_primary: c.color_primary ?? null,
    color_secondary: c.color_secondary ?? null,
    use_school_colors: c.use_school_colors === true,
  };
}

// ----- Sending -----
export async function sendOutreachEmail(leadId: string, followUp: 0 | 1 | 2 | 3 = 0): Promise<{ ok: boolean; variant?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("outreach-send-email", {
    body: { lead_id: leadId, follow_up: followUp },
  });
  if (error) {
    // Surface the function's JSON error body when available.
    let message = error.message ?? "Send failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = await ctx.json();
        message = j?.message ?? j?.error ?? message;
      }
    } catch { /* keep default */ }
    return { ok: false, error: message };
  }
  return { ok: true, variant: (data as { variant?: string } | null)?.variant };
}

// ----- Landing-page event tracking (fire-and-forget) -----
export function recordLandingEvent(kind: "view" | "click", campusId: string, token?: string | null, leadId?: string | null) {
  supabase
    .from("landing_page_events" as never)
    .insert({ kind, campus_id: campusId, token: token ?? null, lead_id: leadId ?? null } as never)
    .then(({ error }) => { if (error) console.warn("landing event failed:", error.message); });
}

export const TEST_RECIPIENTS = ["lee@survivestudios.com", "jking.cim@gmail.com"] as const;

/** Send the current template draft to an allowed test recipient. */
export async function sendTestEmail(to: string, subject: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.functions.invoke("outreach-send-email", {
    body: { test_to: to, test_subject: subject, test_body: body },
  });
  if (error) {
    let message = error.message ?? "Test send failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = await ctx.json();
        message = j?.message ?? j?.error ?? message;
      }
    } catch { /* keep default */ }
    return { ok: false, error: message };
  }
  return { ok: true };
}

// ----- AI campus research (Approve Campus modal) -----
export type AiConfidence = "high" | "medium" | "low";
export interface AiField {
  value: string | null;
  confidence: AiConfidence;
  source: string | null;
}
export interface AiFamilyBook {
  isbn13: string | null;
  title: string | null;
  authors: string | null;
  publisher: string | null;
  confidence: AiConfidence;
  source: string | null;
}
export interface AiFamilyTerms {
  terms_text: { value: string | null; confidence: AiConfidence; source: string | null };
  offered_fall: boolean | null;
  offered_spring: boolean | null;
  offered_summer: boolean | null;
}
export interface AiFamilyResearch {
  code: AiField;
  title: AiField;
  textbook_status: { value: "matches" | "different" | "not_found" | null; confidence: AiConfidence; source: string | null };
  book: AiFamilyBook;
  terms?: AiFamilyTerms;
}
export interface CampusResearchResult {
  program: AiField;
  families: Record<string, AiFamilyResearch>;
}

/**
 * Ask Claude (web-search-grounded) to suggest the program name, course
 * codes/titles, and per-family textbook for a campus. Suggestions only —
 * a human reviews & edits before approving. Never fabricates: blank = not found.
 */
export async function researchCampusAI(
  campus: { school_name: string; state?: string; course_codes?: string[] },
): Promise<{ ok: boolean; result?: CampusResearchResult; error?: string; debug?: any }> {
  const { data, error } = await supabase.functions.invoke("research-campus", {
    body: {
      school_name: campus.school_name,
      state: campus.state ?? "",
      course_codes: campus.course_codes ?? [],
    },
  });
  if (error) {
    let message = error.message ?? "Research failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const j = await ctx.json();
        message = j?.detail ?? j?.error ?? message;
      }
    } catch { /* keep default */ }
    return { ok: false, error: message };
  }
  const d = data as { ok?: boolean; result?: CampusResearchResult; error?: string; debug?: any } | null;
  if (!d?.ok || !d.result) return { ok: false, error: d?.error ?? "No result returned", debug: d?.debug };
  return { ok: true, result: d.result, debug: d.debug };
}

// ----- SMS intake -----
export interface SmsConversation {
  id: string;
  short_ref: number;
  student_phone: string;
  campus_number: string;
  campus_id: string | null;
  course: string | null;
  exam_date: string | null;
  struggles: string | null;
  major: string | null;
  sentiment: string | null;
  status: string;
  last_message_at: string;
  is_tester?: boolean | null;
}
export interface SmsMessage {
  id: string;
  direction: "in" | "out";
  author: string | null;
  body: string;
  created_at: string;
}
export interface SmsInboundRaw {
  id: string;
  received_at: string;
  from_number: string | null;
  to_number: string | null;
  body: string | null;
  parse_status: string;
  error: string | null;
  conversation_id: string | null;
}

export async function fetchSmsConversations(): Promise<SmsConversation[]> {
  const { data, error } = await (supabase.from("sms_conversations" as never) as any)
    .select("id,short_ref,student_phone,campus_number,campus_id,course,exam_date,struggles,major,sentiment,status,last_message_at,is_tester")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as SmsConversation[];
}

export async function fetchSmsMessages(conversationId: string): Promise<SmsMessage[]> {
  const { data, error } = await (supabase.from("sms_messages" as never) as any)
    .select("id,direction,author,body,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SmsMessage[];
}

export async function fetchSmsInboundRaw(limit = 25): Promise<SmsInboundRaw[]> {
  const { data, error } = await (supabase.from("sms_inbound_raw" as never) as any)
    .select("id,received_at,from_number,to_number,body,parse_status,error,conversation_id")
    .order("received_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as SmsInboundRaw[];
}

/** Queue a dashboard reply for immediate send, then nudge the processor. */
export async function sendSmsReply(conversationId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase.from("sms_outbox" as never) as any).insert({
    conversation_id: conversationId,
    body,
    author: "lee",
    send_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  supabase.functions.invoke("sms-process-outbox", { body: {} }).catch(() => { /* cron will catch it */ });
  return { ok: true };
}

/** Delete a conversation entirely (cascades messages + outbox). Useful for re-testing first-message flow. */
export async function resetSmsConversation(conversationId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase.from("sms_conversations" as never) as any)
    .delete()
    .eq("id", conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Delete every conversation (and its messages/outbox) for a given student phone, plus their inbound_raw rows.
 * Accepts any format; normalizes to E.164 (+1XXXXXXXXXX for 10-digit US numbers). */
export async function clearConversationsByPhone(phone: string): Promise<{ ok: boolean; deleted: number; error?: string }> {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return { ok: false, deleted: 0, error: "Phone number too short" };
  const e164 = digits.length === 10 ? `+1${digits}` : `+${digits}`;
  const client = supabase.from("sms_conversations" as never) as any;
  const { data: convos, error: findErr } = await client.select("id").eq("student_phone", e164);
  if (findErr) return { ok: false, deleted: 0, error: findErr.message };
  const ids = (convos ?? []).map((c: { id: string }) => c.id);
  if (ids.length) {
    const { error: delErr } = await client.delete().in("id", ids);
    if (delErr) return { ok: false, deleted: 0, error: delErr.message };
  }
  await (supabase.from("sms_inbound_raw" as never) as any).delete().eq("from_number", e164);
  return { ok: true, deleted: ids.length };
}

/** Nuke every SMS row: conversations (cascades to messages + outbox) and inbound_raw. */
export async function clearAllSmsConversations(): Promise<{ ok: boolean; error?: string }> {
  const convoDel = await (supabase.from("sms_conversations" as never) as any)
    .delete()
    .not("id", "is", null);
  if (convoDel.error) return { ok: false, error: convoDel.error.message };
  const rawDel = await (supabase.from("sms_inbound_raw" as never) as any)
    .delete()
    .not("id", "is", null);
  if (rawDel.error) return { ok: false, error: rawDel.error.message };
  return { ok: true };
}

/**
 * Simulate an inbound text by posting to the deployed Twilio webhook with the
 * exact form-encoded shape Twilio uses. No Twilio charge — exercises the full
 * webhook → outbox → reply path. The outbound auto-replies still go through
 * Twilio (cost ~$0.008) unless you point a tester at a phone you own.
 */
export async function simulateInboundSms(args: {
  fromPhone: string;
  toPhone: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/twilio-sms-webhook`;
  const form = new URLSearchParams({
    From: args.fromPhone,
    To: args.toPhone,
    Body: args.body,
    MessageSid: `SIMULATED${Date.now().toString(36)}`,
    AccountSid: "SIMULATED",
  });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    if (!res.ok) return { ok: false, error: `Webhook returned HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}


// ----- SMS templates + config -----
export interface SmsTemplate {
  key: string;
  label: string;
  description: string | null;
  body: string;
  updated_at: string;
}
export interface SmsConfig {
  lee_phone: string | null;
  tester_phones: string[];
  twilio_configured: boolean;
  anthropic_configured: boolean;
}
export interface SmsDiagnostics {
  ok: boolean;
  checked_at: string;
  main_line: string;
  expected_sms_url: string;
  webhook_ok: boolean;
  number: {
    phone_number: string;
    friendly_name: string | null;
    status: string;
    sms_url: string | null;
    sms_method: string | null;
    voice_url: string | null;
    voice_method: string | null;
    capabilities?: Record<string, boolean>;
  };
  recent_messages: Array<{
    sid: string;
    date_created: string | null;
    date_sent: string | null;
    direction: string;
    from: string;
    to: string;
    status: string;
    error_code: number | null;
    body: string;
  }>;
  recent_alerts: Array<{
    sid: string;
    date_generated: string;
    error_code: string | null;
    log_level: string | null;
    resource_sid: string | null;
    more_info: string | null;
  }>;
}

export async function fetchSmsTemplates(): Promise<SmsTemplate[]> {
  const { data, error } = await (supabase.from("sms_templates" as never) as any)
    .select("key,label,description,body,updated_at")
    .order("key");
  if (error) throw error;
  return (data ?? []) as SmsTemplate[];
}

export async function updateSmsTemplate(key: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await (supabase.from("sms_templates" as never) as any)
    .update({ body })
    .eq("key", key);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function fetchSmsConfig(): Promise<SmsConfig> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-config`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sms-config HTTP ${res.status}`);
  return (await res.json()) as SmsConfig;
}

export async function fetchSmsDiagnostics(): Promise<SmsDiagnostics> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-diagnostics`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`sms-diagnostics HTTP ${res.status}`);
  return (await res.json()) as SmsDiagnostics;
}

export async function resyncSmsNumber(): Promise<{ ok: boolean; error?: string }> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sms-diagnostics`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "resync" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}



/** campus_id -> phone; the main line (campus_id null) is under "__main__". */
export async function fetchCampusPhones(): Promise<Map<string, string>> {
  const { data } = await (supabase.from("campus_phone_numbers" as never) as any)
    .select("campus_id,phone_e164");
  const m = new Map<string, string>();
  for (const r of (data ?? []) as { campus_id: string | null; phone_e164: string }[]) {
    m.set(r.campus_id ?? "__main__", r.phone_e164);
  }
  return m;
}

export async function provisionCampusNumber(campusId: string | null): Promise<{ ok: boolean; phone?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke("provision-campus-number", {
    body: campusId ? { campus_id: campusId } : { global: true },
  });
  if (error) {
    let message = error.message ?? "Provisioning failed";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) { const j = await ctx.json(); message = j?.error ?? message; }
    } catch { /* keep */ }
    return { ok: false, error: message };
  }
  return { ok: true, phone: (data as { phone?: string } | null)?.phone };
}

export function formatPhonePretty(e164: string): string {
  const d = e164.replace(/[^\d]/g, "");
  if (d.length === 11 && d.startsWith("1")) return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return e164;
}

// ----- Campus waitlist -----
export interface WaitlistSignup {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  campus_text: string | null;
  course_text: string | null;
  wants_text: boolean;
  wants_call: boolean;
  contacted_at: string | null;
  created_at: string;
}

export async function fetchWaitlist(): Promise<WaitlistSignup[]> {
  const { data, error } = await (supabase.from("campus_waitlist" as never) as any)
    .select("id,name,email,phone,campus_text,course_text,wants_text,wants_call,contacted_at,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as WaitlistSignup[];
}

export async function markWaitlistContacted(id: string, contacted: boolean): Promise<void> {
  const { error } = await (supabase.from("campus_waitlist" as never) as any)
    .update({ contacted_at: contacted ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) throw error;
}

/** Stop (or resume) all automated emails to a lead. */
export async function setLeadStopped(leadId: string, stopped: boolean): Promise<void> {
  const { error } = await supabase
    .from("outreach_leads")
    .update({ sequence_stopped_at: stopped ? new Date().toISOString() : null } as never)
    .eq("id", leadId);
  if (error) throw error;
}

// ----- Broadcasts (custom batch emails) -----
export interface Broadcast {
  id: string;
  name: string;
  subject: string;
  body: string;
  campus_ids: string[] | null;
  include_replied: boolean;
  send_at: string;
  status: string;
  sent_count: number;
  skipped_count: number;
  lead_type: string;
  created_at: string;
}

export async function fetchBroadcasts(): Promise<Broadcast[]> {
  const { data, error } = await (supabase.from("outreach_broadcasts" as never) as any)
    .select("id,name,subject,body,campus_ids,include_replied,send_at,status,sent_count,skipped_count,lead_type,created_at").order("send_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Broadcast[];
}

export async function saveBroadcast(
  b: Omit<Broadcast, "id" | "status" | "sent_count" | "skipped_count" | "created_at">,
  existingId?: string,
): Promise<void> {
  const stripLeadType = (obj: Record<string, unknown>) => {
    const copy = { ...obj };
    delete copy.lead_type;
    return copy;
  };
  if (existingId) {
    let { error } = await (supabase.from("outreach_broadcasts" as never) as any)
      .update({ ...b, status: "scheduled" }).eq("id", existingId);
    if (error && /lead_type/.test(error.message ?? "")) {
      ({ error } = await (supabase.from("outreach_broadcasts" as never) as any)
        .update({ ...stripLeadType(b as Record<string, unknown>), status: "scheduled" }).eq("id", existingId));
    }
    if (error) throw error;
  } else {
    let { error } = await (supabase.from("outreach_broadcasts" as never) as any).insert(b);
    if (error && /lead_type/.test(error.message ?? "")) {
      ({ error } = await (supabase.from("outreach_broadcasts" as never) as any).insert(stripLeadType(b as Record<string, unknown>)));
    }
    if (error) throw error;
  }
}

export async function cancelBroadcast(id: string): Promise<void> {
  const { error } = await (supabase.from("outreach_broadcasts" as never) as any)
    .update({ status: "canceled" }).eq("id", id);
  if (error) throw error;
}

// ----- Upcoming email sends (initial + follow-ups + broadcasts) -----
export type UpcomingKind = "initial" | "follow_up_1" | "follow_up_2" | "follow_up_3" | "broadcast";
export interface UpcomingSend {
  id: string;
  kind: UpcomingKind;
  send_at: string;
  campus_id: string | null;
  recipient: string;     // professor name or "(broadcast)"
  email: string;         // recipient email, or broadcast subject
  detail?: string;       // e.g. broadcast name
}

export async function fetchUpcomingSends(): Promise<UpcomingSend[]> {
  const out: UpcomingSend[] = [];
  const now = Date.now();

  // Initial scheduled sends + follow-up windows derived from sent_at
  const { data: leads } = await (supabase.from("outreach_leads") as any)
    .select("id,campus_id,email,first_name,last_name,is_phd,status,scheduled_send_at,sent_at,sequence_stopped_at,follow_up_1_sent_at,follow_up_2_sent_at,follow_up_3_sent_at");

  // Which follow-up kinds have an active template?
  let activeFollowups = new Set<UpcomingKind>(["follow_up_1", "follow_up_2", "follow_up_3"]);
  try {
    const tpls = await fetchTemplates();
    activeFollowups = new Set(
      tpls.filter((t) => t.is_active && (t.kind === "follow_up_1" || t.kind === "follow_up_2" || t.kind === "follow_up_3"))
        .map((t) => t.kind as UpcomingKind),
    );
  } catch { /* keep default */ }

  const nameOf = (l: any) => {
    const fn = (l.first_name ?? "").trim();
    const ln = (l.last_name ?? "").trim();
    if (l.is_phd && ln) return `Dr. ${ln}`;
    return [fn, ln].filter(Boolean).join(" ") || l.email;
  };

  for (const l of (leads ?? []) as any[]) {
    if (l.sequence_stopped_at) continue;
    if (l.status === "replied") continue;
    // Initial
    if (!l.sent_at && l.scheduled_send_at) {
      const t = new Date(l.scheduled_send_at).getTime();
      if (t > now) {
        out.push({
          id: `init-${l.id}`, kind: "initial", send_at: l.scheduled_send_at,
          campus_id: l.campus_id, recipient: nameOf(l), email: l.email,
        });
      }
    }
    // Follow-ups (sent_at + 7 / 14 / 21 days)
    if (l.sent_at) {
      const base = new Date(l.sent_at).getTime();
      const steps: { kind: UpcomingKind; days: number; sentCol: string }[] = [
        { kind: "follow_up_1", days: 7, sentCol: "follow_up_1_sent_at" },
        { kind: "follow_up_2", days: 14, sentCol: "follow_up_2_sent_at" },
        { kind: "follow_up_3", days: 21, sentCol: "follow_up_3_sent_at" },
      ];
      for (const s of steps) {
        if (!activeFollowups.has(s.kind)) continue;
        if (l[s.sentCol]) continue;
        const at = base + s.days * 24 * 60 * 60 * 1000;
        if (at > now) {
          out.push({
            id: `${s.kind}-${l.id}`, kind: s.kind, send_at: new Date(at).toISOString(),
            campus_id: l.campus_id, recipient: nameOf(l), email: l.email,
          });
        }
      }
    }
  }

  // Broadcasts
  try {
    const bs = await fetchBroadcasts();
    for (const b of bs) {
      if (b.status !== "scheduled") continue;
      if (new Date(b.send_at).getTime() <= now) continue;
      const ids = b.campus_ids ?? [null];
      for (const cid of ids) {
        out.push({
          id: `bcast-${b.id}-${cid ?? "all"}`, kind: "broadcast", send_at: b.send_at,
          campus_id: cid, recipient: "(broadcast)", email: b.subject, detail: b.name,
        });
      }
    }
  } catch { /* table may not exist */ }

  out.sort((a, b) => a.send_at.localeCompare(b.send_at));
  return out;
}

// ----- Outreach settings (singleton row) -----
export async function fetchAutoScheduleSetting(): Promise<boolean> {
  const { data } = await (supabase.from("outreach_settings" as never) as any)
    .select("auto_schedule_on_import").eq("id", 1).maybeSingle();
  return !!(data as { auto_schedule_on_import?: boolean } | null)?.auto_schedule_on_import;
}
export async function setAutoScheduleSetting(on: boolean): Promise<void> {
  const { error } = await (supabase.from("outreach_settings" as never) as any)
    .update({ auto_schedule_on_import: on, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// ----- Batch scheduling for unsent leads -----
export async function scheduleLeadsBatch(leadIds: string[], sendAt: Date): Promise<number> {
  if (leadIds.length === 0) return 0;
  const { error, count } = await (supabase.from("outreach_leads") as any)
    .update({ scheduled_send_at: sendAt.toISOString() }, { count: "exact" })
    .in("id", leadIds)
    .is("sent_at", null)
    .is("sequence_stopped_at", null);
  if (error) throw error;
  return count ?? leadIds.length;
}

/** Two business days out, at 3:30 PM Central (20:30 UTC). */
export function defaultBatchSendTime(): Date {
  const d = new Date();
  let added = 0;
  while (added < 2) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  d.setUTCHours(20, 30, 0, 0);
  return d;
}

// ============================================================
// AI Lead Suggestions (staging) — see migration campus_lead_suggestions.
// These NEVER write into outreach_leads. A human must accept a suggestion
// (in a later phase) before it becomes a real lead via importLeads().
// ============================================================

export type LeadSuggestionStatus = "pending" | "accepted" | "rejected" | "needs_lee";
export type LeadSuggestionType =
  | "professor"
  | "admin_staff"
  | "bap_advisor"
  | "tutoring_center"
  | "other";

export interface LeadCourseFound {
  course_code: string | null;
  course_title: string | null;
  course_family: "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2" | "other";
  term: string | null;
  source_url: string | null;
}

export interface LeadSuggestion {
  id: string;
  campus_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  department: string | null;
  lead_type: LeadSuggestionType;
  is_phd: boolean;
  is_cpa: boolean;
  source_url: string | null;
  confidence: number | null;
  notes: string | null;
  status: LeadSuggestionStatus;
  raw_payload: unknown | null;
  teaches_intro_1: boolean;
  teaches_intro_2: boolean;
  teaches_intermediate_1: boolean;
  teaches_intermediate_2: boolean;
  courses_found: LeadCourseFound[] | null;
  teaching_evidence_url: string | null;
  teaching_evidence_notes: string | null;
  research_mode: ResearchMode;
  research_label: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ResearchMode = "broad" | "clean_professor_only" | "textbook_only" | "program_and_courses";
export const RESEARCH_MODES: ResearchMode[] = ["broad", "clean_professor_only", "textbook_only", "program_and_courses"];

export type LeadSuggestionInput = Partial<
  Omit<LeadSuggestion, "id" | "campus_id" | "created_at" | "updated_at">
>;

const SUGGESTION_TABLE = "campus_lead_suggestions" as never;

function mapSuggestion(row: any): LeadSuggestion {
  return {
    id: row.id,
    campus_id: row.campus_id,
    email: row.email ?? null,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    title: row.title ?? null,
    department: row.department ?? null,
    lead_type: (row.lead_type ?? "professor") as LeadSuggestionType,
    is_phd: !!row.is_phd,
    is_cpa: !!row.is_cpa,
    source_url: row.source_url ?? null,
    confidence: row.confidence != null ? Number(row.confidence) : null,
    notes: row.notes ?? null,
    status: (row.status ?? "pending") as LeadSuggestionStatus,
    raw_payload: row.raw_payload ?? null,
    teaches_intro_1: !!row.teaches_intro_1,
    teaches_intro_2: !!row.teaches_intro_2,
    teaches_intermediate_1: !!row.teaches_intermediate_1,
    teaches_intermediate_2: !!row.teaches_intermediate_2,
    courses_found: Array.isArray(row.courses_found) ? (row.courses_found as LeadCourseFound[]) : null,
    teaching_evidence_url: row.teaching_evidence_url ?? null,
    teaching_evidence_notes: row.teaching_evidence_notes ?? null,
    research_mode: ((row.research_mode as string) === "clean_professor_only" ? "clean_professor_only" : "broad") as ResearchMode,
    research_label: row.research_label ?? null,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** List AI-suggested leads for a campus, newest first.
 *  Archived suggestions (archived_at IS NOT NULL) are excluded by default.
 *  Pass researchMode to filter by 'broad' or 'clean_professor_only'. */
export async function getLeadSuggestions(
  campusId: string,
  opts: { includeArchived?: boolean; researchMode?: ResearchMode | "all" } = {},
): Promise<LeadSuggestion[]> {
  let q: any = supabase
    .from(SUGGESTION_TABLE)
    .select("*")
    .eq("campus_id", campusId);
  if (!opts.includeArchived) q = q.is("archived_at", null);
  if (opts.researchMode && opts.researchMode !== "all") {
    q = q.eq("research_mode", opts.researchMode);
  }
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapSuggestion);
}

/** Archive every non-archived suggestion for the given campus(es).
 *  When campusIds is null/undefined, archives ALL non-archived suggestions
 *  globally. Does NOT delete any rows. Returns affected count.
 *
 *  Used by the "Archive current broad AI run" admin action to retire the
 *  first broad exploratory AI run before clean professor-only research. */
export async function archiveBroadRunSuggestions(opts: {
  label: string;
  reason: string;
  by?: string | null;
  campusIds?: string[] | null;
}): Promise<{ archivedCount: number }> {
  const patch = {
    archived_at: new Date().toISOString(),
    archive_label: opts.label,
    archived_reason: opts.reason,
    archived_by: opts.by ?? "admin",
  };
  let q: any = (supabase.from(SUGGESTION_TABLE) as any)
    .update(patch)
    .is("archived_at", null);
  if (opts.campusIds && opts.campusIds.length > 0) q = q.in("campus_id", opts.campusIds);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return { archivedCount: (data ?? []).length };
}

/** Insert a batch of AI suggestions for a campus. Returns inserted rows. */
export async function insertLeadSuggestions(
  campusId: string,
  suggestions: LeadSuggestionInput[],
): Promise<LeadSuggestion[]> {
  if (!suggestions.length) return [];
  const rows = suggestions.map((s) => ({
    campus_id: campusId,
    email: s.email?.trim().toLowerCase() || null,
    first_name: s.first_name?.trim() || null,
    last_name: s.last_name?.trim() || null,
    title: s.title?.trim() || null,
    department: s.department?.trim() || null,
    lead_type: s.lead_type ?? "professor",
    is_phd: !!s.is_phd,
    is_cpa: !!s.is_cpa,
    source_url: s.source_url ?? null,
    confidence: s.confidence ?? null,
    notes: s.notes ?? null,
    status: s.status ?? "pending",
    raw_payload: s.raw_payload ?? null,
  }));
  const { data, error } = await supabase
    .from(SUGGESTION_TABLE)
    .insert(rows as never)
    .select("*");
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapSuggestion);
}

/** Patch a single suggestion (e.g. edit fields or change status). */
export async function updateLeadSuggestion(
  id: string,
  patch: LeadSuggestionInput,
): Promise<void> {
  const db: Record<string, unknown> = {};
  for (const k of [
    "email","first_name","last_name","title","department","lead_type",
    "is_phd","is_cpa","source_url","confidence","notes","status","raw_payload",
  ] as const) {
    if (k in patch) db[k] = (patch as any)[k];
  }
  if (typeof db.email === "string") db.email = (db.email as string).trim().toLowerCase() || null;
  if (!Object.keys(db).length) return;
  const { error } = await supabase
    .from(SUGGESTION_TABLE)
    .update(db as never)
    .eq("id", id);
  if (error) throw error;
}

/** Bulk-update the status of many suggestions at once. */
export async function bulkUpdateLeadSuggestions(
  ids: string[],
  status: LeadSuggestionStatus,
): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase
    .from(SUGGESTION_TABLE)
    .update({ status } as never)
    .in("id", ids);
  if (error) throw error;
}

// ============================================================
// Campus Course Sections (Phase 4C — Class Schedule Intelligence)
// ============================================================

export type CourseSectionFamily =
  | "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2"
  | "finance" | "business_stats" | "business_analytics"
  | "microeconomics" | "macroeconomics" | "other";

export interface CampusCourseSection {
  id: string;
  campus_id: string;
  course_family: CourseSectionFamily | null;
  course_code: string | null;
  course_title: string | null;
  term: string | null;
  section_number: string | null;
  instructor_name: string | null;
  instructor_email: string | null;
  meeting_days: string | null;
  meeting_time: string | null;
  location: string | null;
  enrollment_current: number | null;
  enrollment_capacity: number | null;
  waitlist_count: number | null;
  source_url: string | null;
  confidence: "high" | "medium" | "low" | null;
  created_at: string;
  updated_at: string;
}

const SECTIONS_TABLE = "campus_course_sections" as never;

export async function getCampusSections(campusId: string): Promise<CampusCourseSection[]> {
  const { data, error } = await supabase
    .from(SECTIONS_TABLE)
    .select("*")
    .eq("campus_id", campusId)
    .order("course_family", { ascending: true })
    .order("course_code", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CampusCourseSection[];
}

export interface SectionsResearchDebug {
  model?: string;
  per_family?: Record<string, {
    family: string;
    final_count: number;
    attempts: Array<{
      strict?: boolean;
      http_status?: number;
      returned?: number;
      rejected_count?: number;
      rejected_samples?: unknown[];
      sources?: string[];
      finish_reason?: string | null;
      error?: string;
      note?: string;
      parse_error?: string;
      raw_text_chars?: number;
    }>;
  }>;
  per_family_counts?: Record<string, number>;
}

export async function runCampusSectionsResearch(
  campusId: string,
  families?: string[],
): Promise<{
  success: boolean;
  sections_inserted: number;
  leads_updated: number;
  leads_created: number;
  error?: string;
  debug?: SectionsResearchDebug;
}> {
  const body: Record<string, unknown> = { campus_id: campusId };
  if (families && families.length) body.families = families;
  const { data, error } = await supabase.functions.invoke("research-campus-sections", { body });
  if (error) throw error;
  const d = data as any;
  if (d?.error && !d?.success) throw new Error(d.error);
  return d;
}

// ============================================================
// Batch Campus Research
// ============================================================

export interface CampusResearchJob {
  id: string;
  status: "running" | "paused" | "done" | "canceled";
  total_count: number;
  done_count: number;
  failed_count: number;
  notes: string | null;
  created_at: string;
  finished_at: string | null;
  research_mode?: ResearchMode | string | null;
}

export interface CampusResearchJobItem {
  id: string;
  job_id: string;
  campus_id: string;
  campus_name?: string | null;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  current_step: string | null;
  profile_done: boolean;
  leads_count: number;
  sections_count: number;
  families_with_zero: string[];
  retries: number;
  error: string | null;
  failed_step: string | null;
  started_at: string | null;
  finished_at: string | null;
}

/** Start a batch — creates a job and one item per provided campus, then triggers the first tick.
 *  Pass researchMode='clean_professor_only' to run the strict professor-only flow. */
export async function startCampusBatch(
  campusIds: string[],
  notes?: string,
  researchMode: ResearchMode = "broad",
): Promise<CampusResearchJob> {
  if (!campusIds.length) throw new Error("no campuses selected");
  const { data: job, error: jobErr } = await (supabase.from("campus_research_jobs" as never) as any)
    .insert({ status: "running", total_count: campusIds.length, notes: notes ?? null, research_mode: researchMode })
    .select()
    .single();
  if (jobErr) throw jobErr;

  const items = campusIds.map((cid) => ({ job_id: job.id, campus_id: cid, status: "pending" }));
  const { error: itemsErr } = await (supabase.from("campus_research_job_items" as never) as any).insert(items);
  if (itemsErr) throw itemsErr;

  supabase.functions.invoke("run-campus-batch", { body: { job_id: job.id, batch_size: 3 } }).catch(() => {});
  return job as CampusResearchJob;
}

/** Clean professor-only run — convenience wrapper. */
export async function startCleanProfessorBatch(
  campusIds: string[],
  notes?: string,
): Promise<CampusResearchJob> {
  return startCampusBatch(campusIds, notes ?? "Clean Professor Run", "clean_professor_only");
}

/** Program + course codes/titles batch — narrow AI run, writes only
 *  accounting_department_name + course_family_codes_json + course_family_titles_json. */
export async function startProgramAndCoursesBatch(
  campusIds: string[],
  notes?: string,
): Promise<CampusResearchJob> {
  return startCampusBatch(campusIds, notes ?? "Program + courses", "program_and_courses");
}

/** Returns the set of campus IDs whose Intro 1 OR Intro 2 textbook matches a
 *  supported_textbook_family row. Used for the "textbook-matched scope" of
 *  clean professor research. */
export async function getTextbookMatchedCampusIds(): Promise<string[]> {
  const [{ data: tb, error: tbErr }, supportedFamilies] = await Promise.all([
    supabase.from("campuses").select("id,course_family_textbooks_json,archived_at"),
    getSupportedTextbookFamilies(),
  ]);
  if (tbErr) throw tbErr;
  return ((tb ?? []) as Array<{ id: string; course_family_textbooks_json: unknown; archived_at: string | null }>)
    .filter((c) => !c.archived_at)
    .filter((c) => {
      const fake = { id: c.id, course_family_textbooks_json: c.course_family_textbooks_json } as unknown as Campus;
      return campusHasSupportedTextbook(fake, supportedFamilies, ["intro_1", "intro_2"]);
    })
    .map((c) => c.id);
}

/** Run clean professor research synchronously on ONE campus in test mode.
 *  Returns the edge function's full response payload (prompt, raw output,
 *  accepted/rejected leads, sources). Results are still inserted as pending
 *  suggestions but tagged with a distinct research_label so they're easy
 *  to find or archive. */
export interface CleanProfessorTestResult {
  success: boolean;
  campus_id: string;
  inserted_count: number;
  skipped_duplicate_count: number;
  suggestions: any[];
  debug: {
    model: string;
    research_mode: string;
    research_label: string;
    finish_reason: string | null;
    usage: any;
    raw_suggestion_count: number;
    parsed_lead_count: number;
    rejected_count: number;
    rejected_samples: { reason: string; sample: any }[];
    test_mode: boolean;
    prompt_preview: string;
    raw_response_preview: string;
    accepted_preview: any[];
    parsed_suggestions?: any[];
  };
  error?: string;
}

export async function runCleanProfessorTest(campusId: string): Promise<CleanProfessorTestResult> {
  if (!campusId) throw new Error("campusId required");
  const { data, error } = await supabase.functions.invoke("research-campus-leads-clean", {
    body: { campus_id: campusId, test_mode: true },
  });
  if (error) throw error;
  return data as CleanProfessorTestResult;
}

// ────────────────────────────────────────────────────────────────
// Textbook-only research (Phase: fix the 166 "unknown" campuses
// and repair existing ISBN-only entries via Google Books).
// ────────────────────────────────────────────────────────────────

export interface TextbookResearchResult {
  success: boolean;
  campus_id: string;
  families_now_present: string[];
  enriched_from_existing_isbn: string[];
  ai_attempted: boolean;
  ai_families_added: string[];
  ai_enriched_after: string[];
  ai_failed: string | null;
  textbooks: Record<string, { title: string | null; authors: string | null; publisher: string | null; isbn13: string | null; source: string | null }>;
}

/** Synchronous single-campus textbook research / ISBN repair. */
export async function runTextbookResearchForCampus(
  campusId: string,
  opts: { force?: boolean } = {},
): Promise<TextbookResearchResult> {
  if (!campusId) throw new Error("campusId required");
  const { data, error } = await supabase.functions.invoke("research-campus-textbooks", {
    body: { campus_id: campusId, force: !!opts.force },
  });
  if (error) throw error;
  return data as TextbookResearchResult;
}

/** Start a textbook-only batch job. Use scope='unknown' to target the
 *  campuses that have no textbook metadata for ANY family (covers the 166). */
export async function startTextbookOnlyBatch(
  scope: "unknown" | "all" | "selected",
  selectedIds?: string[],
): Promise<CampusResearchJob> {
  let ids: string[] = [];
  if (scope === "selected") {
    ids = (selectedIds ?? []).filter(Boolean);
  } else {
    const { data, error } = await supabase
      .from("campuses")
      .select("id, archived_at, course_family_textbooks_json");
    if (error) throw error;
    const rows = (data ?? []) as Array<{ id: string; archived_at: string | null; course_family_textbooks_json: unknown }>;
    const active = rows.filter((r) => !r.archived_at);
    if (scope === "all") {
      ids = active.map((r) => r.id);
    } else {
      // unknown = no entry has any signal across the four families
      ids = active
        .filter((r) => {
          const tb = (r.course_family_textbooks_json ?? {}) as Record<string, any>;
          const fams = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];
          return !fams.some((f) => {
            const e = tb[f];
            return e && (e.title || e.authors || e.publisher || e.isbn13);
          });
        })
        .map((r) => r.id);
    }
  }
  if (!ids.length) throw new Error("No campuses match this scope.");
  return startCampusBatch(ids, `Textbook-only research (${scope})`, "textbook_only");
}

/** Get the most recent job, with items. */
export async function getLatestCampusBatch(): Promise<
  { job: CampusResearchJob; items: CampusResearchJobItem[] } | null
> {
  const { data: jobs } = await (supabase.from("campus_research_jobs" as never) as any)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);
  const job = (jobs ?? [])[0];
  if (!job) return null;
  const { data: items } = await (supabase.from("campus_research_job_items" as never) as any)
    .select("*")
    .eq("job_id", job.id)
    .order("created_at", { ascending: true });
  return { job: job as CampusResearchJob, items: (items ?? []) as CampusResearchJobItem[] };
}

export async function pauseCampusBatch(jobId: string): Promise<void> {
  await (supabase.from("campus_research_jobs" as never) as any).update({ status: "paused" }).eq("id", jobId);
}
export async function resumeCampusBatch(jobId: string): Promise<void> {
  await (supabase.from("campus_research_jobs" as never) as any).update({ status: "running" }).eq("id", jobId);
  supabase.functions.invoke("run-campus-batch", { body: { job_id: jobId, batch_size: 3 } }).catch(() => {});
}
export async function cancelCampusBatch(jobId: string): Promise<void> {
  await (supabase.from("campus_research_jobs" as never) as any)
    .update({ status: "canceled", finished_at: new Date().toISOString() })
    .eq("id", jobId);
}

/** Retry failed items (all if itemIds omitted). */
export async function retryCampusBatchItems(jobId: string, itemIds?: string[]): Promise<void> {
  let updater = (supabase.from("campus_research_job_items" as never) as any)
    .update({ status: "pending", error: null, failed_step: null })
    .eq("job_id", jobId)
    .eq("status", "failed");
  if (itemIds && itemIds.length) updater = updater.in("id", itemIds);
  await updater;
  await (supabase.from("campus_research_jobs" as never) as any)
    .update({ status: "running", finished_at: null })
    .eq("id", jobId);
  supabase.functions.invoke("run-campus-batch", { body: { job_id: jobId, batch_size: 3 } }).catch(() => {});
}

/** Manual tick to kick the worker. */
export async function tickCampusBatch(jobId?: string): Promise<void> {
  await supabase.functions.invoke("run-campus-batch", {
    body: jobId ? { job_id: jobId, batch_size: 3 } : { batch_size: 3 },
  });
}

// ============================================================
// Course Availability Engine (Phase 4)
// Global defaults live on outreach_settings (singleton row).
// Per-campus overrides live in campus_course_availability — one row
// per (campus, course_family). A NULL tutoring_availability means
// "inherit the global default" for that family.
// ============================================================

export type CourseFamily = "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2";
export type TutoringAvailability = "available" | "waitlist" | "unavailable";
export type TextbookMatchStatus = "matched" | "likely_match" | "not_matched" | "not_offered" | "unknown";

export const COURSE_FAMILIES: { key: CourseFamily; label: string; shortLabel: string }[] = [
  { key: "intro_1", label: "Intro 1 — Financial Accounting Principles", shortLabel: "Intro 1" },
  { key: "intro_2", label: "Intro 2 — Managerial Accounting Principles", shortLabel: "Intro 2" },
  { key: "intermediate_1", label: "Intermediate Accounting I", shortLabel: "IA1" },
  { key: "intermediate_2", label: "Intermediate Accounting II", shortLabel: "IA2" },
];

export interface CourseFamilyDefaults {
  intro_1: TutoringAvailability;
  intro_2: TutoringAvailability;
  intermediate_1: TutoringAvailability;
  intermediate_2: TutoringAvailability;
}

export interface CampusCourseAvailability {
  id: string;
  campus_id: string;
  course_family: CourseFamily;
  textbook_match_status: TextbookMatchStatus;
  /** NULL = inherit global default. */
  tutoring_availability: TutoringAvailability | null;
  requires_syllabus_review: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EffectiveCourseAvailability {
  family: CourseFamily;
  effective: TutoringAvailability;
  override: TutoringAvailability | null;
  textbook_match_status: TextbookMatchStatus;
  requires_syllabus_review: boolean;
}

const SETTINGS_DEFAULTS: CourseFamilyDefaults = {
  intro_1: "available",
  intro_2: "available",
  intermediate_1: "waitlist",
  intermediate_2: "waitlist",
};

/** Fetch the singleton settings row (or sensible defaults if it isn't readable). */
export async function getCourseFamilyDefaults(): Promise<CourseFamilyDefaults> {
  const { data } = await (supabase.from("outreach_settings" as never) as any)
    .select(
      "intro_1_availability,intro_2_availability,intermediate_1_availability,intermediate_2_availability",
    )
    .eq("id", 1)
    .maybeSingle();
  const row = (data ?? {}) as Partial<Record<string, TutoringAvailability>>;
  return {
    intro_1: row.intro_1_availability ?? SETTINGS_DEFAULTS.intro_1,
    intro_2: row.intro_2_availability ?? SETTINGS_DEFAULTS.intro_2,
    intermediate_1: row.intermediate_1_availability ?? SETTINGS_DEFAULTS.intermediate_1,
    intermediate_2: row.intermediate_2_availability ?? SETTINGS_DEFAULTS.intermediate_2,
  };
}

/** Update a single global default. */
export async function updateCourseFamilyDefault(
  family: CourseFamily,
  value: TutoringAvailability,
): Promise<void> {
  const patch: Record<string, unknown> = {
    [`${family}_availability`]: value,
    updated_at: new Date().toISOString(),
  };
  const { error } = await (supabase.from("outreach_settings" as never) as any)
    .update(patch)
    .eq("id", 1);
  if (error) throw error;
}

function mapAvailabilityRow(row: any): CampusCourseAvailability {
  return {
    id: row.id,
    campus_id: row.campus_id,
    course_family: row.course_family as CourseFamily,
    textbook_match_status: (row.textbook_match_status ?? "unknown") as TextbookMatchStatus,
    tutoring_availability: (row.tutoring_availability ?? null) as TutoringAvailability | null,
    requires_syllabus_review: !!row.requires_syllabus_review,
    notes: row.notes ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Per-campus override rows (may be empty — missing rows mean "inherit"). */
export async function getCampusCourseAvailability(
  campusId: string,
): Promise<CampusCourseAvailability[]> {
  const { data, error } = await supabase
    .from("campus_course_availability" as never)
    .select("*")
    .eq("campus_id", campusId);
  if (error) throw error;
  return ((data ?? []) as any[]).map(mapAvailabilityRow);
}

/** Upsert the override row for one (campus, family). */
export async function upsertCampusCourseAvailability(
  campusId: string,
  family: CourseFamily,
  patch: Partial<Omit<CampusCourseAvailability, "id" | "campus_id" | "course_family" | "created_at" | "updated_at">>,
): Promise<void> {
  const row: Record<string, unknown> = {
    campus_id: campusId,
    course_family: family,
  };
  if ("textbook_match_status" in patch) row.textbook_match_status = patch.textbook_match_status;
  if ("tutoring_availability" in patch) row.tutoring_availability = patch.tutoring_availability;
  if ("requires_syllabus_review" in patch) row.requires_syllabus_review = !!patch.requires_syllabus_review;
  if ("notes" in patch) row.notes = patch.notes;
  const { error } = await (supabase.from("campus_course_availability" as never) as any)
    .upsert(row, { onConflict: "campus_id,course_family" });
  if (error) throw error;
}

/** Merge global defaults with per-campus overrides into the effective view. */
export async function getEffectiveCourseAvailability(
  campusId: string,
): Promise<EffectiveCourseAvailability[]> {
  const [defaults, rows] = await Promise.all([
    getCourseFamilyDefaults(),
    getCampusCourseAvailability(campusId),
  ]);
  const byFamily = new Map(rows.map((r) => [r.course_family, r]));
  return COURSE_FAMILIES.map(({ key }) => {
    const r = byFamily.get(key);
    const override = r?.tutoring_availability ?? null;
    return {
      family: key,
      effective: override ?? defaults[key],
      override,
      textbook_match_status: r?.textbook_match_status ?? "unknown",
      requires_syllabus_review: !!r?.requires_syllabus_review,
    };
  });
}

// ----- Course-level waitlist submissions (public landing page) -----

export interface CourseWaitlistInput {
  campus_id: string;
  course_family: CourseFamily;
  name: string;
  email: string;
  phone?: string | null;
  school?: string | null;
  course?: string | null;
  notes?: string | null;
  syllabus_file?: File | null;
}

/** Upload a syllabus to the private `course-syllabi` bucket and write the waitlist row. */
export async function submitCourseWaitlist(input: CourseWaitlistInput): Promise<void> {
  let syllabus_file_path: string | null = null;
  if (input.syllabus_file) {
    const f = input.syllabus_file;
    const safeName = f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${input.campus_id}/${input.course_family}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from("course-syllabi")
      .upload(path, f, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    syllabus_file_path = path;
  }
  const row: Record<string, unknown> = {
    campus_id: input.campus_id,
    course_family: input.course_family,
    name: input.name.trim() || null,
    email: input.email.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    course: input.course?.trim() || null,
    notes: input.notes?.trim() || null,
    syllabus_file_path,
  };
  const { error } = await (supabase.from("outreach_waitlist_signups" as never) as any).insert(row);
  if (error) throw error;
}


// ============================================================
// Campus Lead Stats — powers <CampusLeadsStatsPanel />
// Aggregates client-side for now; volumes are small (~10k each).
// Keep server-translatable: pure functions + paginated reads.
// ============================================================

import type {
  LeadFilters,
  CourseFamilyKey,
  SeasonKey,
} from "@/components/outreach/filters/LeadFilterBar";
import {
  ALL_FAMILIES,
  ALL_SEASONS,
  termToSeason,
} from "@/components/outreach/filters/LeadFilterBar";
// (Campus type already imported at top of file.)

const STATS_PAGE = 1000;
const HIGH_CONFIDENCE = 0.8;

interface RawLeadRow {
  id: string;
  campus_id: string;
  confidence: number | null;
  is_phd: boolean;
  is_cpa: boolean;
  status: string | null;
  teaches_intro_1: boolean;
  teaches_intro_2: boolean;
  teaches_intermediate_1: boolean;
  teaches_intermediate_2: boolean;
  created_at: string;
}

interface RawSectionRow {
  id: string;
  campus_id: string;
  course_family: string | null;
  term: string | null;
  created_at: string;
}

interface RawImportedLeadRow {
  id: string;
  campus_id: string | null;
  school_id: string | null;
  created_at: string;
}

async function fetchAllRows<T>(
  table: string,
  columns: string,
  opts: { excludeArchived?: boolean } = {},
): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    let q: any = supabase
      .from(table as never)
      .select(columns);
    if (opts.excludeArchived) q = q.is("archived_at", null);
    q = q.range(from, from + STATS_PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < STATS_PAGE) break;
    from += STATS_PAGE;
  }
  return out;
}

export interface CampusLeadStats {
  suggestedLeadCount: number;
  importedLeadCount: number;
  highConfidenceLeadCount: number;
  campusCount: number;
  sectionCount: number;
  intro1InstructorCount: number;
  intro2InstructorCount: number;
  ia1InstructorCount: number;
  ia2InstructorCount: number;
  cpaCount: number;
  phdCount: number;
  newLeadCount24h: number;
  topCampusesByLeadCount: Array<{ campus_id: string; name: string; count: number }>;
  seasonCounts: Record<SeasonKey, number>;
  courseFamilyCounts: Record<CourseFamilyKey, { all: number; high: number }>;
  avgSectionsPerCampus: number;
  coveragePct: number;
  totalCampusCount: number;
}

export interface LeadFilterOptions {
  availableSeasons: SeasonKey[];
  availableTerms: string[];
}

/** Distinct terms / available seasons across all sections. */
export async function fetchAvailableLeadFilterOptions(): Promise<LeadFilterOptions> {
  const { data, error } = await supabase
    .from("campus_course_sections" as never)
    .select("term")
    .not("term", "is", null)
    .limit(5000);
  if (error) throw error;
  const terms = new Set<string>();
  const seasons = new Set<SeasonKey>();
  for (const r of (data ?? []) as Array<{ term: string | null }>) {
    if (!r.term) continue;
    terms.add(r.term);
    const s = termToSeason(r.term);
    if (s) seasons.add(s);
  }
  return {
    availableSeasons: ALL_SEASONS.filter((s) => seasons.has(s)),
    availableTerms: [...terms].sort(),
  };
}

/**
 * Fetches the three source tables and aggregates against `filters`.
 * `campuses` is needed for name resolution + textbook-match filter.
 */
export async function fetchCampusLeadStats(
  filters: LeadFilters,
  campuses: Campus[],
): Promise<CampusLeadStats> {
  const [leads, sections, imported, supportedFamilies] = await Promise.all([
    fetchAllRows<RawLeadRow>(
      "campus_lead_suggestions",
      "id,campus_id,confidence,is_phd,is_cpa,status,teaches_intro_1,teaches_intro_2,teaches_intermediate_1,teaches_intermediate_2,created_at",
      { excludeArchived: true },
    ),
    fetchAllRows<RawSectionRow>(
      "campus_course_sections",
      "id,campus_id,course_family,term,created_at",
    ),
    fetchAllRows<RawImportedLeadRow>(
      "outreach_leads",
      "id,campus_id,school_id,created_at",
    ),
    getSupportedTextbookFamilies(),
  ]);
  return aggregateCampusLeadStats({ leads, sections, imported, filters, campuses, supportedFamilies });
}

function aggregateCampusLeadStats(args: {
  leads: RawLeadRow[];
  sections: RawSectionRow[];
  imported: RawImportedLeadRow[];
  filters: LeadFilters;
  campuses: Campus[];
  supportedFamilies: SupportedTextbookFamily[];
}): CampusLeadStats {
  const { leads, sections, imported, filters, campuses, supportedFamilies } = args;
  const campusSet = filters.campusIds.length ? new Set(filters.campusIds) : null;
  const campusById = new Map(campuses.map((c) => [c.id, c]));

  // Campuses that satisfy the textbook-match filter — uses supported_textbook_families.
  const textbookCampusIds = filters.textbookMatchOnly
    ? new Set(
        campuses
          .filter((c) => campusHasSupportedTextbook(c, supportedFamilies, ["intro_1", "intro_2"]))
          .map((c) => c.id),
      )
    : null;

  const familyAllowed = (fam: string | null) => {
    if (filters.courseFamilies.length === ALL_FAMILIES.length) return true;
    if (!fam) return false;
    return (filters.courseFamilies as string[]).includes(fam);
  };
  const seasonAllowed = (term: string | null) => {
    if (filters.seasons.length === ALL_SEASONS.length) return true;
    const s = termToSeason(term);
    return s ? filters.seasons.includes(s) : false;
  };
  const leadFamilyMatches = (l: RawLeadRow) => {
    if (filters.courseFamilies.length === ALL_FAMILIES.length) return true;
    if (filters.courseFamilies.length === 0) return false;
    return filters.courseFamilies.some((f) => (l as any)[`teaches_${f}`] === true);
  };

  // Filter suggested leads
  const fLeads = leads.filter((l) => {
    if (campusSet && !campusSet.has(l.campus_id)) return false;
    if (textbookCampusIds && !textbookCampusIds.has(l.campus_id)) return false;
    if ((l.confidence ?? 0) < filters.minConfidence) return false;
    if (filters.teachingOnly && !(
      l.teaches_intro_1 || l.teaches_intro_2 ||
      l.teaches_intermediate_1 || l.teaches_intermediate_2
    )) return false;
    if (!leadFamilyMatches(l)) return false;
    return true;
  });

  // Filter sections
  const fSections = sections.filter((s) => {
    if (campusSet && !campusSet.has(s.campus_id)) return false;
    if (textbookCampusIds && !textbookCampusIds.has(s.campus_id)) return false;
    if (!familyAllowed(s.course_family)) return false;
    if (!seasonAllowed(s.term)) return false;
    return true;
  });

  // Filter imported leads (only campus-scoped filters apply)
  const fImported = imported.filter((l) => {
    const cid = l.campus_id ?? l.school_id;
    if (!cid) return campusSet ? false : true;
    if (campusSet && !campusSet.has(cid)) return false;
    if (textbookCampusIds && !textbookCampusIds.has(cid)) return false;
    return true;
  });

  const leadCampuses = new Set(fLeads.map((l) => l.campus_id));
  const sectionCampuses = new Set(fSections.map((s) => s.campus_id));
  const allCovered = new Set<string>([...leadCampuses, ...sectionCampuses]);

  const courseFamilyCounts: Record<CourseFamilyKey, { all: number; high: number }> = {
    intro_1: { all: 0, high: 0 },
    intro_2: { all: 0, high: 0 },
    intermediate_1: { all: 0, high: 0 },
    intermediate_2: { all: 0, high: 0 },
  };
  let phdCount = 0, cpaCount = 0, highConfidenceLeadCount = 0;
  for (const l of fLeads) {
    const isHigh = (l.confidence ?? 0) >= HIGH_CONFIDENCE;
    if (isHigh) highConfidenceLeadCount++;
    if (l.is_phd) phdCount++;
    if (l.is_cpa) cpaCount++;
    for (const f of ALL_FAMILIES) {
      if ((l as any)[`teaches_${f}`]) {
        courseFamilyCounts[f].all++;
        if (isHigh) courseFamilyCounts[f].high++;
      }
    }
  }

  const seasonCounts: Record<SeasonKey, number> =
    { fall: 0, spring: 0, summer: 0, winter: 0 };
  for (const s of fSections) {
    const sk = termToSeason(s.term);
    if (sk) seasonCounts[sk]++;
  }

  const perCampus = new Map<string, number>();
  for (const l of fLeads) perCampus.set(l.campus_id, (perCampus.get(l.campus_id) ?? 0) + 1);
  const topCampusesByLeadCount = [...perCampus.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([campus_id, count]) => ({
      campus_id,
      name: campusById.get(campus_id)?.school_name ?? "Unknown campus",
      count,
    }));

  const now = Date.now();
  const newLeadCount24h = fLeads.filter(
    (l) => now - new Date(l.created_at).getTime() < 86_400_000,
  ).length;

  const totalCampusCount = campuses.filter((c) => !c.archived).length;
  return {
    suggestedLeadCount: fLeads.length,
    importedLeadCount: fImported.length,
    highConfidenceLeadCount,
    campusCount: leadCampuses.size,
    sectionCount: fSections.length,
    intro1InstructorCount: courseFamilyCounts.intro_1.all,
    intro2InstructorCount: courseFamilyCounts.intro_2.all,
    ia1InstructorCount: courseFamilyCounts.intermediate_1.all,
    ia2InstructorCount: courseFamilyCounts.intermediate_2.all,
    cpaCount,
    phdCount,
    newLeadCount24h,
    topCampusesByLeadCount,
    seasonCounts,
    courseFamilyCounts,
    avgSectionsPerCampus: sectionCampuses.size
      ? Math.round(fSections.length / sectionCampuses.size)
      : 0,
    coveragePct: totalCampusCount
      ? Math.round((allCovered.size / totalCampusCount) * 100)
      : 0,
    totalCampusCount,
  };
}

// ============================================================
// Detailed report — same filters, returns row-level data for modal
// ============================================================

export interface CampusReportRow {
  campus_id: string;
  name: string;
  state: string | null;
  suggestedLeadCount: number;
  importedLeadCount: number;
  sectionCount: number;
  hasTextbookIsbn: boolean;
  lastResearchedAt: string | null;
}

export interface LeadReportRow {
  id: string;
  campus_id: string;
  campusName: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  confidence: number | null;
  is_phd: boolean;
  is_cpa: boolean;
  teaches_intro_1: boolean;
  teaches_intro_2: boolean;
  teaches_intermediate_1: boolean;
  teaches_intermediate_2: boolean;
  source_url: string | null;
  status: string | null;
  imported: boolean;
}

export interface SectionReportRow {
  id: string;
  campus_id: string;
  campusName: string;
  course_family: string | null;
  course_code: string | null;
  course_title: string | null;
  term: string | null;
  section_number: string | null;
  instructor_name: string | null;
  enrollment_current: number | null;
  enrollment_capacity: number | null;
  source_url: string | null;
}

export interface CampusLeadReport {
  campuses: CampusReportRow[];
  leads: LeadReportRow[];
  sections: SectionReportRow[];
}

interface RawLeadFullRow extends RawLeadRow {
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  source_url: string | null;
}

interface RawSectionFullRow extends RawSectionRow {
  course_code: string | null;
  course_title: string | null;
  section_number: string | null;
  instructor_name: string | null;
  enrollment_current: number | null;
  enrollment_capacity: number | null;
  source_url: string | null;
}

export async function fetchCampusLeadReport(
  filters: LeadFilters,
  campuses: Campus[],
): Promise<CampusLeadReport> {
  const [leads, sections, imported, supportedFamilies] = await Promise.all([
    fetchAllRows<RawLeadFullRow>(
      "campus_lead_suggestions",
      "id,campus_id,first_name,last_name,title,email,confidence,is_phd,is_cpa,status,teaches_intro_1,teaches_intro_2,teaches_intermediate_1,teaches_intermediate_2,source_url,created_at",
      { excludeArchived: true },
    ),
    fetchAllRows<RawSectionFullRow>(
      "campus_course_sections",
      "id,campus_id,course_family,course_code,course_title,term,section_number,instructor_name,enrollment_current,enrollment_capacity,source_url,created_at",
    ),
    fetchAllRows<RawImportedLeadRow>(
      "outreach_leads",
      "id,campus_id,school_id,created_at",
    ),
    getSupportedTextbookFamilies(),
  ]);

  const campusById = new Map(campuses.map((c) => [c.id, c]));
  const campusSet = filters.campusIds.length ? new Set(filters.campusIds) : null;

  const textbookCampusIds = filters.textbookMatchOnly
    ? new Set(
        campuses
          .filter((c) => campusHasSupportedTextbook(c, supportedFamilies, ["intro_1", "intro_2"]))
          .map((c) => c.id),
      )
    : null;

  const familyAllowed = (fam: string | null) => {
    if (filters.courseFamilies.length === ALL_FAMILIES.length) return true;
    if (!fam) return false;
    return (filters.courseFamilies as string[]).includes(fam);
  };
  const seasonAllowed = (term: string | null) => {
    if (filters.seasons.length === ALL_SEASONS.length) return true;
    const s = termToSeason(term);
    return s ? filters.seasons.includes(s) : false;
  };
  const leadFamilyMatches = (l: RawLeadFullRow) => {
    if (filters.courseFamilies.length === ALL_FAMILIES.length) return true;
    if (filters.courseFamilies.length === 0) return false;
    return filters.courseFamilies.some((f) => (l as any)[`teaches_${f}`] === true);
  };

  const importedByCampus = new Map<string, number>();
  for (const r of imported) {
    const cid = r.campus_id ?? r.school_id;
    if (!cid) continue;
    importedByCampus.set(cid, (importedByCampus.get(cid) ?? 0) + 1);
  }

  const fLeads = leads.filter((l) => {
    if (campusSet && !campusSet.has(l.campus_id)) return false;
    if (textbookCampusIds && !textbookCampusIds.has(l.campus_id)) return false;
    if ((l.confidence ?? 0) < filters.minConfidence) return false;
    if (filters.teachingOnly && !(
      l.teaches_intro_1 || l.teaches_intro_2 ||
      l.teaches_intermediate_1 || l.teaches_intermediate_2
    )) return false;
    if (!leadFamilyMatches(l)) return false;
    return true;
  });

  const fSections = sections.filter((s) => {
    if (campusSet && !campusSet.has(s.campus_id)) return false;
    if (textbookCampusIds && !textbookCampusIds.has(s.campus_id)) return false;
    if (!familyAllowed(s.course_family)) return false;
    if (!seasonAllowed(s.term)) return false;
    return true;
  });

  const perCampusLeads = new Map<string, number>();
  const perCampusSections = new Map<string, number>();
  const perCampusLastResearched = new Map<string, string>();
  for (const l of fLeads) {
    perCampusLeads.set(l.campus_id, (perCampusLeads.get(l.campus_id) ?? 0) + 1);
    const prev = perCampusLastResearched.get(l.campus_id);
    if (!prev || l.created_at > prev) perCampusLastResearched.set(l.campus_id, l.created_at);
  }
  for (const s of fSections) {
    perCampusSections.set(s.campus_id, (perCampusSections.get(s.campus_id) ?? 0) + 1);
    const prev = perCampusLastResearched.get(s.campus_id);
    if (!prev || s.created_at > prev) perCampusLastResearched.set(s.campus_id, s.created_at);
  }

  const campusIds = new Set<string>([
    ...perCampusLeads.keys(),
    ...perCampusSections.keys(),
  ]);

  const campusesOut: CampusReportRow[] = [...campusIds].map((cid) => {
    const c = campusById.get(cid);
    const hasSupportedTextbook = !!c && campusHasSupportedTextbook(c, supportedFamilies, ["intro_1", "intro_2"]);
    return {
      campus_id: cid,
      name: c?.school_name ?? "Unknown campus",
      state: c?.state ?? null,
      suggestedLeadCount: perCampusLeads.get(cid) ?? 0,
      importedLeadCount: importedByCampus.get(cid) ?? 0,
      sectionCount: perCampusSections.get(cid) ?? 0,
      hasTextbookIsbn: hasSupportedTextbook,
      lastResearchedAt: perCampusLastResearched.get(cid) ?? null,
    };
  }).sort((a, b) => b.suggestedLeadCount - a.suggestedLeadCount);

  const leadsOut: LeadReportRow[] = fLeads.map((l) => ({
    id: l.id,
    campus_id: l.campus_id,
    campusName: campusById.get(l.campus_id)?.school_name ?? "Unknown",
    first_name: l.first_name,
    last_name: l.last_name,
    title: l.title,
    email: l.email,
    confidence: l.confidence,
    is_phd: l.is_phd,
    is_cpa: l.is_cpa,
    teaches_intro_1: l.teaches_intro_1,
    teaches_intro_2: l.teaches_intro_2,
    teaches_intermediate_1: l.teaches_intermediate_1,
    teaches_intermediate_2: l.teaches_intermediate_2,
    source_url: l.source_url,
    status: l.status,
    imported: (importedByCampus.get(l.campus_id) ?? 0) > 0,
  }));

  const sectionsOut: SectionReportRow[] = fSections.map((s) => ({
    id: s.id,
    campus_id: s.campus_id,
    campusName: campusById.get(s.campus_id)?.school_name ?? "Unknown",
    course_family: s.course_family,
    course_code: s.course_code,
    course_title: s.course_title,
    term: s.term,
    section_number: s.section_number,
    instructor_name: s.instructor_name,
    enrollment_current: s.enrollment_current,
    enrollment_capacity: s.enrollment_capacity,
    source_url: s.source_url,
  }));

  return { campuses: campusesOut, leads: leadsOut, sections: sectionsOut };
}

// ============================================================
// Campaigns (Phase 2 — snapshot model, no sending yet)
// ============================================================

export type CampaignType = "cold_sequence" | "broadcast";
export type CampaignStatus =
  | "draft" | "scheduled" | "running" | "paused" | "completed" | "cancelled";
export const ACTIVE_CAMPAIGN_STATUSES: CampaignStatus[] =
  ["draft", "scheduled", "running", "paused"];

export interface CampaignAudienceFilters {
  // mirrors LeadFilters + per-builder extras
  courseFamilies?: string[];
  seasons?: string[];
  campusIds?: string[];                    // from LeadFilters
  selectedCampusIds?: string[];            // from builder checkbox list
  leadTypes?: string[];                    // future use
  teachingOnly?: boolean;
  includeOnlyTeachingAssignments?: boolean;
  textbookMatchOnly?: boolean;
  minConfidence?: number;
  /** Which research run to pull suggestions from. Default: 'clean_professor_only'. */
  researchMode?: "all" | "broad" | "clean_professor_only";
  /** Restrict to outreach_leads whose title_tags overlap this set. */
  titleTags?: string[];
}

export interface CampaignAudiencePreviewLead {
  outreach_lead_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  campus_id: string | null;
  campus_name: string | null;
  lead_type: string | null;
  course_family: string | null;
}

export interface CampaignAudiencePreview {
  totalLeads: number;
  totalCampuses: number;
  estimatedDaysAt50PerDay: number;
  first25Leads: CampaignAudiencePreviewLead[];
  excludedAlreadyInCampaignCount: number;
  /** Full ID list so the create step can snapshot exactly what was previewed. */
  eligibleLeadIds: string[];
}

interface OutreachLeadRow {
  id: string;
  campus_id: string | null;
  school_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  is_phd: boolean | null;
  status: string | null;
}

interface SuggestionMatchRow {
  campus_id: string;
  email: string | null;
  lead_type: string | null;
  confidence: number | null;
  teaches_intro_1: boolean | null;
  teaches_intro_2: boolean | null;
  teaches_intermediate_1: boolean | null;
  teaches_intermediate_2: boolean | null;
}

/** Returns the set of outreach_lead_ids already enrolled in an active cold campaign. */
async function fetchAlreadyEnrolledLeadIds(): Promise<Set<string>> {
  const { data: campaigns, error: cErr } = await supabase
    .from("outreach_campaigns" as never)
    .select("id")
    .eq("campaign_type", "cold_sequence")
    .in("status", ACTIVE_CAMPAIGN_STATUSES);
  if (cErr) throw cErr;
  const ids = ((campaigns ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (!ids.length) return new Set();
  const { data: rows, error: lErr } = await supabase
    .from("outreach_campaign_leads" as never)
    .select("outreach_lead_id")
    .in("campaign_id", ids);
  if (lErr) throw lErr;
  return new Set(
    ((rows ?? []) as Array<{ outreach_lead_id: string }>).map((r) => r.outreach_lead_id),
  );
}

/**
 * Build a campaign preview from current outreach_leads.
 * Filters that depend on suggestion-only fields (teaching evidence, family,
 * confidence) are best-effort matched against campus_lead_suggestions by
 * (campus_id, lower(email)).
 */
export async function previewCampaignAudience(
  filters: CampaignAudienceFilters,
  campuses: Array<{ id: string; school_name: string }>,
): Promise<CampaignAudiencePreview> {
  // Effective campus filter = intersection of LeadFilter.campusIds and selectedCampusIds.
  const filterCampusIds = filters.campusIds && filters.campusIds.length ? filters.campusIds : null;
  const builderCampusIds = filters.selectedCampusIds && filters.selectedCampusIds.length
    ? filters.selectedCampusIds : null;
  let effectiveCampusIds: string[] | null = null;
  if (filterCampusIds && builderCampusIds) {
    const bSet = new Set(builderCampusIds);
    effectiveCampusIds = filterCampusIds.filter((id) => bSet.has(id));
  } else {
    effectiveCampusIds = filterCampusIds ?? builderCampusIds;
  }

  // Textbook-match filter: limit to campuses with at least one ISBN recorded.
  // Caller passes a simple campuses list, so we approximate by fetching the
  // textbook json column up-front.
  let textbookCampusIds: Set<string> | null = null;
  if (filters.textbookMatchOnly) {
    const [{ data: tb, error: tbErr }, supportedFamilies] = await Promise.all([
      supabase.from("campuses").select("id,course_family_textbooks_json"),
      getSupportedTextbookFamilies(),
    ]);
    if (tbErr) throw tbErr;
    textbookCampusIds = new Set(
      ((tb ?? []) as Array<{ id: string; course_family_textbooks_json: unknown }>)
        .filter((c) => {
          // Reuse the supported-family matcher: campus passes if Intro 1 OR Intro 2 maps to a supported family.
          const fake = { id: c.id, course_family_textbooks_json: c.course_family_textbooks_json } as unknown as Campus;
          return campusHasSupportedTextbook(fake, supportedFamilies, ["intro_1", "intro_2"]);
        })
        .map((c) => c.id),
    );
  }

  // Pull leads (paginated).
  const leads: OutreachLeadRow[] = [];
  let from = 0;
  for (let i = 0; i < 50; i++) {
    let q: any = supabase
      .from("outreach_leads")
      .select("id,campus_id,school_id,email,first_name,last_name,is_phd,status")
      .range(from, from + 999);
    if (effectiveCampusIds) q = q.in("campus_id", effectiveCampusIds);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as unknown as OutreachLeadRow[];
    leads.push(...rows);
    if (rows.length < 1000) break;
    from += 1000;
  }

  // Default the campaign builder to clean professor-only suggestions.
  const researchMode = filters.researchMode ?? "clean_professor_only";

  // We ALWAYS need the suggestion lookup now because the default
  // research-mode filter restricts the eligible-lead set to whatever the
  // selected research run produced.
  const needsSuggestionLookup =
    researchMode !== "all" ||
    !!filters.teachingOnly ||
    !!filters.includeOnlyTeachingAssignments ||
    (typeof filters.minConfidence === "number" && filters.minConfidence > 0) ||
    (filters.courseFamilies && filters.courseFamilies.length > 0 && filters.courseFamilies.length < 4);

  let suggestionByKey = new Map<string, SuggestionMatchRow>();
  if (needsSuggestionLookup) {
    let sq: any = supabase
      .from("campus_lead_suggestions" as never)
      .select("campus_id,email,lead_type,confidence,teaches_intro_1,teaches_intro_2,teaches_intermediate_1,teaches_intermediate_2,research_mode")
      .is("archived_at", null);
    if (researchMode !== "all") sq = sq.eq("research_mode", researchMode);
    const { data: sugg, error: sErr } = await sq.limit(20000);
    if (sErr) throw sErr;
    for (const r of (sugg ?? []) as SuggestionMatchRow[]) {
      if (!r.email || !r.campus_id) continue;
      suggestionByKey.set(`${r.campus_id}::${r.email.toLowerCase()}`, r);
    }
  }

  const alreadyEnrolled = await fetchAlreadyEnrolledLeadIds();

  const familySet = filters.courseFamilies && filters.courseFamilies.length
    ? new Set(filters.courseFamilies) : null;
  const wantTeaching = !!(filters.teachingOnly || filters.includeOnlyTeachingAssignments);
  const minConfidence = filters.minConfidence ?? 0;

  let excludedAlreadyInCampaignCount = 0;
  const eligible: Array<{ row: OutreachLeadRow; family: string | null; leadType: string | null }> = [];

  for (const l of leads) {
    if (!l.email) continue;
    const campusId = l.campus_id ?? l.school_id;
    if (textbookCampusIds && (!campusId || !textbookCampusIds.has(campusId))) continue;

    let family: string | null = null;
    let leadType: string | null = null;
    if (needsSuggestionLookup || true) {
      const match = campusId
        ? suggestionByKey.get(`${campusId}::${l.email.toLowerCase()}`)
        : undefined;
      if (match) {
        leadType = match.lead_type ?? null;
        // Best-effort family derivation (pick first true flag).
        if (match.teaches_intro_1) family = "intro_1";
        else if (match.teaches_intro_2) family = "intro_2";
        else if (match.teaches_intermediate_1) family = "intermediate_1";
        else if (match.teaches_intermediate_2) family = "intermediate_2";
        if (wantTeaching && !family) continue;
        if (minConfidence > 0 && (match.confidence ?? 0) < minConfidence) continue;
        if (familySet) {
          const teachesAny = ["intro_1","intro_2","intermediate_1","intermediate_2"]
            .some((f) => familySet.has(f) && (match as any)[`teaches_${f}`]);
          if (!teachesAny) continue;
        }
      } else {
        if (wantTeaching) continue;
        if (minConfidence > 0) continue;
        if (familySet && familySet.size < 4) continue;
      }
    }

    if (alreadyEnrolled.has(l.id)) {
      excludedAlreadyInCampaignCount++;
      continue;
    }

    eligible.push({ row: l, family, leadType });
  }

  const campusNameById = new Map(campuses.map((c) => [c.id, c.school_name]));
  const totalLeads = eligible.length;
  const totalCampuses = new Set(eligible.map((e) => e.row.campus_id ?? e.row.school_id ?? "")).size;
  const estimatedDaysAt50PerDay = Math.ceil(totalLeads / 50);

  const first25Leads: CampaignAudiencePreviewLead[] = eligible.slice(0, 25).map((e) => {
    const cid = e.row.campus_id ?? e.row.school_id;
    return {
      outreach_lead_id: e.row.id,
      email: e.row.email!,
      first_name: e.row.first_name,
      last_name: e.row.last_name,
      campus_id: cid,
      campus_name: cid ? (campusNameById.get(cid) ?? null) : null,
      lead_type: e.leadType,
      course_family: e.family,
    };
  });

  return {
    totalLeads,
    totalCampuses,
    estimatedDaysAt50PerDay,
    first25Leads,
    excludedAlreadyInCampaignCount,
    eligibleLeadIds: eligible.map((e) => e.row.id),
  };
}

/**
 * Snapshot a campaign from a previewed audience. Inserts an
 * outreach_campaigns row (status='draft') plus one outreach_campaign_leads
 * row per selected lead. Does NOT schedule or send anything.
 */
export async function createCampaignFromPreview(input: {
  name: string;
  dailyLimit: number;
  filters: CampaignAudienceFilters;
  selectedLeadIds: string[];
  createdBy?: string | null;
}): Promise<{ campaign_id: string; total_leads: number; total_campuses: number }> {
  const dailyLimit = input.dailyLimit > 0 ? input.dailyLimit : 50;

  // Hydrate snapshot from outreach_leads.
  const rows: OutreachLeadRow[] = [];
  for (let i = 0; i < input.selectedLeadIds.length; i += 1000) {
    const chunk = input.selectedLeadIds.slice(i, i + 1000);
    const { data, error } = await supabase
      .from("outreach_leads")
      .select("id,campus_id,school_id,email,first_name,last_name,is_phd,status")
      .in("id", chunk);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as OutreachLeadRow[]));
  }

  // Optional family/type enrichment (best-effort). Honors the campaign's
  // research-mode filter so enrichment matches the audience that was previewed.
  const enrichMode = input.filters.researchMode ?? "clean_professor_only";
  let enrichQ: any = supabase
    .from("campus_lead_suggestions" as never)
    .select("campus_id,email,lead_type,teaches_intro_1,teaches_intro_2,teaches_intermediate_1,teaches_intermediate_2")
    .is("archived_at", null);
  if (enrichMode !== "all") enrichQ = enrichQ.eq("research_mode", enrichMode);
  const { data: sugg } = await enrichQ.limit(20000);
  const sMap = new Map<string, SuggestionMatchRow>();
  for (const r of (sugg ?? []) as SuggestionMatchRow[]) {
    if (r.email && r.campus_id) sMap.set(`${r.campus_id}::${r.email.toLowerCase()}`, r);
  }

  const totalCampuses = new Set(rows.map((r) => r.campus_id ?? r.school_id ?? "")).size;
  const totalLeads = rows.length;
  const estimatedDays = Math.ceil(totalLeads / dailyLimit);

  const { data: campaign, error: cErr } = await (supabase
    .from("outreach_campaigns" as never) as any)
    .insert({
      name: input.name.trim(),
      campaign_type: "cold_sequence",
      status: "draft",
      audience_filters: input.filters,
      total_leads: totalLeads,
      total_campuses: totalCampuses,
      daily_limit: dailyLimit,
      estimated_days: estimatedDays,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single();
  if (cErr) throw cErr;
  const campaignId = (campaign as { id: string }).id;

  // Insert campaign_leads in batches.
  const leadRows = rows
    .filter((r) => !!r.email)
    .map((r) => {
      const cid = r.campus_id ?? r.school_id ?? null;
      const m = cid && r.email
        ? sMap.get(`${cid}::${r.email.toLowerCase()}`)
        : undefined;
      let family: string | null = null;
      if (m?.teaches_intro_1) family = "intro_1";
      else if (m?.teaches_intro_2) family = "intro_2";
      else if (m?.teaches_intermediate_1) family = "intermediate_1";
      else if (m?.teaches_intermediate_2) family = "intermediate_2";
      return {
        campaign_id: campaignId,
        outreach_lead_id: r.id,
        campus_id: cid,
        email: r.email,
        first_name: r.first_name,
        last_name: r.last_name,
        lead_type: m?.lead_type ?? null,
        course_family: family,
        status: "queued",
        sequence_step: 0,
        scheduled_send_at: null,
      };
    });

  for (let i = 0; i < leadRows.length; i += 500) {
    const chunk = leadRows.slice(i, i + 500);
    const { error: lErr } = await (supabase
      .from("outreach_campaign_leads" as never) as any).insert(chunk);
    if (lErr) throw lErr;
  }

  return { campaign_id: campaignId, total_leads: totalLeads, total_campuses: totalCampuses };
}

// ============================================================
// Phase 3 — Global daily send limit, campaign scheduling, metrics.
// ============================================================

const COLD_ACTIVE = ["draft", "scheduled", "running", "paused"] as const;

export async function fetchGlobalDailyLimit(): Promise<number> {
  const { data } = await (supabase.from("outreach_settings" as never) as any)
    .select("global_daily_send_limit").eq("id", 1).maybeSingle();
  const n = Number((data as any)?.global_daily_send_limit ?? 50);
  return Number.isFinite(n) && n > 0 ? n : 50;
}

export async function setGlobalDailyLimit(n: number): Promise<void> {
  const v = Math.max(1, Math.floor(n));
  const { error } = await (supabase.from("outreach_settings" as never) as any)
    .update({ global_daily_send_limit: v, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw error;
}

// --- Campaign list & metrics ---

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  total_leads: number;
  total_campuses: number;
  daily_limit: number;
  estimated_days: number | null;
  created_at: string;
}

export async function fetchCampaigns(): Promise<CampaignSummary[]> {
  const { data, error } = await (supabase.from("outreach_campaigns" as never) as any)
    .select("id,name,status,total_leads,total_campuses,daily_limit,estimated_days,created_at,campaign_type")
    .eq("campaign_type", "cold_sequence")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as any[]).map((c) => ({
    id: c.id, name: c.name, status: c.status,
    total_leads: Number(c.total_leads ?? 0),
    total_campuses: Number(c.total_campuses ?? 0),
    daily_limit: Number(c.daily_limit ?? 50),
    estimated_days: c.estimated_days == null ? null : Number(c.estimated_days),
    created_at: c.created_at,
  }));
}

export interface CampaignMetrics {
  campaign_id: string;
  total: number;
  queued: number;
  scheduled: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  complained: number;
  stopped: number;
  remaining: number;
  next_send_at: string | null;
  last_scheduled_at: string | null;
  estimated_completion: string | null;
}

export async function fetchCampaignMetrics(campaignId: string): Promise<CampaignMetrics> {
  const { data: cleads, error } = await (supabase.from("outreach_campaign_leads" as never) as any)
    .select("status,scheduled_send_at,outreach_lead_id")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  const rows = (cleads ?? []) as Array<{ status: string; scheduled_send_at: string | null; outreach_lead_id: string }>;
  const leadIds = rows.map((r) => r.outreach_lead_id).filter(Boolean);

  // Pull lead-level state in chunks.
  const leadStats = { sent: 0, opened: 0, clicked: 0, stopped: 0 };
  const leadById = new Map<string, { sent_at: string | null; opens_count: number; clicks_count: number; sequence_stopped_at: string | null }>();
  for (let i = 0; i < leadIds.length; i += 500) {
    const chunk = leadIds.slice(i, i + 500);
    const { data: ld } = await supabase.from("outreach_leads")
      .select("id,sent_at,opens_count,clicks_count,sequence_stopped_at")
      .in("id", chunk);
    for (const l of (ld ?? []) as any[]) {
      leadById.set(l.id, {
        sent_at: l.sent_at ?? null,
        opens_count: Number(l.opens_count ?? 0),
        clicks_count: Number(l.clicks_count ?? 0),
        sequence_stopped_at: l.sequence_stopped_at ?? null,
      });
    }
  }
  for (const id of leadIds) {
    const l = leadById.get(id);
    if (!l) continue;
    if (l.sent_at) leadStats.sent++;
    if (l.opens_count > 0) leadStats.opened++;
    if (l.clicks_count > 0) leadStats.clicked++;
    if (l.sequence_stopped_at) leadStats.stopped++;
  }

  // Event-derived stats (reply/bounce/complaint). Best-effort.
  let replied = 0, bounced = 0, complained = 0;
  try {
    for (let i = 0; i < leadIds.length; i += 500) {
      const chunk = leadIds.slice(i, i + 500);
      const { data: ev } = await (supabase.from("outreach_email_events" as never) as any)
        .select("lead_id,event_type")
        .in("lead_id", chunk);
      const byLead = new Map<string, Set<string>>();
      for (const e of (ev ?? []) as Array<{ lead_id: string; event_type: string }>) {
        const s = byLead.get(e.lead_id) ?? new Set<string>();
        s.add(e.event_type);
        byLead.set(e.lead_id, s);
      }
      for (const types of byLead.values()) {
        if (types.has("reply") || types.has("replied")) replied++;
        if (types.has("bounce") || types.has("bounced")) bounced++;
        if (types.has("complaint") || types.has("complained") || types.has("spam")) complained++;
      }
    }
  } catch { /* table may not exist */ }

  const total = rows.length;
  const scheduled = rows.filter((r) => r.status === "scheduled" || r.scheduled_send_at).length;
  const queued = rows.filter((r) => r.status === "queued" && !r.scheduled_send_at).length;
  const remaining = Math.max(0, total - leadStats.sent);
  const scheduledTimes = rows.map((r) => r.scheduled_send_at).filter(Boolean) as string[];
  scheduledTimes.sort();
  const future = scheduledTimes.find((t) => new Date(t).getTime() > Date.now()) ?? null;
  const last = scheduledTimes.length ? scheduledTimes[scheduledTimes.length - 1] : null;

  return {
    campaign_id: campaignId,
    total, queued, scheduled,
    sent: leadStats.sent, opened: leadStats.opened, clicked: leadStats.clicked,
    replied, bounced, complained, stopped: leadStats.stopped,
    remaining,
    next_send_at: future,
    last_scheduled_at: last,
    estimated_completion: last,
  };
}

// --- Schedule a draft campaign across business days, respecting global limit. ---

function nextBusinessSlot(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCHours(15, 30, 0, 0); // 9:30 AM Central during DST
  for (let i = 0; i < 14; i++) {
    const dow = out.getUTCDay();
    if (dow !== 0 && dow !== 6) return out;
    out.setUTCDate(out.getUTCDate() + 1);
  }
  return out;
}

function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

export interface ScheduleCampaignResult {
  campaign_id: string;
  scheduled: number;
  skipped_conflicts: number;
  first_send_at: string | null;
  last_send_at: string | null;
}

export async function scheduleCampaign(campaignId: string): Promise<ScheduleCampaignResult> {
  const limit = await fetchGlobalDailyLimit();

  // Verify campaign exists and is draft/paused/scheduled (re-schedulable).
  const { data: campaign, error: cErr } = await (supabase.from("outreach_campaigns" as never) as any)
    .select("id,status").eq("id", campaignId).single();
  if (cErr) throw cErr;
  if (!["draft", "paused", "scheduled"].includes((campaign as any).status)) {
    throw new Error(`Campaign is ${(campaign as any).status}; cannot schedule.`);
  }

  // Unscheduled campaign leads (queued, no send time yet).
  const { data: cleads, error: lErr } = await (supabase.from("outreach_campaign_leads" as never) as any)
    .select("id,outreach_lead_id,email")
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "scheduled"])
    .is("scheduled_send_at", null);
  if (lErr) throw lErr;
  const toSchedule = (cleads ?? []) as Array<{ id: string; outreach_lead_id: string; email: string }>;

  // Existing capacity used per day (outreach_leads.scheduled_send_at across all campaigns).
  const { data: existing } = await supabase
    .from("outreach_leads")
    .select("scheduled_send_at")
    .not("scheduled_send_at", "is", null)
    .is("sent_at", null)
    .is("sequence_stopped_at", null)
    .gte("scheduled_send_at", new Date().toISOString());
  const dayCounts = new Map<string, number>();
  for (const r of (existing ?? []) as Array<{ scheduled_send_at: string }>) {
    const k = dayKey(r.scheduled_send_at);
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
  }

  // Walk forward filling each business day up to the limit.
  let cursor = nextBusinessSlot(importSendTime());
  const updates: Array<{ campaignLeadId: string; outreachLeadId: string; sendAt: string }> = [];
  let conflicts = 0;
  for (const lead of toSchedule) {
    // Lead-level dedup: skip if already enrolled active elsewhere is enforced by DB trigger,
    // but if the trigger somehow allowed (e.g. same campaign re-schedule), allow continue.
    while (true) {
      const k = dayKey(cursor);
      const used = dayCounts.get(k) ?? 0;
      if (used >= limit) {
        cursor = nextBusinessSlot(new Date(cursor.getTime() + 24 * 3600 * 1000));
        continue;
      }
      dayCounts.set(k, used + 1);
      updates.push({ campaignLeadId: lead.id, outreachLeadId: lead.outreach_lead_id, sendAt: cursor.toISOString() });
      break;
    }
  }

  // Apply: write scheduled_send_at on both outreach_leads (so existing scheduler picks it up)
  // and outreach_campaign_leads (for campaign-side metrics).
  let scheduled = 0;
  for (const u of updates) {
    try {
      const { error: e1 } = await (supabase.from("outreach_leads") as any)
        .update({ scheduled_send_at: u.sendAt, status: "queued" })
        .eq("id", u.outreachLeadId)
        .is("sent_at", null)
        .is("sequence_stopped_at", null);
      if (e1) { conflicts++; continue; }
      const { error: e2 } = await (supabase.from("outreach_campaign_leads" as never) as any)
        .update({ scheduled_send_at: u.sendAt, status: "scheduled" })
        .eq("id", u.campaignLeadId);
      if (e2) { conflicts++; continue; }
      scheduled++;
    } catch { conflicts++; }
  }

  await (supabase.from("outreach_campaigns" as never) as any)
    .update({ status: "scheduled", updated_at: new Date().toISOString() })
    .eq("id", campaignId);

  const times = updates.map((u) => u.sendAt).sort();
  return {
    campaign_id: campaignId,
    scheduled,
    skipped_conflicts: conflicts,
    first_send_at: times[0] ?? null,
    last_send_at: times[times.length - 1] ?? null,
  };
}

// --- Home dashboard snapshot ---

export interface HomeSnapshot {
  suggestedLeads: number;
  importedLeads: number;
  campaignLeadsScheduled: number;
  emailsSent: number;
  opens: number;
  replies: number;
  bounces: number;
  complaints: number;
  bookingSubmissions: number;
  waitlistSignups: number;
  syllabiUploaded: number;
  textConversations: number;
}

async function countRows(table: string, predicate?: (q: any) => any): Promise<number> {
  try {
    let q: any = (supabase.from(table as never) as any).select("id", { count: "exact", head: true });
    if (predicate) q = predicate(q);
    const { count } = await q;
    return Number(count ?? 0);
  } catch { return 0; }
}

export async function fetchHomeSnapshot(): Promise<HomeSnapshot> {
  const [
    suggestedLeads, importedLeads, campaignLeadsScheduled,
    emailsSent, opens, replies, bounces, complaints,
    bookingSubmissions, waitlistSignups, syllabiUploaded, textConversations,
  ] = await Promise.all([
    countRows("campus_lead_suggestions", (q) => q.eq("status", "pending").is("archived_at", null)),
    countRows("outreach_leads"),
    countRows("outreach_campaign_leads", (q) => q.eq("status", "scheduled")),
    countRows("outreach_leads", (q) => q.not("sent_at", "is", null)),
    countRows("outreach_leads", (q) => q.gt("opens_count", 0)),
    countRows("outreach_email_events", (q) => q.in("event_type", ["reply", "replied"])),
    countRows("outreach_email_events", (q) => q.in("event_type", ["bounce", "bounced"])),
    countRows("outreach_email_events", (q) => q.in("event_type", ["complaint", "complained", "spam"])),
    countRows("session_prep_submissions"),
    countRows("outreach_waitlist_signups"),
    countRows("session_prep_submissions", (q) => q.not("file_paths", "is", null)),
    countRows("sms_conversations"),
  ]);
  return {
    suggestedLeads, importedLeads, campaignLeadsScheduled,
    emailsSent, opens, replies, bounces, complaints,
    bookingSubmissions, waitlistSignups, syllabiUploaded, textConversations,
  };
}

// ============================================================
// Audiences: saved campus filter sets + optional pinned campus IDs.
// ============================================================

export interface Audience {
  id: string;
  name: string;
  description: string | null;
  filters_json: Record<string, unknown>;
  pinned_campus_ids: string[] | null;
  is_shared: boolean;
  created_by: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AudiencePayload {
  name: string;
  description?: string | null;
  filters_json: Record<string, unknown>;
  pinned_campus_ids?: string[] | null;
  is_shared?: boolean;
}

const AUDIENCE_TABLE = "outreach_audiences" as const;

export async function listAudiences(): Promise<Audience[]> {
  const { data, error } = await (supabase.from(AUDIENCE_TABLE as never) as any)
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Audience[];
}

export async function createAudience(payload: AudiencePayload): Promise<Audience> {
  const { data: userRes } = await supabase.auth.getUser();
  const created_by = userRes.user?.id ?? null;
  const row = {
    name: payload.name,
    description: payload.description ?? null,
    filters_json: payload.filters_json,
    pinned_campus_ids: payload.pinned_campus_ids ?? null,
    is_shared: !!payload.is_shared,
    created_by,
  };
  const { data, error } = await (supabase.from(AUDIENCE_TABLE as never) as any)
    .insert(row).select("*").single();
  if (error) throw error;
  return data as Audience;
}

export async function updateAudience(
  id: string,
  patch: Partial<AudiencePayload>,
): Promise<Audience> {
  const { data, error } = await (supabase.from(AUDIENCE_TABLE as never) as any)
    .update(patch as never).eq("id", id).select("*").single();
  if (error) throw error;
  return data as Audience;
}

export async function deleteAudience(id: string): Promise<void> {
  const { error } = await (supabase.from(AUDIENCE_TABLE as never) as any)
    .delete().eq("id", id);
  if (error) throw error;
}

export async function touchAudienceUsed(id: string): Promise<void> {
  await (supabase.from(AUDIENCE_TABLE as never) as any)
    .update({ last_used_at: new Date().toISOString() } as never).eq("id", id);
}

