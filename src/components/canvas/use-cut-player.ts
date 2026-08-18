// USE-CUT-PLAYER — the DOM executor for the cut sequencer, as a hook.
//
// The DECISIONS live in cut-sequencer.ts (pure, regression-tested at 12 clips);
// this hook owns the one <video> element and the timers, and executes whatever
// the sequencer says. Extracted for the Pipeline view's inline player so the
// P0-fixed machinery is shared rather than re-implemented.
//
// StitchPreview carries its own copy of this executor (written first, during
// P0); the two run the SAME sequencer, so behaviour cannot drift even though
// the executor is duplicated. Converging StitchPreview onto this hook is a
// mechanical follow-up, deliberately not done mid-series.

import { useEffect, useRef, useState } from "react";

import {
  STALL_TIMEOUT_MS, seqClipDone, seqClipFailed, seqGapDone, seqIdle, seqPastOut, seqStart,
  type SeqAction, type SeqSegment, type SeqState,
} from "./cut-sequencer";

export interface CutPlayer {
  videoProps: {
    ref: (el: HTMLVideoElement | null) => void;
    onTimeUpdate: () => void;
    onEnded: () => void;
  };
  state: SeqState;
  playFrom: (i: number) => void;
  stop: () => void;
}

export function useCutPlayer(segments: SeqSegment[], resetKey?: unknown): CutPlayer {
  const vidRef = useRef<HTMLVideoElement | null>(null);
  const [seq, setSeq] = useState<SeqState>(seqIdle());
  const seqRef = useRef(seq);
  useEffect(() => { seqRef.current = seq; }, [seq]);
  const gapTimer = useRef<number | undefined>(undefined);
  const stallTimer = useRef<number | undefined>(undefined);
  // GENERATION GUARD: a clip's loadedmetadata can arrive AFTER stop() — pausing
  // doesn't abort an in-flight load. Every stop bumps this; a pending begin()/
  // fail() captured the old value and bails, so a load that resolves post-stop
  // can never seek+play (which, while Recording Mode hides the player, would
  // bleed a raw untrimmed take's audio into the live OBS take).
  const genRef = useRef(0);
  const segsRef = useRef<SeqSegment[]>(segments);
  segsRef.current = segments;

  const clearTimers = () => {
    if (gapTimer.current != null) window.clearTimeout(gapTimer.current);
    if (stallTimer.current != null) window.clearTimeout(stallTimer.current);
    gapTimer.current = stallTimer.current = undefined;
  };
  const stop = () => { genRef.current += 1; clearTimers(); vidRef.current?.pause(); setSeq(seqIdle()); };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps
  // The cut changed under the player (edit, re-order, new clip) — stop rather
  // than play something that moved.
  useEffect(() => { stop(); }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (r: { state: SeqState; action: SeqAction }) => {
    setSeq(r.state);
    const a = r.action;
    if (a.kind === "done") { clearTimers(); vidRef.current?.pause(); return; }
    if (a.kind === "gap") {
      vidRef.current?.pause();
      gapTimer.current = window.setTimeout(() => run(seqGapDone(segsRef.current, seqRef.current, a.nextIndex)), a.ms);
      return;
    }
    const v = vidRef.current;
    if (!v) return;
    if (stallTimer.current != null) window.clearTimeout(stallTimer.current);
    stallTimer.current = window.setTimeout(() => run(seqClipFailed(segsRef.current, seqRef.current, a.index, "stalled loading")), STALL_TIMEOUT_MS);
    const myGen = genRef.current;
    const begin = () => {
      if (genRef.current !== myGen) return; // stopped or superseded while loading
      if (stallTimer.current != null) { window.clearTimeout(stallTimer.current); stallTimer.current = undefined; }
      v.currentTime = a.seekS;
      void v.play().catch((err) => { if (genRef.current === myGen) run(seqClipFailed(segsRef.current, seqRef.current, a.index, err instanceof Error ? err.message : "play() refused")); });
    };
    const fail = () => { if (genRef.current === myGen) run(seqClipFailed(segsRef.current, seqRef.current, a.index, "media error")); };
    if (v.src !== a.url) {
      v.src = a.url;
      v.addEventListener("loadedmetadata", begin, { once: true });
      v.addEventListener("error", fail, { once: true });
      v.load();
    } else begin();
  };

  const onTimeUpdate = () => {
    const st = seqRef.current;
    const seg = segsRef.current[st.at];
    const v = vidRef.current;
    if (!seg || !v || !st.playing || st.inGap) return;
    if (!seqPastOut(seg, v.currentTime)) return;
    v.pause();
    run(seqClipDone(segsRef.current, st));
  };
  // THE WEDGE FIX (P0 bug 2): stored durations are rounded, so a clip's real
  // media can end before its recipe out point — `ended` must advance, not freeze.
  const onEnded = () => {
    const st = seqRef.current;
    if (st.at >= 0 && st.playing && !st.inGap) run(seqClipDone(segsRef.current, st));
  };

  return {
    videoProps: { ref: (el) => { vidRef.current = el; }, onTimeUpdate, onEnded },
    state: seq,
    playFrom: (i: number) => run(seqStart(segsRef.current, i)),
    stop,
  };
}
