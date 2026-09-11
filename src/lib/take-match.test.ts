// A stored transcript is reused only when it fits the picked file.
import { describe, expect, test } from "bun:test";

import { clock, transcriptFitsFile } from "./take-match";

describe("the stored transcript and the picked file", () => {
  test("the same take fits; a different one doesn't", () => {
    expect(transcriptFitsFile(118.22, 118.4)).toBe(true);            // Lee's assets take, to the frame
    expect(transcriptFitsFile(118.22, 45)).toBe(false);              // a shorter take for the same slot
    expect(transcriptFitsFile(300, 309)).toBe(true);                 // 3 % of a five-minute file
    expect(transcriptFitsFile(300, 312)).toBe(false);
  });

  test("an unknown length can't be checked, so the stored words stand", () => {
    expect(transcriptFitsFile(null, 60)).toBe(true);
    expect(transcriptFitsFile(60, null)).toBe(true);
    expect(transcriptFitsFile(60, Number.NaN)).toBe(true);
  });

  test("the clock", () => {
    expect(clock(118.22)).toBe("1:58");
    expect(clock(59.6)).toBe("1:00");
    expect(clock(7)).toBe("0:07");
    expect(clock(null)).toBe("?:??");
  });
});
