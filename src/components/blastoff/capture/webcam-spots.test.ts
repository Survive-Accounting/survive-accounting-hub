import { describe, expect, test } from "bun:test";

import { avoidCard, camRect, camSpotOf, defaultCamFor, nextCamSpot, overlaps } from "./webcam-spots";

const W = 1080, H = 1920;

describe("the camera's spots", () => {
  test("card slides get the home spot by default; the brand slides, the bolt and the ads film clean", () => {
    for (const k of ["ceq", "phrase", "cheat", "tip", "exhibit", "blank", "bio"] as const) expect(defaultCamFor(k)).toBe("home");
    expect(defaultCamFor("intro")).toBe("corner");                    // the ticker crosses the home spot there
    for (const k of ["open", "outro", "bolt", "ad"] as const) expect(defaultCamFor(k)).toBe("off");
    expect(camSpotOf({ kind: "ceq", cam: "hero" })).toBe("hero");
    expect(camSpotOf({ kind: "open" })).toBe("off");
  });
  test("home sits bottom-left above the caption band; corner top-right under the status bar; hero big and centred", () => {
    const home = camRect("home", W, H);
    expect(home.shape).toBe("circle");
    expect(home.x).toBe(Math.round(W * 0.05));
    expect(home.y + home.h).toBeLessThanOrEqual(H * 0.8);            // above the bottom 20 %
    const corner = camRect("corner", W, H);
    expect(corner.x + corner.w).toBe(W - Math.round(W * 0.05));
    expect(corner.y).toBeGreaterThanOrEqual(H * 0.09);               // under the status bar
    expect(corner.y + corner.h).toBeLessThan(H * 0.3);               // above the like/share rail
    const hero = camRect("hero", W, H);
    expect(hero.shape).toBe("portrait");
    expect(hero.x + hero.w / 2).toBe(Math.round(W / 2));
    expect(hero.w).toBeGreaterThan(W * 0.5);
  });
  test("free takes its own position and size", () => {
    const r = camRect("free", W, H, 0.3, { x: 0.5, y: 0.5 });
    expect(r).toMatchObject({ x: 540, y: 960, w: 324, h: 324 });
  });
  test("a camera over the card shrinks toward its own edge until it clears", () => {
    const cam = camRect("home", W, H);
    const card = { x: 60, y: cam.y - 200, w: 960, h: 300 };            // the card reaches into the camera
    expect(overlaps(cam, card)).toBe(true);
    const out = avoidCard(cam, "home", card);
    expect(out.clear).toBe(true);
    expect(out.scale).toBeLessThan(1);
    expect(out.rect.x).toBe(cam.x);                                    // anchored left…
    expect(out.rect.y + out.rect.h).toBe(cam.y + cam.h);               // …and to the bottom
    expect(overlaps(out.rect, card, 8)).toBe(false);
  });
  test("no card, or no overlap, leaves the camera alone", () => {
    const cam = camRect("corner", W, H);
    expect(avoidCard(cam, "corner", null).scale).toBe(1);
    expect(avoidCard(cam, "corner", { x: 100, y: 900, w: 880, h: 400 }).scale).toBe(1);
  });
  test("B cycles home → corner → hero → top → off → home; free rejoins at corner", () => {
    expect(nextCamSpot("home")).toBe("corner");
    expect(nextCamSpot("corner")).toBe("hero");
    expect(nextCamSpot("hero")).toBe("top");
    expect(nextCamSpot("top")).toBe("off");
    expect(nextCamSpot("off")).toBe("home");
    expect(nextCamSpot("free")).toBe("corner");
  });
});
