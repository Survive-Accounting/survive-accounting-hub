// The exam menu's pure bits: which step a path keeps, where a set's link goes, every topic under
// Exam 1 until the bank knows better.
import { describe, expect, test } from "bun:test";

import type { BoothTopic } from "@/lib/talkthrough.functions";

import { EXAMS, examOf, setPath, stepSegOf } from "./ExamTopicsMenu";

describe("the exam topics menu", () => {
  test("keeps the step you are on", () => {
    expect(stepSegOf("/v3/easy-points/accounting-equation-effects/blast-off/results")).toBe("results");
    expect(stepSegOf("/v3/easy-points/accounting-equation-effects/blast-off/film")).toBe("film");
    expect(stepSegOf("/v3/easy-points/accounting-equation-effects")).toBeUndefined();
    expect(stepSegOf("/v3/post")).toBeUndefined();
  });

  test("a set's link is the blastOffPath spelling, with or without a step", () => {
    const t: BoothTopic = { id: "t", name: "Easy Points", number: 1, sets: [{ id: "s", name: "Debit vs. credit effects", ceqs: [], liveCount: 0, draftCount: 0 }] };
    expect(setPath(t, t.sets[0], "film")).toBe("/v3/easy-points/debit-vs-credit-effects/blast-off/film");
    expect(setPath(t, t.sets[0])).toBe("/v3/easy-points/debit-vs-credit-effects");
  });

  test("four exams, Exam 1 first; every topic is Exam 1 today", () => {
    expect(EXAMS.map((e) => e.label)).toEqual(["Exam 1", "Exam 2", "Exam 3", "Final"]);
    expect(examOf({ id: "t", name: "Anything", number: 9, sets: [] })).toBe("exam1");
  });
});
