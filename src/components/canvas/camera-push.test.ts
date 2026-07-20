import { describe, expect, test } from "bun:test";

import { ambientViewport, fillViewport, PUSH, spotlightPushViewport, type Rect } from "./camera-push";

const frame: Rect = { x: 0, y: 0, w: 1600, h: 900 };
const cw = 1600, ch = 900; // container exactly the frame's aspect → fill zoom 1

describe("fillViewport (frame-fill home shot)", () => {
  test("an aspect-matched frame fills at zoom 1, centered", () => {
    const v = fillViewport(frame, cw, ch);
    expect(v.zoom).toBeCloseTo(1, 5);
    expect(v.x).toBeCloseTo(0, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });
});

describe("spotlightPushViewport (dolly toward a target)", () => {
  const target: Rect = { x: 700, y: 400, w: 200, h: 100 }; // small card near center

  test("regular push zooms IN past the frame-fill shot", () => {
    const home = fillViewport(frame, cw, ch);
    const v = spotlightPushViewport({ frame, target, cw, ch, tier: "regular", isScenery: false });
    expect(v.zoom).toBeGreaterThan(home.zoom);
  });

  test("super pushes closer than regular", () => {
    const reg = spotlightPushViewport({ frame, target, cw, ch, tier: "regular", isScenery: false });
    const sup = spotlightPushViewport({ frame, target, cw, ch, tier: "super", isScenery: false });
    expect(sup.zoom).toBeGreaterThan(reg.zoom);
  });

  test("card frame legibility cap: the whole target stays inside the shot", () => {
    const v = spotlightPushViewport({ frame, target, cw, ch, tier: "super", isScenery: false });
    // target rendered size must fit within the viewport with margin
    expect(target.w * v.zoom).toBeLessThanOrEqual(cw * PUSH.cardFitMargin + 1);
    expect(target.h * v.zoom).toBeLessThanOrEqual(ch * PUSH.cardFitMargin + 1);
  });

  test("scenery frames may push further than card frames", () => {
    const card = spotlightPushViewport({ frame, target, cw, ch, tier: "super", isScenery: false });
    const scenery = spotlightPushViewport({ frame, target, cw, ch, tier: "super", isScenery: true });
    expect(scenery.zoom).toBeGreaterThanOrEqual(card.zoom);
  });

  test("a target that already fills the frame can't push in (no crop)", () => {
    const big: Rect = { x: 0, y: 0, w: 1600, h: 900 };
    const home = fillViewport(frame, cw, ch);
    const v = spotlightPushViewport({ frame, target: big, cw, ch, tier: "super", isScenery: false });
    expect(v.zoom).toBeCloseTo(home.zoom, 5);
  });

  test("never zooms OUT below the frame-fill shot", () => {
    const home = fillViewport(frame, cw, ch);
    const v = spotlightPushViewport({ frame, target, cw, ch, tier: "regular", isScenery: false });
    expect(v.zoom).toBeGreaterThanOrEqual(home.zoom);
  });
});

describe("ambientViewport (Ken-Burns)", () => {
  test("ends slightly zoomed in on the frame center", () => {
    const home = fillViewport(frame, cw, ch);
    const v = ambientViewport(frame, cw, ch);
    expect(v.zoom).toBeGreaterThan(home.zoom);
    expect(v.zoom).toBeCloseTo(home.zoom * PUSH.ambient, 4);
  });
});
