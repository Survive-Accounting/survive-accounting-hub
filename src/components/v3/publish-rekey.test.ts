import { describe, expect, test } from "bun:test";

import type { BlastFrame } from "../blastoff/plan";
import { headsOf, publishKey, rekeyMoves } from "./publish-rekey";

const f = (id: string, kind: BlastFrame["kind"], extra: Partial<BlastFrame> = {}): BlastFrame => ({ id, kind, ...extra });
const S = "set-1";

describe("publishKey", () => {
  test("split 1 is the set id, split N is <setId>#N", () => {
    expect(publishKey(S, 0)).toBe("set-1");
    expect(publishKey(S, 1)).toBe("set-1#2");
    expect(publishKey(S, 4)).toBe("set-1#5");
  });
});

describe("headsOf", () => {
  test("one head per filmed run; skipped frames never head a run; an empty plan has no heads", () => {
    const frames = [
      f("i1", "intro"), f("q1", "ceq", { ceqId: "c1" }), f("o1", "outro", { cutAfter: true }),
      f("x", "tip", { skipped: true }), f("i2", "intro"), f("q2", "ceq", { ceqId: "c2" }), f("o2", "outro"),
    ];
    expect(headsOf(frames)).toEqual(["i1", "i2"]);
    expect(headsOf([])).toEqual([]);
  });
});

describe("rekeyMoves", () => {
  test("no change -> []", () => {
    expect(rekeyMoves(S, ["a", "b", "c"], ["a", "b", "c"])).toEqual([]);
    expect(rekeyMoves(S, [], [])).toEqual([]);
  });
  test("a cut inserted BEFORE a filmed split shifts every later key up by one (last seat vacates first)", () => {
    // [a, b, c] -> a cut splits a into [a, a2]: b and c each move one seat later.
    expect(rekeyMoves(S, ["a", "b", "c"], ["a", "a2", "b", "c"])).toEqual([
      { from: "set-1#3", to: "set-1#4" },
      { from: "set-1#2", to: "set-1#3" },
    ]);
  });
  test("removing the first split shifts the rest down; the removed head yields no move", () => {
    expect(rekeyMoves(S, ["a", "b", "c"], ["b", "c"])).toEqual([
      { from: "set-1#2", to: "set-1" },
      { from: "set-1#3", to: "set-1#2" },
    ]);
  });
  test("a reorder swaps the two keys (a cycle: both moves, set semantics)", () => {
    const moves = rekeyMoves(S, ["a", "b"], ["b", "a"]);
    expect(moves).toHaveLength(2);
    expect(moves).toContainEqual({ from: "set-1", to: "set-1#2" });
    expect(moves).toContainEqual({ from: "set-1#2", to: "set-1" });
  });
  test("a split whose seat did not change yields nothing, even when its neighbours moved", () => {
    // a stays at seat 1; c and b swap behind it.
    const moves = rekeyMoves(S, ["a", "b", "c"], ["a", "c", "b"]);
    expect(moves.some((m) => m.from === "set-1" || m.to === "set-1")).toBe(false);
    expect(moves).toHaveLength(2);
  });
  test("a brand-new split has no row to move; only survivors move", () => {
    expect(rekeyMoves(S, ["a"], ["n", "a"])).toEqual([{ from: "set-1", to: "set-1#2" }]);
    expect(rekeyMoves(S, ["a"], ["a", "n"])).toEqual([]);
  });
  test("sequential order never clobbers a row still needed (acyclic chains)", () => {
    const moves = rekeyMoves(S, ["a", "b", "c", "d"], ["z", "a", "b", "c", "d"]);
    const rows = new Map<string, string>([["set-1", "a"], ["set-1#2", "b"], ["set-1#3", "c"], ["set-1#4", "d"]]);
    for (const m of moves) { const v = rows.get(m.from); rows.delete(m.from); if (v !== undefined) rows.set(m.to, v); }
    expect(rows.get("set-1#2")).toBe("a");
    expect(rows.get("set-1#3")).toBe("b");
    expect(rows.get("set-1#4")).toBe("c");
    expect(rows.get("set-1#5")).toBe("d");
    expect(rows.has("set-1")).toBe(false);
  });
});
