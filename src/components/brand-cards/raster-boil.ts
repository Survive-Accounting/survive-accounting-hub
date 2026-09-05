// THE SURVIVE BOIL, FOR RASTER. The brand bolt boils by pre-baked vector frames swapped by a
// discrete CSS animation (bolt-boil.tsx). A Recraft picture is a bitmap, so the same idea
// becomes a few near-identical TRANSFORM states of one image: a pixel or two of drift and a
// fraction of a degree, deterministic from a seed, state 0 = the untouched picture (the
// raster analogue of pinning the tip and the base). Never a filter, never SMIL — both are
// wall-clock and re-rasterise, and neither can be pinned frame by frame for capture.
//
// Pure, function declarations only (brand-cards sits on the canvas render path).

export interface RasterBoilOptions {
  /** How many drawing states in the flipbook (2–6). */
  states?: number;
  seed?: number;
  /** 0 = still, 1 = the house amount, 2 = twice that. */
  intensity?: number;
  /** Max drift per axis in CSS px at intensity 1. */
  translationAmount?: number;
  /** Max rotation in degrees at intensity 1. */
  rotationAmount?: number;
  /** Device pixel ratio — drift is snapped to whole device pixels so nothing smears. */
  dpr?: number;
}

export interface RasterBoilState { tx: number; ty: number; rot: number }

export const RASTER_BOIL_DEFAULTS = { states: 4, seed: 7, intensity: 1, translationAmount: 1.5, rotationAmount: 0.6, dpr: 1 } as const;

// mulberry32 — the same PRNG the bolt forge uses, so a seed means one thing everywhere.
function prng(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0 || 1;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function snap(v: number, dpr: number): number { return Math.round(v * dpr) / dpr; }

/** The flipbook's states. Deterministic: same options → same numbers, always. */
export function rasterBoilStates(o: RasterBoilOptions = {}): RasterBoilState[] {
  const states = Math.max(2, Math.min(6, Math.round(o.states ?? RASTER_BOIL_DEFAULTS.states)));
  const k = Math.max(0, o.intensity ?? RASTER_BOIL_DEFAULTS.intensity);
  const tMax = (o.translationAmount ?? RASTER_BOIL_DEFAULTS.translationAmount) * k;
  const rMax = (o.rotationAmount ?? RASTER_BOIL_DEFAULTS.rotationAmount) * k;
  const dpr = o.dpr ?? RASTER_BOIL_DEFAULTS.dpr;
  const r = prng(o.seed ?? RASTER_BOIL_DEFAULTS.seed);
  const out: RasterBoilState[] = [{ tx: 0, ty: 0, rot: 0 }];
  for (let i = 1; i < states; i++) {
    out.push({
      tx: snap((r() * 2 - 1) * tMax, dpr),
      ty: snap((r() * 2 - 1) * tMax, dpr),
      rot: Math.round((r() * 2 - 1) * rMax * 100) / 100,
    });
  }
  return out;
}

/** The CSS transform for a state. */
export function rasterBoilTransform(s: RasterBoilState): string {
  return `translate(${s.tx}px, ${s.ty}px) rotate(${s.rot}deg)`;
}

/** The two house cadences, shared with the bolt so everything boils on one clock. */
export const BOIL_SECONDS = { boil: 0.5, "boil-calm": 1.2 } as const;
