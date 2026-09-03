// PHRASE BANK — the rules the teleprompter run depends on: bank order is
// click order, blue never reaches the prompter, and Enter/Shift+Enter wrap.
import { describe, expect, test } from "bun:test";

import {
  applyMark, clampIndex, emptyPhraseBank, markOf, sayPhrases, scriptLineId, stepIndex,
  type PhraseBankDoc,
} from "./phrase-bank";

const S = "tts_1";
const mark = (d: PhraseBankDoc, id: string, text: string, m: "say" | "show", at: string) =>
  applyMark(d, { id, sessionId: S, text, mark: m }, at);

describe("banking a line", () => {
  test("clicks bank in click order, and blue is never banked", () => {
    let d = emptyPhraseBank();
    d = mark(d, "a", "first line", "say", "2026-09-03T00:00:01Z");
    d = mark(d, "b", "a chart", "show", "2026-09-03T00:00:02Z");
    d = mark(d, "c", "second line", "say", "2026-09-03T00:00:03Z");
    expect(sayPhrases(d, S).map((p) => p.text)).toEqual(["first line", "second line"]);
    expect(markOf(d, "b")).toBe("show");
  });

  test("marking the same line the same colour twice changes nothing", () => {
    let d = emptyPhraseBank();
    d = mark(d, "a", "line", "say", "2026-09-03T00:00:01Z");
    const before = d;
    d = mark(d, "a", "line", "say", "2026-09-03T00:00:09Z");
    expect(d).toBe(before);
    expect(sayPhrases(d, S)).toHaveLength(1);
  });

  test("re-marking a line the other colour re-classifies it IN PLACE — the order never shuffles", () => {
    let d = emptyPhraseBank();
    d = mark(d, "a", "one", "say", "2026-09-03T00:00:01Z");
    d = mark(d, "b", "two", "say", "2026-09-03T00:00:02Z");
    d = mark(d, "c", "three", "say", "2026-09-03T00:00:03Z");
    d = mark(d, "a", "one", "show", "2026-09-03T00:00:04Z");
    expect(sayPhrases(d, S).map((p) => p.text)).toEqual(["two", "three"]);
    d = mark(d, "a", "one", "say", "2026-09-03T00:00:05Z");
    expect(sayPhrases(d, S).map((p) => p.text)).toEqual(["one", "two", "three"]);
  });

  test("another session's marks stay out of this session's bank", () => {
    let d = emptyPhraseBank();
    d = mark(d, "a", "mine", "say", "2026-09-03T00:00:01Z");
    d = applyMark(d, { id: "z", sessionId: "tts_other", text: "theirs", mark: "say" }, "2026-09-03T00:00:02Z");
    expect(sayPhrases(d, S).map((p) => p.text)).toEqual(["mine"]);
    expect(sayPhrases(d, null)).toEqual([]);
  });

  test("line ids are stable per beat and line", () => {
    expect(scriptLineId("ttb_9", 2, 0)).toBe("ttb_9#2.0");
    expect(scriptLineId("ttb_9", 2, 0)).not.toBe(scriptLineId("ttb_9", 2, 1));
  });
});

describe("prompter navigation wraps", () => {
  test("Enter walks forward and wraps at the end", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(1, 3, 1)).toBe(2);
    expect(stepIndex(2, 3, 1)).toBe(0);
  });
  test("Shift+Enter walks back and wraps to the last", () => {
    expect(stepIndex(0, 3, -1)).toBe(2);
    expect(stepIndex(2, 3, -1)).toBe(1);
  });
  test("an empty bank stays at 0 in both directions", () => {
    expect(stepIndex(0, 0, 1)).toBe(0);
    expect(stepIndex(0, 0, -1)).toBe(0);
  });
  test("an index survives a list that shrank under it", () => {
    expect(clampIndex(5, 3)).toBe(2);
    expect(clampIndex(1, 3)).toBe(1);
    expect(clampIndex(2, 0)).toBe(0);
  });
});
