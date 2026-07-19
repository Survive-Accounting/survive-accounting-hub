import { describe, expect, test } from "bun:test";

import {
  DEFAULT_RIFF, estimateFrameSeconds, estimateTotalSeconds, formatReadTime,
  frameScriptLines, frameWordCounts, isOverReadTime, parseScriptLines,
} from "./script-timing";
import type { FrameScript } from "./types";

describe("parseScriptLines", () => {
  test('"!" prefix flags a money line and is stripped; blanks dropped', () => {
    const ls = parseScriptLines("!This is THE rule\nriff about examples\n\n  ! and this ");
    expect(ls).toEqual([
      { text: "This is THE rule", money: true },
      { text: "riff about examples", money: false },
      { text: "and this", money: true },
    ]);
  });
  test("forceMoney marks every line (entry/exit)", () => {
    expect(parseScriptLines("open big", true)).toEqual([{ text: "open big", money: true }]);
  });
  test("undefined/empty → []", () => {
    expect(parseScriptLines(undefined)).toEqual([]);
    expect(parseScriptLines("   ")).toEqual([]);
  });
});

describe("frameScriptLines", () => {
  test("entry + exit are money by default; beats follow the ! convention", () => {
    const s: FrameScript = { entry: "Here's where we're going", beats: "point one\n!the key fact", exit: "next up: adjusting" };
    const rows = frameScriptLines(s);
    expect(rows.map((r) => [r.section, r.line.money])).toEqual([
      ["entry", true],
      ["beats", false],
      ["beats", true],
      ["exit", true],
    ]);
  });
});

describe("read-time estimate", () => {
  test("40 money words + 30 talk words, defaults (150wpm, riff 2.0) = 40s", () => {
    // money: 40/150*60 = 16s; talk: 30/150*60*2 = 24s → 40s
    const s: FrameScript = { entry: Array(40).fill("w").join(" "), beats: Array(30).fill("b").join(" ") };
    const wc = frameWordCounts(s);
    expect(wc).toEqual({ money: 40, talk: 30 });
    expect(estimateFrameSeconds(s)).toBe(40);
    expect(DEFAULT_RIFF).toBe(2.0);
  });
  test("riff multiplier is adjustable", () => {
    const s: FrameScript = { beats: Array(30).fill("b").join(" ") }; // pure talk
    expect(estimateFrameSeconds(s, { riff: 1 })).toBe(12); // 30/150*60 = 12
    expect(estimateFrameSeconds(s, { riff: 3 })).toBe(36);
  });
  test("blank script = 0; lesson total sums frames", () => {
    expect(estimateFrameSeconds(undefined)).toBe(0);
    const a: FrameScript = { entry: Array(15).fill("w").join(" ") }; // 6s
    const b: FrameScript = { entry: Array(15).fill("w").join(" ") }; // 6s
    expect(estimateTotalSeconds([a, b, undefined])).toBe(12);
  });
  test("over-threshold flag", () => {
    expect(isOverReadTime(61)).toBe(true);
    expect(isOverReadTime(60)).toBe(false);
    expect(isOverReadTime(90, 120)).toBe(false);
  });
});

describe("formatReadTime", () => {
  test("under a minute → ≈Ns; at/over → ≈m:ss; 0 → empty", () => {
    expect(formatReadTime(22)).toBe("≈22s");
    expect(formatReadTime(80)).toBe("≈1:20");
    expect(formatReadTime(0)).toBe("");
  });
});
