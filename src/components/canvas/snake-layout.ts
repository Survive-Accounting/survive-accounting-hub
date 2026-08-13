// SNAKING (boustrophedon) layout — the region path reads as progress: row 0
// flows left→right, row 1 sits below flowing right→left, row 2 left→right, and
// so on, so the overall shape is a legible snake in the minimap. Pure + tested;
// used by BOTH the "Add region scaffold" stamp and the "Tidy layout" reflow so
// they can never drift.

export interface SnakeCell {
  /** flow index along the path (0-based) — pathOrder is index+1. */
  index: number;
  x: number;
  y: number;
  /** the row this cell landed in, and whether that row flows right→left. */
  row: number;
  reversed: boolean;
}

export interface SnakeOpts {
  originX: number;
  originY: number;
  /** uniform column stride (lesson width) and row stride (lesson height). */
  colW: number;
  rowH: number;
  gapX: number;
  gapY: number;
  /** cells per row before the path turns down. */
  perRow: number;
}

/** A pleasant squarish default: ~√n per row, min 2, so 8 lessons snake as 3/3/2
 *  rather than one long line or a tall column. */
export function snakePerRow(count: number): number {
  if (count <= 1) return 1;
  return Math.max(2, Math.ceil(Math.sqrt(count)));
}

/** Place `count` uniform cells along the boustrophedon path. Row 0 L→R, row 1
 *  R→L, … Column stride and row stride are fixed so turns line up cleanly and
 *  nothing overlaps (generous gaps give the long breathing-room paths). */
export function snakeLayout(count: number, opts: SnakeOpts): SnakeCell[] {
  const { originX, originY, colW, rowH, gapX, gapY, perRow } = opts;
  const stepX = colW + gapX;
  const stepY = rowH + gapY;
  const cells: SnakeCell[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const reversed = row % 2 === 1;
    // reversed rows fill from the right so the path turns down, then back
    const effCol = reversed ? perRow - 1 - col : col;
    cells.push({
      index: i,
      x: originX + effCol * stepX,
      y: originY + row * stepY,
      row,
      reversed,
    });
  }
  return cells;
}

/** The pixel span (w×h) the snake occupies — for centering under the header /
 *  fitting the camera. */
export function snakeBounds(count: number, opts: SnakeOpts): { w: number; h: number; rows: number } {
  const { colW, rowH, gapX, gapY, perRow } = opts;
  const cols = Math.min(count, perRow);
  const rows = Math.max(1, Math.ceil(count / perRow));
  return {
    w: cols * colW + (cols - 1) * gapX,
    h: rows * rowH + (rows - 1) * gapY,
    rows,
  };
}
