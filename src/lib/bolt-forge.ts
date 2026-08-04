// BOLT FORGE — the parametric mechanics behind the Survive lightning bolt, exposed
// as knobs so the shape can be dialed in the Logo Lab workshop (and, once chosen,
// baked into the brand module). Deterministic given `seed` (a seeded PRNG, NOT
// Math.random), so it is SSR-safe and reproducible.
//
// Construction: a leaning centreline; two saw-tooth flanks (RIGHT + LEFT), each
// top→bottom with the left flank always left of the right flank so the body never
// pinches; teeth of varying length (jitter + downward taper, biggest = the upper-
// right shoulder); a clean taper to the bottom tip. The red/blue split runs down an
// internal lightning SEAM. Every number here is a knob in the workshop.

export type BoltParams = {
  teeth: number;      // teeth per side (3–8)
  lean: number;       // rightward lean — how far the bottom drifts left (0–0.6)
  coreWidth: number;  // half-width of the solid core
  toothLen: number;   // base tooth length (jut beyond the core)
  taper: number;      // 0–1: teeth shrink toward the bottom
  shoulder: number;   // extra length on the top-right shoulder tooth
  notch: number;      // how deep the notches cut into the core (sharpness)
  drop: number;       // 0–1: barb tip sits low in its cell → downward barbs
  jitter: number;     // 0–1: hand-drawn irregularity in tooth length + position
  seed: number;       // PRNG seed for the jitter (reshuffle to explore)
  tail: number;       // extra length of the bottom taper below the last tooth
  seamAmp: number;    // internal seam zigzag amplitude (red/blue divider)
  outline: number;    // white keyline stroke width (padding only; drawn by caller)
};

export const DEFAULT_BOLT: BoltParams = {
  teeth: 5, lean: 0.24, coreWidth: 13, toothLen: 15, taper: 0.55, shoulder: 6,
  notch: 9, drop: 0.72, jitter: 0.28, seed: 7, tail: 8, seamAmp: 6, outline: 8,
};

/** Named starting points for the workshop. */
export const BOLT_STYLE_PRESETS: { id: string; name: string; params: Partial<BoltParams> }[] = [
  { id: "dead", name: "Classic Dead", params: { teeth: 5, lean: 0.24, toothLen: 15, taper: 0.55, notch: 9, jitter: 0.28, shoulder: 6, drop: 0.72 } },
  { id: "sharp", name: "Sharp / thin", params: { teeth: 6, coreWidth: 10, toothLen: 18, notch: 6, taper: 0.5, jitter: 0.35, drop: 0.8 } },
  { id: "chunky", name: "Chunky", params: { teeth: 4, coreWidth: 17, toothLen: 12, notch: 5, taper: 0.4, jitter: 0.2, drop: 0.65 } },
  { id: "wild", name: "Wild", params: { teeth: 7, lean: 0.32, toothLen: 17, taper: 0.6, notch: 11, jitter: 0.6, drop: 0.75 } },
  { id: "upright", name: "Upright", params: { teeth: 5, lean: 0.08, toothLen: 15, taper: 0.5, jitter: 0.22 } },
];

export type BoltGeom = { outer: string; seam: string; viewBox: string; ratio: number };

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
  const TY = 4, coreBottom = 140, topX = 62;
  const cx = (y: number) => topX - p.lean * (y - TY); // lean: bottom drifts left
  const y0 = TY + 6, y1 = coreBottom - 4, span = y1 - y0, cell = span / teeth;
  const cw = Math.max(4, p.coreWidth);
  const notch = Math.min(Math.max(0, p.notch), cw - 1); // never past the centre → no pinch

  function edge(sign: 1 | -1, phase: number): Pt[] {
    const pts: Pt[] = [];
    for (let k = 0; k < teeth; k++) {
      const shrink = 1 - p.taper * (k / Math.max(1, teeth - 1));
      const jLen = 1 + (rnd() * 2 - 1) * p.jitter * 0.7;
      let len = p.toothLen * shrink * jLen;
      if (sign > 0 && k === 0) len += p.shoulder; // upper-right shoulder
      len = Math.max(2, len);
      const jY = (rnd() * 2 - 1) * p.jitter * cell * 0.25;
      const yTip = y0 + cell * (k + p.drop + phase) + jY;
      const yNotch = y0 + cell * (k + 1 + phase);
      pts.push([cx(yTip) + sign * (cw + len), yTip]);
      if (yNotch < y1) pts.push([cx(yNotch) + sign * (cw - notch), yNotch]);
    }
    return pts;
  }

  const bottomY = coreBottom + Math.max(0, p.tail);
  const tipT: Pt = [topX, TY], tipB: Pt = [cx(bottomY), bottomY];
  const RIGHT: Pt[] = [tipT, ...edge(1, 0), tipB];
  const LEFT: Pt[] = [tipT, ...edge(-1, -0.5), tipB];

  const SEAM: Pt[] = [tipT];
  const n = teeth * 2;
  for (let k = 1; k < n; k++) {
    const y = y0 + (span * k) / n;
    SEAM.push([cx(y) + (k % 2 ? p.seamAmp : -p.seamAmp), y]);
  }
  SEAM.push(tipB);

  const outer = toPath([...RIGHT, ...rev(LEFT).slice(1, -1)]);
  const seam = toPath([...SEAM, ...rev(RIGHT).slice(1, -1)]);

  const all = [...RIGHT, ...LEFT, ...SEAM];
  const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
  const pad = p.outline / 2 + 2;
  const vx = Math.min(...xs) - pad, vy = Math.min(...ys) - pad;
  const w = Math.max(...xs) - vx + pad, h = Math.max(...ys) - vy + pad;
  return { outer, seam, viewBox: `${r1(vx)} ${r1(vy)} ${r1(w)} ${r1(h)}`, ratio: w / h };
}
