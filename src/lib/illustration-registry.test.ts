// The pure parts of the DB-backed style registry (2026-09-06, v6 Part 2), driven without
// Supabase, Recraft or a session: the overlay (seeds ← rows), the validation Recraft would do,
// the version arithmetic, and the editor's small helpers.
import { describe, expect, test } from "bun:test";

import { CODE_REGISTRY, DEFAULT_STYLE_ID, STRATEGY_STYLE_ID, STYLE_SEEDS, defaultStyleIdFor, illustrationStyle, illustrationStyleAt, isStaleIllustration, emptyIllustration, type IllustrationStyle } from "@/components/blastoff/illustration";
import { classifyIllustration, targetStyleIdFor } from "@/lib/illustration-bank";

import {
  buildRegistry, cloneStyle, copyStyle, fixedSeeds, hexToRgb, nextVersion, previewFrameId, rgbToHex, rowToStyle, sameStyle, settingsOf,
  stalePictureCount, styleControlsSchema, styleDraftSchema, styleToRow, weightSum,
} from "./illustration-registry";

const riso = STYLE_SEEDS[DEFAULT_STYLE_ID];
const bumped = (s: IllustrationStyle, version: number, extra: Partial<IllustrationStyle> = {}): IllustrationStyle => ({ ...cloneStyle(s), version, ...extra });

describe("the overlay — seeds under the table's rows", () => {
  test("no rows, table readable: the seeds, every one of them unseeded, source db", () => {
    const r = buildRegistry([], {}, true);
    expect(r.source).toBe("db");
    expect(Object.keys(r.styles).sort()).toEqual(Object.keys(STYLE_SEEDS).sort());
    expect(r.styles[DEFAULT_STYLE_ID].version).toBe(riso.version);
    expect(r.unseeded?.map((u) => u.id).sort()).toEqual(Object.keys(STYLE_SEEDS).sort());
    expect(r.defaultStyleId).toBe(DEFAULT_STYLE_ID);
    expect(r.strategyStyleId).toBe(STRATEGY_STYLE_ID);
    expect(r.briefSystem).toBeNull();
  });
  test("table missing: source code, otherwise identical — nothing that reads the registry breaks", () => {
    const r = buildRegistry([], {}, false);
    expect(r.source).toBe("code");
    expect(r.styles[DEFAULT_STYLE_ID]).toEqual(riso);
  });
  test("a newer row wins over the seed; the seed stays in the history; nothing is unseeded once every seed is a row", () => {
    const v3 = bumped(riso, 3, { label: "Riso v3 from the editor", promptSuffix: ", a new suffix" });
    const r = buildRegistry([riso, v3, STYLE_SEEDS[STRATEGY_STYLE_ID], STYLE_SEEDS["survive-dreamstate"]], {}, true);
    expect(r.styles[DEFAULT_STYLE_ID].version).toBe(3);
    expect(r.styles[DEFAULT_STYLE_ID].label).toBe("Riso v3 from the editor");
    expect(r.history.filter((s) => s.id === DEFAULT_STYLE_ID).map((s) => s.version)).toEqual([3, riso.version]);
    expect(r.unseeded).toEqual([]);
  });
  test("a seed newer than the table's latest wins until it is seeded (a code bump still applies)", () => {
    const older = bumped(riso, riso.version - 1, { label: "older row" });
    const r = buildRegistry([older], {}, true);
    expect(r.styles[DEFAULT_STYLE_ID].version).toBe(riso.version);
    expect(r.unseeded).toContainEqual({ id: DEFAULT_STYLE_ID, version: riso.version });
  });
  test("on an equal version the DB row wins — a save without bumping is what Lee sees", () => {
    const edited = bumped(riso, riso.version, { promptSuffix: ", edited in place" });
    const r = buildRegistry([edited], {}, true);
    expect(r.styles[DEFAULT_STYLE_ID].promptSuffix).toBe(", edited in place");
    expect(r.history.filter((s) => s.id === DEFAULT_STYLE_ID)).toHaveLength(1);
  });
  test("settings move the defaults; an unknown or missing id falls back to the code constant", () => {
    const r = buildRegistry([], { defaultStyleId: STRATEGY_STYLE_ID, strategyStyleId: "nope", briefSystem: "  custom brief  " }, true);
    expect(r.defaultStyleId).toBe(STRATEGY_STYLE_ID);
    expect(r.strategyStyleId).toBe(STRATEGY_STYLE_ID);
    expect(r.briefSystem).toBe("  custom brief  ");
    expect(buildRegistry([], { briefSystem: "   " }, true).briefSystem).toBeNull();
  });
  test("settingsOf reads only the illustration slice, only the string fields", () => {
    expect(settingsOf({ illustration: { defaultStyleId: "a", strategyStyleId: 3, briefSystem: "b", junk: 1 }, other: true })).toEqual({ defaultStyleId: "a", briefSystem: "b" });
    expect(settingsOf({})).toEqual({});
    expect(settingsOf(null)).toEqual({});
  });
});

describe("the registry drives every predicate", () => {
  const v3 = bumped(riso, 3);
  const reg = buildRegistry([riso, v3], { defaultStyleId: STRATEGY_STYLE_ID }, true);
  test("illustrationStyle / defaultStyleIdFor / emptyIllustration read the registry they're given, the code one otherwise", () => {
    expect(illustrationStyle(DEFAULT_STYLE_ID, reg).version).toBe(3);
    expect(illustrationStyle(DEFAULT_STYLE_ID).version).toBe(riso.version);
    expect(defaultStyleIdFor(undefined, reg)).toBe(STRATEGY_STYLE_ID);
    expect(defaultStyleIdFor(undefined)).toBe(DEFAULT_STYLE_ID);
    expect(emptyIllustration({}, undefined, reg).stylePreset).toBe(STRATEGY_STYLE_ID);
    expect(illustrationStyleAt(DEFAULT_STYLE_ID, riso.version, reg)?.label).toBe(riso.label);
    expect(illustrationStyleAt(DEFAULT_STYLE_ID, 99, reg)).toBeNull();
  });
  test("a bump in the table makes yesterday's pictures stale — the doc: 'Old pictures show stale and regenerate from the same subject'", () => {
    const pic = { ...emptyIllustration(), stylePreset: DEFAULT_STYLE_ID, styleVersion: riso.version, assetUrl: "x" };
    expect(isStaleIllustration(pic)).toBe(false);
    expect(isStaleIllustration(pic, reg)).toBe(true);
    // and the bank's verdict follows: with the exam default moved to watercolor, riso is off-style
    expect(classifyIllustration(pic, undefined, reg)).toBe("off-style");
    expect(classifyIllustration(pic, undefined, buildRegistry([riso, v3], {}, true))).toBe("stale");
  });
  test("targetStyleIdFor refuses an id the registry doesn't hold", () => {
    expect(targetStyleIdFor(undefined, undefined, reg)).toBe(STRATEGY_STYLE_ID);
    expect(() => targetStyleIdFor(undefined, "survive-crayon", reg)).toThrow(/Unknown style preset/);
    expect(targetStyleIdFor(undefined, "survive-crayon", buildRegistry([bumped({ ...riso, id: "survive-crayon" }, 1)], {}, true))).toBe("survive-crayon");
  });
  test("CODE_REGISTRY is the seeds", () => {
    expect(CODE_REGISTRY.styles).toBe(STYLE_SEEDS);
    expect(CODE_REGISTRY.source).toBe("code");
  });
});

describe("validation — exactly what Recraft would reject", () => {
  test("weights each 0–1, sum ≤ 1: the seeds pass, 1.5 fails with Recraft's own words, 1.0 passes", () => {
    for (const s of Object.values(STYLE_SEEDS)) expect(styleDraftSchema.safeParse(s).success).toBe(true);
    const over = styleControlsSchema.safeParse({ background_color: { rgb: [0, 0, 0] }, colors: [{ rgb: [255, 255, 255], weight: 0.5 }, { rgb: [252, 163, 17], weight: 0.6 }, { rgb: [0, 107, 166], weight: 0.4 }] });
    expect(over.success).toBe(false);
    if (!over.success) expect(over.error.issues[0].message).toMatch(/Total color weight must be between 0 and 1/);
    expect(styleControlsSchema.safeParse({ background_color: { rgb: [255, 255, 255] }, colors: [{ rgb: [1, 2, 3], weight: 0.35 }, { rgb: [4, 5, 6], weight: 0.25 }, { rgb: [7, 8, 9], weight: 0.25 }, { rgb: [10, 11, 12], weight: 0.15 }] }).success).toBe(true);
    expect(styleControlsSchema.safeParse({ background_color: { rgb: [255, 255, 255] }, colors: [{ rgb: [1, 2, 3], weight: 1.2 }] }).success).toBe(false);
    expect(styleControlsSchema.safeParse({ background_color: { rgb: [256, 0, 0] }, colors: [] }).success).toBe(false);
  });
  test("the id, the size and the env var name are shaped; provider is recraft only", () => {
    const ok = styleDraftSchema.safeParse(riso);
    expect(ok.success).toBe(true);
    expect(styleDraftSchema.safeParse({ ...riso, id: "Bad Id" }).success).toBe(false);
    expect(styleDraftSchema.safeParse({ ...riso, size: "big" }).success).toBe(false);
    expect(styleDraftSchema.safeParse({ ...riso, styleIdEnv: "lowercase" }).success).toBe(false);
    expect(styleDraftSchema.safeParse({ ...riso, provider: "openai" }).success).toBe(false);
    expect(styleDraftSchema.safeParse({ ...riso, defaultAnimation: "wobble" }).success).toBe(false);
  });
  test("weightSum counts an absent weight as 0", () => {
    expect(weightSum([{ weight: 0.3 }, {}, { weight: 0.2 }])).toBeCloseTo(0.5, 10);
  });
});

describe("rows ↔ styles", () => {
  test("a style survives the round trip; a malformed row is dropped, not thrown", () => {
    const row = { ...styleToRow(riso, "lee"), created_at: "2026-09-06T00:00:00Z", updated_at: "2026-09-06T00:00:00Z" };
    expect(row.prompt_suffix).toBe(riso.promptSuffix);
    expect(row.style_id_env).toBe(riso.styleIdEnv);
    expect(row.retired).toBe(false);
    const back = rowToStyle(row);
    expect(back).not.toBeNull();
    expect(sameStyle(back, riso)).toBe(true);
    expect(rowToStyle({ ...row, controls: { colors: "nope" } })).toBeNull();
    expect(rowToStyle({ ...row, default_animation: "wobble" })).toBeNull();
    expect(rowToStyle({ ...row, provider: "openai" })).toBeNull();
  });
});

describe("the editor's arithmetic", () => {
  test("nextVersion is one past the HIGHEST ever saved for the id — a retired v3 is never reissued; a new id starts at 1", () => {
    const reg = buildRegistry([riso, bumped(riso, 3, { retired: true })], {}, true);
    expect(nextVersion(reg, DEFAULT_STYLE_ID)).toBe(4);
    expect(nextVersion(reg, "brand-new")).toBe(1);
    expect(nextVersion(CODE_REGISTRY, STRATEGY_STYLE_ID)).toBe(STYLE_SEEDS[STRATEGY_STYLE_ID].version + 1);
  });
  test("stalePictureCount: every picture in the preset with a version stamp, whatever the stamp", () => {
    const rows = [
      { stylePreset: DEFAULT_STYLE_ID, styleVersion: 1 }, { stylePreset: DEFAULT_STYLE_ID, styleVersion: 2 },
      { stylePreset: DEFAULT_STYLE_ID, styleVersion: null }, { stylePreset: STRATEGY_STYLE_ID, styleVersion: 4 }, { stylePreset: null, styleVersion: 1 },
    ];
    expect(stalePictureCount(rows, DEFAULT_STYLE_ID)).toBe(2);
    expect(stalePictureCount(rows, STRATEGY_STYLE_ID)).toBe(1);
    expect(stalePictureCount(rows, "nope")).toBe(0);
  });
  test("copyStyle: a fresh id that isn't taken, v1, not retired, controls deep-copied", () => {
    const reg = buildRegistry([riso, bumped({ ...riso, id: `${DEFAULT_STYLE_ID}-2` }, 1)], {}, true);
    const c = copyStyle(riso, reg);
    expect(c.id).toBe(`${DEFAULT_STYLE_ID}-3`);
    expect(c.version).toBe(1);
    expect(c.retired).toBe(false);
    expect(c.label).toMatch(/\(copy\)$/);
    c.controls.colors[0].rgb[0] = 0;
    expect(riso.controls.colors[0].rgb[0]).toBe(252);
  });
  test("sameStyle ignores version and note (a bump of the same text is the same style); cloneStyle is equal but not the same object", () => {
    expect(sameStyle(riso, bumped(riso, 9, { note: "x" }))).toBe(true);
    expect(sameStyle(riso, bumped(riso, 9, { promptSuffix: "y" }))).toBe(false);
    expect(sameStyle(null, undefined)).toBe(false);
    expect(sameStyle(null, null)).toBe(true);
    const c = cloneStyle(riso);
    expect(c).toEqual(riso);
    expect(c.controls).not.toBe(riso.controls);
  });
  test("hex ↔ rgb, both ways, forgiving on input", () => {
    expect(rgbToHex([252, 163, 17])).toBe("#FCA311");
    expect(hexToRgb("#FCA311")).toEqual([252, 163, 17]);
    expect(hexToRgb("fca311")).toEqual([252, 163, 17]);
    expect(hexToRgb(" #E63984 ")).toEqual([230, 57, 132]);
    expect(hexToRgb("#FCA")).toBeNull();
    expect(hexToRgb("gold")).toBeNull();
  });
  test("previewFrameId slugs the subject; fixedSeeds are uint32s, injectable", () => {
    expect(previewFrameId("A young professional, seen from BEHIND!")).toBe("a-young-professional-seen-from-behind");
    expect(previewFrameId("   ")).toBe("subject");
    expect(previewFrameId("x".repeat(100)).length).toBeLessThanOrEqual(48);
    const seeds = fixedSeeds(4, () => 0.5);
    expect(seeds).toHaveLength(4);
    expect(seeds.every((s) => Number.isInteger(s) && s >= 0 && s <= 4294967295)).toBe(true);
    expect(new Set(fixedSeeds(4, () => 0.5)).size).toBe(1);
  });
});
