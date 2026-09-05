import { describe, expect, test } from "bun:test";

import { ANIMATION_PRESETS, DEFAULT_STYLE_ID, ILLUSTRATION_STYLES, composeIllustrationPrompt, emptyIllustration, illustrationStyle, isStaleIllustration } from "./illustration";

describe("the illustration registry", () => {
  test("the house default is Survive Watercolor v1, white ground, house palette", () => {
    const s = illustrationStyle(null);
    expect(s.id).toBe(DEFAULT_STYLE_ID);
    expect(s.id).toBe("survive-watercolor");
    expect(s.version).toBe(1);
    expect(s.controls.background_color.rgb).toEqual([255, 255, 255]);
    expect(s.controls.colors.length).toBeGreaterThanOrEqual(2);
    expect(illustrationStyle("nope").id).toBe(DEFAULT_STYLE_ID);
  });
  test("every preset's colour weights stay within what Recraft accepts (total ≤ 1) — a real bug: v2 of the old preset shipped at 1.5 and every generation failed", () => {
    for (const style of Object.values(ILLUSTRATION_STYLES)) {
      const total = style.controls.colors.reduce((sum, c) => sum + (c.weight ?? 0), 0);
      expect(total).toBeLessThanOrEqual(1);
    }
  });
  test("the legacy preset still resolves — old illustrations keep rendering with the look they were made with", () => {
    const legacy = illustrationStyle("survive-dreamstate");
    expect(legacy.id).toBe("survive-dreamstate");
    expect(legacy.version).toBe(2);
  });
  test("the prompt is subject-first, preset around it, intent last", () => {
    const s = ILLUSTRATION_STYLES[DEFAULT_STYLE_ID];
    const p = composeIllustrationPrompt(s, "a nervous investor holding a magnifying glass.", "External users judge the company from outside.");
    expect(p.startsWith(s.promptPrefix + "a nervous investor holding a magnifying glass" + s.promptSuffix)).toBe(true);
    expect(p.endsWith("The idea it illustrates: External users judge the company from outside.")).toBe(true);
    expect(composeIllustrationPrompt(s, "a vault", null).endsWith(s.promptSuffix)).toBe(true);
    // the preset carries the constraints so Lee never types them
    expect(s.promptSuffix).toMatch(/no text/i);
    expect(s.promptSuffix).toMatch(/watercolor/i);
    expect(s.promptSuffix).toMatch(/white background/i);
  });
  test("stale = made with an older registry version; never for an ungenerated request", () => {
    expect(isStaleIllustration(emptyIllustration())).toBe(false);
    expect(isStaleIllustration({ ...emptyIllustration(), assetUrl: "x", styleVersion: 1 })).toBe(false);
    expect(isStaleIllustration({ ...emptyIllustration(), assetUrl: "x", styleVersion: 0 })).toBe(true);
    expect(isStaleIllustration(null)).toBe(false);
  });
  test("animation presets include a still option", () => {
    expect(ANIMATION_PRESETS).toContain("none");
    expect(ANIMATION_PRESETS).toContain("boil");
  });
});
