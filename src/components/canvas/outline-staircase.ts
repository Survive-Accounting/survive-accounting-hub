// COURSE OUTLINE — the STAIRCASE (pure). Lay a course's lessons out as steps that
// climb left→right (the visual argument: you climb, you summit). Positions are
// returned as CENTRE fractions (0..1, top-left origin) so the card scales them to
// any size. The camera safe-corner (top-left) and the watermark corner
// (bottom-right) are kept clear; if the diagonal can't seat the steps legibly it
// falls back to a grid.

export type StairOrigin = "bl" | "br" | "tl" | "tr";
export type OutlineLayout = "staircase" | "grid";

export interface StepPos { x: number; y: number } // centre, 0..1 (top-left origin)

export interface StairOpts {
  origin?: StairOrigin; // which corner the climb starts from (default bottom-left)
  rise?: number;        // fraction of the height the run climbs (0.2..0.9, "ascent angle")
  stepFrac?: number;    // a step's width as a fraction of the card (legibility floor)
  layout?: OutlineLayout;
}

const MARGIN = 0.08; // keep steps off the very edges (safe area)

/** Steps climbing from `origin` across the card. For "bl" they march right + up. */
export function staircaseSteps(n: number, opts: StairOpts = {}): StepPos[] {
  const origin = opts.origin ?? "bl";
  const rise = clamp(opts.rise ?? 0.6, 0.15, 0.92);
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0.5, y: 0.5 }];

  const span = 1 - 2 * MARGIN;
  const dx = span / (n - 1);
  const dy = (rise * span) / (n - 1);

  // horizontal direction + vertical direction from the origin corner
  const goRight = origin === "bl" || origin === "tl";
  const goUp = origin === "bl" || origin === "br"; // "up" = decreasing y

  const startX = goRight ? MARGIN : 1 - MARGIN;
  const startY = goUp ? 1 - MARGIN : MARGIN;

  const steps: StepPos[] = [];
  for (let i = 0; i < n; i++) {
    const x = startX + (goRight ? 1 : -1) * dx * i;
    const y = startY + (goUp ? -1 : 1) * dy * i;
    steps.push({ x, y });
  }
  return steps;
}

/** Reading-order grid fallback — rows of up to 5, top→bottom. */
export function gridSteps(n: number, cols = 5): StepPos[] {
  if (n <= 0) return [];
  const c = Math.min(cols, n);
  const rows = Math.ceil(n / c);
  const out: StepPos[] = [];
  for (let i = 0; i < n; i++) {
    const col = i % c;
    const row = Math.floor(i / c);
    out.push({ x: MARGIN + ((col + 0.5) / c) * (1 - 2 * MARGIN), y: MARGIN + ((row + 0.5) / rows) * (1 - 2 * MARGIN) });
  }
  return out;
}

/** Does a step at (x,y) of half-size hw/hh land in the camera (top-left) or the
 *  watermark (bottom-right) reserved corner? Zones are ~26%×22% of the card. */
export function inReservedZone(p: StepPos, hw = 0.06, hh = 0.06): boolean {
  const zx = 0.26, zy = 0.22;
  const tl = p.x - hw < zx && p.y - hh < zy;
  const br = p.x + hw > 1 - zx && p.y + hh > 1 - zy;
  return tl || br;
}

/** The final step layout: staircase unless asked for a grid or the diagonal is too
 *  tight to read (steps closer than the legibility floor) — then a grid. Returns the
 *  chosen layout so the card can badge a fallback. */
export function outlineSteps(n: number, opts: StairOpts = {}): { steps: StepPos[]; layout: OutlineLayout } {
  // Default floor is generous so a full course (up to 15 lessons) still reads as a
  // staircase; a caller can force a grid by passing a larger stepFrac (or layout).
  const stepFrac = opts.stepFrac ?? 0.07;
  if (opts.layout === "grid") return { steps: gridSteps(n), layout: "grid" };
  const stair = staircaseSteps(n, opts);
  // horizontal gap between consecutive steps (staircase spreads across full width)
  const gap = n > 1 ? (1 - 2 * MARGIN) / (n - 1) : 1;
  if (gap < stepFrac * 0.72) return { steps: gridSteps(n), layout: "grid" };
  return { steps: stair, layout: "staircase" };
}

function clamp(v: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, v)); }
