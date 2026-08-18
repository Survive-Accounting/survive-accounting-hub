// CUT SEQUENCER — the decision core of the sequential preview player.
//
// P0 BUG 2 (Lee, 08-18): the preview stopped after the 5th clip. There is no
// literal 5 anywhere — the player had two SILENT DEATH modes, and one bad clip
// killed everything after it:
//
//   · a source that errors never fires loadedmetadata, and there was no error
//     listener and no stall timeout — the chain hung forever, "playing" stuck
//     true, frozen on "clip 6/12";
//   · v.play() rejections were swallowed by .catch(() => setPlaying(false)) —
//     the run just stopped, wordlessly.
//
// So "stops at 5" = clips 1–5 fine, clip 6 bad, everything after unreachable.
// The count was data, not code — which is exactly why the machine must not
// wedge on it.
//
// This module is the sequencing DECISIONS, pure: given an event, what happens
// next. The component owns the <video> and executes the returned action. Pure
// means a 12-clip set (or 40) runs through the whole state machine in a unit
// test with zero media.
//
// POLICY: a clip that cannot load or play is SKIPPED WITH A NOTICE, never a
// wedge and never a silent stop. Lee is previewing an edit — losing one clip's
// audio is information ("clip 6 failed to load"); losing the remaining 30 is a
// broken tool.

export interface SeqSegment {
  /** Seconds to start at inside the source (the trim in). */
  inS: number;
  /** Seconds to stop at (the trim out). */
  outS: number;
  /** Silence to hold AFTER this clip, ms. */
  gapAfterMs: number;
  url: string;
  name: string;
}

export type SeqAction =
  | { kind: "load"; index: number; url: string; seekS: number }
  | { kind: "gap"; index: number; ms: number; nextIndex: number }
  | { kind: "done" };

export interface SeqState {
  /** Index currently playing / loading, or -1 when idle. */
  at: number;
  inGap: boolean;
  playing: boolean;
  /** Clips skipped this run, with reasons — SURFACED, never swallowed. */
  skipped: { index: number; name: string; reason: string }[];
}

export const seqIdle = (): SeqState => ({ at: -1, inGap: false, playing: false, skipped: [] });

/** How long a clip may sit in "loading" before it is declared dead. Generous —
 *  a cold CDN fetch of a 100MB take can be slow — but finite, because infinite
 *  was the bug. */
export const STALL_TIMEOUT_MS = 15_000;

/** Start (or restart) from an index. */
export function seqStart(segments: SeqSegment[], index: number): { state: SeqState; action: SeqAction } {
  const seg = segments[index];
  if (!seg) return { state: seqIdle(), action: { kind: "done" } };
  return {
    state: { at: index, inGap: false, playing: true, skipped: [] },
    action: { kind: "load", index, url: seg.url, seekS: seg.inS },
  };
}

/** The clip at `state.at` reached its out point (or ended). */
export function seqClipDone(segments: SeqSegment[], state: SeqState): { state: SeqState; action: SeqAction } {
  const seg = segments[state.at];
  const next = state.at + 1;
  if (!seg || next >= segments.length) return { state: { ...state, at: -1, playing: false, inGap: false }, action: { kind: "done" } };
  if (seg.gapAfterMs > 0) {
    return { state: { ...state, inGap: true }, action: { kind: "gap", index: state.at, ms: seg.gapAfterMs, nextIndex: next } };
  }
  return advanceTo(segments, state, next);
}

/** The gap timer fired. */
export function seqGapDone(segments: SeqSegment[], state: SeqState, nextIndex: number): { state: SeqState; action: SeqAction } {
  return advanceTo(segments, { ...state, inGap: false }, nextIndex);
}

/** The clip at `index` failed — media error, play() rejection, or stall.
 *  SKIP and continue; the failure is recorded on the state for the UI. */
export function seqClipFailed(segments: SeqSegment[], state: SeqState, index: number, reason: string): { state: SeqState; action: SeqAction } {
  const seg = segments[index];
  const skipped = [...state.skipped, { index, name: seg?.name ?? `clip ${index + 1}`, reason }];
  const next = index + 1;
  if (next >= segments.length) return { state: { ...state, skipped, at: -1, playing: false, inGap: false }, action: { kind: "done" } };
  // The failure is on the state (for the UI banner); the ACTION is the next
  // load — skipping IS advancing, there is no separate skip execution step.
  return advanceTo(segments, { ...state, skipped }, next);
}

function advanceTo(segments: SeqSegment[], state: SeqState, index: number): { state: SeqState; action: SeqAction } {
  const seg = segments[index];
  if (!seg) return { state: { ...state, at: -1, playing: false, inGap: false }, action: { kind: "done" } };
  return { state: { ...state, at: index, inGap: false, playing: true }, action: { kind: "load", index, url: seg.url, seekS: seg.inS } };
}

/** Has the playhead passed the out point? (The 30ms slack matches timeupdate's
 *  granularity — without it the guard can overshoot the clip end entirely.) */
export const seqPastOut = (seg: SeqSegment, currentTimeS: number): boolean => currentTimeS >= seg.outS - 0.03;
