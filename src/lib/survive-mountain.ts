// THE SURVIVE MOUNTAIN — the mark between the v's.
//
// Lee (2026-09-05): "in between the V's there's a perfect spot to do like a
// mountain as the logo. Mountain is maybe better fit for our brand anyway.
// We're trying to get you over the mountain of your course … the two school
// colors with it, the sun would hit one side of the mountain, shade the other
// … keep the boiling animation … a snow capped mountain even."
//
// Built the way the bolt is: an OUTER ring (the whole mountain, red = the lit
// side, with the white keyline), a SEAM ring (the shaded side, blue) that
// shares the ridge line with the silhouette, and — new — a CAP ring (the
// snow, cream) sitting on the peak. BoltBoil draws all three and the boil
// wobbles them with the peak and the base pinned, so the wordmark's "i" and
// every animation the bolt has work unchanged. Deterministic: same params,
// same points.
import { makeBoil, type BoilFrame, type BoltSpec } from "@/components/brand-cards/bolt-boil";

export interface MountainParams {
  /** Peak height (the shape's height over its width, 0.6–1.6). */
  rise: number;
  /** Where the peak sits across the base (0.5 = centred; the sun side gets the shorter slope). */
  peakX: number;
  /** Ridges on each slope (0–3): the steps a slope takes on the way down. */
  ridges: number;
  /** How far the ridge line (the seam) leans into the shaded side (0.2–0.8 of the half-width at the base). */
  shade: number;
  /** Snow: how far down from the peak the cap reaches (0 = none, as a fraction of the height). */
  snow: number;
  /** A second, lower summit on the shaded slope (0 = none, as a fraction of the height). */
  minor: number;
  /** Hand-drawn wobble (0 = ruler-straight). */
  handDrawn: number;
  seed: number;
  outline: number;
}

export interface MountainGeom { outerPts: [number, number][]; seamPts: [number, number][]; capPts: [number, number][]; outer: string; seam: string; cap: string; viewBox: string; ratio: number }

export const SURVIVE_MOUNTAINS: { id: "peak" | "ridge" | "snow" | "twin" | "bold"; name: string; blurb: string; params: MountainParams }[] = [
  { id: "peak", name: "Peak", blurb: "One summit, the sun on the left, a small cap. Tall enough to stand in for the i.",
    params: { rise: 1.25, peakX: 0.46, ridges: 1, shade: 0.35, snow: 0.22, minor: 0, handDrawn: 0.7, seed: 7, outline: 8 } },
  { id: "ridge", name: "Ridge", blurb: "Two steps down each slope — the long hike, the one the course feels like.",
    params: { rise: 1.1, peakX: 0.44, ridges: 2, shade: 0.4, snow: 0.18, minor: 0, handDrawn: 0.8, seed: 11, outline: 8 } },
  { id: "snow", name: "Snow", blurb: "A deep cap, the sky-line the cream owns. The most 'poster' of the five.",
    params: { rise: 1.3, peakX: 0.5, ridges: 1, shade: 0.34, snow: 0.34, minor: 0, handDrawn: 0.7, seed: 3, outline: 8 } },
  { id: "twin", name: "Twin", blurb: "A second, lower summit on the shaded side — a range, not a triangle.",
    params: { rise: 1.15, peakX: 0.4, ridges: 1, shade: 0.42, snow: 0.2, minor: 0.72, handDrawn: 0.8, seed: 5, outline: 8 } },
  { id: "bold", name: "Bold", blurb: "Low and chunky, no ridges, a wide cap. Reads at any size, sticker-ready.",
    params: { rise: 0.85, peakX: 0.48, ridges: 0, shade: 0.38, snow: 0.3, minor: 0, handDrawn: 0.6, seed: 2, outline: 9 } },
];

type Pt = [number, number];
const W = 120;          // the base width in its own units
const TY = 4;

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

/** A slope from the peak to a foot, with `ridges` steps: each step runs a
 *  little flat (a shelf) then drops. Returns the points AFTER the peak, up to
 *  and including the foot. */
function slope(peak: Pt, foot: Pt, ridges: number, dir: 1 | -1): Pt[] {
  const pts: Pt[] = [];
  const n = Math.max(0, Math.min(3, Math.round(ridges)));
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 1);
    const x = peak[0] + (foot[0] - peak[0]) * t, y = peak[1] + (foot[1] - peak[1]) * t;
    const shelf = (foot[0] - peak[0]) * 0.09;
    pts.push([x - shelf * 0.5, y - (foot[1] - peak[1]) * 0.05]);   // the shelf's upper lip
    pts.push([x + shelf * 0.5 * dir * dir, y + (foot[1] - peak[1]) * 0.02]); // and its drop
  }
  pts.push(foot);
  return pts;
}

export function forgeMountain(p: MountainParams): MountainGeom {
  const rnd = prng(p.seed);
  const wob = (amp: number) => (amp === 0 ? 0 : (rnd() * 2 - 1) * amp);
  const H = W * Math.max(0.5, p.rise);
  const baseY = TY + H;
  const peak: Pt = [W * p.peakX, TY];
  const footL: Pt = [0, baseY], footR: Pt = [W, baseY];
  // The silhouette, clockwise: peak → down the shaded (right) slope → the base → up the lit slope.
  const right = slope(peak, footR, p.ridges, 1);
  // A minor summit on the shaded slope: a bump before the foot.
  if (p.minor > 0) {
    const bx = W * (p.peakX + (1 - p.peakX) * 0.55), by = TY + H * (1 - p.minor);
    right.splice(Math.max(0, right.length - 1), 0, [bx - W * 0.06, by + H * 0.12], [bx, by], [bx + W * 0.07, by + H * 0.16]);
  }
  const left = slope(peak, footL, p.ridges, -1);
  const outerRaw: Pt[] = [peak, ...right, ...left.slice(0, -1).reverse(), footL].filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
  // The ridge line: from the peak down into the shaded side, leaning by `shade`,
  // meeting the base — the seam ring is the shaded side bounded by it.
  const seamFoot: Pt = [W * (p.peakX + (1 - p.peakX) * p.shade), baseY];
  const ridge: Pt[] = [peak, [peak[0] + (seamFoot[0] - peak[0]) * 0.35, TY + H * 0.4], [peak[0] + (seamFoot[0] - peak[0]) * 0.7, TY + H * 0.72], seamFoot];
  const seamRaw: Pt[] = [...ridge, ...right.slice().reverse().filter((q) => q[0] > seamFoot[0] || q[1] < baseY)];
  // The snow: a cap from the peak down `snow` of the height, its lower edge a
  // zigzag that follows the slopes.
  const capRaw: Pt[] = [];
  if (p.snow > 0) {
    const cy = TY + H * p.snow;
    const lx = peak[0] - (peak[0] - footL[0]) * p.snow, rx = peak[0] + (footR[0] - peak[0]) * p.snow;
    capRaw.push(peak, [rx, cy], [rx - (rx - peak[0]) * 0.3, cy - H * 0.05], [peak[0] + (rx - peak[0]) * 0.25, cy + H * 0.04], [peak[0] - (peak[0] - lx) * 0.3, cy - H * 0.03], [lx + (peak[0] - lx) * 0.25, cy + H * 0.035], [lx, cy]);
  }
  const pin = (q: Pt) => (q === peak || q[1] >= baseY - 0.01);
  const shake = (pts: Pt[]): Pt[] => pts.map((q) => (pin(q) ? q : [q[0] + wob(p.handDrawn * 1.5), q[1] + wob(p.handDrawn * 1.2)] as Pt));
  const outerPts = shake(outerRaw), seamPts = shake(seamRaw), capPts = shake(capRaw);
  const all = [...outerPts, ...seamPts, ...capPts];
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const pad = p.outline / 2 + 2;
  const vx = Math.min(...xs) - pad, vy = Math.min(...ys) - pad;
  const vw = Math.max(...xs) - vx + pad, vh = Math.max(...ys) - vy + pad;
  const r1 = (v: number) => Math.round(v * 100) / 100;
  return { outerPts, seamPts, capPts, outer: toPath(outerPts), seam: toPath(seamPts), cap: capPts.length ? toPath(capPts) : "", viewBox: `${r1(vx)} ${r1(vy)} ${r1(vw)} ${r1(vh)}`, ratio: vw / vh };
}

/** The BoltSpec the boil cards and the wordmark render — the cap rides on each frame. */
export function mountainSpec(p: MountainParams, colours?: { red?: string; blue?: string; cream?: string }): BoltSpec {
  const g = forgeMountain(p);
  const frames = makeBoil(g.outerPts, g.seamPts, p.outline);
  const capFrames: BoilFrame[] = g.capPts.length ? makeBoil(g.capPts, g.capPts, p.outline) : [];
  return {
    frames: frames.map((f, i) => ({ ...f, ...(capFrames[i] ? { cap: capFrames[i].outer } : {}) })),
    viewBox: g.viewBox, ratio: g.ratio,
    red: colours?.red ?? "#C62828", blue: colours?.blue ?? "#1565C0", cream: colours?.cream ?? "#FFFFFF",
  };
}

export function mountainExport(p: MountainParams): { mode: "mountain"; OUTER: string; SHADE: string; CAP: string; VIEWBOX: string } {
  const g = forgeMountain(p);
  return { mode: "mountain", OUTER: g.outer, SHADE: g.seam, CAP: g.cap, VIEWBOX: g.viewBox };
}
