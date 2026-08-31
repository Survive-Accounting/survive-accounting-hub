// THE PLAN is what Lee films, so its two dangerous failures are: a question in
// the bank that never becomes a frame (unfilmed), and a frame for a question
// that no longer exists (filmed for nothing). Both are pinned here.
import { describe, expect, test } from "bun:test";

import {
  generatePlan, insertFrame, moveFrame, newFrameId, reconcilePlan, removeFrame,
  type BlastFrame, type PlanCeq,
} from "./plan";

const ceqs: PlanCeq[] = [
  { id: "q1", label: "Q1", stem: "First?" },
  { id: "q2", label: "Q2", stem: "Second?" },
  { id: "q3", label: "Q3", stem: "Third?" },
];
const kinds = (f: readonly BlastFrame[]) => f.map((x) => x.kind);

describe("generatePlan", () => {
  test("intro, found-on-exam, every question, outro", () => {
    expect(kinds(generatePlan(ceqs).frames)).toEqual(["intro", "foye", "ceq", "ceq", "ceq", "outro"]);
  });
  test("note-only and draft cards are not questions and are never filmed", () => {
    const p = generatePlan([...ceqs, { id: "n1", label: "N", stem: "note", noteOnly: true }, { id: "d1", label: "D", stem: "draft", draft: true }]);
    expect(p.frames.filter((f) => f.kind === "ceq").map((f) => f.ceqId)).toEqual(["q1", "q2", "q3"]);
  });
});

describe("reconcilePlan", () => {
  test("no stored plan generates the spine", () => {
    expect(kinds(reconcilePlan(null, ceqs).frames)).toEqual(["intro", "foye", "ceq", "ceq", "ceq", "outro"]);
  });
  test("a question ADDED to the bank appears — it must not go unfilmed", () => {
    const stored = generatePlan(ceqs);
    const grown = reconcilePlan(stored, [...ceqs, { id: "q4", label: "Q4", stem: "Fourth?" }]);
    expect(grown.frames.filter((f) => f.kind === "ceq").map((f) => f.ceqId)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(grown.frames[grown.frames.length - 1].kind).toBe("outro"); // still last
  });
  test("a question REMOVED from the bank drops out — no filming a ghost", () => {
    const stored = generatePlan(ceqs);
    const shrunk = reconcilePlan(stored, [ceqs[0], ceqs[2]]);
    expect(shrunk.frames.filter((f) => f.kind === "ceq").map((f) => f.ceqId)).toEqual(["q1", "q3"]);
  });
  test("inserts, order and overrides all survive reconciliation", () => {
    const stored = generatePlan(ceqs);
    const withInsert = {
      ...stored,
      frames: insertFrame(stored.frames, { id: newFrameId("phrase"), kind: "phrase", text: "Question order is teaching order." }, 2),
    };
    const back = reconcilePlan(withInsert, ceqs);
    const phrase = back.frames.find((f) => f.kind === "phrase");
    expect(phrase?.text).toBe("Question order is teaching order.");
    expect(kinds(back.frames)).toEqual(["intro", "foye", "ceq", "phrase", "ceq", "ceq", "outro"]);
  });
  test("a mangled plan still opens with an intro and closes with an outro", () => {
    const busted = { frames: [{ id: "x", kind: "phrase" as const, text: "orphan" }], updatedAt: "" };
    const fixed = reconcilePlan(busted, ceqs);
    expect(fixed.frames[0].kind).toBe("intro");
    expect(fixed.frames[fixed.frames.length - 1].kind).toBe("outro");
  });
});

describe("reordering", () => {
  const base = generatePlan(ceqs).frames;

  test("a question moves within the run", () => {
    expect(kinds(moveFrame(base, 2, 4))).toEqual(["intro", "foye", "ceq", "ceq", "ceq", "outro"]);
    expect(moveFrame(base, 2, 4).filter((f) => f.kind === "ceq").map((f) => f.ceqId)).toEqual(["q2", "q3", "q1"]);
  });
  test("the intro never leaves the front and the outro never leaves the back", () => {
    expect(moveFrame(base, 0, 3)[0].kind).toBe("intro");                       // intro is immovable
    const last = base.length - 1;
    expect(moveFrame(base, last, 1)[last].kind).toBe("outro");                  // outro is immovable
    const moved = moveFrame(base, 2, 99);                                       // past the end
    expect(moved[moved.length - 1].kind).toBe("outro");
  });
  test("an insert lands inside the run, never before the intro or after the outro", () => {
    const f: BlastFrame = { id: "n", kind: "tip", text: "t" };
    expect(insertFrame(base, f, -5)[0].kind).toBe("intro");
    const end = insertFrame(base, f, 99);
    expect(end[end.length - 1].kind).toBe("outro");
    expect(end[end.length - 2].kind).toBe("tip");
  });
  test("remove drops inserts but refuses to drop the intro or outro", () => {
    const withTip = insertFrame(base, { id: "n", kind: "tip", text: "t" }, 2);
    expect(kinds(removeFrame(withTip, "n"))).toEqual(kinds(base));
    expect(kinds(removeFrame(base, base[0].id))).toEqual(kinds(base));
    expect(kinds(removeFrame(base, base[base.length - 1].id))).toEqual(kinds(base));
  });
});
