// BOLT FORGE — the parametric mechanics behind the Survive lightning bolt, exposed
// as knobs so the shape can be dialed in the Logo Lab workshop (and, once chosen,
// baked into the brand module). Deterministic given `seed` (a seeded PRNG, NOT
// Math.random), so it is SSR-safe and reproducible.
//
// Construction: a leaning (optionally curved) centreline; two saw-tooth flanks
// (RIGHT + LEFT), each top→bottom with the left flank always left of the right flank
// so the body never pinches; teeth of varying length (per-side profile + per-tooth
// sizing + a length envelope with independent top/bottom taper + jitter); a clean
// taper to the bottom tip. The whole silhouette is then scaled by width/height. The
// red/blue split runs down an internal lightning SEAM. Every number here is a knob.

export type BoltParams = {
  // ---- overall size ----
  width: number;      // overall width scale (x), 1 = base
  height: number;     // overall height scale (y), 1 = base
  // ---- spine ----
  teeth: number;      // teeth per side (3–8)
  lean: number;       // rightward lean — how far the bottom drifts left (0–0.6)
  spineCurve: number; // bow the centreline (px); + bows right in the middle
  // ---- core + teeth ----
  coreWidth: number;  // half-width of the solid core
  toothLen: number;   // base tooth length (jut beyond the core)
  taper: number;      // 0–1: legacy linear top→bottom tooth shrink
  topTaper: number;   // 0–1: thin the teeth toward the TOP
  botTaper: number;   // 0–1: thin the teeth toward the BOTTOM
  shoulder: number;   // extra length on the top-right shoulder tooth
  notch: number;      // how deep the notches cut into the core (sharpness)
  drop: number;       // 0–1: barb tip sits low in its cell → downward barbs
  tail: number;       // extra length of the bottom taper below the last tooth
  // ---- independent left / right profile ----
  lenL: number; lenR: number;       // per-side tooth-length multiplier
  taperL?: number; taperR?: number; // per-side taper override (default = taper)
  jagL: number; jagR: number;       // per-side jaggedness (scales jitter + notch)
  // ---- per-tooth sizing (length multipliers, index 0 = top) ----
  toothProfile?: number[];
  // ---- organic randomness (hand-drawn) ----
  jitter: number;     // LENGTH jitter (legacy name kept)
  jitAngle: number;   // tooth-tip vertical (angle) jitter
  jitWidth: number;   // core-width jitter
  handDrawn: number;  // per-vertex wobble on every point (roughness)
  seed: number;       // PRNG seed for all jitter (reshuffle to explore)
  // ---- colour split + keyline ----
  seamAmp: number;    // internal seam zigzag amplitude
  outline: number;    // white keyline stroke width (padding only; drawn by caller)
};

export const DEFAULT_BOLT: BoltParams = {
  width: 1, height: 1,
  teeth: 5, lean: 0.24, spineCurve: 0,
  coreWidth: 13, toothLen: 15, taper: 0.55, topTaper: 0, botTaper: 0,
  shoulder: 6, notch: 9, drop: 0.72, tail: 8,
  lenL: 1, lenR: 1, jagL: 1, jagR: 1,
  jitter: 0.28, jitAngle: 0.07, jitWidth: 0, handDrawn: 0,
  seed: 7, seamAmp: 6, outline: 8,
};

/** Named starting points for the workshop (additive — existing five kept). */
export const BOLT_STYLE_PRESETS: { id: string; name: string; params: Partial<BoltParams> }[] = [
  { id: "dead", name: "Classic Dead", params: { teeth: 5, lean: 0.24, toothLen: 15, taper: 0.55, notch: 9, jitter: 0.28, shoulder: 6, drop: 0.72, spineCurve: 0, jitAngle: 0.07, handDrawn: 0 } },
  { id: "sharp", name: "Sharp / thin", params: { teeth: 6, coreWidth: 10, toothLen: 18, notch: 6, taper: 0.5, jitter: 0.35, drop: 0.8, jagL: 1, jagR: 1, handDrawn: 0 } },
  { id: "chunky", name: "Chunky", params: { teeth: 4, coreWidth: 17, toothLen: 12, notch: 5, taper: 0.4, jitter: 0.2, drop: 0.65, handDrawn: 0.05 } },
  { id: "wild", name: "Wild", params: { teeth: 7, lean: 0.32, toothLen: 17, taper: 0.6, notch: 11, jitter: 0.6, drop: 0.75, jitAngle: 0.3, handDrawn: 0.2 } },
  { id: "upright", name: "Upright", params: { teeth: 5, lean: 0.08, toothLen: 15, taper: 0.5, jitter: 0.22, spineCurve: 0 } },
  // ---- new ----
  { id: "geometric", name: "Geometric", params: { teeth: 5, lean: 0.2, toothLen: 15, taper: 0.5, notch: 8, jitter: 0, jitAngle: 0, jitWidth: 0, handDrawn: 0, spineCurve: 0, topTaper: 0, botTaper: 0 } },
  { id: "vintage", name: "Vintage", params: { teeth: 5, lean: 0.26, toothLen: 15, taper: 0.5, notch: 9, jitter: 0.34, jitAngle: 0.12, handDrawn: 0.22, spineCurve: 4, topTaper: 0.12, botTaper: 0.1, shoulder: 7 } },
  { id: "organic", name: "Organic", params: { teeth: 6, lean: 0.26, toothLen: 16, taper: 0.55, notch: 9, jitter: 0.5, jitAngle: 0.28, jitWidth: 0.3, handDrawn: 0.32, spineCurve: 8, topTaper: 0.15, botTaper: 0.18 } },
  { id: "deadhead", name: "Deadhead", params: { teeth: 6, lean: 0.28, toothLen: 16, taper: 0.6, notch: 11, shoulder: 8, jitter: 0.42, jitAngle: 0.16, handDrawn: 0.16, spineCurve: 5, drop: 0.74, tail: 12 } },
  { id: "handdrawn", name: "Hand Drawn", params: { teeth: 5, lean: 0.24, toothLen: 15, taper: 0.5, notch: 9, jitter: 0.42, jitAngle: 0.5, jitWidth: 0.4, handDrawn: 0.55, spineCurve: 6 } },
  { id: "electric", name: "Electric", params: { teeth: 7, lean: 0.34, coreWidth: 10, toothLen: 18, taper: 0.5, notch: 8, jitter: 0.5, jitAngle: 0.7, jitWidth: 0.25, handDrawn: 0.15, drop: 0.82, spineCurve: -6 } },
];

export type BoltGeom = { outer: string; seam: string; viewBox: string; ratio: number; outerPts: [number, number][]; seamPts: [number, number][] };

type Pt = [number, number];

// mulberry32 — tiny deterministic PRNG (seed in, 0..1 out).
function prng(seed: number) {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const toPath = (pts: Pt[]) => pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${r1(x)} ${r1(y)}`).join(" ") + " Z";
const rev = (a: Pt[]) => [...a].reverse();

/** Build the bolt geometry (paths + viewBox + width:height ratio) from params. */
export function forgeBolt(pIn: BoltParams): BoltGeom {
  const p = { ...DEFAULT_BOLT, ...pIn };
  const teeth = Math.max(2, Math.round(p.teeth));
  const rnd = prng(p.seed);
  // rnd() ONLY when amp !== 0, so neutral new knobs don't perturb the PRNG stream
  // (keeps the default shape identical as controls are added).
  const wob = (amp: number) => (amp === 0 ? 0 : (rnd() * 2 - 1) * amp);
  const TY = 4, coreBottom = 140, H = coreBottom - TY, topX = 62;
  const cx = (y: number) => {
    const t = (y - TY) / H;
    return topX - p.lean * (y - TY) + (p.spineCurve ?? 0) * 4 * t * (1 - t); // lean + bow
  };
  const y0 = TY + 6, y1 = coreBottom - 4, span = y1 - y0, cell = span / teeth;
  const prof = p.toothProfile ?? [];
  const envelope = (t: number) => Math.max(0.12, 1 - (p.topTaper ?? 0) * (1 - t) ** 2 - (p.botTaper ?? 0) * t ** 2);

  function edge(sign: 1 | -1, phase: number): Pt[] {
    const pts: Pt[] = [];
    const lenMul = sign > 0 ? (p.lenR ?? 1) : (p.lenL ?? 1);
    const taperS = sign > 0 ? (p.taperR ?? p.taper) : (p.taperL ?? p.taper);
    const jag = sign > 0 ? (p.jagR ?? 1) : (p.jagL ?? 1);
    const cw = Math.max(4, p.coreWidth);
    const notch = Math.min(Math.max(0, p.notch * jag), cw - 1);
    for (let k = 0; k < teeth; k++) {
      const t = (k + 0.5) / teeth;
      const shrink = (1 - taperS * (k / Math.max(1, teeth - 1))) * envelope(t);
      const jL = 1 + wob(p.jitter * jag * 0.7);
      let len = p.toothLen * lenMul * (prof[k] ?? 1) * shrink * jL;
      if (sign > 0 && k === 0) len += p.shoulder;
      len = Math.max(1.5, len);
      const cwJit = cw + wob((p.jitWidth ?? 0) * cw * 0.5);
      const yTip = y0 + cell * (k + p.drop + phase) + wob((p.jitAngle ?? 0.07) * cell);
      const yNotch = y0 + cell * (k + 1 + phase);
      pts.push([cx(yTip) + sign * (cwJit + len) + wob((p.handDrawn ?? 0) * 2.2), yTip + wob((p.handDrawn ?? 0) * 1.6)]);
      if (yNotch < y1) pts.push([cx(yNotch) + sign * (cw - notch) + wob((p.handDrawn ?? 0) * 2.2), yNotch + wob((p.handDrawn ?? 0) * 1.6)]);
    }
    return pts;
  }

  const bottomY = coreBottom + Math.max(0, p.tail);
  const tipT: Pt = [topX, TY], tipB: Pt = [cx(bottomY), bottomY];
  let RIGHT: Pt[] = [tipT, ...edge(1, 0), tipB];
  let LEFT: Pt[] = [tipT, ...edge(-1, -0.5), tipB];

  const SEAM0: Pt[] = [tipT];
  const n = teeth * 2;
  for (let k = 1; k < n; k++) {
    const y = y0 + (span * k) / n;
    SEAM0.push([cx(y) + (k % 2 ? p.seamAmp : -p.seamAmp), y]);
  }
  SEAM0.push(tipB);
  let SEAM = SEAM0;

  // overall width/height scaling — about the top tip (x) and top (y).
  const wsc = p.width ?? 1, hsc = p.height ?? 1;
  if (wsc !== 1 || hsc !== 1) {
    const sc = ([x, y]: Pt): Pt => [topX + (x - topX) * wsc, TY + (y - TY) * hsc];
    RIGHT = RIGHT.map(sc); LEFT = LEFT.map(sc); SEAM = SEAM.map(sc);
  }

  // The explicit ordered vertex rings — the editor's source of truth. The outer ring
  // is the silhouette (right flank down, left flank up); the seam ring is the red/blue
  // divider. Paths are derived from these, so a manual/assist edit of the points flows
  // straight through to render + export.
  const outerPts: Pt[] = [...RIGHT, ...rev(LEFT).slice(1, -1)];
  const seamPts: Pt[] = [...SEAM, ...rev(RIGHT).slice(1, -1)];
  const outer = toPath(outerPts);
  const seam = toPath(seamPts);

  const all = [...RIGHT, ...LEFT, ...SEAM];
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const pad = p.outline / 2 + 2;
  const vx = Math.min(...xs) - pad, vy = Math.min(...ys) - pad;
  const w = Math.max(...xs) - vx + pad, h = Math.max(...ys) - vy + pad;
  return { outer, seam, viewBox: `${r1(vx)} ${r1(vy)} ${r1(w)} ${r1(h)}`, ratio: w / h, outerPts, seamPts };
}
