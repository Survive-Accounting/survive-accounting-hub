// REHEARSAL — the teleprompter feedback loop's server side. Two calls: log one decision
// (best-effort — losing a feedback row is real but never worth blocking Lee's actual line from
// being kept over), and fetch the highest-rated past decisions to feed the next suggestion as
// real style examples (rehearsal-brief.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

const isMissingTable = (e: { code?: string; message: string }) => isMissingSchema(e, /teleprompter_feedback/i);

// teleprompter_feedback is new (migration/supabase-migrations/20260906_0100) and isn't in the
// generated Supabase types yet — same escape hatch as every other new table this session.
type FeedbackDB = { from: (t: "teleprompter_feedback") => any };
async function feedbackDb(): Promise<FeedbackDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as FeedbackDB;
}

export const REHEARSAL_ACTIONS = ["approved", "revised", "edited"] as const;
export type RehearsalAction = (typeof REHEARSAL_ACTIONS)[number];

export const logTeleprompterFeedback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160), frameId: z.string().min(1).max(80),
    rawTranscript: z.string().trim().min(1).max(4000), suggestedLine: z.string().trim().max(400),
    finalLine: z.string().trim().min(1).max(400), action: z.enum(REHEARSAL_ACTIONS),
    rating: z.number().int().min(1).max(5).nullable().optional(), comment: z.string().trim().max(1000).nullable().optional(),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await feedbackDb();
      const { error } = await db.from("teleprompter_feedback").insert({
        set_id: data.setId, frame_id: data.frameId, raw_transcript: data.rawTranscript,
        suggested_line: data.suggestedLine, final_line: data.finalLine, action: data.action,
        rating: data.rating ?? null, comment: data.comment ?? null, created_by: data.who ?? null,
      });
      if (error) {
        if (isMissingTable(error)) return { ok: false, error: "The feedback table doesn't exist yet — run migration/supabase-migrations/20260906_0100_teleprompter_feedback.sql." };
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

/** The best examples to learn from — highest rated, newest first, capped small since these ride
 *  in every rehearsal suggestion's prompt. Missing table → no examples, not an error: a brand
 *  new set of rehearsals with nothing to learn from yet is the normal starting state. */
export const topRehearsalExamples = createServerFn({ method: "GET" }).handler(async (): Promise<{ raw: string; final: string }[]> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  try {
    const db = await feedbackDb();
    const { data, error } = await db.from("teleprompter_feedback")
      .select("raw_transcript,final_line,rating").gte("rating", 4).order("rating", { ascending: false }).order("created_at", { ascending: false }).limit(5);
    if (error) return [];
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({ raw: String(r.raw_transcript ?? ""), final: String(r.final_line ?? "") }));
  } catch { return []; }
});
