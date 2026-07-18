import { describe, expect, test } from "bun:test";

import {
  clampWorldIntensity,
  clampWorldMotion,
  DEFAULT_WORLD,
  hashSeed,
  inLandingZone,
  mulberry32,
  seededStars,
  WORLD_IDS,
  WORLDS,
  worldById,
} from "./worlds";

describe("world presets", () => {
  test("there are exactly 8, uniquely ided", () => {
    expect(WORLDS.length).toBe(8);
    expect(new Set(WORLD_IDS).size).toBe(8);
  });

  test("every preset obeys the muted design band", () => {
    for (const w of WORLDS) {
      expect(w.defaultIntensity).toBeGreaterThanOrEqual(0.25);
      expect(w.defaultIntensity).toBeLessThanOrEqual(0.35);
      expect(w.motionIntensity).toBeGreaterThanOrEqual(0);
      expect(w.motionIntensity).toBeLessThanOrEqual(1);
      // focal point never dead-center (cards own the middle)
      const centered = Math.abs(w.focalPoint.x - 0.5) < 0.08 && Math.abs(w.focalPoint.y - 0.5) < 0.08;
      // Quiet Void is allowed a central focal (it's near-empty)
      if (w.id !== "quiet-void") expect(centered).toBe(false);
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.palette.base.startsWith("#")).toBe(true);
    }
  });

  test("worldById + DEFAULT_WORLD resolve", () => {
    expect(worldById(DEFAULT_WORLD)?.id).toBe(DEFAULT_WORLD);
    expect(worldById("nope")).toBeUndefined();
    expect(worldById(undefined)).toBeUndefined();
  });
});

describe("intensity/motion clamps", () => {
  test("intensity clamps to 0..0.6, motion to 0..1", () => {
    expect(clampWorldIntensity(2)).toBe(0.6);
    expect(clampWorldIntensity(-1)).toBe(0);
    expect(clampWorldIntensity(undefined, 0.3)).toBe(0.3);
    expect(clampWorldIntensity(NaN, 0.28)).toBe(0.28);
    expect(clampWorldMotion(5)).toBe(1);
    expect(clampWorldMotion(-3)).toBe(0);
  });
});

describe("deterministic seeding", () => {
  test("mulberry32 is stable + in [0,1)", () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const va = [a(), a(), a()];
    const vb = [b(), b(), b()];
    expect(va).toEqual(vb);
    for (const v of va) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });

  test("same (world, seed) ⇒ identical star field; different seed differs", () => {
    const s1 = seededStars("deep-space", 7, 40);
    const s2 = seededStars("deep-space", 7, 40);
    const s3 = seededStars("deep-space", 8, 40);
    expect(s1).toEqual(s2);
    expect(s1).not.toEqual(s3);
    expect(s1.length).toBe(40);
    for (const st of s1) {
      expect(st.x).toBeGreaterThanOrEqual(0); expect(st.x).toBeLessThanOrEqual(1);
      expect(st.y).toBeGreaterThanOrEqual(0); expect(st.y).toBeLessThanOrEqual(1);
    }
  });

  test("hashSeed differs by world id", () => {
    expect(hashSeed("deep-space", 1)).not.toBe(hashSeed("quiet-void", 1));
  });
});

describe("landing zones", () => {
  test("inLandingZone reflects the preset rectangles", () => {
    const dv = worldById("deep-space")!;
    // deep-space landing zone is the left-center; the busy corner is top-right
    expect(inLandingZone(dv, 0.3, 0.5)).toBe(true);
    expect(inLandingZone(dv, 0.95, 0.05)).toBe(false);
  });
});
