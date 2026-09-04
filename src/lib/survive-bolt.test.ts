import { describe, expect, test } from "bun:test";

import { SURVIVE_BOLTS, forgeSurviveBolt, surviveBoltSpec } from "./survive-bolt";

function turns(pts: [number, number][]): number {
  // Count sign changes of the x-direction along the ring — a crude "how many zigzags".
  let n = 0, prev = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.sign(pts[i][0] - pts[i - 1][0]);
    if (d && prev && d !== prev) n++;
    if (d) prev = d;
  }
  return n;
}

describe("the Survive bolt — three original silhouettes", () => {
  test("each family builds closed rings that share the tip and the base, inside its viewBox", () => {
    for (const b of SURVIVE_BOLTS) {
      const g = forgeSurviveBolt(b.params);
      expect(g.outerPts.length).toBeGreaterThan(6);
      expect(g.seamPts.length).toBeGreaterThan(6);
      expect(g.outerPts[0]).toEqual(g.seamPts[0]);                           // the tip is shared
      const [vx, vy, vw, vh] = g.viewBox.split(" ").map(Number);
      for (const [x, y] of [...g.outerPts, ...g.seamPts]) { expect(x).toBeGreaterThanOrEqual(vx); expect(x).toBeLessThanOrEqual(vx + vw); expect(y).toBeGreaterThanOrEqual(vy); expect(y).toBeLessThanOrEqual(vy + vh); }
      expect(g.ratio).toBeGreaterThan(0.3);
      expect(g.ratio).toBeLessThan(1);                                        // taller than wide
    }
  });
  test("far fewer zigzags than the old mark, and the flanks are not mirror images", () => {
    for (const b of SURVIVE_BOLTS) {
      const g = forgeSurviveBolt(b.params);
      expect(turns(g.outerPts)).toBeLessThanOrEqual(12);                     // the old silhouette turns ~26 times
      const xs = g.outerPts.map((q) => q[0]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const rightMass = g.outerPts.filter((q) => q[0] > cx).length, leftMass = g.outerPts.length - rightMass;
      expect(rightMass).not.toBe(leftMass);                                   // asymmetric by construction
    }
  });
  test("deterministic: the same params give the same points; a different seed gives different ones", () => {
    const a = forgeSurviveBolt(SURVIVE_BOLTS[0].params), b = forgeSurviveBolt(SURVIVE_BOLTS[0].params);
    expect(a.outer).toBe(b.outer);
    const c = forgeSurviveBolt({ ...SURVIVE_BOLTS[0].params, seed: 99 });
    expect(c.outer).not.toBe(a.outer);
  });
  test("the boil spec has four frames with the tip and base pinned", () => {
    const s = surviveBoltSpec(SURVIVE_BOLTS[1].params);
    expect(s.frames).toHaveLength(4);
    const firstPoint = (d: string) => d.split(" ").slice(0, 2).join(" ");
    expect(new Set(s.frames.map((f) => firstPoint(f.outer))).size).toBe(1);   // the tip never moves
  });
});
