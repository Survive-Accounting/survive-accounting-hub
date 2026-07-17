import { describe, expect, test } from "bun:test";

import { autoCols, gateMarker, gridSteps, inReservedZone, outlineSteps, snakeSteps } from "./outline-snake";

describe("snakeSteps — boustrophedon", () => {
  test("even rows march right, odd rows march left", () => {
    const s = snakeSteps(13); // autoCols → 5, so row0 = 0..4, row1 = 5..9 reversed
    // row 0: x strictly increasing
    for (let i = 1; i < 5; i++) expect(s[i].x).toBeGreaterThan(s[i - 1].x);
    // row 1 (indices 5..9): x strictly DECREASING (snake reverses)
    for (let i = 6; i < 10; i++) expect(s[i].x).toBeLessThan(s[i - 1].x);
    // row 1 sits below row 0
    expect(s[5].y).toBeGreaterThan(s[4].y);
    // the wrap keeps the same column (5 sits under 4)
    expect(Math.abs(s[5].x - s[4].x)).toBeLessThan(1e-9);
  });

  test("everything stays inside the card (0..1) for 13 lessons", () => {
    for (const p of snakeSteps(13)) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

describe("auto-fit + safe zones", () => {
  test("13 lessons: every step clears the camera (TL) + watermark (BR) zones", () => {
    expect(snakeSteps(13).every((p) => !inReservedZone(p))).toBe(true);
  });
  test("15 lessons (cap) still all clear", () => {
    expect(snakeSteps(15).every((p) => !inReservedZone(p))).toBe(true);
  });
  test("inReservedZone flags a top-left point and a bottom-right point", () => {
    expect(inReservedZone({ x: 0.08, y: 0.10 })).toBe(true); // camera
    expect(inReservedZone({ x: 0.95, y: 0.95 })).toBe(true); // watermark
    expect(inReservedZone({ x: 0.5, y: 0.5 })).toBe(false);
  });

  test("autoCols: auto picks the widest legible row; manual override wins", () => {
    expect(autoCols(13)).toBe(5); // fewest rows within the legibility floor
    expect(autoCols(13, { stepsPerRow: 3 })).toBe(3);
    expect(autoCols(4)).toBe(4);
  });

  test("gate bias: freeThrough=8 → a column count that lands the gate on a row edge", () => {
    // 8 % 4 === 0 and 4 cols fits within +1 row of the minimum
    expect(autoCols(13, { gateAt: 8 })).toBe(4);
  });
});

describe("outlineSteps + grid fallback", () => {
  test("default is a snake", () => {
    expect(outlineSteps(13).layout).toBe("snake");
  });
  test("explicit grid layout returns a grid", () => {
    const r = outlineSteps(7, { layout: "grid" });
    expect(r.layout).toBe("grid");
    expect(r.steps).toHaveLength(7);
  });
  test("gridSteps lays 7 into 5-wide rows (row-major, no reversal)", () => {
    const g = gridSteps(7, 5);
    for (let i = 1; i < 5; i++) expect(g[i].x).toBeGreaterThan(g[i - 1].x);
    expect(g[5].y).toBeGreaterThan(g[0].y); // item 6 drops to row 2
    expect(g[5].x).toBeLessThan(g[4].x); // row 2 restarts at the left (grid, not snake)
  });
});

describe("gateMarker", () => {
  test("sits at the midpoint between the last free and first paid step", () => {
    const m = gateMarker({ x: 0.2, y: 0.4 }, { x: 0.4, y: 0.4 });
    // divider perpendicular to a horizontal segment → vertical tick around the midpoint x=0.3
    expect((m.x1 + m.x2) / 2).toBeCloseTo(0.3, 5);
    expect((m.y1 + m.y2) / 2).toBeCloseTo(0.4, 5);
    expect(Math.abs(m.y1 - m.y2)).toBeGreaterThan(0.05); // it has vertical extent
    expect(m.labelX).toBeGreaterThan(0.3); // nudged toward the paid side
  });
});
