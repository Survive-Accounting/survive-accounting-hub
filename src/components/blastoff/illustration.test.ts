import { describe, expect, test } from "bun:test";

import { ANIMATION_PRESETS, DEFAULT_STYLE_ID, ILLUSTRATION_STYLES, STRATEGY_STYLE_ID, composeIllustrationPrompt, defaultStyleIdFor, emptyIllustration, illustrationStyle, isOffStyleIllustration, isStaleIllustration } from "./illustration";

describe("the illustration registry", () => {
  // v5 (2026-09-06, docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md): the house default moved from
  // watercolor to riso; watercolor is kept, at v4, as the strategy shorts' style.
  test("the house default is Survive Riso v1, white ground, gold / blue / cream summing to exactly 1", () => {
    const s = illustrationStyle(null);
    expect(s.id).toBe(DEFAULT_STYLE_ID);
    expect(s.id).toBe("survive-riso");
    expect(s.version).toBe(1);
    expect(s.controls.background_color.rgb).toEqual([255, 255, 255]);
    expect(s.controls.colors.map((c) => c.rgb)).toEqual([[252, 163, 17], [0, 107, 166], [245, 239, 230]]);
    // "Total = 1.00. No free third for the model to fill with whatever it likes."
    expect(s.controls.colors.reduce((sum, c) => sum + (c.weight ?? 0), 0)).toBeCloseTo(1, 10);
    expect(s.styleIdEnv).toBe("RECRAFT_STYLE_ID_RISO");
    expect(s.defaultAnimation).toBe("drift");
    expect(illustrationStyle("nope").id).toBe(DEFAULT_STYLE_ID);
  });
  test("the riso suffix keeps every empirical v1–v4 rule and drops the watercolor-only ones", () => {
    const suffix = ILLUSTRATION_STYLES["survive-riso"].promptSuffix;
    expect(suffix).toContain("Risograph");
    expect(suffix).toContain("off-register");
    // kept verbatim: the v2 outline/fill rule, the v3 skin rule, the v4 no-face rule
    expect(suffix).toContain("never black or near-black");
    expect(suffix).toContain("warm tan");
    expect(suffix).toContain("never a detailed front-facing face");
    expect(suffix).toMatch(/near-white/);
    expect(suffix).toMatch(/two seconds/);
    expect(suffix).toMatch(/no text/i);
    // gone: the medium, and "the textbook reference"
    expect(suffix).not.toMatch(/watercolor/i);
    expect(suffix).not.toContain("Vintage educational magazine");
    expect(suffix).toContain("Modern editorial illustration, poster composition");
  });
  test("watercolor stays, at v4, as the strategy shorts' style — the library isn't wasted", () => {
    const w = illustrationStyle("survive-watercolor");
    expect(w.id).toBe(STRATEGY_STYLE_ID);
    expect(w.version).toBe(4);
    expect(w.label).toMatch(/strategy shorts/i);
    expect(w.promptSuffix).toMatch(/watercolor/i);
  });
  test("the default is per kind: riso for exam content, watercolor for strategy", () => {
    expect(defaultStyleIdFor(undefined)).toBe("survive-riso");
    expect(defaultStyleIdFor("strategy")).toBe("survive-watercolor");
    expect(emptyIllustration().stylePreset).toBe("survive-riso");
    expect(emptyIllustration({}, "strategy").stylePreset).toBe("survive-watercolor");
    expect(emptyIllustration({ stylePreset: "survive-dreamstate" }, "strategy").stylePreset).toBe("survive-dreamstate");   // an explicit seed still wins
  });
  test("off-style = pinned to a preset other than the default for its kind, either way round", () => {
    const water = { ...emptyIllustration(), stylePreset: "survive-watercolor" };
    const riso = { ...emptyIllustration(), stylePreset: "survive-riso" };
    expect(isOffStyleIllustration(water, undefined)).toBe(true);
    expect(isOffStyleIllustration(water, "strategy")).toBe(false);
    expect(isOffStyleIllustration(riso, undefined)).toBe(false);
    expect(isOffStyleIllustration(riso, "strategy")).toBe(true);
    expect(isOffStyleIllustration({ ...emptyIllustration(), stylePreset: "survive-dreamstate" }, undefined)).toBe(true);
    expect(isOffStyleIllustration({ ...emptyIllustration(), stylePreset: null }, undefined)).toBe(false);
    expect(isOffStyleIllustration(null, undefined)).toBe(false);
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
    for (const s of [ILLUSTRATION_STYLES[DEFAULT_STYLE_ID], ILLUSTRATION_STYLES[STRATEGY_STYLE_ID]]) {
      const p = composeIllustrationPrompt(s, "a nervous investor holding a magnifying glass.", "External users judge the company from outside.");
      expect(p.startsWith(s.promptPrefix + "a nervous investor holding a magnifying glass" + s.promptSuffix)).toBe(true);
      expect(p.endsWith("The idea it illustrates: External users judge the company from outside.")).toBe(true);
      expect(composeIllustrationPrompt(s, "a vault", null).endsWith(s.promptSuffix)).toBe(true);
    }
    // the watercolor preset carries the constraints so Lee never types them (the riso ones are
    // pinned in their own test above)
    const s = ILLUSTRATION_STYLES[STRATEGY_STYLE_ID];
    expect(s.promptSuffix).toMatch(/no text/i);
    expect(s.promptSuffix).toMatch(/watercolor/i);
    expect(s.promptSuffix).toMatch(/white background/i);
    // v2: the "black on black" fix — nothing may render as true black, even a realistically
    // dark subject, so a shape can never vanish once the white paper is stripped.
    expect(s.promptSuffix).toMatch(/never black/i);
    // v3: the OTHER half of the same fix — a fill can't go near-white either (skin, a pale
    // shirt), or removeBackground cuts it away with the white ground, leaving a hole that reads
    // as a black face once it's sitting on Lee's dark slide.
    expect(s.promptSuffix).toMatch(/near-white/i);
    expect(s.promptSuffix).toMatch(/skin/i);
    // v4 (2026-09-06): the wash stays contained inside the line — no splatters, no muddy or
    // bleeding washes — and the color-safety rule from v2/v3 was NOT relaxed to get there.
    expect(s.promptSuffix).toMatch(/contained/i);
    expect(s.promptSuffix).not.toMatch(/bleeding at the edges/i);
  });
  test("stale = made with an older registry version; never for an ungenerated request", () => {
    // watercolor is at v4 — every earlier watercolor picture is stale (the pins the v2/v3/v4
    // bumps earned); riso starts at v1, so only a v0 stamp is stale there. Off-style (a
    // watercolor picture on an exam set) is a separate question, tested above.
    const water = emptyIllustration({}, "strategy");
    expect(isStaleIllustration(water)).toBe(false);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 4 })).toBe(false);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 3 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 2 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 1 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 0 })).toBe(true);
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
