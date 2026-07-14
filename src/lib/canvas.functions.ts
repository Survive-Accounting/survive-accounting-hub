// Server functions for the Present Canvas (/study/canvas) — scene save/load. Writes go
// through the SERVICE-ROLE client (canvas_scenes RLS is deny-by-default; see migration
// 0084). No auth — this is Lee's filming playground; the route itself is unlinked.
//
// FAIL-LOUD CONTRACT: if canvas_scenes doesn't exist yet (0084 not applied), these throw
// with a message naming the migration; the canvas shows a banner and falls back to
// localStorage so the playground still works.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { isMissingSchema } from "@/lib/pg-errors";

const MISSING_TABLE_HINT =
  "canvas_scenes table missing — apply migration/supabase-migrations/0084_canvas_scenes.sql in the Supabase SQL editor";

function rethrow(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /canvas_scenes/i)) {
    throw new Error(MISSING_TABLE_HINT);
  }
  throw new Error(error.message);
}

export interface SceneListRow {
  id: string;
  name: string;
  chapter_id: string | null;
  updated_at: string;
  /** Folder assignment (0088). undefined when the migration isn't applied —
   *  the Load dialog then renders flat with a fail-loud folder header. */
  folder_id?: string | null;
}

export const listScenes = createServerFn({ method: "GET" }).handler(async (): Promise<SceneListRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const tbl = () => supabaseAdmin.from("canvas_scenes" as never) as any;
  let { data, error } = await tbl().select("id,name,chapter_id,updated_at,folder_id").order("updated_at", { ascending: false });
  if (error && (error.code === "42703" || /folder_id/.test(error.message))) {
    ({ data, error } = await tbl().select("id,name,chapter_id,updated_at").order("updated_at", { ascending: false }));
  }
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

// ---- SCENE FOLDERS = COURSE GROUPS (workspace chrome, migration 0088) -------
const MISSING_0088_HINT =
  "scene folders missing — run migration/supabase-migrations/0088_scene_folders.sql in the Supabase SQL editor";

function rethrow0088(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /canvas_folders|folder_id/i)) {
    throw new Error(MISSING_0088_HINT);
  }
  throw new Error(error.message);
}

export interface FolderRow {
  id: string;
  name: string;
  course_id: string | null;
  sort: number;
}

export const listFolders = createServerFn({ method: "GET" }).handler(async (): Promise<FolderRow[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("canvas_folders" as never) as any)
    .select("id,name,course_id,sort")
    .order("sort")
    .order("name");
  if (error) rethrow0088(error);
  return (data ?? []) as FolderRow[];
});

export const createFolder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ name: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }): Promise<FolderRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ins, error } = await (supabaseAdmin.from("canvas_folders" as never) as any)
      .insert({ name: data.name.trim(), sort: 100 })
      .select("id,name,course_id,sort")
      .single();
    if (error) rethrow0088(error);
    return ins as FolderRow;
  });

export const renameFolder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), name: z.string().min(1).max(60) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("canvas_folders" as never) as any)
      .update({ name: data.name.trim() })
      .eq("id", data.id);
    if (error) rethrow0088(error);
    return { ok: true };
  });

const moveSceneSchema = z.object({
  scene_id: z.string().uuid(),
  folder_id: z.string().uuid().nullable(), // null = Unfiled
  /** true = overwrite a DIFFERENT existing course context with the folder's. */
  force_course: z.boolean().optional(),
});

/** Move a scene into a folder. ONE GESTURE, ONE TRUTH: a course folder also
 *  sets the scene's course context (inside nodes_json.sceneSettings) when it's
 *  unset. If the scene already carries a DIFFERENT course, returns
 *  { conflict } so the client can ask before forcing. */
export const moveSceneToFolder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => moveSceneSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true; courseSet?: string } | { conflict: true; sceneCourseId: string; folderCourseId: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const scenes = () => supabaseAdmin.from("canvas_scenes" as never) as any;
    let folderCourse: string | null = null;
    if (data.folder_id) {
      const { data: folder, error: fErr } = await (supabaseAdmin.from("canvas_folders" as never) as any)
        .select("course_id")
        .eq("id", data.folder_id)
        .maybeSingle();
      if (fErr) rethrow0088(fErr);
      folderCourse = (folder as { course_id: string | null } | null)?.course_id ?? null;
    }
    const { data: scene, error: sErr } = await scenes().select("id,nodes_json").eq("id", data.scene_id).maybeSingle();
    if (sErr) rethrow0088(sErr);
    if (!scene) throw new Error(`Scene ${data.scene_id} not found`);

    const nodesJson = ((scene as { nodes_json: unknown }).nodes_json ?? {}) as Record<string, unknown>;
    const ss = ((nodesJson.sceneSettings ?? {}) as Record<string, unknown>);
    const sceneCourseId = (ss.courseId as string | null | undefined) ?? null;

    const patch: Record<string, unknown> = { folder_id: data.folder_id };
    let courseSet: string | undefined;
    if (folderCourse) {
      if (!sceneCourseId || data.force_course) {
        nodesJson.sceneSettings = { ...ss, courseId: folderCourse, ...(sceneCourseId && sceneCourseId !== folderCourse ? { chapterId: null } : {}) };
        patch.nodes_json = nodesJson;
        courseSet = folderCourse;
      } else if (sceneCourseId !== folderCourse) {
        return { conflict: true, sceneCourseId, folderCourseId: folderCourse };
      }
    }
    const { error } = await scenes().update(patch).eq("id", data.scene_id);
    if (error) rethrow0088(error);
    return { ok: true, courseSet };
  });

// ---- chart of accounts (JE picker) -----------------------------------------
// RLS blocks anon SELECT on chart_of_accounts (verified: 0 rows, no error), so
// the canvas reads it through the service role. Read-only vocabulary, safe.
export interface CoaRowOut {
  id: string;
  canonical_name: string;
  account_type: string;
  normal_balance: string;
}

export const listCoa = createServerFn({ method: "GET" }).handler(async (): Promise<CoaRowOut[]> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin.from("chart_of_accounts" as never) as any)
    .select("id,canonical_name,account_type,normal_balance")
    .order("canonical_name");
  if (error) throw new Error(error.message);
  return (data ?? []) as CoaRowOut[];
});

// ---- COURSE COA SETS (content reset, migration 0087) ------------------------
// Per-course curated account lists drawn from the master chart_of_accounts.
// The master stays untouched as reference; course_coa maps course → subset.
// Deny-by-default RLS — all access through these service-role fns.
const MISSING_0087_HINT =
  "content-reset schema missing — run migration/supabase-migrations/0087_content_reset.sql in the Supabase SQL editor";

function rethrow0087(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /course_coa|status|source|sort_order/i)) {
    throw new Error(MISSING_0087_HINT);
  }
  throw new Error(error.message);
}

const courseIdSchema = z.object({ course_id: z.string().uuid() });

export const listCourseAccounts = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => courseIdSchema.parse(d))
  .handler(async ({ data }): Promise<CoaRowOut[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from("course_coa" as never) as any)
      .select("account_id, chart_of_accounts(id,canonical_name,account_type,normal_balance)")
      .eq("course_id", data.course_id);
    if (error) rethrow0087(error);
    return ((rows ?? []) as any[])
      .map((r) => r.chart_of_accounts)
      .filter(Boolean)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name)) as CoaRowOut[];
  });

const courseAccountSchema = z.object({ course_id: z.string().uuid(), account_id: z.string().uuid() });

export const addCourseAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => courseAccountSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("course_coa" as never) as any)
      .upsert({ course_id: data.course_id, account_id: data.account_id }, { onConflict: "course_id,account_id" });
    if (error) rethrow0087(error);
    return { ok: true };
  });

export const removeCourseAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => courseAccountSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("course_coa" as never) as any)
      .delete()
      .eq("course_id", data.course_id)
      .eq("account_id", data.account_id);
    if (error) rethrow0087(error);
    return { ok: true };
  });

const ACCOUNT_TYPES = [
  "asset", "liability", "equity", "revenue", "expense",
  "contra_asset", "contra_liability", "contra_equity", "contra_revenue", "liability_adjunct",
] as const;

const createAccountSchema = z.object({
  course_id: z.string().uuid(),
  canonical_name: z.string().min(2).max(80),
  account_type: z.enum(ACCOUNT_TYPES),
  normal_balance: z.enum(["debit", "credit"]),
});

/** Brand-new account: lands in the MASTER chart AND this course's set. If the
 *  name already exists in the master (case-insensitive), reuse that row. */
export const createAccount = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => createAccountSchema.parse(d))
  .handler(async ({ data }): Promise<{ account: CoaRowOut }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const coa = () => supabaseAdmin.from("chart_of_accounts" as never) as any;
    const { data: existing, error: selErr } = await coa()
      .select("id,canonical_name,account_type,normal_balance")
      .ilike("canonical_name", data.canonical_name.trim())
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    let account = existing as CoaRowOut | null;
    if (!account) {
      const { data: ins, error } = await coa()
        .insert({ canonical_name: data.canonical_name.trim(), account_type: data.account_type, normal_balance: data.normal_balance })
        .select("id,canonical_name,account_type,normal_balance")
        .single();
      if (error) throw new Error(error.message);
      account = ins as CoaRowOut;
    }
    const { error: mapErr } = await (supabaseAdmin.from("course_coa" as never) as any)
      .upsert({ course_id: data.course_id, account_id: account.id }, { onConflict: "course_id,account_id" });
    if (mapErr) rethrow0087(mapErr);
    return { account };
  });

// ---- AUTHOR FROM CANVAS (save a JE card as an authored scenario doc) --------
const saveScenarioSchema = z.object({
  id: z.string().uuid().optional(), // present = update the linked scenario
  course_id: z.string().uuid(), // used to sanity-check the chapter belongs to it
  chapter_id: z.string().uuid(),
  sort_order: z.number().int().min(0).max(9999),
  title: z.string().min(1).max(160),
  doc_json: z.string(), // stringified ScenarioDoc (serializable-type contract)
});

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "scenario";

export const saveScenarioDoc = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveScenarioSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string; slug: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let doc: unknown;
    try {
      doc = JSON.parse(data.doc_json);
    } catch (e) {
      throw new Error(`Scenario doc is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const { data: ch, error: chErr } = await supabaseAdmin
      .from("chapters")
      .select("id,course_id")
      .eq("id", data.chapter_id)
      .maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch || (ch as { course_id: string }).course_id !== data.course_id) {
      throw new Error("Chapter does not belong to the selected course");
    }
    const tbl = () => supabaseAdmin.from("je_scenarios" as never) as any;
    if (data.id) {
      const { data: row } = await tbl().select("slug").eq("id", data.id).maybeSingle();
      const slug = (row as { slug: string } | null)?.slug ?? `${slugify(data.title)}-${Date.now().toString(36).slice(-4)}`;
      // keep the doc self-consistent — importers/exports treat doc.slug/title as truth
      (doc as Record<string, unknown>).slug = slug;
      (doc as Record<string, unknown>).title = data.title;
      const { error } = await tbl()
        .update({ title: data.title, doc, chapter_id: data.chapter_id, sort_order: data.sort_order })
        .eq("id", data.id);
      if (error) rethrow0087(error);
      return { id: data.id, slug };
    }
    const slug = `${slugify(data.title)}-${Date.now().toString(36).slice(-4)}`;
    (doc as Record<string, unknown>).slug = slug;
    (doc as Record<string, unknown>).title = data.title;
    const payload = { slug, title: data.title, doc, chapter_id: data.chapter_id, sort_order: data.sort_order, status: "active", source: "authored" };
    const { data: ins, error } = await tbl().insert(payload).select("id,slug").single();
    if (error) rethrow0087(error);
    return { id: (ins as { id: string }).id, slug: (ins as { slug: string }).slug };
  });

/** Next sort_order within a chapter (authored default: append). */
export const nextScenarioSort = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ next: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from("je_scenarios" as never) as any)
      .select("sort_order")
      .eq("chapter_id", data.chapter_id)
      .order("sort_order", { ascending: false })
      .limit(1);
    if (error) rethrow0087(error);
    const top = (rows?.[0] as { sort_order: number | null } | undefined)?.sort_order;
    return { next: (typeof top === "number" ? top : 0) + 1 };
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
      if (isMissingSchema(error, /canvas_scene_snapshots/i)) {
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

// ---- Mux signed playback ------------------------------------------------
// video_archive playback IDs use Mux's SIGNED policy (public URLs 403; confirmed
// against live Mux: unsigned thumbnail/mp4/HLS all 403, signed HLS returns 200
// with a real manifest). Mints a short-lived per-resource token — "v" for HLS
// video, "t" for thumbnails (Mux checks the audience claim per resource type;
// a "v" token 403s on image.mux.com). Signing key lives in
// MUX_SIGNING_KEY_ID + MUX_SIGNING_PRIVATE_KEY (base64 .pem); public playback
// IDs still play unsigned regardless (the video card only requests a token
// when the initial unsigned load fails).
const b64url = (b: Buffer | string) =>
  (typeof b === "string" ? Buffer.from(b) : b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const signMuxSchema = z.object({ playbackId: z.string().min(8).max(120), aud: z.enum(["v", "t", "s", "g"]).default("v") });

export const signMuxPlayback = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => signMuxSchema.parse(d))
  .handler(async ({ data }): Promise<{ token: string }> => {
    const keyId = process.env.MUX_SIGNING_KEY_ID;
    const pkB64 = process.env.MUX_SIGNING_PRIVATE_KEY;
    if (!keyId || !pkB64) {
      throw new Error(
        "MUX signing not configured — create a signing key in the Mux dashboard and set MUX_SIGNING_KEY_ID + MUX_SIGNING_PRIVATE_KEY. Public playback IDs play without it.",
      );
    }
    const { createSign } = await import("node:crypto");
    const privateKey = Buffer.from(pkB64, "base64").toString("utf8");
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: keyId }));
    const payload = b64url(JSON.stringify({ sub: data.playbackId, aud: data.aud, exp: Math.floor(Date.now() / 1000) + 6 * 3600 }));
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    const signature = b64url(signer.sign(privateKey));
    return { token: `${header}.${payload}.${signature}` };
  });

export interface SnapshotListRow {
  id: string;
  taken_at: string;
  label: string | null;
}

const listSnapsSchema = z.object({ scene_id: z.string().uuid() });

export const listSnapshots = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => listSnapsSchema.parse(d))
  .handler(async ({ data }): Promise<SnapshotListRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from("canvas_scene_snapshots" as never) as any)
      .select("id,taken_at,label")
      .eq("scene_id", data.scene_id)
      .order("taken_at", { ascending: false });
    if (error) {
      if (isMissingSchema(error, /canvas_scene_snapshots|snapshot/i)) throw new Error(MISSING_SNAPSHOTS_HINT);
      throw new Error(error.message);
    }
    return (rows ?? []) as SnapshotListRow[];
  });

const loadSnapSchema = z.object({ id: z.string().uuid() });

export const loadSnapshot = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => loadSnapSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin.from("canvas_scene_snapshots" as never) as any)
      .select("id,scene_id,taken_at,label,nodes_json,viewport_json,bg")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error(`Snapshot ${data.id} not found`);
    const r = row as { id: string; taken_at: string; label: string | null; nodes_json: unknown; viewport_json: unknown; bg: string | null };
    // JSON blobs cross the boundary as strings (same contract as loadScene)
    return {
      id: r.id,
      taken_at: r.taken_at,
      label: r.label,
      nodes_json: JSON.stringify(r.nodes_json ?? {}),
      viewport_json: JSON.stringify(r.viewport_json ?? {}),
      bg: r.bg,
    };
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
