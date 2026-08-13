import { describe, expect, test } from "bun:test";

import { computeVisualMix, TEACHING_KINDS, type FrameSummary } from "./visual-mix";

const f = (over: Partial<FrameSummary>): FrameSummary => ({ id: "f", teachingObjects: 1, ...over });

describe("computeVisualMix", () => {
  test("empty lesson → zeros + still gives guidance", () => {
    const m = computeVisualMix([]);
    expect(m.totalFrames).toBe(0);
    expect(m.heroCount).toBe(0);
    expect(m.guidance.length).toBeGreaterThan(0);
  });

  test("counts types, heroes, motion, cram, no-object frames, phone warnings", () => {
    const m = computeVisualMix([
      f({ id: "1", visualType: "stage", heroVisual: true }),
      f({ id: "2", visualType: "card_focus", teachingObjects: 1 }),
      f({ id: "3", visualType: "cram", teachingObjects: 0, phoneWarnings: 2 }),
      f({ id: "4", visualType: "worked_model", motionHeavy: true }),
    ]);
    expect(m.totalFrames).toBe(4);
    expect(m.byType).toEqual({ stage: 1, card_focus: 1, cram: 1, worked_model: 1 });
    expect(m.heroCount).toBe(1);
    expect(m.motionCount).toBe(1);
    expect(m.cramCount).toBe(1);
    expect(m.noObjectFrameIds).toEqual(["3"]);
    expect(m.phoneWarnings).toBe(2);
  });

  test("hero-heavy lesson warns; untagged frames counted", () => {
    const frames = [
      f({ id: "1", visualType: "real_world", heroVisual: true }),
      f({ id: "2", visualType: "real_world", heroVisual: true }),
      f({ id: "3" }), // no visualType → untagged
    ];
    const m = computeVisualMix(frames);
    expect(m.heroPct).toBeGreaterThan(0.25);
    expect(m.byType.untagged).toBe(1);
    expect(m.guidance.some((g) => /aim under/i.test(g))).toBe(true);
  });

  test("guidance always names the atmosphere-not-a-hero rule + ceiling", () => {
    const m = computeVisualMix([f({ id: "1", visualType: "stage" })]);
    expect(m.guidance.some((g) => /atmosphere/i.test(g))).toBe(true);
    expect(m.guidance.some((g) => /ceiling/i.test(g))).toBe(true);
  });

  test("TEACHING_KINDS covers the manipulable card kinds", () => {
    expect(TEACHING_KINDS.has("je")).toBe(true);
    expect(TEACHING_KINDS.has("heading")).toBe(false);
  });
});
