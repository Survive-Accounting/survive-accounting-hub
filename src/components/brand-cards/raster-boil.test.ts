import { describe, expect, test } from "bun:test";

import { RASTER_BOIL_DEFAULTS, rasterBoilStates, rasterBoilTransform } from "./raster-boil";

describe("the raster boil", () => {
  test("state 0 is the untouched picture", () => {
    expect(rasterBoilStates()[0]).toEqual({ tx: 0, ty: 0, rot: 0 });
  });
  test("deterministic from the seed, different across seeds", () => {
    expect(rasterBoilStates({ seed: 3 })).toEqual(rasterBoilStates({ seed: 3 }));
    expect(rasterBoilStates({ seed: 3 })).not.toEqual(rasterBoilStates({ seed: 4 }));
  });
  test("a few pixels, a fraction of a degree — never a shake", () => {
    for (const s of rasterBoilStates({ states: 6, intensity: 1 })) {
      expect(Math.abs(s.tx)).toBeLessThanOrEqual(RASTER_BOIL_DEFAULTS.translationAmount);
      expect(Math.abs(s.ty)).toBeLessThanOrEqual(RASTER_BOIL_DEFAULTS.translationAmount);
      expect(Math.abs(s.rot)).toBeLessThanOrEqual(RASTER_BOIL_DEFAULTS.rotationAmount);
    }
    expect(rasterBoilStates({ intensity: 0 }).every((s) => s.tx === 0 && s.ty === 0 && s.rot === 0)).toBe(true);
  });
  test("drift snaps to whole device pixels", () => {
    for (const s of rasterBoilStates({ dpr: 2 })) {
      expect(Math.abs(s.tx * 2 - Math.round(s.tx * 2))).toBeLessThan(1e-9);
    }
    expect(rasterBoilTransform({ tx: 1, ty: -1, rot: 0.3 })).toBe("translate(1px, -1px) rotate(0.3deg)");
  });
});
