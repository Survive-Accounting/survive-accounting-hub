// REP WORKSPACE — the server side of the rep's one job: find the right people → share free
// Exam 1 → get it into the chapter house.
//
// SCOPE LAW (build brief §29): every function here resolves the rep from the SESSION and scopes
// every read/write to that rep's partner_id and that rep's ONE campus. A rep can see their
// campus's public chapter directory, their own assignments/links/metrics/contacts — and nothing
// else. No Growth QC notes, no other reps, no admin queues.
//
// CONTACT LAW: rep-submitted contacts land in the CANONICAL store (growth_public_contacts +
// growth_contact_qc as 'pending'), never a parallel rep_contacts table. A rep can never
// self-approve outreach data — outreach_eligible stays false until King/Lee QC.
//
// ASSIGNMENT LAW: first APPROVED+VERIFIED rep to land a usable contact on a chapter gets the
// term's RESERVED assignment. The DB's partial unique index is the race gate — we just try the
// insert and report the loser cleanly.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canonicalSchoolName } from "@/lib/schools";
import { effectiveRule, ruleLabel } from "@/lib/referral-shared";
import { nextPayout } from "@/lib/rep-portal";
// BUILD-SAFETY: repFromSession lives in the server-only rep-auth.server module (it touches
// react-start/server cookies) — imported dynamically inside handler bodies, never statically.
import type { RepRow } from "@/lib/rep-auth.server";
import { COUNCILS, councilMatches } from "@/lib/greek-councils.functions";
import { termFor, termId } from "@/lib/terms";
import {
  contactTypeForRole, chapterState, normalizeInstagram, shareEmail, shareMessage, shareKindForMethod,
  SHARE_METHODS,
  type AssignmentStatus, type RepChapterRow, type RepWorkspaceResult, type ShareKitResult, type ShareMethod,
} from "@/lib/rep-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention shared with the referral modules
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const ORIGIN = "https://surviveaccounting.com";

/** council free text → short name ("IFC") for the 4 social councils, else null (excluded). */
export function socialCouncil(value: string | null | undefined): string | null {
  for (const c of COUNCILS) if (councilMatches(c, value)) return c.name;
  return null;
}

async function activity(db: DB, row: {
  partner_id: string; kind: string; campus_greek_chapter_id?: string | null;
  growth_contact_id?: string | null; referral_link_id?: string | null;
  meta?: Record<string, unknown>; is_test: boolean;
}): Promise<void> {
  await db.from("rep_activity").insert({ meta: {}, ...row }).then(() => undefined,
    (e: unknown) => console.warn("rep_activity insert failed", e));
}

// ── links ────────────────────────────────────────────────────────────────────────────────────

/** The rep's main campus link (destination = their campus page). Created once, reused after. */
export async function ensureMainCampusLink(db: DB, rep: Pick<RepRow, "id" | "campus_id" | "is_test">): Promise<{ id: string; code: string } | null> {
  if (!rep.campus_id) return null;
  const { data: campus } = await db.from("campuses").select("slug,name,short_name").eq("id", rep.campus_id).maybeSingle();
  if (!campus?.slug) return null;
  const { data: existing } = await db.from("referral_links").select("id,code")
    .eq("partner_id", rep.id).is("campus_greek_chapter_id", null).eq("active", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existing?.id) return existing as { id: string; code: string };
  const { generateUniqueCode } = await import("@/lib/referral.server");
  const code = await generateUniqueCode();
  const name = canonicalSchoolName(campus.slug as string, (campus.short_name as string) || (campus.name as string));
  const { data: ins } = await db.from("referral_links").insert({
    code, partner_id: rep.id, label: `${name} — main link`, destination_url: `/${campus.slug}`,
    active: true, is_test: rep.is_test,
  }).select("id,code").maybeSingle();
  return (ins as { id: string; code: string } | null) ?? null;
}

/** The rep × chapter link — ONE canonical active link per (rep, chapter), chapter identity carried
 *  by the campus_greek_chapter_id FK (never parsed out of the URL — audit's structural fix). */
export async function ensureRepChapterLink(db: DB, rep: Pick<RepRow, "id" | "is_test">, chapter: { id: string; slug: string; campusSlug: string; orgName: string }): Promise<{ id: string; code: string }> {
  const { data: existing } = await db.from("referral_links").select("id,code")
    .eq("partner_id", rep.id).eq("campus_greek_chapter_id", chapter.id).eq("active", true)
    .order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (existing?.id) return existing as { id: string; code: string };
  const { generateUniqueCode } = await import("@/lib/referral.server");
  const code = await generateUniqueCode();
  const { data: ins, error } = await db.from("referral_links").insert({
    code, partner_id: rep.id, label: chapter.orgName,
    destination_url: `/go/${chapter.campusSlug}/${chapter.slug}`,
    campus_greek_chapter_id: chapter.id, active: true, is_test: rep.is_test,
  }).select("id,code").single();
  if (error) throw new Error(error.message);
  return ins as { id: string; code: string };
}

// ── campus + chapter loading (shared by workspace + kit) ─────────────────────────────────────
type CampusBits = { id: string; slug: string; name: string; courseCode: string | null };

async function campusBits(db: DB, campusId: string): Promise<CampusBits | null> {
  const { data: c } = await db.from("campuses").select("id,slug,name,short_name,course_family_codes_json").eq("id", campusId).maybeSingle();
  if (!c?.slug) return null;
  const raw = c.course_family_codes_json;
  const codes = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
  return {
    id: c.id as string, slug: c.slug as string,
    name: canonicalSchoolName(c.slug as string, (c.short_name as string) || (c.name as string)),
    courseCode: (((codes?.intro_1 ?? "") as string).trim() || null),
  };
}

async function chapterInCampus(db: DB, chapterId: string, campusId: string): Promise<{ id: string; slug: string; greek_org_id: string | null; council: string | null; nickname: string | null; claim_status: string | null } | null> {
  const { data } = await db.from("campus_greek_chapters")
    .select("id,slug,greek_org_id,council,nickname,claim_status,campus_id,archived_at")
    .eq("id", chapterId).maybeSingle();
  if (!data?.id || data.campus_id !== campusId || data.archived_at) return null;
  return data as never;
}

// ── THE WORKSPACE ────────────────────────────────────────────────────────────────────────────
export const getRepWorkspace = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ legacyToken: z.string().max(80).optional().nullable() }).parse(d))
  .handler(async ({ data }): Promise<RepWorkspaceResult> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error, state: s.state };
    return buildWorkspace(db, s.rep);
  });

/** The one workspace builder — used by the rep route AND (read-only) by admin view-as. */
export async function buildWorkspace(db: DB, rep: RepRow): Promise<RepWorkspaceResult> {
  const term = termFor();
  const tid = termId(term);
  const campus = rep.campus_id ? await campusBits(db, rep.campus_id) : null;

  // ── my links (also feeds impact + per-chapter stats) ──
  const { data: linkRows } = await db.from("referral_links")
    .select("id,code,campus_greek_chapter_id").eq("partner_id", rep.id).eq("active", true).limit(500);
  const links = (linkRows ?? []) as Array<{ id: string; code: string; campus_greek_chapter_id: string | null }>;
  const linkIds = links.map((l) => l.id);
  const mainLinkRow = links.find((l) => !l.campus_greek_chapter_id) ?? null;
  const linkByChapter = new Map(links.filter((l) => l.campus_greek_chapter_id).map((l) => [l.campus_greek_chapter_id as string, l]));

  // Clicks: humans only; a real rep's numbers exclude test rows.
  const clicksByLink = new Map<string, number>();
  const anonSeen = new Set<string>();
  let clicks = 0;
  if (linkIds.length) {
    let q = db.from("referral_clicks").select("link_id,anon_id,is_test").in("link_id", linkIds).eq("is_bot", false).limit(20000);
    if (!rep.is_test) q = q.eq("is_test", false);
    const { data: clk } = await q;
    for (const r of (clk ?? []) as Array<{ link_id: string; anon_id: string | null }>) {
      clicks++;
      clicksByLink.set(r.link_id, (clicksByLink.get(r.link_id) ?? 0) + 1);
      if (r.anon_id) anonSeen.add(r.anon_id);
    }
  }

  // Conversions + revenue (server-recorded; amount_cents is never client-supplied).
  const convByLink = new Map<string, { signups: number; purchases: number }>();
  let signups = 0, purchases = 0, revenueCents = 0;
  {
    let q = db.from("referral_conversions").select("link_id,kind,amount_cents").eq("partner_id", rep.id).limit(20000);
    if (!rep.is_test) q = q.eq("is_test", false);
    const { data: conv } = await q;
    for (const r of (conv ?? []) as Array<{ link_id: string | null; kind: string; amount_cents: number }>) {
      const e = convByLink.get(r.link_id ?? "") ?? { signups: 0, purchases: 0 };
      if (r.kind === "signup") { e.signups++; signups++; }
      else { e.purchases++; purchases++; revenueCents += r.amount_cents ?? 0; }
      convByLink.set(r.link_id ?? "", e);
    }
  }

  // Commission ledger by status.
  let pendingCents = 0, approvedCents = 0, paidCents = 0;
  {
    let q = db.from("referral_commissions").select("commission_cents,status").eq("partner_id", rep.id).limit(20000);
    if (!rep.is_test) q = q.eq("is_test", false);
    const { data: comm } = await q;
    for (const r of (comm ?? []) as Array<{ commission_cents: number; status: string }>) {
      if (r.status === "pending") pendingCents += r.commission_cents ?? 0;
      else if (r.status === "approved") approvedCents += r.commission_cents ?? 0;
      else if (r.status === "paid") paidCents += r.commission_cents ?? 0;
    }
  }

  // ── my activity rollups ──
  const { data: actRows } = await db.from("rep_activity")
    .select("kind,campus_greek_chapter_id").eq("partner_id", rep.id).limit(10000);
  const acts = (actRows ?? []) as Array<{ kind: string; campus_greek_chapter_id: string | null }>;
  const kitsInitiated = acts.filter((a) => a.kind.startsWith("share_kit_")).length;
  const flyersDownloaded = acts.filter((a) => a.kind === "flyer_downloaded").length;
  const housePostedChapters = new Set(acts.filter((a) => a.kind === "house_posted" && a.campus_greek_chapter_id).map((a) => a.campus_greek_chapter_id as string));
  const kitSharedChapters = new Set(acts.filter((a) => (a.kind.startsWith("share_kit_") || a.kind === "link_copied") && a.campus_greek_chapter_id).map((a) => a.campus_greek_chapter_id as string));

  // ── contacts I submitted + their QC outcome ──
  const { data: myContacts } = await db.from("growth_public_contacts")
    .select("id,entity_id").eq("submitted_by_partner_id", rep.id).limit(2000);
  const mine = (myContacts ?? []) as Array<{ id: string; entity_id: string }>;
  let contactsApproved = 0;
  if (mine.length) {
    const { data: qc } = await db.from("growth_contact_qc").select("source_id,qc_action")
      .eq("contact_source", "growth_public_contacts").in("source_id", mine.map((m) => m.id)).limit(2000);
    contactsApproved = ((qc ?? []) as Array<{ qc_action: string }>).filter((r) => r.qc_action === "approve").length;
  }
  const verifiedActs = acts.filter((a) => a.kind === "contact_verified").length;

  // ── assignments (mine, and everyone's for this term to mark reserved chapters) ──
  const { data: myAsgRows } = await db.from("rep_chapter_assignments")
    .select("campus_greek_chapter_id,status,term_id").eq("partner_id", rep.id).limit(2000);
  const myAsg = (myAsgRows ?? []) as Array<{ campus_greek_chapter_id: string; status: AssignmentStatus; term_id: string }>;
  const myLive = new Map(myAsg.filter((a) => a.term_id === tid && (a.status === "reserved" || a.status === "qualified"))
    .map((a) => [a.campus_greek_chapter_id, a.status]));
  const { data: termAsgRows } = await db.from("rep_chapter_assignments")
    .select("campus_greek_chapter_id,partner_id,status").eq("term_id", tid).in("status", ["reserved", "qualified"]).limit(5000);
  const othersLive = new Set(((termAsgRows ?? []) as Array<{ campus_greek_chapter_id: string; partner_id: string }>)
    .filter((a) => a.partner_id !== rep.id).map((a) => a.campus_greek_chapter_id));

  // ── the campus chapter directory (SOCIAL councils only) ──
  const chapters: RepChapterRow[] = [];
  if (campus) {
    const { data: chRows } = await db.from("campus_greek_chapters")
      .select("id,slug,greek_org_id,council,nickname,claim_status")
      .eq("campus_id", campus.id).is("archived_at", null).limit(1000);
    const rows = ((chRows ?? []) as Array<{ id: string; slug: string; greek_org_id: string | null; council: string | null; nickname: string | null; claim_status: string | null }>)
      .map((r) => ({ ...r, social: socialCouncil(r.council) }))
      .filter((r) => r.social !== null);

    // org names + letters (by campus-wide org id set — one IN over ~60 ids, not per row)
    const orgIds = Array.from(new Set(rows.map((r) => r.greek_org_id).filter(Boolean))) as string[];
    const orgById = new Map<string, { name: string; letters: string | null }>();
    for (let i = 0; i < orgIds.length; i += 100) {
      const { data: orgs } = await db.from("greek_orgs").select("id,name,letters").in("id", orgIds.slice(i, i + 100));
      for (const o of (orgs ?? []) as Array<{ id: string; name: string; letters: string | null }>) orgById.set(o.id, { name: o.name, letters: o.letters ?? null });
    }

    // member counts (campus-scoped query, no giant IN)
    const { data: metricRows } = await db.from("greek_chapter_academic_metrics")
      .select("campus_greek_chapter_id,latest_member_count").eq("campus_id", campus.id).limit(2000);
    const memberByChapter = new Map(((metricRows ?? []) as Array<{ campus_greek_chapter_id: string; latest_member_count: number | null }>)
      .map((m) => [m.campus_greek_chapter_id, m.latest_member_count]));

    // contact counts (campus-scoped)
    const { data: gpcRows } = await db.from("growth_public_contacts")
      .select("entity_id,submitted_by_partner_id").eq("campus_id", campus.id).eq("entity_type", "chapter").limit(20000);
    const contactsTotal = new Map<string, number>();
    const contactsMine = new Map<string, number>();
    for (const r of (gpcRows ?? []) as Array<{ entity_id: string; submitted_by_partner_id: string | null }>) {
      contactsTotal.set(r.entity_id, (contactsTotal.get(r.entity_id) ?? 0) + 1);
      if (r.submitted_by_partner_id === rep.id) contactsMine.set(r.entity_id, (contactsMine.get(r.entity_id) ?? 0) + 1);
    }

    for (const r of rows) {
      const org = r.greek_org_id ? orgById.get(r.greek_org_id) : undefined;
      const link = linkByChapter.get(r.id) ?? null;
      const cv = link ? (convByLink.get(link.id) ?? { signups: 0, purchases: 0 }) : { signups: 0, purchases: 0 };
      const myA = (myLive.get(r.id) ?? null) as AssignmentStatus | null;
      const st = chapterState({
        claimed: r.claim_status === "claimed",
        signups: cv.signups,
        housePosted: housePostedChapters.has(r.id),
        kitShared: kitSharedChapters.has(r.id),
        myAssignment: myA,
        otherAssignment: othersLive.has(r.id),
      });
      chapters.push({
        id: r.id, slug: r.slug, orgName: org?.name ?? r.slug.replace(/-/g, " "), letters: org?.letters ?? null,
        nickname: r.nickname, council: r.social, memberCount: memberByChapter.get(r.id) ?? null,
        claimed: r.claim_status === "claimed", state: st, myAssignment: myA,
        contactsMine: contactsMine.get(r.id) ?? 0, contactsTotal: contactsTotal.get(r.id) ?? 0,
        clicks: link ? (clicksByLink.get(link.id) ?? 0) : 0, signups: cv.signups,
        linkCode: link?.code ?? null, housePosted: housePostedChapters.has(r.id),
      });
    }
    // Default order: largest chapters first, unknown sizes after, then by name — the sales-territory read.
    chapters.sort((a, b) => (b.memberCount ?? -1) - (a.memberCount ?? -1) || a.orgName.localeCompare(b.orgName));
  }

  // ── campus-wide activity (labelled CAMPUS, not "yours") — last 7 days ──
  const campusActivity = { students: 0, identified: 0, questionsAnswered: 0, studyMs: 0 };
  if (campus) {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    let q = db.from("practice_attempts").select("session_id,user_id,event,ms").eq("campus", campus.slug).gte("created_at", since).limit(20000);
    if (!rep.is_test) q = q.eq("is_test", false);
    const { data: pa } = await q;
    const sessions = new Set<string>(); const users = new Set<string>();
    for (const r of (pa ?? []) as Array<{ session_id: string | null; user_id: string | null; event: string; ms: number | null }>) {
      if (r.session_id) sessions.add(r.session_id);
      if (r.user_id) users.add(r.user_id);
      if (r.event === "answer") campusActivity.questionsAnswered++;
      campusActivity.studyMs += r.ms ?? 0;
    }
    campusActivity.students = sessions.size;
    campusActivity.identified = users.size;
  }

  // onboarding video — configurable; the card hides cleanly when unset.
  let onboardingVideoUrl: string | null = null;
  try {
    const { data: ss } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    const v = (ss?.settings as Record<string, unknown> | null)?.repOnboardingVideoUrl;
    if (typeof v === "string" && /^https?:\/\//.test(v)) onboardingVideoUrl = v;
  } catch { /* optional */ }

  const rule = effectiveRule({ commission_type: null, commission_rate: null },
    { default_commission_type: rep.default_commission_type as never, default_commission_rate: rep.default_commission_rate });
  const np = nextPayout(Date.now());

  return {
    ok: true,
    repId: rep.id, name: rep.name, repStatus: (rep.rep_status ?? "active") as never, isTest: rep.is_test,
    campusSlug: campus?.slug ?? null, campusName: campus?.name ?? null, courseCode: campus?.courseCode ?? null,
    termId: tid, termLabel: term.label,
    mainLink: mainLinkRow ? { code: mainLinkRow.code, shortUrl: `${ORIGIN}/r/${mainLinkRow.code}` } : null,
    impact: {
      chaptersReserved: myAsg.filter((a) => a.term_id === tid && a.status === "reserved").length,
      chaptersQualified: myAsg.filter((a) => a.term_id === tid && a.status === "qualified").length,
      contactsSubmitted: mine.length + verifiedActs,
      contactsApproved,
      kitsInitiated, flyersDownloaded, housePosted: housePostedChapters.size,
      clicks, uniqueVisitors: anonSeen.size, signups, purchases, revenueCents,
      commissionPendingCents: pendingCents, commissionApprovedCents: approvedCents, commissionPaidCents: paidCents,
    },
    campus: campusActivity,
    chapters,
    venmo: rep.venmo, ruleLabel: ruleLabel(rule),
    payout: { nextLabel: np.label, dueCents: approvedCents },
    onboardingVideoUrl,
  };
}

// ── CONTACT SUBMISSION → RESERVATION ─────────────────────────────────────────────────────────
export const submitRepContact = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    chapterId: z.string().uuid(),
    name: z.string().trim().max(160).optional().nullable(),
    role: z.string().trim().max(80).optional().nullable(),
    email: z.string().trim().max(200).optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    instagram: z.string().trim().max(200).optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; assignment?: "reserved" | "already_mine" | "reserved_by_other"; verifiedExisting?: boolean }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const rep = s.rep;
    if (!rep.campus_id) return { ok: false, error: "Your rep account has no campus — reach out to Lee." };

    const email = (data.email ?? "").trim().toLowerCase() || null;
    let phone: string | null = null;
    if ((data.phone ?? "").trim()) {
      const { normalizePhoneE164 } = await import("@/lib/greek-chapters.functions");
      phone = normalizePhoneE164(data.phone!);
      if (!phone) return { ok: false, error: "That phone number doesn't look right." };
    }
    if (!email && !phone) return { ok: false, error: "Add an email or a phone number — one of the two is required." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "That email doesn't look right." };
    const instagram = normalizeInstagram(data.instagram);

    // CAMPUS + CHAPTER SCOPE — the server enforces it, not the UI.
    const ch = await chapterInCampus(db, data.chapterId, rep.campus_id);
    if (!ch) return { ok: false, error: "That chapter isn't on your campus." };

    // ── dedupe against the canonical store for THIS chapter ──
    const { data: existingRows } = await db.from("growth_public_contacts")
      .select("id,email,phone,instagram_url,last_verified_at").eq("entity_type", "chapter").eq("entity_id", ch.id).limit(500);
    const existing = ((existingRows ?? []) as Array<{ id: string; email: string | null; phone: string | null; instagram_url: string | null }>)
      .find((r) =>
        (email && (r.email ?? "").toLowerCase() === email) ||
        (phone && r.phone === phone) ||
        (instagram && (r.instagram_url ?? "").toLowerCase() === instagram));

    const nowIso = new Date().toISOString();
    let contactId: string;
    let verifiedExisting = false;

    if (existing) {
      // VERIFY path: the rep confirmed a known contact. Enrich missing fields, stamp verification.
      verifiedExisting = true;
      contactId = existing.id;
      const patch: Record<string, unknown> = { last_verified_at: nowIso, last_seen: nowIso, is_current: true };
      if (phone && !existing.phone) patch.phone = phone;
      if (data.name?.trim()) patch.name = data.name.trim();
      if (data.role?.trim()) patch.role = data.role.trim();
      await db.from("growth_public_contacts").update(patch).eq("id", existing.id);
      await db.from("growth_contact_qc").update({ last_verified_at: nowIso, freshness_status: "current" })
        .eq("contact_source", "growth_public_contacts").eq("source_id", existing.id)
        .then(() => undefined, () => undefined);
      await activity(db, { partner_id: rep.id, kind: "contact_verified", campus_greek_chapter_id: ch.id, growth_contact_id: existing.id, is_test: rep.is_test });
    } else {
      // NEW contact → canonical store, provenance to the rep, QC pending (NEVER self-approved).
      const role = data.role?.trim() || null;
      const { data: ins, error } = await db.from("growth_public_contacts").insert({
        campus_id: rep.campus_id, entity_type: "chapter", entity_id: ch.id, category: "chapter",
        contact_type: contactTypeForRole(role ?? ""), name: data.name?.trim() || null, role,
        email, phone, instagram_url: instagram,
        is_current: true, first_seen: nowIso, last_seen: nowIso, last_verified_at: nowIso, retrieved_at: nowIso,
        source_type: "rep_submission", confidence: "medium",
        submitted_by_partner_id: rep.id, notes: data.notes?.trim() || null,
      }).select("id").single();
      if (error || !ins?.id) return { ok: false, error: error?.message ?? "Couldn't save the contact." };
      contactId = ins.id as string;

      await db.from("growth_contact_qc").insert({
        contact_source: "growth_public_contacts", source_id: contactId, campus_id: rep.campus_id,
        entity_type: "chapter", entity_id: ch.id, council_type: socialCouncil(ch.council),
        campaign_purpose: "STUDENT_DISTRIBUTION", contact_type: contactTypeForRole(role ?? ""),
        name: data.name?.trim() || null, role, email, instagram,
        source_type: "rep_submission", confidence: "medium", last_verified_at: nowIso,
        freshness_status: "current", outreach_eligible: false,
        review_reason: "rep submission — awaiting QC", qc_action: "pending",
      }).then(() => undefined, (e: unknown) => console.warn("gcq insert failed", e));

      await activity(db, { partner_id: rep.id, kind: "contact_submitted", campus_greek_chapter_id: ch.id, growth_contact_id: contactId, is_test: rep.is_test });
    }

    // ── FIRST PERSON WINS: try to reserve the chapter for this term ──
    const tid = termId(termFor());
    const { data: live } = await db.from("rep_chapter_assignments")
      .select("id,partner_id,status,sourced_contact_id").eq("campus_greek_chapter_id", ch.id).eq("term_id", tid)
      .in("status", ["reserved", "qualified"]).maybeSingle();

    if (live?.partner_id === rep.id) {
      if (!live.sourced_contact_id) await db.from("rep_chapter_assignments").update({ sourced_contact_id: contactId }).eq("id", live.id);
      return { ok: true, assignment: "already_mine", verifiedExisting };
    }
    if (live) return { ok: true, assignment: "reserved_by_other", verifiedExisting };

    const { error: raceErr } = await db.from("rep_chapter_assignments").insert({
      partner_id: rep.id, campus_greek_chapter_id: ch.id, term_id: tid, status: "reserved",
      sourced_contact_id: contactId, is_test: rep.is_test, created_by: `rep:${rep.id}`,
    });
    if (raceErr) {
      // The unique partial index fired — someone else won the race between our check and insert.
      return { ok: true, assignment: "reserved_by_other", verifiedExisting };
    }

    // Reservation landed: mint the rep×chapter link now so the kit is ready the moment the drawer updates.
    try {
      const campus = await campusBits(db, rep.campus_id);
      let orgName = ch.slug.replace(/-/g, " ");
      if (ch.greek_org_id) {
        const { data: org } = await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle();
        if (org?.name) orgName = org.name as string;
      }
      if (campus) {
        const link = await ensureRepChapterLink(db, rep, { id: ch.id, slug: ch.slug, campusSlug: campus.slug, orgName });
        await db.from("rep_chapter_assignments").update({ referral_link_id: link.id })
          .eq("campus_greek_chapter_id", ch.id).eq("term_id", tid).eq("partner_id", rep.id);
      }
    } catch (e) { console.warn("rep chapter link deferred:", (e as Error).message); }

    await activity(db, { partner_id: rep.id, kind: "chapter_reserved", campus_greek_chapter_id: ch.id, growth_contact_id: contactId, is_test: rep.is_test });
    return { ok: true, assignment: "reserved", verifiedExisting };
  });

// ── SHARE KIT ────────────────────────────────────────────────────────────────────────────────
export const getShareKit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    chapterId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data }): Promise<ShareKitResult> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const rep = s.rep;
    if (!rep.campus_id) return { ok: false, error: "Your rep account has no campus." };

    const ch = await chapterInCampus(db, data.chapterId, rep.campus_id);
    if (!ch) return { ok: false, error: "That chapter isn't on your campus." };

    // The kit unlocks with the assignment — reserved or qualified, never before.
    const tid = termId(termFor());
    const { data: asg } = await db.from("rep_chapter_assignments").select("id,status,referral_link_id")
      .eq("campus_greek_chapter_id", ch.id).eq("term_id", tid).eq("partner_id", rep.id)
      .in("status", ["reserved", "qualified"]).maybeSingle();
    if (!asg?.id) return { ok: false, error: "Add a contact for this chapter first — that unlocks the share kit." };

    const campus = await campusBits(db, rep.campus_id);
    if (!campus) return { ok: false, error: "Campus not found." };

    let orgName = ch.slug.replace(/-/g, " ");
    if (ch.greek_org_id) {
      const { data: org } = await db.from("greek_orgs").select("name").eq("id", ch.greek_org_id).maybeSingle();
      if (org?.name) orgName = org.name as string;
    }
    const displayName = (ch.nickname ?? "").trim() || orgName;

    const link = await ensureRepChapterLink(db, rep, { id: ch.id, slug: ch.slug, campusSlug: campus.slug, orgName });
    if (!asg.referral_link_id) {
      await db.from("rep_chapter_assignments").update({ referral_link_id: link.id }).eq("id", asg.id).then(() => undefined, () => undefined);
    }
    const shortUrl = `${ORIGIN}/r/${link.code}`;

    const { qrDataUri } = await import("@/lib/referral-qr.server");
    const qr = await qrDataUri(shortUrl);

    // Contacts THE REP submitted for this chapter (their workflow, not the Growth CRM).
    const { data: cRows } = await db.from("growth_public_contacts")
      .select("id,name,role,email,phone").eq("entity_type", "chapter").eq("entity_id", ch.id)
      .eq("submitted_by_partner_id", rep.id).order("created_at", { ascending: true }).limit(50);
    const contactRows = (cRows ?? []) as Array<{ id: string; name: string | null; role: string | null; email: string | null; phone: string | null }>;
    const qcById = new Map<string, string>();
    if (contactRows.length) {
      const { data: qc } = await db.from("growth_contact_qc").select("source_id,qc_action")
        .eq("contact_source", "growth_public_contacts").in("source_id", contactRows.map((c) => c.id)).limit(100);
      for (const r of (qc ?? []) as Array<{ source_id: string; qc_action: string }>) qcById.set(r.source_id, r.qc_action);
    }

    const { count: posted } = await db.from("rep_activity").select("id", { count: "exact", head: true })
      .eq("partner_id", rep.id).eq("campus_greek_chapter_id", ch.id).eq("kind", "house_posted");

    const msg = shareMessage({ campusName: campus.name, chapterName: displayName, courseCode: campus.courseCode, shortUrl });
    const em = shareEmail({ campusName: campus.name, chapterName: displayName, courseCode: campus.courseCode, shortUrl });

    await activity(db, { partner_id: rep.id, kind: "share_kit_opened", campus_greek_chapter_id: ch.id, referral_link_id: link.id, is_test: rep.is_test });

    return {
      ok: true,
      chapterId: ch.id, chapterName: displayName, chapterSlug: ch.slug, campusSlug: campus.slug,
      courseCode: campus.courseCode, shortUrl, code: link.code, qrDataUri: qr,
      message: msg, email: em,
      flyerUrl: `/api/flyer/${campus.slug}/${ch.slug}?ref=${link.code}`,
      contacts: contactRows.map((c) => ({
        id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone,
        qcState: (qcById.get(c.id) === "approve" ? "approved" : qcById.get(c.id) === "reject" ? "rejected" : "pending"),
      })),
      housePosted: (posted ?? 0) > 0,
    };
  });

// ── SHARE ACTION LOGGING (initiation, never "delivered") ─────────────────────────────────────
export const logRepShare = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    chapterId: z.string().uuid().optional().nullable(),
    contactId: z.string().uuid().optional().nullable(),
    method: z.enum([...SHARE_METHODS, "qr"] as [string, ...string[]]),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false };
    const rep = s.rep;
    // Chapter scope check when a chapter is named (never log against someone else's campus).
    let chapterId: string | null = null;
    if (data.chapterId && rep.campus_id) {
      const ch = await chapterInCampus(db, data.chapterId, rep.campus_id);
      chapterId = ch?.id ?? null;
    }
    const kind = data.method === "qr" ? "qr_downloaded" : shareKindForMethod[data.method as ShareMethod];
    await activity(db, {
      partner_id: rep.id, kind, campus_greek_chapter_id: chapterId,
      growth_contact_id: data.contactId ?? null,
      meta: { method: data.method }, is_test: rep.is_test,
    });
    return { ok: true };
  });

// ── HOUSE POSTED (self-reported — labelled that way everywhere it renders) ───────────────────
export const setHousePosted = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    chapterId: z.string().uuid(),
    posted: z.boolean(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const rep = s.rep;
    if (!rep.campus_id) return { ok: false, error: "No campus." };
    const ch = await chapterInCampus(db, data.chapterId, rep.campus_id);
    if (!ch) return { ok: false, error: "That chapter isn't on your campus." };

    if (data.posted) {
      const { count } = await db.from("rep_activity").select("id", { count: "exact", head: true })
        .eq("partner_id", rep.id).eq("campus_greek_chapter_id", ch.id).eq("kind", "house_posted");
      if ((count ?? 0) === 0) {
        await activity(db, { partner_id: rep.id, kind: "house_posted", campus_greek_chapter_id: ch.id, meta: { selfReported: true }, is_test: rep.is_test });
      }
    } else {
      await db.from("rep_activity").delete().eq("partner_id", rep.id).eq("campus_greek_chapter_id", ch.id).eq("kind", "house_posted")
        .then(() => undefined, () => undefined);
    }
    return { ok: true };
  });

// ── VENMO (unchanged behaviour, session-scoped) ──────────────────────────────────────────────
export const updateRepVenmoSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    venmo: z.string().trim().max(120),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; venmo?: string; error?: string }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const { normalizeVenmo } = await import("@/lib/rep-portal");
    const venmo = data.venmo ? normalizeVenmo(data.venmo) : "";
    const { error } = await db.from("referral_partners").update({ venmo: venmo || null }).eq("id", s.rep.id);
    return error ? { ok: false, error: error.message } : { ok: true, venmo };
  });
