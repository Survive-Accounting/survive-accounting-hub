import { describe, expect, test } from "bun:test";

import { addDeck, deckById, deckMembersOf, duplicateDeck, gridSlots, newDeckDef, removeDeck, shuffledOrder, updateDeck } from "./deck-defs";

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
