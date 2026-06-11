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

const APPROVAL_VALUES: ApprovalStatus[] = ["not_reviewed", "needs_review", "approved", "needs_fix"];
const ASSIGNMENT_VALUES: AssignmentStatus[] = ["not_assigned", "assigned", "in_progress", "approved", "blocked"];

const CAMPUS_SELECT =
  "id,name,slug,state,region,is_sec,archived_at,accounting_department_name,annual_tuition_in_state_cents,annual_tuition_out_state_cents,tuition_source,tuition_notes,total_enrollment,approval_status,ready_for_outreach,assignment_status,assigned_to,assignment_batch,due_date,course_codes_json,course_family_codes_json,course_family_titles_json,course_family_status_json,course_family_textbooks_json,use_school_colors,landing_page_reviewed";

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
      accounting_department_name: c.accounting_department_name ?? null,
      use_school_colors: c.use_school_colors ?? true,
      landing_page_reviewed: !!c.landing_page_reviewed,
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
  if (Object.keys(db).length === 0) return;
  const { error } = await supabase.from("campuses").update(db as never).eq("id", id);
  if (error) throw error;
}

// ----- Email templates -----
export async function fetchTemplates(): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from("outreach_email_templates")
    .select("id,name,subject,body,is_locked,is_active,kind,variant");
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
  }));
}

export async function saveTemplateDb(
  payload: Omit<EmailTemplate, "id">,
  existingId?: string,
): Promise<void> {
  if (payload.is_active) {
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
    const { error } = await supabase.from("outreach_email_templates").update(payload).eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("outreach_email_templates").insert(payload);
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
  color_primary: string | null; color_secondary: string | null; use_school_colors: boolean;
} | null> {
  const { data, error } = await supabase
    .from("campuses")
    .select("id,name,slug,course_codes_json,color_primary,color_secondary,use_school_colors")
    .eq("slug", slug)
    .maybeSingle();
  if (error || !data) return null;
  const c = data as any;
  const codes = Array.isArray(c.course_codes_json)
    ? c.course_codes_json.filter((x: unknown): x is string => typeof x === "string")
    : [];
  return {
    id: c.id, name: c.name ?? "", slug: c.slug ?? "",
    course_codes: codes,
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
}
export interface SmsMessage {
  id: string;
  direction: "in" | "out";
  author: string | null;
  body: string;
  created_at: string;
}

export async function fetchSmsConversations(): Promise<SmsConversation[]> {
  const { data, error } = await (supabase.from("sms_conversations" as never) as any)
    .select("id,short_ref,student_phone,campus_number,campus_id,course,exam_date,struggles,major,sentiment,status,last_message_at")
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
  created_at: string;
}

export async function fetchBroadcasts(): Promise<Broadcast[]> {
  const { data, error } = await (supabase.from("outreach_broadcasts" as never) as any)
    .select("*").order("send_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Broadcast[];
}

export async function saveBroadcast(
  b: Omit<Broadcast, "id" | "status" | "sent_count" | "skipped_count" | "created_at">,
  existingId?: string,
): Promise<void> {
  if (existingId) {
    const { error } = await (supabase.from("outreach_broadcasts" as never) as any)
      .update({ ...b, status: "scheduled" }).eq("id", existingId);
    if (error) throw error;
  } else {
    const { error } = await (supabase.from("outreach_broadcasts" as never) as any).insert(b);
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
