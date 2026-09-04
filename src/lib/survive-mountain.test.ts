import { describe, expect, test } from "bun:test";

import { SURVIVE_MOUNTAINS, forgeMountain, mountainSpec } from "./survive-mountain";

describe("the Survive mountain", () => {
  test("every candidate closes with the peak on top and a flat base, inside its viewBox", () => {
    for (const m of SURVIVE_MOUNTAINS) {
      const g = forgeMountain(m.params);
      expect(g.outerPts[0][1]).toBe(Math.min(...g.outerPts.map((q) => q[1])));       // the peak leads the ring
      const baseY = Math.max(...g.outerPts.map((q) => q[1]));
      expect(g.outerPts.filter((q) => q[1] === baseY).length).toBeGreaterThanOrEqual(2); // a flat base
      expect(g.seamPts[0]).toEqual(g.outerPts[0]);                                     // the shade starts at the peak
      const [vx, vy, vw, vh] = g.viewBox.split(" ").map(Number);
      for (const [x, y] of [...g.outerPts, ...g.seamPts, ...g.capPts]) { expect(x).toBeGreaterThanOrEqual(vx); expect(x).toBeLessThanOrEqual(vx + vw); expect(y).toBeGreaterThanOrEqual(vy); expect(y).toBeLessThanOrEqual(vy + vh); }
    }
  });
  test("snow caps the peak; no snow means no cap ring", () => {
    const g = forgeMountain(SURVIVE_MOUNTAINS[2].params);
    expect(g.capPts[0]).toEqual(g.outerPts[0]);
    expect(Math.max(...g.capPts.map((q) => q[1]))).toBeLessThan(Math.max(...g.outerPts.map((q) => q[1])) * 0.5);
    expect(forgeMountain({ ...SURVIVE_MOUNTAINS[0].params, snow: 0 }).cap).toBe("");
  });
  test("the spec boils four frames and carries the cap; deterministic", () => {
    const s = mountainSpec(SURVIVE_MOUNTAINS[0].params);
    expect(s.frames).toHaveLength(4);
    expect(s.frames.every((f) => !!f.cap)).toBe(true);
    expect(forgeMountain(SURVIVE_MOUNTAINS[0].params).outer).toBe(forgeMountain(SURVIVE_MOUNTAINS[0].params).outer);
    expect(forgeMountain({ ...SURVIVE_MOUNTAINS[0].params, seed: 40 }).outer).not.toBe(forgeMountain(SURVIVE_MOUNTAINS[0].params).outer);
  });
});
