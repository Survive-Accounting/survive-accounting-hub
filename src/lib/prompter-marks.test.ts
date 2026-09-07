// 2026-09-07 — Lee: "transition phrase is yellow but the word itself is orange." The painter
// every prompter surface shares: the segments must cover the line exactly once, in order.
import { describe, expect, test } from "bun:test";

import { markStyle, paintLine, PHRASE_BG, WORD_BG, WORD_INK } from "./prompter-marks";

const line = "External means outside the company. No paycheck? External. Next question.";
const join = (segs: { text: string }[]) => segs.map((s) => s.text).join("");

describe("paintLine", () => {
  test("phrase yellow, the word orange inside it, plain text between — and the whole line, once", () => {
    const segs = paintLine(line, { phrase: "No paycheck? External.", word: "External" });
    expect(segs).toEqual([
      { text: "External means outside the company. ", tone: "plain" },
      { text: "No paycheck? ", tone: "phrase" },
      { text: "External", tone: "word" },
      { text: ".", tone: "phrase" },
      { text: " Next question.", tone: "plain" },
    ]);
    expect(join(segs)).toBe(line);
  });
  test("no marks, or marks that aren't in the line → one plain segment; an empty line → none", () => {
    expect(paintLine(line, undefined)).toEqual([{ text: line, tone: "plain" }]);
    expect(paintLine(line, { phrase: "banana" })).toEqual([{ text: line, tone: "plain" }]);
    expect(paintLine("", { phrase: "x" })).toEqual([]);
  });
  test("a mark at the very start or the very end leaves no empty plain segment", () => {
    expect(paintLine(line, { word: "External" })[0]).toEqual({ text: "External", tone: "word" });
    const tail = paintLine(line, { phrase: "Next question." });
    expect(tail[tail.length - 1]).toEqual({ text: "Next question.", tone: "phrase" });
    expect(tail).toHaveLength(2);
    expect(join(tail)).toBe(line);
  });
  test("only the cue word, on a keywords-mode row — the transition row or a fragment that holds it", () => {
    expect(paintLine("→ Next question.", { word: "Next" })).toEqual([{ text: "→ ", tone: "plain" }, { text: "Next", tone: "word" }, { text: " question.", tone: "plain" }]);
    expect(paintLine("no paycheck → external", { word: "External" })).toEqual([{ text: "no paycheck → ", tone: "plain" }, { text: "external", tone: "word" }]);
  });
});

describe("markStyle — one yellow, one orange, everywhere", () => {
  test("the phrase only tints behind the words (the text keeps the window's colour); the word is solid orange, navy, bold", () => {
    expect(markStyle("phrase").background).toBe(PHRASE_BG);
    expect(markStyle("phrase").color).toBeUndefined();
    expect(markStyle("word")).toMatchObject({ background: WORD_BG, color: WORD_INK, fontWeight: 800 });
    expect(markStyle("plain")).toEqual({});
  });
});
