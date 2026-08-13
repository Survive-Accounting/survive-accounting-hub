// Server functions for the SNIPPET LIBRARY (PROMPT 2 — personal clip-bin).
// A snippet = a reusable saved cluster of cards + relative layout + internal
// state, GLOBAL across scenes/courses. Same infra as canvas.functions.ts:
// SERVICE-ROLE client (canvas_snippets is deny-by-default RLS, migration 0097),
// every fn method:"POST" (a GET that throws returns an empty 200 and the
// fail-loud contract dies), payload crosses the boundary as a STRING.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_TABLE_HINT =
  "canvas_snippets table missing — apply migration/supabase-migrations/0097_canvas_snippets.sql in the Supabase SQL editor";

function rethrow(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /canvas_snippets/i)) throw new Error(MISSING_TABLE_HINT);
  throw new Error(error.message);
}

export interface SnippetRow {
  id: string;
  name: string;
  /** Stringified { v, nodes, edges } — parsed client-side (serializable-type contract). */
  payload_json: string;
  created_at: string;
}

/** All snippets, newest first (global — no course/scene scope). */
export const listSnippets = createServerFn({ method: "POST" }).handler(async (): Promise<SnippetRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("canvas_snippets" as never) as any)
    .select("id,name,payload_json,created_at")
    .order("created_at", { ascending: false });
  if (error) rethrow(error);
  // jsonb → string for the client (same contract as loadScene's nodes_json)
  return ((data ?? []) as { id: string; name: string; payload_json: unknown; created_at: string }[]).map((r) => ({
    id: r.id,
    name: r.name,
    payload_json: JSON.stringify(r.payload_json ?? {}),
    created_at: r.created_at,
  }));
});

const saveSchema = z.object({
  name: z.string().min(1).max(80),
  payload_json: z.string(), // stringified { v, nodes, edges } — stored as jsonb
});

export const saveSnippet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data }): Promise<SnippetRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let payload: unknown;
    try {
      payload = JSON.parse(data.payload_json);
    } catch (e) {
      throw new Error(`Snippet payload is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const { data: ins, error } = await (supabaseAdmin.from("canvas_snippets" as never) as any)
      .insert({ name: data.name.trim(), payload_json: payload })
      .select("id,name,payload_json,created_at")
      .single();
    if (error) rethrow(error);
    const r = ins as { id: string; name: string; payload_json: unknown; created_at: string };
    return { id: r.id, name: r.name, payload_json: JSON.stringify(r.payload_json ?? {}), created_at: r.created_at };
  });

export const renameSnippet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("canvas_snippets" as never) as any)
      .update({ name: data.name.trim() })
      .eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });

/** Delete a snippet. NEVER touches cards already spawned from it — a spawned
 *  copy is an independent scene node with its own ids. */
export const deleteSnippet = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("canvas_snippets" as never) as any).delete().eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });
