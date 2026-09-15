import { describe, expect, test } from "bun:test";

import { boltPath, strikePoint, toPathD } from "./gamer-mode";

describe("gamer mode lightning", () => {
  test("a bolt starts and ends where it's aimed, with detail in between", () => {
    let s = 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pts = boltPath({ x: 0, y: 0 }, { x: 100, y: 200 }, 0.2, 4, rnd);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 200 });
    expect(pts.length).toBe(17);
    expect(toPathD(pts.slice(0, 2)).startsWith("M0.0 0.0 L")).toBe(true);
  });
  test("it lands on the side of the button facing the bolt", () => {
    const rect = { left: 100, top: 300, width: 200, height: 50 };
    expect(strikePoint({ x: 200, y: 100 }, rect).y).toBe(302);
    expect(strikePoint({ x: 200, y: 600 }, rect).y).toBe(348);
  });
});
