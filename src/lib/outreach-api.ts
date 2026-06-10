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
  "id,name,slug,state,region,is_sec,archived_at,annual_tuition_in_state_cents,annual_tuition_out_state_cents,tuition_source,tuition_notes,total_enrollment,approval_status,ready_for_outreach,assignment_status,assigned_to,assignment_batch,due_date,course_codes_json,course_family_codes_json,course_family_titles_json,course_family_status_json,use_school_colors,landing_page_reviewed";

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
      landing_views: 0,
      landing_clicks: 0,
      course_codes: extractCourseCodes(c.course_codes_json),
      course_family_codes_json: asRecord(c.course_family_codes_json),
      course_family_titles_json: asRecord(c.course_family_titles_json),
      course_family_status_json: asRecord(c.course_family_status_json),
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
}

export async function fetchLeads(): Promise<Lead[]> {
  const { data, error } = await supabase
    .from("outreach_leads")
    .select("id,campus_id,email,first_name,last_name,is_phd,status,created_at")
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
  }));
}

/**
 * Insert leads for one campus, deduping by email across all existing leads.
 * Note: leads link by campus_id only — the legacy outreach_schools table is
 * not used in the new app (campuses absorbed it).
 */
export async function importLeads(
  campusId: string,
  rows: { email: string; first_name: string; last_name: string; is_phd: boolean }[],
): Promise<{ imported: number; duplicates: number }> {
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
      status: "pending",
    } as never);
    if (error) throw error;
    existingSet.add(email);
    imported++;
  }
  return { imported, duplicates };
}
