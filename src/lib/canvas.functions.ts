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

// ---- chart of accounts (JE picker) -----------------------------------------
// RLS blocks anon SELECT on chart_of_accounts (verified: 0 rows, no error), so
// the canvas reads it through the service role. Read-only vocabulary, safe.
export interface CoaRowOut {
  canonical_name: string;
  account_type: string;
  normal_balance: string;
}

export const listCoa = createServerFn({ method: "GET" }).handler(async (): Promise<CoaRowOut[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("chart_of_accounts" as never) as any)
    .select("canonical_name,account_type,normal_balance")
    .order("canonical_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CoaRowOut[];
});

// ---- canvas-media uploads (image card paste/upload) -----------------------
// Bucket `canvas-media` must exist (public read; writes only via service role —
// SQL in migration/supabase-migrations/0085_canvas_media_bucket.sql). Images
// cross the boundary as base64 strings for the same serializable-type reason.
const MISSING_BUCKET_HINT =
  "canvas-media bucket missing — run migration/supabase-migrations/0085_canvas_media_bucket.sql in the Supabase SQL editor";

const uploadSchema = z.object({
  b64: z.string().min(1).max(9_000_000), // ~6.5MB binary ceiling
  contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
});

export const uploadCanvasMedia = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => uploadSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[data.contentType];
    const path = `canvas/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = Buffer.from(data.b64, "base64");
    const { error } = await supabaseAdmin.storage.from("canvas-media").upload(path, bytes, {
      contentType: data.contentType,
      cacheControl: "31536000",
    });
    if (error) {
      if (/bucket.*not.*found/i.test(error.message)) throw new Error(MISSING_BUCKET_HINT);
      throw new Error(`upload failed: ${error.message}`);
    }
    const { data: pub } = supabaseAdmin.storage.from("canvas-media").getPublicUrl(path);
    return { url: pub.publicUrl };
  });

// ---- scene snapshots (auto on entering film mode; keep the 10 newest) ------
const MISSING_SNAPSHOTS_HINT =
  "canvas_scene_snapshots missing — run migration/supabase-migrations/0086_canvas_scene_snapshots.sql in the Supabase SQL editor";

const snapshotSchema = z.object({
  scene_id: z.string().uuid(),
  label: z.string().max(80).optional(),
  nodes_json: z.string(),
  viewport_json: z.string(),
  bg: z.string().optional(),
});

export const snapshotScene = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => snapshotSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let nodesJson: unknown, viewportJson: unknown;
    try {
      nodesJson = JSON.parse(data.nodes_json);
      viewportJson = JSON.parse(data.viewport_json);
    } catch (e) {
      throw new Error(`Snapshot payload is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const tbl = () => supabaseAdmin.from("canvas_scene_snapshots" as never) as any;
    const { error } = await tbl().insert({
      scene_id: data.scene_id,
      label: data.label ?? null,
      nodes_json: nodesJson,
      viewport_json: viewportJson,
      bg: data.bg ?? null,
    });
    if (error) {
      if (error.code === "42P01" || /relation .*canvas_scene_snapshots.* does not exist/i.test(error.message)) {
        throw new Error(MISSING_SNAPSHOTS_HINT);
      }
      throw new Error(error.message);
    }
    // prune: everything past the 10 newest for this scene
    const { data: extra } = await tbl()
      .select("id")
      .eq("scene_id", data.scene_id)
      .order("taken_at", { ascending: false })
      .range(10, 1009);
    const ids = (extra ?? []).map((r: { id: string }) => r.id);
    if (ids.length) await tbl().delete().in("id", ids);
    return { ok: true };
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
