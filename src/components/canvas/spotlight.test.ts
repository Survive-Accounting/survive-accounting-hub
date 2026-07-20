import { describe, expect, test } from "bun:test";

import { applyRegularClick, applySuperClick, moveSpot, scheduleRowTarget, spotKey, spotlightTargetsOf, spotMembership, startSpot, type SpotSets, type SpotState } from "./spotlight";
import type { CardData } from "./types";

describe("click-toggle model — regular (many) + super (one)", () => {
  const empty = (): SpotSets => ({ regular: new Set(), superKey: null });
  const a = spotKey("c", "a"), b = spotKey("c", "b");

  test("regular click adds, re-click removes (toggle)", () => {
    let s = applyRegularClick(empty(), a);
    expect([...s.regular]).toEqual([a]);
    s = applyRegularClick(s, a);
    expect(s.regular.size).toBe(0);
  });
  test("multiple regulars coexist", () => {
    let s = applyRegularClick(empty(), a);
    s = applyRegularClick(s, b);
    expect(s.regular.has(a) && s.regular.has(b)).toBe(true);
  });
  test("super is single — a new super replaces the previous", () => {
    let s = applySuperClick(empty(), a);
    expect(s.superKey).toBe(a);
    s = applySuperClick(s, b);
    expect(s.superKey).toBe(b);
    expect(s.regular.size).toBe(0);
  });
  test("re-super the same target toggles it off", () => {
    let s = applySuperClick(empty(), a);
    s = applySuperClick(s, a);
    expect(s.superKey).toBeNull();
  });
  test("super-clicking a regular upgrades it (removed from regular)", () => {
    let s = applyRegularClick(empty(), a);
    s = applySuperClick(s, a);
    expect(s.superKey).toBe(a);
    expect(s.regular.has(a)).toBe(false);
  });
  test("regular-clicking the super downgrades it to regular", () => {
    let s = applySuperClick(empty(), a);
    s = applyRegularClick(s, a);
    expect(s.superKey).toBeNull();
    expect(s.regular.has(a)).toBe(true);
  });
});

const list = (n: number): CardData => ({ kind: "list", rows: Array.from({ length: n }, (_, i) => ({ id: `r${i}`, text: `row ${i}` })), showChips: false } as CardData);

describe("spotlightTargetsOf — registry per kind", () => {
  test("list rows in order", () => expect(spotlightTargetsOf(list(3))).toEqual(["r0", "r1", "r2"]));
  test("je lines in reading order (debits then credits)", () => {
    const je = { kind: "je", caption: "", lines: [
      { id: "c1", account: "Cash", dr: null, cr: 100, side: "cr" },
      { id: "d1", account: "Equip", dr: 100, cr: null, side: "dr" },
    ] } as unknown as CardData;
    expect(spotlightTargetsOf(je)).toEqual(["d1", "c1"]);
  });
  test("taccount = debits then credits", () => {
    const t = { kind: "taccount", account: "Cash", debits: [{ id: "d1", amount: 1 }], credits: [{ id: "c1", amount: 1 }] } as unknown as CardData;
    expect(spotlightTargetsOf(t)).toEqual(["d1", "c1"]);
  });
  test("formula segments", () => {
    const f = { kind: "formula", segments: [{ id: "s1", label: "A", value: "" }, { id: "s2", label: "L", value: "" }], operators: ["="] } as unknown as CardData;
    expect(spotlightTargetsOf(f)).toEqual(["s1", "s2"]);
  });
  test("schedule rows addressed by index", () => {
    const s = { kind: "schedule", preset: "generic", headers: [], rows: [[{ v: "" }], [{ v: "" }]] } as unknown as CardData;
    expect(spotlightTargetsOf(s)).toEqual([scheduleRowTarget(0), scheduleRowTarget(1)]);
  });
  test("memo = single self target", () => {
    expect(spotlightTargetsOf({ kind: "memo", memoKind: "trap", body: "" } as unknown as CardData)).toEqual(["self"]);
  });
  test("heading / Big Text + text block = single self target (Lee)", () => {
    expect(spotlightTargetsOf({ kind: "heading", text: "A = L + E", level: 1 } as unknown as CardData)).toEqual(["self"]);
    expect(spotlightTargetsOf({ kind: "text", body: "", color: 0 } as unknown as CardData)).toEqual(["self"]);
  });
  test("non-spotlightable kinds → []", () => {
    expect(spotlightTargetsOf({ kind: "note", body: "", color: 0 } as unknown as CardData)).toEqual([]);
    expect(spotlightTargetsOf(undefined)).toEqual([]);
  });
});

describe("startSpot", () => {
  test("indexes the clicked target", () => expect(startSpot("card", ["r0", "r1", "r2"], "r2")).toEqual({ cardId: "card", index: 2, anchor: null }));
  test("unknown target → index 0", () => expect(startSpot("card", ["r0"], "zzz").index).toBe(0));
});

describe("moveSpot — reading-order walk + escape hatch", () => {
  const s: SpotState = { cardId: "c", index: 1, anchor: null };
  test("down advances", () => expect(moveSpot(s, 5, 1)).toEqual({ cardId: "c", index: 2, anchor: null }));
  test("up retreats", () => expect(moveSpot(s, 5, -1)).toEqual({ cardId: "c", index: 0, anchor: null }));
  test("down clamps at last", () => expect(moveSpot({ cardId: "c", index: 4, anchor: null }, 5, 1)).toMatchObject({ index: 4 }));
  test("up off the FIRST target EXITS", () => expect(moveSpot({ cardId: "c", index: 0, anchor: null }, 5, -1)).toBe("exit"));
  test("ctrl-jump snaps to edges", () => {
    expect(moveSpot(s, 5, 1, { jump: true })).toMatchObject({ index: 4, anchor: null });
    expect(moveSpot(s, 5, -1, { jump: true })).toMatchObject({ index: 0, anchor: null });
  });
});

describe("moveSpot — shift-extend range", () => {
  test("sets an anchor and grows the band", () => {
    let st: SpotState = { cardId: "c", index: 1, anchor: null };
    st = moveSpot(st, 5, 1, { range: true }) as SpotState;
    expect(st).toEqual({ cardId: "c", index: 2, anchor: 1 });
    st = moveSpot(st, 5, 1, { range: true }) as SpotState;
    expect(st).toEqual({ cardId: "c", index: 3, anchor: 1 });
  });
  test("range membership covers the whole band", () => {
    const st: SpotState = { cardId: "c", index: 3, anchor: 1 };
    expect(spotMembership(st, 0)).toBe(false);
    expect(spotMembership(st, 1)).toBe("range");
    expect(spotMembership(st, 2)).toBe("range");
    expect(spotMembership(st, 3)).toBe("range");
    expect(spotMembership(st, 4)).toBe(false);
  });
  test("single membership is exact", () => {
    const st: SpotState = { cardId: "c", index: 2, anchor: null };
    expect(spotMembership(st, 2)).toBe("single");
    expect(spotMembership(st, 1)).toBe(false);
  });
  test("range never exits (clamps at top)", () => {
    expect(moveSpot({ cardId: "c", index: 0, anchor: 2 }, 5, -1, { range: true })).toMatchObject({ index: 0, anchor: 2 });
  });
});
