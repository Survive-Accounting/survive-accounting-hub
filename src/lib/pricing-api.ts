// Public capture helpers — the pricing/notify rows, onboarding, the free-video lead magnet.
//
// UNIFIED INTAKE (2026-08-21): every function here now routes through submitIntake
// (src/lib/intake.functions.ts) → campus_waitlist with a proper `kind` + context. The
// signatures are unchanged so the landing page, /learn, onboarding and the lead-magnet card
// keep calling what they always called; what changed is that the student now gets a
// confirmation and Lee's alerts come from one code path. No component touches the Supabase
// client for captures any more (per CONTEXT.md conventions).
import { submitIntake } from "@/lib/intake.functions";

export type WaitlistTier = "test_pass" | "membership";

/** The three plans offered in the onboarding flow. The first two mirror the
 *  materials tiers; `prepay` is the Premium 1-on-1 block (waitlist-framed while
 *  ENABLE_PREPAY is off). */
export type OnboardingPlan = "test_pass" | "membership" | "prepay";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const path = () => (typeof window !== "undefined" ? window.location.pathname : null);

/** Split the landing page's "Exam 2 · ACCY 201" course string back into its parts. */
const splitCourse = (course?: string | null): { courseCode: string | null; topic: string | null } => {
  const raw = (course ?? "").trim();
  if (!raw) return { courseCode: null, topic: null };
  const parts = raw.split("·").map((s) => s.trim()).filter(Boolean);
  const codeLike = parts.find((p) => /^[A-Z]{2,5}\s?\d{3}/.test(p)) ?? null;
  const rest = parts.filter((p) => p !== codeLike && !/^(exam\s*\d+|final)$/i.test(p));
  return { courseCode: codeLike, topic: rest[0] ?? null };
};

/** Materials waitlist (test pass / semester membership) → kind `notify_exam`.
 *
 *  `examNum` is a real column now (campus_waitlist.exam). 99 is the Final, matching the exam
 *  numbering used everywhere else. */
export async function joinPricingWaitlist(input: {
  email: string;
  phone?: string | null;
  campus?: string | null;
  campusId?: string | null;
  campusSlug?: string | null;
  professor?: string | null;
  course?: string | null;
  tier: WaitlistTier;
  examNum?: number | null;
  smsConsent?: boolean;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  const { courseCode, topic } = splitCourse(input.course);
  await submitIntake({ data: {
    kind: "notify_exam",
    email,
    phone: input.phone?.trim() || null,
    campusName: input.campus?.trim() || null,
    campusId: input.campusId ?? null,
    campusSlug: input.campusSlug ?? null,
    professor: input.professor?.trim() || null,
    courseCode,
    topic: topic ?? (input.tier === "membership" ? "Semester Pass" : null),
    exam: input.examNum ?? null,
    sourcePath: path(),
    smsConsent: !!input.smsConsent,
  } });
}

/** Onboarding flow (/o/{short_ref}) — the same list; plan interest rides in `topic`. */
export async function joinOnboardingWaitlist(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  accountingMajor?: string | null;
  plan?: OnboardingPlan | null;
  smsConsent?: boolean;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  await submitIntake({ data: {
    kind: "notify_exam",
    email,
    name: input.name?.trim() || null,
    phone: input.phone?.trim() || null,
    campusName: input.campus?.trim() || null,
    courseCode: input.course?.trim() || null,
    topic: input.plan ? `plan:${input.plan}` : null,
    note: input.accountingMajor ? `accounting major: ${input.accountingMajor}` : null,
    sourcePath: path(),
    smsConsent: !!input.smsConsent,
  } });
}

/** Premium 1-on-1 prepay — captures the high-intent lead BEFORE any Stripe handoff so an
 *  abandoner is still captured. Returns the row id (Stripe `client_reference_id` later). */
export async function reservePrepayLead(input: {
  name?: string | null;
  email: string;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  mode?: "reserve" | "waitlist";
  smsConsent?: boolean;
}): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  const r = await submitIntake({ data: {
    kind: "tutoring_request",
    email,
    name: input.name?.trim() || null,
    phone: input.phone?.trim() || null,
    campusName: input.campus?.trim() || null,
    courseCode: input.course?.trim() || null,
    topic: input.mode === "waitlist" ? "prepay:waitlist" : "prepay:reserve",
    sourcePath: path(),
    smsConsent: !!input.smsConsent,
  } });
  return { id: r.id };
}

/** Free-video lead magnet — same list, instant reveal (no email round-trip). */
export async function captureFreeVideoLead(input: { email: string; course?: string | null }): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  await submitIntake({ data: { kind: "notify_exam", email, courseCode: input.course?.trim() || null, exam: 1, sourcePath: path() } });
}
