// THE BOLT ZOOM — pure helpers for the cold-open animation (BoltZoom.tsx).
//
// Lee (2026-09-03): "take our animated bolt and make like an infinite zoom of
// it … the bolt the size of a phone and then the actual video is being zoomed
// in … inverted shape, pointing bottom left to top right … campus + course
// codes scrolling through like a stock ticker, bolt changed colors … a bit over
// the top, but still classy. Survive white wordmark staying FIRM in the middle.
// 'Cram what's on your exam.' … SHOW students I am pursuing this at many many
// campuses. SEC, and beyond." Then: psych at 10%, brand colours drifting, the
// whole Power Four.
//
// An infinite zoom is N copies of the same bolt at geometric scales, each
// growing until it wraps to the smallest — so the loop has no seam. These
// functions decide the geometry and the ticker text; the component only draws.
import { BRAND_BLUE, BRAND_CREAM, BRAND_RED } from "./bolt-boil";
import { GENERATED_SCHOOLS, type GeneratedSchool } from "@/lib/schools.generated";

export const ZOOM = {
  /** copies of the bolt on screen at once */
  layers: 7,
  /** scale ratio between neighbouring layers */
  ratio: 1.6,
  /** the smallest layer's scale — the bolt at rest is ~phone-sized (see BoltZoom) */
  start: 0.09,
  /** one full pass, seconds — a layer's life from smallest to largest */
  period: 7,
} as const;

/** The brand palette the layers cycle through: red, blue, cream, repeat. */
export const ZOOM_COLOURS = [BRAND_RED, BRAND_BLUE, BRAND_CREAM] as const;

export interface ZoomLayer {
  /** 0..layers-1 */
  index: number;
  /** negative animation delay: where in the loop this layer starts */
  delaySec: number;
  colour: string;
  /** a small per-layer twist, scaled by psych (0 → none) */
  tiltDeg: number;
}

/** The layers, staggered evenly through one period so they sit at geometric
 *  spacing. The largest ratio^layers is how far "into" the bolt the loop goes. */
export function zoomLayers(psych = 0.1, n: number = ZOOM.layers): ZoomLayer[] {
  return Array.from({ length: n }, (_, index) => ({
    index,
    delaySec: -((index / n) * ZOOM.period) || 0,
    colour: ZOOM_COLOURS[index % ZOOM_COLOURS.length],
    tiltDeg: Math.round(((index % 2 ? 1 : -1) * 14 * psych) * 10) / 10,
  }));
}

/** The keyframes' scale at each step: start · ratio^j — exponential in time, so
 *  the zoom reads as constant speed instead of slowing as it grows. */
export function zoomScales(n: number = ZOOM.layers): number[] {
  return Array.from({ length: n + 1 }, (_, j) => +(ZOOM.start * Math.pow(ZOOM.ratio, j)).toFixed(4));
}

/** The CSS keyframes for one pass: exponential scale, fade in at the smallest,
 *  fade out at the largest. Percent → transform/opacity. */
export function zoomKeyframes(n: number = ZOOM.layers): string {
  const scales = zoomScales(n);
  return scales.map((s, j) => {
    const pct = Math.round((j / n) * 1000) / 10;
    const opacity = j === 0 ? 0 : j === n ? 0 : 1;
    return `${pct}% { transform: scale(${s}); opacity: ${opacity}; }`;
  }).join("\n");
}

/** THE TICKER — the whole Power Four, SEC first, then Big Ten, Big 12, ACC —
 *  each as "School · COURSE 201" when the campus has a course code. One
 *  string per campus; the component repeats the list to scroll seamlessly. */
export const TICKER_ORDER = ["SEC", "Big Ten", "Big 12", "ACC"] as const;

export function powerFourTicker(schools: readonly GeneratedSchool[] = GENERATED_SCHOOLS): string[] {
  const out: string[] = [];
  for (const conf of TICKER_ORDER) {
    for (const s of schools) {
      if (s.conference !== conf) continue;
      out.push(s.courseCode ? `${s.name} · ${s.courseCode}` : s.name);
    }
  }
  return out;
}

/** Colour drift amplitude in degrees for a psych level (0..1): 10% ≈ ±12°. */
export function driftDegrees(psych: number): number { return Math.round(Math.max(0, Math.min(1, psych)) * 120); }
