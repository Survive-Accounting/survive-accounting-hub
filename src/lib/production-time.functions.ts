// THE PRODUCTION TIMER — server side. One insert per stopped timer (logProductionTime) and one
// report across every set (for "which step is a bottleneck" — Lee, 2026-09-05). The per-set
// read (listProductionTimeForSet, "so far on this set") went on 2026-09-09: nothing called it
// once the checklist run replaced the old timer, and the widget's own line now comes off the
// run document, not the log.
//
// production_time_log is new (migration/supabase-migrations/20260905_2300) and isn't in the
// generated Supabase types yet — same DB-cast escape hatch as shipped.functions.ts and
// illustrate.functions.ts's illustration_library, for the same reason.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isProductionStep, PRODUCTION_STEPS, type ProductionStep } from "./production-time";
import { isMissingSchema } from "./pg-errors";

const isMissingLog = (e: { code?: string; message: string }) => isMissingSchema(e, /production_time_log/i);

type LogDB = { from: (t: "production_time_log") => any };
async function logDb(): Promise<LogDB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LogDB;
}

/** One stopped timer, best-effort: a missing migration or a transient DB error is reported back
 *  as `ok: false` rather than thrown — losing a time-log entry is real but never worth blocking
 *  Lee's actual work over (the widget shows a small warning and keeps the elapsed time on
 *  screen so nothing is silently lost from view, even if it didn't save). */
export const logProductionTime = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().min(1).max(160), setName: z.string().max(200).nullable().optional(),
    topicSlug: z.string().max(160).nullable().optional(), topicName: z.string().max(200).nullable().optional(),
    step: z.enum(PRODUCTION_STEPS), seconds: z.number().int().min(0).max(86400),
    startedAt: z.string().max(40), endedAt: z.string().max(40),
    who: z.string().max(40).nullable().optional(), note: z.string().max(500).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    try {
      const db = await logDb();
      const { error } = await db.from("production_time_log").insert({
        set_id: data.setId, set_name: data.setName ?? null, topic_slug: data.topicSlug ?? null, topic_name: data.topicName ?? null,
        step: data.step, seconds: data.seconds, started_at: data.startedAt, ended_at: data.endedAt,
        created_by: data.who ?? null, note: data.note ?? null,
      });
      if (error) {
        if (isMissingLog(error)) return { ok: false, error: "The time log table doesn't exist yet — run migration/supabase-migrations/20260905_2300_production_time_log.sql." };
        return { ok: false, error: error.message };
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
  });

export interface BottleneckStep {
  step: ProductionStep; sessions: number; totalSeconds: number; avgSeconds: number;
}
export interface SetTotal {
  setId: string; setName: string | null; topicName: string | null; totalSeconds: number; bySteps: Partial<Record<ProductionStep, number>>;
}

/** THE BOTTLENECK REPORT (Lee, 2026-09-05: "generate reports about where bottlenecks may exist.
 *  Which step?"). Aggregated in JS over the raw rows (bun/PostgREST, no server-side SQL
 *  aggregation function here) — fine at Lee's volume (one row per timer stop, capped at 2000
 *  most recent). Per-step totals answer "which step", per-set totals answer "which video/topic
 *  ran long" — both from the same query. */
export const productionBottleneckReport = createServerFn({ method: "GET" }).handler(async (): Promise<{ steps: BottleneckStep[]; sets: SetTotal[] }> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const db = await logDb();
  const { data: rows, error } = await db.from("production_time_log")
    .select("set_id,set_name,topic_name,step,seconds").order("started_at", { ascending: false }).limit(2000);
  if (error) { if (isMissingLog(error)) return { steps: [], sets: [] }; throw new Error(`Could not load the report: ${error.message}`); }

  const byStep = new Map<ProductionStep, { sessions: number; totalSeconds: number }>();
  const bySet = new Map<string, SetTotal>();
  for (const r of (rows ?? []) as Record<string, unknown>[]) {
    const step = isProductionStep(r.step) ? r.step : "review";
    const seconds = (r.seconds as number) ?? 0;
    const s = byStep.get(step) ?? { sessions: 0, totalSeconds: 0 };
    s.sessions += 1; s.totalSeconds += seconds;
    byStep.set(step, s);

    const setId = r.set_id as string;
    const t = bySet.get(setId) ?? { setId, setName: (r.set_name as string | null) ?? null, topicName: (r.topic_name as string | null) ?? null, totalSeconds: 0, bySteps: {} };
    t.totalSeconds += seconds;
    t.bySteps[step] = (t.bySteps[step] ?? 0) + seconds;
    bySet.set(setId, t);
  }
  const steps: BottleneckStep[] = PRODUCTION_STEPS.map((step) => {
    const s = byStep.get(step) ?? { sessions: 0, totalSeconds: 0 };
    return { step, sessions: s.sessions, totalSeconds: s.totalSeconds, avgSeconds: s.sessions ? Math.round(s.totalSeconds / s.sessions) : 0 };
  });
  const sets = [...bySet.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);
  return { steps, sets };
});
