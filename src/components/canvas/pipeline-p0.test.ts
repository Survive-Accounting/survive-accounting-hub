// P0 — the two bugs from Lee's real filming session (08-18), pinned so they
// cannot come back. Each suite opens by REPRODUCING the failure mechanism,
// then proves the fix.
import { describe, expect, test } from "bun:test";

import {
  FILE_MATCH_GRACE_MS, __resetCoverage, beginCoverage, coverageForFile, coverageLabel,
  coverageOpen, endCoverage, logCoverageFrame,
} from "./coverage-log";
import {
  STALL_TIMEOUT_MS, seqClipDone, seqClipFailed, seqGapDone, seqIdle, seqPastOut, seqStart,
  type SeqSegment,
} from "./cut-sequencer";

// ---------------------------------------------------------------- BUG 1

describe("BUG 1 — coverage is a per-take visited log, not an accumulator", () => {
  const takeWindow = (frames: string[]) => {
    beginCoverage(frames[0]);
    for (const f of frames.slice(1)) logCoverageFrame(f);
    return endCoverage()!;
  };

  test("THE BUG, reproduced then killed: take N never inherits take N−1's frames", () => {
    __resetCoverage();
    // Take 1: Lee rips the whole set for the tease shot — 11 frames, legitimately.
    const rip = takeWindow(["n1", "q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "n2", "out"]);
    expect(rip.frameIds).toHaveLength(11);
    // Take 2: he films ONE frame. The old code captured live frames BEFORE the
    // reset, so this take's coverage came out as 11 ∪ {q2} = 11.
    const q2 = takeWindow(["q2"]);
    expect(q2.frameIds).toEqual(["q2"]);          // ← the fix
  });

  test("navigation BETWEEN takes never accumulates — no open window, no append", () => {
    __resetCoverage();
    logCoverageFrame("q1");
    logCoverageFrame("q2");
    expect(coverageOpen()).toBe(false);
    const w = takeWindow(["q5"]);
    expect(w.frameIds).toEqual(["q5"]);           // the wandering left no residue
  });

  test("a run blast records every frame walked, once each, in visit order", () => {
    __resetCoverage();
    beginCoverage("q3");
    logCoverageFrame("q4");
    logCoverageFrame("q4");                        // repeat visits don't duplicate
    logCoverageFrame("q5");
    expect(endCoverage()!.frameIds).toEqual(["q3", "q4", "q5"]);
  });

  test("SCAN-PATH FIX: a file that finalized late still finds its take's window", () => {
    // This was the hole that let the armed target hijack attach: a slow-to-
    // finalize file missed the 3 quick retries and banked later via Scan with
    // NO coverage at all.
    __resetCoverage();
    const w = takeWindow(["q6"]);
    const stop = Date.parse(w.stoppedAt);
    expect(coverageForFile(stop + 5_000)?.frameIds).toEqual(["q6"]);
    expect(coverageForFile(stop + FILE_MATCH_GRACE_MS + 1)).toBeNull();  // but not forever
    expect(coverageForFile(Date.parse(w.startedAt) - 60_000)).toBeNull(); // and not before
  });

  test("back-to-back takes: the newest matching window wins", () => {
    __resetCoverage();
    const w1 = takeWindow(["q1"]);
    const w2 = takeWindow(["q2"]);
    // A file finalizing after take 2 falls in take 2's window even though
    // take 1's grace period still covers the timestamp.
    const m = coverageForFile(Date.parse(w2.stoppedAt) + 1_000);
    expect(m?.frameIds).toEqual(["q2"]);
    expect(w1.frameIds).toEqual(["q1"]);
  });

  test("the badge label is COVERAGE in spine order — Q3 or Q3–Q6, never a count", () => {
    const spine = ["n1", "q1", "q2", "q3", "q4", "q5", "q6"];
    const label = (id: string) => (id.startsWith("q") ? id.toUpperCase() : undefined);
    expect(coverageLabel(["q3"], spine, label)).toBe("Q3");
    expect(coverageLabel(["q6", "q3", "q4"], spine, label)).toBe("Q3–Q6");   // visit order ≠ display order
    expect(coverageLabel([], spine, label)).toBeNull();
    expect(coverageLabel(["deleted-frame"], spine, label)).toBeNull();       // ghosts dropped
  });
});

// ---------------------------------------------------------------- BUG 2

describe("BUG 2 — the sequencer survives a full set, and bad clips cannot wedge it", () => {
  const seg = (i: number, over: Partial<SeqSegment> = {}): SeqSegment =>
    ({ inS: 1, outS: 10, gapAfterMs: 420, url: `https://x/c${i + 1}.mp4`, name: `c${i + 1}`, ...over });
  const set12 = Array.from({ length: 12 }, (_, i) => seg(i, i === 11 ? { gapAfterMs: 0 } : {}));

  test("REGRESSION (mandated): a 12-clip set plays end to end through the state machine", () => {
    let { state, action } = seqStart(set12, 0);
    const loaded: number[] = [];
    let guard = 0;
    while (action.kind !== "done" && guard++ < 100) {
      if (action.kind === "load") {
        loaded.push(action.index);
        ({ state, action } = seqClipDone(set12, state));        // clip plays out
      } else {
        ({ state, action } = seqGapDone(set12, state, action.nextIndex));
      }
    }
    expect(loaded).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);   // ALL 12 — not 5
    expect(state.playing).toBe(false);
    expect(state.skipped).toEqual([]);
  });

  test("THE BUG, reproduced then killed: clip 6 failing skips it and plays 7–12", () => {
    let { state, action } = seqStart(set12, 0);
    const played: number[] = [];
    let guard = 0;
    while (action.kind !== "done" && guard++ < 100) {
      if (action.kind === "load") {
        if (action.index === 5) {                                // clip 6 is broken
          ({ state, action } = seqClipFailed(set12, state, 5, "media error"));
        } else {
          played.push(action.index);
          ({ state, action } = seqClipDone(set12, state));
        }
      } else {
        ({ state, action } = seqGapDone(set12, state, action.nextIndex));
      }
    }
    expect(played).toEqual([0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);      // everything except the bad one
    expect(state.skipped).toEqual([{ index: 5, name: "c6", reason: "media error" }]);  // SURFACED
  });

  test("a failure on the LAST clip ends the run cleanly with the skip recorded", () => {
    const { state, action } = seqClipFailed(set12, { at: 11, inGap: false, playing: true, skipped: [] }, 11, "stalled");
    expect(action.kind).toBe("done");
    expect(state.playing).toBe(false);
    expect(state.skipped[0].reason).toBe("stalled");
  });

  test("gaps are honoured between clips and skipped where gapAfterMs is 0", () => {
    const two: SeqSegment[] = [seg(0), seg(1, { gapAfterMs: 0 }), seg(2)];
    let r = seqStart(two, 0);
    r = seqClipDone(two, r.state);
    expect(r.action.kind).toBe("gap");                            // 0 → 1 has a gap
    r = seqGapDone(two, r.state, (r.action as { nextIndex: number }).nextIndex);
    r = seqClipDone(two, r.state);
    expect(r.action).toEqual({ kind: "load", index: 2, url: "https://x/c3.mp4", seekS: 1 });  // 1 → 2 direct
  });

  test("every load seeks to the clip's TRIM IN, so slate trims apply in preview", () => {
    const { action } = seqStart([seg(0, { inS: 3.2 })], 0);
    expect(action).toEqual({ kind: "load", index: 0, url: "https://x/c1.mp4", seekS: 3.2 });
  });

  test("the stall timeout is finite — infinite was the bug", () => {
    expect(STALL_TIMEOUT_MS).toBeGreaterThan(0);
    expect(STALL_TIMEOUT_MS).toBeLessThan(60_000);
  });

  test("seqPastOut fires at the out point within timeupdate granularity", () => {
    const s = seg(0, { outS: 10 });
    expect(seqPastOut(s, 9.9)).toBe(false);
    expect(seqPastOut(s, 9.98)).toBe(true);
  });

  test("an empty playlist is done immediately, not an exception", () => {
    expect(seqStart([], 0).action.kind).toBe("done");
    expect(seqClipDone([], seqIdle()).action.kind).toBe("done");
  });
});
