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

// ─────────────────────────────────────────────────────────── the pauses (2026-09-13) ──
//
// Lee: "if I take it slow and just do one slide at a time … it could just cut at each slide change,
// but also cut out all the pauses in between? And, in this sense, if I mark a run as speed run, it
// wouldn't cut with those switches?" The transcript already has every word's time (Post step 2), so a
// pause is simply the silence between two words. Past the level's limit it comes out, leaving a small
// breath either side. A pause while a SPEED-RUN slide is up stays: those are the quick switches he
// wants to keep as they are. Silence before the first word and after the last is trimmed too.

export type PauseLevel = "off" | "gentle" | "tight";
export const PAUSE_LEVELS: Record<PauseLevel, { label: string; maxGap: number; breath: number } | null> = {
  off: null,
  gentle: { label: "Gentle — pauses over 1.2 s", maxGap: 1.2, breath: 0.25 },
  tight: { label: "Tight — pauses over 0.6 s", maxGap: 0.6, breath: 0.15 },
};

export interface TimedWord { start: number; end: number }

/** The pauses to cut, in seconds of the file. `keep` = windows never cut (the speed-run slides). */
export function pauseCuts(words: readonly TimedWord[], fileSeconds: number, level: PauseLevel, keep: readonly CutRange[] = []): CutRange[] {
  const cfg = PAUSE_LEVELS[level];
  if (!cfg) return [];
  const ws = words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start).slice().sort((a, b) => a.start - b.start);
  if (!ws.length) return [];
  const gaps: CutRange[] = [];
  gaps.push({ start: 0, end: ws[0].start - cfg.breath });
  let lastEnd = ws[0].end;
  for (const w of ws.slice(1)) {
    if (w.start - lastEnd > cfg.maxGap) gaps.push({ start: lastEnd + cfg.breath, end: w.start - cfg.breath });
    lastEnd = Math.max(lastEnd, w.end);
  }
  gaps.push({ start: lastEnd + cfg.breath, end: fileSeconds });
  // Take the kept windows out of every gap.
  const out: CutRange[] = [];
  for (const g of gaps) {
    let pieces: CutRange[] = [g];
    for (const k of keep) {
      pieces = pieces.flatMap((p) => (k.end <= p.start || k.start >= p.end ? [p] : [{ start: p.start, end: k.start }, { start: k.end, end: p.end }]));
    }
    out.push(...pieces.filter((p) => p.end - p.start >= 0.05));
  }
  return mergeCuts(out.map((c) => ({ start: Math.max(0, c.start), end: Math.min(fileSeconds, c.end) })).filter((c) => c.end > c.start));
}

/** Cuts from several sources as one list: sorted, overlaps merged. */
export function mergeCuts(...lists: readonly (readonly CutRange[])[]): CutRange[] {
  const all = lists.flat().filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
  const out: CutRange[] = [];
  for (const c of all) {
    const last = out[out.length - 1];
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else out.push({ ...c });
  }
  return out;
}

/** Where the speed-run slides were on screen, from the take's timeline — the windows pauses stay in. */
export function speedWindows(arrivals: readonly Arrival[], fileSeconds: number, isSpeed: (frameId: string) => boolean): CutRange[] {
  const a = tidyArrivals(arrivals);
  const out: CutRange[] = [];
  a.forEach((x, i) => {
    if (!isSpeed(x.frameId)) return;
    out.push({ start: x.atMs / 1000, end: i + 1 < a.length ? a[i + 1].atMs / 1000 : fileSeconds });
  });
  return mergeCuts(out);
}

/** THE DOUBLE-CLICK EDIT (2026-09-13, Lee: "I'm also not sure I like the idea of working in the
 *  terminal"). A Windows .cmd that runs the same ffmpeg lines from the folder it is saved in — save it
 *  next to the recording and double-click. It says plainly when ffmpeg isn't installed yet. */
export function editScript(commands: readonly string[]): string {
  return [
    "@echo off",
    "cd /d \"%~dp0\"",
    "where ffmpeg >nul 2>nul",
    "if errorlevel 1 (",
    "  echo ffmpeg isn't installed yet. Open PowerShell once and run:  winget install --id Gyan.FFmpeg -e",
    "  echo Then close this window and double-click the script again.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo Making your edited video - this takes a minute or two...",
    ...commands,
    "echo.",
    "echo Done. The edited file is next to this script (.cut.mp4).",
    "pause",
  ].join("\r\n");
}

/** "0:12.0 → 1:03.5" */
export const rangeText = (r: { start: number; end: number }): string => `${clockOf(r.start)} → ${clockOf(r.end)}`;
