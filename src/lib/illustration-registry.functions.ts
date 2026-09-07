// THE ILLUSTRATION REGISTRY — the server side. Reads public.illustration_styles (migration
// 20260907_0200) overlaid on the code seeds, plus the settings in site_settings.settings.illustration;
// writes a style (a new version row, or the latest in place), the settings, or the seeds.
//
// WHY (2026-09-06, Lee's v6 workshop — docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, Part 2): "Build
// a style editor so the illustration style can be changed from the app and regenerated, without
// a code change each time." "Storage: move ILLUSTRATION_STYLES from hardcoded to DB-backed,
// seeded with the current entries so nothing breaks." "Version bumping: a 'Save as new version'
// button that increments the version and marks all existing illustrations generated under the
// old version as stale (the existing stale mechanism already handles the rest). Also a 'Save
// without bumping' for typo fixes that shouldn't invalidate the library."
//
// getRegistry(db) is the ONE read every server caller uses (runGeneration, the bank listing, the
// regenerate) — never STYLE_SEEDS directly — and it never throws: a missing table serves the
// seeds (source: "code"). The writes gate loudly on the migration. Every server fn is admin-gated.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { STYLE_SEEDS, type IllustrationRegistry, type IllustrationStyle } from "@/components/blastoff/illustration";
import { assertAdmin } from "@/lib/admin-session.functions";
import {
  ILLUSTRATION_SETTINGS_KEY, MISSING_STYLES_HINT, buildRegistry, nextVersion, rowToStyle, settingsOf, styleDraftSchema, styleToRow,
  type IllustrationSettings, type IllustrationStyleRow,
} from "@/lib/illustration-registry";
import { isMissingSchema } from "@/lib/pg-errors";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped-table convention (illustration_styles isn't in the generated types yet)
type DB = { from: (t: string) => any };
const admin = async (): Promise<DB> => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};
const isMissingStyles = (e: { code?: string; message: string }) => isMissingSchema(e, /illustration_styles/i);

// The site_settings singleton — the rep-onboarding-videos pattern.
async function readSettings(db: DB): Promise<Record<string, unknown>> {
  const { data } = await db.from("site_settings").select("settings").eq("id", 1).maybeSingle();
  return ((data?.settings as Record<string, unknown> | null) ?? {});
}
async function writeSettings(db: DB, patch: (s: IllustrationSettings) => IllustrationSettings): Promise<void> {
  const cur = await readSettings(db);
  const next = { ...cur, [ILLUSTRATION_SETTINGS_KEY]: patch(settingsOf(cur)) };
  const { error } = await db.from("site_settings").upsert({ id: 1, settings: next, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

/** THE ONE READ. Seeds overlaid by the table's rows (latest version per id wins) plus the
 *  settings. Never throws: the table missing or unreadable → the seeds, source "code", a
 *  console warning — so a page that only reads the registry can never break on a server that
 *  hasn't run the migration yet. */
export async function getRegistry(db: DB): Promise<IllustrationRegistry> {
  let rows: IllustrationStyle[] = [];
  let tableRead = false;
  try {
    const { data, error } = await db.from("illustration_styles").select("*");
    if (error) {
      if (isMissingStyles(error)) console.warn(`[illustration-registry] serving the code seeds — ${MISSING_STYLES_HINT}`);
      else console.warn("[illustration-registry] could not read illustration_styles (serving the code seeds):", error.message);
    } else {
      tableRead = true;
      for (const r of (data ?? []) as IllustrationStyleRow[]) {
        const s = rowToStyle(r);
        if (s) rows.push(s);
        else console.warn(`[illustration-registry] dropped malformed row ${r.id} v${r.version}`);
      }
    }
  } catch (e) {
    console.warn("[illustration-registry] read threw (serving the code seeds):", e instanceof Error ? e.message : String(e));
  }
  let settings: IllustrationSettings = {};
  try { settings = settingsOf(await readSettings(db)); } catch (e) { console.warn("[illustration-registry] settings unreadable:", e instanceof Error ? e.message : String(e)); }
  return buildRegistry(rows, settings, tableRead);
}

/** The registry for the client (useIllustrationRegistry). Admin-only: the suffixes are the
 *  house's own art direction, not something a student page needs. */
export const loadIllustrationRegistry = createServerFn({ method: "GET" })
  .handler(async (): Promise<IllustrationRegistry> => {
    await assertAdmin();
    return getRegistry(await admin());
  });

export interface SaveStyleResult { registry: IllustrationRegistry; saved: { id: string; version: number; bumped: boolean } }

/** SAVE A STYLE. `bump` true = a NEW row at the next version (old rows stay; every picture
 *  stamped with the old version reads stale in the bank from now on). `bump` false = the
 *  latest row for the id updated in place — "typo fixes that shouldn't invalidate the library"
 *  — or, for an id not in the table yet (a brand-new style, or a seed not yet seeded), a first
 *  row at the draft's version. Validated as Recraft would (weights ≤ 1) before anything is written. */
export const saveIllustrationStyle = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    style: styleDraftSchema,
    bump: z.boolean(),
    /** What changed — Lee's words, kept on the row. */
    note: z.string().trim().max(2000).nullable().optional(),
    who: z.string().max(40).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<SaveStyleResult> => {
    await assertAdmin();
    const db = await admin();
    const reg = await getRegistry(db);
    if (reg.source !== "db") throw new Error(`The illustration_styles table is missing — ${MISSING_STYLES_HINT}`);
    const latest = reg.styles[data.style.id];
    const inTable = !!latest && !reg.unseeded?.some((u) => u.id === latest.id && u.version === latest.version);
    const version = data.bump ? nextVersion(reg, data.style.id) : (latest?.version ?? data.style.version);
    const style: IllustrationStyle = { ...data.style, version, retired: !!data.style.retired, note: data.note ?? data.style.note ?? null };
    const row = styleToRow(style, data.who ?? null);
    if (data.bump || !inTable) {
      const { error } = await db.from("illustration_styles").insert(row);
      if (error) throw new Error(isMissingStyles(error) ? `The illustration_styles table is missing — ${MISSING_STYLES_HINT}` : `Could not save the style: ${error.message}`);
    } else {
      const { created_by: _cb, ...patch } = row;
      const { error } = await db.from("illustration_styles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", style.id).eq("version", version);
      if (error) throw new Error(`Could not update the style: ${error.message}`);
    }
    return { registry: await getRegistry(db), saved: { id: style.id, version, bumped: data.bump } };
  });

/** THE SETTINGS: which style new exam pictures start in, which the strategy shorts', and the
 *  edited BRIEF_SYSTEM (null = back to the code default). A retired or unknown id is refused. */
export const setIllustrationSettings = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    defaultStyleId: z.string().max(60).optional(),
    strategyStyleId: z.string().max(60).optional(),
    briefSystem: z.string().max(20000).nullable().optional(),
  }).parse(d))
  .handler(async ({ data }): Promise<IllustrationRegistry> => {
    await assertAdmin();
    const db = await admin();
    const reg = await getRegistry(db);
    for (const id of [data.defaultStyleId, data.strategyStyleId]) {
      if (id === undefined) continue;
      const s = reg.styles[id];
      if (!s) throw new Error(`Unknown style "${id}"`);
      if (s.retired) throw new Error(`"${s.label}" is retired — un-retire it first.`);
    }
    await writeSettings(db, (cur) => {
      const next: IllustrationSettings = { ...cur };
      if (data.defaultStyleId !== undefined) next.defaultStyleId = data.defaultStyleId;
      if (data.strategyStyleId !== undefined) next.strategyStyleId = data.strategyStyleId;
      if (data.briefSystem !== undefined) {
        if (data.briefSystem === null || !data.briefSystem.trim()) delete next.briefSystem; else next.briefSystem = data.briefSystem;
      }
      return next;
    });
    return getRegistry(db);
  });

/** SEED: write every code seed whose (id, version) isn't in the table yet. Idempotent — a
 *  second run writes nothing. Never touches a row that exists. */
export const seedIllustrationStyles = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ who: z.string().max(40).nullable().optional() }).parse(d ?? {}))
  .handler(async ({ data }): Promise<{ inserted: { id: string; version: number }[]; registry: IllustrationRegistry }> => {
    await assertAdmin();
    const db = await admin();
    const reg = await getRegistry(db);
    if (reg.source !== "db") throw new Error(`The illustration_styles table is missing — ${MISSING_STYLES_HINT}`);
    const inserted: { id: string; version: number }[] = [];
    for (const u of reg.unseeded ?? []) {
      const seed = STYLE_SEEDS[u.id];
      if (!seed || seed.version !== u.version) continue;
      const { error } = await db.from("illustration_styles").insert(styleToRow(seed, data.who ?? "seed"));
      if (error) throw new Error(`Could not seed ${u.id} v${u.version}: ${error.message}`);
      inserted.push(u);
    }
    return { inserted, registry: await getRegistry(db) };
  });
