// THE SURVIVE BOLT — three original silhouettes, built from the ground up.
//
// Lee (2026-09-05), after the trademark read: the current mark shares the
// Dead bolt's cues (the elongated multi-zigzag, red/blue, white keyline, the
// 13-point rhythm), so before it goes everywhere the silhouette has to become
// ours — "significantly fewer major turns, taller and narrower, asymmetric,
// distinctive top and bottom terminations, a geometry you can recognise from
// silhouette alone … the division between the school colours could itself form
// an S." Everything else stays: two halves that take school colours, the white
// keyline, the boil, the bolt as the "i".
//
// bolt-forge.ts builds the old mark: a spine with the same tooth on both
// flanks, which is the Dead construction by definition. This module builds
// each family its own way and only shares the OUTPUT shape with the forge
// (outer ring + seam ring + viewBox), so makeBoil, BoltBoil, the wordmark,
// the cursor and the flyer all take it unchanged.
//
//   strike  ONE elbow. A long upper shaft, a single jut to the right, a long
//           lower shaft to a needle. The left flank is nearly straight with one
//           small kink — no matching tooth — so the silhouette is a Z, not a
//           zigzag. Slanted top. The seam is an S.
//   hook    A crook at the top (the bolt bends where it leaves the cloud), one
//           elbow, and a chisel-cut base. The right half carries more colour.
//   fork    A flat cap, one elbow, and a base that splits into two prongs —
//           the one bolt you can name from its bottom alone.
//
// Coordinates follow the forge (top at y = 4, base near y = 150) so the bolt
// sits in the wordmark the way the old one did. Deterministic: same params,
// same points — the boil is the only motion.
import { makeBoil, type BoltSpec } from "@/components/brand-cards/bolt-boil";

export type SurviveBoltFamily = "strike" | "hook" | "fork";

export interface SurviveBoltParams {
  family: SurviveBoltFamily;
  /** How far the bolt drifts left on the way down (0 = upright). */
  lean: number;
  /** The shaft's thickness. */
  width: number;
  /** Where the elbow sits, as a fraction of the height. */
  elbow: number;
  /** How far the elbow juts out. */
  jut: number;
  /** The small kink on the quiet flank. */
  notch: number;
  /** The S in the seam (0 = a straight lean). */
  seamS: number;
  /** Hand-drawn wobble on every vertex (0 = ruler-straight). */
  handDrawn: number;
  seed: number;
  /** The keyline width the viewBox pads for. */
  outline: number;
}

export interface SurviveBoltGeom { outerPts: [number, number][]; seamPts: [number, number][]; outer: string; seam: string; viewBox: string; ratio: number }

export const SURVIVE_BOLTS: { id: SurviveBoltFamily; name: string; blurb: string; params: SurviveBoltParams }[] = [
  { id: "strike", name: "Strike", blurb: "One elbow, a needle, an S for the seam. Tall and narrow; the left flank is almost a single line.",
    params: { family: "strike", lean: 0.3, width: 16, elbow: 0.44, jut: 24, notch: 7, seamS: 6, handDrawn: 0.9, seed: 11, outline: 8 } },
  { id: "hook", name: "Hook", blurb: "A crook at the top where it leaves the cloud, one elbow, a chisel base. The right half is the heavier one.",
    params: { family: "hook", lean: 0.26, width: 17, elbow: 0.5, jut: 22, notch: 6, seamS: 5, handDrawn: 0.9, seed: 5, outline: 8 } },
  { id: "fork", name: "Fork", blurb: "A flat cap, one elbow, and a base that splits in two — recognisable from the bottom alone.",
    params: { family: "fork", lean: 0.22, width: 17, elbow: 0.4, jut: 20, notch: 6, seamS: 4, handDrawn: 0.9, seed: 3, outline: 8 } },
];

type Pt = [number, number];
const TY = 4;
const BOTTOM = 150;
const TOP_X = 60;

// mulberry32 — the forge's PRNG, so a seed means the same thing here.
function prng(seed: number) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toPath(pts: Pt[]): string {
  return pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ") + " Z";
}

/** The seam, top to base, as an S around the shaft's centre line: +amp a quarter
 *  of the way down, −amp three quarters down. amp = 0 is the straight lean. */
function seamLine(cx: (y: number) => number, top: Pt, base: Pt, amp: number, n = 9): Pt[] {
  const pts: Pt[] = [top];
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const y = top[1] + (base[1] - top[1]) * t;
    pts.push([cx(y) + amp * Math.sin(Math.PI * 2 * t * 0.75 + Math.PI * 0.1), y]);
  }
  pts.push(base);
  return pts;
}

export function forgeSurviveBolt(p: SurviveBoltParams): SurviveBoltGeom {
  const rnd = prng(p.seed);
  const wob = (amp: number) => (amp === 0 ? 0 : (rnd() * 2 - 1) * amp);
  const H = BOTTOM - TY;
  const cx = (y: number) => TOP_X - p.lean * (y - TY);
  const w = Math.max(8, p.width), hw = w / 2;
  const ey = TY + H * p.elbow;
  let right: Pt[] = [], left: Pt[] = [], seam: Pt[] = [];
  let tipTop: Pt, base: Pt;

  if (p.family === "strike") {
    // Slanted top: the right corner is the tip, the left corner sits lower.
    tipTop = [cx(TY) + hw * 0.9, TY];
    const topLeft: Pt = [cx(TY) - hw * 1.1, TY + 7];
    base = [cx(BOTTOM) - hw * 0.15, BOTTOM];
    right = [tipTop,
      [cx(ey - 4) + hw * 0.85, ey - 4],                 // the shaft narrows into the elbow
      [cx(ey) + hw + p.jut, ey - 3],                    // the jut — the ONE elbow
      [cx(ey + 10) + hw * 0.55, ey + 10],               // and back in to the lower shaft
      base];
    left = [tipTop, topLeft,
      [cx(ey + 18) - hw * 1.05, ey + 18],               // the quiet flank: one small kink
      [cx(ey + 26) - hw * 0.55 - p.notch * 0.2, ey + 26],
      [cx(ey + 30) - hw * 1.0 - p.notch * 0.5, ey + 30],
      base];
    seam = seamLine(cx, tipTop, base, p.seamS);
  } else if (p.family === "hook") {
    // The crook: the head leans out to the right and comes back to the shaft.
    tipTop = [cx(TY) + hw * 0.5, TY];
    const hookOut: Pt = [cx(TY + 9) + hw + p.jut * 0.65, TY + 6];
    const hookIn: Pt = [cx(TY + 22) + hw * 0.8, TY + 22];
    // A chisel base: a slanted cut, the right corner lower.
    base = [cx(BOTTOM) + hw * 0.25, BOTTOM];
    const baseLeft: Pt = [cx(BOTTOM - 9) - hw * 0.6, BOTTOM - 9];
    right = [tipTop, hookOut, hookIn,
      [cx(ey - 3) + hw * 0.9, ey - 3],
      [cx(ey) + hw + p.jut, ey - 2],
      [cx(ey + 11) + hw * 0.6, ey + 11],
      base];
    left = [tipTop, [cx(TY + 4) - hw * 0.95, TY + 4],
      [cx(ey + 6) - hw, ey + 6],
      [cx(ey + 14) - hw * 0.45 - p.notch * 0.2, ey + 14],
      [cx(ey + 19) - hw * 0.95 - p.notch * 0.4, ey + 19],
      baseLeft, base];
    // The seam runs left of centre so the right half carries more colour.
    seam = seamLine((y) => cx(y) - hw * 0.18, tipTop, base, p.seamS);
  } else {
    // A flat cap, then one elbow, then the fork.
    tipTop = [cx(TY) + hw * 0.7, TY];
    const capLeft: Pt = [cx(TY) - hw * 0.9, TY + 1];
    const crotchY = BOTTOM - 34;
    base = [cx(BOTTOM) + hw * 0.55, BOTTOM];                             // the right prong (the longer one)
    const prongL: Pt = [cx(BOTTOM - 12) - hw * 1.25 - p.notch, BOTTOM - 12]; // the left prong
    const crotch: Pt = [cx(crotchY) - hw * 0.05, crotchY];
    right = [tipTop,
      [cx(ey - 4) + hw * 0.9, ey - 4],
      [cx(ey) + hw + p.jut, ey - 2],
      [cx(ey + 10) + hw * 0.6, ey + 10],
      base];
    left = [tipTop, capLeft,
      [cx(ey + 16) - hw * 1.0, ey + 16],
      [cx(ey + 22) - hw * 0.5 - p.notch * 0.2, ey + 22],
      [cx(crotchY - 12) - hw * 0.95, crotchY - 12],
      prongL, crotch, base];
    seam = seamLine(cx, tipTop, crotch, p.seamS);
    seam.push(base);
  }

  // The hand-drawn wobble — every vertex but the tip and the base, so the bolt
  // stays pinned as the "i" (the boil does the same).
  const shake = (pts: Pt[]): Pt[] => pts.map((q) => (q === tipTop || q === base) ? q : [q[0] + wob(p.handDrawn * 1.6), q[1] + wob(p.handDrawn * 1.2)] as Pt);
  const R = shake(right), L = shake(left), S = shake(seam);
  // The rings: the silhouette runs down the right flank and up the left; the
  // seam ring is the S then back up the right flank — its shared edge with the
  // silhouette is what makes the two halves one mark.
  const outerPts: Pt[] = [...R, ...L.slice(1, -1).reverse()];
  const seamPts: Pt[] = [...S, ...R.slice(1, -1).reverse()];
  const all = [...outerPts, ...seamPts];
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const pad = p.outline / 2 + 2;
  const vx = Math.min(...xs) - pad, vy = Math.min(...ys) - pad;
  const vw = Math.max(...xs) - vx + pad, vh = Math.max(...ys) - vy + pad;
  const r1 = (v: number) => Math.round(v * 100) / 100;
  return { outerPts, seamPts, outer: toPath(outerPts), seam: toPath(seamPts), viewBox: `${r1(vx)} ${r1(vy)} ${r1(vw)} ${r1(vh)}`, ratio: vw / vh };
}

/** The BoltSpec the boil cards, the wordmark and the cold open render. */
export function surviveBoltSpec(p: SurviveBoltParams, colours?: { red?: string; blue?: string; cream?: string }): BoltSpec {
  const g = forgeSurviveBolt(p);
  return { frames: makeBoil(g.outerPts, g.seamPts, p.outline), viewBox: g.viewBox, ratio: g.ratio, red: colours?.red ?? "#C62828", blue: colours?.blue ?? "#1565C0", cream: colours?.cream ?? "#FFFFFF" };
}

/** What a sitewide swap pastes into canvas/brand.tsx (BOLT_OUTER / BOLT_RIGHT /
 *  BOLT_VIEWBOX) and bolt-boil.tsx (FINAL_OUTER / FINAL_SEAM / viewBox). */
export function surviveBoltExport(p: SurviveBoltParams): { BOLT_OUTER: string; BOLT_RIGHT: string; BOLT_VIEWBOX: string; outerPts: Pt[]; seamPts: Pt[] } {
  const g = forgeSurviveBolt(p);
  return { BOLT_OUTER: g.outer, BOLT_RIGHT: g.seam, BOLT_VIEWBOX: g.viewBox, outerPts: g.outerPts, seamPts: g.seamPts };
}
