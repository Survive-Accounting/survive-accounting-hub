import { beforeEach, describe, expect, test } from "bun:test";

import {
  atHome, autoFitAllowed, getFilmCamera, markCameraManual, pinTransform, releaseCamera,
  mirrorViewport, setFilmHome, setPinOn, setPinTarget, subscribeFilmCamera, togglePin, publishFilmViewport, visibleRect, fitRectViewport,
  type PinTarget, type Viewport,
} from "./film-camera";

const HOME: Viewport = { x: 0, y: 0, zoom: 0.5 };
const PIN: PinTarget = { nodeId: "ceq:q1", x: 100, y: 200, scale: 1 };

beforeEach(() => {
  releaseCamera();
  setPinOn(true);
  setPinTarget(null);
  setFilmHome(HOME);
  publishFilmViewport(HOME);
});

describe("camera latch — the auto-fit must never yank a manual shot back", () => {
  test("a fresh camera allows auto-fits", () => {
    expect(autoFitAllowed()).toBe(true);
  });

  test("manual latches until an explicit release", () => {
    markCameraManual();
    expect(autoFitAllowed()).toBe(false);
    // The settle timers / resize / focus handlers all just re-ask; none release.
    markCameraManual();
    expect(autoFitAllowed()).toBe(false);
    releaseCamera();
    expect(autoFitAllowed()).toBe(true);
  });

  test("subscribers hear a real change and not a no-op re-publish", () => {
    let hits = 0;
    const off = subscribeFilmCamera(() => { hits++; });
    markCameraManual();
    expect(hits).toBe(1);
    markCameraManual();          // already manual — no emit
    expect(hits).toBe(1);
    publishFilmViewport(HOME);   // identical viewport — no emit
    expect(hits).toBe(1);
    publishFilmViewport({ x: 10, y: 0, zoom: 0.5 });
    expect(hits).toBe(2);
    off();
  });
});

describe("pin transform", () => {
  test("a card already ON the template at HOME needs no transform at all", () => {
    // node sits exactly where the template says → identity → null (no style).
    expect(pinTransform({ vp: HOME, home: HOME, pin: PIN, nodeX: 100, nodeY: 200, nodeScale: 1 })).toBeNull();
  });

  test("at HOME a hand-placed card is pulled onto the template spot", () => {
    // THE LAYOUT FIX: the question's own geometry says (400,50); the set
    // template says (100,200). Pinned, the template wins — which is what
    // "setting the layout should just work" means on camera.
    const t = pinTransform({ vp: HOME, home: HOME, pin: PIN, nodeX: 400, nodeY: 50, nodeScale: 1 });
    expect(t).not.toBeNull();
    expect(t!.transform).toBe("translate(-300px, 150px) scale(1)");
    expect(t!.transformOrigin).toBe("0 0");
  });

  test("zooming in holds the card at the same screen point and the same size", () => {
    const vp: Viewport = { x: -500, y: -300, zoom: 1.5 }; // Lee pushed into an exhibit
    const t = pinTransform({ vp, home: HOME, pin: PIN, nodeX: 100, nodeY: 200, nodeScale: 1 });
    expect(t).not.toBeNull();
    // Verify by re-deriving the screen position the browser will paint:
    const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t!.transform)!;
    const [dx, dy, k] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const screenX = vp.x + (100 + dx) * vp.zoom;
    const screenY = vp.y + (200 + dy) * vp.zoom;
    const screenScale = vp.zoom * k;
    // …which must equal where the template lands under HOME, at the home scale.
    expect(screenX).toBeCloseTo(HOME.x + PIN.x * HOME.zoom, 6);
    expect(screenY).toBeCloseTo(HOME.y + PIN.y * HOME.zoom, 6);
    expect(screenScale).toBeCloseTo(HOME.zoom, 6);
  });

  test("panning does not move the pinned card", () => {
    const a = pinTransform({ vp: { x: 0, y: 0, zoom: 0.5 }, home: HOME, pin: PIN, nodeX: 0, nodeY: 0, nodeScale: 1 })!;
    const b = pinTransform({ vp: { x: -400, y: 220, zoom: 0.5 }, home: HOME, pin: PIN, nodeX: 0, nodeY: 0, nodeScale: 1 })!;
    const screen = (t: string, vp: Viewport) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(t)!;
      return [vp.x + Number(m[1]) * vp.zoom, vp.y + Number(m[2]) * vp.zoom];
    };
    expect(screen(a.transform, { x: 0, y: 0, zoom: 0.5 }))
      .toEqual(screen(b.transform, { x: -400, y: 220, zoom: 0.5 }));
  });

  test("the template's scale replaces the card's own", () => {
    const pin: PinTarget = { ...PIN, scale: 0.8 };
    const t = pinTransform({ vp: HOME, home: HOME, pin, nodeX: 100, nodeY: 200, nodeScale: 1.6 })!;
    // 0.8 / 1.6 = half size, camera unchanged.
    expect(t.transform).toContain("scale(0.5)");
  });

  test("pulling BACK past the framed shot releases the pin", () => {
    // Zoomed out to bounce around: the card must shrink with the map, not sit
    // on top of it at full size hiding the layout Lee pulled back to look at.
    const out: Viewport = { x: 0, y: 0, zoom: HOME.zoom * 0.6 };
    expect(pinTransform({ vp: out, home: HOME, pin: PIN, nodeX: 400, nodeY: 50, nodeScale: 1 })).toBeNull();
  });

  test("pushing IN keeps the pin", () => {
    const inn: Viewport = { x: 0, y: 0, zoom: HOME.zoom * 1.8 };
    expect(pinTransform({ vp: inn, home: HOME, pin: PIN, nodeX: 400, nodeY: 50, nodeScale: 1 })).not.toBeNull();
  });

  test("exactly at the home shot the pin still governs placement", () => {
    // The boundary belongs to the pinned side — at home the template must win,
    // which is the whole "same spot every question" guarantee.
    expect(pinTransform({ vp: HOME, home: HOME, pin: PIN, nodeX: 400, nodeY: 50, nodeScale: 1 })).not.toBeNull();
  });

  test("a zero/absent zoom can never produce NaN in a style string", () => {
    expect(pinTransform({ vp: { x: 0, y: 0, zoom: 0 }, home: HOME, pin: PIN, nodeX: 0, nodeY: 0, nodeScale: 1 })).toBeNull();
    expect(pinTransform({ vp: HOME, home: { x: 0, y: 0, zoom: 0 }, pin: PIN, nodeX: 0, nodeY: 0, nodeScale: 1 })).toBeNull();
    // A node with scale 0 in its data must fall back to 1, not divide by zero.
    const t = pinTransform({ vp: HOME, home: HOME, pin: PIN, nodeX: 0, nodeY: 0, nodeScale: 0 })!;
    expect(t.transform).not.toContain("NaN");
    expect(t.transform).not.toContain("Infinity");
  });
});

describe("pin targeting — only the active question, never the whole stack", () => {
  test("setPinTarget dedupes by value so a re-seed doesn't churn subscribers", () => {
    let hits = 0;
    const off = subscribeFilmCamera(() => { hits++; });
    setPinTarget({ nodeId: "ceq:q1", x: 1, y: 2, scale: 1 });
    expect(hits).toBe(1);
    setPinTarget({ nodeId: "ceq:q1", x: 1, y: 2, scale: 1 }); // same value, new object
    expect(hits).toBe(1);
    setPinTarget({ nodeId: "ceq:q2", x: 1, y: 2, scale: 1 });
    expect(hits).toBe(2);
    off();
  });

  test("pinning can be switched off and back on", () => {
    expect(getFilmCamera().pinOn).toBe(true);
    expect(togglePin()).toBe(false);
    expect(getFilmCamera().pinOn).toBe(false);
    expect(togglePin()).toBe(true);
  });
});

describe("editor mirror — same SHOT, not the same viewport numbers", () => {
  test("a pane mirroring itself reproduces its own viewport", () => {
    const vp: Viewport = { x: -320, y: -180, zoom: 1.25 };
    const m = mirrorViewport(vp, 1920, 1080, 1920, 1080);
    expect(m.zoom).toBeCloseTo(vp.zoom, 6);
    expect(m.x).toBeCloseTo(vp.x, 6);
    expect(m.y).toBeCloseTo(vp.y, 6);
  });

  test("a half-size editor pane shows the same rect at half the zoom", () => {
    const vp: Viewport = { x: 0, y: 0, zoom: 1 };
    const m = mirrorViewport(vp, 1920, 1080, 960, 540);
    expect(m.zoom).toBeCloseTo(0.5, 6);
  });

  test("the mirrored shot CONTAINS what the capture window sees", () => {
    // A 16:9 capture window mirrored into a squat editor pane: the editor must
    // show at least everything the take shows, never crop it.
    const vp: Viewport = { x: -100, y: -50, zoom: 0.8 };
    const shot = visibleRect(vp, 1920, 1080);
    const m = mirrorViewport(vp, 1920, 1080, 800, 900);
    const seen = visibleRect(m, 800, 900);
    expect(seen.x).toBeLessThanOrEqual(shot.x + 1e-6);
    expect(seen.y).toBeLessThanOrEqual(shot.y + 1e-6);
    expect(seen.x + seen.w).toBeGreaterThanOrEqual(shot.x + shot.w - 1e-6);
    expect(seen.y + seen.h).toBeGreaterThanOrEqual(shot.y + shot.h - 1e-6);
  });

  test("visibleRect and fitRectViewport round-trip", () => {
    const r = { x: 40, y: 90, w: 600, h: 400 };
    const vp = fitRectViewport(r, 1200, 800);
    const back = visibleRect(vp, 1200, 800);
    // Contain fits the tighter axis exactly and overshoots the other, centred.
    expect(back.w / back.h).toBeCloseTo(1200 / 800, 6);
    expect(back.x + back.w / 2).toBeCloseTo(r.x + r.w / 2, 6);
    expect(back.y + back.h / 2).toBeCloseTo(r.y + r.h / 2, 6);
  });

  test("a degenerate pane or rect never yields NaN", () => {
    expect(fitRectViewport({ x: 0, y: 0, w: 0, h: 0 }, 100, 100)).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(fitRectViewport({ x: 0, y: 0, w: 10, h: 10 }, 0, 0)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe("atHome", () => {
  test("true at the home shot, false once pushed", () => {
    expect(atHome(HOME, HOME)).toBe(true);
    expect(atHome({ x: 0, y: 0, zoom: 1.2 }, HOME)).toBe(false);
    expect(atHome({ x: 40, y: 0, zoom: 0.5 }, HOME)).toBe(false);
  });

  test("no home recorded yet reads as home — the badge stays quiet on open", () => {
    expect(atHome(null, null)).toBe(true);
    expect(atHome(HOME, null)).toBe(true);
  });
});
