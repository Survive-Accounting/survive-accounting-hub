// EDIT EVENTS (server) — the trim-telemetry log's source of truth (P4).
// Service-role, RLS deny-by-default, same shape as idea-bank.functions.ts.
// Append-only from the app's point of view: events are immutable facts, the
// upsert exists purely so a retried request is a no-op instead of a duplicate.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "edit_events table missing — apply migration/supabase-migrations/0117_edit_events.sql in the Supabase SQL editor";

function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /edit_event/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

const SELECT = "id,at,set_id,ceq_id,take_path,take_name,duration_s,slate_end_ms,onset_ms,offset_ms,proposed_in_s,proposed_out_s,final_in_s,final_out_s,how,disposition,rule_version,pre_roll_ms,post_roll_ms,created_at";

const rowSchema = z.object({
  id: z.string().min(1).max(120),
  at: z.string().min(4),
  set_id: z.string().min(1).max(120),
  ceq_id: z.string().max(120).nullable(),
  take_path: z.string().min(1).max(500),
  take_name: z.string().max(300).nullable(),
  duration_s: z.number().nullable(),
  slate_end_ms: z.number().nullable(),
  onset_ms: z.number().nullable(),
  offset_ms: z.number().nullable(),
  proposed_in_s: z.number().nullable(),
  proposed_out_s: z.number().nullable(),
  final_in_s: z.number(),
  final_out_s: z.number(),
  how: z.enum(["propose", "drag", "nudge"]),
  disposition: z.enum(["proposed", "accepted", "nudged", "overridden"]),
  rule_version: z.string().min(1).max(60),
  pre_roll_ms: z.number(),
  post_roll_ms: z.number(),
});

export type EditEventRow = z.infer<typeof rowSchema> & { created_at: string };

/** Everything, oldest first — the export merges this with the local queue. */
export const listEditEvents = createServerFn({ method: "POST" }).handler(async (): Promise<EditEventRow[]> => {
  const db = await admin();
  const { data, error } = await db.from("edit_events").select(SELECT).order("at", { ascending: true });
  if (error) rethrow(error);
  return (data ?? []) as EditEventRow[];
});

/** Push a batch. Upsert on the client-minted id — a retry after a timeout that
 *  actually landed is a no-op. Returns what the server now holds so the client
 *  stamps syncedAt from the ACKNOWLEDGEMENT, not the attempt. */
export const upsertEditEvents = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ events: z.array(rowSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<EditEventRow[]> => {
    const db = await admin();
    const { data: out, error } = await db.from("edit_events").upsert(data.events, { onConflict: "id" }).select(SELECT);
    if (error) rethrow(error);
    return (out ?? []) as EditEventRow[];
  });
