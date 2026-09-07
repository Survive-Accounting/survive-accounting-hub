// THE ILLUSTRATION REGISTRY — the pure parts, on their own so the server fns
// (illustration-registry.functions.ts), the editor page (/admin/illustrations/styles) and a
// test can share them without Supabase, Recraft or a session. No React, no network.
//
// WHY (2026-09-06, Lee's v6 workshop — docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, Part 2): "Build
// a style editor so the illustration style can be changed from the app and regenerated, without
// a code change each time." The style presets that were hardcoded in
// components/blastoff/illustration.ts become rows in public.illustration_styles (migration
// 20260907_0200), one row per (id, version); the code's entries stay as STYLE_SEEDS — the
// fallback when the table is missing, and the seed that fills it. This file is the overlay
// (seeds ← rows), the validation (what Recraft accepts), and the small helpers the editor needs.
import { z } from "zod";

import {
  ANIMATION_PRESETS, CODE_REGISTRY, DEFAULT_STYLE_ID, STRATEGY_STYLE_ID, STYLE_SEEDS,
  type AnimationPreset, type IllustrationRegistry, type IllustrationStyle,
} from "@/components/blastoff/illustration";

export const MISSING_STYLES_HINT = "run migration/supabase-migrations/20260907_0200_illustration_styles.sql";
/** The key under site_settings.settings — { defaultStyleId, strategyStyleId, briefSystem }. */
export const ILLUSTRATION_SETTINGS_KEY = "illustration";
/** The set id every test-panel preview is catalogued under in the library (cost is tracked;
 *  no frame is ever written). Never a real set id — real ones are uuids. */
export const PREVIEW_SET_ID = "_preview";
/** How many pictures "Generate 4" makes, and how many fixed seeds a comparison shares. */
export const PREVIEW_COUNT = 4;

// ---- VALIDATION: what Recraft accepts ---------------------------------------------------------
// Weights each 0–1 and summing to at most 1 — "Total color weight must be between 0 and 1" is
// Recraft's own rejection (dreamstate v2 shipped at 1.5 and every generation failed). Rejected
// HERE, before a save or a preview, exactly as Recraft would, so a bad palette never reaches a
// paid call. The editor's live sum line turns red at the same threshold.
const channel = z.number().int().min(0).max(255);
const rgbSchema = z.tuple([channel, channel, channel]);
export const styleControlsSchema = z.object({
  background_color: z.object({ rgb: rgbSchema }),
  colors: z.array(z.object({ rgb: rgbSchema, weight: z.number().min(0).max(1).optional() })).max(8),
}).refine((c) => weightSum(c.colors) <= 1 + 1e-9, { message: "Total color weight must be between 0 and 1 — Recraft rejects the call above 1.", path: ["colors"] });

/** A style as the editor submits it — every field of IllustrationStyle, checked. `version` is
 *  what the form shows; the server decides the version actually written (bump or not). */
export const styleDraftSchema = z.object({
  id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/, "id: lowercase letters, digits and dashes, 3–60 chars"),
  version: z.number().int().min(1).max(9999),
  label: z.string().trim().min(1).max(80),
  provider: z.literal("recraft"),
  model: z.string().trim().min(1).max(60),
  size: z.string().trim().regex(/^\d{3,4}x\d{3,4}$/, "size: WxH, e.g. 1024x1024"),
  promptPrefix: z.string().max(300),
  promptSuffix: z.string().max(4000),
  controls: styleControlsSchema,
  styleIdEnv: z.string().trim().regex(/^[A-Z][A-Z0-9_]{1,79}$/, "styleIdEnv: an env var name, e.g. RECRAFT_STYLE_ID_RISO"),
  defaultAnimation: z.enum(ANIMATION_PRESETS),
  retired: z.boolean().optional(),
  note: z.string().max(2000).nullable().optional(),
});
export type StyleDraft = z.infer<typeof styleDraftSchema>;

/** Every weight added up; an absent weight counts as 0 (Recraft's default). */
export function weightSum(colors: readonly { weight?: number }[]): number {
  return colors.reduce((s, c) => s + (c.weight ?? 0), 0);
}

// ---- THE DB ROW ↔ THE STYLE ------------------------------------------------------------------
export interface IllustrationStyleRow {
  id: string; version: number; label: string; provider: string; model: string; size: string;
  prompt_prefix: string; prompt_suffix: string; controls: unknown; style_id_env: string; default_animation: string;
  retired: boolean; note: string | null; created_by: string | null; created_at: string; updated_at: string;
}

/** A row read back, defended: a row whose controls don't parse (someone edited the jsonb by
 *  hand) is dropped with a warning rather than crashing every page that reads the registry. */
export function rowToStyle(r: IllustrationStyleRow): IllustrationStyle | null {
  const controls = styleControlsSchema.safeParse(r.controls);
  if (!controls.success || r.provider !== "recraft" || !(ANIMATION_PRESETS as readonly string[]).includes(r.default_animation)) return null;
  return {
    id: r.id, version: r.version, label: r.label, provider: "recraft", model: r.model, size: r.size,
    promptPrefix: r.prompt_prefix, promptSuffix: r.prompt_suffix, controls: controls.data, styleIdEnv: r.style_id_env,
    defaultAnimation: r.default_animation as AnimationPreset, retired: !!r.retired, note: r.note ?? null,
  };
}

export function styleToRow(s: IllustrationStyle, who: string | null): Omit<IllustrationStyleRow, "created_at" | "updated_at"> {
  return {
    id: s.id, version: s.version, label: s.label, provider: s.provider, model: s.model, size: s.size,
    prompt_prefix: s.promptPrefix, prompt_suffix: s.promptSuffix, controls: s.controls, style_id_env: s.styleIdEnv,
    default_animation: s.defaultAnimation, retired: !!s.retired, note: s.note ?? null, created_by: who,
  };
}

// ---- THE SETTINGS beside the rows --------------------------------------------------------------
export interface IllustrationSettings { defaultStyleId?: string; strategyStyleId?: string; briefSystem?: string | null }

/** The `illustration` slice of site_settings.settings, typed and nothing else. */
export function settingsOf(settings: Record<string, unknown> | null | undefined): IllustrationSettings {
  const raw = settings?.[ILLUSTRATION_SETTINGS_KEY];
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  return {
    ...(typeof o.defaultStyleId === "string" ? { defaultStyleId: o.defaultStyleId } : {}),
    ...(typeof o.strategyStyleId === "string" ? { strategyStyleId: o.strategyStyleId } : {}),
    ...(typeof o.briefSystem === "string" ? { briefSystem: o.briefSystem } : {}),
  };
}

// ---- THE OVERLAY: seeds ← rows ------------------------------------------------------------------
/** The registry from what the table holds plus the code seeds. Per id the HIGHEST version wins,
 *  a DB row winning a tie (Lee may have saved it without bumping); a seed newer than the
 *  table's latest wins until it is seeded. `history` is every version from either source, id
 *  then version descending. `tableRead` false = the table couldn't be read → source "code"
 *  (the settings still apply — they live in site_settings, which always exists). */
export function buildRegistry(rows: readonly IllustrationStyle[], settings: IllustrationSettings, tableRead: boolean): IllustrationRegistry {
  const key = (s: { id: string; version: number }) => `${s.id}@${s.version}`;
  const inDb = new Set(rows.map(key));
  const seeds = Object.values(STYLE_SEEDS);
  const unseeded = seeds.filter((s) => !inDb.has(key(s))).map((s) => ({ id: s.id, version: s.version }));
  const history = [...rows, ...seeds.filter((s) => !inDb.has(key(s)))]
    .sort((a, b) => a.id.localeCompare(b.id) || b.version - a.version);
  const styles: Record<string, IllustrationStyle> = {};
  for (const s of history) {
    const cur = styles[s.id];
    // rows come before seeds in `history`, so on an equal version the DB row is already there
    if (!cur || s.version > cur.version) styles[s.id] = s;
  }
  const pick = (want: string | undefined, fallback: string): string =>
    want && styles[want] ? want : styles[fallback] ? fallback : Object.keys(styles)[0] ?? fallback;
  const brief = settings.briefSystem?.trim();
  return {
    styles, history,
    defaultStyleId: pick(settings.defaultStyleId, DEFAULT_STYLE_ID),
    strategyStyleId: pick(settings.strategyStyleId, STRATEGY_STYLE_ID),
    briefSystem: brief ? settings.briefSystem! : null,
    source: tableRead ? "db" : "code",
    unseeded,
  };
}

/** What "Save as new version" will write for this id: one past the highest ever saved (the
 *  history, not only the latest — a retired v3 must not be reissued as a new v3). 1 for a new id. */
export function nextVersion(registry: IllustrationRegistry, id: string): number {
  const versions = registry.history.filter((s) => s.id === id).map((s) => s.version);
  return versions.length ? Math.max(...versions) + 1 : 1;
}

/** The pictures a bump would make stale: everything on a live frame in this preset, whatever
 *  its stamp (every stamp is ≤ the current version, so every one drops below the next). A
 *  frame with no version recorded never reads stale (isStaleIllustration) and isn't counted. */
export function stalePictureCount(rows: readonly { stylePreset: string | null; styleVersion: number | null }[], id: string): number {
  return rows.filter((r) => r.stylePreset === id && r.styleVersion !== null).length;
}

/** A fresh copy of a style for the editor: id-less-ish (a suggested one), version 1, not
 *  retired, no note — controls deep-copied so editing the copy never touches the original. */
export function copyStyle(from: IllustrationStyle, registry: IllustrationRegistry): IllustrationStyle {
  let id = `${from.id}-2`;
  for (let n = 2; registry.styles[id]; n++) id = `${from.id}-${n}`;
  return { ...cloneStyle(from), id, version: 1, label: `${from.label} (copy)`, retired: false, note: null };
}

export function cloneStyle(s: IllustrationStyle): IllustrationStyle {
  return { ...s, controls: { background_color: { rgb: [...s.controls.background_color.rgb] as [number, number, number] }, colors: s.controls.colors.map((c) => ({ rgb: [...c.rgb] as [number, number, number], ...(c.weight === undefined ? {} : { weight: c.weight }) })) } };
}

/** Field-for-field: has the draft moved away from what the registry holds for its id? */
export function sameStyle(a: IllustrationStyle | null | undefined, b: IllustrationStyle | null | undefined): boolean {
  if (!a || !b) return a === b;
  const pick = (s: IllustrationStyle) => JSON.stringify([s.id, s.label, s.provider, s.model, s.size, s.promptPrefix, s.promptSuffix, s.controls, s.styleIdEnv, s.defaultAnimation, !!s.retired]);
  return pick(a) === pick(b);
}

// ---- COLOURS: hex on the client, rgb everywhere else -------------------------------------------
export function rgbToHex([r, g, b]: readonly [number, number, number]): string {
  return "#" + [r, g, b].map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("").toUpperCase();
}
/** "#FCA311" / "FCA311" / "#fca311" → [252,163,17]; anything else → null (the field stays as typed). */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ---- THE TEST PANEL ----------------------------------------------------------------------------
/** The library frame id a preview is catalogued under: a slug of the subject, so a row can be
 *  read back as what it drew. */
export function previewFrameId(subject: string): string {
  const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48).replace(/-$/, "");
  return slug || "subject";
}

/** N fixed seeds for a comparison — one per column, the same across every style tried, so the
 *  only thing that differs between rows is the style. `rand` is injectable for tests. */
export function fixedSeeds(n: number = PREVIEW_COUNT, rand: () => number = Math.random): number[] {
  return Array.from({ length: n }, () => Math.floor(rand() * 4294967295));
}

/** The registry the client starts from until the server's arrives. */
export const FALLBACK_REGISTRY = CODE_REGISTRY;
