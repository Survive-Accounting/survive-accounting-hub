// The cold open's geometry and the campus mix — what makes the loop seamless
// and the campus story true and varied.
import { describe, expect, test } from "bun:test";

import { GENERATED_SCHOOLS } from "@/lib/schools.generated";
import { POWER_FOUR, ZOOM, ZOOM_VARIANTS, campusMix, campusText, driftDegrees, isZoomVariant, seededShuffle, zoomKeyframes, zoomLayers, zoomScales } from "./bolt-zoom";

describe("zoomLayers — evenly staggered through one period", () => {
  test("delays cover the period with no two layers at the same point", () => {
    const layers = zoomLayers(0.1);
    expect(layers).toHaveLength(ZOOM.layers);
    const delays = layers.map((l) => l.delaySec);
    expect(new Set(delays).size).toBe(ZOOM.layers);
    expect(Math.min(...delays)).toBeGreaterThan(-ZOOM.period);
    expect(Math.max(...delays)).toBe(0);
  });
  test("psych 0 means no tilt; 0.1 tilts a little", () => {
    expect(zoomLayers(0).every((x) => x.tiltDeg === 0)).toBe(true);
    expect(zoomLayers(0.1).some((x) => x.tiltDeg !== 0)).toBe(true);
  });
});

describe("zoomScales / zoomKeyframes — exponential so the zoom reads at constant speed", () => {
  test("each step is the ratio times the last, starting phone-sized", () => {
    const s = zoomScales();
    expect(s[0]).toBe(ZOOM.start);
    for (let j = 1; j < s.length; j++) expect(s[j] / s[j - 1]).toBeCloseTo(ZOOM.ratio, 2);
    expect(s[s.length - 1]).toBeGreaterThan(1); // the largest layer is bigger than the frame — "being zoomed in"
  });
  test("keyframes fade in at the smallest and out at the largest, visible between", () => {
    const k = zoomKeyframes();
    expect(k.startsWith("0% { transform: scale(0.09); opacity: 0; }")).toBe(true);
    expect(k).toContain("100% {");
    expect(k.split("\n").filter((l) => l.includes("opacity: 1")).length).toBe(ZOOM.layers - 1);
  });
});

describe("campusMix — Ole Miss first, then the Power Four dealt across conferences", () => {
  test("leads with Ole Miss, covers every Power Four campus once, nothing outside it", () => {
    const m = campusMix();
    expect(m[0].name).toMatch(/ole miss|mississippi/i);
    expect(m.length).toBe(GENERATED_SCHOOLS.filter((s) => (POWER_FOUR as readonly string[]).includes(s.conference)).length);
    expect(new Set(m.map((x) => x.name)).size).toBe(m.length);
    expect(m.every((x) => (POWER_FOUR as readonly string[]).includes(x.conference))).toBe(true);
  });
  test("no stretch of four is a single conference (round-robin), and the seed is deterministic", () => {
    const m = campusMix();
    for (let i = 1; i + 3 < m.length; i++) expect(new Set(m.slice(i, i + 4).map((x) => x.conference)).size).toBeGreaterThan(1);
    expect(campusMix(GENERATED_SCHOOLS, 3)).toEqual(campusMix(GENERATED_SCHOOLS, 3));
    expect(campusMix(GENERATED_SCHOOLS, 3).map((x) => x.name)).not.toEqual(campusMix(GENERATED_SCHOOLS, 4).map((x) => x.name));
  });
  test("campusText carries the code when there is one", () => {
    expect(campusText({ name: "A", code: "ACCT 200", conference: "SEC" })).toBe("A · ACCT 200");
    expect(campusText({ name: "A", code: null, conference: "SEC" })).toBe("A");
  });
  test("seededShuffle keeps every item and is stable per seed", () => {
    const s = seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 11);
    expect([...s].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(seededShuffle([1, 2, 3, 4, 5, 6, 7, 8], 11)).toEqual(s);
  });
});

describe("variants", () => {
  test("six of them, ids unique, the guard agrees", () => {
    expect(ZOOM_VARIANTS).toHaveLength(6);
    expect(new Set(ZOOM_VARIANTS.map((v) => v.id)).size).toBe(6);
    expect(isZoomVariant("zoom")).toBe(true);
    expect(isZoomVariant("nope")).toBe(false);
  });
});

describe("driftDegrees", () => {
  test("10% psych is a gentle ±12°, clamped 0..1", () => {
    expect(driftDegrees(0.1)).toBe(12);
    expect(driftDegrees(0)).toBe(0);
    expect(driftDegrees(2)).toBe(120);
  });
});
