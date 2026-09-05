import { describe, expect, test } from "bun:test";

import { ANIMATION_PRESETS, DEFAULT_STYLE_ID, ILLUSTRATION_STYLES, composeIllustrationPrompt, emptyIllustration, illustrationStyle, isStaleIllustration } from "./illustration";

describe("the illustration registry", () => {
  test("the house preset exists, is v1, black ground, house palette", () => {
    const s = illustrationStyle(null);
    expect(s.id).toBe(DEFAULT_STYLE_ID);
    expect(s.version).toBe(1);
    expect(s.controls.background_color.rgb).toEqual([0, 0, 0]);
    expect(s.controls.colors.length).toBeGreaterThanOrEqual(2);
    expect(illustrationStyle("nope").id).toBe(DEFAULT_STYLE_ID);
  });
  test("the prompt is subject-first, preset around it, intent last", () => {
    const s = ILLUSTRATION_STYLES[DEFAULT_STYLE_ID];
    const p = composeIllustrationPrompt(s, "a nervous investor holding a magnifying glass.", "External users judge the company from outside.");
    expect(p.startsWith(s.promptPrefix + "a nervous investor holding a magnifying glass" + s.promptSuffix)).toBe(true);
    expect(p.endsWith("The idea it illustrates: External users judge the company from outside.")).toBe(true);
    expect(composeIllustrationPrompt(s, "a vault", null).endsWith(s.promptSuffix)).toBe(true);
    // the preset carries the constraints so Lee never types them
    expect(s.promptSuffix).toMatch(/no text/i);
    expect(s.promptSuffix).toMatch(/black background/i);
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
