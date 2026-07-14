import { describe, expect, test } from "bun:test";

import { addDeck, deckById, deckMembersOf, duplicateDeck, newDeckDef, removeDeck, updateDeck } from "./deck-defs";

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
