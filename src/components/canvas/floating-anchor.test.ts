import { describe, expect, it } from "bun:test";

import { borderIntersection, centerOf, floatingGeometry, isPlainHandle, sideOf, type Rect } from "./floating-anchor";

const A: Rect = { x: 0, y: 0, width: 100, height: 100 }; // center (50,50)

describe("centerOf", () => {
  it("returns the rect center", () => {
    expect(centerOf(A)).toEqual({ x: 50, y: 50 });
  });
});

describe("borderIntersection", () => {
  it("target directly to the right → exits the right border at mid-height", () => {
    const target: Rect = { x: 300, y: 0, width: 100, height: 100 }; // center (350,50)
    expect(borderIntersection(A, target)).toEqual({ x: 100, y: 50 });
  });

  it("target directly below → exits the bottom border at mid-width", () => {
    const target: Rect = { x: 0, y: 300, width: 100, height: 100 }; // center (50,350)
    expect(borderIntersection(A, target)).toEqual({ x: 50, y: 100 });
  });

  it("target up-and-left → exits toward the top-left corner", () => {
    const target: Rect = { x: -300, y: -300, width: 100, height: 100 }; // center (-250,-250)
    // ray goes at 45°, hits a corner
    expect(borderIntersection(A, target)).toEqual({ x: 0, y: 0 });
  });

  it("point lands ON the perimeter (invariant)", () => {
    const target: Rect = { x: 260, y: 120, width: 100, height: 100 };
    const p = borderIntersection(A, target);
    const onX = p.x === A.x || p.x === A.x + A.width;
    const onY = p.y === A.y || p.y === A.y + A.height;
    expect(onX || onY).toBe(true);
  });

  it("degenerate overlapping centers → returns the center", () => {
    expect(borderIntersection(A, { ...A })).toEqual({ x: 50, y: 50 });
  });
});

describe("sideOf", () => {
  it("classifies each border", () => {
    expect(sideOf({ x: 0, y: 50 }, A)).toBe("left");
    expect(sideOf({ x: 100, y: 50 }, A)).toBe("right");
    expect(sideOf({ x: 50, y: 0 }, A)).toBe("top");
    expect(sideOf({ x: 50, y: 100 }, A)).toBe("bottom");
  });
});

describe("floatingGeometry", () => {
  it("two side-by-side nodes face each other (right↔left)", () => {
    const target: Rect = { x: 300, y: 0, width: 100, height: 100 };
    const g = floatingGeometry(A, target);
    expect(g.sourceSide).toBe("right");
    expect(g.targetSide).toBe("left");
    expect(g.sx).toBe(100);
    expect(g.tx).toBe(300);
  });
});

describe("isPlainHandle", () => {
  it("card dots and null are plain", () => {
    for (const h of [null, undefined, "t", "b", "l", "r"]) expect(isPlainHandle(h)).toBe(true);
  });
  it("semantic handles are not plain", () => {
    for (const h of ["ln:x:l", "mn:x:text", "anc:sub1"]) expect(isPlainHandle(h)).toBe(false);
  });
});
