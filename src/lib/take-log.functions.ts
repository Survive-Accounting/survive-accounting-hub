// TAKE LOGS — server side (migration/supabase-migrations/20260913_1300_take_logs.sql; the pure half
// is components/blastoff/take-slice.ts). /film writes the slide timeline of a roll as it goes; Post
// reads it to slice one continuous recording into its splits.
//
// Fails LOUD about the missing table — a continuous take whose timeline silently didn't save is a
// recording that can't be sliced, and the day to find that out is not after filming.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "./pg-errors";

export const MISSING_TAKE_LOG_HINT = "run migration/supabase-migrations/20260913_1300_take_logs.sql";

type DB = { from: (t: string) => any };
async function db(): Promise<DB> {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
}
function failed(error: { code?: string; message: string }): { ok: false; error: string } {
  return { ok: false, error: isMissingSchema(error, /take_logs/i) ? MISSING_TAKE_LOG_HINT : error.message };
}

const arrivalSchema = z.object({ frameId: z.string().min(1).max(80), take: z.number().int().min(0).max(99), atMs: z.number().int().min(0).max(24 * 3600 * 1000) });

export interface TakeLogRow { take_ref: string; set_id: string; rolled_at: string; arrivals: { frameId: string; take: number; atMs: number }[] }

/** Write the roll's timeline so far — one row per take_ref, replaced each time. */
export const saveTakeLog = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    takeRef: z.string().min(1).max(300), setId: z.string().min(1).max(200), rolledAt: z.string().max(40),
    arrivals: z.array(arrivalSchema).max(5000), who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<{ ok: boolean; error?: string }> => {
    const d = await db();
    const r = await d.from("take_logs").upsert({
      take_ref: data.takeRef, set_id: data.setId, rolled_at: data.rolledAt, arrivals: data.arrivals,
      created_by: data.who ?? null, updated_at: new Date().toISOString(),
    }, { onConflict: "take_ref" });
    return r.error ? failed(r.error) : { ok: true };
  });

/** The set's recent rolls, newest first — Post matches a file to one of them. */
export const listTakeLogs = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ setId: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; logs: TakeLogRow[] } | { ok: false; error: string }> => {
    const d = await db();
    const r = await d.from("take_logs").select("take_ref,set_id,rolled_at,arrivals").eq("set_id", data.setId).order("rolled_at", { ascending: false }).limit(40);
    return r.error ? failed(r.error) : { ok: true, logs: (r.data ?? []) as TakeLogRow[] };
  });
