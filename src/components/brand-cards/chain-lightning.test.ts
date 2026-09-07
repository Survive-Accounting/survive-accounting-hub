// The outro CTA's geometry — the strike, the forks, the rim sparks and the composition.
import { describe, expect, test } from "bun:test";

import { CTA_RED, chainBolts, ctaLayout, edgeTicks, lightningBranches, lightningPath, pathLength, pillPoint, polyline, seeded } from "./chain-lightning";

const A = { x: 100, y: 100 }, B = { x: 400, y: 700 };

/** Perpendicular distance of p from the line A→B. */
function sideways(p: { x: number; y: number }): number {
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  return Math.abs((p.x - A.x) * dy - (p.y - A.y) * dx) / len;
}

describe("seeded — deterministic, in [0,1)", () => {
  test("same seed, same stream; different seed, different stream", () => {
    const a = seeded(7), b = seeded(7), c = seeded(8);
    const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
    for (const v of [...sa, ...sc]) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe("lightningPath — lands exactly, wanders within jag, same seed same bolt", () => {
  test("both ends are exact and the interior has the asked-for vertices", () => {
    const p = lightningPath(A, B, 3, 0.18, 12);
    expect(p[0]).toEqual(A);
    expect(p[p.length - 1]).toEqual(B);
    expect(p).toHaveLength(13);
  });
  test("deterministic in the seed", () => {
    expect(lightningPath(A, B, 11)).toEqual(lightningPath(A, B, 11));
    expect(lightningPath(A, B, 11)).not.toEqual(lightningPath(A, B, 12));
  });
  test("never strays further sideways than jag × length, and jag 0 is a straight line", () => {
    const len = Math.hypot(B.x - A.x, B.y - A.y);
    for (const seed of [1, 2, 3, 4, 5, 99]) {
      for (const p of lightningPath(A, B, seed, 0.2)) expect(sideways(p)).toBeLessThanOrEqual(0.2 * len + 1e-6);
    }
    for (const p of lightningPath(A, B, 5, 0)) expect(sideways(p)).toBeLessThan(1e-6);
  });
  test("it actually jags — a real bolt is not the straight line", () => {
    const p = lightningPath(A, B, 5, 0.18);
    expect(Math.max(...p.map(sideways))).toBeGreaterThan(5);
    expect(pathLength(p)).toBeGreaterThan(Math.hypot(B.x - A.x, B.y - A.y));
  });
  test("a zero-length bolt is just its two ends", () => {
    expect(lightningPath(A, A, 1)).toEqual([A, A]);
  });
});

describe("lightningBranches — forks leave the trunk, short of it, never at the strike point", () => {
  const trunk = lightningPath(A, B, 21, 0.16, 12);
  const forks = lightningBranches(trunk, 21, 3);
  test("count, and each fork starts ON a trunk vertex", () => {
    expect(forks).toHaveLength(3);
    for (const f of forks) expect(trunk.some((v) => v.x === f[0].x && v.y === f[0].y)).toBe(true);
  });
  test("each fork is shorter than the trunk and never starts in the trunk's last quarter", () => {
    const L = pathLength(trunk);
    for (const f of forks) {
      expect(pathLength(f)).toBeLessThan(L * 0.6);
      const i = trunk.findIndex((v) => v.x === f[0].x && v.y === f[0].y);
      expect(i).toBeGreaterThan(0);
      expect(i).toBeLessThan(trunk.length - 2);
    }
  });
  test("deterministic; nothing to fork from a two-point line", () => {
    expect(lightningBranches(trunk, 21, 3)).toEqual(forks);
    expect(lightningBranches([A, B], 1, 3)).toEqual([]);
  });
});

describe("chainBolts — the volley from the bolt-as-i into the pill", () => {
  const bolt = { x: 500, y: 600, w: 60, h: 150 };
  const btn = { x: 300, y: 1000, w: 480, h: 130 };
  test("the first bolt is the strike: on time, heaviest, dead centre; the rest follow thinner", () => {
    const v = chainBolts(bolt, btn, 7, { bolts: 3, branches: 3 });
    expect(v).toHaveLength(3);
    expect(v[0].delayMs).toBe(0);
    expect(v[0].width).toBeGreaterThan(v[1].width);
    const land = v[0].path[v[0].path.length - 1];
    expect(land.x).toBeCloseTo(btn.x + btn.w / 2, 5);
    for (let i = 1; i < v.length; i++) expect(v[i].delayMs).toBeGreaterThan(v[i - 1].delayMs);
  });
  test("every bolt leaves the bolt's lower tip and lands on the pill's top edge, inside its width", () => {
    for (const b of chainBolts(bolt, btn, 3, { bolts: 4 })) {
      const s = b.path[0], e = b.path[b.path.length - 1];
      expect(s.y).toBeCloseTo(bolt.y + bolt.h * 0.96, 5);
      expect(s.x).toBeGreaterThanOrEqual(bolt.x);
      expect(s.x).toBeLessThanOrEqual(bolt.x + bolt.w);
      expect(e.y).toBeGreaterThanOrEqual(btn.y);
      expect(e.x).toBeGreaterThan(btn.x + btn.h / 2);
      expect(e.x).toBeLessThan(btn.x + btn.w - btn.h / 2);
      expect(b.branches.length).toBeGreaterThan(0);
    }
  });
  test("the super throws more", () => {
    expect(chainBolts(bolt, btn, 7, { bolts: 5, branches: 4 })).toHaveLength(5);
    expect(chainBolts(bolt, btn, 7, { bolts: 5, branches: 4 })[0].branches).toHaveLength(4);
  });
});

describe("pillPoint / edgeTicks — sparks standing off the rim", () => {
  const r = { x: 100, y: 200, w: 400, h: 100 };
  test("t walks the top edge, the right cap, the bottom edge, the left cap — with outward normals", () => {
    expect(pillPoint(r, 0)).toEqual({ p: { x: 150, y: 200 }, n: { x: 0, y: -1 } });
    const right = pillPoint(r, 0.5 - Math.PI * 50 / 2 / (2 * 300 + 2 * Math.PI * 50));
    expect(right.p.x).toBeCloseTo(500, 5); expect(right.p.y).toBeCloseTo(250, 5); expect(right.n.x).toBeCloseTo(1, 5);
    const bottom = pillPoint(r, 0.5);
    expect(bottom.p.y).toBeCloseTo(300, 5); expect(bottom.n.y).toBeCloseTo(1, 5);
  });
  test("ticks start on the rim and point outward, each on its own clock", () => {
    const ticks = edgeTicks(r, 9, 8);
    expect(ticks).toHaveLength(8);
    for (const t of ticks) {
      expect(t.pts).toHaveLength(3);
      const [a, , c] = t.pts;
      // outward: the tip is further from the pill's centre than the root
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      expect(Math.hypot(c.x - cx, c.y - cy)).toBeGreaterThan(Math.hypot(a.x - cx, a.y - cy));
      expect(t.periodMs).toBeGreaterThanOrEqual(700);
      expect(t.delayMs).toBeGreaterThanOrEqual(0);
    }
    expect(new Set(ticks.map((t) => t.delayMs)).size).toBeGreaterThan(1);
  });
  test("polyline formats two decimals", () => {
    expect(polyline([{ x: 1, y: 2.345 }, { x: 3.1, y: 4 }])).toBe("1.00,2.35 3.10,4.00");
  });
});

describe("ctaLayout — the outro column as one fact", () => {
  const V = { w: 1080, h: 1920 };
  const L = ctaLayout(V);
  test("the wordmark keeps its 190 cap-height and the band starts in the upper third", () => {
    expect(L.word).toBe(190);
    expect(L.top).toBe(576);
  });
  test("rows stack in order with positive gaps", () => {
    expect(L.tagTop).toBeGreaterThan(L.wordTop + L.word);
    expect(L.domainTop).toBeGreaterThan(L.tagTop + L.tagLine);
    expect(L.buttonTop).toBeGreaterThan(L.domainTop + L.domainSize);
    expect(L.subTop).toBeGreaterThan(L.buttonTop + L.buttonH);
    expect(L.bottom).toBe(L.subTop + L.subSize);
  });
  test("the pill, even grown, never touches the three words or the campus banner strip", () => {
    expect(L.grownButtonBottom).toBeLessThan(L.subTop);
    expect(L.bottom).toBeLessThan(L.bannerTop - V.h * 0.05);
    expect(L.bottom).toBeLessThan(V.h * 0.65); // clear of YouTube's end-screen overlay too
  });
  test("the pill is big — a thumb target at 1080 wide, League Spartan sized to read on a phone", () => {
    expect(L.buttonH).toBeGreaterThanOrEqual(120);
    expect(L.buttonMinW).toBeGreaterThanOrEqual(V.w * 0.5);
    expect(L.buttonFont).toBeGreaterThanOrEqual(48);
    expect(L.grow).toBeCloseTo(1.12, 5);
  });
  test("scales with the stage", () => {
    const half = ctaLayout({ w: 540, h: 960 });
    expect(half.word).toBe(95);
    expect(half.bottom).toBeLessThan(L.bottom / 2 + 8);
    expect(half.bottom).toBeGreaterThan(L.bottom / 2 - 8);
  });
  test("the red is one warm signal red — not maroon, not pink", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(CTA_RED.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(200);      // bright, not maroon
    expect(g).toBeGreaterThan(b);        // warm (orange lean), not pink (blue lean)
    expect(b).toBeLessThan(80);
  });
});
