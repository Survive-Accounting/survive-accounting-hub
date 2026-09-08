// REP APPLICATION & PRE-ONBOARDING — the pure half. Client-safe: no React, no network.
//
// Lee's spec (2026-09-06): apply → pre-onboarding (while pending) → ready for review →
// approve / deny → dashboard. Onboarding happens BEFORE approval: "applicants are most excited
// in the first ten minutes, and anyone who won't finish 15 minutes of onboarding wasn't going
// to do the job." Everything here will be completed on a phone.
//
// WHERE THE STATE LIVES. The V2 program already has `referral_partners.application_status`
// (setup · submitted · approved · waitlisted · declined) and the answer columns (pitch,
// course_status, own_chapter_id, graduation_year, campus_roles). Lee's five states are DERIVED
// from that column plus the pre-onboarding progress in `rep_profile` (jsonb, migration
// 20260907_0100_rep_pre_onboarding.sql):
//
//   applied           = setup, no onboarding step done
//   pre_onboarding    = setup, at least one step done
//   ready_for_review  = submitted
//   approved          = approved
//   denied            = declined     (waitlisted stays as the admin's own state)
//
// No new enum values, so nothing the admin roster or the dashboard already reads changes shape.
import type { ApplicationStatus } from "@/lib/rep-shared";

// ---------------------------------------------------------------- the derived flow state

// The dashboard-timeline spec (same day) added `interview` between ready-for-review and the
// decision: "approval happens after the call, not before." It rides on rep_profile.interview
// while application_status stays `submitted` — no enum change.
export type FlowState = "applied" | "pre_onboarding" | "ready_for_review" | "interview" | "approved" | "denied" | "waitlisted";

export const FLOW_LABEL: Record<FlowState, string> = {
  applied: "Applied", pre_onboarding: "Onboarding", ready_for_review: "Ready for review", interview: "Interview",
  approved: "Approved", denied: "Denied", waitlisted: "Waitlisted",
};

export function flowState(status: ApplicationStatus | null | undefined, profile: RepProfile | null | undefined): FlowState {
  switch (status ?? "setup") {
    case "submitted": return profile?.interview?.invitedAt ? "interview" : "ready_for_review";
    case "approved": return "approved";
    case "declined": return "denied";
    case "waitlisted": return "waitlisted";
    default: return Object.keys(profile?.steps ?? {}).length > 0 ? "pre_onboarding" : "applied";
  }
}

// ---------------------------------------------------------------- the profile (rep_profile jsonb)

export type StudentStatus = "student" | "alumni";
export type TookCourse = "taken" | "taking_now" | "not_yet";

export interface TargetChapter { id: string; name: string; connection: boolean }

export interface StepRecord { at: string; answer?: string; ack?: boolean; comfort?: string[]; targets?: TargetChapter[] }

export interface RepProfile {
  studentStatus?: StudentStatus;
  major?: string;
  tookCourse?: TookCourse;
  /** Free text when the applicant is not in a listed chapter ("not Greek, my roommate is Kappa"). */
  greek?: string;
  greekChapterId?: string | null;
  /** Retired from the form 2026-09-08 (the "why do you want to do this?" essay). Still READ —
   *  every application taken before that date has one, and Lee's review text shows it. */
  why?: string;
  /** Its replacement: campus-only or up for expansion (INVOLVEMENT_COPY). */
  involvement?: Involvement;
  steps?: Partial<Record<StepKey, StepRecord>>;
  comfort?: string[];
  targets?: TargetChapter[];
  resume?: { url: string; name: string; at: string } | null;
  reminders?: { h24At?: string; h72At?: string };
  review?: { sentAt?: string; decidedAt?: string; decision?: "approve" | "deny"; by?: string; smsOk?: boolean; preview?: string };
  /** Lee moved them to a call (the "read your application and I like it" text). */
  interview?: { invitedAt: string; by: string; smsOk?: boolean; preview?: string };
  applyCampusSlug?: string;
}

export const parseProfile = (raw: unknown): RepProfile =>
  raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as RepProfile) : {};

// ---------------------------------------------------------------- the six steps

export type StepKey = "1" | "2" | "3" | "4" | "5" | "6";
export const STEP_KEYS: readonly StepKey[] = ["1", "2", "3", "4", "5", "6"];

export interface StepDef {
  key: StepKey;
  title: string;
  /** What the short says — also the placeholder card's text until the video exists. */
  gist: string[];
  /** The response that unlocks Next. */
  response: "sentence" | "ack" | "comfort" | "chapters";
  prompt: string;
  /** site_settings.settings.repOnboardingVideos[<videoKey>] = Mux public playback id. */
  videoKey?: string;
}

export const STEPS: readonly StepDef[] = [
  {
    key: "1", title: "What Survive is", videoKey: "step1", response: "sentence",
    gist: [
      "Ten years of tutoring intro accounting, 1,000+ students. The practice exams are the asset.",
      "Two-minute shorts that explain them — YouTube Shorts for exam prep, not lectures.",
      "Easy Points is free on every exam. Real points first, then the wall.",
    ],
    prompt: "In one sentence — how would you describe Survive to a friend?",
  },
  {
    key: "2", title: "The mission", videoKey: "step2", response: "ack",
    gist: [
      "Accounting now. More courses coming — Intro 2, Intermediate, then organic chemistry and finance.",
      "200+ campuses with Greek systems, large and small.",
      "Intro accounting is the way in, not the ceiling.",
    ],
    prompt: "Got it — I know where this is going.",
  },
  {
    key: "3", title: "The role", videoKey: "step3", response: "ack",
    gist: [
      "5–10 hours a week. Fully remote. Work more if you want.",
      "Commission-based — you're paid on what your chapters buy.",
      "Your campus first; do well and nearby campuses open up.",
    ],
    prompt: "Got it — 5–10 hours a week, remote, commission.",
  },
  {
    key: "4", title: "How you earn", videoKey: "step4", response: "ack",
    gist: [
      "Level 1 is your campus: 10% on every sale through your link, $1 per free user who goes paid, $25 when a chapter closes, $25 when a chapter flyer activates.",
      "Level 2 unlocks after performance: 5% on assisted outreach at other campuses, $150 when a rep you referred onboards a chapter.",
      "Chapter bonuses unlock only when the chapter pays.",
    ],
    prompt: "Got it — I've read both levels and the duration rule.",
  },
  {
    key: "5", title: "What are you comfortable with?", response: "comfort",
    gist: ["Pick everything you'd be up for. This feeds Lee's decision directly — honest beats ambitious."],
    prompt: "Pick all that apply.",
  },
  {
    key: "6", title: "Pick your chapters", response: "chapters",
    gist: ["The Greek chapters at your campus. Pick the ones you'd go after first, and flag any where you know someone."],
    prompt: "Pick your targets. Tap the person icon where you have a connection.",
  },
];

export const stepDef = (k: StepKey): StepDef => STEPS.find((s) => s.key === k)!;

/** Steps done, in order; the next one to show. */
export function stepProgress(profile: RepProfile): { done: StepKey[]; next: StepKey | null; complete: boolean } {
  const done = STEP_KEYS.filter((k) => !!profile.steps?.[k]);
  const next = STEP_KEYS.find((k) => !profile.steps?.[k]) ?? null;
  return { done, next, complete: next === null };
}

// ---------------------------------------------------------------- step 5: comfort options

export interface ComfortOption { key: string; label: string; more: string | null }

export const COMFORT_OPTIONS: readonly ComfortOption[] = [
  {
    key: "own_chapter", label: "Talking to scholarship chairs at my own chapter",
    more: "Your own scholarship chair already knows you. You'd show them the free Exam 1 kit, get the flyer on the house board, and be the person they text when the exam is two weeks out. Most reps start here.",
  },
  {
    key: "other_chapters", label: "Talking to chairs at other chapters on my campus",
    more: "Every chapter on your campus is already in our directory with its council, size and Instagram. You get a short list, a DM that works, and a tracked link per house — you never start from a blank message.",
  },
  {
    key: "materials", label: "Sharing marketing materials — flyers, QR codes, chapter meeting slides — with scholarship chairs, and helping verify they're actually being used",
    more: "Flyers with a QR code per chapter, a chapter-meeting slide, and a one-tap share kit, all generated for your campus. Every QR is tracked, so you can see which flyers are pulling sign-ups and go check on the ones that aren't.",
  },
  {
    key: "councils", label: "Talking to Greek council execs (IFC, Panhellenic) or Greek Life departments",
    more: "IFC and Panhellenic execs can put Survive in front of every chapter at once. We already have the council rosters and a pitch written for them; you'd be the local face on the call.",
  },
  {
    key: "closing", label: "Learning to close deals with chapters to earn higher commissions and bonuses",
    more: "A chapter closes when it pays for seats for its members. You'd learn a simple close — timing around the exam date, what a scholarship chair needs to hear, how to follow up — and earn the chapter bonus every time one lands.",
  },
  {
    key: "dms_other_schools", label: "Sending Instagram DMs to student orgs at other schools to recruit more reps",
    more: "We've collected over 2,000 Instagram accounts worth reaching out to — Greek council scholarship chairs and presidents, chapter scholarship chairs and presidents, plus business, finance, investing, and women in business clubs for recruiting reps. We're adding hundreds more a day. It's far more than I can DM alone.",
  },
  { key: "none_yet", label: "None of these yet — I'd want to talk first", more: null },
];

export const comfortLabel = (key: string): string => COMFORT_OPTIONS.find((o) => o.key === key)?.label ?? key;

// ---------------------------------------------------------------- copy (Lee's words)

// STEP 1 IS THE HERO AND THE FORM, NOTHING ELSE (Lee, 2026-09-08): "Hero copy ↓ Application
// form. Very little friction." The two-reps-per-campus line, the Level 1 pay table and the
// bonus rules left this page — they are step 4 of the onboarding, where someone who has already
// applied is ready to read them (rep-copy.ts still owns that copy, unchanged).
export const APPLY_COPY = {
  eyebrow: "Campus reps",
  headline: (campus: string) => `Promote Survive at ${campus}`,
  sub: "Easiest side gig imaginable. Share Survive's free accounting exam prep with Greek chapters at your school. Earn 10% commissions + bonuses when they buy.",
};

/** The last question on the form (2026-09-08), replacing the "why do you want to do this?"
 *  essay: one tap, and it tells Lee whether he is looking at a campus rep or a future regional.
 *  Enum values are the business identity; the labels are free to be rewritten. */
export type Involvement = "campus_only" | "expansion";
export const INVOLVEMENT_COPY = {
  label: "We are scaling Survive to 200+ schools. What level of involvement are you interested in?",
  campusOnly: (campus: string) => `Just promoting at ${campus}`,
  expansion: "Interested in helping with expansion",
};
export const involvementLabel = (v: Involvement | null | undefined, campus: string): string =>
  v === "expansion" ? INVOLVEMENT_COPY.expansion : v === "campus_only" ? INVOLVEMENT_COPY.campusOnly(campus) : "—";

/** THE SHORTHAND SCHOOL NAME for the headline — "Ole Miss", "Alabama", "LSU". `name` on a
 *  campus is already the canonical display name, so it is the answer almost always. The one
 *  exception is a short_name that is a bare-initial truncation ("Test U", "Test U.") — Lee:
 *  "Do NOT awkwardly abbreviate it to something like Promote Survive at Test U." — where the
 *  formal name reads like something a person would say out loud. */
export function campusShorthand(name: string | null | undefined, formalName?: string | null): string {
  const short = (name ?? "").trim();
  if (!short) return (formalName ?? "").trim() || "your campus";
  if (/\bU\.?$/.test(short) && (formalName ?? "").trim()) return formalName!.trim();
  return short;
}

export const PENDING_COPY = {
  title: "Your application is pending.",
  body: "Pending completion of a 15-minute onboarding — finish it and I'll get back to you within two business days with a casual phone interview, and we'll get you started immediately.",
  cta: "Start the onboarding",
};

export const READY_COPY = {
  eyebrow: "Ready for review",
  title: "That's the onboarding — nice.",
  body: "Lee gets it on his phone right now. Expect a text within two business days to set up a casual phone interview, and you'll get started immediately after.",
};

export const INTERVIEW_COPY = {
  eyebrow: "Interview",
  title: "Lee texted you.",
  body: "Check your phone — he wants to set up a quick call this week. Your dashboard opens the moment you're approved after it.",
};

export const RESUME_PROMPT = "If you want feedback on your resume either way, attach it. Optional.";

/** Lee's approval text — verbatim. */
export const approvalSms = (i: { repNumber: number; dashboardUrl: string }): string =>
  `You've been accepted as a campus rep for Survive Accounting — you're rep #${i.repNumber}.\nYour dashboard: ${i.dashboardUrl}\nLet's do a quick call this week to get you rolling. When works? — Lee`;

/** Lee's "moving to interview" text — verbatim (dashboard-timeline spec §1). Promises nothing,
 *  hedges nothing. */
export const interviewSms = (i: { firstName: string }): string =>
  `${i.firstName} — read your application and I like it. Let's do a quick call this week and get you going. When works? — Lee`;

/** Back to Lee once the invite went out: the two links that decide it after the call. */
export const postInviteSms = (i: { name: string; approveUrl: string; denyUrl: string }): string =>
  `Sent to ${i.name}. After the call —\nApprove: ${i.approveUrl}\nDeny: ${i.denyUrl}`;

/** Lee's denial text — verbatim. */
export const denialSms = (i: { firstName: string; campus: string }): string =>
  `Hey ${i.firstName} — thanks for applying to rep Survive at ${i.campus}, and for taking the time to go through the onboarding. I'm not bringing anyone else on at ${i.campus} this semester, but I'm holding your application for future ones.\n\nIf you'd like feedback on your resume or how you pitched yourself, just reply here — happy to give it.\n\n— Lee`;

export const firstName = (name: string): string => (name.trim().split(/\s+/)[0] ?? name).trim() || "there";

/** The review text to Lee: everything he needs to decide, then the two links. */
export function reviewSummarySms(i: {
  name: string; campus: string; studentStatus: StudentStatus | null; major: string | null; tookCourse: TookCourse | null; courseCode: string | null;
  greek: string | null; why: string | null; involvement?: Involvement | null; comfort: string[]; targets: TargetChapter[]; resumeUrl: string | null;
  interviewUrl: string; denyUrl: string;
}): string {
  const took = i.tookCourse === "taken" ? "took" : i.tookCourse === "taking_now" ? "taking now" : i.tookCourse === "not_yet" ? "hasn't taken" : "?";
  const picked = i.targets.length;
  const conn = i.targets.filter((t) => t.connection).length;
  const names = i.targets.slice(0, 8).map((t) => `${t.name}${t.connection ? "*" : ""}`).join(", ") + (picked > 8 ? ` +${picked - 8}` : "");
  return [
    `Onboarding complete · ${i.name} · ${i.campus}`,
    `${i.studentStatus === "alumni" ? "Alumni" : "Student"} · ${i.major || "major ?"} · ${took} ${i.courseCode || "the intro course"}`,
    `Greek: ${i.greek || "—"}`,
    // The essay is gone from the form (2026-09-08); an application taken before that still has
    // one and still shows it. New ones show the involvement tap in its place.
    i.why ? `Why: ${i.why.slice(0, 280)}` : `Wants: ${involvementLabel(i.involvement, i.campus)}`,
    `Comfortable with: ${i.comfort.length ? i.comfort.map(comfortLabel).map(shortComfort).join(", ") : "—"}`,
    `Chapters: ${picked} picked, ${conn} with a connection${picked ? ` — ${names}` : ""}`,
    i.resumeUrl ? `Resume: ${i.resumeUrl}` : null,
    `Invite to a call: ${i.interviewUrl}`,
    `Deny: ${i.denyUrl}`,
  ].filter(Boolean).join("\n");
}

const shortComfort = (label: string): string => label.split(" — ")[0].replace(/^Talking to /, "").replace(/^Learning to /, "").replace(/^Sending /, "").replace(/^Sharing /, "share ");

export const newApplicationSms = (i: { name: string; campus: string; studentStatus: StudentStatus | null }): string =>
  `New rep application · ${i.name} · ${i.campus}${i.studentStatus === "alumni" ? " · alumni" : ""} — verified, onboarding next.`;

export const dailySummarySms = (i: { applications: number; onboarded: number; approved: number; pendingReview: number }): string =>
  `Reps yesterday: ${i.applications} applied, ${i.onboarded} finished onboarding, ${i.approved} approved. ${i.pendingReview} waiting on you.`;

// ---------------------------------------------------------------- reminder emails (24h / 72h, then stop)

export function reminderEmail(i: { firstName: string; campus: string; url: string; which: "h24" | "h72" }): { subject: string; text: string } {
  if (i.which === "h24") {
    return {
      subject: `Your ${i.campus} rep application — 15 minutes to go`,
      text: `Hey ${i.firstName},\n\nYour application for ${i.campus} is in. It's pending one thing: the 15-minute onboarding. Finish it and I'll get back to you within two business days to set up a quick call.\n\n${i.url}\n\n— Lee`,
    };
  }
  return {
    subject: `Last nudge on the ${i.campus} rep spot`,
    text: `Hey ${i.firstName},\n\nStill holding your spot at ${i.campus}. The onboarding takes 15 minutes on your phone, and it's the last step before we talk.\n\n${i.url}\n\nIf now's not the time, no worries — this is the last note from me.\n\n— Lee`,
  };
}
