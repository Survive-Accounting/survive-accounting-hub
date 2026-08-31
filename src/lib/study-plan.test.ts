// THE STUDY PLAN'S ARITHMETIC (2026-08-31).
//
// The number on the plan screen is the reason the guided path exists — it is what turns "start
// studying" into a decision a student can make the night before an exam. Two ways it can fail,
// and both are pinned here:
//
//   IT CAN BE WRONG. Sum the wrong sets, count a locked video, double-count a mode.
//   IT CAN BE CONFIDENT AND WRONG, which is worse. Every total carries `measured`, and a total
//   is only as honest as its least honest part.
import { describe, expect, test } from "bun:test";

import {
  SEC_PER_QUESTION,
  estimateMode,
  estimatePlan,
  formatDuration,
  planAdherence,
  type EstimableSet,
  type PlanCommitment,
} from "./study-plan";

const set = (o: Partial<EstimableSet> = {}): EstimableSet => ({
  runtimeSec: 300,
  ceqCount: 0,
  hasReview: false,
  reviewRuntimeSec: null,
  playbackId: "pb",
  ...o,
});

describe("cram counts the videos that exist", () => {
  test("sums published runtimes exactly, and says so", () => {
    const e = estimateMode("cram", [set({ runtimeSec: 312 }), set({ runtimeSec: 428 })]);
    expect(e.seconds).toBe(740);
    expect(e.measured).toBe(true);
  });

  test("a set with no published video contributes nothing", () => {
    // "Coming soon" rows carry a null playbackId. Counting them promises time against a video
    // the student cannot open.
    const e = estimateMode("cram", [set({ runtimeSec: 300 }), set({ playbackId: null, runtimeSec: 600 })]);
    expect(e.seconds).toBe(300);
    expect(e.measured).toBe(true);
  });

  test("a published set with an unknown runtime is FILLED FROM ITS SIBLINGS and flagged", () => {
    const e = estimateMode("cram", [set({ runtimeSec: 200 }), set({ runtimeSec: 400 }), set({ runtimeSec: null })]);
    expect(e.seconds).toBe(900); // 600 measured + 300 average
    expect(e.measured).toBe(false);
  });

  test("nothing measured at all still returns a usable number, still flagged", () => {
    const e = estimateMode("cram", [set({ runtimeSec: null })]);
    expect(e.seconds).toBe(300);
    expect(e.measured).toBe(false);
  });

  test("no videos is zero, not NaN", () => {
    expect(estimateMode("cram", []).seconds).toBe(0);
  });
});

describe("practice is never claimed as measured", () => {
  test("questions times the stated per-question guess", () => {
    const e = estimateMode("practice", [set({ ceqCount: 6 }), set({ ceqCount: 4 })]);
    expect(e.seconds).toBe(10 * SEC_PER_QUESTION);
  });

  test("even a full set of counted questions is an ESTIMATE — nothing has ever been timed", () => {
    expect(estimateMode("practice", [set({ ceqCount: 9 })]).measured).toBe(false);
  });
});

describe("review counts only the sets that have one", () => {
  test("skips sets with no review, however long their cram is", () => {
    const e = estimateMode("review", [
      set({ hasReview: true, reviewRuntimeSec: 940 }),
      set({ hasReview: false, runtimeSec: 9999 }),
    ]);
    expect(e.seconds).toBe(940);
    expect(e.measured).toBe(true);
  });
});

describe("the plan total", () => {
  const sets = [
    set({ runtimeSec: 300, ceqCount: 4, hasReview: true, reviewRuntimeSec: 600 }),
    set({ runtimeSec: 300, ceqCount: 4 }),
  ];

  test("modes ADD — they happen in sequence, they do not replace each other", () => {
    const cram = estimatePlan(["cram"], sets).seconds;
    const both = estimatePlan(["cram", "practice"], sets).seconds;
    const all = estimatePlan(["cram", "practice", "review"], sets).seconds;
    expect(cram).toBe(600);
    expect(both).toBe(600 + 8 * SEC_PER_QUESTION);
    expect(all).toBe(both + 600);
    // The claim the UI makes: each mode you add makes the number bigger.
    expect(both).toBeGreaterThan(cram);
    expect(all).toBeGreaterThan(both);
  });

  test("order of selection does not change the total", () => {
    expect(estimatePlan(["review", "cram"], sets).seconds).toBe(estimatePlan(["cram", "review"], sets).seconds);
  });

  test("a duplicated mode is not counted twice", () => {
    expect(estimatePlan(["cram", "cram"] as never, sets).seconds).toBe(600);
  });

  test("ONE guessed mode makes the WHOLE total an estimate", () => {
    expect(estimatePlan(["cram"], sets).measured).toBe(true);
    expect(estimatePlan(["cram", "practice"], sets).measured).toBe(false);
  });

  test("no modes selected is an honest zero", () => {
    expect(estimatePlan([], sets)).toEqual({ seconds: 0, measured: true });
  });
});

describe("the number a student reads", () => {
  test("minutes under an hour", () => {
    expect(formatDuration(740)).toBe("12 min");
  });
  test("hours and minutes above it", () => {
    expect(formatDuration(5640)).toBe("1 hr 34 min");
  });
  test("a whole hour drops the trailing zero", () => {
    expect(formatDuration(3600)).toBe("1 hr");
  });
  test("never renders a bare 0 min, which reads as broken", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(20)).toBe("Under a minute");
  });
});

describe("committed vs completed stay separate", () => {
  const commitment: PlanCommitment = {
    modes: ["cram", "practice"],
    grade: "a",
    estimatedSeconds: 5400,
    estimateMeasured: false,
    committedAt: 1_700_000_000_000,
    examNum: 1,
  };

  test("adherence is completions over what was promised, per mode", () => {
    const a = planAdherence(commitment, { done: { cram: ["s1", "s2"], practice: ["s1"] }, updatedAt: 1 }, 4);
    expect(a).toEqual({ completed: 3, expected: 8, fraction: 3 / 8 });
  });

  test("completions in a mode the student did NOT commit to are not credited", () => {
    const a = planAdherence(commitment, { done: { review: ["s1", "s2", "s3"] }, updatedAt: 1 }, 4);
    expect(a?.completed).toBe(0);
  });

  test("no commitment means no plan to be behind on", () => {
    expect(planAdherence(null, { done: { cram: ["s1"] }, updatedAt: 1 }, 4)).toBeNull();
  });

  test("an empty tree does not divide by zero", () => {
    expect(planAdherence(commitment, { done: {}, updatedAt: 1 }, 0)).toBeNull();
  });
});
