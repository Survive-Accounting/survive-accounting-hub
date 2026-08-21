// REFERRALS (server) — the unlisted /expand page: former students forward Survive Accounting to one
// person, or hand Lee a lead in their own words. Deny-by-default (0114): both tables are
// service-role only, so nothing here is reachable by the anon client.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type DB = { from: (t: string) => { insert: (row: unknown) => Promise<{ error: { message: string } | null }> } };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

/** The Tier-3 fallback form. ONE freeform box by design — a referrer saying "my little brother's
 *  roommate is in Sig Ep at Auburn" is a good lead, and any structured form would have rejected it.
 *  `okToName` is the whole value of the checkbox: ticked, Lee opens with "<name> passed along your
 *  info"; unticked, the lead is cold and gets treated as such. */
export const submitReferral = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    rawText: z.string().trim().min(1).max(4000),
    referrerEmail: z.string().trim().email().max(200).nullable().optional(),
    okToName: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const { error } = await db.from("referrals").insert({
      raw_text: data.rawText,
      referrer_email: data.referrerEmail || null,
      ok_to_name: data.okToName,
    });
    if (error) throw new Error(error.message);
    // UNIFIED INTAKE (referral): when the alum left an email they get "Thanks — noted"; Lee sees
    // it in the Sunday Demand digest. The referrals row above stays the provenance record.
    if (data.referrerEmail) {
      try {
        const { runIntake } = await import("@/lib/comms/intake.server");
        await runIntake({ kind: "referral", email: data.referrerEmail, note: data.rawText, sourcePath: "/expand" });
      } catch (e) { console.warn("referral intake failed (row saved)", (e as Error).message); }
    }
    return { ok: true };
  });

/** The page's REAL conversion metric: a copy-message click means a forward is about to happen.
 *  Form submits are the fallback, not the goal. Best-effort — a failed log never breaks the copy. */
export const EXPAND_EVENTS = ["copy_student", "copy_greek", "sms_student", "sms_greek", "play_video"] as const;
export type ExpandEvent = (typeof EXPAND_EVENTS)[number];

export const logExpandEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ event: z.enum(EXPAND_EVENTS) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    try {
      const db = await admin();
      await db.from("expand_events").insert({ event: data.event });
    } catch { /* 0114 not applied yet — never let analytics break the ask */ }
    return { ok: true };
  });
