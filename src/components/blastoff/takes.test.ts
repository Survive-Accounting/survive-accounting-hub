// TAKES — a cut splits the running order into separate videos, and each one owns a name.
// Lee, 2026-09-09: "if we make splits, just in post it could maybe say split 1, split 2, etc…
// I'll name it what I need to. I'd also like to name it from the edit side."
import { describe, expect, test } from "bun:test";

import { nameTake, planTakes, runFor, takeLabel, type BlastFrame } from "./plan";

const f = (id: string, extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind: "ceq", ...extra });

describe("planTakes", () => {
  test("no cuts is one take, and an empty plan is still one take", () => {
    expect(planTakes([f("a"), f("b")]).length).toBe(1);
    expect(planTakes([]).length).toBe(1);
    expect(planTakes([f("a"), f("b")])[0].frames.map((x) => x.id)).toEqual(["a", "b"]);
  });
  test("a cut ends a take and the next slide heads the next one", () => {
    const takes = planTakes([f("a"), f("b", { cutAfter: true }), f("c"), f("d")]);
    expect(takes.map((t) => t.frames.map((x) => x.id))).toEqual([["a", "b"], ["c", "d"]]);
    expect(takes.map((t) => t.headId)).toEqual(["a", "c"]);
    expect(takes.map((t) => t.index)).toEqual([0, 1]);
  });
  test("a cut on the very last slide does not invent an empty take", () => {
    expect(planTakes([f("a"), f("b", { cutAfter: true })]).length).toBe(1);
  });
  test("every frame lands in exactly one take, in order", () => {
    const frames = [f("a"), f("b", { cutAfter: true }), f("c", { cutAfter: true }), f("d"), f("e")];
    const takes = planTakes(frames);
    expect(takes.flatMap((t) => t.frames.map((x) => x.id))).toEqual(["a", "b", "c", "d", "e"]);
    expect(takes.length).toBe(3);
  });
});

describe("names", () => {
  test("the head carries the name and the label falls back to the number", () => {
    const frames = [f("a", { takeName: "Assets" }), f("b", { cutAfter: true }), f("c")];
    const takes = planTakes(frames);
    expect(takeLabel(takes[0])).toBe("Assets");
    expect(takeLabel(takes[1])).toBe("Split 2");
  });
  test("a name on a slide that isn't a head is ignored", () => {
    const takes = planTakes([f("a"), f("b", { takeName: "not a head" })]);
    expect(takes[0].name).toBe("");
    expect(takeLabel(takes[0])).toBe("Split 1");
  });
  test("renaming targets the head, trims, caps at 80 and clears on empty", () => {
    const frames = [f("a"), f("b", { cutAfter: true }), f("c")];
    const named = nameTake(frames, "c", "  Liabilities  ");
    expect(planTakes(named)[1].name).toBe("Liabilities");
    expect(planTakes(nameTake(named, "c", "   "))[1].name).toBe("");
    expect(planTakes(nameTake(frames, "a", "x".repeat(200)))[0].name.length).toBe(80);
  });
  test("renaming an id that isn't there changes nothing", () => {
    const frames = [f("a"), f("b")];
    expect(nameTake(frames, "zz", "x")).toEqual(frames);
  });
});

// runFor — Post has a video's CARDS and needs its SLIDES, brand slides included.
describe("runFor", () => {
  const frames = [
    { id: "i1", kind: "intro" as const },
    { id: "c1", kind: "ceq" as const, ceqId: "q1" },
    { id: "c2", kind: "ceq" as const, ceqId: "q2" },
    { id: "o1", kind: "outro" as const, cutAfter: true as const },
    { id: "i2", kind: "intro" as const },
    { id: "c3", kind: "ceq" as const, ceqId: "q3" },
  ];
  test("the run carries the brand slides around the cards, not just the cards", () => {
    expect(runFor(frames, ["q1"]).map((f) => f.id)).toEqual(["i1", "c1", "c2", "o1"]);
    expect(runFor(frames, ["q3"]).map((f) => f.id)).toEqual(["i2", "c3"]);
  });
  test("no ids, or ids from no run, means the whole plan", () => {
    expect(runFor(frames, []).length).toBe(frames.length);
    expect(runFor(frames, ["nope"]).length).toBe(frames.length);
  });
  test("a plan with no cuts is one run", () => {
    const flat = [{ id: "a", kind: "ceq" as const, ceqId: "q1" }, { id: "b", kind: "ceq" as const, ceqId: "q2" }];
    expect(runFor(flat, ["q2"]).map((f) => f.id)).toEqual(["a", "b"]);
  });
});
