// Server functions for the Present Canvas (/study/canvas) — scene save/load. Writes go
// through the SERVICE-ROLE client (canvas_scenes RLS is deny-by-default; see migration
// 0084). No auth — this is Lee's filming playground; the route itself is unlinked.
//
// FAIL-LOUD CONTRACT: if canvas_scenes doesn't exist yet (0084 not applied), these throw
// with a message naming the migration; the canvas shows a banner and falls back to
// localStorage so the playground still works.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MISSING_TABLE_HINT =
  "canvas_scenes table missing — apply migration/supabase-migrations/0084_canvas_scenes.sql in the Supabase SQL editor";

function rethrow(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || /relation .*canvas_scenes.* does not exist/i.test(error.message)) {
    throw new Error(MISSING_TABLE_HINT);
  }
  throw new Error(error.message);
}

export interface SceneListRow {
  id: string;
  name: string;
  chapter_id: string | null;
  updated_at: string;
}

export const listScenes = createServerFn({ method: "GET" }).handler(async (): Promise<SceneListRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("canvas_scenes" as never) as any)
    .select("id,name,chapter_id,updated_at")
    .order("updated_at", { ascending: false });
  if (error) rethrow(error);
  return (data ?? []) as SceneListRow[];
});

const loadSchema = z.object({ id: z.string().uuid() });

export const loadScene = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => loadSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("canvas_scenes" as never) as any)
      .select("id,name,chapter_id,nodes_json,viewport_json,waypoints_json,bg,updated_at")
      .eq("id", data.id)
      .maybeSingle();
    if (error) rethrow(error);
    if (!row) throw new Error(`Scene ${data.id} not found`);
    // JSON blobs cross the server-fn boundary as STRINGS (TanStack's serializable-type
    // check rejects open Record shapes); the client parses them back.
    const r = row as { id: string; name: string; chapter_id: string | null; nodes_json: unknown; viewport_json: unknown; bg: string | null; updated_at: string };
    return {
      id: r.id,
      name: r.name,
      chapter_id: r.chapter_id,
      nodes_json: JSON.stringify(r.nodes_json ?? {}),
      viewport_json: JSON.stringify(r.viewport_json ?? {}),
      bg: r.bg,
      updated_at: r.updated_at,
    };
  });

const saveSchema = z.object({
  id: z.string().uuid().optional(), // absent → insert (Save As / first save)
  name: z.string().min(1).max(120),
  chapter_id: z.string().uuid().nullable().optional(),
  nodes_json: z.string(), // stringified { nodes } — stored as jsonb
  viewport_json: z.string(), // stringified { x, y, zoom }
  bg: z.string().optional(),
});

export const saveScene = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let nodesJson: unknown, viewportJson: unknown;
    try {
      nodesJson = JSON.parse(data.nodes_json);
      viewportJson = JSON.parse(data.viewport_json);
    } catch (e) {
      throw new Error(`Scene payload is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const payload = {
      name: data.name,
      chapter_id: data.chapter_id ?? null,
      nodes_json: nodesJson,
      viewport_json: viewportJson,
      bg: data.bg ?? "flat",
      updated_at: new Date().toISOString(),
    };
    if (data.id) {
      const { error } = await (supabaseAdmin.from("canvas_scenes" as never) as any)
        .update(payload)
        .eq("id", data.id);
      if (error) rethrow(error);
      return { id: data.id };
    }
    const { data: ins, error } = await (supabaseAdmin.from("canvas_scenes" as never) as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) rethrow(error);
    return { id: (ins as { id: string }).id };
  });

const deleteSchema = z.object({ id: z.string().uuid() });

export const deleteScene = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("canvas_scenes" as never) as any).delete().eq("id", data.id);
    if (error) rethrow(error);
    return { ok: true };
  });
