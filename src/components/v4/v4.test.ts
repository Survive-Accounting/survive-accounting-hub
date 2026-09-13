// v4's pure rules, pinned: formats that don't assume multiple choice, taking a set over (no cuts, no
// bookends, groups from its splits), the question list, and what "Questions final" checks.
import { describe, expect, test } from "bun:test";

import type { BlastFrame } from "@/components/blastoff/plan";

import { FORMATS, cardProblems, formatOf, markCorrect, switchFormat } from "./formats";
import { UNGROUPED, groupedCards, groupsFromSplits, nextGroupId, questionsSummary, stripForV4, type V4Card } from "./v4-topic";

const ch = (text: string, correct = false) => ({ text, correct });

describe("question formats", () => {
  test("no format is multiple choice — every existing card is already valid", () => {
    expect(formatOf({}).id).toBe("mc");
    expect(formatOf({ format: "sorting-someday" }).id).toBe("mc");
    expect(cardProblems({ stem: "Cash is a…", choices: [ch("Asset", true), ch("Liability")] })).toEqual([]);
  });
  test("multiple choice needs exactly one correct; select all needs 2+ correct and a wrong one", () => {
    expect(cardProblems({ stem: "Q", choices: [ch("A", true), ch("B", true)] })[0]).toContain("exactly one correct");
    const sa = { format: "select_all", stem: "Pick the current assets", choices: [ch("Cash", true), ch("Supplies", true), ch("Land")] };
    expect(cardProblems(sa)).toEqual([]);
    expect(cardProblems({ ...sa, choices: [ch("Cash", true), ch("Land")] })).toContain("Select all needs at least two correct answers.");
    expect(cardProblems({ ...sa, choices: [ch("Cash", true), ch("Supplies", true)] })[0]).toContain("at least one wrong answer");
    expect(FORMATS.select_all.multiCorrect).toBe(true);
  });
  test("marking and switching follow the format", () => {
    const c = [ch("A", true), ch("B"), ch("C", true)];
    expect(markCorrect(c, 1, "mc").map((x) => x.correct)).toEqual([false, true, false]);
    expect(markCorrect(c, 1, "select_all").map((x) => x.correct)).toEqual([true, true, true]);
    expect(switchFormat(c, "mc").map((x) => x.correct)).toEqual([true, false, false]);
  });
});

describe("taking a set over", () => {
  const f = (id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind, ...extra });
  const plan: BlastFrame[] = [
    f("i1", "intro", { takeName: "Receivables" }), f("s1", "slogan"), f("b1", "bio"), f("fo1", "found"),
    f("q1", "ceq", { ceqId: "c1" }), f("ch", "cheat", { title: "Owe you = asset" }), f("q2", "ceq", { ceqId: "c2" }),
    f("o1", "outro", { cutAfter: true }),
    f("i2", "intro"), f("q3", "ceq", { ceqId: "c3" }), f("fx", "found", { text: "A real exam question" }), f("sk", "ceq", { ceqId: "c9", skipped: true }), f("o2", "outro"),
  ];

  test("the chain keeps everything he made, in order, and drops cuts and auto-inserted bookends", () => {
    const s = stripForV4(plan);
    expect(s.map((x) => x.id)).toEqual(["q1", "ch", "q2", "q3", "fx", "sk"]);
    expect(s.some((x) => x.cutAfter || x.takeName)).toBe(false);
  });

  test("starting groups come from the splits — named where named, the rest numbered", () => {
    const { groups, groupOf } = groupsFromSplits(plan, ["c1", "c2", "c3", "c9"]);
    expect(groups).toEqual([{ id: "g1", name: "Receivables" }, { id: "g2", name: "Group 2" }]);
    expect(Object.fromEntries(groupOf)).toEqual({ c1: "g1", c2: "g1", c3: "g2" });
    expect(nextGroupId(groups)).toBe("g3");
  });
});

describe("the question list", () => {
  const card = (id: string, extra: Partial<V4Card> = {}): V4Card => ({ id, stem: `Q ${id}`, choices: [ch("A", true), ch("B")], format: "mc", group: "g1", placeholder: null, draft: false, rejected: false, noteOnly: false, order: 0, ...extra });
  const cards = [card("a", { order: 2 }), card("b", { order: 1 }), card("c", { group: null }), card("d", { rejected: true }), card("e", { order: 3, placeholder: { kind: "format", note: "a T-account" }, choices: [] })];

  test("groups in order, rejected hidden, loose cards under 'Not grouped yet'", () => {
    const g = groupedCards({ groups: [{ id: "g1", name: "Assets" }] }, cards);
    expect(g.map((x) => [x.group.name, x.cards.map((c) => c.id)])).toEqual([["Assets", ["b", "a", "e"]], [UNGROUPED.name, ["c"]]]);
  });

  test("Questions final: placeholders never block; an incomplete real question does", () => {
    const s = questionsSummary(cards, (c) => cardProblems(c), 1);
    expect(s).toMatchObject({ questions: 4, placeholders: 1, rejected: 1, problems: [] });
    const broken = questionsSummary([...cards, card("f", { choices: [ch("A"), ch("B")] })], (c) => cardProblems(c), 1);
    expect(broken.problems).toEqual([{ cardId: "f", problem: "Mark the correct answer." }]);
  });
});
