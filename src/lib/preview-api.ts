// Client capture for the email-gated preview dashboard (/preview):
//  - tester identity (name + email, no account) → campus_waitlist, tagged so Lee
//    can tell invited testers from new onboarding leads.
//  - per-chapter / general feedback → preview_feedback (migration 0032).
// Routes/components call these; they don't touch the Supabase client directly.
import { supabase } from "@/integrations/supabase/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Register (or re-touch) a preview tester. `source` distinguishes an invited
 *  tester from someone who arrived via onboarding. Idempotent-ish: a fresh row
 *  per visit is fine — the notify trigger only fires on a real new signup. */
export async function capturePreviewTester(input: {
  name?: string | null;
  email: string;
  course?: string | null;
  campus?: string | null;
  source?: "preview_tester" | "onboarding";
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email.");
  const payload: Record<string, unknown> = {
    email,
    source: input.source ?? "preview_tester",
    tier_interest: "preview",
  };
  if (input.name?.trim()) payload.name = input.name.trim();
  if (input.campus?.trim()) payload.campus_text = input.campus.trim();
  if (input.course?.trim()) payload.course_text = input.course.trim();
  const { error } = await (supabase.from("campus_waitlist" as never) as any).insert(payload);
  if (error) throw new Error(error.message);
}

/** Store a piece of tester feedback (a reaction and/or a comment), tied to the
 *  tester's email and (optionally) the course + chapter it's about. */
export async function submitPreviewFeedback(input: {
  email: string;
  course?: string | null;
  chapter?: string | null;
  reaction?: "would_use" | null;
  comment?: string | null;
}): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error("Add your email so I know who to build for.");
  if (!input.reaction && !input.comment?.trim()) return; // nothing to store
  const { error } = await (supabase.from("preview_feedback" as never) as any).insert({
    email,
    course: input.course ?? null,
    chapter: input.chapter ?? null,
    reaction: input.reaction ?? null,
    comment: input.comment?.trim() || null,
  });
  if (error) throw new Error(error.message);
}
