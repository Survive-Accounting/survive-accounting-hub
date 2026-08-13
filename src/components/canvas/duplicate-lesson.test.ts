import { describe, expect, test } from "bun:test";

import { decksOfLesson, duplicateLessonDecks, mintDeckIds, nextRegionCell } from "./duplicate-lesson";
import { lessonCellSize } from "./frames";
import type { DeckDef } from "./types";

const deck = (id: string, patch: Partial<DeckDef> = {}): DeckDef => ({
  id, name: id, payloadType: "cards", filter: null, runMode: "sequence",
  lessonId: null, slots: [], showSkeletons: true, ...patch,
});

describe("nextRegionCell", () => {
  const cell = lessonCellSize();

  test("empty region → origin", () => {
    expect(nextRegionCell([], cell)).toEqual({ x: 0, y: 0 });
  });

  test("one lesson at origin → the next reading-order slot (to the right)", () => {
    const dest = nextRegionCell([{ x: 0, y: 0 }], cell);
    expect(dest.y).toBe(0);
    expect(dest.x).toBeGreaterThan(cell.w); // one cell + gutter over
  });

  test("returns a slot no existing lesson occupies", () => {
    const c0 = { x: 0, y: 0 };
    const c1 = nextRegionCell([c0], cell);
    const c2 = nextRegionCell([c0, c1], cell);
    // the third destination differs from both taken cells
    expect(c2).not.toEqual(c0);
    expect(c2).not.toEqual(c1);
  });
});

describe("decksOfLesson", () => {
  test("matches lesson-attached and frame-attached decks; skips globals", () => {
    const decks = [
      deck("A", { lessonId: "L1" }),
      deck("B", { frameId: "F2" }),
      deck("C", { lessonId: "L9" }),   // other lesson
      deck("D", { lessonId: null }),    // global
    ];
    const got = decksOfLesson(decks, "L1", new Set(["F1", "F2"]));
    expect(got.map((d) => d.id).sort()).toEqual(["A", "B"]);
  });
});

describe("duplicateLessonDecks", () => {
  test("fresh ids, (copy) name, re-homed lesson/frame ids, mapped members", () => {
    const src = [deck("D1", { lessonId: "L1", frameId: "F1", slots: [{ x: 1, y: 2 }] })];
    const idMap = new Map([["L1", "L1-new"], ["F1", "F1-new"]]);
    let n = 0;
    const deckIdMap = mintDeckIds(src, () => `deck#${++n}`);
    const newDecks = duplicateLessonDecks(src, idMap, deckIdMap, "2026-01-01");
    expect(newDecks).toHaveLength(1);
    const nd = newDecks[0];
    expect(nd.id).toBe("deck#1");
    expect(nd.name).toBe("D1 (copy)");
    expect(nd.lessonId).toBe("L1-new");
    expect(nd.frameId).toBe("F1-new");
    expect(nd.slots).toEqual([{ x: 1, y: 2 }]);
    expect(deckIdMap.get("D1")).toBe("deck#1");
    // slots are a fresh array (no shared reference back to the source)
    nd.slots![0].x = 999;
    expect(src[0].slots![0].x).toBe(1);
  });

  test("a frame-attached deck whose frame isn't in the map drops to unattached", () => {
    const src = [deck("D1", { frameId: "GONE" })];
    const newDecks = duplicateLessonDecks(src, new Map(), mintDeckIds(src, () => "deck#1"));
    expect(newDecks[0].frameId).toBeNull();
  });
});
