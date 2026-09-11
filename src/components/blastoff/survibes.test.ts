// Survibes' clock and queue, pinned to the mockup's milliseconds; the large captions box branch
// of the rail; the countdown label.
import { describe, expect, test } from "bun:test";

import { CAPTION_RAIL, SAFE, SURVIBES_RAIL, camDefault, captionRailRect } from "./layout";
import { isFullFrame, isInsert } from "./plan";
import { SETTLED_LOOK, SURVIBES_T, SURVIBES_COUNTDOWN_S, SURVIBES_PROPS, SURVIBES_PROP_CAM, clockLabel, lookAt, propAt, survibesSteps } from "./survibes";
import { camRect } from "./capture/webcam-spots";

describe("survibes", () => {
  test("the clock: pre → strike + flash → flip → bes → lit → settled", () => {
    expect(lookAt(0)).toEqual({ strike: false, flash: false, flipping: false, tail: "ve", lit: false, settled: false });
    expect(lookAt(699).strike).toBe(false);
    expect(lookAt(700)).toMatchObject({ strike: true, flash: true, flipping: false, tail: "ve" });
    expect(lookAt(800)).toMatchObject({ flipping: true, tail: "ve" });
    expect(lookAt(930)).toMatchObject({ flipping: false, tail: "bes", lit: false });
    expect(lookAt(1000).lit).toBe(true);
    expect(lookAt(1300).flash).toBe(false);
    expect(lookAt(1699).settled).toBe(false);
    expect(lookAt(1700)).toEqual(SETTLED_LOOK);
    expect(lookAt(0, true)).toEqual(SETTLED_LOOK);            // reduced motion / still: settled at once
    // the camera waits for the wordmark to finish gliding up
    expect(SURVIBES_T.camIn).toBe(SURVIBES_T.settled + SURVIBES_T.glide);
  });

  test("the reveal queue: camera only, then Pacioli; at rest none", () => {
    expect(SURVIBES_PROPS[0].title).toBe("Luca Pacioli");
    expect(SURVIBES_PROPS[0].timeline.map((t) => t.when)).toEqual(["3200 BC", "1300s", "1494", "Now"]);
    expect(survibesSteps()).toBe(2);
    expect(propAt(0)).toBeNull();
    expect(propAt(1)?.id).toBe("pacioli");
    expect(propAt(9)?.id).toBe("pacioli");
    expect(propAt(undefined)).toBeNull();
  });

  test("a full-frame insert with the big left camera; the large captions box is the rail on this kind", () => {
    expect(isFullFrame("survibes")).toBe(true);
    expect(isInsert("survibes")).toBe(true);
    expect(camDefault("pass1", "survibes")).toEqual({ spot: "left" });
    const W = 1080, H = 1920;
    // the left box ends above the large captions box and left of the bolt (.59w)
    const cam = camRect("left", W, H);
    expect(cam.y + cam.h).toBeLessThan(H * SURVIBES_RAIL.top);
    expect(cam.x + cam.w).toBeLessThan(W * 0.59);
    // the prop step's small circle sits above the large captions box too
    const small = camRect("free", W, H, undefined, SURVIBES_PROP_CAM);
    expect(small.y + small.h).toBeLessThanOrEqual(H * SURVIBES_RAIL.top);
    const normal = captionRailRect(W, H, false);
    const big = captionRailRect(W, H, false, "survibes");
    expect(big.w).toBeGreaterThan(normal.w);
    expect(big.h).toBeGreaterThan(normal.h);
    expect(big.x).toBe(Math.round(W * SAFE.left));
    expect(big.x + big.w).toBe(Math.round(W * SAFE.right));
    expect(SURVIBES_RAIL.size).toBeGreaterThan(CAPTION_RAIL.size);
    // every other kind is untouched
    expect(captionRailRect(W, H, false, "ceq")).toEqual(normal);
    expect(captionRailRect(W, H, true, "phrase")).toEqual(captionRailRect(W, H, true));
  });

  test("the countdown label", () => {
    expect(clockLabel(SURVIBES_COUNTDOWN_S)).toBe("2:00");
    expect(clockLabel(65)).toBe("1:05");
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(-3)).toBe("0:00");
  });
});
