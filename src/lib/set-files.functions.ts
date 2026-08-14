// SET FILES — server fns (thin wrappers over set-files.core). Same conventions as
// canvas.functions.ts: POST everywhere (GET server fns swallow throws in this
// @tanstack/react-start version), JSON blobs cross the boundary as STRINGS,
// service-role client, fail-loud messages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { mergePool, splitLibraryScene, type SceneJsonLike } from "./set-files.core";

const scenes = async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return () => supabaseAdmin.from("canvas_scenes" as never) as any;
};

export interface SetFileRow {
  id: string;
  name: string;
  updated_at: string;
}

export interface PoolPayload {
  /** Stringified PoolDoc (nodes/edges/decks/ceqSets/sceneSettings). */
  pool_json: string;
  /** deckId → owning canvas_scenes row id (per-set saves target these). */
  deckRows: Record<string, string>;
  workspaceRowId: string | null;
  /** Present when no set files exist yet but a legacy multi-set scene does —
   *  the client shows the one-click migration banner. */
  legacy?: { id: string; name: string; decks: number } | null;
}

/** Load EVERY set file + the workspace row as one pooled document. Rows merge
 *  oldest-first so the newest copy of a shared memo wins. */
export const loadSetPool = createServerFn({ method: "POST" }).handler(async (): Promise<PoolPayload> => {
  const tbl = await scenes();
  const { data, error } = await tbl().select("id,name,updated_at,nodes_json").order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { id: string; name: string; updated_at: string; nodes_json: SceneJsonLike }[];
  // archived set files stay out of the pool — that's how a deleted set stays deleted
  // (rows are never hard-deleted; the Studio's delete soft-archives the row).
  const setRows = rows.filter((r) => r.nodes_json?.setFile && !r.nodes_json?.archived);
  const workspace = rows.find((r) => r.nodes_json?.workspace) ?? null;
  const legacyRow = rows.find((r) => !r.nodes_json?.setFile && !r.nodes_json?.workspace && !r.nodes_json?.archived && (r.nodes_json?.decks?.length ?? 0) > 0) ?? null;
  const pool = mergePool([...setRows, ...(workspace ? [workspace] : [])].map((r) => ({ json: r.nodes_json })));
  const deckRows: Record<string, string> = {};
  for (const r of setRows) for (const d of r.nodes_json.decks ?? []) deckRows[d.id] = r.id;
  return {
    pool_json: JSON.stringify(pool),
    deckRows,
    workspaceRowId: workspace?.id ?? null,
    legacy: setRows.length === 0 && legacyRow ? { id: legacyRow.id, name: legacyRow.name, decks: legacyRow.nodes_json.decks?.length ?? 0 } : null,
  };
});

/** ONE-CLICK SPLIT (in-app; Lee triggers it from the home banner). Idempotent:
 *  decks that already own a set file are skipped; the legacy scene is renamed to
 *  an archive, never deleted. Dry-run first — same ritual as every import. */
export const migrateToSetFiles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ apply: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ plan: { sets: number; cards: number; memosCopied: number; orphanCards: number; already: number; archiveName: string } ; applied: boolean }> => {
    const tbl = await scenes();
    const { data: rows, error } = await tbl().select("id,name,nodes_json");
    if (error) throw new Error(error.message);
    const all = (rows ?? []) as { id: string; name: string; nodes_json: SceneJsonLike }[];
    const owned = new Set<string>();
    for (const r of all) if (r.nodes_json?.setFile) for (const d of r.nodes_json.decks ?? []) owned.add(d.id);
    const legacy = all.find((r) => !r.nodes_json?.setFile && !r.nodes_json?.workspace && !r.nodes_json?.archived && (r.nodes_json?.decks?.length ?? 0) > 0);
    if (!legacy) throw new Error("No legacy multi-set scene found — the split has already run.");
    const full = splitLibraryScene(legacy.nodes_json);
    const fresh = full.setFiles.filter((f) => !owned.has(f.json.decks[0].id));
    const archiveName = `${legacy.name} — canvas archive`;
    const plan = { ...full.stats, sets: fresh.length, already: full.setFiles.length - fresh.length, archiveName };
    if (!data.apply) return { plan, applied: false };

    for (const f of fresh) {
      const { error: insErr } = await tbl().insert({ name: f.name.slice(0, 120), nodes_json: f.json, viewport_json: { x: 0, y: 0, zoom: 1 }, bg: "flat", updated_at: new Date().toISOString() });
      if (insErr) throw new Error(`Insert failed for set "${f.name}": ${insErr.message} — re-run to continue (idempotent).`);
    }
    if (!all.some((r) => r.nodes_json?.workspace)) {
      const { error: wsErr } = await tbl().insert({ name: "__workspace", nodes_json: full.workspaceJson, viewport_json: { x: 0, y: 0, zoom: 1 }, bg: "flat", updated_at: new Date().toISOString() });
      if (wsErr) throw new Error(`Workspace row insert failed: ${wsErr.message}`);
    }
    const { error: upErr } = await tbl().update({ name: archiveName.slice(0, 120), nodes_json: full.archiveJson, updated_at: new Date().toISOString() }).eq("id", legacy.id);
    if (upErr) throw new Error(`Archive rename failed: ${upErr.message} — set files were created; safe to re-run.`);
    return { plan, applied: true };
  });

const saveSetSchema = z.object({
  /** Existing row id, or absent → insert (a brand-new set). */
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(120),
  nodes_json: z.string(),
});

/** Write ONE set file row (or the workspace row — same shape). */
export const saveSetFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => saveSetSchema.parse(d))
  .handler(async ({ data }): Promise<{ id: string }> => {
    let json: unknown;
    try {
      json = JSON.parse(data.nodes_json);
    } catch (e) {
      throw new Error(`Set payload is not valid JSON: ${e instanceof Error ? e.message : e}`);
    }
    const tbl = await scenes();
    const payload = { name: data.name, nodes_json: json, updated_at: new Date().toISOString() };
    if (data.id) {
      const { error } = await tbl().update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await tbl().insert({ ...payload, viewport_json: { x: 0, y: 0, zoom: 1 }, bg: "flat" }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: (ins as { id: string }).id };
  });

/** Soft-archive a set file row — the pool loader skips archived rows, so a set
 *  deleted in the Studio stays deleted without ever hard-deleting data. */
export const archiveSetFile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const tbl = await scenes();
    const { data: row, error } = await tbl().select("id,name,nodes_json").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ok: true }; // already gone (never-inserted new set)
    const json = (row as { nodes_json: SceneJsonLike }).nodes_json ?? {};
    const { error: upErr } = await tbl()
      .update({ name: `${(row as { name: string }).name} (deleted)`.slice(0, 120), nodes_json: { ...json, archived: true }, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

// ---- EXAM 1 MASTER SEED, one click from File ▾ ------------------------------
// The overnight run found the 2026-08-13 apply was clobbered by a stale-tab
// autosave (dry-run reports the full diff again). The CSV ships in the bundle
// (?raw import on the client) so Lee can dry-run + apply from the app itself.
export { seedExam1Master } from "./exam1-seed.functions";
