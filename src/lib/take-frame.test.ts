// Grabbing a frame of the take — the arithmetic. Lee: "let me choose between the first few
// seconds (as granular as we can), since often I have my eyes closed at the start."
import { describe, expect, test } from "bun:test";

import {
  contactTimes, DEFAULT_FPS, formatTime, frameFilename, frameIndex, isFrameRate,
  OPENING_SECONDS, stepTime, takeFileProblem,
} from "./take-frame";

describe("stepTime", () => {
  test("one frame forward and back at 30fps", () => {
    expect(stepTime(1, 1, 30, 10)).toBeCloseTo(1 + 1 / 30, 9);
    expect(stepTime(1, -1, 30, 10)).toBeCloseTo(1 - 1 / 30, 9);
    expect(stepTime(1, 10, 30, 10)).toBeCloseTo(1 + 10 / 30, 9);
  });
  test("it clamps to the take rather than doing nothing at the ends", () => {
    expect(stepTime(0, -1, 30, 10)).toBe(0);
    expect(stepTime(9.99, 5, 30, 10)).toBe(10);
    expect(stepTime(4, 1, 30, 0)).toBe(0);
  });
  test("a nonsense fps falls back rather than dividing by zero", () => {
    expect(stepTime(1, 1, 0, 10)).toBeCloseTo(1 + 1 / DEFAULT_FPS, 9);
    expect(Number.isFinite(stepTime(1, 1, -5, 10))).toBe(true);
  });
});

describe("readouts", () => {
  test("the frame number is the time times the rate", () => {
    expect(frameIndex(1, 30)).toBe(30);
    expect(frameIndex(0, 30)).toBe(0);
    expect(frameIndex(1 / 60, 60)).toBe(1);
    expect(frameIndex(-4, 30)).toBe(0);
  });
  test("three decimals — two cannot separate 30fps frames", () => {
    expect(formatTime(1.8333)).toBe("1.833s");
    expect(formatTime(0)).toBe("0.000s");
    expect(formatTime(-1)).toBe("0.000s");
    // 1/30 apart must render differently.
    expect(formatTime(1)).not.toBe(formatTime(1 + 1 / 30));
  });
  test("the filename says which take and exactly where", () => {
    expect(frameFilename("Account classification", 1.8333)).toBe("account-classification-frame-1-833s.png");
    expect(frameFilename("", 0)).toBe("short-frame-0-000s.png");
  });
});

describe("contactTimes", () => {
  test("evenly spaced across the opening, starting at zero", () => {
    const t = contactTimes(30, 6, 4);
    expect(t).toEqual([0, 1.5, 3, 4.5]);
  });
  test("a take shorter than the window is not sampled past its end", () => {
    for (const t of contactTimes(2, 6, 8)) expect(t).toBeLessThanOrEqual(2);
    expect(contactTimes(0, 6, 8)).toEqual([0]);
  });
  test("no duplicates, and the default window is the cold open plus a beat", () => {
    const t = contactTimes(0.001, 6, 8);
    expect(new Set(t).size).toBe(t.length);
    expect(OPENING_SECONDS).toBe(6);
  });
});

describe("the file", () => {
  test("a normal take passes", () => {
    expect(takeFileProblem({ name: "take.mp4", type: "video/mp4", size: 900 })).toBeNull();
    // OBS sometimes hands over an empty type; the extension is enough.
    expect(takeFileProblem({ name: "take.MOV", type: "", size: 900 })).toBeNull();
  });
  test("what cannot be used says why", () => {
    expect(takeFileProblem(null)).toContain("Pick the take");
    expect(takeFileProblem({ name: "notes.pdf", type: "application/pdf", size: 9 })).toContain("video file");
    expect(takeFileProblem({ name: "take.mkv", type: "video/x-matroska", size: 9 })).toContain("Remux");
    expect(takeFileProblem({ name: "take.mp4", type: "video/mp4", size: 0 })).toContain("empty");
  });
  test("the frame rates guard themselves", () => {
    expect(isFrameRate(30)).toBe(true);
    expect(isFrameRate(29.97)).toBe(false);
    expect(isFrameRate("30")).toBe(false);
  });
});
