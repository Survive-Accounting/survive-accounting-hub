// STITCH PREVIEW (F3) — watch the stitch before anything goes to Mux.
//
// WHAT THIS PREVIEWS, HONESTLY: the EDIT. Trims (slate offsets and detection),
// clip order, and the gaps between clips are exactly what will be rendered, and
// they are what a bad stitch is almost always made of. Loudness normalization
// and the micro-crossfades are NOT reproduced here — those happen in ffmpeg on
// the worker. The preview says so on its face rather than implying it is the
// final file.
//
// It plays by SEQUENCING the original clips in one <video> — seek to trimIn,
// play to trimOut, pause for the gap, next clip — so nothing renders, nothing
// uploads, and it starts instantly. Local originals are untouched; re-stitching
// with different settings is always possible because the stitch is a recipe.

import { liveItems, type StitchDef, type StitchItem } from "./stitch-defs";
import type { TakeRef } from "./types";

/** The default inter-clip gap when neither the item nor the stitch says. Matches
 *  the worker's dissect default so the preview and the render agree. */
export const DEFAULT_GAP_MS = 420;

export interface PreviewSegment {
  index: number;
  takePath: string;
  url: string;
  name: string;
  /** The untrimmed clip length, seconds. */
  rawS: number;
  /** Where playback starts / stops inside the original. */
  inS: number;
  outS: number;
  /** outS − inS. What actually lands in the cut. */
  trimmedS: number;
  /** Silence inserted AFTER this clip (0 on the last). */
  gapAfterMs: number;
  /** Where this segment starts on the stitched timeline. */
  startS: number;
  ceqId?: string;
  momentId?: string;
  /** Set when the item's trim came from an explicit override rather than the
   *  slate/detection default — the UI marks these so Lee can tell them apart. */
  manual: boolean;
  /** The clip carried a slate, so its head trim is deterministic. */
  slated: boolean;
}

export interface PreviewTimeline {
  segments: PreviewSegment[];
  /** Sum of trimmed clips. */
  contentS: number;
  /** Sum of inserted gaps. */
  gapS: number;
  /** contentS + gapS — the finished runtime. */
  totalS: number;
  /** Clips whose take could not be found; named, never silently skipped. */
  missing: string[];
  /** Trimmed off the head and tail across the whole cut. */
  trimmedAwayS: number;
}

/** Resolve one item's in/out. Precedence, highest first:
 *    1. an explicit manual trim on the item
 *    2. the SLATE offset (deterministic — the app knows when the countdown cleared)
 *    3. 0 / the clip's full length (detection refines the tail on the worker)
 *  Pure. */
export function resolveItemTrim(item: StitchItem, take: TakeRef): { inS: number; outS: number; manual: boolean; slated: boolean } {
  const rawS = take.duration ?? 0;
  const slated = take.slateEndMs != null;
  const slateIn = slated ? (take.slateEndMs as number) / 1000 : 0;
  const manual = item.trimInS != null || item.trimOutS != null;
  const inS = item.trimInS ?? (slateIn < rawS ? slateIn : 0);
  const outRaw = item.trimOutS ?? rawS;
  // A trim can never cross itself — a degenerate segment would silently vanish
  // from the cut, and a vanished clip is exactly the bug this preview exists to
  // catch. Clamp instead, and let the math show a near-zero segment.
  const outS = Math.max(inS, Math.min(outRaw, rawS || outRaw));
  return { inS, outS, manual, slated };
}

/** Build the whole timeline. `takes` maps storage path → the take, so a stitch
 *  can reference clips attached anywhere in the set. Pure. */
export function previewTimeline(stitch: StitchDef, takes: Map<string, TakeRef>): PreviewTimeline {
  const items = liveItems(stitch);
  const baseGap = stitch.audio?.gapMs ?? DEFAULT_GAP_MS;
  const segments: PreviewSegment[] = [];
  const missing: string[] = [];
  let cursor = 0;
  let contentS = 0;
  let gapS = 0;
  let trimmedAwayS = 0;

  items.forEach((item, i) => {
    const take = takes.get(item.takePath);
    if (!take) { missing.push(item.takePath); return; }
    const { inS, outS, manual, slated } = resolveItemTrim(item, take);
    const rawS = take.duration ?? 0;
    const trimmedS = outS - inS;
    const last = i === items.length - 1;
    const gapAfterMs = last ? 0 : (item.gapAfterMs ?? baseGap);
    segments.push({
      index: segments.length,
      takePath: item.takePath,
      url: take.url,
      name: take.name ?? item.takePath.split("/").pop() ?? "clip",
      rawS, inS, outS, trimmedS, gapAfterMs, startS: cursor, manual, slated,
      ...(item.ceqId ? { ceqId: item.ceqId } : {}),
      ...(item.momentId ? { momentId: item.momentId } : {}),
    });
    contentS += trimmedS;
    gapS += gapAfterMs / 1000;
    trimmedAwayS += Math.max(0, rawS - trimmedS);
    cursor += trimmedS + gapAfterMs / 1000;
  });

  return { segments, contentS, gapS, totalS: contentS + gapS, missing, trimmedAwayS };
}

/** Chapter marks for the publication's metadata — one per CEQ (or per dissect
 *  moment when the stitch is moment-tagged). Consecutive segments sharing an id
 *  collapse into one chapter, because a CEQ filmed in three takes is still one
 *  chapter to a viewer. */
export function previewChapters(tl: PreviewTimeline): { id: string; kind: "ceq" | "moment"; start: number; end: number }[] {
  const out: { id: string; kind: "ceq" | "moment"; start: number; end: number }[] = [];
  for (const s of tl.segments) {
    const id = s.momentId ?? s.ceqId;
    if (!id) continue;
    const kind: "ceq" | "moment" = s.momentId ? "moment" : "ceq";
    const prev = out[out.length - 1];
    if (prev && prev.id === id && prev.kind === kind) prev.end = s.startS + s.trimmedS;
    else out.push({ id, kind, start: s.startS, end: s.startS + s.trimmedS });
  }
  return out;
}

// ------------------------------------------------------------ manual overrides
//
// Every one of these returns a NEW items array. The caller routes it through
// `recut`, which bumps the stitch's rev and marks derived publications STALE —
// that is the whole staleness contract, and skipping it here would break it
// silently.

/** Nudge a clip's head or tail by ±seconds, clamped inside the original. */
export function nudgeTrim(items: StitchItem[], index: number, edge: "in" | "out", deltaS: number, take: TakeRef): StitchItem[] {
  const item = items[index];
  if (!item) return items;
  const cur = resolveItemTrim(item, take);
  const rawS = take.duration ?? 0;
  const next = [...items];
  if (edge === "in") {
    const inS = Math.max(0, Math.min(cur.inS + deltaS, cur.outS));
    next[index] = { ...item, trimInS: inS };
  } else {
    const outS = Math.max(cur.inS, Math.min(cur.outS + deltaS, rawS || cur.outS + deltaS));
    next[index] = { ...item, trimOutS: outS };
  }
  return next;
}

/** Set the gap AFTER a clip, in ms. Never negative. */
export function setGap(items: StitchItem[], index: number, ms: number): StitchItem[] {
  if (!items[index]) return items;
  const next = [...items];
  next[index] = { ...items[index], gapAfterMs: Math.max(0, Math.round(ms)) };
  return next;
}

/** Move a clip. Clamped at both ends — a no-op move must not reorder anything. */
export function moveItem(items: StitchItem[], index: number, dir: -1 | 1): StitchItem[] {
  const j = index + dir;
  if (index < 0 || index >= items.length || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

/** Drop a clip from the cut. MUTES it — the local original survives, the decision
 *  survives, and un-dropping is one click. Nothing is ever deleted here. */
export function toggleMuted(items: StitchItem[], index: number): StitchItem[] {
  if (!items[index]) return items;
  const next = [...items];
  next[index] = { ...items[index], muted: !items[index].muted };
  return next;
}

/** Clear a manual trim, handing the clip back to the slate/detection default. */
export function clearTrim(items: StitchItem[], index: number): StitchItem[] {
  if (!items[index]) return items;
  const next = [...items];
  const { trimInS: _in, trimOutS: _out, ...rest } = items[index];
  next[index] = rest;
  return next;
}

/** mm:ss.t — short enough for a dense table, precise enough to judge a trim. */
export function fmtT(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00.0";
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}`;
}

/** What this preview does NOT reproduce. Shown on the panel — a preview that
 *  quietly implies it is the final render is worse than no preview. */
export const PREVIEW_CAVEAT =
  "Previewing the EDIT: trims, order and gaps are exactly what renders. Loudness normalization, room tone and micro-crossfades are applied by the worker at render time and are not reproduced here.";
