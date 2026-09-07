import { describe, expect, test } from "bun:test";

import { DEFAULT_FIELD, PHONE, overviewCamera } from "../cluster/cluster-spec";
import { NO_ROAM, ROAM_ZOOM_MAX, ROAM_ZOOM_MIN, clampRoamZoom, effectiveCamera, isHome, panBy, roamTo, toggleOverview, wheelFactor, zoomAbout } from "./field-roam";

const shot = { x: 750, y: 400, zoom: 1 };

describe("the field roam", () => {
  test("no roam is the shot's own camera", () => {
    expect(effectiveCamera(shot, NO_ROAM)).toEqual(shot);
    expect(isHome(NO_ROAM)).toBe(true);
  });
  test("the multiplier is bounded 0.15–4 × the shot's zoom", () => {
    expect(clampRoamZoom(0.01)).toBe(ROAM_ZOOM_MIN);
    expect(clampRoamZoom(9)).toBe(ROAM_ZOOM_MAX);
    const far = zoomAbout(NO_ROAM, shot, 0.001, 540, 960);
    expect(far.zoom).toBe(ROAM_ZOOM_MIN);
    expect(effectiveCamera({ ...shot, zoom: 0.5 }, far).zoom).toBe(0.075);
  });
  test("a wheel tick zooms about the pointer: the field point under it stays put", () => {
    // Pointer at the phone's top-left quarter; the field point there is (750-270, 400-480).
    const px = 270, py = 480;
    const before = effectiveCamera(shot, NO_ROAM);
    const fx = before.x + (px - PHONE.w / 2) / before.zoom, fy = before.y + (py - PHONE.h / 2) / before.zoom;
    const r = zoomAbout(NO_ROAM, shot, 2, px, py);
    expect(r.zoom).toBe(2);
    expect(r.gesture).toBe("wheel");
    const after = effectiveCamera(shot, r);
    expect(after.x + (px - PHONE.w / 2) / after.zoom).toBeCloseTo(fx, 2);
    expect(after.y + (py - PHONE.h / 2) / after.zoom).toBeCloseTo(fy, 2);
    // At the centre a zoom changes nothing but the zoom.
    const c = zoomAbout(NO_ROAM, shot, 2, 540, 960);
    expect(c.dx).toBe(0); expect(c.dy).toBe(0);
  });
  test("a wheel at the bound still marks the gesture and moves nothing", () => {
    const at = { ...NO_ROAM, zoom: ROAM_ZOOM_MAX };
    expect(zoomAbout(at, shot, 2, 100, 100)).toEqual({ ...at, gesture: "wheel" });
  });
  test("d3-zoom's wheel curve, ×10 for a pinch", () => {
    expect(wheelFactor(0)).toBe(1);
    expect(wheelFactor(-100)).toBeGreaterThan(1);
    expect(wheelFactor(100)).toBeLessThan(1);
    expect(wheelFactor(-100, 0, true)).toBeGreaterThan(wheelFactor(-100));
  });
  test("a drag pans against the pointer, scaled by the zoom", () => {
    const r = panBy(NO_ROAM, shot, 100, -50);
    expect(r).toEqual({ dx: -100, dy: 50, zoom: 1, gesture: "drag" });
    const z = panBy({ ...NO_ROAM, zoom: 2 }, shot, 100, 0);
    expect(z.dx).toBe(-50);
  });
  test("O goes to the bird's-eye and back", () => {
    const ov = overviewCamera(DEFAULT_FIELD);
    const r = toggleOverview(NO_ROAM, shot, DEFAULT_FIELD);
    expect(effectiveCamera(shot, r)).toEqual(ov);
    expect(toggleOverview(r, shot, DEFAULT_FIELD)).toEqual(NO_ROAM);
    expect(roamTo(shot, shot)).toEqual({ dx: 0, dy: 0, zoom: 1, gesture: "none" });
  });
});
