import { describe, expect, test } from "bun:test";

import { gateLines, gateOpen, passed, pctOf, scoreOf } from "./practice-score";

const answers = (right: number, wrong: number): Record<string, boolean> => {
  const a: Record<string, boolean> = {};
  for (let i = 0; i < right; i++) a[`r${i}`] = true;
  for (let i = 0; i < wrong; i++) a[`w${i}`] = false;
  return a;
};

describe("the recap gate", () => {
  test("a set's answers add up across rounds", () => {
    expect(scoreOf(answers(12, 3))).toEqual({ answered: 15, correct: 12, at: 0 });
    expect(pctOf(scoreOf(answers(16, 4)))).toBeCloseTo(0.8);
  });
  test("80% of every question opens it", () => {
    expect(passed(scoreOf(answers(16, 4)), 20)).toBe(true);
    expect(passed(scoreOf(answers(15, 5)), 20)).toBe(false); // 75%
    expect(passed(scoreOf(answers(19, 0)), 20)).toBe(false); // one unanswered
    expect(passed(null, 20)).toBe(false);
  });
  test("videos and practice both have to be done", () => {
    expect(gateOpen({ videosDone: 10, videosOf: 10, score: scoreOf(answers(18, 2)), total: 20 })).toBe(true);
    expect(gateOpen({ videosDone: 9, videosOf: 10, score: scoreOf(answers(18, 2)), total: 20 })).toBe(false);
    const lines = gateLines({ videosDone: 9, videosOf: 10, score: scoreOf(answers(14, 6)), total: 20 });
    expect(lines.videos).toBe("9 of 10 videos watched");
    expect(lines.practice).toBe("70% right — 80% needed");
    expect(gateLines({ videosDone: 10, videosOf: 10, score: scoreOf(answers(5, 0)), total: 20 }).practice).toBe("5 of 20 practice questions answered");
  });
});
