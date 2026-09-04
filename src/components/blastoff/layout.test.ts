import { describe, expect, test } from "bun:test";

import { SAFE, camDefault, cardPlacement, introWordmarkTop, isLayout } from "./layout";

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
  test("the camera: bigger in pass 2, above the wordmark on the intro, off on the brand slides", () => {
    expect(camDefault("pass2", "ceq")).toEqual({ spot: "home", size: 0.3 });
    expect(camDefault("pass2", "intro")).toEqual({ spot: "top", size: 0.34 });
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
});
