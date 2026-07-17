import { describe, expect, test } from "bun:test";

import { gridSteps, inReservedZone, outlineSteps, staircaseSteps } from "./outline-staircase";

describe("staircaseSteps — climbs from the origin", () => {
  test("bottom-left origin: x rises, y falls (climb up-right)", () => {
    const s = staircaseSteps(5, { origin: "bl", rise: 0.6 });
    expect(s).toHaveLength(5);
    // x strictly increasing, y strictly decreasing (going up)
    for (let i = 1; i < s.length; i++) {
      expect(s[i].x).toBeGreaterThan(s[i - 1].x);
      expect(s[i].y).toBeLessThan(s[i - 1].y);
    }
    // starts near bottom-left, ends near top-right
    expect(s[0].x).toBeLessThan(0.15);
    expect(s[0].y).toBeGreaterThan(0.85);
    expect(s[4].x).toBeGreaterThan(0.85);
  });

  test("bottom-RIGHT origin climbs up-left (x falls, y falls)", () => {
    const s = staircaseSteps(4, { origin: "br", rise: 0.6 });
    for (let i = 1; i < s.length; i++) {
      expect(s[i].x).toBeLessThan(s[i - 1].x);
      expect(s[i].y).toBeLessThan(s[i - 1].y);
    }
  });

  test("higher rise climbs further (bigger vertical span)", () => {
    const lo = staircaseSteps(6, { rise: 0.3 });
    const hi = staircaseSteps(6, { rise: 0.9 });
    const spanLo = lo[0].y - lo[5].y;
    const spanHi = hi[0].y - hi[5].y;
    expect(spanHi).toBeGreaterThan(spanLo);
  });

  test("handles 15 lessons (region cap) without overflowing 0..1", () => {
    const s = staircaseSteps(15, { rise: 0.6 });
    expect(s).toHaveLength(15);
    for (const p of s) { expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1); expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1); }
  });
});

describe("reserved zones — camera (TL) + watermark (BR) stay clear", () => {
  test("a bl→tr staircase's interior steps avoid both reserved corners", () => {
    // steps 1..n-2 (not the endpoints) shouldn't sit in the camera/watermark boxes
    const s = staircaseSteps(6, { origin: "bl", rise: 0.6 });
    const mids = s.slice(1, -1);
    expect(mids.every((p) => !inReservedZone(p))).toBe(true);
  });
  test("inReservedZone flags a top-left point and a bottom-right point", () => {
    expect(inReservedZone({ x: 0.1, y: 0.1 })).toBe(true);
    expect(inReservedZone({ x: 0.95, y: 0.95 })).toBe(true);
    expect(inReservedZone({ x: 0.5, y: 0.5 })).toBe(false);
  });
});

describe("outlineSteps — grid fallback", () => {
  test("explicit grid layout returns a grid", () => {
    expect(outlineSteps(7, { layout: "grid" }).layout).toBe("grid");
  });
  test("too many tightly-packed steps fall back to grid", () => {
    // stepFrac large relative to the per-step gap → not legible as a stair
    const r = outlineSteps(15, { stepFrac: 0.2 });
    expect(r.layout).toBe("grid");
  });
  test("a roomy staircase stays a staircase", () => {
    expect(outlineSteps(6, { stepFrac: 0.1 }).layout).toBe("staircase");
  });
  test("gridSteps lays 7 into 5-wide rows", () => {
    const g = gridSteps(7);
    expect(g).toHaveLength(7);
    // row 0 has 5, row 1 has 2 — item 5 (index 5) drops to a lower row
    expect(g[5].y).toBeGreaterThan(g[0].y);
  });
});
