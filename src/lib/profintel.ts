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
  rmp_rating: number | null;
  rmp_num_ratings: number | null;
  rmp_course_match_json: Record<string, { code: string; count: number }> | null;
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

/** Fill the template tokens for one lead. */
export function renderTemplate(tpl: ProfIntelTemplate, lead: ProfIntelLead, school: string): { subject: string; body: string } {
  const first = (lead.first_name ?? "").trim();
  const last = (lead.last_name ?? "").trim();
  const tokens: Record<string, string> = {
    first_name: first || "there",
    last_name: last,
    full_name: `${first} ${last}`.trim(),
    school,
    course: courseMatchesText(lead.rmp_course_match_json),
    rmp_rating: lead.rmp_rating != null ? lead.rmp_rating.toFixed(1) : "",
  };
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => tokens[k] ?? "");
  return { subject: sub(tpl.subject), body: sub(tpl.body) };
}

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
    .select("id, first_name, last_name, email, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count")
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
      .select("id, first_name, last_name, email, rmp_rating, rmp_num_ratings, rmp_course_match_json, rmp_course_match_count")
      .eq("campus_id", campusId).is("archived_at", null);
    return ((any2 ?? []) as any[])
      .filter((r) => (r.rmp_course_match_count ?? 0) > 0)
      .sort((a, b) => (b.rmp_num_ratings ?? -1) - (a.rmp_num_ratings ?? -1) || (b.rmp_rating ?? -1) - (a.rmp_rating ?? -1));
  }
  return rows;
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

export async function updateSend(id: string, patch: Partial<Pick<ProfIntelSend, "subject" | "body" | "ready" | "scheduled_at" | "status">>): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any)
    .update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSend(id: string): Promise<void> {
  const { error } = await (supabase.from("profintel_sends" as never) as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}
