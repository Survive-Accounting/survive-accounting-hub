// "MY SCHOOL / CHAPTER ISN'T LISTED" — the escape hatch off the Greek entry card.
//
// The finder covers 16 SEC schools and 1,107 chapters, which is most of the market and none of the
// exceptions. Someone at a school we don't carry, or in a chapter GreekIntel missed, previously hit
// a dropdown that simply didn't contain them and had no way to say so. That visitor is the single
// most valuable one on the page — they are telling us exactly where the roster is wrong — and the
// page was dropping them.
//
// WHY THIS DOES NOT REUSE SignupFlow: that flow creates a chapter and verifies an officer by SMS.
// It is the right tool for an exec ready to run their chapter, and the wrong one here — it demands
// a verification code to answer "you don't have my school", and Twilio is not configured in
// production, so it would dead-end. This is four fields and a text to Lee.
//
// STORAGE — DELIBERATE REUSE, NOT AN OVERSIGHT. These rows go into `referrals` behind a
// [GREEK NOT LISTED] prefix rather than a table of their own, because creating one needs DDL
// against the Management API and this machine has no PAT for it (the Vercel CLI is not
// authenticated, so the token cannot be pulled). The prefix keeps the rows greppable and the SMS is
// the real delivery path; a dedicated table is a clean follow-up once that access exists, and the
// rows migrate with a single INSERT…SELECT.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { normalizePhoneE164 } from "@/lib/greek-chapters.functions";

type DB = { from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

export const NOT_LISTED_PREFIX = "[GREEK NOT LISTED]";

export const submitNotListed = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    // Which control they fell out of. Changes only the wording of the alert, but it tells Lee
    // whether the gap is a whole campus or one chapter — a different amount of work each.
    kind: z.enum(["school", "chapter"]),
    school: z.string().trim().min(1).max(120),
    chapter: z.string().trim().max(120).optional().default(""),
    name: z.string().trim().min(2).max(120),
    contact: z.string().trim().min(4).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();

    // An email goes in the typed column so it is usable; a phone number does not, because the
    // column is validated as an email upstream and a phone written there would be silently useless.
    const isEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.contact);
    const phone = isEmail ? null : normalizePhoneE164(data.contact);

    const line = [
      `${NOT_LISTED_PREFIX} ${data.kind === "school" ? "school" : "chapter"} missing`,
      `school:  ${data.school}`,
      data.chapter ? `chapter: ${data.chapter}` : null,
      `from:    ${data.name}`,
      `contact: ${data.contact}${phone && phone !== data.contact ? ` (${phone})` : ""}`,
    ].filter(Boolean).join("\n");

    const { error } = await db.from("referrals").insert({
      raw_text: line,
      referrer_email: isEmail ? data.contact : null,
      ok_to_name: true, // they gave their name specifically so Lee could reply to them
    });
    // The row is the durable record, so a failure here IS worth surfacing — unlike the alert below.
    if (error) throw new Error(error.message);

    // UNIFIED INTAKE (school_request): the student gets "Thanks — noted <School>"; Lee sees it in
    // the Sunday Demand digest (school_request is a BATCHED kind — no immediate SMS, per spec §5).
    // The phone field sits beside the SmsConsentNote in NotListedForm, so a phone = consent.
    try {
      const { runIntake } = await import("@/lib/comms/intake.server");
      await runIntake({ kind: "school_request", name: data.name, email: isEmail ? data.contact : null, phone, campusName: data.school, chapter: data.chapter || null, note: line, sourcePath: "/", smsConsent: !!phone });
    } catch (e) { console.warn("not-listed intake failed (referral row saved)", (e as Error).message); }

    return { ok: true };
  });
