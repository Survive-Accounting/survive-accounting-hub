// COURSE OUTLINE — the SNAKE (pure), fit-first. Lay a course's lessons as steps
// that flow left→right, wrap and reverse right→left on the next row, wrap again
// (boustrophedon — the region grid's language). AUTO-FIT: the card derives
// steps-per-row from its width + lesson count so EVERYTHING fits inside the card
// without clipping and without shrinking below a legibility floor. Positions are
// CENTRE fractions (0..1, top-left origin) so the card scales them to any size.
//
// SAFE ZONES: steps are confined to a vertical band [Y0..Y1] that clears the
// camera corner (top-left) and the watermark corner (bottom-right) for EVERY
// cell regardless of column — the band is above the watermark and below the
// camera, so neither corner is ever touched. Verified at 1080p for 13 lessons.

export type OutlineLayout = "snake" | "grid";
export interface StepPos { x: number; y: number } // centre, 0..1 (top-left origin)

export interface SnakeOpts {
  /** Manual steps-per-row; falsy = auto-fit from width + count. */
  stepsPerRow?: number | null;
  layout?: OutlineLayout;
  /** Free-through count — bias the row break to land at the gate when it's cheap. */
  gateAt?: number;
}

// Drawing band: full width, but vertically parked BELOW the camera corner and
// ABOVE the watermark corner. Cells are small relative to the row pitch, so
// confining CENTRES here keeps every cell's rect clear of both corners.
const X0 = 0.06, X1 = 0.94;
const Y0 = 0.26, Y1 = 0.80;
const SPAN_X = X1 - X0;
const SPAN_Y = Y1 - Y0;
/** Legibility floors (fraction of card w/h) — a step never packs tighter. */
const MIN_CELL_W = 0.15; // ~288px at 1920 — a 2-line title reads at film zoom
const MIN_ROW_H = 0.11;

const clampInt = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));

/** Steps-per-row: manual override wins; else the widest row that still clears the
 *  legibility floor and fits the count within the vertical band. Optionally biased
 *  so the free/paid gate lands on a row edge (nice-to-have) when it costs ≤1 row. */
export function autoCols(n: number, opts: SnakeOpts = {}): number {
  if (n <= 1) return 1;
  const maxCols = Math.max(1, Math.floor(SPAN_X / MIN_CELL_W));
  const maxRows = Math.max(1, Math.floor(SPAN_Y / MIN_ROW_H));
  if (opts.stepsPerRow && opts.stepsPerRow > 0) return clampInt(Math.min(opts.stepsPerRow, n), 1, maxCols);

  // fewest rows that fit → widest legible row
  let cols = Math.min(n, maxCols);
  while (Math.ceil(n / cols) > maxRows && cols < maxCols) cols++;
  const baseRows = Math.ceil(n / cols);

  // GATE BIAS: prefer a column count that divides the free count (so free lessons
  // fill whole rows and the gate lands at a row edge) — only if it fits and adds
  // at most one row versus the minimal layout.
  const gate = opts.gateAt;
  if (gate && gate > 0 && gate < n) {
    for (let c = maxCols; c >= 2; c--) {
      if (gate % c !== 0) continue;
      const rows = Math.ceil(n / c);
      if (rows <= maxRows && rows <= baseRows + 1 && SPAN_X / c >= MIN_CELL_W) return c;
    }
  }
  return cols;
}

/** Snake centres for `n` steps: even rows march L→R, odd rows R→L. */
export function snakeSteps(n: number, opts: SnakeOpts = {}): StepPos[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: (X0 + X1) / 2, y: (Y0 + Y1) / 2 }];
  const cols = autoCols(n, opts);
  const rows = Math.ceil(n / cols);
  const cw = SPAN_X / cols;
  const rh = SPAN_Y / rows;
  const out: StepPos[] = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const k = i % cols;
    const col = row % 2 === 0 ? k : cols - 1 - k; // boustrophedon
    out.push({ x: X0 + (col + 0.5) * cw, y: Y0 + (row + 0.5) * rh });
  }
  return out;
}

/** Reading-order grid fallback — rows of up to `cols`, top→bottom, same band. */
export function gridSteps(n: number, cols = 5): StepPos[] {
  if (n <= 0) return [];
  const c = Math.min(cols, n);
  const rows = Math.ceil(n / c);
  const cw = SPAN_X / c;
  const rh = SPAN_Y / rows;
  const out: StepPos[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: X0 + ((i % c) + 0.5) * cw, y: Y0 + (Math.floor(i / c) + 0.5) * rh });
  }
  return out;
}

/** Does a step's cell (half-size hw/hh) land in the camera (top-left) or the
 *  watermark (bottom-right) reserved corner? Zones ~28%×24% / 28%×20%. */
export function inReservedZone(p: StepPos, hw = 0.05, hh = 0.045): boolean {
  const camera = p.x - hw < 0.28 && p.y - hh < 0.24;
  const watermark = p.x + hw > 0.72 && p.y + hh > 0.80;
  return camera || watermark;
}

/** The final step layout + the column count (for the caller's gate maths). */
export function outlineSteps(n: number, opts: SnakeOpts = {}): { steps: StepPos[]; layout: OutlineLayout; cols: number } {
  if (opts.layout === "grid") {
    const cols = Math.min(5, Math.max(1, n));
    return { steps: gridSteps(n, cols), layout: "grid", cols };
  }
  const cols = autoCols(n, opts);
  return { steps: snakeSteps(n, opts), layout: "snake", cols };
}

/** Compact GATE marker between the last free step and first paid step: a short
 *  divider perpendicular to the segment joining them, plus a label anchor just
 *  off the paid side. All fractions (0..1). */
export function gateMarker(free: StepPos, paid: StepPos) {
  const mx = (free.x + paid.x) / 2;
  const my = (free.y + paid.y) / 2;
  const dx = paid.x - free.x;
  const dy = paid.y - free.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // unit perpendicular
  const py = dx / len;
  const half = 0.05; // compact — a boundary tick, not a full rule
  return {
    x1: mx + px * half, y1: my + py * half,
    x2: mx - px * half, y2: my - py * half,
    labelX: Math.min(0.9, Math.max(0.1, mx + (dx / len) * 0.03)),
    labelY: Math.min(0.9, Math.max(0.1, my + (dy / len) * 0.03)),
  };
}
