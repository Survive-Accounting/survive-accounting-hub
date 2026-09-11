import { describe, expect, test } from "bun:test";

import { camRect, wordmarkHero } from "./capture/webcam-spots";
import { CONTENT_BOTTOM, SAFE, camDefault, cardPlacement, introWordmarkTop, isColumnKind, isLayout } from "./layout";

describe("the slide templates", () => {
  test("pass 1 is the old deal; pass 2 puts cards at the top, narrower and bigger", () => {
    expect(cardPlacement("pass1", "ceq")).toEqual({ align: "centre" });
    const p2 = cardPlacement("pass2", "ceq");
    expect(p2.align).toBe("top");
    expect(p2.cardW!).toBeLessThan(560);
    expect(p2.scaleMul!).toBeGreaterThan(1);
    // THE WIDTH IS THE PHONE'S, NOT THE TYPE'S (2026-09-12): captions are gone, so the type grew
    // — but the card's width on the phone did not, because past this it runs under the
    // like/share icons. Same drawn width as before (560 × 1.04), bigger letters inside it.
    expect(Math.abs(p2.cardW! * p2.scaleMul! - 560 * 1.04)).toBeLessThan(3);
  });
  test("the camera is bigger now the captions are gone", () => {
    expect(camDefault("pass2", "ceq")).toEqual({ spot: "home", size: 0.32 });
    expect(camDefault("pass2", "intro")).toEqual({ spot: "hero", size: 0.48 });
    // THE INVARIANT: the intro camera's bottom edge sits above the pass-2 wordmark block.
    const W = 1080, H = 1920;
    const intro = camDefault("pass2", "intro");
    const rect = camRect(intro.spot as "hero", W, H, intro.size);
    expect(rect.y + rect.h).toBeLessThan(H * introWordmarkTop("pass2"));
    expect(camDefault("pass1", "intro").spot).toBe("corner");
    for (const k of ["open", "outro", "bolt", "ad"] as const) expect(camDefault("pass2", k).spot).toBe("off");
  });
  test("memorize this / deeper idea / bio get a bigger home camera than every other card slide, in both templates", () => {
    for (const k of ["phrase", "tip", "bio"] as const) {
      expect(camDefault("pass1", k)).toEqual({ spot: "home", size: 0.38 });
      expect(camDefault("pass2", k)).toEqual({ spot: "home", size: 0.38 });
    }
    expect(camDefault("pass2", "phrase").size!).toBeGreaterThan(camDefault("pass2", "ceq").size!);
    // THE INVARIANT: even at this bigger size the camera stays inside the safe area — it sits on
    // the floor of it (camRect's home spot is measured up from .8h).
    const W = 1080, H = 1920;
    const cam = camRect("home", W, H, camDefault("pass2", "tip").size);
    expect(cam.x).toBeGreaterThanOrEqual(W * SAFE.left - 1);
    expect(cam.y + cam.h).toBeLessThanOrEqual(H * 0.8);
    expect(cam.x + cam.w).toBeLessThanOrEqual(W * SAFE.right);
  });
  test("the intro's wordmark drops in pass 2 to leave the camera the top; the column is inside the safe zones", () => {
    expect(introWordmarkTop("pass2")).toBeGreaterThan(introWordmarkTop("pass1"));
    expect(SAFE.top).toBeGreaterThanOrEqual(0.09);
    expect(SAFE.bottom).toBeLessThanOrEqual(0.8);
    expect(SAFE.right).toBeLessThanOrEqual(0.84);
    expect(isLayout("pass2")).toBe(true);
    expect(isLayout("pass9")).toBe(false);
  });

  // 2026-09-12, Lee: "Yes remove [the captions]. And ensure that we're making more use of that
  // space now." The fixed caption rail used to take .61h–.735h out of the middle of every slide.
  test("the content floor is the safe area's own bottom — nothing is reserved above it any more", () => {
    expect(CONTENT_BOTTOM).toBe(SAFE.bottom);
    expect(CONTENT_BOTTOM).toBeGreaterThan(0.735);              // past where the old rail ended
    const W = 1080, H = 1920;
    // The hero wordmark and the home camera both still live inside the area.
    expect(wordmarkHero(W, H).bottom).toBeLessThan(H * CONTENT_BOTTOM);
    expect(camRect("home", W, H, 0.32).y + camRect("home", W, H, 0.32).h).toBeLessThanOrEqual(H * 0.8);
  });
  test("the column kinds are still flush to the safe column's left edge", () => {
    expect(isColumnKind("rubric")).toBe(true);
    expect(isColumnKind("types")).toBe(true);
    expect(isColumnKind("ceq")).toBe(false);
    expect(isColumnKind(undefined)).toBe(false);
  });
});
