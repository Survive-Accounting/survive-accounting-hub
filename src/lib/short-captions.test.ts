// POST-PRODUCTION's pure half. The burn happens on Lee's laptop with one pasted command, so the
// command and the file names have to be right the first time — there is no error message coming
// back from a terminal he ran an hour later.
import { describe, expect, test } from "bun:test";

import {
  assName, burnCommand, burnedName, filterPath, shortCaptionFiles, SHORT_H, SHORT_W,
  srtName, takeStem, transcriptFromWords, whisperCostUsd, type Word,
} from "./short-captions";

const say = (text: string, from = 0, per = 0.4): Word[] =>
  text.split(" ").map((t, i) => ({ t, s: from + i * per, e: from + i * per + per * 0.9 }));

describe("the files", () => {
  const words = say("let us cram for your exam assets are what you own and control today");
  test("an SRT and an ASS both come out, from the same cards", () => {
    const f = shortCaptionFiles(words);
    expect(f.cards).toBeGreaterThan(0);
    expect(f.srt).toContain("-->");
    expect(f.srt.startsWith("1\n")).toBe(true);
    expect(f.ass).toContain("[Script Info]");
    expect(f.ass).toContain(`PlayResX: ${SHORT_W}`);
    expect(f.ass).toContain(`PlayResY: ${SHORT_H}`);
    expect(f.ass).toContain("Dialogue:");
  });
  test("the karaoke timing is in the ASS — the spoken word is what lights", () => {
    expect(shortCaptionFiles(words).ass).toMatch(/\{\\k\d+\}/);
  });
  test("every spoken word survives into the subtitles", () => {
    const f = shortCaptionFiles(words);
    for (const w of ["cram", "exam", "assets", "control"]) expect(f.srt).toContain(w);
  });
  test("the seconds are read off the last word, and no words is not a crash", () => {
    expect(shortCaptionFiles(words).seconds).toBeCloseTo(words[words.length - 1].e, 6);
    const empty = shortCaptionFiles([]);
    expect(empty.cards).toBe(0);
    expect(empty.seconds).toBe(0);
    expect(empty.ass).toContain("[Events]");
  });
  test("a take filmed without the corner camera gets the full width", () => {
    const home = shortCaptionFiles(words, "home");
    const wide = shortCaptionFiles(words, "none");
    expect(wide.ass).not.toBe(home.ass); // different MarginL
  });
});

describe("naming", () => {
  test("the sidecars sit beside the take, sharing its stem", () => {
    expect(srtName("Assets 2026-09-09.mp4")).toBe("Assets 2026-09-09.srt");
    expect(assName("Assets 2026-09-09.mp4")).toBe("Assets 2026-09-09.ass");
    expect(burnedName("Assets 2026-09-09.mp4")).toBe("Assets 2026-09-09.captioned.mp4");
  });
  test("an odd name still produces something usable", () => {
    expect(takeStem("take.MOV")).toBe("take");
    expect(takeStem("no-extension")).toBe("no-extension");
    expect(takeStem("")).toBe("take");
    // A dot in the middle is not an extension.
    expect(takeStem("2026.09.09 assets.mp4")).toBe("2026.09.09 assets");
  });
});

describe("the burn command", () => {
  test("it names the take, the subtitles and the output, and copies the audio", () => {
    const cmd = burnCommand("Assets.mp4");
    expect(cmd).toContain(`-i "Assets.mp4"`);
    expect(cmd).toContain("ass='Assets.ass'");
    expect(cmd).toContain(`"Assets.captioned.mp4"`);
    expect(cmd).toContain("-c:a copy");
    expect(cmd).toContain("+faststart");
  });
  test("a Windows fonts directory is escaped the way ffmpeg's filter parser wants", () => {
    expect(filterPath("C:\\Users\\lee\\fonts")).toBe("C\\:/Users/lee/fonts");
    expect(burnCommand("Assets.mp4", { fontsDir: "C:\\fonts" })).toContain("fontsdir='C\\:/fonts'");
  });
  test("no fonts directory leaves the filter clean rather than empty-valued", () => {
    expect(burnCommand("Assets.mp4")).not.toContain("fontsdir");
  });
  test("a name with a space stays quoted so the shell sees one argument", () => {
    const cmd = burnCommand("Assets take 2.mp4");
    expect(cmd).toContain(`-i "Assets take 2.mp4"`);
    expect(cmd).toContain(`"Assets take 2.captioned.mp4"`);
  });
});

describe("the transcript", () => {
  test("words join into a readable line, punctuation kept tight", () => {
    const w: Word[] = [{ t: "Cash", s: 0, e: 1 }, { t: "is", s: 1, e: 2 }, { t: "an", s: 2, e: 3 }, { t: "asset", s: 3, e: 4 }, { t: ".", s: 4, e: 4 }];
    expect(transcriptFromWords(w)).toBe("Cash is an asset.");
    expect(transcriptFromWords([])).toBe("");
  });
});

describe("the price", () => {
  test("a three-minute short costs under two cents, and is billed rounded up", () => {
    expect(whisperCostUsd(180)).toBeCloseTo(0.018, 6);
    expect(whisperCostUsd(0)).toBe(0);
    expect(whisperCostUsd(0.2)).toBeGreaterThan(0);
  });
});
