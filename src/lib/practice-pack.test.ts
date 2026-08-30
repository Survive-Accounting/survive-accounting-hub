// PRACTICE PACK tests — the HARD RULE is the contract: only free Exam-1
// content can ever reach the generator, and the guard that enforces it is
// attacked directly here (QA gauntlet #5). Plus the cache hash and the wrap.
import { describe, expect, test } from "bun:test";

import { assertPackSafety, packHash, wrapText, type PackTopic } from "./practice-pack.server";

describe("assertPackSafety — the paid-content guard, attacked directly", () => {
  const free = { id: "d1", name: "Free set", access: "free", inExam1Unit: true };
  test("free Exam-1 decks pass", () => {
    expect(() => assertPackSafety([free, { ...free, id: "d2", access: undefined }])).not.toThrow();
  });
  test("a PAID deck can never reach the generator", () => {
    expect(() => assertPackSafety([free, { id: "p1", name: "Exam 2 set", access: "paid", inExam1Unit: true }]))
      .toThrow(/paid set "Exam 2 set"/);
  });
  test("a deck outside the Exam 1 unit can never reach the generator", () => {
    expect(() => assertPackSafety([{ id: "x", name: "Exam 3 thing", access: "free", inExam1Unit: false }]))
      .toThrow(/outside the Exam 1 unit/);
  });
  test("the guard refuses BEFORE any rendering — it throws, never filters", () => {
    // Filtering would silently ship the rest; throwing fails the whole pack
    // closed, which is the rule ("paid-exam content never renders to PDF").
    expect(() => assertPackSafety([free, { id: "p", name: "P", access: "paid", inExam1Unit: true }, free])).toThrow();
  });
});

describe("packHash — the ETag key", () => {
  const topics: PackTopic[] = [
    { name: "Closing Entries", sets: [{ name: "Which accounts get closed?", questions: [
      { n: 1, stem: "Which close?", choices: [{ text: "Revenues", correct: true, feedback: "Temporary." }, { text: "Assets", correct: false, feedback: null }] },
    ] }] },
  ];
  test("stable for identical content", () => {
    expect(packHash(topics)).toBe(packHash(JSON.parse(JSON.stringify(topics))));
  });
  test("changes when a stem, choice, correct mark or feedback changes", () => {
    const h = packHash(topics);
    const flip = (mut: (t: PackTopic[]) => void) => { const c = JSON.parse(JSON.stringify(topics)) as PackTopic[]; mut(c); return packHash(c); };
    expect(flip((t) => { t[0].sets[0].questions[0].stem = "Which ones close?"; })).not.toBe(h);
    expect(flip((t) => { t[0].sets[0].questions[0].choices[0].text = "Revenue"; })).not.toBe(h);
    expect(flip((t) => { t[0].sets[0].questions[0].choices[0].correct = false; })).not.toBe(h);
    expect(flip((t) => { t[0].sets[0].questions[0].choices[0].feedback = "changed"; })).not.toBe(h);
  });
});

describe("wrapText", () => {
  // A stub font with fixed 6pt-per-char width at size 12 — deterministic.
  const font = { widthOfTextAtSize: (t: string, size: number) => t.length * (size / 2) } as never;
  test("wraps at the measured width and loses no words", () => {
    const text = "the quick brown fox jumps over the lazy dog";
    const lines = wrapText(text, font, 12, 60); // 10 chars per line at 6pt/char
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toBe(text);
    for (const l of lines) expect(l.length * 6).toBeLessThanOrEqual(60 + 6 * 10); // no line wildly over
  });
  test("a single over-wide word still lands on its own line", () => {
    expect(wrapText("supercalifragilistic", font, 12, 30)).toEqual(["supercalifragilistic"]);
  });
});
