// THE WORDMARK, AS SVG. SurviveWordmark (brand-cards/bolt-boil.tsx) is an HTML span — "surv", the
// bolt as the "i", "ve" — laid out by the browser's inline flow, which an exported SVG does not
// have. This is the same lockup worked out by hand: the same numbers SurviveWordmark bakes from
// Lee's Logo Lab, applied to measured text widths. brand-kit.test.ts reads bolt-boil.tsx and fails
// if those numbers ever move there without moving here.
import { BOLT_RATIO } from "@/components/canvas/brand";

export const WORDMARK = {
  /** Bolt height as a share of the type size, and the air either side of it. */
  boltScale: 0.8,
  boltGap: 0.03,
  /** The bolt drops below the baseline by this share of the size… */
  drop: 0.13,
  /** …is nudged left by one 96th of it… */
  nudge: -1 / 96,
  /** …and leans 2° about a pivot on its right edge, 51% down. */
  lean: 2,
  pivotY: 0.51,
  /** letter-spacing, em. */
  tracking: -0.01,
} as const;

export interface WordmarkLayout {
  /** Everything is relative to the start of "surv" on the baseline (x 0, y 0). */
  width: number;
  boltX: number; boltY: number; boltW: number; boltH: number;
  veX: number;
  pivotX: number; pivotY: number;
  /** The mark's vertical extent — the bolt is both its highest and its lowest ink. */
  top: number; bottom: number;
}

/** `survW` and `veW` are the measured widths of "surv" and "ve" at `size`, tracking included. */
export function wordmarkLayout(size: number, survW: number, veW: number): WordmarkLayout {
  const boltH = size * WORDMARK.boltScale;
  const boltW = boltH * BOLT_RATIO;
  // The bolt's inline box: margin-left -gap/2, margin-right +gap, bottom edge on the baseline.
  const boxX = survW - size * WORDMARK.boltGap * 0.5;
  const boltX = boxX + size * WORDMARK.nudge;
  const boltY = -boltH + size * WORDMARK.drop;
  const veX = boxX + boltW + size * WORDMARK.boltGap;
  return {
    width: veX + veW,
    boltX, boltY, boltW, boltH, veX,
    pivotX: boltX + boltW, pivotY: boltY + boltH * WORDMARK.pivotY,
    top: boltY, bottom: boltY + boltH,
  };
}
