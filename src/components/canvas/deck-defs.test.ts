import { describe, expect, test } from "bun:test";

import { addDeck, deckById, deckMembersOf, duplicateDeck, gridSlots, matchLessonForChapter, newDeckDef, normalBalanceCeqData, NORMAL_BALANCE_DRILL_FILTER, removeDeck, seedStartHereDecks, shuffledOrder, updateDeck } from "./deck-defs";

describe("deck-defs (named decks, P3)", () => {
  test("newDeckDef defaults: named, sequence, skeletons on", () => {
    const d = newDeckDef("Ch1 Check", "cards");
    expect(d.name).toBe("Ch1 Check");
    expect(d.payloadType).toBe("cards");
    expect(d.runMode).toBe("sequence");
    expect(d.showSkeletons).toBe(true);
    expect(newDeckDef("", "memos").name).toBe("Memo deck");
  });

  test("add / update / remove", () => {
    let defs = addDeck([], newDeckDef("A", "cards"));
    const id = defs[0].id;
    defs = updateDeck(defs, id, { runMode: "shuffle", name: "A2" });
    expect(defs[0].runMode).toBe("shuffle");
    expect(defs[0].name).toBe("A2");
    defs = removeDeck(defs, id);
    expect(defs).toHaveLength(0);
  });

  test("duplicate makes a fresh id + '· copy' name, empty membership", () => {
    const defs = addDeck([], newDeckDef("Traps", "memos"));
    const { defs: after, newId } = duplicateDeck(defs, defs[0].id);
    expect(after).toHaveLength(2);
    expect(newId).not.toBe(defs[0].id);
    expect(after[1].name).toBe("Traps · copy");
    expect(after[1].payloadType).toBe("memos");
  });

  test("deckMembersOf returns only this deck's nodes, in stageOrder", () => {
    const nodes = [
      { id: "n1", data: { deckId: "d1", stageOrder: 2 } },
      { id: "n2", data: { deckId: "d1", stageOrder: 0 } },
      { id: "n3", data: { deckId: "d2", stageOrder: 0 } },
      { id: "n4", data: {} },
    ];
    const m = deckMembersOf(nodes, "d1");
    expect(m.map((n) => n.id)).toEqual(["n2", "n1"]);
  });

  test("deckById tolerant of null", () => {
    const defs = addDeck([], newDeckDef("X"));
    expect(deckById(defs, defs[0].id)?.name).toBe("X");
    expect(deckById(defs, null)).toBeUndefined();
    expect(deckById(undefined, "z")).toBeUndefined();
  });
});

describe("skeleton grid layout (P4)", () => {
  test("gridSlots is near-square, row-major, evenly spaced", () => {
    const s = gridSlots(4, { originX: 0, originY: 0, cellW: 100, cellH: 100, gapX: 20, gapY: 20 });
    expect(s).toHaveLength(4);
    // 4 → 2 cols
    expect(s[0]).toEqual({ x: 0, y: 0 });
    expect(s[1]).toEqual({ x: 120, y: 0 });
    expect(s[2]).toEqual({ x: 0, y: 120 });
    expect(s[3]).toEqual({ x: 120, y: 120 });
  });
  test("gridSlots handles 0 and 1", () => {
    expect(gridSlots(0, { originX: 0, originY: 0 })).toEqual([]);
    expect(gridSlots(1, { originX: 5, originY: 7 })).toEqual([{ x: 5, y: 7 }]);
  });
  test("shuffledOrder is a permutation (deterministic RNG)", () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const o = shuffledOrder(6, rnd);
    expect([...o].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("seedStartHereDecks (item 5)", () => {
  const lessons = [
    { id: "L1", label: "Ch 1 · A=L+E" },
    { id: "L3", label: "Chapter 3 — Accounts" },
    { id: "L11", label: "Wrap-up" },
  ];

  test("creates 23 chapter decks + Ch3 drill + 4 memo decks (11×2 + 1 + 4 = 27)", () => {
    const { toAdd } = seedStartHereDecks([], lessons);
    expect(toAdd.length).toBe(27);
    // the drill deck exists, shuffles, and carries the generate marker
    const drill = toAdd.find((d) => d.name === "Ch 3 · Normal Balances")!;
    expect(drill.runMode).toBe("shuffle");
    expect(drill.filter).toBe(NORMAL_BALANCE_DRILL_FILTER);
    // 4 memo decks with category filters
    const memoDecks = toAdd.filter((d) => d.payloadType === "memos");
    expect(memoDecks.map((d) => d.name).sort()).toEqual(["Cheat Codes", "Exam Traps", "Other Tips", "Steps"]);
    expect(memoDecks.find((d) => d.name === "Exam Traps")!.filter).toBe("EXAM TRAPS");
  });

  test("attaches chapter decks to a matched lesson; leaves the rest loose", () => {
    const { toAdd, attached } = seedStartHereDecks([], lessons);
    expect(attached).toBe(3); // Ch 1, Ch 3, Ch 11 (Wrap-up) matched
    expect(toAdd.find((d) => d.name === "Ch 1 · A=L+E")!.lessonId).toBe("L1");
    expect(toAdd.find((d) => d.name === "Ch 3 · Check")!.lessonId).toBe("L3");
    expect(toAdd.find((d) => d.name === "Ch 2 · The Cycle")!.lessonId).toBeNull(); // no lesson → loose
  });

  test("idempotent — seeding twice adds nothing new", () => {
    const first = seedStartHereDecks([], lessons).toAdd;
    const { toAdd } = seedStartHereDecks(first, lessons);
    expect(toAdd.length).toBe(0);
  });
});

describe("matchLessonForChapter", () => {
  const lessons = [{ id: "A", label: "Ch 4 · Journal Entries" }, { id: "B", label: "Trial Balance" }];
  test("matches by chapter number", () => expect(matchLessonForChapter(lessons, 4, "Journal Entries")).toBe("A"));
  test("falls back to short-name substring", () => expect(matchLessonForChapter(lessons, 6, "Trial Balance")).toBe("B"));
  test("no match → null", () => expect(matchLessonForChapter(lessons, 9, "Closing Entries")).toBeNull());
});

describe("normalBalanceCeqData (item 6 — CEQ variant, no new kind)", () => {
  test("one DR/CR question per account, correct side from the COA normal", () => {
    let n = 0;
    const out = normalBalanceCeqData([{ name: "Cash", normal: "debit" }, { name: "Notes Payable", normal: "credit" }], () => `id${n++}`);
    expect(out).toHaveLength(2);
    expect(out[0].prompt).toBe("Normal balance of Cash?");
    expect(out[0].choices.find((c) => c.text === "Debit")!.correct).toBe(true);
    expect(out[0].choices.find((c) => c.text === "Credit")!.correct).toBe(false);
    expect(out[1].choices.find((c) => c.text === "Credit")!.correct).toBe(true);
  });
});
