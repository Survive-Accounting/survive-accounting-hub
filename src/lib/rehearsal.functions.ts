// REHEARSAL — the teleprompter feedback loop's server side. Two calls: log one decision
// (best-effort — losing a feedback row is real but never worth blocking Lee's actual line from
// being kept over), and fetch past decisions to feed the next suggestion as real style
// examples (rehearsal-brief.ts).
//
// 2026-09-06, third pass: the 1–5 rating and the comment are gone from the review (Lee: "I pick
// either or write mine in" — one click per slide), so the actions are now WHICH of the review's
// three choices he took: "said" (his own words, cleaned), "suggested" (the improvement), "edited"
// (he typed his own). The rating/comment columns stay — nullable, and nothing writes them now.
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

/** Which review choice Lee took. "approved"/"revised" (the one-line review) are retired — the
 *  0100 migration's CHECK allows both generations, and 0400 widens a DB that ran the old one. */
export const REHEARSAL_ACTIONS = ["said", "suggested", "edited"] as const;
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
        if (/teleprompter_feedback_action_ck/i.test(error.message)) return { ok: false, error: "The feedback table still only allows the old actions — run migration/supabase-migrations/20260906_0400_teleprompter_feedback_actions.sql." };
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

/** Which past decisions teach the most: a line Lee TYPED himself is pure Lee; his cleaned own
 *  words next; a suggestion he merely accepted last. Retired actions rank with "suggested". */
const ACTION_RANK: Record<string, number> = { edited: 0, said: 1, suggested: 2 };
export const EXAMPLE_LIMIT = 5;

/** Pure: newest first within each action, best action first, capped — exported for the test. */
export function rankRehearsalExamples(rows: readonly { raw: string; final: string; action: string; createdAt: string }[], limit = EXAMPLE_LIMIT): { raw: string; final: string }[] {
  return [...rows]
    .sort((a, b) => (ACTION_RANK[a.action] ?? 2) - (ACTION_RANK[b.action] ?? 2) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({ raw: r.raw, final: r.final }));
}

/** The best examples to learn from, capped small since these ride in every rehearsal
 *  suggestion's prompt. No rating filter any more (the rating is gone from the review) — the
 *  ACTION is the signal. Missing table → no examples, not an error: a brand new set of
 *  rehearsals with nothing to learn from yet is the normal starting state. */
export const topRehearsalExamples = createServerFn({ method: "GET" }).handler(async (): Promise<{ raw: string; final: string }[]> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  try {
    const db = await feedbackDb();
    // The newest few dozen decisions, ranked here — a few dozen rows is nothing, and one query
    // beats three ordered ones per action.
    const { data, error } = await db.from("teleprompter_feedback")
      .select("raw_transcript,final_line,action,created_at").order("created_at", { ascending: false }).limit(40);
    if (error) return [];
    return rankRehearsalExamples(((data ?? []) as Record<string, unknown>[]).map((r) => ({
      raw: String(r.raw_transcript ?? ""), final: String(r.final_line ?? ""), action: String(r.action ?? ""), createdAt: String(r.created_at ?? ""),
    })));
  } catch { return []; }
});
