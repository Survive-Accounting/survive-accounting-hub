// REP ADMIN — Lee/King's side of the campus-rep system: approve applications, manage the roster,
// review rep-submitted contacts (the QC gate a rep can never cross alone), manage assignments,
// and VIEW-AS (read-only impersonation, audited, never via the rep's own token).
//
// Every handler's first line is assertAdmin() — the same admin-session gate the rest of
// /admin/reps uses. All writes stay inside the existing tables (referral_partners lifecycle
// columns, rep_chapter_assignments, growth_contact_qc, rep_activity).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { assertAdmin } from "@/lib/admin-session.functions";
import { canonicalSchoolName } from "@/lib/schools";
import { assignmentAfterQc, type AssignmentStatus, type RepStatus, type RepWorkspaceResult } from "@/lib/rep-shared";
import { termFor, termId } from "@/lib/terms";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

async function adminEmail(): Promise<string> {
  const { adminSessionOk } = await import("@/lib/admin-session.functions");
  try { return (await adminSessionOk())?.email ?? "admin"; } catch { return "admin"; }
}

// ── ROSTER ───────────────────────────────────────────────────────────────────────────────────
export type AdminRepRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  campusSlug: string | null;
  campusName: string | null;
  repStatus: RepStatus;
  phoneVerified: boolean;
  isTest: boolean;
  createdAt: string;
  chaptersReserved: number;
  chaptersQualified: number;
  contactsSubmitted: number;
  contactsApproved: number;
  clicks: number;
  signups: number;
  purchases: number;
  revenueCents: number;
  commissionCents: number;   // pending+approved+paid (not void)
};

export const adminListReps = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; reps: AdminRepRow[]; error?: string }> => {
    await assertAdmin();
    const db = await admin();

    const { data: partnerRows } = await db.from("referral_partners")
      .select("id,name,email,phone,campus_id,rep_status,phone_verified_at,is_test,created_at,status")
      .eq("type", "campus_rep").order("created_at", { ascending: false }).limit(1000);
    const partners = (partnerRows ?? []) as Array<{ id: string; name: string; email: string | null; phone: string | null; campus_id: string | null; rep_status: RepStatus | null; phone_verified_at: string | null; is_test: boolean; created_at: string }>;
    if (!partners.length) return { ok: true, reps: [] };
    const ids = partners.map((p) => p.id);

    // campuses
    const campusIds = Array.from(new Set(partners.map((p) => p.campus_id).filter(Boolean))) as string[];
    const campusById = new Map<string, { slug: string; name: string }>();
    for (let i = 0; i < campusIds.length; i += 100) {
      const { data: cs } = await db.from("campuses").select("id,slug,name,short_name").in("id", campusIds.slice(i, i + 100));
      for (const c of (cs ?? []) as Array<{ id: string; slug: string; name: string; short_name: string | null }>) {
        campusById.set(c.id, { slug: c.slug, name: canonicalSchoolName(c.slug, c.short_name || c.name) });
      }
    }

    // rollups — small tables, one pass each, aggregated in JS (no GROUP BY over PostgREST)
    const tid = termId(termFor());
    const asgBy = new Map<string, { reserved: number; qualified: number }>();
    {
      const { data } = await db.from("rep_chapter_assignments").select("partner_id,status,term_id").in("partner_id", ids).limit(10000);
      for (const r of (data ?? []) as Array<{ partner_id: string; status: string; term_id: string }>) {
        if (r.term_id !== tid) continue;
        const e = asgBy.get(r.partner_id) ?? { reserved: 0, qualified: 0 };
        if (r.status === "reserved") e.reserved++;
        if (r.status === "qualified") e.qualified++;
        asgBy.set(r.partner_id, e);
      }
    }
    const contactsBy = new Map<string, { submitted: number; approved: number }>();
    {
      const { data } = await db.from("growth_public_contacts").select("id,submitted_by_partner_id").in("submitted_by_partner_id", ids).limit(10000);
      const rows = (data ?? []) as Array<{ id: string; submitted_by_partner_id: string }>;
      const byContact = new Map(rows.map((r) => [r.id, r.submitted_by_partner_id]));
      for (const r of rows) {
        const e = contactsBy.get(r.submitted_by_partner_id) ?? { submitted: 0, approved: 0 };
        e.submitted++; contactsBy.set(r.submitted_by_partner_id, e);
      }
      const cIds = rows.map((r) => r.id);
      for (let i = 0; i < cIds.length; i += 150) {
        const { data: qc } = await db.from("growth_contact_qc").select("source_id,qc_action")
          .eq("contact_source", "growth_public_contacts").in("source_id", cIds.slice(i, i + 150)).eq("qc_action", "approve");
        for (const q of (qc ?? []) as Array<{ source_id: string }>) {
          const pid = byContact.get(q.source_id);
          if (!pid) continue;
          const e = contactsBy.get(pid) ?? { submitted: 0, approved: 0 };
          e.approved++; contactsBy.set(pid, e);
        }
      }
    }
    const linkOwner = new Map<string, string>();
    {
      const { data } = await db.from("referral_links").select("id,partner_id").in("partner_id", ids).limit(5000);
      for (const r of (data ?? []) as Array<{ id: string; partner_id: string }>) linkOwner.set(r.id, r.partner_id);
    }
    const clicksBy = new Map<string, number>();
    if (linkOwner.size) {
      const linkIds = Array.from(linkOwner.keys());
      for (let i = 0; i < linkIds.length; i += 150) {
        const { data } = await db.from("referral_clicks").select("link_id").in("link_id", linkIds.slice(i, i + 150)).eq("is_bot", false).limit(20000);
        for (const r of (data ?? []) as Array<{ link_id: string }>) {
          const pid = linkOwner.get(r.link_id);
          if (pid) clicksBy.set(pid, (clicksBy.get(pid) ?? 0) + 1);
        }
      }
    }
    const convBy = new Map<string, { signups: number; purchases: number; revenue: number }>();
    {
      const { data } = await db.from("referral_conversions").select("partner_id,kind,amount_cents").in("partner_id", ids).limit(20000);
      for (const r of (data ?? []) as Array<{ partner_id: string | null; kind: string; amount_cents: number }>) {
        if (!r.partner_id) continue;
        const e = convBy.get(r.partner_id) ?? { signups: 0, purchases: 0, revenue: 0 };
        if (r.kind === "signup") e.signups++;
        else { e.purchases++; e.revenue += r.amount_cents ?? 0; }
        convBy.set(r.partner_id, e);
      }
    }
    const commBy = new Map<string, number>();
    {
      const { data } = await db.from("referral_commissions").select("partner_id,commission_cents,status").in("partner_id", ids).limit(20000);
      for (const r of (data ?? []) as Array<{ partner_id: string; commission_cents: number; status: string }>) {
        if (r.status === "void") continue;
        commBy.set(r.partner_id, (commBy.get(r.partner_id) ?? 0) + (r.commission_cents ?? 0));
      }
    }

    const reps: AdminRepRow[] = partners.map((p) => {
      const campus = p.campus_id ? campusById.get(p.campus_id) : undefined;
      const asg = asgBy.get(p.id) ?? { reserved: 0, qualified: 0 };
      const con = contactsBy.get(p.id) ?? { submitted: 0, approved: 0 };
      const cv = convBy.get(p.id) ?? { signups: 0, purchases: 0, revenue: 0 };
      return {
        id: p.id, name: p.name, email: p.email, phone: p.phone,
        campusSlug: campus?.slug ?? null, campusName: campus?.name ?? null,
        repStatus: (p.rep_status ?? "active") as RepStatus, phoneVerified: !!p.phone_verified_at,
        isTest: p.is_test, createdAt: p.created_at,
        chaptersReserved: asg.reserved, chaptersQualified: asg.qualified,
        contactsSubmitted: con.submitted, contactsApproved: con.approved,
        clicks: clicksBy.get(p.id) ?? 0, signups: cv.signups, purchases: cv.purchases,
        revenueCents: cv.revenue, commissionCents: commBy.get(p.id) ?? 0,
      };
    });
    return { ok: true, reps };
  });

// ── REP LIFECYCLE ACTIONS ────────────────────────────────────────────────────────────────────
export const adminRepAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    partnerId: z.string().uuid(),
    action: z.enum(["approve", "pause", "reactivate", "deactivate", "revoke_sessions"]),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const { data: rep } = await db.from("referral_partners").select("id,rep_status,phone_verified_at")
      .eq("id", data.partnerId).eq("type", "campus_rep").maybeSingle();
    if (!rep?.id) return { ok: false, error: "Rep not found." };

    const updates: Record<string, unknown> = {};
    if (data.action === "approve") {
      updates.rep_status = "approved"; updates.approved_at = new Date().toISOString(); updates.approved_by = by;
      // Engine stays paused until the phone verify activates them — unless already verified
      // (re-approval after a pause), in which case they go straight back to active.
      if (rep.phone_verified_at) { updates.rep_status = "active"; updates.status = "active"; }
    } else if (data.action === "pause") {
      updates.rep_status = "paused"; updates.status = "paused";
    } else if (data.action === "reactivate") {
      updates.rep_status = rep.phone_verified_at ? "active" : "approved";
      updates.status = rep.phone_verified_at ? "active" : "paused";
    } else if (data.action === "deactivate") {
      updates.rep_status = "deactivated"; updates.status = "archived";
    } else if (data.action === "revoke_sessions") {
      // Rotating the token invalidates every cookie carrying the old one, next request.
      const A = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const b = new Uint8Array(28);
      globalThis.crypto.getRandomValues(b);
      updates.dashboard_token = Array.from(b, (n) => A[n % A.length]).join("");
    }
    const { error } = await db.from("referral_partners").update(updates).eq("id", data.partnerId);
    return error ? { ok: false, error: error.message } : { ok: true };
  });

export const adminChangeRepCampus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid(), campusSlug: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const { data: c } = await db.from("campuses").select("id").eq("slug", data.campusSlug).maybeSingle();
    if (!c?.id) return { ok: false, error: "No campus with that slug." };
    const { error } = await db.from("referral_partners").update({ campus_id: c.id })
      .eq("id", data.partnerId).eq("type", "campus_rep");
    return error ? { ok: false, error: error.message } : { ok: true };
  });

// ── ASSIGNMENT MANAGEMENT ────────────────────────────────────────────────────────────────────
export const adminAssignmentAction = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    assignmentId: z.string().uuid(),
    action: z.enum(["revoke", "release", "reassign"]),
    toPartnerId: z.string().uuid().optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const { data: asg } = await db.from("rep_chapter_assignments")
      .select("id,partner_id,campus_greek_chapter_id,term_id,status,is_test").eq("id", data.assignmentId).maybeSingle();
    if (!asg?.id) return { ok: false, error: "Assignment not found." };

    const nowIso = new Date().toISOString();
    if (data.action === "revoke" || data.action === "release") {
      const { error } = await db.from("rep_chapter_assignments")
        .update({ status: "revoked", revoked_at: nowIso }).eq("id", asg.id);
      if (error) return { ok: false, error: error.message };
      await db.from("rep_activity").insert({
        partner_id: asg.partner_id, kind: "chapter_released", campus_greek_chapter_id: asg.campus_greek_chapter_id,
        meta: { by, assignmentId: asg.id }, is_test: !!asg.is_test,
      }).then(() => undefined, () => undefined);
      return { ok: true };
    }
    // reassign: close the old row, open a new one for the target rep (history stays intact).
    if (!data.toPartnerId) return { ok: false, error: "Pick the rep to reassign to." };
    const { error: closeErr } = await db.from("rep_chapter_assignments")
      .update({ status: "reassigned", reassigned_at: nowIso }).eq("id", asg.id);
    if (closeErr) return { ok: false, error: closeErr.message };
    const { error: openErr } = await db.from("rep_chapter_assignments").insert({
      partner_id: data.toPartnerId, campus_greek_chapter_id: asg.campus_greek_chapter_id,
      term_id: asg.term_id, status: "reserved", is_test: !!asg.is_test, created_by: `admin:${by}`,
    });
    if (openErr) return { ok: false, error: openErr.message };
    await db.from("rep_activity").insert({
      partner_id: data.toPartnerId, kind: "admin_reassigned", campus_greek_chapter_id: asg.campus_greek_chapter_id,
      meta: { by, fromPartnerId: asg.partner_id }, is_test: !!asg.is_test,
    }).then(() => undefined, () => undefined);
    return { ok: true };
  });

// ── REP CONTACT QC (the gate that turns RESERVED into QUALIFIED) ─────────────────────────────
export type PendingRepContact = {
  contactId: string;
  partnerId: string;
  repName: string;
  campusName: string | null;
  chapterName: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  notes: string | null;
  submittedAt: string;
};

export const adminListPendingRepContacts = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; contacts: PendingRepContact[] }> => {
    await assertAdmin();
    const db = await admin();
    const { data: rows } = await db.from("growth_public_contacts")
      .select("id,entity_id,campus_id,name,role,email,phone,instagram_url,notes,created_at,submitted_by_partner_id")
      .not("submitted_by_partner_id", "is", null).order("created_at", { ascending: false }).limit(500);
    const contacts = (rows ?? []) as Array<{ id: string; entity_id: string; campus_id: string; name: string | null; role: string | null; email: string | null; phone: string | null; instagram_url: string | null; notes: string | null; created_at: string; submitted_by_partner_id: string }>;
    if (!contacts.length) return { ok: true, contacts: [] };

    // pending only — decided ones leave the queue
    const pending = new Set<string>();
    for (let i = 0; i < contacts.length; i += 150) {
      const { data: qc } = await db.from("growth_contact_qc").select("source_id,qc_action")
        .eq("contact_source", "growth_public_contacts").in("source_id", contacts.slice(i, i + 150).map((c) => c.id));
      for (const r of (qc ?? []) as Array<{ source_id: string; qc_action: string }>) if (r.qc_action === "pending") pending.add(r.source_id);
    }
    const keep = contacts.filter((c) => pending.has(c.id));

    const repIds = Array.from(new Set(keep.map((c) => c.submitted_by_partner_id)));
    const repById = new Map<string, string>();
    if (repIds.length) {
      const { data: reps } = await db.from("referral_partners").select("id,name").in("id", repIds);
      for (const r of (reps ?? []) as Array<{ id: string; name: string }>) repById.set(r.id, r.name);
    }
    const chIds = Array.from(new Set(keep.map((c) => c.entity_id)));
    const chById = new Map<string, string>();
    for (let i = 0; i < chIds.length; i += 100) {
      const { data: chs } = await db.from("campus_greek_chapters").select("id,slug,nickname,greek_org_id").in("id", chIds.slice(i, i + 100));
      const rows2 = (chs ?? []) as Array<{ id: string; slug: string; nickname: string | null; greek_org_id: string | null }>;
      const orgIds = Array.from(new Set(rows2.map((r) => r.greek_org_id).filter(Boolean))) as string[];
      const orgNames = new Map<string, string>();
      if (orgIds.length) {
        const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
        for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
      }
      for (const r of rows2) chById.set(r.id, r.nickname || (r.greek_org_id ? orgNames.get(r.greek_org_id) : null) || r.slug);
    }
    const campusIds = Array.from(new Set(keep.map((c) => c.campus_id)));
    const campusById = new Map<string, string>();
    if (campusIds.length) {
      const { data: cs } = await db.from("campuses").select("id,slug,name,short_name").in("id", campusIds);
      for (const c of (cs ?? []) as Array<{ id: string; slug: string; name: string; short_name: string | null }>) {
        campusById.set(c.id, canonicalSchoolName(c.slug, c.short_name || c.name));
      }
    }

    return {
      ok: true,
      contacts: keep.map((c) => ({
        contactId: c.id, partnerId: c.submitted_by_partner_id,
        repName: repById.get(c.submitted_by_partner_id) ?? "?",
        campusName: campusById.get(c.campus_id) ?? null,
        chapterName: chById.get(c.entity_id) ?? "?",
        name: c.name, role: c.role, email: c.email, phone: c.phone, instagram: c.instagram_url,
        notes: c.notes, submittedAt: c.created_at,
      })),
    };
  });

export const adminReviewRepContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    contactId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    makeEligible: z.boolean().optional(),   // approve may ALSO open it for outreach; default no
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; assignment?: AssignmentStatus; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const { data: contact } = await db.from("growth_public_contacts")
      .select("id,entity_id,submitted_by_partner_id").eq("id", data.contactId).maybeSingle();
    if (!contact?.id || !contact.submitted_by_partner_id) return { ok: false, error: "Not a rep-submitted contact." };

    const { error: qcErr } = await db.from("growth_contact_qc").update({
      qc_action: data.decision, qc_by: by, qc_at: new Date().toISOString(),
      outreach_eligible: data.decision === "approve" && !!data.makeEligible,
      review_reason: data.decision === "approve" ? null : "rep submission rejected in review",
    }).eq("contact_source", "growth_public_contacts").eq("source_id", contact.id);
    if (qcErr) return { ok: false, error: qcErr.message };

    const repId = contact.submitted_by_partner_id as string;
    const { data: repRow } = await db.from("referral_partners").select("is_test").eq("id", repId).maybeSingle();
    const isTest = !!repRow?.is_test;
    await db.from("rep_activity").insert({
      partner_id: repId, kind: data.decision === "approve" ? "contact_qc_approved" : "contact_qc_rejected",
      campus_greek_chapter_id: contact.entity_id, growth_contact_id: contact.id, meta: { by }, is_test: isTest,
    }).then(() => undefined, () => undefined);

    // Transition the live assignment for this chapter+term (pure logic in rep-shared, applied here).
    const tid = termId(termFor());
    const { data: asg } = await db.from("rep_chapter_assignments")
      .select("id,status,partner_id").eq("campus_greek_chapter_id", contact.entity_id)
      .eq("term_id", tid).eq("partner_id", repId).in("status", ["reserved", "qualified"]).maybeSingle();
    if (!asg?.id) return { ok: true };

    // "Another usable contact" = another of this rep's contacts on the chapter that is approved or
    // still pending (not yet judged unusable).
    let hasOther = false;
    {
      const { data: others } = await db.from("growth_public_contacts").select("id")
        .eq("entity_type", "chapter").eq("entity_id", contact.entity_id)
        .eq("submitted_by_partner_id", repId).neq("id", contact.id).limit(50);
      const otherIds = ((others ?? []) as Array<{ id: string }>).map((o) => o.id);
      if (otherIds.length) {
        const { data: qc } = await db.from("growth_contact_qc").select("source_id,qc_action")
          .eq("contact_source", "growth_public_contacts").in("source_id", otherIds);
        hasOther = ((qc ?? []) as Array<{ qc_action: string }>).some((r) => r.qc_action === "approve" || r.qc_action === "pending");
      }
    }
    const next = assignmentAfterQc(asg.status as AssignmentStatus, data.decision, hasOther);
    if (next !== asg.status) {
      const patch: Record<string, unknown> = { status: next };
      if (next === "qualified") patch.qualified_at = new Date().toISOString();
      if (next === "revoked") patch.revoked_at = new Date().toISOString();
      await db.from("rep_chapter_assignments").update(patch).eq("id", asg.id);
      await db.from("rep_activity").insert({
        partner_id: repId, kind: next === "qualified" ? "chapter_qualified" : "chapter_released",
        campus_greek_chapter_id: contact.entity_id, meta: { by, decision: data.decision }, is_test: isTest,
      }).then(() => undefined, () => undefined);
    }
    return { ok: true, assignment: next };
  });

// ── V2 APPLICATION REVIEW — the queue Lee works, call-first ──────────────────────────────────
export type RepApplicationCard = {
  partnerId: string;
  name: string;
  email: string | null;
  phone: string | null;
  campusName: string | null;
  isTest: boolean;
  status: "submitted" | "waitlisted";
  submittedAt: string | null;
  graduationYear: number | null;
  courseStatus: string | null;      // self-reported product/course exposure — honest, not tracked usage
  ownChapterName: string | null;
  roles: string[];
  weightedRole: boolean;            // council officer / recruitment counselor → badge
  reachable: number;                // the number that decides this
  reachMember: number;
  reachKnows: number;
  pitch: string | null;
  callAt: string | null;
  callNotes: string | null;
};

export const adminListRepApplications = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ ok: boolean; applications: RepApplicationCard[] }> => {
    await assertAdmin();
    const db = await admin();
    const { CAMPUS_ROLE_CHIPS } = await import("@/lib/rep-shared");
    const weighted = new Set(CAMPUS_ROLE_CHIPS.filter((r) => r.weighted).map((r) => r.slug as string));

    const { data: rows } = await db.from("referral_partners")
      .select("id,name,email,phone,campus_id,is_test,application_status,onboarding_submitted_at,graduation_year,course_status,own_chapter_id,campus_roles,pitch,call_at,call_notes")
      .eq("type", "campus_rep").in("application_status", ["submitted", "waitlisted"])
      .order("onboarding_submitted_at", { ascending: true }).limit(300);
    const apps = (rows ?? []) as Array<Record<string, unknown>>;
    if (!apps.length) return { ok: true, applications: [] };
    const ids = apps.map((a) => a.id as string);

    // reach rollups
    const reachBy = new Map<string, { member: number; knows: number }>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: rr } = await db.from("rep_chapter_reach").select("partner_id,reach").in("partner_id", ids.slice(i, i + 100)).limit(20000);
      for (const r of (rr ?? []) as Array<{ partner_id: string; reach: string }>) {
        const e = reachBy.get(r.partner_id) ?? { member: 0, knows: 0 };
        if (r.reach === "member") e.member++; else e.knows++;
        reachBy.set(r.partner_id, e);
      }
    }
    // names for campus + own chapter
    const campusIds = Array.from(new Set(apps.map((a) => a.campus_id).filter(Boolean))) as string[];
    const campusById = new Map<string, string>();
    if (campusIds.length) {
      const { data: cs } = await db.from("campuses").select("id,slug,name,short_name").in("id", campusIds);
      for (const c of (cs ?? []) as Array<{ id: string; slug: string; name: string; short_name: string | null }>) campusById.set(c.id, canonicalSchoolName(c.slug, c.short_name || c.name));
    }
    const chIds = Array.from(new Set(apps.map((a) => a.own_chapter_id).filter(Boolean))) as string[];
    const chById = new Map<string, string>();
    if (chIds.length) {
      const { data: chs } = await db.from("campus_greek_chapters").select("id,slug,nickname,greek_org_id").in("id", chIds);
      const rows2 = (chs ?? []) as Array<{ id: string; slug: string; nickname: string | null; greek_org_id: string | null }>;
      const orgIds = Array.from(new Set(rows2.map((r) => r.greek_org_id).filter(Boolean))) as string[];
      const orgNames = new Map<string, string>();
      if (orgIds.length) {
        const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
        for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
      }
      for (const r of rows2) chById.set(r.id, r.nickname || (r.greek_org_id ? orgNames.get(r.greek_org_id) : null) || r.slug);
    }

    const applications = apps.map((a) => {
      const roles = Array.isArray(a.campus_roles) ? (a.campus_roles as string[]) : [];
      const reach = reachBy.get(a.id as string) ?? { member: 0, knows: 0 };
      return {
        partnerId: a.id as string, name: a.name as string, email: (a.email as string) ?? null, phone: (a.phone as string) ?? null,
        campusName: a.campus_id ? (campusById.get(a.campus_id as string) ?? null) : null,
        isTest: !!a.is_test,
        status: a.application_status as "submitted" | "waitlisted",
        submittedAt: (a.onboarding_submitted_at as string) ?? null,
        graduationYear: (a.graduation_year as number) ?? null,
        courseStatus: (a.course_status as string) ?? null,
        ownChapterName: a.own_chapter_id ? (chById.get(a.own_chapter_id as string) ?? null) : null,
        roles, weightedRole: roles.some((r) => weighted.has(r)),
        reachable: reach.member + reach.knows, reachMember: reach.member, reachKnows: reach.knows,
        pitch: (a.pitch as string) ?? null,
        callAt: (a.call_at as string) ?? null, callNotes: (a.call_notes as string) ?? null,
      };
    }).sort((a, b) => b.reachable - a.reachable);   // the number that decides this, descending
    return { ok: true, applications };
  });

export const adminScheduleRepCall = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    partnerId: z.string().uuid(),
    callAt: z.string().min(4).max(40),
    notes: z.string().trim().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const when = new Date(data.callAt);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "That date didn't parse." };
    const { error } = await db.from("referral_partners")
      .update({ call_at: when.toISOString(), ...(data.notes != null ? { call_notes: data.notes.trim() || null } : {}) })
      .eq("id", data.partnerId).eq("type", "campus_rep");
    if (error) return { ok: false, error: error.message };
    const { data: rep } = await db.from("referral_partners").select("is_test").eq("id", data.partnerId).maybeSingle();
    await db.from("rep_activity").insert({
      partner_id: data.partnerId, kind: "call_scheduled", meta: { by, callAt: when.toISOString() }, is_test: !!rep?.is_test,
    }).then(() => undefined, () => undefined);
    return { ok: true };
  });

/** APPROVE / WAITLIST / DECLINE. Approving requires the coverage call (ifc/panhellenic/both/other
 *  — the campus-capacity flag) and turns the coverage map into the working list: an assignment +
 *  a rep×chapter link for every reachable chapter that isn't already held by another rep. */
export const adminReviewApplication = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    partnerId: z.string().uuid(),
    decision: z.enum(["approve", "waitlist", "decline"]),
    coverage: z.enum(["ifc", "panhellenic", "both", "other"]).optional().nullable(),
    callNotes: z.string().trim().max(2000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; assignedCount?: number; skipped?: number; error?: string }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const { data: rep } = await db.from("referral_partners")
      .select("id,name,campus_id,is_test,application_status").eq("id", data.partnerId).eq("type", "campus_rep").maybeSingle();
    if (!rep?.id) return { ok: false, error: "Rep not found." };
    const nowIso = new Date().toISOString();

    if (data.decision !== "approve") {
      const status = data.decision === "waitlist" ? "waitlisted" : "declined";
      const { error } = await db.from("referral_partners").update({
        application_status: status, reviewed_at: nowIso, reviewed_by: by,
        ...(data.callNotes != null ? { call_notes: data.callNotes.trim() || null } : {}),
      }).eq("id", rep.id);
      if (error) return { ok: false, error: error.message };
      await db.from("rep_activity").insert({
        partner_id: rep.id, kind: status === "waitlisted" ? "application_waitlisted" : "application_declined",
        meta: { by }, is_test: !!rep.is_test,
      }).then(() => undefined, () => undefined);
      return { ok: true };
    }

    if (!data.coverage) return { ok: false, error: "Pick the coverage (IFC / Panhellenic / both) — it's the campus-capacity flag." };
    if (!rep.campus_id) return { ok: false, error: "Rep has no campus." };

    const { error: upErr } = await db.from("referral_partners").update({
      application_status: "approved", rep_coverage: data.coverage,
      reviewed_at: nowIso, reviewed_by: by,
      ...(data.callNotes != null ? { call_notes: data.callNotes.trim() || null } : {}),
    }).eq("id", rep.id);
    if (upErr) return { ok: false, error: upErr.message };

    // The coverage map becomes the working list. The one-live-assignment-per-chapter index still
    // rules — a chapter another rep already holds is SKIPPED, not stolen.
    const { termFor, termId } = await import("@/lib/terms");
    const tid = termId(termFor());
    const { data: reachRows } = await db.from("rep_chapter_reach")
      .select("campus_greek_chapter_id").eq("partner_id", rep.id).limit(1000);
    const chapterIds = ((reachRows ?? []) as Array<{ campus_greek_chapter_id: string }>).map((r) => r.campus_greek_chapter_id);

    let assignedCount = 0, skipped = 0;
    if (chapterIds.length) {
      const { data: campus } = await db.from("campuses").select("slug").eq("id", rep.campus_id).maybeSingle();
      const { data: chRows } = await db.from("campus_greek_chapters")
        .select("id,slug,nickname,greek_org_id").in("id", chapterIds.slice(0, 200));
      const chs = (chRows ?? []) as Array<{ id: string; slug: string; nickname: string | null; greek_org_id: string | null }>;
      const orgIds = Array.from(new Set(chs.map((c) => c.greek_org_id).filter(Boolean))) as string[];
      const orgNames = new Map<string, string>();
      if (orgIds.length) {
        const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
        for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
      }
      const { ensureRepChapterLink } = await import("@/lib/rep-workspace.functions");
      for (const ch of chs) {
        const { data: ins, error: aErr } = await db.from("rep_chapter_assignments").insert({
          partner_id: rep.id, campus_greek_chapter_id: ch.id, term_id: tid, status: "reserved",
          is_test: !!rep.is_test, created_by: `admin:${by}`,
        }).select("id").maybeSingle();
        if (aErr || !ins?.id) { skipped++; continue; }   // unique-index conflict → another rep holds it
        assignedCount++;
        try {
          if (campus?.slug) {
            const orgName = ch.nickname || (ch.greek_org_id ? orgNames.get(ch.greek_org_id) : null) || ch.slug;
            const link = await ensureRepChapterLink(db, { id: rep.id, is_test: !!rep.is_test }, { id: ch.id, slug: ch.slug, campusSlug: campus.slug as string, orgName });
            await db.from("rep_chapter_assignments").update({ referral_link_id: link.id })
              .eq("partner_id", rep.id).eq("campus_greek_chapter_id", ch.id).eq("term_id", tid);
          }
        } catch (e) { console.warn("assignment link deferred:", (e as Error).message); }
      }
    }

    await db.from("rep_activity").insert({
      partner_id: rep.id, kind: "application_approved",
      meta: { by, coverage: data.coverage, assignedCount, skipped }, is_test: !!rep.is_test,
    }).then(() => undefined, () => undefined);
    return { ok: true, assignedCount, skipped };
  });

// ── REP DETAIL: assignments (for the roster drawer) ──────────────────────────────────────────
export type AdminAssignmentRow = {
  id: string;
  chapterId: string;
  chapterName: string;
  termId: string;
  status: AssignmentStatus;
  reservedAt: string;
  qualifiedAt: string | null;
};

export const adminRepAssignments = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; assignments: AdminAssignmentRow[] }> => {
    await assertAdmin();
    const db = await admin();
    const { data: rows } = await db.from("rep_chapter_assignments")
      .select("id,campus_greek_chapter_id,term_id,status,reserved_at,qualified_at")
      .eq("partner_id", data.partnerId).order("reserved_at", { ascending: false }).limit(200);
    const asg = (rows ?? []) as Array<{ id: string; campus_greek_chapter_id: string; term_id: string; status: AssignmentStatus; reserved_at: string; qualified_at: string | null }>;
    const chIds = Array.from(new Set(asg.map((a) => a.campus_greek_chapter_id)));
    const nameById = new Map<string, string>();
    for (let i = 0; i < chIds.length; i += 100) {
      const { data: chs } = await db.from("campus_greek_chapters").select("id,slug,nickname,greek_org_id").in("id", chIds.slice(i, i + 100));
      const rows2 = (chs ?? []) as Array<{ id: string; slug: string; nickname: string | null; greek_org_id: string | null }>;
      const orgIds = Array.from(new Set(rows2.map((r) => r.greek_org_id).filter(Boolean))) as string[];
      const orgNames = new Map<string, string>();
      if (orgIds.length) {
        const { data: orgs } = await db.from("greek_orgs").select("id,name").in("id", orgIds);
        for (const o of (orgs ?? []) as Array<{ id: string; name: string }>) orgNames.set(o.id, o.name);
      }
      for (const r of rows2) nameById.set(r.id, r.nickname || (r.greek_org_id ? orgNames.get(r.greek_org_id) : null) || r.slug);
    }
    return {
      ok: true,
      assignments: asg.map((a) => ({
        id: a.id, chapterId: a.campus_greek_chapter_id, chapterName: nameById.get(a.campus_greek_chapter_id) ?? "?",
        termId: a.term_id, status: a.status, reservedAt: a.reserved_at, qualifiedAt: a.qualified_at,
      })),
    };
  });

// ── VIEW AS REP (read-only, audited, never via the rep's token) ──────────────────────────────
export const adminGetRepWorkspace = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<RepWorkspaceResult & { viewingAs?: { name: string; campus: string | null } }> => {
    await assertAdmin();
    const db = await admin();
    const by = await adminEmail();
    const { data: repRow } = await db.from("referral_partners")
      .select("id,name,email,phone,campus_id,venmo,is_test,status,rep_status,phone_verified_at,dashboard_token,default_commission_type,default_commission_rate")
      .eq("id", data.partnerId).eq("type", "campus_rep").maybeSingle();
    if (!repRow?.id) return { ok: false, error: "Rep not found." };

    // AUDIT the impersonation — every view-as leaves a row.
    await db.from("rep_activity").insert({
      partner_id: repRow.id, kind: "admin_view_as", meta: { by }, is_test: !!repRow.is_test,
    }).then(() => undefined, () => undefined);

    const { buildWorkspace } = await import("@/lib/rep-workspace.functions");
    const ws = await buildWorkspace(db, repRow as never);
    if (!ws.ok) return ws;
    return { ...ws, viewingAs: { name: repRow.name as string, campus: ws.campusName } };
  });
