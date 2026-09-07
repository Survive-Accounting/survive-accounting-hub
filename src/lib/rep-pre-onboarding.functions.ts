// REP APPLICATION & PRE-ONBOARDING — server functions.
//
//   getRepJoinCampus      /rep/join/<campus>: the campus preloaded (name, course code, chapters)
//   getPreOnboarding      /rep/onboarding: where the rep is, what's answered, the videos
//   savePreOnboardingStep one step at a time — progress saves, they can leave and come back
//   submitPreOnboarding   all six done (+ optional résumé) → ready for review → Lee's text
//   getReviewLink / decideFromReviewLink   the two links in Lee's text, confirm-then-decide
//   sendRepBetaFeedback   "what was confusing here?" → Lee's phone
//   attachDmScreenshot    attribution: the DM screenshot logged with the link send
//
// Scope law (same as every rep fn): reads/writes resolve the rep from the session cookie and
// stay inside their own row + their campus's public chapter directory. Nothing here approves.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { canonicalSchoolName, schoolByAny } from "@/lib/schools";
import { socialCouncil } from "@/lib/rep-workspace.functions";
import { TEST_CAMPUS_SLUG } from "@/lib/test-mode";
import type { ApplicationStatus } from "@/lib/rep-shared";
import {
  COMFORT_OPTIONS, STEP_KEYS, flowState, parseProfile, reviewSummarySms, stepDef, stepProgress,
  type FlowState, type RepProfile, type StepKey, type TargetChapter,
} from "@/lib/rep-pre-onboarding";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export type JoinChapter = { id: string; name: string; letters: string | null; council: string | null };

/** The campus directory, social councils only, the same shape the old in-workspace onboarding used. */
export async function campusChapterList(db: DB, campusId: string): Promise<JoinChapter[]> {
  const { data: chRows } = await db.from("campus_greek_chapters")
    .select("id,slug,greek_org_id,council,nickname").eq("campus_id", campusId).is("archived_at", null).limit(1000);
  const rows = ((chRows ?? []) as Array<{ id: string; slug: string; greek_org_id: string | null; council: string | null; nickname: string | null }>)
    .map((r) => ({ ...r, social: socialCouncil(r.council) }))
    .filter((r) => r.social !== null);
  const orgIds = Array.from(new Set(rows.map((r) => r.greek_org_id).filter(Boolean))) as string[];
  const orgById = new Map<string, { name: string; letters: string | null }>();
  for (let i = 0; i < orgIds.length; i += 100) {
    const { data: orgs } = await db.from("greek_orgs").select("id,name,letters").in("id", orgIds.slice(i, i + 100));
    for (const o of (orgs ?? []) as Array<{ id: string; name: string; letters: string | null }>) orgById.set(o.id, { name: o.name, letters: o.letters ?? null });
  }
  return rows
    .map((r) => {
      const org = r.greek_org_id ? orgById.get(r.greek_org_id) : undefined;
      return { id: r.id, name: r.nickname || org?.name || r.slug.replace(/-/g, " "), letters: org?.letters ?? null, council: r.social };
    })
    .sort((a, b) => (a.council ?? "").localeCompare(b.council ?? "") || a.name.localeCompare(b.name));
}

async function siteSettings(db: DB): Promise<Record<string, unknown>> {
  try {
    const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
    return ((data?.settings as Record<string, unknown> | null) ?? {});
  } catch { return {}; }
}
/** BETA MODE (spec §7): on unless Lee turns it off — `site_settings.settings.repBetaMode = false`. */
const betaOn = (s: Record<string, unknown>): boolean => s.repBetaMode !== false;
/** The step videos: `site_settings.settings.repOnboardingVideos = { step1: <mux public playback id>, … }`. */
const videosOf = (s: Record<string, unknown>): Record<string, string> => {
  const v = s.repOnboardingVideos;
  if (!v || typeof v !== "object") return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, id]) => typeof id === "string" && (id as string).length > 4)) as Record<string, string>;
};

// ---------------------------------------------------------------- /rep/join/<campus>

export type JoinCampus = {
  slug: string; name: string; formalName: string; campusId: string; courseCode: string | null;
  chapters: JoinChapter[]; beta: boolean;
};

export const getRepJoinCampus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ campus: z.string().trim().min(1).max(120) }).parse(d))
  .handler(async ({ data }): Promise<JoinCampus | null> => {
    const db = await admin();
    const settings = await siteSettings(db);
    // The test fixture is not in the static list on purpose (it feeds every picker and sitemap).
    if (data.campus === TEST_CAMPUS_SLUG) {
      const { data: c } = await db.from("campuses").select("id,name,short_name,course_family_codes_json").eq("slug", TEST_CAMPUS_SLUG).maybeSingle();
      if (!c?.id) return null;
      const raw = c.course_family_codes_json;
      const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
      return {
        slug: TEST_CAMPUS_SLUG, name: (c.short_name as string) || (c.name as string), formalName: c.name as string, campusId: c.id as string,
        courseCode: ((j?.intro_1 ?? "") as string).trim() || null, chapters: await campusChapterList(db, c.id as string), beta: betaOn(settings),
      };
    }
    // Accepts the picker id ("ole-miss") or the campus slug — these links get typed and forwarded.
    const s = schoolByAny(data.campus);
    if (!s) return null;
    let formalName = s.name, courseCode = s.courseCode;
    try {
      const { data: c } = await db.from("campuses").select("name,course_family_codes_json").eq("id", s.campusId).maybeSingle();
      if (c) {
        formalName = (c.name as string) || s.name;
        const raw = c.course_family_codes_json;
        const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
        const live = ((j?.intro_1 ?? "") as string).trim();
        if (live) courseCode = live;
      }
    } catch { /* snapshot fallback */ }
    return { slug: s.slug, name: s.name, formalName, campusId: s.campusId, courseCode: courseCode ?? null, chapters: await campusChapterList(db, s.campusId), beta: betaOn(settings) };
  });

// ---------------------------------------------------------------- /rep/onboarding

type RepCols = {
  id: string; name: string; email: string | null; phone: string | null; campus_id: string | null; is_test: boolean;
  application_status: string | null; own_chapter_id: string | null; pitch: string | null; course_status: string | null;
  rep_profile: unknown; rep_number: number | null; onboarding_submitted_at: string | null;
};
const REP_COLS = "id,name,email,phone,campus_id,is_test,application_status,own_chapter_id,pitch,course_status,rep_profile,rep_number,onboarding_submitted_at";

async function loadRep(db: DB, legacyToken: string | null | undefined): Promise<{ rep: RepCols } | { error: string; state?: string }> {
  const { repFromSession } = await import("@/lib/rep-auth.server");
  const s = await repFromSession(db, { legacyToken });
  if (!("rep" in s)) return { error: s.error, state: s.state };
  const { data, error } = await db.from("referral_partners").select(REP_COLS).eq("id", s.rep.id).maybeSingle();
  if (error) {
    const { isMissingRepColumns, MISSING_MIGRATION_ERROR, reportMissingRepMigration } = await import("@/lib/rep-review.server");
    if (isMissingRepColumns(error)) { reportMissingRepMigration(); return { error: MISSING_MIGRATION_ERROR, state: "migration" }; }
    return { error: error.message };
  }
  if (!data?.id) return { error: "That session isn't valid — sign in again.", state: "invalid" };
  return { rep: data as RepCols };
}

export type PreOnboardingState = {
  ok: true;
  flow: FlowState;
  applicationStatus: ApplicationStatus;
  name: string;
  campusName: string;
  campusSlug: string | null;
  courseCode: string | null;
  profile: RepProfile;
  chapters: JoinChapter[];
  videos: Record<string, string>;
  beta: boolean;
  repNumber: number | null;
  isTest: boolean;
  /** Test Mode: what Lee WOULD have received — rendered on the ready screen instead of sent. */
  reviewPreview?: string | null;
};
export type PreOnboardingResult = PreOnboardingState | { ok: false; error: string; state?: string };

export const getPreOnboarding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ legacyToken: z.string().max(80).optional().nullable() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<PreOnboardingResult> => {
    const db = await admin();
    const r = await loadRep(db, data.legacyToken);
    if (!("rep" in r)) return { ok: false, error: r.error, state: r.state };
    const rep = r.rep;
    const settings = await siteSettings(db);
    const profile = parseProfile(rep.rep_profile);
    const st = (rep.application_status ?? "setup") as ApplicationStatus;
    let campusName = "your campus", campusSlug: string | null = null, courseCode: string | null = null;
    if (rep.campus_id) {
      const { data: c } = await db.from("campuses").select("slug,name,short_name,course_family_codes_json").eq("id", rep.campus_id).maybeSingle();
      if (c?.slug) {
        campusSlug = c.slug as string;
        campusName = canonicalSchoolName(campusSlug, (c.short_name as string) || (c.name as string));
        const raw = c.course_family_codes_json;
        const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
        courseCode = ((j?.intro_1 ?? "") as string).trim() || null;
      }
    }
    return {
      ok: true, flow: flowState(st, profile), applicationStatus: st, name: rep.name, campusName, campusSlug, courseCode, profile,
      chapters: rep.campus_id ? await campusChapterList(db, rep.campus_id) : [],
      videos: videosOf(settings), beta: betaOn(settings), repNumber: rep.rep_number, isTest: !!rep.is_test,
      reviewPreview: rep.is_test ? ((profile.review as { preview?: string } | undefined)?.preview ?? null) : null,
    };
  });

const targetSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120), connection: z.boolean() });

export const savePreOnboardingStep = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    step: z.enum(["1", "2", "3", "4", "5", "6"]),
    answer: z.string().trim().max(600).optional().nullable(),
    ack: z.boolean().optional(),
    comfort: z.array(z.string().max(40)).max(10).optional(),
    targets: z.array(targetSchema).max(200).optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; profile?: RepProfile }> => {
    const db = await admin();
    const r = await loadRep(db, data.legacyToken);
    if (!("rep" in r)) return { ok: false, error: r.error };
    const rep = r.rep;
    const st = (rep.application_status ?? "setup") as ApplicationStatus;
    if (st !== "setup") return { ok: false, error: st === "submitted" ? "Your onboarding is already in — Lee has it." : "This application is closed." };

    const def = stepDef(data.step as StepKey);
    const profile = parseProfile(rep.rep_profile);
    const at = new Date().toISOString();
    const steps = { ...(profile.steps ?? {}) };
    const next: RepProfile = { ...profile, steps };

    switch (def.response) {
      case "sentence": {
        const a = (data.answer ?? "").trim();
        if (a.length < 8) return { ok: false, error: "One real sentence — how you'd say it to a friend." };
        steps[def.key] = { at, answer: a };
        break;
      }
      case "ack":
        if (!data.ack) return { ok: false, error: "Tap to acknowledge — that's the whole step." };
        steps[def.key] = { at, ack: true };
        break;
      case "comfort": {
        const known = new Set(COMFORT_OPTIONS.map((o) => o.key));
        const picked = (data.comfort ?? []).filter((k) => known.has(k));
        if (!picked.length) return { ok: false, error: "Pick at least one — \"none of these yet\" counts." };
        steps[def.key] = { at, comfort: picked };
        next.comfort = picked;
        break;
      }
      case "chapters": {
        const targets = (data.targets ?? []) as TargetChapter[];
        if (!targets.length) return { ok: false, error: "Pick at least one chapter to go after — that's the whole job." };
        // CAMPUS SCOPE on every id.
        if (!rep.campus_id) return { ok: false, error: "Your rep account has no campus — text Lee." };
        const ids = Array.from(new Set(targets.map((t) => t.id)));
        let okCount = 0;
        for (let i = 0; i < ids.length; i += 100) {
          const { count } = await db.from("campus_greek_chapters").select("id", { count: "exact", head: true })
            .eq("campus_id", rep.campus_id).in("id", ids.slice(i, i + 100));
          okCount += count ?? 0;
        }
        if (okCount !== ids.length) return { ok: false, error: "One of those chapters isn't on your campus." };
        steps[def.key] = { at, targets };
        next.targets = targets;
        break;
      }
    }

    const { error } = await db.from("referral_partners").update({ rep_profile: next }).eq("id", rep.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, profile: next };
  });

export const submitPreOnboarding = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    resume: z.object({ url: z.string().url().max(1000), name: z.string().max(300) }).optional().nullable(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string; smsOk?: boolean; preview?: string }> => {
    const db = await admin();
    const r = await loadRep(db, data.legacyToken);
    if (!("rep" in r)) return { ok: false, error: r.error };
    const rep = r.rep;
    const st = (rep.application_status ?? "setup") as ApplicationStatus;
    if (st === "submitted") return { ok: true, smsOk: true };
    if (st !== "setup") return { ok: false, error: "This application is closed." };
    const profile = parseProfile(rep.rep_profile);
    const prog = stepProgress(profile);
    if (!prog.complete) return { ok: false, error: `Finish step ${prog.next} first.` };

    const nowIso = new Date().toISOString();
    const review = await import("@/lib/rep-review.server");
    const campus = await review.campusNameFor(db, rep.campus_id);
    const targets = (profile.targets ?? []) as TargetChapter[];

    // THE COVERAGE MAP, for the approval fan-out: own chapter = member, a flagged target =
    // knows someone. Targets with no connection ride on the profile and are fanned out too.
    const reach: Array<{ partner_id: string; campus_greek_chapter_id: string; reach: "member" | "knows_someone" }> = [];
    if (rep.own_chapter_id) reach.push({ partner_id: rep.id, campus_greek_chapter_id: rep.own_chapter_id, reach: "member" });
    for (const t of targets) if (t.connection && t.id !== rep.own_chapter_id) reach.push({ partner_id: rep.id, campus_greek_chapter_id: t.id, reach: "knows_someone" });
    await db.from("rep_chapter_reach").delete().eq("partner_id", rep.id);
    if (reach.length) { const { error: rErr } = await db.from("rep_chapter_reach").insert(reach); if (rErr) return { ok: false, error: rErr.message }; }

    const [interviewUrl, denyUrl] = await Promise.all([review.reviewUrl(rep.id, "interview"), review.reviewUrl(rep.id, "deny")]);
    const resume = data.resume ? { url: data.resume.url, name: data.resume.name, at: nowIso } : (profile.resume ?? null);
    const greek = profile.greek ?? null;
    // The campus course code, so the text reads "took ACCY 201", not "took the intro course".
    let courseCode: string | null = null;
    if (rep.campus_id) {
      const { data: c } = await db.from("campuses").select("course_family_codes_json").eq("id", rep.campus_id).maybeSingle();
      const raw = c?.course_family_codes_json;
      const j = typeof raw === "string" ? JSON.parse(raw || "{}") : (raw ?? {});
      courseCode = ((j?.intro_1 ?? "") as string).trim() || null;
    }
    const summary = reviewSummarySms({
      name: rep.name, campus: campus.name, studentStatus: profile.studentStatus ?? null, major: profile.major ?? null,
      tookCourse: profile.tookCourse ?? null, courseCode, greek, why: profile.why ?? rep.pitch ?? null,
      comfort: profile.comfort ?? [], targets, resumeUrl: resume?.url ?? null, interviewUrl, denyUrl,
    });
    const sms = await review.textLee(summary, { isTest: !!rep.is_test });

    const nextProfile: RepProfile = { ...profile, resume, review: { ...(profile.review ?? {}), sentAt: nowIso, smsOk: sms.ok, ...(rep.is_test ? { preview: summary } : {}) } as RepProfile["review"] };
    const { error } = await db.from("referral_partners").update({
      application_status: "submitted", onboarding_submitted_at: nowIso, rep_profile: nextProfile,
    }).eq("id", rep.id);
    if (error) return { ok: false, error: error.message };
    await db.from("rep_activity").insert({
      partner_id: rep.id, kind: "onboarding_submitted",
      meta: { targets: targets.length, connections: targets.filter((t) => t.connection).length, comfort: profile.comfort ?? [], smsOk: sms.ok, via: "pre_onboarding" },
      is_test: !!rep.is_test,
    }).then(() => undefined, () => undefined);
    return { ok: true, smsOk: sms.ok, ...(rep.is_test ? { preview: summary } : {}) };
  });

// ---------------------------------------------------------------- the review links

export type ReviewLinkState =
  | { ok: true; decided: false; name: string; campus: string; flow: FlowState; why: string | null; comfort: string[]; targets: number; connections: number; studentStatus: string | null; major: string | null; invitedAt: string | null }
  | { ok: true; decided: true; decision: string; repNumber: number | null }
  | { ok: false; error: string };

const decisionSchema = z.enum(["interview", "approve", "deny"]);

export const getReviewLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid(), decision: decisionSchema, t: z.string().max(80).optional().nullable() }).parse(d))
  .handler(async ({ data }): Promise<ReviewLinkState> => {
    const review = await import("@/lib/rep-review.server");
    const v = await review.verifyReviewToken(data.partnerId, data.decision, data.t);
    if (!v.ok) return { ok: false, error: v.why === "expired" ? "This link has expired — decide from the roster instead." : "This link isn't valid." };
    const db = await admin();
    const { data: row, error } = await db.from("referral_partners").select(review.REVIEW_COLS).eq("id", data.partnerId).eq("type", "campus_rep").maybeSingle();
    if (error) return { ok: false, error: review.isMissingRepColumns(error) ? review.MISSING_MIGRATION_ERROR : error.message };
    const rep = row as import("@/lib/rep-review.server").RepForReview | null;
    if (!rep?.id) return { ok: false, error: "Rep not found." };
    const st = rep.application_status ?? "setup";
    if (st === "approved" || st === "declined") return { ok: true, decided: true, decision: st, repNumber: rep.rep_number };
    const profile = parseProfile(rep.rep_profile);
    const campus = await review.campusNameFor(db, rep.campus_id);
    const targets = (profile.targets ?? []) as TargetChapter[];
    return {
      ok: true, decided: false, name: rep.name, campus: campus.name, flow: flowState(st as ApplicationStatus, profile),
      why: profile.why ?? null, comfort: profile.comfort ?? [], targets: targets.length, connections: targets.filter((t) => t.connection).length,
      studentStatus: profile.studentStatus ?? null, major: profile.major ?? null, invitedAt: profile.interview?.invitedAt ?? null,
    };
  });

export const decideFromReviewLink = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ partnerId: z.string().uuid(), decision: decisionSchema, t: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const review = await import("@/lib/rep-review.server");
    const v = await review.verifyReviewToken(data.partnerId, data.decision, data.t);
    if (!v.ok) return { ok: false as const, error: "This link isn't valid any more." };
    const db = await admin();
    return review.decideRepApplication(db, { partnerId: data.partnerId, decision: data.decision, by: "lee:sms-link" });
  });

// ---------------------------------------------------------------- beta feedback (spec §7)

export const sendRepBetaFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    screen: z.string().trim().min(1).max(80),
    text: z.string().trim().min(2).max(600),
    who: z.string().trim().max(120).optional().nullable(),
    isTest: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    let who = data.who?.trim() || "someone";
    let isTest = !!data.isTest;
    try {
      const { repFromSession } = await import("@/lib/rep-auth.server");
      const s = await repFromSession(db, { legacyToken: data.legacyToken, requireActive: false });
      if ("rep" in s) { who = s.rep.name; isTest = isTest || !!s.rep.is_test; }
    } catch { /* pre-session screens have no rep */ }
    const review = await import("@/lib/rep-review.server");
    const r = await review.textLee(`Rep beta · ${data.screen} · ${who}: ${data.text}`, { isTest });
    if (!r.ok && r.reason !== "test_sms_suppressed") return { ok: false, error: "Couldn't send that — try again." };
    return { ok: true };
  });

// ---------------------------------------------------------------- attribution: the DM screenshot

export const attachDmScreenshot = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    legacyToken: z.string().max(80).optional().nullable(),
    chapterId: z.string().uuid(),
    screenshot: z.object({ url: z.string().url().max(1000), name: z.string().max(300), path: z.string().max(400) }),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const db = await admin();
    const { repFromSession } = await import("@/lib/rep-auth.server");
    const s = await repFromSession(db, { legacyToken: data.legacyToken });
    if (!("rep" in s)) return { ok: false, error: s.error };
    const { termFor, termId } = await import("@/lib/terms");
    const { data: asg } = await db.from("rep_chapter_assignments").select("id,dm_status")
      .eq("partner_id", s.rep.id).eq("campus_greek_chapter_id", data.chapterId).eq("term_id", termId(termFor()))
      .in("status", ["reserved", "qualified"]).maybeSingle();
    if (!asg?.id) return { ok: false, error: "That chapter isn't assigned to you." };
    const now = new Date().toISOString();
    if (asg.dm_status === "not_contacted") await db.from("rep_chapter_assignments").update({ dm_status: "dm_sent", dm_sent_at: now }).eq("id", asg.id);
    // The screenshot rides on the activity ledger (jsonb meta) — the proof lives next to the send.
    const { error } = await db.from("rep_activity").insert({
      partner_id: s.rep.id, kind: "dm_copied", campus_greek_chapter_id: data.chapterId, is_test: s.rep.is_test,
      meta: { screenshot: data.screenshot, attributed: true, at: now },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  });

/** For the dashboard/admin: which chapters have a screenshot on file. */
export async function chapterScreenshots(db: DB, repId: string): Promise<Record<string, { url: string; at: string }>> {
  const { data } = await db.from("rep_activity").select("campus_greek_chapter_id,meta,created_at")
    .eq("partner_id", repId).eq("kind", "dm_copied").not("meta->screenshot", "is", null).order("created_at", { ascending: false }).limit(500);
  const out: Record<string, { url: string; at: string }> = {};
  for (const r of (data ?? []) as Array<{ campus_greek_chapter_id: string | null; meta: { screenshot?: { url?: string }; at?: string } | null; created_at: string }>) {
    const id = r.campus_greek_chapter_id; const url = r.meta?.screenshot?.url;
    if (id && url && !out[id]) out[id] = { url, at: r.meta?.at ?? r.created_at };
  }
  return out;
}

export const STEP_COUNT = STEP_KEYS.length;
