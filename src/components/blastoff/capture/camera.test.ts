// THE CAPTURE CAMERA — the arithmetic behind the gestures, pinned.
//
// The hook itself is pointer and keyboard plumbing; what can go quietly wrong
// is the maths: a zoom that runs away, a translate that drifts off the pointer
// at zoom ≠ 1, an O that does not come back, a grip override that survives the
// walk to the next slide. Those are pure functions here, so they are tested
// without a DOM.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
  CARD_BASE_ATTR, CARD_SCALE_MAX, CARD_SCALE_MIN, CARD_W_MAX, CARD_W_MIN, EMPTY_SLIDE, PULL_BACK_ZOOM, ZOOM_MAX, ZOOM_MIN,
  clampCardScale, clampCardW, clampZoom, isTypingTarget, slideFor, stageTransform, togglePullBack, wheelZoom,
} from "./camera";

const read = (f: string) => readFileSync(join(import.meta.dir, f), "utf8").split("\r\n").join("\n");

describe("zoom", () => {
  test("the wheel zooms in on a scroll up, out on a scroll down, and never past the clamps", () => {
    expect(wheelZoom(1, -100)).toBeGreaterThan(1);
    expect(wheelZoom(1, 100)).toBeLessThan(1);
    expect(wheelZoom(1, -100_000)).toBe(ZOOM_MAX);
    expect(wheelZoom(1, 100_000)).toBe(ZOOM_MIN);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
  test("a ctrl-wheel (trackpad pinch) moves ten times as far — d3-zoom's rule", () => {
    const plain = Math.log2(wheelZoom(1, -50));
    const pinch = Math.log2(wheelZoom(1, -50, 0, true));
    expect(pinch / plain).toBeCloseTo(10, 5);
  });
  test("line-mode deltas (Firefox) zoom at a comparable pace to pixel deltas", () => {
    // ~25 pixel-mode units per line; both a modest step, both zooming in.
    expect(wheelZoom(1, -3, 1)).toBeCloseTo(wheelZoom(1, -75, 0), 5);
  });
});

describe("O — the pull-back", () => {
  test("pulls back to 0.82 and remembers where it was; O again returns there", () => {
    const out = togglePullBack(1.6, null);
    expect(out).toEqual({ zoom: PULL_BACK_ZOOM, prev: 1.6 });
    expect(togglePullBack(out.zoom, out.prev)).toEqual({ zoom: 1.6, prev: null });
  });
  test("the pull-back sits inside the wheel's range, so it is reachable and returnable", () => {
    expect(PULL_BACK_ZOOM).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(PULL_BACK_ZOOM).toBeLessThan(1);
  });
});

describe("the slide transform", () => {
  test("translate sits BEFORE the scale, in phone pixels (slide units × zoom)", () => {
    // moveBy stores dx / zoom; drawing tx·zoom puts the card back under the pointer.
    const zoom = 2;
    const tx = 30 / zoom, ty = -10 / zoom;
    expect(stageTransform(tx, ty, zoom)).toBe("translate(30px, -10px) scale(2)");
  });
  test("at rest it is the identity", () => {
    expect(stageTransform(0, 0, 1)).toBe("translate(0px, 0px) scale(1)");
  });
  test("a slide's move and grips belong to that slide alone", () => {
    const moved = { ...slideFor(EMPTY_SLIDE, "f1"), tx: 40, ty: 8, cardW: 700, scaleMul: 1.3 };
    expect(slideFor(moved, "f1")).toBe(moved);                      // same frame: build on it
    expect(slideFor(moved, "f2")).toEqual({ id: "f2", tx: 0, ty: 0 }); // next frame: clean
  });
});

describe("the grips", () => {
  test("the scale multiplier and the width clamp to the film surface's range", () => {
    expect(clampCardScale(0.01)).toBe(CARD_SCALE_MIN);
    expect(clampCardScale(9)).toBe(CARD_SCALE_MAX);
    expect(clampCardScale(1.23456)).toBe(1.235);
    expect(clampCardW(10)).toBe(CARD_W_MIN);
    expect(clampCardW(5000)).toBe(CARD_W_MAX);
    expect(clampCardW(640.4)).toBe(640);
  });
  test("the live card publishes the scale it was given, under the attribute the camera reads", () => {
    // A grip hands the camera the card's ABSOLUTE data.scale; the camera turns
    // it back into a multiplier of the given scale by reading this attribute.
    const setCard = read("../SetCard.tsx");
    expect(setCard).toContain(`${CARD_BASE_ATTR}={scale}`);
    expect(setCard).toContain("const s = scale * (scaleMul ?? 1);");
    expect(setCard).toContain("scale: s,");
  });
  test("the override is threaded PhoneFrame → FrameView → every SetCard", () => {
    const phone = read("../PhoneFrame.tsx");
    const view = read("../frame-view.tsx");
    expect(phone).toContain("cardOverride={cardOverride}");
    // every SetCard FrameView renders takes the override — a missing one would
    // be a slide the grips silently cannot touch.
    expect((view.match(/<SetCard\b/g) ?? []).length).toBe((view.match(/\{\.\.\.ov\}/g) ?? []).length);
  });
});

describe("keys", () => {
  test("a field owns its own keystrokes", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({ tagName: "INPUT", isContentEditable: false } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA", isContentEditable: false } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: false } as unknown as EventTarget)).toBe(false);
  });
  test("the camera never takes the keys other handlers own", () => {
    // Space / Shift+Space (walk), ` (reset), Escape (exit), H (chrome),
    // P (prompter), F1 (arrows), Delete (last arrow).
    const src = read("camera.ts");
    const handler = src.slice(src.indexOf("const down = (e: KeyboardEvent) =>"), src.indexOf("const up = (e: KeyboardEvent) =>"));
    for (const k of ['" "', '"Space"', '"Backquote"', '"`"', '"Escape"', '"h"', '"H"', '"p"', '"P"', '"F1"', '"Delete"']) expect(handler).not.toContain(k);
    expect(handler).toContain('e.key === "o" || e.key === "O"');
    expect(handler).toContain('e.code === "Digit0" || e.key === "0"');
  });
  test("module scope declares functions, never arrow callables (the tdz ratchet's rule)", () => {
    const src = read("camera.ts");
    expect([...src.matchAll(/^(?:export )?const ([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)\s*(?::[^=]+)?=>|function\b|async\s*\()/gm)].map((m) => m[1])).toEqual([]);
  });
});
