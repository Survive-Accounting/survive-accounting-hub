// One continuous take, many videos (G) — pinned: split boundaries from the slide timeline, walking
// back never ends a split, scraps come out of the split they're in, one ffmpeg line per split.
import { describe, expect, test } from "bun:test";

import { keptSeconds, partFileName, sliceCommands, splitRanges, scrapsWithin, tidyArrivals } from "./take-slice";

const a = (frameId: string, take: number, s: number) => ({ frameId, take, atMs: s * 1000 });

describe("slicing a continuous take", () => {
  // split 0 from 0s; into split 1 at 40s; back to split 0 at 55s (checking a slide); split 1 again at
  // 60s; split 2 at 95s; the file is 130s long.
  const log = [a("i0", 0, 0), a("q0", 0, 10), a("i1", 1, 40), a("q1", 1, 50), a("q0", 0, 55), a("q1", 1, 60), a("i2", 2, 95), a("q2", 2, 100)];

  test("boundaries are the first arrivals of later splits; walking back doesn't end one", () => {
    expect(splitRanges(log, 130)).toEqual([{ take: 0, start: 0, end: 40 }, { take: 1, start: 40, end: 95 }, { take: 2, start: 95, end: 130 }]);
  });

  test("a single-split roll is one range; a roll starting mid-set starts at its first split", () => {
    expect(splitRanges([a("q3", 3, 0), a("q4", 3, 12)], 30)).toEqual([{ take: 3, start: 0, end: 30 }]);
    expect(splitRanges([], 30)).toEqual([]);
  });

  test("the timeline is tidied: sorted, repeats dropped, nothing past the file", () => {
    expect(tidyArrivals([a("x", 0, 5), a("x", 0, 6), a("y", 0, 1)]).map((x) => x.frameId)).toEqual(["y", "x"]);
    expect(splitRanges([a("i0", 0, 0), a("i1", 1, 200)], 130)).toEqual([{ take: 0, start: 0, end: 130 }]);
  });

  test("scraps come out of the split they fall in, clipped to it", () => {
    const cuts = [{ start: 20, end: 30 }, { start: 38, end: 45 }];
    const [r0, r1] = splitRanges(log, 130);
    expect(scrapsWithin(r0, cuts)).toEqual([{ start: 20, end: 30 }, { start: 38, end: 40 }]);
    expect(scrapsWithin(r1, cuts)).toEqual([{ start: 40, end: 45 }]);
    expect(keptSeconds(r0, cuts)).toBe(28);
  });

  test("one ffmpeg line per split, named for the split, marked .cut", () => {
    const lines = sliceCommands("Easy Points run.mp4", splitRanges(log, 130), [{ start: 20, end: 30 }], (t) => ["Assets", "Liabilities", "Equity"][t]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("select='between(t,0.00,40.00)*not(between(t,20.00,30.00))'");
    expect(lines[1]).toContain("select='between(t,40.00,95.00)'");
    expect(lines[2]).toContain(`"Easy Points run.part3-equity.cut.mp4"`);
    expect(partFileName("take.mkv", 0, "Intro to Assets!")).toBe("take.part1-intro-to-assets.cut.mp4");
  });
});
