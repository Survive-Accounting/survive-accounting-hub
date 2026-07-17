import { describe, expect, test } from "bun:test";

import { computeTrim, isPublishable, trimLabel } from "./intro-trim";

describe("computeTrim", () => {
  test("onset within the take → trim from the onset for the full length", () => {
    expect(computeTrim(1, 8, 6)).toEqual({ trimStart: 1, trimmedDuration: 6, warning: null });
    expect(computeTrim(0.5, 8, 6)).toEqual({ trimStart: 0.5, trimmedDuration: 6, warning: null });
  });

  test("late onset is clamped so the window fits inside the raw take", () => {
    // onset 3 of an 8s take at length 6 → window can't start past 8-6=2
    expect(computeTrim(3, 8, 6)).toEqual({ trimStart: 2, trimmedDuration: 6, warning: null });
  });

  test("too_short wins: raw shorter than length → no trim, flagged, blocks publish", () => {
    expect(computeTrim(1, 4, 6)).toEqual({ trimStart: 0, trimmedDuration: 4, warning: "too_short" });
    expect(computeTrim(0, 5.9, 6)).toEqual({ trimStart: 0, trimmedDuration: 5.9, warning: "too_short" });
    expect(isPublishable(computeTrim(1, 4, 6).warning)).toBe(false);
  });

  test("no onset (silent / fade-in) → trim from 0, flagged verify, still publishes", () => {
    const r = computeTrim(null, 8, 6);
    expect(r).toEqual({ trimStart: 0, trimmedDuration: 6, warning: "onset_not_detected" });
    expect(isPublishable(r.warning)).toBe(true);
  });

  test("exact-length take is not too short", () => {
    expect(computeTrim(0, 6, 6).warning).toBeNull();
  });

  test("changing the length re-derives (re-trim keeps the onset)", () => {
    expect(computeTrim(1, 8, 5.5)).toEqual({ trimStart: 1, trimmedDuration: 5.5, warning: null });
  });
});

describe("trimLabel + isPublishable", () => {
  test("label reads raw → trimmed to one decimal", () => {
    expect(trimLabel(8.23, 6)).toBe("raw 8.2s → trimmed 6.0s");
  });
  test("isPublishable: clean + onset_not_detected publish; too_short does not", () => {
    expect(isPublishable(null)).toBe(true);
    expect(isPublishable("onset_not_detected")).toBe(true);
    expect(isPublishable("too_short")).toBe(false);
  });
});
