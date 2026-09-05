// Guards the mountain recolour: every var the generated SVG reads has a value for any campus
// pair, the lightness steps keep their order (the texture is nothing but that order), and the
// white / cream / silver secondaries that the bolt rule rejects stay readable rather than
// blowing out into the page cream.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { NEAR_WHITE_LIGHTNESS } from "./bolt/bolt-config";
import { lightness, whyTooLight } from "./bolt/bolt-palette";
import {
  CORE_MIN_SHARE,
  MOUNTAIN_CEILING_LIGHTNESS,
  MOUNTAIN_FLOOR_LIGHTNESS,
  MOUNTAIN_GEOMETRY,
  MOUNTAIN_LIGHT_CEILING_LIGHTNESS,
  MOUNTAIN_STEPS,
  fitFamily,
  mountainPalette,
  softClamp,
} from "./mountain-palette";

const SVG = readFileSync(resolve(import.meta.dir, "../../../public/brand/mt-cook.svg"), "utf8");

/** Real school pairs across the awkward corners: brand default, white / near-white / cream /
 *  silver secondaries, a near-black primary, a gold, a deep maroon. */
const PAIRS: [string, string][] = [
  ["#C62828", "#1565C0"], // brand
  ["#FF8200", "#FFFFFF"], // Tennessee
  ["#9E1B32", "#F1F2F3"], // Alabama
  ["#E41C38", "#F5F1E7"], // Nebraska cream
  ["#660000", "#C8C8C8"], // Mississippi State silver
  ["#000000", "#BA0C2F"], // Georgia
  ["#461D7C", "#FDD023"], // LSU (gold must survive)
  ["#500000", "#FFFFFF"], // Texas A&M
];
const LIGHT_SECONDARIES = ["#FFFFFF", "#F1F2F3", "#F5F1E7", "#C8C8C8", "#FDF9D8"];

function family(prefix: "p" | "s", palette: Record<string, string>): string[] {
  return MOUNTAIN_STEPS.filter((s) => s.family === prefix).map((s) => palette[`--mtn-${prefix}-${s.step}`]);
}

describe("generated asset", () => {
  test("every var in the SVG has a value from mountainPalette, with the Mt Cook hex as fallback", () => {
    const names = new Set([...SVG.matchAll(/var\((--mtn-[ps]-\d+),#[0-9A-F]{6}\)/g)].map((m) => m[1]));
    expect(names.size).toBeGreaterThan(10);
    const palette = mountainPalette("#C62828", "#1565C0");
    for (const n of names) expect(palette[n], n).toMatch(/^#[0-9A-F]{6}$/);
    // and nothing in the palette is dead weight
    for (const k of Object.keys(palette)) expect(names.has(k), k).toBe(true);
  });

  test("metadata is stripped, no var is left without a fallback, ≤ 10 steps per family", () => {
    expect(SVG).not.toContain("<metadata");
    expect(SVG).not.toContain("c2pa");
    expect(SVG).not.toMatch(/(?:fill|stop-color):var\(--mtn-[^,)]*\)/);
    for (const f of ["p", "s"] as const) expect(MOUNTAIN_STEPS.filter((s) => s.family === f).length).toBeLessThanOrEqual(10);
    expect(MOUNTAIN_GEOMETRY.peakX).toBeGreaterThan(0.3);
    expect(MOUNTAIN_GEOMETRY.peakX).toBeLessThan(0.7);
  });

  test("offsets rise with step and the median step sits near zero", () => {
    for (const f of ["p", "s"] as const) {
      const steps = MOUNTAIN_STEPS.filter((s) => s.family === f);
      for (let i = 1; i < steps.length; i++) expect(steps[i].offset).toBeGreaterThan(steps[i - 1].offset);
      expect(Math.min(...steps.map((s) => Math.abs(s.offset)))).toBeLessThan(0.05);
      expect(steps.filter((s) => s.share >= CORE_MIN_SHARE).length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("mountainPalette", () => {
  test("preserves step ordering for every pair (numeric strictly, hex non-decreasing)", () => {
    for (const [c1, c2] of PAIRS) {
      const palette = mountainPalette(c1, c2);
      for (const f of ["p", "s"] as const) {
        const steps = MOUNTAIN_STEPS.filter((s) => s.family === f);
        const ls = fitFamily(f === "p" ? c1 : c2, steps);
        for (let i = 1; i < ls.length; i++) expect(ls[i], `${c1}/${c2} ${f}-${i}`).toBeGreaterThan(ls[i - 1]);
        const hexes = family(f, palette).map((h) => lightness(h)!);
        for (let i = 1; i < hexes.length; i++) expect(hexes[i], `${c1}/${c2} ${f}-${i}`).toBeGreaterThanOrEqual(hexes[i - 1]);
      }
    }
  });

  test("a mid-lightness school colour is painted as-is on its median step, hue intact", () => {
    const palette = mountainPalette("#C62828", "#1565C0");
    const p = MOUNTAIN_STEPS.filter((s) => s.family === "p");
    const median = p.reduce((a, b) => (Math.abs(b.offset) < Math.abs(a.offset) ? b : a));
    expect(lightness(palette[`--mtn-p-${median.step}`])!).toBeCloseTo(lightness("#C62828")! + median.offset, 1);
    // pure red hue: green and blue channels stay equal
    const hex = palette[`--mtn-p-${median.step}`];
    expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
  });

  test("light secondaries stay readable: under the light ceiling, above the floor, still textured", () => {
    for (const c2 of LIGHT_SECONDARIES) {
      expect(whyTooLight(c2), c2).not.toBeNull(); // the bolt rule is the one deciding
      const ls = family("s", mountainPalette("#C62828", c2)).map((h) => lightness(h)!);
      for (const l of ls) {
        expect(l, c2).toBeLessThanOrEqual(MOUNTAIN_LIGHT_CEILING_LIGHTNESS + 0.005);
        expect(l, c2).toBeLessThan(NEAR_WHITE_LIGHTNESS);
        expect(l, c2).toBeGreaterThanOrEqual(MOUNTAIN_FLOOR_LIGHTNESS);
      }
      const core = MOUNTAIN_STEPS.filter((s) => s.family === "s" && s.share >= CORE_MIN_SHARE);
      const coreLs = core.map((s) => ls[s.step]);
      expect(Math.max(...coreLs) - Math.min(...coreLs), c2).toBeGreaterThan(0.1);
    }
  });

  test("a gold secondary is NOT treated as light — it keeps its own lightness", () => {
    expect(whyTooLight("#FDD023")).toBeNull();
    const ls = family("s", mountainPalette("#461D7C", "#FDD023")).map((h) => lightness(h)!);
    const median = MOUNTAIN_STEPS.filter((s) => s.family === "s").reduce((a, b) => (Math.abs(b.offset) < Math.abs(a.offset) ? b : a));
    expect(ls[median.step]).toBeCloseTo(lightness("#FDD023")! + median.offset, 1);
    expect(Math.max(...ls)).toBeLessThanOrEqual(MOUNTAIN_CEILING_LIGHTNESS + 0.005);
  });

  test("every value for every pair stays inside the floor/ceiling band", () => {
    for (const [c1, c2] of PAIRS) {
      for (const v of Object.values(mountainPalette(c1, c2))) {
        const l = lightness(v)!;
        expect(l).toBeGreaterThanOrEqual(MOUNTAIN_FLOOR_LIGHTNESS - 0.005);
        expect(l).toBeLessThanOrEqual(MOUNTAIN_CEILING_LIGHTNESS + 0.005);
      }
    }
  });

  test("softClamp is monotone and never reaches its bounds", () => {
    let prev = -Infinity;
    for (let x = -1; x <= 2; x += 0.01) {
      const y = softClamp(x, 0.05, 0.82);
      expect(y).toBeGreaterThan(prev);
      expect(y).toBeGreaterThan(0.05);
      expect(y).toBeLessThan(0.82);
      prev = y;
    }
    expect(softClamp(0.4, 0.05, 0.82)).toBe(0.4);
  });

  test("a CSS var pair falls back to color-mix around the var, so unresolved input still paints", () => {
    const palette = mountainPalette("var(--bolt-primary)", "var(--bolt-secondary)");
    for (const [k, v] of Object.entries(palette)) {
      expect(v, k).toContain(k.startsWith("--mtn-p") ? "var(--bolt-primary)" : "var(--bolt-secondary)");
    }
    expect(Object.values(palette).some((v) => v.startsWith("color-mix("))).toBe(true);
  });

  test("defaults to the brand pair", () => {
    expect(mountainPalette()).toEqual(mountainPalette("#C62828", "#1565C0"));
  });
});
