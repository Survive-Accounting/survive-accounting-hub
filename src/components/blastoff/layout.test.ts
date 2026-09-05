import { describe, expect, test } from "bun:test";

import { camRect, wordmarkHero } from "./capture/webcam-spots";
import { CAPTION_RAIL, SAFE, camDefault, captionLineChars, captionRailClear, captionRailRect, cardPlacement, introWordmarkTop, isLayout } from "./layout";

describe("the slide templates", () => {
  test("pass 1 is the old deal; pass 2 puts cards at the top, narrower and bigger", () => {
    expect(cardPlacement("pass1", "ceq")).toEqual({ align: "centre" });
    const p2 = cardPlacement("pass2", "ceq");
    expect(p2.align).toBe("top");
    expect(p2.cardW!).toBeLessThan(560);
    expect(p2.scaleMul!).toBeGreaterThan(1);
    // the same width on the phone as before (560 × 1.04), so it never leaves the column
    expect(p2.cardW! * p2.scaleMul!).toBeCloseTo(560 * 1.04, 0);
  });
  test("the camera: bigger in pass 2, a rectangular intro above the wordmark, off on the brand slides", () => {
    expect(camDefault("pass2", "ceq")).toEqual({ spot: "home", size: 0.28 });
    expect(camDefault("pass2", "intro")).toEqual({ spot: "hero", size: 0.48 });
    // THE INVARIANT: the intro camera's bottom edge sits above the pass-2 wordmark block.
    const W = 1080, H = 1920;
    const intro = camDefault("pass2", "intro");
    const rect = camRect(intro.spot as "hero", W, H, intro.size);
    expect(rect.y + rect.h).toBeLessThan(H * introWordmarkTop("pass2"));
    expect(camDefault("pass1", "intro").spot).toBe("corner");
    for (const k of ["open", "outro", "bolt", "ad"] as const) expect(camDefault("pass2", k).spot).toBe("off");
  });
  test("the intro's wordmark drops in pass 2 to leave the camera the top; the column is inside the safe zones", () => {
    expect(introWordmarkTop("pass2")).toBeGreaterThan(introWordmarkTop("pass1"));
    expect(SAFE.top).toBeGreaterThanOrEqual(0.09);
    expect(SAFE.bottom).toBeLessThanOrEqual(0.8);
    expect(SAFE.right).toBeLessThanOrEqual(0.84);
    expect(isLayout("pass2")).toBe(true);
    expect(isLayout("pass9")).toBe(false);
  });
  test("the caption rail: fixed, right of the home camera, under the hero wordmark, above the caption zone", () => {
    const W = 1080, H = 1920;
    const home = camDefault("pass2", "ceq");
    const cam = camRect("home", W, H, home.size);
    const rail = captionRailRect(W, H);
    expect(rail.x).toBeGreaterThanOrEqual(cam.x + cam.w);                 // right of the home camera
    expect(rail.y).toBeGreaterThanOrEqual(wordmarkHero(W, H).bottom);     // under the hero wordmark
    expect(rail.y + rail.h).toBeLessThanOrEqual(H * SAFE.bottom);        // above the platform caption zone
    expect(rail.x + rail.w).toBeLessThanOrEqual(W * SAFE.right);         // inside the like/share rail
    expect(captionRailRect(W, H, true).x).toBeLessThan(rail.x);          // no camera: wider
    expect(CAPTION_RAIL.maxLines).toBe(2);
    // ~3–7 words per card at this size
    const chars = captionLineChars(rail.w, H * CAPTION_RAIL.size);
    expect(chars).toBeGreaterThanOrEqual(10);
    expect(chars).toBeLessThanOrEqual(16);
    // the readout
    expect(captionRailClear(rail, null, cam)).toBe("clear");
    expect(captionRailClear(rail, { x: 0, y: rail.y - 50, w: W, h: 100 }, null)).toBe("card");
    expect(captionRailClear(rail, null, { ...cam, x: rail.x + 10 })).toBe("camera");
    // a placed illustration dragged onto the rail reads "illustration", not "card" — even
    // when the card+picture union handed in as `card` also overlaps (PhoneFrame's cardBox is
    // that union; art must win so the readout names the actual culprit)
    const onRail = { x: 0, y: rail.y - 50, w: W, h: 100 };
    expect(captionRailClear(rail, null, null, onRail)).toBe("illustration");
    expect(captionRailClear(rail, onRail, null, onRail)).toBe("illustration");
  });
});
