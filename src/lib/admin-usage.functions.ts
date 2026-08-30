// ADMIN USAGE TELEMETRY (server) — durable store for interaction/impression events
// and sessions. Same contract as edit-events.functions.ts: service-role, deny-by-
// default RLS, append-only (upsert on the client-minted id so a retry is a no-op),
// paged reads (the whole point is the >1000-row regime), fail-loud migration hint.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "admin_usage_events/admin_usage_sessions tables missing — apply migration/supabase-migrations/20260829_1200_admin_usage_telemetry.sql in the Supabase SQL editor";
function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /admin_usage/i)) throw new Error(MISSING);
  throw new Error(e.message);
}
const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

const eventSchema = z.object({
  id: z.string().min(1).max(160),
  session_id: z.string().min(1).max(80),
  user_id: z.string().uuid().nullable(),
  surface: z.string().min(1).max(40),
  element_id: z.string().min(1).max(120),
  element_label: z.string().max(200).nullable(),
  event_type: z.enum(["interaction", "impression", "rage_click"]),
  screen_region: z.string().max(60).nullable(),
  parent_panel: z.string().max(80).nullable(),
  occurred_at: z.string().min(4),
});
export type UsageEventRow = z.infer<typeof eventSchema> & { created_at: string };
const EV_COLS = "id,session_id,user_id,surface,element_id,element_label,event_type,screen_region,parent_panel,occurred_at,created_at";

const sessionSchema = z.object({
  id: z.string().min(1).max(80),
  user_id: z.string().uuid().nullable(),
  surface: z.string().min(1).max(40),
  started_at: z.string().min(4),
  ended_at: z.string().min(4).nullable(),
  active_ms: z.number().int().nonnegative(),
  note: z.string().max(200).nullable().optional(),
});
export type UsageSessionRow = z.infer<typeof sessionSchema> & { created_at: string; updated_at: string };
const SE_COLS = "id,user_id,surface,started_at,ended_at,active_ms,note,created_at,updated_at";

export const upsertUsageEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ events: z.array(eventSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true; count: number }> => {
    const db = await admin();
    const { error } = await db.from("admin_usage_events").upsert(data.events, { onConflict: "id", ignoreDuplicates: true });
    if (error) rethrow(error);
    return { ok: true, count: data.events.length };
  });

export const upsertUsageSessions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ sessions: z.array(sessionSchema).min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const rows = data.sessions.map((s) => ({ ...s, note: s.note ?? null, updated_at: new Date().toISOString() }));
    const { error } = await db.from("admin_usage_sessions").upsert(rows, { onConflict: "id" });
    if (error) rethrow(error);
    return { ok: true };
  });

/** Events for a surface since an ISO cutoff, optionally one user. Paged. */
export const listUsageEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ surface: z.string(), sinceIso: z.string(), userId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<UsageEventRow[]> => {
    const db = await admin();
    const PAGE = 1000; const out: UsageEventRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let q = db.from("admin_usage_events").select(EV_COLS).eq("surface", data.surface).gte("occurred_at", data.sinceIso).order("occurred_at", { ascending: true }).range(from, from + PAGE - 1);
      if (data.userId) q = q.eq("user_id", data.userId);
      const { data: rows, error } = await q;
      if (error) rethrow(error);
      const r = (rows ?? []) as UsageEventRow[]; out.push(...r);
      if (r.length < PAGE) break;
    }
    return out;
  });

export const listUsageSessions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ surface: z.string(), sinceIso: z.string(), userId: z.string().uuid().nullable().optional() }).parse(d))
  .handler(async ({ data }): Promise<UsageSessionRow[]> => {
    const db = await admin();
    let q = db.from("admin_usage_sessions").select(SE_COLS).eq("surface", data.surface).gte("started_at", data.sinceIso).order("started_at", { ascending: true });
    if (data.userId) q = q.eq("user_id", data.userId);
    const { data: rows, error } = await q;
    if (error) rethrow(error);
    return (rows ?? []) as UsageSessionRow[];
  });
