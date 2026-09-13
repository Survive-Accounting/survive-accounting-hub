// One continuous take, many videos (G) — pinned: split boundaries from the slide timeline, walking
// back never ends a split, scraps come out of the split they're in, one ffmpeg line per split.
import { describe, expect, test } from "bun:test";

import { editScript, keptSeconds, mergeCuts, partFileName, pauseCuts, sliceCommands, speedWindows, splitRanges, scrapsWithin, tidyArrivals } from "./take-slice";

describe("cutting the pauses", () => {
  // words at 1–2, 2.3–3 (short gap), 6–7 (long gap), 7.2–8; the file is 12 s
  const words = [{ start: 1, end: 2 }, { start: 2.3, end: 3 }, { start: 6, end: 7 }, { start: 7.2, end: 8 }];
  test("gentle: silence over 1.2 s comes out with a breath either side, plus the head and tail", () => {
    const cuts = pauseCuts(words, 12, "gentle");
    expect(cuts).toEqual([{ start: 0, end: 0.75 }, { start: 3.25, end: 5.75 }, { start: 8.25, end: 12 }]);
    expect(pauseCuts(words, 12, "off")).toEqual([]);
  });
  test("a speed-run slide's window keeps its pauses", () => {
    const keep = speedWindows([{ frameId: "a", take: 0, atMs: 0 }, { frameId: "speed", take: 0, atMs: 4000 }, { frameId: "b", take: 0, atMs: 5000 }], 12, (id) => id === "speed");
    expect(keep).toEqual([{ start: 4, end: 5 }]);
    expect(pauseCuts(words, 12, "gentle", keep)).toEqual([{ start: 0, end: 0.75 }, { start: 3.25, end: 4 }, { start: 5, end: 5.75 }, { start: 8.25, end: 12 }]);
  });
  test("scraps and pauses merge into one cut list; the script runs from its own folder", () => {
    expect(mergeCuts([{ start: 3, end: 5 }], [{ start: 4, end: 6 }, { start: 8, end: 9 }])).toEqual([{ start: 3, end: 6 }, { start: 8, end: 9 }]);
    const s = editScript(["ffmpeg -i \"a.mp4\" \"a.cut.mp4\""]);
    expect(s).toContain("cd /d \"%~dp0\"");
    expect(s).toContain("winget install --id Gyan.FFmpeg -e");
    expect(s).toContain("ffmpeg -i \"a.mp4\" \"a.cut.mp4\"");
  });
});

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
