// AUTO-SCROLL WHILE DRAGGING — Lee's notes: the scroll-up zone at the top of the spine was a
// millimetre. The band is 140 px, the speed ramps to the edge, and past the edge it clamps.
import { describe, expect, test } from "bun:test";

import { DRAG_ZOOM_AFTER_MS, SCROLL_BAND_PX, SCROLL_MAX_PX, autoScrollDelta, bundleBadge } from "./spine-drag";

describe("autoScrollDelta", () => {
  const top = 0, bottom = 900;
  test("the centre is still", () => {
    expect(autoScrollDelta(450, top, bottom)).toBe(0);
    expect(autoScrollDelta(SCROLL_BAND_PX, top, bottom)).toBe(0);              // the band's inner edge, exactly
    expect(autoScrollDelta(bottom - SCROLL_BAND_PX, top, bottom)).toBe(0);
  });
  test("the top edge scrolls up at full speed; the bottom edge down", () => {
    expect(autoScrollDelta(0, top, bottom)).toBe(-SCROLL_MAX_PX);
    expect(autoScrollDelta(900, top, bottom)).toBe(SCROLL_MAX_PX);
  });
  test("halfway into the band is half speed", () => {
    expect(autoScrollDelta(SCROLL_BAND_PX / 2, top, bottom)).toBe(-SCROLL_MAX_PX / 2);
    expect(autoScrollDelta(bottom - SCROLL_BAND_PX / 2, top, bottom)).toBe(SCROLL_MAX_PX / 2);
  });
  test("outside the viewport clamps to full speed rather than stopping", () => {
    expect(autoScrollDelta(-500, top, bottom)).toBe(-SCROLL_MAX_PX);
    expect(autoScrollDelta(5000, top, bottom)).toBe(SCROLL_MAX_PX);
  });
  test("the band and the speed are parameters", () => {
    expect(autoScrollDelta(50, top, bottom, 100, 10)).toBe(-5);
    expect(autoScrollDelta(850, top, bottom, 100, 10)).toBe(5);
  });
  test("a scroller shorter than two bands still has a still middle", () => {
    expect(autoScrollDelta(100, 0, 200)).toBe(0);
    expect(autoScrollDelta(0, 0, 200)).toBe(-SCROLL_MAX_PX);
  });
  test("a degenerate scroller never scrolls", () => {
    expect(autoScrollDelta(10, 100, 100)).toBe(0);
    expect(autoScrollDelta(10, 0, 100, 0)).toBe(0);
  });
});

describe("the bundle", () => {
  test("the badge counts slides", () => {
    expect(bundleBadge(1)).toBe("1 slide");
    expect(bundleBadge(5)).toBe("5 slides");
  });
  test("the zoom-out waits long enough to be a drag, not a wobble", () => {
    expect(DRAG_ZOOM_AFTER_MS).toBeGreaterThanOrEqual(300);
    expect(DRAG_ZOOM_AFTER_MS).toBeLessThan(1000);
  });
});
