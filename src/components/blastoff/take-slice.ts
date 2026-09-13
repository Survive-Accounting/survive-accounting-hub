// ONE CONTINUOUS TAKE, MANY VIDEOS (G) — the pure half.
//
// Lee, 2026-09-13: "once we have a chain built, I can just do one continuous take and get a TON of
// videos posted in one day." The suggestion he brought in was a spoken token at each boundary. The
// film surface already knows better than a transcript could: it logs the moment each slide arrived,
// measured from the F4 that started OBS (take_logs). So the boundaries need no word at all — a split
// starts when its first slide arrives, and ends when the next split's does.
//
// Walking BACK into an earlier split (to check a slide, to restart after a scrap) never ends the
// current one: the timeline only moves forward to a later split. The F3 scraps inside each split
// come out too (frame-events.ts cutRanges).
//
// Pure: no React, no network.
import { clockOf, type CutRange } from "./frame-events";

export interface Arrival { frameId: string; take: number; atMs: number }
export interface SplitRange { take: number; start: number; end: number }

/** The log's arrivals, kept sane: in time order, non-negative, one entry per actual slide change. */
export function tidyArrivals(arrivals: readonly Arrival[]): Arrival[] {
  const out: Arrival[] = [];
  for (const a of [...arrivals].filter((x) => Number.isFinite(x.atMs) && x.atMs >= 0).sort((x, y) => x.atMs - y.atMs)) {
    const last = out[out.length - 1];
    if (last && last.frameId === a.frameId) continue;
    out.push(a);
  }
  return out;
}

/** WHERE EACH SPLIT IS IN THE FILE, in seconds. A split opens at the first arrival of a LATER split
 *  than the one running and closes at the next such arrival; the last runs to the end of the file. */
export function splitRanges(arrivals: readonly Arrival[], fileSeconds: number): SplitRange[] {
  const out: SplitRange[] = [];
  for (const a of tidyArrivals(arrivals)) {
    const cur = out[out.length - 1];
    if (cur && a.take <= cur.take) continue;
    const t = a.atMs / 1000;
    if (cur) cur.end = t;
    out.push({ take: a.take, start: t, end: fileSeconds });
  }
  return out.filter((r) => r.end > r.start && r.start < fileSeconds).map((r) => ({ ...r, end: Math.min(r.end, fileSeconds) }));
}

/** The scraps that fall inside a split (clipped to it). */
export const scrapsWithin = (range: SplitRange, cuts: readonly CutRange[]): CutRange[] =>
  cuts.filter((c) => c.end > range.start && c.start < range.end).map((c) => ({ start: Math.max(c.start, range.start), end: Math.min(c.end, range.end) }));

/** How long the split plays once its scraps are out. */
export const keptSeconds = (range: SplitRange, cuts: readonly CutRange[]): number =>
  Math.max(0, range.end - range.start - scrapsWithin(range, cuts).reduce((n, c) => n + (c.end - c.start), 0));

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "split";

/** The file a split is written to — `.cut` so Post knows its scraps are already out. */
export function partFileName(fileName: string, take: number, name: string): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "take";
  return `${stem}.part${take + 1}-${slug(name)}.cut.mp4`;
}

/** ONE LINE PER SPLIT: ffmpeg keeps the split's stretch of the file minus its scraps, re-timed to
 *  play straight through. Paste the block into a terminal in the folder with the recording. */
export function sliceCommands(fileName: string, ranges: readonly SplitRange[], cuts: readonly CutRange[], nameOf: (take: number) => string): string[] {
  return ranges.map((r) => {
    const inner = scrapsWithin(r, cuts).map((c) => `between(t,${c.start.toFixed(2)},${c.end.toFixed(2)})`);
    const expr = `between(t,${r.start.toFixed(2)},${r.end.toFixed(2)})${inner.length ? `*not(${inner.join("+")})` : ""}`;
    return `ffmpeg -y -i "${fileName}" -vf "select='${expr}',setpts=N/FRAME_RATE/TB" -af "aselect='${expr}',asetpts=N/SR/TB" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${partFileName(fileName, r.take, nameOf(r.take))}"`;
  });
}

/** "0:12.0 → 1:03.5" */
export const rangeText = (r: { start: number; end: number }): string => `${clockOf(r.start)} → ${clockOf(r.end)}`;
