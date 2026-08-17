// IDEA BANK (server) — the source of truth behind the local-first client.
// Service-role, RLS deny-by-default, same shape as campus-exams.functions.ts.
//
// FAILS LOUD, ALWAYS. The bug this replaces was a silent one: notes vanished and
// nothing ever said so. Every path here throws a message a human can act on, and
// the client surfaces it rather than swallowing it.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING = "idea_notes table missing — apply migration/supabase-migrations/0115_idea_notes.sql in the Supabase SQL editor";

function rethrow(e: { code?: string; message: string }): never {
  if (isMissingSchema(e, /idea_note/i)) throw new Error(MISSING);
  throw new Error(e.message);
}

const admin = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as { from: (t: string) => any };
};

export interface IdeaRowDTO {
  id: string;
  text: string;
  category: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

const rowSchema = z.object({
  id: z.string().min(1).max(120),
  text: z.string().trim().min(1).max(8000),
  category: z.string().min(1).max(40),
  created_at: z.string().min(4),
  updated_at: z.string().min(4),
  archived_at: z.string().nullable().optional(),
});

/** Everything, archived included — the client decides what to show, and an
 *  archived note must still round-trip so "restore" works on any machine. */
export const listIdeaNotes = createServerFn({ method: "POST" }).handler(async (): Promise<IdeaRowDTO[]> => {
  const db = await admin();
  const { data, error } = await db.from("idea_notes").select("id,text,category,created_at,updated_at,archived_at").order("created_at", { ascending: false });
  if (error) rethrow(error);
  return (data ?? []) as IdeaRowDTO[];
});

/** Push a batch. UPSERT on the client-minted id, so a retry after a timeout that
 *  actually succeeded is a no-op instead of a duplicate — that idempotency is the
 *  whole reason ids are minted client-side.
 *
 *  Returns the rows the server now holds for those ids, so the client can stamp
 *  syncedAt from what was ACKNOWLEDGED rather than from what it hoped it sent. */
export const upsertIdeaNotes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ notes: z.array(rowSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data }): Promise<IdeaRowDTO[]> => {
    const db = await admin();
    const rows = data.notes.map((n) => ({ ...n, archived_at: n.archived_at ?? null }));
    const { data: out, error } = await db.from("idea_notes").upsert(rows, { onConflict: "id" }).select("id,text,category,created_at,updated_at,archived_at");
    if (error) rethrow(error);
    return (out ?? []) as IdeaRowDTO[];
  });
