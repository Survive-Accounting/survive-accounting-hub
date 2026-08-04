import { describe, expect, test } from "bun:test";

import { forgeBolt, DEFAULT_BOLT } from "./bolt-forge";
import { analyzeAngles, applyAssist, averageAxis, cleanupGeometry, DEFAULT_ASSIST, mirrorHalf, ptsToPath, symmetrize, toV, type V } from "./bolt-geom-edit";

const base = (): V[] => forgeBolt(DEFAULT_BOLT).outerPts.map(toV);
const finite = (pts: V[]) => pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe("bolt geometry edit", () => {
  test("neutral assist is the identity (default bolt unchanged)", () => {
    const p = base();
    const out = applyAssist(p, DEFAULT_ASSIST);
    expect(out.length).toBe(p.length);
    out.forEach((v, i) => { expect(v.x).toBeCloseTo(p[i].x, 6); expect(v.y).toBeCloseTo(p[i].y, 6); });
  });

  test("assist knobs move the geometry but keep it finite + same vertex count", () => {
    const p = base();
    for (const patch of [{ vSym: 1 }, { hSym: 1 }, { parallel: 1 }, { angleConsist: 1 }, { straighten: 1 }, { rhythm: 1 }, { optical: 1 }, { snap: "15", snapStrength: 1 }] as const) {
      const out = applyAssist(p, { ...DEFAULT_ASSIST, ...patch });
      expect(out.length).toBe(p.length);
      expect(finite(out)).toBe(true);
    }
    expect(applyAssist(p, { ...DEFAULT_ASSIST, vSym: 1 })).not.toEqual(p);
  });

  test("symmetrize at 1 increases vertical symmetry (lower mirror error)", () => {
    const p = base();
    const err = (pts: V[]) => { const cy = (Math.min(...pts.map((v) => v.y)) + Math.max(...pts.map((v) => v.y))) / 2; let e = 0; for (const v of pts) { let bd = Infinity; for (const w of pts) bd = Math.min(bd, (w.x - v.x) ** 2 + (w.y - (2 * cy - v.y)) ** 2); e += bd; } return e; };
    expect(err(symmetrize(p, 1, "v"))).toBeLessThan(err(p));
  });

  test("mirror + average + cleanup return valid same-length polygons", () => {
    const p = base();
    for (const op of [mirrorHalf(p, "v", true), mirrorHalf(p, "h", true), averageAxis(p, "v"), cleanupGeometry(p, 0.6)]) {
      expect(op.length).toBe(p.length);
      expect(finite(op)).toBe(true);
    }
  });

  test("analyzeAngles returns families sorted by count; ptsToPath is a closed path", () => {
    const fams = analyzeAngles(base());
    expect(fams.length).toBeGreaterThan(0);
    for (let i = 1; i < fams.length; i++) expect(fams[i - 1].count).toBeGreaterThanOrEqual(fams[i].count);
    const d = ptsToPath(base());
    expect(d.startsWith("M")).toBe(true);
    expect(d.trimEnd().endsWith("Z")).toBe(true);
  });
});
