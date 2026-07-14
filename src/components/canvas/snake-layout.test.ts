import { describe, expect, test } from "bun:test";

import { snakeBounds, snakeLayout, snakePerRow } from "./snake-layout";

const OPTS = { originX: 0, originY: 0, colW: 100, rowH: 50, gapX: 10, gapY: 20, perRow: 3 };

describe("snakeLayout (boustrophedon)", () => {
  test("row 0 flows left→right, row 1 right→left, row 2 left→right", () => {
    const c = snakeLayout(7, OPTS);
    // stepX = 110, stepY = 70
    // row 0 (0,1,2) L→R
    expect([c[0].x, c[1].x, c[2].x]).toEqual([0, 110, 220]);
    expect(c[0].y).toBe(0);
    // row 1 (3,4,5) R→L → effCol 2,1,0
    expect([c[3].x, c[4].x, c[5].x]).toEqual([220, 110, 0]);
    expect(c[3].y).toBe(70);
    expect(c[3].reversed).toBe(true);
    // row 2 (6) L→R again
    expect(c[6].x).toBe(0);
    expect(c[6].y).toBe(140);
    expect(c[6].reversed).toBe(false);
  });

  test("the path is monotonic along the snake — consecutive cells are adjacent (never a jump)", () => {
    const c = snakeLayout(9, OPTS);
    for (let i = 1; i < c.length; i++) {
      const dx = Math.abs(c[i].x - c[i - 1].x);
      const dy = Math.abs(c[i].y - c[i - 1].y);
      // either one column step sideways OR a drop to the next row (turn)
      const oneStepSideways = dx === 110 && dy === 0;
      const turnDown = dy === 70 && dx === 0; // turn keeps x (end of row → start of next)
      expect(oneStepSideways || turnDown).toBe(true);
    }
  });

  test("pathOrder = index+1 follows the snake", () => {
    const c = snakeLayout(4, OPTS);
    expect(c.map((x) => x.index)).toEqual([0, 1, 2, 3]);
  });

  test("snakePerRow gives a squarish shape", () => {
    expect(snakePerRow(1)).toBe(1);
    expect(snakePerRow(4)).toBe(2);
    expect(snakePerRow(8)).toBe(3); // 3/3/2
    expect(snakePerRow(9)).toBe(3);
  });

  test("snakeBounds covers the occupied grid", () => {
    const b = snakeBounds(8, OPTS); // 3 per row → 3 cols, 3 rows
    expect(b.rows).toBe(3);
    expect(b.w).toBe(3 * 100 + 2 * 10); // 320
    expect(b.h).toBe(3 * 50 + 2 * 20); // 190
  });

  test("single item sits at the origin", () => {
    const [c] = snakeLayout(1, { ...OPTS, perRow: snakePerRow(1) });
    expect([c.x, c.y]).toEqual([0, 0]);
  });
});
