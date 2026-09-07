// REP REVIEW — server only. Import DYNAMICALLY inside server-function handlers.
//
// The one place an application is decided, whether Lee taps a link in the review text or an
// admin clicks in the roster: the status flip, the rep number, the coverage map fanning out
// into assignments, the activity row, and the text to the rep in Lee's own words.
//
// SIGNED LINKS. The review text carries two links — approve and deny — that work from Lee's
// phone without logging in. There was no link-signing utility in the repo (every other link is
// an opaque stored token), so this is the smallest honest one: HMAC-SHA256 over
// (partner, decision, issued-at) with the service-role key, the same primitive
// admin-session.functions.ts already uses for the passcode cookie. A GET never decides
// anything — SMS apps prefetch links — the page shows a one-tap confirm; and once an
// application is decided the links are dead, which is what "one-time" means here.
import { canonicalSchoolName } from "@/lib/schools";
import { approvalSms, denialSms, firstName, interviewSms, parseProfile, postInviteSms, type RepProfile, type TargetChapter } from "@/lib/rep-pre-onboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
export type DB = { from: (t: string) => any };

export const SITE_URL = (process.env.PUBLIC_SITE_URL || "https://surviveaccounting.com").replace(/\/$/, "");
export const DASHBOARD_URL = `${SITE_URL}/rep/dashboard`;
export const ONBOARDING_URL = `${SITE_URL}/rep/onboarding`;

/** Lee's phone, the same env chain the founder alerts and the urgent-idea text use. */
export function leePhone(): string {
  return (process.env.FOUNDER_ALERT_PHONE || process.env.LEE_PERSONAL_PHONE || process.env.LEE_URGENT_PHONE || "6012018759").replace(/[^+\d]/g, "");
}

export const MIGRATION_FILE = "20260907_0100_rep_pre_onboarding.sql";
export const MISSING_MIGRATION_ERROR = `MISSING MIGRATION: run migration/supabase-migrations/${MIGRATION_FILE} in the Supabase SQL editor — the rep application is disabled until it's applied.`;

/** PostgREST's two shapes for "that column isn't there". Fail LOUD, never no-op. */
export function isMissingRepColumns(err: { message?: string; code?: string } | null | undefined): boolean {
  const m = String(err?.message ?? "");
  return /rep_profile|rep_number/.test(m) && /does not exist|schema cache|column/i.test(m);
}
export function reportMissingRepMigration(): void {
  // eslint-disable-next-line no-console
  console.error(`[rep] ${MISSING_MIGRATION_ERROR}`);
}

// ---------------------------------------------------------------- SMS, both directions

/** Text Lee. Test-mode rows never page him — the preview is returned for the tester instead. */
export async function textLee(body: string, opts: { isTest: boolean }): Promise<{ ok: boolean; reason?: string }> {
  if (opts.isTest) return { ok: false, reason: "test_sms_suppressed" };
  const { sendSms } = await import("@/lib/greek-chapters.functions");
  const r = await sendSms(leePhone(), body);
  return r.ok ? { ok: true } : { ok: false, reason: r.error };
}

/** Text a rep. Same rule: a test rep's phone is a real person's phone, so it is never sent. */
export async function textRep(rep: { phone: string | null; is_test: boolean }, body: string): Promise<{ ok: boolean; reason?: string }> {
  if (rep.is_test) return { ok: false, reason: "test_sms_suppressed" };
  if (!rep.phone) return { ok: false, reason: "no_phone" };
  const { sendSms } = await import("@/lib/greek-chapters.functions");
  const r = await sendSms(rep.phone, body);
  return r.ok ? { ok: true } : { ok: false, reason: r.error };
}

// ---------------------------------------------------------------- signed review links

const LINK_VERSION = "v1";
const LINK_TTL_MS = 30 * 24 * 3600e3;
/** interview = "read your application and I like it, let's do a call" (nothing decided yet);
 *  approve / deny = after the call. */
export type Decision = "interview" | "approve" | "deny";

function linkKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — cannot sign review links.");
  return k;
}
async function linkSig(partnerId: string, decision: Decision, issued: number): Promise<string> {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", linkKey()).update(`rep-review-${LINK_VERSION}:${partnerId}:${decision}:${issued}`).digest("hex").slice(0, 40);
}
export async function reviewUrl(partnerId: string, decision: Decision, issued = Date.now()): Promise<string> {
  const s = await linkSig(partnerId, decision, issued);
  return `${SITE_URL}/rep/review/${partnerId}/${decision}?t=${issued}.${s}`;
}
export async function verifyReviewToken(partnerId: string, decision: Decision, t: string | null | undefined): Promise<{ ok: true } | { ok: false; why: "malformed" | "expired" | "bad_signature" }> {
  const m = /^(\d{10,16})\.([0-9a-f]{40})$/.exec(t ?? "");
  if (!m) return { ok: false, why: "malformed" };
  const issued = Number(m[1]);
  if (!Number.isFinite(issued) || Date.now() - issued > LINK_TTL_MS) return { ok: false, why: "expired" };
  const want = await linkSig(partnerId, decision, issued);
  const { timingSafeEqual } = await import("node:crypto");
  const a = Buffer.from(want), b = Buffer.from(m[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, why: "bad_signature" };
  return { ok: true };
}

// ---------------------------------------------------------------- the decision

export type RepForReview = {
  id: string; name: string; email: string | null; phone: string | null; campus_id: string | null; is_test: boolean;
  application_status: string | null; own_chapter_id: string | null; rep_profile: unknown; rep_number: number | null;
};
export const REVIEW_COLS = "id,name,email,phone,campus_id,is_test,application_status,own_chapter_id,rep_profile,rep_number";

export async function campusNameFor(db: DB, campusId: string | null): Promise<{ name: string; slug: string | null }> {
  if (!campusId) return { name: "your campus", slug: null };
  const { data: c } = await db.from("campuses").select("slug,name,short_name").eq("id", campusId).maybeSingle();
  if (!c?.slug) return { name: "your campus", slug: null };
  return { name: canonicalSchoolName(c.slug as string, (c.short_name as string) || (c.name as string)), slug: c.slug as string };
}

/** Next rep number. Real reps count from 1; test reps live in their own 9000+ range so the real
 *  count is never inflated by a test run. Unique index catches a race; the caller retries once. */
async function nextRepNumber(db: DB, isTest: boolean): Promise<number> {
  const floor = isTest ? 9000 : 0;
  let q = db.from("referral_partners").select("rep_number").not("rep_number", "is", null).order("rep_number", { ascending: false }).limit(1);
  q = isTest ? q.gte("rep_number", 9001) : q.lt("rep_number", 9000);
  const { data } = await q;
  const max = Number((data as Array<{ rep_number: number }> | null)?.[0]?.rep_number ?? floor);
  return Math.max(max, floor) + 1;
}

/** Coverage for the campus-capacity gate, derived from the rep's own chapter. Lee's admin roster
 *  can still change it afterwards. */
async function deriveCoverage(db: DB, ownChapterId: string | null): Promise<"ifc" | "panhellenic" | "other"> {
  if (!ownChapterId) return "other";
  const { data } = await db.from("campus_greek_chapters").select("council").eq("id", ownChapterId).maybeSingle();
  const c = String(data?.council ?? "").toLowerCase();
  return c === "ifc" ? "ifc" : c === "panhellenic" ? "panhellenic" : "other";
}

/** THE COVERAGE MAP BECOMES THE WORKING LIST. The reach rows (member / knows someone) plus the
 *  pre-onboarding targets. The one-live-assignment-per-chapter index still rules: a chapter
 *  another rep already holds is SKIPPED, not stolen. Lifted from adminReviewApplication so both
 *  doors do the same thing. */
export async function fanOutAssignments(db: DB, rep: { id: string; campus_id: string | null; is_test: boolean; rep_profile?: unknown }, by: string): Promise<{ assignedCount: number; skipped: number }> {
  if (!rep.campus_id) return { assignedCount: 0, skipped: 0 };
  const { termFor, termId } = await import("@/lib/terms");
  const tid = termId(termFor());
  const { data: reachRows } = await db.from("rep_chapter_reach").select("campus_greek_chapter_id").eq("partner_id", rep.id).limit(1000);
  const profile = parseProfile(rep.rep_profile);
  const ids = new Set<string>([
    ...((reachRows ?? []) as Array<{ campus_greek_chapter_id: string }>).map((r) => r.campus_greek_chapter_id),
    ...((profile.targets ?? []) as TargetChapter[]).map((t) => t.id),
  ]);
  const chapterIds = Array.from(ids);
  let assignedCount = 0, skipped = 0;
  if (!chapterIds.length) return { assignedCount, skipped };

  const { data: campus } = await db.from("campuses").select("slug").eq("id", rep.campus_id).maybeSingle();
  const { data: chRows } = await db.from("campus_greek_chapters")
    .select("id,slug,nickname,greek_org_id").eq("campus_id", rep.campus_id).in("id", chapterIds.slice(0, 200));
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
      is_test: !!rep.is_test, created_by: by,
    }).select("id").maybeSingle();
    if (aErr || !ins?.id) { skipped++; continue; }
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
  return { assignedCount, skipped };
}

export type DecideResult =
  | { ok: true; decision: Decision; repNumber: number | null; sms: { ok: boolean; reason?: string; preview: string }; assignedCount?: number; skipped?: number; leeSms?: string }
  | { ok: false; error: string; already?: string };

export async function decideRepApplication(db: DB, i: { partnerId: string; decision: Decision; by: string; coverage?: "ifc" | "panhellenic" | "both" | "other" | null }): Promise<DecideResult> {
  const { data: row, error } = await db.from("referral_partners").select(REVIEW_COLS).eq("id", i.partnerId).eq("type", "campus_rep").maybeSingle();
  if (error) { if (isMissingRepColumns(error)) { reportMissingRepMigration(); return { ok: false, error: MISSING_MIGRATION_ERROR }; } return { ok: false, error: error.message }; }
  const rep = row as RepForReview | null;
  if (!rep?.id) return { ok: false, error: "Rep not found." };
  const st = rep.application_status ?? "setup";
  if (st === "approved" || st === "declined") return { ok: false, error: `Already ${st} — nothing changed.`, already: st };

  const nowIso = new Date().toISOString();
  const profile: RepProfile = parseProfile(rep.rep_profile);
  const campus = await campusNameFor(db, rep.campus_id);

  // INTERVIEW: nothing is decided. The applicant gets Lee's "I like it, let's talk" text; Lee
  // gets the two links that decide it after the call. Idempotent — a second tap re-sends
  // Lee's links but never re-texts the applicant.
  if (i.decision === "interview") {
    if (st !== "submitted") return { ok: false, error: "They haven't finished the onboarding yet — the call comes after it." };
    const [approveUrl, denyUrl] = await Promise.all([reviewUrl(rep.id, "approve"), reviewUrl(rep.id, "deny")]);
    const leeBody = postInviteSms({ name: firstName(rep.name), approveUrl, denyUrl });
    let body = profile.interview?.preview ?? interviewSms({ firstName: firstName(rep.name) });
    let sms: { ok: boolean; reason?: string } = { ok: true, reason: "already_invited" };
    if (!profile.interview?.invitedAt) {
      body = interviewSms({ firstName: firstName(rep.name) });
      sms = await textRep(rep, body);
      const { error: upErr } = await db.from("referral_partners").update({
        rep_profile: { ...profile, interview: { invitedAt: nowIso, by: i.by, smsOk: sms.ok, ...(rep.is_test ? { preview: body } : {}) } },
      }).eq("id", rep.id);
      if (upErr) return { ok: false, error: upErr.message };
      await db.from("rep_activity").insert({ partner_id: rep.id, kind: "call_scheduled", meta: { by: i.by, via: "review", invited: true }, is_test: !!rep.is_test }).then(() => undefined, () => undefined);
    }
    await textLee(leeBody, { isTest: !!rep.is_test });
    return { ok: true, decision: "interview", repNumber: null, sms: { ...sms, preview: body }, leeSms: leeBody };
  }

  const review = { ...(profile.review ?? {}), decidedAt: nowIso, decision: i.decision, by: i.by };

  if (i.decision === "deny") {
    const { error: upErr } = await db.from("referral_partners").update({
      application_status: "declined", reviewed_at: nowIso, reviewed_by: i.by,
      rep_profile: { ...profile, review },
    }).eq("id", rep.id);
    if (upErr) return { ok: false, error: upErr.message };
    await db.from("rep_activity").insert({ partner_id: rep.id, kind: "application_declined", meta: { by: i.by, via: "review" }, is_test: !!rep.is_test }).then(() => undefined, () => undefined);
    const body = denialSms({ firstName: firstName(rep.name), campus: campus.name });
    const sms = await textRep(rep, body);
    return { ok: true, decision: "deny", repNumber: null, sms: { ...sms, preview: body } };
  }

  // APPROVE: number, coverage, status, the coverage map → assignments, then Lee's text.
  const coverage = i.coverage ?? (await deriveCoverage(db, rep.own_chapter_id));
  let repNumber = rep.rep_number ?? null;
  for (let attempt = 0; attempt < 2 && repNumber == null; attempt++) {
    const n = await nextRepNumber(db, !!rep.is_test);
    const { error: upErr } = await db.from("referral_partners").update({
      application_status: "approved", rep_coverage: coverage,
      reviewed_at: nowIso, reviewed_by: i.by, approved_at: nowIso, approved_by: i.by,
      rep_number: n, rep_profile: { ...profile, review },
    }).eq("id", rep.id);
    if (!upErr) { repNumber = n; break; }
    if (attempt === 1 || !/rep_number/.test(upErr.message)) return { ok: false, error: upErr.message };
  }
  if (rep.rep_number != null) {
    const { error: upErr } = await db.from("referral_partners").update({
      application_status: "approved", rep_coverage: coverage, reviewed_at: nowIso, reviewed_by: i.by, approved_at: nowIso, approved_by: i.by,
      rep_profile: { ...profile, review },
    }).eq("id", rep.id);
    if (upErr) return { ok: false, error: upErr.message };
  }

  const fan = await fanOutAssignments(db, { ...rep, rep_profile: profile }, `review:${i.by}`);
  await db.from("rep_activity").insert({
    partner_id: rep.id, kind: "application_approved", meta: { by: i.by, via: "review", coverage, repNumber, ...fan }, is_test: !!rep.is_test,
  }).then(() => undefined, () => undefined);

  const body = approvalSms({ repNumber: repNumber ?? 0, dashboardUrl: DASHBOARD_URL });
  const sms = await textRep(rep, body);
  return { ok: true, decision: "approve", repNumber, sms: { ...sms, preview: body }, ...fan };
}
