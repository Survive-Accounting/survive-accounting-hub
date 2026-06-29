// Public capture for the pricing page + the free-video lead magnet.
// Both feed the SAME list (campus_waitlist) and the insert fires the existing
// text-to-Lee trigger (campus_waitlist_notify). The tier is encoded in `source`
// so capture works BEFORE migration 0028 (which adds a structured
// `tier_interest` column) is applied. Routes/components call these — they do not
// touch the Supabase client directly (per CONTEXT.md conventions).
import { supabase } from "@/integrations/supabase/client";

export type WaitlistTier = "test_pass" | "membership";

/** The three plans offered in the onboarding flow. The first two mirror the
 *  materials tiers; `prepay` is the Premium 1-on-1 block (waitlist-framed while
 *  ENABLE_PREPAY is off). */
export type OnboardingPlan = "test_pass" | "membership" | "prepay";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function insertWaitlist(row: {
  email: string;
  name?: string | null;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  source: string;
  tierInterest?: string | null;
  accountingMajor?: string | null;
}): Promise<void> {
  const email = row.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  // `as never`/`as any`: campus_waitlist isn't in the generated Database types.
  const payload: Record<string, unknown> = {
    email,
    phone: row.phone?.trim() || null,
    campus_text: row.campus?.trim() || null,
    course_text: row.course?.trim() || null,
    source: row.source,
  };
  if (row.name?.trim()) payload.name = row.name.trim();
  if (row.tierInterest) payload.tier_interest = row.tierInterest;
  // `accounting_major` is added in migration 0031 — only send it when set so
  // capture still works (and degrades gracefully) before the column exists.
  if (row.accountingMajor) payload.accounting_major = row.accountingMajor;
  const { error } = await (supabase.from("campus_waitlist" as never) as any).insert(payload);
  if (error) throw new Error(error.message);
}

/** Materials waitlist (test pass / semester membership). */
export function joinPricingWaitlist(input: {
  email: string;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  tier: WaitlistTier;
}): Promise<void> {
  return insertWaitlist({
    email: input.email,
    phone: input.phone,
    campus: input.campus,
    course: input.course,
    source: `pricing_page_${input.tier}`,
    tierInterest: input.tier,
  });
}

/** Onboarding flow (/o/{short_ref}) — captures the chosen plan into the same
 *  campus_waitlist list. `source` = 'onboarding_<plan>' and `tier_interest` =
 *  the plan key (test_pass | membership | prepay). Name/phone/school/course and
 *  the optional accounting-major self-report ride along when provided. */
export function joinOnboardingWaitlist(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  accountingMajor?: string | null;
  plan: OnboardingPlan;
}): Promise<void> {
  return insertWaitlist({
    email: input.email,
    name: input.name,
    phone: input.phone,
    campus: input.campus,
    course: input.course,
    accountingMajor: input.accountingMajor,
    source: `onboarding_${input.plan}`,
    tierInterest: input.plan,
  });
}

/** Premium 1-on-1 prepay — captures the high-intent lead into campus_waitlist
 *  BEFORE the Stripe handoff, so an abandoner at checkout is still captured and
 *  Lee can follow up. We generate the row id client-side and return it so the
 *  caller can pass it to Stripe as `client_reference_id` (and prefill the email)
 *  — that ties the eventual payment back to this lead. The insert fires the
 *  existing campus_waitlist_notify trigger (email + Lee's personal-phone SMS),
 *  so Lee knows a $2,250 buyer is in the flow. `mode` distinguishes a true
 *  reservation (→ Stripe) from a sold-out waitlist signup. */
export async function reservePrepayLead(input: {
  name?: string | null;
  email: string;
  phone?: string | null;
  campus?: string | null;
  course?: string | null;
  mode?: "reserve" | "waitlist";
}): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  const id =
    (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload: Record<string, unknown> = {
    id,
    email,
    name: input.name?.trim() || null,
    phone: input.phone?.trim() || null,
    campus_text: input.campus?.trim() || null,
    course_text: input.course?.trim() || null,
    source: input.mode === "waitlist" ? "prepay_1on1_waitlist" : "prepay_1on1",
    tier_interest: "prepay",
  };
  const { error } = await (supabase.from("campus_waitlist" as never) as any).insert(payload);
  if (error) throw new Error(error.message);
  return { id };
}

/** Free-video lead magnet — same list, instant reveal (no email round-trip). */
export function captureFreeVideoLead(input: {
  email: string;
  course?: string | null;
}): Promise<void> {
  return insertWaitlist({
    email: input.email,
    course: input.course,
    source: "free_videos",
  });
}
