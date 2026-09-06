import { describe, expect, test } from "bun:test";

import { estimatedLengthSeconds, fmtRange, slideCounts } from "./film-summary";
import type { BlastFrame } from "./plan";

function f(id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame {
  return { id, kind, ...extra };
}

describe("the film summary", () => {
  test("counts every kind Lee asked for, and skips skipped slides", () => {
    const frames: BlastFrame[] = [
      f("q1", "ceq"), f("q2", "ceq"), f("q3", "ceq", { skipped: true }),
      f("m1", "phrase"), f("c1", "cheat"), f("t1", "tip"),
      f("b1", "blank", { illustration: { requested: true, prompt: "x", teachingIntent: null, provider: null, stylePreset: null, styleVersion: null, assetUrl: "https://x/y.png", localAssetId: null, animationPreset: null, generatedAt: null, seed: null } }),
      f("open1", "open"),
    ];
    const counts = slideCounts(frames);
    expect(counts.total).toBe(7);            // 8 frames, minus the one skipped
    expect(counts.questions).toBe(2);
    expect(counts.memorizeThis).toBe(1);
    expect(counts.cheatCode).toBe(1);
    expect(counts.deeperIdea).toBe(1);
    expect(counts.illustrations).toBe(1);
  });
  test("an empty set counts to zero, not an error", () => {
    const counts = slideCounts([]);
    expect(counts).toEqual({ total: 0, questions: 0, memorizeThis: 0, cheatCode: 0, deeperIdea: 0, illustrations: 0 });
  });
  test("the estimate is a range that grows with slide count, formatted mm:ss", () => {
    const counts = slideCounts([f("q1", "ceq"), f("q2", "ceq")]);
    const range = estimatedLengthSeconds(counts);
    expect(range.lowSeconds).toBeLessThan(range.highSeconds);
    expect(range.lowSeconds).toBe(16);
    expect(range.highSeconds).toBe(36);
    expect(fmtRange(range)).toBe("0:16–0:36");
  });
});
