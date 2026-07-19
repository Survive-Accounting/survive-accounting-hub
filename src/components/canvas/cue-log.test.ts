import { describe, expect, test } from "bun:test";

import {
  alignPressesToClip, applyOffset, DEFAULT_OBS_PATTERN, fallbackFromIntervals,
  moveBoundary, parseObsFilename, segmentsFromBoundaries,
} from "./cue-log";

describe("parseObsFilename", () => {
  test("default OBS pattern with a prefix + extension", () => {
    const ms = parseObsFilename("SH-lesson 2026-07-19 14-30-05.mkv");
    expect(ms).not.toBeNull();
    const d = new Date(ms!);
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()])
      .toEqual([2026, 7, 19, 14, 30, 5]);
  });
  test("no timestamp → null", () => {
    expect(parseObsFilename("myclip.mp4")).toBeNull();
  });
  test("custom pattern (underscores)", () => {
    const ms = parseObsFilename("2026_01_02_09_08_07.mp4", "%CCYY_%MM_%DD_%hh_%mm_%ss");
    const d = new Date(ms!);
    expect([d.getMonth() + 1, d.getDate(), d.getHours()]).toEqual([1, 2, 9]);
  });
  test("default pattern constant is the common OBS format", () => {
    expect(DEFAULT_OBS_PATTERN).toBe("%CCYY-%MM-%DD %hh-%mm-%ss");
  });
});

describe("alignPressesToClip", () => {
  test("presses become second-offsets from the clip start, clamped + sorted", () => {
    const clipStart = 1_000_000; // ms
    const presses = [1_003_000, 1_000_500, 999_000]; // 3s, 0.5s, and before-start
    expect(alignPressesToClip(presses, clipStart)).toEqual([0, 0.5, 3]);
  });
});

describe("fallbackFromIntervals", () => {
  test("anchors the first press at 0, keeps intervals", () => {
    expect(fallbackFromIntervals([5000, 8000, 12000])).toEqual([0, 3, 7]);
  });
  test("empty → []", () => {
    expect(fallbackFromIntervals([])).toEqual([]);
  });
});

describe("applyOffset + moveBoundary", () => {
  test("global nudge shifts all, clamped ≥ 0", () => {
    expect(applyOffset([1, 2, 3], 0.5)).toEqual([1.5, 2.5, 3.5]);
    expect(applyOffset([0.2, 1], -0.5)).toEqual([0, 0.5]);
  });
  test("per-boundary drag stays between neighbours", () => {
    expect(moveBoundary([1, 2, 3], 1, 2.5)).toEqual([1, 2.5, 3]);
    // clamps above the next boundary
    expect(moveBoundary([1, 2, 3], 1, 9)[1]).toBeCloseTo(2.95, 2);
  });
});

describe("segmentsFromBoundaries", () => {
  test("boundaries split a 30s clip into per-beat segments", () => {
    expect(segmentsFromBoundaries([8, 15, 22], 30)).toEqual([
      { start: 0, end: 8 }, { start: 8, end: 15 }, { start: 15, end: 22 }, { start: 22, end: 30 },
    ]);
  });
  test("out-of-range / duplicate boundaries are ignored", () => {
    expect(segmentsFromBoundaries([-1, 10, 10, 40], 30)).toEqual([
      { start: 0, end: 10 }, { start: 10, end: 30 },
    ]);
  });
  test("no boundaries → one whole-clip segment", () => {
    expect(segmentsFromBoundaries([], 12)).toEqual([{ start: 0, end: 12 }]);
  });
});
