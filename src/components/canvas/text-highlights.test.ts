import { describe, expect, test } from "bun:test";

import { highlightMaps, highlightSnapshot, type HighlightSnapshot } from "./text-highlights";

// Lee, 2026-09-08: "highlights on text when in popped out need to persist. I'll pre-highlight
// things before filming sometimes." The pop-out is its own window, so the marks travel as this
// record through localStorage.
describe("the highlight record", () => {
  const maps = () => ({
    stem: new Map([["q2", { a: 3, b: 9 }], ["q1", { a: 0, b: 4 }]]),
    choice: new Map([["q1|2", { a: 1, b: 5 }]]),
    memo: new Map([["m7", { a: 2, b: 6 }]]),
  });

  test("round-trips every map", () => {
    const back = highlightMaps(highlightSnapshot("set-1", maps()));
    expect(back.stem.get("q1")).toEqual({ a: 0, b: 4 });
    expect(back.stem.get("q2")).toEqual({ a: 3, b: 9 });
    expect(back.choice.get("q1|2")).toEqual({ a: 1, b: 5 });
    expect(back.memo.get("m7")).toEqual({ a: 2, b: 6 });
  });

  // The cross-window loop is "did this string change?" — insertion order must not make an
  // unchanged state look new, or the two windows write at each other forever.
  test("serialises identically whatever order the marks were made in", () => {
    const a = highlightSnapshot("set-1", maps());
    const b = highlightSnapshot("set-1", {
      stem: new Map([["q1", { a: 0, b: 4 }], ["q2", { a: 3, b: 9 }]]),
      choice: new Map([["q1|2", { a: 1, b: 5 }]]),
      memo: new Map([["m7", { a: 2, b: 6 }]]),
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test("the set id rides along, so another deck's marks are never adopted", () => {
    expect(highlightSnapshot("set-9", maps()).setId).toBe("set-9");
  });

  test("an empty state is a real record — that is how the backtick wipes the other window", () => {
    const empty = highlightSnapshot("set-1", { stem: new Map(), choice: new Map(), memo: new Map() });
    expect(empty).toEqual({ setId: "set-1", stem: {}, choice: {}, memo: {} });
    const back = highlightMaps(empty);
    expect(back.stem.size + back.choice.size + back.memo.size).toBe(0);
  });

  test("a malformed record never takes the take down", () => {
    const bad = { setId: "set-1", stem: { q1: null }, choice: undefined, memo: { m1: { a: 1 } } } as unknown as HighlightSnapshot;
    const back = highlightMaps(bad);
    expect(back.stem.size).toBe(0);
    expect(back.choice.size).toBe(0);
    expect(back.memo.size).toBe(0);
  });
});
