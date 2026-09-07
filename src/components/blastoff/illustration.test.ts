import { describe, expect, test } from "bun:test";

import { ANIMATION_PRESETS, DEFAULT_STYLE_ID, STYLE_SEEDS, STRATEGY_STYLE_ID, composeIllustrationPrompt, defaultStyleIdFor, emptyIllustration, illustrationStyle, isOffStyleIllustration, isStaleIllustration } from "./illustration";

describe("the illustration registry", () => {
  // v5 (2026-09-06, docs/ILLUSTRATION-STYLE-V5-PROPOSAL.md): the house default moved from
  // watercolor to riso; watercolor is kept, at v4, as the strategy shorts' style.
  // v6 (2026-09-06, docs/ILLUSTRATION-STYLE-V6-DIRECTION.md, the same night): riso becomes
  // VERSION 2 — "psychedelic '68" — with heat added to the palette. The doc calls it "v6"
  // (counting the whole line); the registry versions per id.
  test("the house default is Survive Riso v2 (the doc's v6), white ground, gold / magenta / blue / violet summing to exactly 1", () => {
    const s = illustrationStyle(null);
    expect(s.id).toBe(DEFAULT_STYLE_ID);
    expect(s.id).toBe("survive-riso");
    expect(s.version).toBe(2);
    expect(s.label).toBe("Survive Riso — psychedelic '68");
    expect(s.controls.background_color.rgb).toEqual([255, 255, 255]);
    expect(s.controls.colors.map((c) => c.rgb)).toEqual([[252, 163, 17], [230, 57, 132], [0, 107, 166], [76, 44, 130]]);
    expect(s.controls.colors.map((c) => c.weight)).toEqual([0.35, 0.25, 0.25, 0.15]);
    // "Total 1.00 … Nothing is left to the model's discretion."
    expect(s.controls.colors.reduce((sum, c) => sum + (c.weight ?? 0), 0)).toBeCloseTo(1, 10);
    expect(s.styleIdEnv).toBe("RECRAFT_STYLE_ID_RISO");
    expect(s.defaultAnimation).toBe("drift");
    expect(illustrationStyle("nope").id).toBe(DEFAULT_STYLE_ID);
  });
  test("the riso v2 suffix is the v6 direction's, verbatim: psychedelic in colour and light, modernist in composition, every empirical v1–v4 rule kept", () => {
    const suffix = STYLE_SEEDS["survive-riso"].promptSuffix;
    expect(suffix).toContain("Late-1960s psychedelic screenprint poster illustration in a modernist composition");
    expect(suffix).toContain("three or four flat saturated spot inks");
    expect(suffix).toContain("A glowing halo or concentric aura radiating behind the subject");
    expect(suffix).toContain("the psychedelia is in the color and the light, never in warped or hard-to-read shapes");
    expect(suffix).toContain("off-register");
    // kept verbatim: the v2 outline/fill rule, the v3 skin rule, the v4 no-face rule
    expect(suffix).toContain("never black or near-black");
    expect(suffix).toContain("warm tan");
    expect(suffix).toContain("never a detailed front-facing face");
    expect(suffix).toMatch(/near-white/);
    expect(suffix).toMatch(/two seconds/);
    expect(suffix).toMatch(/no text/i);
    // gone: the medium, "the textbook reference", and v1's "modern editorial" line (the v6
    // suffix says "modernist composition" instead)
    expect(suffix).not.toMatch(/watercolor/i);
    expect(suffix).not.toContain("Vintage educational magazine");
    expect(suffix).not.toContain("Modern editorial illustration, poster composition");
  });
  test("the registry is data now: the seeds carry the rows' extra fields (retired, note) and dreamstate is retired", () => {
    expect(STYLE_SEEDS["survive-dreamstate"].retired).toBe(true);
    expect(STYLE_SEEDS["survive-riso"].retired).toBeFalsy();
    expect(STYLE_SEEDS["survive-riso"].note).toMatch(/v6 direction/);
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
    for (const style of Object.values(STYLE_SEEDS)) {
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
    for (const s of [STYLE_SEEDS[DEFAULT_STYLE_ID], STYLE_SEEDS[STRATEGY_STYLE_ID]]) {
      const p = composeIllustrationPrompt(s, "a nervous investor holding a magnifying glass.", "External users judge the company from outside.");
      expect(p.startsWith(s.promptPrefix + "a nervous investor holding a magnifying glass" + s.promptSuffix)).toBe(true);
      expect(p.endsWith("The idea it illustrates: External users judge the company from outside.")).toBe(true);
      expect(composeIllustrationPrompt(s, "a vault", null).endsWith(s.promptSuffix)).toBe(true);
    }
    // the watercolor preset carries the constraints so Lee never types them (the riso ones are
    // pinned in their own test above)
    const s = STYLE_SEEDS[STRATEGY_STYLE_ID];
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
    // bumps earned); riso is at v2 since the v6 direction, so every riso v1 picture is stale
    // too — "Old pictures show stale and regenerate from the same subject." Off-style (a
    // watercolor picture on an exam set) is a separate question, tested above.
    const water = emptyIllustration({}, "strategy");
    expect(isStaleIllustration(water)).toBe(false);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 4 })).toBe(false);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 3 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 2 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 1 })).toBe(true);
    expect(isStaleIllustration({ ...water, assetUrl: "x", styleVersion: 0 })).toBe(true);
    expect(isStaleIllustration(emptyIllustration())).toBe(false);
    expect(isStaleIllustration({ ...emptyIllustration(), assetUrl: "x", styleVersion: 2 })).toBe(false);
    expect(isStaleIllustration({ ...emptyIllustration(), assetUrl: "x", styleVersion: 1 })).toBe(true);
    expect(isStaleIllustration({ ...emptyIllustration(), assetUrl: "x", styleVersion: 0 })).toBe(true);
    expect(isStaleIllustration(null)).toBe(false);
  });
  test("animation presets include a still option", () => {
    expect(ANIMATION_PRESETS).toContain("none");
    expect(ANIMATION_PRESETS).toContain("boil");
  });
});
