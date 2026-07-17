// Server functions for the Present Canvas (/study/canvas) — scene save/load. Writes go
// through the SERVICE-ROLE client (canvas_scenes RLS is deny-by-default; see migration
// 0084). No auth — this is Lee's filming playground; the route itself is unlinked.
//
// FAIL-LOUD CONTRACT: if canvas_scenes doesn't exist yet (0084 not applied), these throw
// with a message naming the migration; the canvas shows a banner and falls back to
// localStorage so the playground still works.
//
// EVERY fn here is method: "POST" — including pure reads. In this @tanstack/react-start
// version a GET server fn that THROWS returns an empty 200, so the client resolves
// `undefined` instead of rejecting and the fail-loud contract silently dies (observed
// live on listFolders, 2026-07-13). POST errors propagate correctly. Do not switch
// reads back to GET without re-testing the thrown-error path end to end.
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

export const listScenes = createServerFn({ method: "POST" }).handler(async (): Promise<SceneListRow[]> => {
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

export const loadScene = createServerFn({ method: "POST" })
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

export const listFolders = createServerFn({ method: "POST" }).handler(async (): Promise<FolderRow[]> => {
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

/** Delete a folder — its scenes move to Unfiled (folder_id null), NEVER
 *  deleted. Seeded course folders can go too; the UI warns before calling. */
export const deleteFolder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: moveErr } = await (supabaseAdmin.from("canvas_scenes" as never) as any)
      .update({ folder_id: null })
      .eq("folder_id", data.id);
    if (moveErr) rethrow0088(moveErr);
    const { error } = await (supabaseAdmin.from("canvas_folders" as never) as any).delete().eq("id", data.id);
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

export const listCoa = createServerFn({ method: "POST" }).handler(async (): Promise<CoaRowOut[]> => {
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

export const listCourseAccounts = createServerFn({ method: "POST" })
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
    // chapter_id/sort_order still written for pre-0091 compatibility; the tree reads
    // from scenario_placements when present, so a NEW scenario gets ONE placement
    // (the current scene's course/chapter). Placement failure is non-fatal pre-0091.
    const payload = { slug, title: data.title, doc, chapter_id: data.chapter_id, sort_order: data.sort_order, status: "active", source: "authored" };
    const { data: ins, error } = await tbl().insert(payload).select("id,slug").single();
    if (error) rethrow0087(error);
    const newId = (ins as { id: string }).id;
    await upsertPlacement(supabaseAdmin, newId, data.course_id, data.chapter_id, data.sort_order);
    return { id: newId, slug: (ins as { slug: string }).slug };
  });

// FAIL-LOUD: the error message the client detects (prefix) to toast the missing
// migration. Server fns can't toast; they throw this and the caller surfaces it.
const MISSING_0091 = "MISSING_MIGRATION:0091_scenario_placements.sql — run it in the Supabase SQL editor; scenario placements are disabled until then.";
function throwIfMissing0091(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (isMissingSchema(error, /scenario_placements/i)) {
    // eslint-disable-next-line no-console
    console.error(`[canvas] ${MISSING_0091}`);
    throw new Error(MISSING_0091);
  }
  throw new Error(error.message);
}

/** Upsert ONE placement (scenario in a course-chapter). Idempotent on
 *  (scenario_id, chapter_id). FAILS LOUD when 0091 isn't applied (was a silent
 *  no-op that hid the whole placements feature). */
async function upsertPlacement(admin: any, scenarioId: string, courseId: string, chapterId: string, sortOrder: number): Promise<void> {
  const { error } = await (admin.from("scenario_placements" as never) as any)
    .upsert({ scenario_id: scenarioId, course_id: courseId, chapter_id: chapterId, sort_order: sortOrder }, { onConflict: "scenario_id,chapter_id" });
  throwIfMissing0091(error);
}

// ---- SCENARIO PLACEMENTS (0091) — a scenario appears in many course-chapters --
const placementSchema = z.object({
  scenario_id: z.string().uuid(),
  course_id: z.string().uuid(),
  chapter_id: z.string().uuid(),
  sort_order: z.number().int().min(0).max(9999).optional(),
});

/** "Also place in…" — add a scenario to another course-chapter. Validates the
 *  chapter belongs to the course; appends at the chapter's end unless a sort
 *  order is given. */
export const placeScenario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => placementSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ch, error: chErr } = await supabaseAdmin.from("chapters").select("id,course_id").eq("id", data.chapter_id).maybeSingle();
    if (chErr) throw new Error(chErr.message);
    if (!ch || (ch as { course_id: string }).course_id !== data.course_id) throw new Error("Chapter does not belong to the selected course");
    let sort = data.sort_order;
    if (sort == null) {
      const { data: rows } = await (supabaseAdmin.from("scenario_placements" as never) as any)
        .select("sort_order").eq("chapter_id", data.chapter_id).order("sort_order", { ascending: false }).limit(1);
      sort = ((rows?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;
    }
    await upsertPlacement(supabaseAdmin, data.scenario_id, data.course_id, data.chapter_id, sort);
    return { ok: true };
  });

/** Remove one placement (leaves the scenario + its other placements intact). */
export const unplaceScenario = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ scenario_id: z.string().uuid(), chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("scenario_placements" as never) as any)
      .delete().eq("scenario_id", data.scenario_id).eq("chapter_id", data.chapter_id);
    throwIfMissing0091(error);
    return { ok: true };
  });

export interface PlacementRow { chapter_id: string; course_id: string | null; sort_order: number; course_name: string | null; chapter_number: number | null; chapter_name: string | null; }

/** A scenario's placements, labelled — the edit-blast-radius list
 *  ("used in: Start Here Ch 1, Ch 4"). Empty when 0091 isn't applied. */
export const listScenarioPlacements = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ scenario_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<PlacementRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from("scenario_placements" as never) as any)
      .select("chapter_id,course_id,sort_order,chapters(chapter_number,chapter_name,courses(course_name))")
      .eq("scenario_id", data.scenario_id);
    throwIfMissing0091(error);
    return ((rows ?? []) as any[]).map((r) => ({
      chapter_id: r.chapter_id,
      course_id: r.course_id ?? null,
      sort_order: r.sort_order ?? 0,
      course_name: r.chapters?.courses?.course_name ?? null,
      chapter_number: r.chapters?.chapter_number ?? null,
      chapter_name: r.chapters?.chapter_name ?? null,
    })).sort((a, b) => (a.course_name ?? "").localeCompare(b.course_name ?? "") || (a.chapter_number ?? 0) - (b.chapter_number ?? 0));
  });

/** Next sort_order within a chapter (authored default: append). Counts
 *  PLACEMENTS (0091); falls back to the legacy je_scenarios.chapter_id path when
 *  scenario_placements isn't there yet. */
export const nextScenarioSort = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ chapter_id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ next: number }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const pl = await (supabaseAdmin.from("scenario_placements" as never) as any)
      .select("sort_order").eq("chapter_id", data.chapter_id).order("sort_order", { ascending: false }).limit(1);
    if (!pl.error) {
      const top = (pl.data?.[0] as { sort_order: number | null } | undefined)?.sort_order;
      return { next: (typeof top === "number" ? top : -1) + 1 };
    }
    if (!isMissingSchema(pl.error, /scenario_placements/i)) throw new Error(pl.error.message);
    const { data: rows, error } = await (supabaseAdmin.from("je_scenarios" as never) as any)
      .select("sort_order").eq("chapter_id", data.chapter_id).order("sort_order", { ascending: false }).limit(1);
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

export const listSnapshots = createServerFn({ method: "POST" })
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

export const loadSnapshot = createServerFn({ method: "POST" })
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

/** DUPLICATE SCENE (PROMPT C): full copy — "<name> (copy)", same folder. The
 *  master → filming/tutoring copy workflow's first half (Prep for filming is
 *  the second). */
export const duplicateScene = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ id: string; name: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tbl = () => supabaseAdmin.from("canvas_scenes" as never) as any;
    const { data: row, error } = await tbl()
      .select("name,chapter_id,folder_id,nodes_json,viewport_json,waypoints_json,bg")
      .eq("id", data.id)
      .maybeSingle();
    if (error) rethrow(error);
    if (!row) throw new Error(`Scene ${data.id} not found`);
    const src = row as { name: string; chapter_id: string | null; folder_id: string | null; nodes_json: unknown; viewport_json: unknown; waypoints_json: unknown; bg: string | null };
    const name = `${src.name} (copy)`;
    const { data: ins, error: insErr } = await tbl()
      .insert({ ...src, name, updated_at: new Date().toISOString() })
      .select("id")
      .single();
    if (insErr) rethrow(insErr);
    return { id: (ins as { id: string }).id, name };
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

// ---- COURSE / CHAPTER ADMIN (course structure cleanup, migration 0089) -----
// Vocabulary rung: Course → Chapter → Lesson → Card. A course's final chapter
// is conventionally its Region-level Check ("Course Wrap-up · Cram Decks").
// "Manage course" (Lee-only, mirrors Manage accounts) lives here: rename a
// course, and add/rename/reorder/archive its chapters. NOTHING is deleted —
// archive is the only lifecycle transition; scenario docs and scenes that
// reference an archived chapter keep resolving it (chapterLabel just marks it
// "(archived)" so Lee doesn't file new content under one by mistake).
const MISSING_0089_HINT =
  "course-structure schema missing — run migration/supabase-migrations/0089_course_structure_cleanup.sql in the Supabase SQL editor";

function rethrow0089(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /courses|chapters|status|subtitle|course_name/i)) {
    throw new Error(MISSING_0089_HINT);
  }
  throw new Error(error.message);
}

export interface ChapterRow {
  id: string;
  chapter_number: number;
  chapter_name: string;
  subtitle: string | null;
  status: "active" | "archived";
}

export const listChaptersAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => courseIdSchema.parse(d))
  .handler(async ({ data }): Promise<ChapterRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin.from("chapters" as never) as any)
      .select("id,chapter_number,chapter_name,subtitle,status")
      .eq("course_id", data.course_id)
      .order("status", { ascending: true }) // active first
      .order("chapter_number", { ascending: true });
    if (error) rethrow0089(error);
    return (rows ?? []) as ChapterRow[];
  });

export const renameCourse = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid(), course_name: z.string().min(1).max(80) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("courses" as never) as any)
      .update({ course_name: data.course_name.trim() })
      .eq("id", data.course_id);
    if (error) rethrow0089(error);
    return { ok: true };
  });

export const createChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ course_id: z.string().uuid(), chapter_name: z.string().min(1).max(120), subtitle: z.string().max(80).nullable().optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<ChapterRow> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tbl = () => supabaseAdmin.from("chapters" as never) as any;
    const { data: top, error: topErr } = await tbl()
      .select("chapter_number")
      .eq("course_id", data.course_id)
      .eq("status", "active")
      .order("chapter_number", { ascending: false })
      .limit(1);
    if (topErr) rethrow0089(topErr);
    const next = (typeof (top?.[0] as { chapter_number: number } | undefined)?.chapter_number === "number" ? (top![0] as { chapter_number: number }).chapter_number : 0) + 1;
    const { data: ins, error } = await tbl()
      .insert({
        course_id: data.course_id,
        chapter_number: next,
        chapter_name: data.chapter_name.trim(),
        subtitle: data.subtitle ?? null,
        status: "active",
        je_only_mode: false,
        target_lessons: 0,
        topics_locked: false,
      })
      .select("id,chapter_number,chapter_name,subtitle,status")
      .single();
    if (error) rethrow0089(error);
    return ins as ChapterRow;
  });

export const renameChapter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), chapter_name: z.string().min(1).max(120), subtitle: z.string().max(80).nullable().optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, unknown> = { chapter_name: data.chapter_name.trim() };
    if (data.subtitle !== undefined) patch.subtitle = data.subtitle;
    const { error } = await (supabaseAdmin.from("chapters" as never) as any).update(patch).eq("id", data.id);
    if (error) rethrow0089(error);
    return { ok: true };
  });

export const setChapterStatus = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), status: z.enum(["active", "archived"]) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin.from("chapters" as never) as any).update({ status: data.status }).eq("id", data.id);
    if (error) rethrow0089(error);
    return { ok: true };
  });

/** Drag-to-reorder: renumbers the given ACTIVE chapters 1..N in the given
 *  order. Collision-safe without a real transaction — every id is bumped to a
 *  distinct negative temp number FIRST (phase 1), then to its final 1..N
 *  (phase 2), so no two rows ever share a chapter_number even transiently. */
export const reorderChapters = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ course_id: z.string().uuid(), ordered_ids: z.array(z.string().uuid()).min(1) }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tbl = () => supabaseAdmin.from("chapters" as never) as any;
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await tbl().update({ chapter_number: -(i + 1) }).eq("id", data.ordered_ids[i]).eq("course_id", data.course_id);
      if (error) rethrow0089(error);
    }
    for (let i = 0; i < data.ordered_ids.length; i++) {
      const { error } = await tbl().update({ chapter_number: i + 1 }).eq("id", data.ordered_ids[i]).eq("course_id", data.course_id);
      if (error) rethrow0089(error);
    }
    return { ok: true };
  });

// ---- FRAME TAKES (Phase 2 take board) ---------------------------------------
// One row per OBS clip uploaded to Mux for a frame. Mux DIRECT UPLOAD flow:
// createFrameTakeUpload → client PUTs the file to the returned URL →
// resolveFrameTake polls upload → asset → playback id. passthrough metadata
// ("SH-L01-hook-f2-t1") keeps the Mux library organized — Lee never touches
// asset IDs. Requires MUX_TOKEN_ID + MUX_TOKEN_SECRET (API access token —
// separate from the MUX_SIGNING_* playback keys above); absent → fail loud
// naming the vars so the canvas shows the banner.

const MISSING_TAKES_HINT =
  "frame_takes table missing — apply migration/supabase-migrations/0094_frame_takes.sql in the Supabase SQL editor";
export const MUX_UPLOAD_VARS = "MUX_TOKEN_ID + MUX_TOKEN_SECRET";
const MUX_CREDS_HINT = `Mux upload not configured — set ${MUX_UPLOAD_VARS} in Vercel env (Mux dashboard → Settings → Access Tokens).`;

function rethrowTakes(error: { code?: string; message: string }): never {
  if (isMissingSchema(error, /frame_takes/i)) throw new Error(MISSING_TAKES_HINT);
  throw new Error(error.message);
}

function muxAuthHeader(): string {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) throw new Error(MUX_CREDS_HINT);
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function muxApi(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`https://api.mux.com${path}`, {
    ...init,
    headers: { Authorization: muxAuthHeader(), "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Mux ${path} → ${res.status}: ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  return body?.data;
}

export interface FrameTakeRow {
  id: string;
  frame_id: string;
  take_n: number;
  mux_asset_id: string;
  mux_playback_id: string | null;
  passthrough: string | null;
  status: "uploading" | "processing" | "ready" | "errored";
  keeper: boolean;
  width?: number | null;
  height?: number | null;
  created_at: string;
}

const takesTbl = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return () => supabaseAdmin.from("frame_takes" as never) as any;
};

/** Start a direct upload for a frame's next take. Returns the PUT URL. */
export const createFrameTakeUpload = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ frameId: z.string().min(1).max(120), passthrough: z.string().min(1).max(160) }).parse(d))
  .handler(async ({ data }): Promise<{ uploadUrl: string; takeId: string; takeN: number; passthrough: string }> => {
    muxAuthHeader(); // creds gate FIRST — fail loud before touching the DB
    const tbl = await takesTbl();
    const { data: prior, error: qErr } = await tbl().select("take_n").eq("frame_id", data.frameId).order("take_n", { ascending: false }).limit(1);
    if (qErr) rethrowTakes(qErr);
    const takeN = ((prior?.[0]?.take_n as number | undefined) ?? 0) + 1;
    const passthrough = `${data.passthrough}-t${takeN}`;
    const upload = await muxApi("/video/v1/uploads", {
      method: "POST",
      body: JSON.stringify({
        cors_origin: "*",
        // mp4_support: the publish pipeline concatenates keeper takes via a Mux
        // multi-input asset, which needs each take's static MP4 rendition as input.
        new_asset_settings: { playback_policy: ["public"], passthrough, video_quality: "basic", mp4_support: "standard" },
      }),
    });
    const { data: row, error: insErr } = await tbl()
      .insert({ frame_id: data.frameId, take_n: takeN, mux_upload_id: upload.id, passthrough, status: "uploading" })
      .select("id")
      .single();
    if (insErr) rethrowTakes(insErr);
    return { uploadUrl: upload.url as string, takeId: row.id as string, takeN, passthrough };
  });

/** Poll a take: upload → asset → playback id. Returns the fresh row. */
export const resolveFrameTake = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ takeId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<FrameTakeRow> => {
    const tbl = await takesTbl();
    const { data: row, error } = await tbl().select("*").eq("id", data.takeId).single();
    if (error) rethrowTakes(error);
    const take = row as FrameTakeRow & { mux_upload_id?: string | null };
    if (take.status === "ready" || take.status === "errored") return take;
    let assetId = take.mux_asset_id || null;
    if (!assetId && take.mux_upload_id) {
      const upload = await muxApi(`/video/v1/uploads/${take.mux_upload_id}`);
      if (upload.status === "errored" || upload.status === "cancelled" || upload.status === "timed_out") {
        const { data: upd } = await tbl().update({ status: "errored" }).eq("id", take.id).select("*").single();
        return (upd ?? { ...take, status: "errored" }) as FrameTakeRow;
      }
      assetId = upload.asset_id ?? null;
      if (!assetId) return take; // file still uploading
    }
    if (!assetId) return take;
    const asset = await muxApi(`/video/v1/assets/${assetId}`);
    const playbackId = asset.playback_ids?.find((p: { policy: string }) => p.policy === "public")?.id ?? asset.playback_ids?.[0]?.id ?? null;
    const status = asset.status === "ready" ? "ready" : asset.status === "errored" ? "errored" : "processing";
    // capture the video track's stored resolution for the publish drift-check (0095)
    const vtrack = (asset.tracks ?? []).find((t: { type?: string }) => t.type === "video");
    const width = (vtrack?.max_width as number | undefined) ?? null;
    const height = (vtrack?.max_height as number | undefined) ?? null;
    const { data: upd, error: uErr } = await tbl()
      .update({ mux_asset_id: assetId, mux_playback_id: playbackId, status, width, height })
      .eq("id", take.id)
      .select("*")
      .single();
    if (uErr) rethrowTakes(uErr);
    return upd as FrameTakeRow;
  });

/** All takes for the given frames (the scene's frame ids), newest take first. */
export const listFrameTakes = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ frameIds: z.array(z.string().min(1)).max(500) }).parse(d))
  .handler(async ({ data }): Promise<FrameTakeRow[]> => {
    if (data.frameIds.length === 0) return [];
    const tbl = await takesTbl();
    const { data: rows, error } = await tbl().select("*").in("frame_id", data.frameIds).order("take_n", { ascending: false });
    if (error) rethrowTakes(error);
    return (rows ?? []) as FrameTakeRow[];
  });

/** Mark ONE take the frame's KEEPER (clears the flag on its siblings). */
export const setTakeKeeper = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ takeId: z.string().uuid(), keeper: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const tbl = await takesTbl();
    const { data: row, error } = await tbl().select("frame_id").eq("id", data.takeId).single();
    if (error) rethrowTakes(error);
    if (data.keeper) {
      const { error: clrErr } = await tbl().update({ keeper: false }).eq("frame_id", row.frame_id);
      if (clrErr) rethrowTakes(clrErr);
    }
    const { error: setErr } = await tbl().update({ keeper: data.keeper }).eq("id", data.takeId);
    if (setErr) rethrowTakes(setErr);
    return { ok: true };
  });
