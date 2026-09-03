// SCREENSHOT SELECTOR — the geometry. A wrong mapping here crops the wrong part
// of the screen and NOTHING errors, which is exactly why it is tested.
import { describe, expect, test } from "bun:test";

import { containedRect, isUsableSelection, mapSelection, normalizeDrag } from "./screenshot";

describe("the drag box", () => {
  test("top-left to bottom-right", () => {
    expect(normalizeDrag({ x: 10, y: 20 }, { x: 110, y: 80 })).toEqual({ x: 10, y: 20, w: 100, h: 60 });
  });
  test("dragging UP and LEFT is the same box — people select upwards constantly", () => {
    expect(normalizeDrag({ x: 110, y: 80 }, { x: 10, y: 20 })).toEqual({ x: 10, y: 20, w: 100, h: 60 });
  });
  test("a click is not a selection", () => {
    expect(isUsableSelection({ x: 0, y: 0, w: 3, h: 300 })).toBe(false);
    expect(isUsableSelection({ x: 0, y: 0, w: 40, h: 40 })).toBe(true);
  });
});

describe("letterboxing the still", () => {
  test("a wide capture in a tall box gets bars top and bottom", () => {
    const r = containedRect({ w: 1600, h: 900 }, { w: 800, h: 800 });
    expect(r).toEqual({ x: 0, y: 175, w: 800, h: 450 });
  });
  test("a tall capture in a wide box gets bars left and right", () => {
    const r = containedRect({ w: 900, h: 1600 }, { w: 800, h: 800 });
    expect(r).toEqual({ x: 175, y: 0, w: 450, h: 800 });
  });
  test("a degenerate box is empty rather than NaN", () => {
    expect(containedRect({ w: 0, h: 0 }, { w: 100, h: 100 })).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});

describe("screen coordinates → captured pixels", () => {
  // A 1600x900 capture shown at half size, centred in a 1000x600 overlay.
  const displayed = { x: 100, y: 75, w: 800, h: 450 };
  const natural = { w: 1600, h: 900 };

  test("a box in the middle maps at the display scale", () => {
    expect(mapSelection({ x: 300, y: 175, w: 200, h: 100 }, displayed, natural))
      .toEqual({ x: 400, y: 200, w: 400, h: 200 });
  });
  test("the whole image maps to the whole image", () => {
    expect(mapSelection(displayed, displayed, natural)).toEqual({ x: 0, y: 0, w: 1600, h: 900 });
  });
  test("a drag that runs off the letterbox crops to the edge, never negative", () => {
    const r = mapSelection({ x: -500, y: -500, w: 700, h: 700 }, displayed, natural);
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
    expect(r.w).toBe(200);
    expect(r.h).toBe(250);
  });
  test("a zero-size display is empty rather than dividing by zero", () => {
    expect(mapSelection({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 0, h: 0 }, natural))
      .toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });
});
