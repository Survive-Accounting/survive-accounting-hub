// THE COST LEDGER — server side (2026-09-07). Lee: "I want to know the cost per short, so I can
// see whether it's justified or not to just make these with reckless abandon or not."
//
// Two calls: log one paid event (best-effort — a lost row is real but never worth failing the
// generation Lee already paid for), and read the ledger per set for Step 5 (Iterate). Every
// place that already knows a price calls logCostEvent: the AI micro/synthesis callers
// (runMicro returns usage.costUsd), Recraft (credits / 1000), Whisper ($0.006 a minute), Mux
// (an estimate per encoded minute). Nothing here computes a price — it records what the
// provider said.
//
// New table (migration/supabase-migrations/20260907_0400_cost_events.sql), not in the generated
// Supabase types yet — the same escape hatch as production_runs; a missing table is reported by
// name, never swallowed silently.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

export const COST_KINDS = ["ai", "recraft", "mux", "whisper", "other"] as const;
export type CostKind = (typeof COST_KINDS)[number];
export const MISSING_LEDGER_HINT = "run migration/supabase-migrations/20260907_0400_cost_events.sql";
const isMissingLedger = (e: { code?: string; message: string }) => isMissingSchema(e, /cost_events/i);

type DB = { from: (t: string) => any };
async function ledgerDb(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}

export interface CostEventInput {
  setId?: string | null;
  runId?: string | null;
  kind: CostKind;
  usd: number;
  model?: string | null;
  /** What it was for, in a few words — "rehearsal line", "illustration", "synthesis". */
  label?: string | null;
  meta?: Record<string, unknown> | null;
  who?: string | null;
}

/** The server-side core — callable from other server fns (runGeneration and friends) without a
 *  round trip. Never throws: the caller already has its result; the ledger is bookkeeping. */
export async function recordCostEvent(input: CostEventInput): Promise<{ ok: boolean; error?: string }> {
  if (!(input.usd >= 0) || !Number.isFinite(input.usd)) return { ok: false, error: "usd must be a finite number ≥ 0" };
  try {
    const db = await ledgerDb();
    const { error } = await db.from("cost_events").insert({
      set_id: input.setId ?? null, run_id: input.runId ?? null, kind: input.kind, usd: input.usd,
      model: input.model ?? null, label: input.label ?? null, meta: input.meta ?? null, created_by: input.who ?? null,
    });
    if (error) {
      if (isMissingLedger(error)) { console.warn(`[cost] not recorded — ${MISSING_LEDGER_HINT}`); return { ok: false, error: MISSING_LEDGER_HINT }; }
      console.warn("[cost] insert failed:", error.message);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[cost] insert threw:", msg);
    return { ok: false, error: msg };
  }
}

/** The client's door: after a runMicro / generate call that returned a price. Admin-gated
 *  (writes), best-effort by contract — the UI never waits on it. */
export const logCostEvent = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    setId: z.string().max(160).nullable().optional(), runId: z.string().max(80).nullable().optional(),
    kind: z.enum(COST_KINDS), usd: z.number().min(0).max(1000),
    model: z.string().max(80).nullable().optional(), label: z.string().max(120).nullable().optional(),
    meta: z.record(z.string(), z.unknown()).nullable().optional(), who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    return recordCostEvent(data);
  });

export interface CostRow { id: string; setId: string | null; runId: string | null; kind: CostKind; usd: number; model: string | null; label: string | null; createdAt: string }
export interface SetCost { setId: string; total: number; byKind: Partial<Record<CostKind, number>>; events: number }

/** Every event for one set, newest first — Iterate's cost line and its breakdown. */
export const listCostEvents = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ rows: CostRow[]; missing: boolean }> => {
    const { assertAdmin } = await import("@/lib/admin-session.functions");
    await assertAdmin();
    const db = await ledgerDb();
    const { data: rows, error } = await db.from("cost_events").select("id,set_id,run_id,kind,usd,model,label,created_at")
      .eq("set_id", data.setId).order("created_at", { ascending: false }).limit(500);
    if (error) { if (isMissingLedger(error)) return { rows: [], missing: true }; throw new Error(`Could not read the cost ledger: ${error.message}`); }
    return { rows: ((rows ?? []) as Record<string, unknown>[]).map(rowOf), missing: false };
  });

/** Cost per set across the bank — the "cost per short" table and its average. Aggregated in JS
 *  over the newest 5,000 rows (PostgREST, no server-side sum), fine at Lee's volume. */
export const costBySet = createServerFn({ method: "GET" }).handler(async (): Promise<{ sets: SetCost[]; missing: boolean }> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const db = await ledgerDb();
  const { data: rows, error } = await db.from("cost_events").select("set_id,kind,usd").order("created_at", { ascending: false }).limit(5000);
  if (error) { if (isMissingLedger(error)) return { sets: [], missing: true }; throw new Error(`Could not read the cost ledger: ${error.message}`); }
  return { sets: summarizeCosts((rows ?? []) as { set_id: string | null; kind: string; usd: unknown }[]), missing: false };
});

/** Pure: rows → per-set totals with a kind breakdown, biggest first. Exported for the test. */
export function summarizeCosts(rows: readonly { set_id: string | null; kind: string; usd: unknown }[]): SetCost[] {
  const bySet = new Map<string, SetCost>();
  for (const r of rows) {
    const setId = r.set_id ?? "(no set)";
    const usd = Number(r.usd);
    if (!Number.isFinite(usd)) continue;
    const kind = (COST_KINDS as readonly string[]).includes(r.kind) ? (r.kind as CostKind) : "other";
    const s = bySet.get(setId) ?? { setId, total: 0, byKind: {}, events: 0 };
    s.total += usd; s.byKind[kind] = (s.byKind[kind] ?? 0) + usd; s.events += 1;
    bySet.set(setId, s);
  }
  return [...bySet.values()].sort((a, b) => b.total - a.total);
}

function rowOf(r: Record<string, unknown>): CostRow {
  return {
    id: String(r.id), setId: (r.set_id as string | null) ?? null, runId: (r.run_id as string | null) ?? null,
    kind: ((COST_KINDS as readonly string[]).includes(String(r.kind)) ? String(r.kind) : "other") as CostKind,
    usd: Number(r.usd), model: (r.model as string | null) ?? null, label: (r.label as string | null) ?? null, createdAt: String(r.created_at),
  };
}
