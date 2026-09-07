import { describe, expect, test } from "bun:test";

import {
  fmtClock, historyLabel, initialRounds, isCannedFrameKind, opensReview, prompterEditable, reduceRounds, roundLabel, roundMode, roundSegments, showsPrompterInRound,
  type RehearsalRounds, type RoundsAction,
} from "./rehearsal-rounds";

const run = (actions: RoundsAction[], from: RehearsalRounds = initialRounds()): RehearsalRounds => actions.reduce(reduceRounds, from);

describe("rehearsal rounds", () => {
  test("R arms round 1; space starts the clock; walking off the end finishes and records the time", () => {
    const armed = reduceRounds(initialRounds(), { type: "arm" });
    expect(armed.phase).toBe("armed");
    expect(armed.round).toBe(1);
    expect(armed.startedAt).toBeNull();
    const running = reduceRounds(armed, { type: "start", now: 10_000 });
    expect(running.phase).toBe("running");
    expect(running.startedAt).toBe(10_000);
    expect(running.slideStartedAt).toBe(10_000);
    const walked = reduceRounds(running, { type: "slide", now: 22_000 });
    expect(walked.slideStartedAt).toBe(22_000);
    expect(walked.startedAt).toBe(10_000);                                  // the round clock keeps going
    const done = reduceRounds(walked, { type: "finish", now: 144_400 });
    expect(done.phase).toBe("off");
    expect(done.history).toEqual([{ round: 1, seconds: 134 }]);
    expect(done.startedAt).toBeNull();
    // The next R is round 2.
    expect(reduceRounds(done, { type: "arm" }).round).toBe(2);
  });
  test("rounds 1 and 2 end in the review; 3+ are practice", () => {
    expect(opensReview(1)).toBe(true);
    expect(opensReview(2)).toBe(true);
    expect(opensReview(3)).toBe(false);
    expect(opensReview(0)).toBe(false);
  });
  test("R while merely armed cancels back to off without a round", () => {
    const s = run([{ type: "arm" }, { type: "cancel" }]);
    expect(s.phase).toBe("off");
    expect(s.round).toBe(0);
    expect(s.history).toEqual([]);
    // And after a finished round, cancelling an armed round 2 leaves round 1's history intact.
    const s2 = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "finish", now: 5000 }, { type: "arm" }, { type: "cancel" }]);
    expect(s2.round).toBe(1);
    expect(s2.history).toHaveLength(1);
  });
  test("what's said lands in the CURRENT round only, appended per frame", () => {
    const s = run([
      { type: "arm" }, { type: "start", now: 0 },
      { type: "addFinal", frameId: "a", text: " internal users " }, { type: "addFinal", frameId: "a", text: "are managers" }, { type: "addFinal", frameId: "b", text: "" },
    ]);
    expect(roundSegments(s)).toEqual({ a: "internal users are managers" });
    const r2 = run([{ type: "finish", now: 1000 }, { type: "arm" }, { type: "start", now: 2000 }, { type: "addFinal", frameId: "a", text: "second go" }], s);
    expect(r2.segmentsByRound[1]).toEqual({ a: "internal users are managers" });
    expect(r2.segmentsByRound[2]).toEqual({ a: "second go" });
    expect(roundSegments(r2)).toEqual({ a: "second go" });
  });
  test("nothing is transcribed while off or armed", () => {
    expect(reduceRounds(initialRounds(), { type: "addFinal", frameId: "a", text: "x" }).segmentsByRound).toEqual({});
    expect(reduceRounds(reduceRounds(initialRounds(), { type: "arm" }), { type: "addFinal", frameId: "a", text: "x" }).segmentsByRound).toEqual({});
  });
  test("scratch wipes one slide's take, this round only", () => {
    const s = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "addFinal", frameId: "a", text: "one" }, { type: "addFinal", frameId: "b", text: "two" }]);
    const scratched = reduceRounds(s, { type: "scratch", frameId: "a" });
    expect(roundSegments(scratched)).toEqual({ b: "two" });
    expect(reduceRounds(scratched, { type: "scratch", frameId: "zzz" })).toBe(scratched);   // nothing to wipe → same object
  });
  // Lee, 2026-09-07: "Start over doesn't quite work with rehearsal. Maybe it's supposed to be
  // paused first? Start over should give you another round 1." — from every phase it can be
  // pressed in, the result is the same: armed round 1, nothing remembered.
  describe("start over → armed round 1, from any phase", () => {
    const armedRound1: RehearsalRounds = { phase: "armed", round: 1, startedAt: null, slideStartedAt: null, segmentsByRound: {}, history: [] };
    test("off, before anything", () => {
      expect(reduceRounds(initialRounds(), { type: "startOver" })).toEqual(armedRound1);
    });
    test("armed (even armed on round 3)", () => {
      const s = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "finish", now: 1000 }, { type: "arm" }, { type: "start", now: 0 }, { type: "finish", now: 1000 }, { type: "arm" }]);
      expect(s.round).toBe(3);
      expect(reduceRounds(s, { type: "startOver" })).toEqual(armedRound1);
    });
    test("running — the transcript so far is gone, and it is no longer running", () => {
      const s = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "addFinal", frameId: "a", text: "one" }, { type: "addFinal", frameId: "b", text: "two" }]);
      const over = reduceRounds(s, { type: "startOver" });
      expect(over).toEqual(armedRound1);
      expect(roundSegments(over)).toEqual({});
    });
    test("after finished rounds (off, with history) — round 2's transcript and round 1's time both go", () => {
      const s = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "addFinal", frameId: "a", text: "one" }, { type: "finish", now: 134_000 }, { type: "arm" }, { type: "start", now: 200_000 }, { type: "addFinal", frameId: "a", text: "again" }, { type: "finish", now: 300_000 }]);
      expect(s.history).toHaveLength(2);
      const over = reduceRounds(s, { type: "startOver" });
      expect(over).toEqual(armedRound1);
      // And the next space really is round 1 again — blind, a fresh clock, and one round done
      // after it finishes (not three), so the prompter stays locked until a real round 2.
      const running = reduceRounds(over, { type: "start", now: 400_000 });
      expect(running.phase).toBe("running");
      expect(running.round).toBe(1);
      expect(running.startedAt).toBe(400_000);
      const done = reduceRounds(running, { type: "finish", now: 401_000 });
      expect(done.history).toEqual([{ round: 1, seconds: 1 }]);
      expect(prompterEditable(done)).toBe(false);
    });
  });
  test("transitions that don't apply are no-ops", () => {
    const off = initialRounds();
    for (const a of [{ type: "start", now: 1 }, { type: "slide", now: 1 }, { type: "finish", now: 1 }, { type: "cancel" }, { type: "scratch", frameId: "a" }] as RoundsAction[]) {
      expect(reduceRounds(off, a)).toBe(off);
    }
    const running = run([{ type: "arm" }, { type: "start", now: 0 }]);
    expect(reduceRounds(running, { type: "arm" })).toBe(running);
    expect(reduceRounds(running, { type: "cancel" })).toBe(running);
  });
  test("labels and the clock", () => {
    expect(roundLabel(1)).toBe("R1");
    expect(roundMode(1)).toBe("blind — no lines");
    expect(roundMode(2)).toBe("with your lines");
    expect(roundMode(3)).toBe("practice");
    expect(fmtClock(64_000)).toBe("1:04");
    expect(fmtClock(64_900)).toBe("1:04");                                  // floors — never reads ahead
    expect(fmtClock(0)).toBe("0:00");
    expect(fmtClock(-5)).toBe("0:00");
    expect(historyLabel([{ round: 1, seconds: 134 }, { round: 2, seconds: 108 }])).toBe("R1 2:14 · R2 1:48");
    expect(historyLabel([])).toBe("");
  });
  test("round 1 is blind except the canned frames; the prompter unlocks for editing after two rounds", () => {
    for (const k of ["open", "intro", "outro", "bio"] as const) { expect(isCannedFrameKind(k)).toBe(true); expect(showsPrompterInRound(1, k)).toBe(true); }
    for (const k of ["ceq", "phrase", "cheat", "tip", "exhibit", "blank", "bolt", "ad"] as const) { expect(isCannedFrameKind(k)).toBe(false); expect(showsPrompterInRound(1, k)).toBe(false); }
    expect(showsPrompterInRound(0, "ceq")).toBe(true);
    expect(showsPrompterInRound(2, "ceq")).toBe(true);
    const one = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "finish", now: 1000 }]);
    expect(prompterEditable(one)).toBe(false);
    const two = run([{ type: "arm" }, { type: "start", now: 0 }, { type: "finish", now: 1000 }], one);
    expect(prompterEditable(two)).toBe(true);
    expect(prompterEditable(reduceRounds(two, { type: "arm" }))).toBe(false);   // not while a round is armed or running
  });
});
