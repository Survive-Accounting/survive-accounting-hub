// THE FRAME LEDGER — the pure half (the tables: migration 20260913_1000_frame_learning_loop.sql;
// the calls: lib/frame-events.functions.ts).
//
// Lee, 2026-09-13, on scrapping a line mid-take: "The point being, if we keep that take, is to
// auto-edit out that portion. And, is the assumption here that I will restart that slide from the
// top? … F3, should I just hit it every time I want to scrap a take?"
//
// So a SCRAP is an edit mark inside a continuous recording, not just a note. It carries three
// moments, all measured from the F4 that started the recording (OBS records on the same key):
//   attemptStartMs  when this attempt at the slide began — arriving on it, or the last restart
//   scrapMs         the first F3: "this isn't working"
//   resumeMs        the second F3: the reason is said, the slide resets, the retake starts
// Everything from attemptStart to resume comes out of a kept take; the retake that follows starts
// from the same visual state the bad attempt did, so the cut is invisible.
//
// Pure: no React, no network.
import { filmFrames, planTakes, type BlastFrame } from "./plan";

export const FRAME_EVENT_KINDS = ["baseline", "built", "edited", "skipped", "unskipped", "deleted", "restored", "filmed", "take_abandoned"] as const;
export type FrameEventKind = (typeof FRAME_EVENT_KINDS)[number];
export const FRAME_EVENT_SOURCES = ["manual", "shorten", "shorten-edited", "slide_text", "split_run", "backfill"] as const;
export type FrameEventSource = (typeof FRAME_EVENT_SOURCES)[number];

export interface FrameEventInput {
  frameId: string;
  setId: string;
  event: FrameEventKind;
  generatedFrameId?: string | null;
  before?: unknown;
  after?: unknown;
  source?: FrameEventSource | null;
  takeRef?: string | null;
  takeOffsetMs?: number | null;
  reason?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────── the take ──

/** Which recording a mark belongs to: the set, the split being filmed, and the moment F4 rolled.
 *  Post matches a take file to its roll by this, newest first. */
export const takeRefOf = (setId: string, takeIndex: number | null | undefined, rollAt: number): string =>
  `${setId}#${takeIndex ?? "all"}@${new Date(rollAt).toISOString()}`;

export function parseTakeRef(ref: string): { setId: string; takeIndex: number | null; rolledAt: string } | null {
  const m = /^(.+)#(all|\d+)@(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/.exec(ref);
  if (!m) return null;
  return { setId: m[1], takeIndex: m[2] === "all" ? null : Number(m[2]), rolledAt: m[3] };
}

/** A roll older than this is not the recording in progress — OBS was stopped long ago, and a cut
 *  measured from it would be hours into a file that isn't that long. The scrap is still kept, as a
 *  rehearsal scrap (the reason is the signal), just with nothing to cut. */
export const ROLL_MAX_AGE_MS = 90 * 60 * 1000;

/** When the recording in progress started, from the last F4 record (capture/prompter-sync.ts):
 *  this set's, not in the future, not stale. Null = nothing is recording. */
export function rollAtFor(rec: { setId: string; at: number } | null, setId: string, now: number): number | null {
  if (!rec || rec.setId !== setId) return null;
  if (rec.at > now + 2000 || now - rec.at > ROLL_MAX_AGE_MS) return null;
  return rec.at;
}

/** The reason as saved: what he said, else a line that says nothing was heard — the column
 *  requires one, and an honest placeholder beats an invented reason. Clamped to the column's cap. */
export function scrapReason(heard: string, interim: string, dictation: boolean): string {
  const said = `${heard} ${interim}`.replace(/\s+/g, " ").trim();
  if (said) return said.slice(0, 2000);
  return dictation ? "(no reason spoken)" : "(no reason captured — dictation isn't available in this browser; it's in the take's audio)";
}

export interface ScrapTimes { attemptStartMs: number; scrapMs: number; resumeMs: number }

/** The three moments of a scrap, from wall-clock times and the roll. Null when nothing was
 *  recording (a rehearsal scrap is still a learning signal, but there is nothing to cut). */
export function scrapTimes(rollAt: number | null, attemptStartedAt: number, scrapAt: number, resumeAt: number): ScrapTimes | null {
  if (rollAt === null) return null;
  const rel = (t: number) => Math.max(0, Math.round(t - rollAt));
  const attemptStartMs = rel(Math.max(attemptStartedAt, rollAt));
  const scrapMs = Math.max(attemptStartMs, rel(scrapAt));
  return { attemptStartMs, scrapMs, resumeMs: Math.max(scrapMs, rel(resumeAt)) };
}

export interface ScrapMark extends ScrapTimes { frameId: string; takeRef: string; reason: string; at: string }

/** A take_abandoned row read back as a mark — null for one with no times (a rehearsal scrap). */
export function scrapFromRow(row: { frame_id: string; take_ref: string | null; reason: string | null; after: unknown; created_at: string }): ScrapMark | null {
  const a = (row.after ?? {}) as Partial<ScrapTimes>;
  if (!row.take_ref || typeof a.attemptStartMs !== "number" || typeof a.resumeMs !== "number") return null;
  return { frameId: row.frame_id, takeRef: row.take_ref, reason: row.reason ?? "", at: row.created_at, attemptStartMs: a.attemptStartMs, scrapMs: typeof a.scrapMs === "number" ? a.scrapMs : a.attemptStartMs, resumeMs: a.resumeMs };
}

// ──────────────────────────────────────────────────────────────────────────────── the cut ──

export interface CutRange { start: number; end: number }

/** The stretches to remove from a kept take, in seconds: sorted, overlaps merged, empty ones
 *  dropped. Two scraps in a row on the same slide become one cut. */
export function cutRanges(marks: readonly ScrapTimes[]): CutRange[] {
  const raw = marks
    .map((m) => ({ start: m.attemptStartMs / 1000, end: m.resumeMs / 1000 }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const out: CutRange[] = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

/** How far a take file's start may sit from its F4 and still be that recording. OBS starts writing
 *  within a second of the key; the slack covers a clock that drifts and a file copied between
 *  machines (which is why a match is offered, never assumed — Post shows which roll it picked). */
export const ROLL_MATCH_SLACK_MS = 45_000;

/** WHICH RECORDING THIS FILE IS: the roll (take_ref) of this split whose F4 is nearest the file's
 *  start — the file's last-modified time minus its length, since OBS writes until it stops. Null
 *  when none is close enough. */
export function matchRoll(marks: readonly ScrapMark[], takeIndex: number | null, fileEndMs: number, fileSeconds: number): string | null {
  const start = fileEndMs - fileSeconds * 1000;
  let best: { ref: string; off: number } | null = null;
  for (const ref of new Set(marks.map((m) => m.takeRef))) {
    const p = parseTakeRef(ref);
    if (!p) continue;
    if (takeIndex !== null && p.takeIndex !== null && p.takeIndex !== takeIndex) continue;
    const off = Math.abs(Date.parse(p.rolledAt) - start);
    if (off <= ROLL_MATCH_SLACK_MS && (!best || off < best.off)) best = { ref, off };
  }
  return best?.ref ?? null;
}

/** m:ss.s — what a person reads off a player's scrubber. */
export function clockOf(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

/** THE ONE COMMAND that writes the take without the scrapped stretches — for ffmpeg on the
 *  laptop until the render worker can do it. Keeps every frame and sample NOT inside a cut and
 *  re-times what is left so it plays straight through. */
export function ffmpegCutCommand(fileName: string, ranges: readonly CutRange[]): string {
  const stem = fileName.replace(/\.[A-Za-z0-9]{1,5}$/, "") || "take";
  if (!ranges.length) return "";
  const expr = ranges.map((r) => `between(t,${r.start.toFixed(2)},${r.end.toFixed(2)})`).join("+");
  return `ffmpeg -y -i "${fileName}" -vf "select='not(${expr})',setpts=N/FRAME_RATE/TB" -af "aselect='not(${expr})',asetpts=N/SR/TB" -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${stem}.cut.mp4"`;
}

// ───────────────────────────────────────────────────────────────────────────── the Editor ──

/** Which frames a change skipped or brought back — diffed, so every path that skips (the menu,
 *  the row button, the Delete key on a card) logs the same way. */
export function skipFlips(prev: readonly BlastFrame[], next: readonly BlastFrame[]): { frameId: string; event: "skipped" | "unskipped" }[] {
  const was = new Map(prev.map((f) => [f.id, !!f.skipped]));
  const out: { frameId: string; event: "skipped" | "unskipped" }[] = [];
  for (const f of next) {
    const before = was.get(f.id);
    if (before === undefined || before === !!f.skipped) continue;
    out.push({ frameId: f.id, event: f.skipped ? "skipped" : "unskipped" });
  }
  return out;
}

/** Which frames a change REMOVED outright (not moved, not skipped) — with their last state, which
 *  is what makes the deletion recoverable. */
export function removedFrames(prev: readonly BlastFrame[], next: readonly BlastFrame[]): BlastFrame[] {
  const kept = new Set(next.map((f) => f.id));
  return prev.filter((f) => !kept.has(f.id));
}

/** FILMED (Lee's decision #1: "filmed" = a take containing the frame is POSTED). The posted split's
 *  frames, read the way Film and Post read a split — planTakes(filmFrames()) — so skipped slides
 *  aren't counted as filmed. `takeRef` is the post's publish key; re-posting the same split
 *  (a replacement video) is deduped against it by the caller. */
export function filmedEvents(setId: string, frames: readonly BlastFrame[], takeIndex: number, pubKey: string, already: ReadonlySet<string> = new Set()): FrameEventInput[] {
  const take = planTakes(filmFrames(frames))[takeIndex];
  if (!take) return [];
  return take.frames.filter((f) => !already.has(f.id)).map((f) => ({ frameId: f.id, setId, event: "filmed", after: f, takeRef: pubKey }));
}

/** THE SAVE-POINT DIFF (usePlan's flush): what one save did to the plan it replaced, as events —
 *  logged where the plan is actually written, so every path (menu, row button, Delete key, Ctrl+X,
 *  the split run's replace, undo) is covered once, and a delete undone before the save lands is
 *  no event at all. A frame coming back whose id was deleted earlier this session is `restored`;
 *  a brand-new frame is not an event here (built/baseline cover provenance). */
export function saveEvents(setId: string, saved: readonly BlastFrame[], next: readonly BlastFrame[], deletedBefore: ReadonlySet<string>): FrameEventInput[] {
  const had = new Set(saved.map((f) => f.id));
  const out: FrameEventInput[] = removedFrames(saved, next).map((f) => ({ frameId: f.id, setId, event: "deleted", before: f, source: "manual" }));
  for (const f of next) if (!had.has(f.id) && deletedBefore.has(f.id)) out.push({ frameId: f.id, setId, event: "restored", after: f, source: "manual" });
  for (const s of skipFlips(saved, next)) out.push({ ...s, setId, source: "manual" });
  return out;
}
