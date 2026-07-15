import { describe, expect, test } from "bun:test";

import { clampScale, FRAME_CARD_SCALE } from "./types";

describe("clampScale (FF-2 filming scale)", () => {
  test("clamps to the 25–100% band", () => {
    expect(clampScale(1.5)).toBe(1);
    expect(clampScale(0.1)).toBe(0.25);
    expect(clampScale(0.6)).toBe(0.6);
  });
  test("rounds to whole percent so nudges stay tidy", () => {
    expect(clampScale(0.6 + 0.05)).toBe(0.65);
    expect(clampScale(0.333)).toBe(0.33);
  });
  test("the in-frame default sits inside the band", () => {
    expect(clampScale(FRAME_CARD_SCALE)).toBe(FRAME_CARD_SCALE);
    expect(FRAME_CARD_SCALE).toBeGreaterThanOrEqual(0.25);
    expect(FRAME_CARD_SCALE).toBeLessThanOrEqual(1);
  });
});
