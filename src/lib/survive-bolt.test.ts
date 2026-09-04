import { describe, expect, test } from "bun:test";

import { SURVIVE_BOLTS, forgeSurviveBolt, redBolt, surviveBoltSpec } from "./survive-bolt";

describe("the Survive bolt — the red bolt and its blue echo", () => {
  test("the red is a 13-point bolt: two jags on the right, two notches on the left, a tip at the bottom", () => {
    for (const b of SURVIVE_BOLTS) {
      const r = redBolt(b.params);
      expect(r).toHaveLength(13);
      expect(r[7][1]).toBe(Math.max(...r.map((q) => q[1])));               // the tip is the lowest point
      expect(r[1][1]).toBe(Math.min(...r.map((q) => q[1])));               // the top edge is the highest
      expect(r[3][0]).toBeGreaterThan(r[2][0]);                            // the first jag steps right…
      expect(r[5][0]).toBeGreaterThan(r[4][0]);                            // …and the second
      expect(r[11][0]).toBeGreaterThan(r[12][0]);                          // the notches step in going up
    }
  });
  test("the echo is the same ring slid down-left, both inside the viewBox", () => {
    for (const b of SURVIVE_BOLTS) {
      const g = forgeSurviveBolt(b.params);
      expect(g.seamPts).toHaveLength(g.outerPts.length);
      g.outerPts.forEach(([x, y], i) => { expect(g.seamPts[i][0]).toBeCloseTo(x - b.params.echoX, 6); expect(g.seamPts[i][1]).toBeCloseTo(y + b.params.echoY, 6); });
      const [vx, vy, vw, vh] = g.viewBox.split(" ").map(Number);
      for (const [x, y] of [...g.outerPts, ...g.seamPts]) { expect(x).toBeGreaterThanOrEqual(vx); expect(x).toBeLessThanOrEqual(vx + vw); expect(y).toBeGreaterThanOrEqual(vy); expect(y).toBeLessThanOrEqual(vy + vh); }
      expect(g.ratio).toBeLessThan(1);                                     // taller than wide
    }
  });
  test("deterministic, and the top and the tip never wobble", () => {
    const a = forgeSurviveBolt(SURVIVE_BOLTS[0].params), b = forgeSurviveBolt(SURVIVE_BOLTS[0].params);
    expect(a.outer).toBe(b.outer);
    const plain = redBolt(SURVIVE_BOLTS[0].params);
    expect(a.outerPts[1]).toEqual(plain[1]);
    expect(a.outerPts[7]).toEqual(plain[7]);
    expect(forgeSurviveBolt({ ...SURVIVE_BOLTS[0].params, seed: 99 }).outer).not.toBe(a.outer);
  });
  test("the spec is an echo spec with four boil frames", () => {
    const s = surviveBoltSpec(SURVIVE_BOLTS[2].params);
    expect(s.frames).toHaveLength(4);
    expect(s.frames.every((f) => f.echo)).toBe(true);
  });
});
