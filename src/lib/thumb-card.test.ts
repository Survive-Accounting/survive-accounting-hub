// THE THUMBNAIL's pure half. The route can only be as right as the fit is, and the fit is the
// one thing satori will not do for us — so it is pinned here.
import { describe, expect, test } from "bun:test";

import {
  charEm, cleanHook, defaultHook, eyebrowText, FIT_SAFETY, fitHook, isThumbGround, isThumbRatio,
  textEm, THUMB_GROUNDS, THUMB_SIZE, thumbFilename, trimToHook, wrapLines,
} from "./thumb-card";

describe("cleanHook", () => {
  test("every editor marker is stripped, the words survive", () => {
    expect(cleanHook("Is **prepaid rent** an ==asset==?")).toBe("Is prepaid rent an asset?");
    expect(cleanHook("Not ~~a liability~~ but an asset")).toBe("Not a liability but an asset");
    expect(cleanHook("Single ~tilde~ works too")).toBe("Single tilde works too");
    expect(cleanHook("__underlined__ and ____ blank")).toBe("underlined and blank");
  });
  test("whitespace collapses and nothing else changes", () => {
    expect(cleanHook("  what   type\nof account\t is it? ")).toBe("what type of account is it?");
    expect(cleanHook("")).toBe("");
    expect(cleanHook("A = L + E")).toBe("A = L + E");
  });
});

describe("trimToHook", () => {
  test("a short line is returned untouched", () => {
    expect(trimToHook("Is prepaid rent an asset?")).toBe("Is prepaid rent an asset?");
    expect(trimToHook("")).toBe("");
  });
  test("a long one breaks at a sentence, then a clause, then a word — never mid-word", () => {
    const s = "Cash is an asset. It is the first thing on the balance sheet and it never changes.";
    expect(trimToHook(s)).toBe("Cash is an asset.");
    const clause = "A really quite long opening clause about accounts, and then a second one that runs on";
    expect(trimToHook(clause)).toBe("A really quite long opening clause about accounts");
    const noBreaks = "supercalifragilistic ".repeat(6).trim();
    expect(trimToHook(noBreaks).endsWith("…") || !/\S…/.test(trimToHook(noBreaks))).toBe(true);
    expect(trimToHook(noBreaks).length).toBeLessThanOrEqual(68);
  });
  test("a single unbreakable word ellipsises rather than returning nothing", () => {
    const one = "a".repeat(200);
    const got = trimToHook(one);
    expect(got.length).toBeLessThanOrEqual(68);
    expect(got.endsWith("…")).toBe(true);
  });
});

describe("defaultHook", () => {
  test("the first card's question leads, cleaned", () => {
    expect(defaultHook("Assets", "Account classification", ["What type of account is **cash**?"]))
      .toBe("What type of account is cash?");
  });
  test("no cards falls back to the set, then the topic", () => {
    expect(defaultHook("Assets", "Account classification", [])).toBe("Assets");
    expect(defaultHook("", "Account classification", [])).toBe("Account classification");
    expect(defaultHook("", "", [])).toBe("");
  });
  test("an empty first stem is skipped, not rendered blank", () => {
    expect(defaultHook("Assets", "T", ["  ", "Is cash an asset?"])).toBe("Is cash an asset?");
  });
});

describe("measuring", () => {
  test("a wide letter measures wider than a narrow one, and space is narrowest", () => {
    expect(charEm("W")).toBeGreaterThan(charEm("A"));
    expect(charEm("A")).toBeGreaterThan(charEm("a"));
    expect(charEm("i")).toBeLessThan(charEm("a"));
    expect(charEm(" ")).toBeLessThan(charEm("i"));
  });
  test("textEm adds up and an unknown character still costs something", () => {
    expect(textEm("AA")).toBeCloseTo(charEm("A") * 2, 6);
    expect(textEm("")).toBe(0);
    expect(textEm("字")).toBeGreaterThan(0);
  });
});

describe("wrapLines", () => {
  test("every line fits the box", () => {
    const width = 800, size = 100;
    for (const line of wrapLines("What type of account is prepaid rent and why", size, width)) {
      expect(textEm(line) * size).toBeLessThanOrEqual(width);
    }
  });
  test("no word is lost or duplicated", () => {
    const text = "Is accumulated depreciation a contra asset account";
    expect(wrapLines(text, 90, 600).join(" ")).toBe(text);
  });
  test("a word wider than the box gets its own line rather than looping forever", () => {
    expect(wrapLines("antidisestablishmentarianism", 200, 100)).toEqual(["antidisestablishmentarianism"]);
    expect(wrapLines("", 100, 500)).toEqual([]);
  });
});

describe("fitHook", () => {
  const box = { width: 880, height: 900 };
  test("a short hook takes the largest rung", () => {
    expect(fitHook("Is cash an asset?", box).size).toBe(200);
  });
  test("a longer hook steps down, and the result always fits the box", () => {
    const long = "What type of account is accumulated depreciation and where does it sit";
    const fit = fitHook(long, box);
    expect(fit.size).toBeLessThan(200);
    expect(fit.lines.length * fit.size * 1.06).toBeLessThanOrEqual(box.height);
    for (const l of fit.lines) expect(textEm(l) * fit.size).toBeLessThanOrEqual(box.width);
  });
  test("empty text renders no lines instead of one blank one", () => {
    expect(fitHook("   ", box).lines).toEqual([]);
  });
  test("text too big for any rung still comes back wrapped, never empty", () => {
    const fit = fitHook("word ".repeat(200).trim(), box);
    expect(fit.lines.length).toBeGreaterThan(0);
    expect(fit.size).toBe(64);
  });
});

describe("chrome", () => {
  test("the eyebrow is caps and never wraps", () => {
    expect(eyebrowText("Account classification", "Assets")).toBe("ACCOUNT CLASSIFICATION");
    expect(eyebrowText("", "Assets")).toBe("ASSETS");
    const long = eyebrowText("A topic whose name simply goes on and on and on forever", "x");
    expect(long.length).toBeLessThanOrEqual(34);
    expect(long.endsWith("…")).toBe(true);
  });
  test("the filename is a safe slug and always .png", () => {
    expect(thumbFilename("What type of account? (Assets)", "9x16")).toBe("what-type-of-account-assets-thumb-9x16.png");
    expect(thumbFilename("", "16x9")).toBe("short-thumb-16x9.png");
  });
  test("the ratios and grounds guard themselves", () => {
    expect(isThumbRatio("9x16")).toBe(true);
    expect(isThumbRatio("1x1")).toBe(false);
    expect(isThumbGround("navy")).toBe(true);
    expect(isThumbGround("chartreuse")).toBe(false);
    expect(THUMB_SIZE["9x16"]).toEqual({ w: 1080, h: 1920 });
    expect(THUMB_GROUNDS.length).toBe(3);
  });
});

// THE SAFETY FACTOR (2026-09-09). The first live render of "Which describes internal users?" at
// 1080 wide put ink 17px past the safe column: charEm runs light on lowercase Rubik Black. The
// margin is the fix, and this is the case that found it.
describe("fitHook leaves room for the real typeface", () => {
  test("the line that overran now clears the column with margin to spare", () => {
    const inner = 1080 - Math.round(1080 * 0.085) * 2;
    const fit = fitHook("Which describes internal users?", { width: inner, height: Math.round(1920 * 0.46) });
    const widest = Math.max(...fit.lines.map((l) => textEm(l) * fit.size));
    expect(widest).toBeLessThanOrEqual(inner * FIT_SAFETY);
    // 2% of measured error must still land inside the real box.
    expect(widest * 1.02).toBeLessThanOrEqual(inner);
  });
  test("the factor is explicit and can be overridden per call", () => {
    expect(FIT_SAFETY).toBeLessThan(1);
    const box = { width: 900, height: 900 };
    const loose = fitHook("a much longer hook line than fits", box, { safety: 1 });
    const tight = fitHook("a much longer hook line than fits", box, { safety: 0.7 });
    expect(tight.size).toBeLessThanOrEqual(loose.size);
  });
});
