// LEARN ← REVIEW PLAN tests. The rule under test: what Lee films from is what
// students get. Skipped cards never reach /learn, plan order wins over bank
// order, and a set with no plan falls back to the nodes (null here).
import { describe, expect, test } from "bun:test";

import type { BlastFrame, BlastPlan } from "@/components/blastoff/plan";
import { cramCardsFromPlan, practiceIdsFromPlan, readLearnPlan } from "./learn-plan";

const plan = (frames: BlastFrame[]): BlastPlan => ({ frames, updatedAt: "2026-09-04T00:00:00.000Z" });
const ceq = (id: string, ceqId: string, skipped?: boolean): BlastFrame => ({ id, kind: "ceq", ceqId, ...(skipped ? { skipped } : {}) });

describe("readLearnPlan — deck.blastOff as stored", () => {
  test("absent / empty / malformed reads as no plan", () => {
    expect(readLearnPlan(undefined)).toBeNull();
    expect(readLearnPlan(null)).toBeNull();
    expect(readLearnPlan({})).toBeNull();
    expect(readLearnPlan({ frames: [] })).toBeNull();
    expect(readLearnPlan({ frames: [{ id: "x", kind: "not-a-kind" }] })).toBeNull();
    expect(readLearnPlan({ frames: [{ kind: "ceq" }] })).toBeNull();
    expect(readLearnPlan({ frames: ["nope"] })).toBeNull();
  });
  test("a stored plan reads back with its frames and updatedAt", () => {
    const p = readLearnPlan({ frames: [{ id: "a", kind: "open" }, { id: "b", kind: "ceq", ceqId: "ceq-1" }], updatedAt: "t" });
    expect(p).not.toBeNull();
    expect(p!.frames.map((f) => f.id)).toEqual(["a", "b"]);
    expect(p!.updatedAt).toBe("t");
  });
});

describe("practiceIdsFromPlan — the questions students practise", () => {
  test("no plan → null (fall back to the nodes)", () => {
    expect(practiceIdsFromPlan(null)).toBeNull();
    expect(practiceIdsFromPlan(undefined)).toBeNull();
    expect(practiceIdsFromPlan(plan([]))).toBeNull();
  });
  test("a plan with no set cards → null (nothing to pick from)", () => {
    expect(practiceIdsFromPlan(plan([{ id: "o", kind: "open" }, { id: "p", kind: "phrase", text: "hi" }]))).toBeNull();
  });
  test("skipped cards are excluded — 'skip' means it does NOT reach /learn", () => {
    const p = plan([ceq("f1", "ceq-1"), ceq("f2", "ceq-2", true), ceq("f3", "ceq-3")]);
    expect(practiceIdsFromPlan(p)).toEqual(["ceq-1", "ceq-3"]);
  });
  test("plan order is respected, not bank order", () => {
    const p = plan([{ id: "o", kind: "open" }, ceq("f3", "ceq-3"), { id: "c", kind: "cheat", title: "T" }, ceq("f1", "ceq-1"), ceq("f2", "ceq-2"), { id: "x", kind: "outro" }]);
    expect(practiceIdsFromPlan(p)).toEqual(["ceq-3", "ceq-1", "ceq-2"]);
  });
  test("a card filmed twice (duplicated frame) is one question", () => {
    const p = plan([ceq("f1", "ceq-1"), ceq("f2", "ceq-2"), ceq("f1b", "ceq-1")]);
    expect(practiceIdsFromPlan(p)).toEqual(["ceq-1", "ceq-2"]);
  });
  test("every set card skipped → an empty list, NOT a fallback to the nodes", () => {
    expect(practiceIdsFromPlan(plan([ceq("f1", "ceq-1", true)]))).toEqual([]);
  });
  test("a ceq frame with no ceqId is ignored", () => {
    expect(practiceIdsFromPlan(plan([{ id: "f0", kind: "ceq" }, ceq("f1", "ceq-1")]))).toEqual(["ceq-1"]);
  });
});

describe("cramCardsFromPlan — the detour slides as cram cards", () => {
  test("no plan → null (fall back to the nodes)", () => {
    expect(cramCardsFromPlan(null)).toBeNull();
    expect(cramCardsFromPlan(undefined)).toBeNull();
    expect(cramCardsFromPlan(plan([]))).toBeNull();
  });
  test("a plan with no inserts → an empty list, not a fallback", () => {
    expect(cramCardsFromPlan(plan([{ id: "o", kind: "open" }, ceq("f1", "ceq-1")]))).toEqual([]);
  });
  test("phrase / cheat / tip only, in plan order, ids as the sync would write them", () => {
    const p = plan([
      { id: "o", kind: "open" },
      { id: "t1", kind: "tip", text: "  An aside  " },
      ceq("f1", "ceq-1"),
      { id: "p1", kind: "phrase", text: "Internal users", bullets: ["Management", " Budgets ", ""] },
      { id: "b1", kind: "bolt" },
      { id: "ad1", kind: "ad", ad: "greek" },
      { id: "e1", kind: "exhibit", exhibitRef: "cycle" },
      { id: "c1", kind: "cheat", title: "Debits left", body: "Credits right", bullets: ["Always"] },
      { id: "x", kind: "outro" },
    ]);
    expect(cramCardsFromPlan(p)).toEqual([
      { id: "blast-t1", kind: "tip", text: "An aside", bullets: [] },
      { id: "blast-p1", kind: "phrase", text: "Internal users", bullets: ["Management", "Budgets"] },
      { id: "blast-c1", kind: "cheat", text: "Debits left", bullets: ["Credits right", "Always"] },
    ]);
  });
  test("a cheat code's text is its title and its body is the FIRST bullet", () => {
    const [c] = cramCardsFromPlan(plan([{ id: "c1", kind: "cheat", title: " Rule ", body: " Why ", bullets: ["More"] }]))!;
    expect(c).toEqual({ id: "blast-c1", kind: "cheat", text: "Rule", bullets: ["Why", "More"] });
    const [noBody] = cramCardsFromPlan(plan([{ id: "c2", kind: "cheat", title: "Rule", bullets: ["More"] }]))!;
    expect(noBody.bullets).toEqual(["More"]);
  });
  test("skipped inserts are excluded", () => {
    const p = plan([{ id: "p1", kind: "phrase", text: "Keep" }, { id: "p2", kind: "phrase", text: "Gone", skipped: true }]);
    expect(cramCardsFromPlan(p)!.map((c) => c.id)).toEqual(["blast-p1"]);
  });
  test("an insert with no words is not a card", () => {
    expect(cramCardsFromPlan(plan([{ id: "p1", kind: "phrase", text: "   " }, { id: "c1", kind: "cheat", body: "body only" }]))).toEqual([]);
  });
});
