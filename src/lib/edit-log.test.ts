import { describe, expect, test } from "bun:test";

import { rankEditExamples } from "./edit-log.functions";

describe("rankEditExamples", () => {
  test("shorten-edited outranks manual, newest first within each; shorten rows and no-op pairs are dropped; capped", () => {
    const ex = rankEditExamples([
      { kind: "ceq", source: "manual", before: { stem: "a" }, after: { stem: "b" }, createdAt: "2026-09-07T10:00:00Z" },
      { kind: "ceq", source: "shorten", before: { stem: "x" }, after: { stem: "y" }, createdAt: "2026-09-07T11:00:00Z" },
      { kind: "callout", source: "shorten-edited", before: { title: "t" }, after: { title: "u" }, createdAt: "2026-09-07T09:00:00Z" },
      { kind: "ceq", source: "manual", before: { stem: "same" }, after: { stem: "same" }, createdAt: "2026-09-07T12:00:00Z" },
      { kind: "ceq", source: "manual", before: { stem: "c" }, after: { stem: "d" }, createdAt: "2026-09-07T12:30:00Z" },
      { kind: "weird", source: "manual", before: { stem: "c" }, after: { stem: "d" }, createdAt: "2026-09-07T12:30:00Z" },
    ], 2);
    expect(ex).toEqual([
      { kind: "callout", source: "shorten-edited", before: { title: "t" }, after: { title: "u" } },
      { kind: "ceq", source: "manual", before: { stem: "c" }, after: { stem: "d" } },
    ]);
  });
  test("a stored row is read defensively — odd shapes become empty fields", () => {
    const ex = rankEditExamples([{ kind: "ceq", source: "manual", before: { stem: 3, choices: [{ text: "a", correct: "yes" }, null] }, after: "nope", createdAt: "" }]);
    expect(ex[0].before).toEqual({ choices: [{ text: "a", correct: true }, { text: "", correct: false }] });
    expect(ex[0].after).toEqual({});
  });
});
