// Campus claim-queue API. Uses the anon Supabase client because the app
// currently has no Supabase auth — admin identity comes from AdminGate's
// localStorage value (Lee vs King).
import { supabase } from "@/integrations/supabase/client";
import { adminEmailFor, getAdminWho, type AdminWho } from "@/components/AdminGate";

export type ClaimStatus = "claimed" | "approved" | "released";

export interface QueueRow {
  campus_id: string;
  name: string;
  state: string | null;
  slug: string | null;
  annual_tuition_out_state_cents: number | null;
  annual_tuition_in_state_cents: number | null;
  approval_status: string | null;
  // Active claim (if any) — null when no live claim exists
  claim_id: string | null;
  claimed_by: string | null;
  claim_expires_at: string | null;
}

const CLAIM_TTL_MS = 2 * 60 * 60 * 1000; // 2h

function currentEmail(): string {
  const who = getAdminWho();
  if (!who) throw new Error("Admin identity not set");
  return adminEmailFor(who);
}

function expiresIso(): string {
  return new Date(Date.now() + CLAIM_TTL_MS).toISOString();
}

/** Get all campuses still needing approval, sorted by tuition desc. */
export async function fetchQueue(): Promise<QueueRow[]> {
  const { data: campuses, error } = await supabase
    .from("campuses")
    .select(
      "id,name,state,slug,annual_tuition_out_state_cents,annual_tuition_in_state_cents,approval_status,archived_at",
    )
    .neq("approval_status", "approved")
    .is("archived_at", null);
  if (error) throw error;

  const { data: claims, error: cErr } = await supabase
    .from("outreach_va_campus_assignments")
    .select("id,campus_id,assigned_by_email,claim_expires_at,status")
    .eq("status", "claimed");
  if (cErr) throw cErr;

  const claimByCampus = new Map<string, any>();
  const nowMs = Date.now();
  for (const c of (claims ?? []) as any[]) {
    const exp = c.claim_expires_at ? new Date(c.claim_expires_at).getTime() : 0;
    if (exp > nowMs) claimByCampus.set(c.campus_id, c);
  }

  const rows: QueueRow[] = ((campuses ?? []) as any[]).map((c) => {
    const claim = claimByCampus.get(c.id);
    return {
      campus_id: c.id,
      name: c.name,
      state: c.state,
      slug: c.slug,
      annual_tuition_out_state_cents: c.annual_tuition_out_state_cents,
      annual_tuition_in_state_cents: c.annual_tuition_in_state_cents,
      approval_status: c.approval_status,
      claim_id: claim?.id ?? null,
      claimed_by: claim?.assigned_by_email ?? null,
      claim_expires_at: claim?.claim_expires_at ?? null,
    };
  });

  rows.sort((a, b) => {
    const ta = a.annual_tuition_out_state_cents ?? a.annual_tuition_in_state_cents ?? -1;
    const tb = b.annual_tuition_out_state_cents ?? b.annual_tuition_in_state_cents ?? -1;
    return tb - ta;
  });

  return rows;
}

/** Claim a campus. Returns the new claim id, or throws if already claimed. */
export async function claimCampus(campusId: string): Promise<string> {
  const email = currentEmail();
  const { data, error } = await supabase
    .from("outreach_va_campus_assignments")
    .insert({
      campus_id: campusId,
      assigned_by_email: email,
      status: "claimed",
      claimed_at: new Date().toISOString(),
      claim_expires_at: expiresIso(),
    } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Already claimed by someone else.");
    throw error;
  }
  return (data as any).id;
}

/** Bump the expiry on the caller's active claim for this campus. */
export async function refreshClaim(campusId: string): Promise<void> {
  const email = currentEmail();
  await supabase
    .from("outreach_va_campus_assignments")
    .update({ claim_expires_at: expiresIso() } as never)
    .eq("campus_id", campusId)
    .eq("status", "claimed")
    .eq("assigned_by_email", email);
}

/** Release the caller's active claim on a campus. */
export async function releaseClaim(campusId: string): Promise<void> {
  const email = currentEmail();
  await supabase
    .from("outreach_va_campus_assignments")
    .update({ status: "released", released_at: new Date().toISOString() } as never)
    .eq("campus_id", campusId)
    .eq("status", "claimed")
    .eq("assigned_by_email", email);
}

/** Mark a campus claim as approved (called after the approval write succeeds). */
export async function markClaimApproved(campusId: string): Promise<void> {
  const email = currentEmail();
  await supabase
    .from("outreach_va_campus_assignments")
    .update({ status: "approved", released_at: new Date().toISOString() } as never)
    .eq("campus_id", campusId)
    .eq("status", "claimed")
    .eq("assigned_by_email", email);
}

export function isMine(row: QueueRow, who: AdminWho | null): boolean {
  if (!who || !row.claimed_by) return false;
  return row.claimed_by === adminEmailFor(who);
}
