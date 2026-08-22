// probe.functions.ts — PROBE ATTEMPTS (Exhibit Lab v2, §7). Mirrors practice.functions'
// logPracticeEvents: anon client → server fn (service role) → insert; RLS deny-by-default.
//
// RECORD FROM DAY ONE, BUILD NOTHING ON TOP: there is no read path here by design — no
// routing, no remediation, no analytics. Rows key on the STABLE exhibit id + probe id +
// step id, never on display labels, so renaming a step never corrupts history.
// Fails SOFT: a missing table (migration not yet applied) logs a warning and returns
// ok:false — the Lab keeps working, the local queue keeps the rows.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ProbeAttempt = z.object({
  exhibitId: z.string().min(1).max(40),
  probeId: z.string().min(1).max(40),
  step: z.string().min(1).max(80),
  event: z.enum(["attempt", "skip"]),
  response: z.string().max(500).nullable(),
  correct: z.boolean().nullable(),
  ms: z.number().int().min(0).max(3_600_000).nullable(),
  /** The run's ExhibitProbeRef key, e.g. "rubric:four_questions". */
  refKey: z.string().max(80),
  seed: z.string().max(120).nullable(),
});

export const logProbeAttempts = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    sessionId: z.string().min(8).max(64),
    isTest: z.boolean().optional(),
    userId: z.string().uuid().optional(),
    events: z.array(ProbeAttempt).min(1).max(200),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; written: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const rows = data.events.map((e) => ({
      exhibit_id: e.exhibitId, probe_id: e.probeId, step: e.step, event: e.event,
      response: e.response, correct: e.correct, ms: e.ms, ref_key: e.refKey, seed: e.seed,
      session_id: data.sessionId, user_id: data.userId ?? null, is_test: !!data.isTest,
    }));
    const { error } = await db.from("probe_attempts").insert(rows);
    if (error) { console.warn("probe_attempts insert failed", error.message); return { ok: false, written: 0 }; }
    return { ok: true, written: rows.length };
  });
