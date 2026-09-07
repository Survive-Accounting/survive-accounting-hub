// The pure parts of /admin/illustrations, driven without Recraft, Supabase or a session.
// The registry's own predicates decide; these tests pin the bank's reading of them.
import { describe, expect, test } from "bun:test";

import { DEFAULT_STYLE_ID, ILLUSTRATION_STYLES, STRATEGY_STYLE_ID, emptyIllustration, type FrameIllustration } from "@/components/blastoff/illustration";

import {
  COST_GUESS_USD, bankKey, bankStyleDefaults, classifyIllustration, defaultBankFilter, estimateCost, frameKindLabel,
  illustrationTitle, medianOf, tallyStatuses, targetStyleIdFor,
} from "./illustration-bank";

const made = (stylePreset: string, styleVersion: number, extra: Partial<FrameIllustration> = {}): FrameIllustration =>
  ({ ...emptyIllustration(), prompt: "a padlock with a key half-turned", stylePreset, styleVersion, assetUrl: "https://x/y.png", ...extra });

describe("classifyIllustration — the registry's verdict, one word", () => {
  const riso = ILLUSTRATION_STYLES[DEFAULT_STYLE_ID], water = ILLUSTRATION_STYLES[STRATEGY_STYLE_ID];

  test("a riso picture at the current version on an exam set is current", () => {
    expect(classifyIllustration(made(riso.id, riso.version), undefined)).toBe("current");
  });
  test("tonight's case: every watercolor v4 exam picture is off-style, not stale", () => {
    expect(classifyIllustration(made(water.id, water.version), undefined)).toBe("off-style");
  });
  test("watercolor v4 on a strategy short is current; riso there is off-style", () => {
    expect(classifyIllustration(made(water.id, water.version), "strategy")).toBe("current");
    expect(classifyIllustration(made(riso.id, riso.version), "strategy")).toBe("off-style");
  });
  test("an older version of the RIGHT preset is stale", () => {
    expect(classifyIllustration(made(riso.id, riso.version - 1), undefined)).toBe("stale");
    expect(classifyIllustration(made(water.id, water.version - 1), "strategy")).toBe("stale");
  });
  test("off-style wins over stale when both are true (an old watercolor on an exam set)", () => {
    expect(classifyIllustration(made(water.id, 1), undefined)).toBe("off-style");
  });
  test("the retired dreamstate is off-style everywhere", () => {
    expect(classifyIllustration(made("survive-dreamstate", 2), undefined)).toBe("off-style");
    expect(classifyIllustration(made("survive-dreamstate", 2), "strategy")).toBe("off-style");
  });
  test("no preset recorded → never off-style; no version recorded → never stale", () => {
    expect(classifyIllustration({ ...made(riso.id, riso.version), stylePreset: null }, undefined)).toBe("current");
    expect(classifyIllustration({ ...made(riso.id, riso.version), styleVersion: null }, undefined)).toBe("current");
  });
});

describe("targetStyleIdFor — which style a regeneration lands in", () => {
  test("no override: the default for the kind", () => {
    expect(targetStyleIdFor(undefined)).toBe("survive-riso");
    expect(targetStyleIdFor("strategy")).toBe("survive-watercolor");
    expect(targetStyleIdFor(undefined, null)).toBe("survive-riso");
  });
  test("a real override is honoured whatever the kind", () => {
    expect(targetStyleIdFor(undefined, "survive-watercolor")).toBe("survive-watercolor");
    expect(targetStyleIdFor("strategy", "survive-riso")).toBe("survive-riso");
  });
  test("an unknown override is refused, never silently mapped to the house default", () => {
    expect(() => targetStyleIdFor(undefined, "survive-crayon")).toThrow(/Unknown style preset/);
  });
  test("bankStyleDefaults reports the registry as it stands", () => {
    const d = bankStyleDefaults();
    expect(d.exam).toEqual({ id: "survive-riso", version: 1, label: ILLUSTRATION_STYLES["survive-riso"].label });
    expect(d.strategy.id).toBe("survive-watercolor");
    expect(d.strategy.version).toBe(4);
  });
});

describe("estimateCost — said before Lee pays", () => {
  test("the library's median when there is one, and it is not a guess", () => {
    const e = estimateCost(0.032, 12);
    expect(e.perPicture).toBe(0.032);
    expect(e.total).toBeCloseTo(0.384, 6);
    expect(e.guess).toBe(false);
    expect(e.basis).toMatch(/median/);
  });
  test("no cost on record → the stated guess, labelled a guess", () => {
    for (const m of [null, undefined, 0, -1, Number.NaN]) {
      const e = estimateCost(m, 3);
      expect(e.perPicture).toBe(COST_GUESS_USD);
      expect(e.total).toBeCloseTo(0.12, 6);
      expect(e.guess).toBe(true);
      expect(e.basis).toMatch(/guess/);
    }
  });
  test("nothing selected costs nothing", () => {
    expect(estimateCost(0.05, 0).total).toBe(0);
  });
  test("medianOf: odd, even, empty, junk", () => {
    expect(medianOf([0.05, 0.01, 0.03])).toBe(0.03);
    expect(medianOf([0.01, 0.03, 0.05, 0.07])).toBeCloseTo(0.04, 10);
    expect(medianOf([])).toBeNull();
    expect(medianOf([Number.NaN, -2])).toBeNull();
  });
});

describe("the page's opening filter, and the small helpers", () => {
  test("off-style first, then stale, then everything", () => {
    expect(defaultBankFilter({ "off-style": 3, stale: 2, current: 1, all: 6 })).toBe("off-style");
    expect(defaultBankFilter({ "off-style": 0, stale: 2, current: 1, all: 3 })).toBe("stale");
    expect(defaultBankFilter({ "off-style": 0, stale: 0, current: 1, all: 1 })).toBe("all");
    expect(defaultBankFilter({ "off-style": 0, stale: 0, current: 0, all: 0 })).toBe("all");
  });
  test("tallyStatuses counts every status and the whole", () => {
    expect(tallyStatuses([{ status: "stale" }, { status: "off-style" }, { status: "off-style" }])).toEqual({ "off-style": 2, stale: 1, current: 0, all: 3 });
  });
  test("illustrationTitle: the brief's title first, else the subject cut with an ellipsis", () => {
    expect(illustrationTitle({ prompt: "a padlock", summary: { title: "The padlock", bullets: [] } })).toBe("The padlock");
    expect(illustrationTitle({ prompt: "a padlock", summary: null })).toBe("a padlock");
    const long = "a very long subject sentence that keeps going well past the sixty character mark for sure";
    const t = illustrationTitle({ prompt: long, summary: null });
    expect(t.length).toBeLessThanOrEqual(60);
    expect(t.endsWith("…")).toBe(true);
  });
  test("keys and kind labels", () => {
    expect(bankKey("set-1", "f-2")).toBe("set-1/f-2");
    expect(frameKindLabel("cheat")).toBe("Cheat Code");
    expect(frameKindLabel("phrase")).toBe("Memorize This");
    expect(frameKindLabel("exhibit")).toBe("exhibit");
  });
});
