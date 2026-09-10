// THE MAP'S LAYOUT. The picture is only as honest as this: a branch on the wrong row or under the
// wrong split, or a set silently dropped because its parent went away, would have Lee planning
// against a lie — and the production number is the thing he reads to decide what to film next.
import { describe, expect, test } from "bun:test";

import { bareCramIds, layoutLanes, nudgeOrder, rowDepth, sortBranches, type LaneSet, type LaneTake } from "./lane-map";

const cram = (id: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, ...extra });
const off = (id: string, parent: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, lane: "offshoot", branchFrom: parent, ...extra });
const pitch = (id: string, parent: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, lane: "pitch", branchFrom: parent, ...extra });
const byId = (l: ReturnType<typeof layoutLanes>) => Object.fromEntries(l.nodes.map((n) => [n.id, n]));

describe("the spine", () => {
  test("cram sets run down the middle in the order given, numbered 1..n", () => {
    const l = layoutLanes([cram("a"), cram("b"), cram("c")]);
    expect(l.rows).toBe(3);
    expect(l.nodes.map((n) => [n.id, n.col, n.row, n.order])).toEqual([["a", 1, 0, 1], ["b", 1, 1, 2], ["c", 1, 2, 3]]);
    expect(l.edges).toEqual([]);
  });
  test("an unmarked bank is all spine — the default drawn", () => {
    const l = layoutLanes([{ id: "x", name: "x" }, { id: "y", name: "y", lane: "nonsense" }]);
    expect(l.nodes.every((n) => n.lane === "cram" && n.col === 1)).toBe(true);
  });
  test("an empty topic lays out to nothing rather than throwing", () => {
    expect(layoutLanes([])).toEqual({ nodes: [], edges: [], rows: 0, orphans: 0, depth: [] });
  });
});

describe("the sides", () => {
  test("pitches go left, offshoots right, both on the parent's row", () => {
    const b = byId(layoutLanes([cram("a"), cram("b"), off("deep-b", "b"), pitch("ad-b", "b")]));
    expect([b["deep-b"].col, b["deep-b"].row]).toEqual([2, 1]);
    expect([b["ad-b"].col, b["ad-b"].row]).toEqual([0, 1]);
  });
  test("the two sides are counted apart — a pitch never pushes an offshoot down", () => {
    const l = layoutLanes([cram("a"), pitch("p1", "a"), off("o1", "a"), pitch("p2", "a")]);
    expect(l.depth[0]).toEqual({ left: 2, right: 1 });
    expect(rowDepth(l, 0)).toBe(2);
  });
  test("every branch draws an edge from its parent", () => {
    const l = layoutLanes([cram("a"), off("o", "a"), pitch("p", "a")]);
    expect(l.edges.filter((e) => e.kind === "branch").map((e) => e.to).sort()).toEqual(["o", "p"]);
  });
});

describe("splits — the thing Lee asked for on 09-10", () => {
  const takes: Record<string, LaneTake[]> = { a: [{ headId: "h-assets", name: "Assets" }, { headId: "h-liab", name: "Liabilities" }] };
  const takesOf = (id: string) => takes[id] ?? [];

  test("a branch resolves its split against the parent's plan", () => {
    const b = byId(layoutLanes([cram("a"), off("o", "a", { branchTakeHead: "h-liab" })], takesOf));
    expect(b["o"].take).toEqual({ headId: "h-liab", name: "Liabilities", index: 1 });
    expect(b["o"].takeMissing).toBe(false);
  });
  test("branches group under their split, in plan order, with the whole-set ones first", () => {
    const l = layoutLanes([
      cram("a"),
      off("liab-1", "a", { branchTakeHead: "h-liab" }),
      off("whole", "a"),
      off("assets-1", "a", { branchTakeHead: "h-assets" }),
    ], takesOf);
    const right = l.nodes.filter((n) => n.col === 2).sort((x, y) => x.sub - y.sub).map((n) => n.id);
    expect(right).toEqual(["whole", "assets-1", "liab-1"]);
  });
  test("a split the plan no longer has is flagged, drawn last, never dropped", () => {
    const b = byId(layoutLanes([cram("a"), off("gone", "a", { branchTakeHead: "h-deleted" }), off("ok", "a", { branchTakeHead: "h-assets" })], takesOf));
    expect(b["gone"].takeMissing).toBe(true);
    expect(b["gone"].take).toBeNull();
    expect(b["gone"].sub).toBeGreaterThan(b["ok"].sub);
  });
  test("a parent with no plan cannot resolve any split — flagged, not crashed", () => {
    const b = byId(layoutLanes([cram("noplan"), off("o", "noplan", { branchTakeHead: "h-x" })]));
    expect(b["o"].takeMissing).toBe(true);
  });
});

describe("Lee's arrangement", () => {
  test("branchOrder wins within a split; absent sorts last; then name", () => {
    const sorted = sortBranches([
      { name: "c", takeIndex: 0 },
      { name: "b", takeIndex: 0, branchOrder: 1 },
      { name: "a", takeIndex: 0, branchOrder: 0 },
      { name: "z", takeIndex: 0 },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["a", "b", "c", "z"]);
  });
  test("the production number runs down the cram path first, then the branches in map order", () => {
    const l = layoutLanes([cram("a"), off("o-a", "a"), cram("b"), off("o-b2", "b", { branchOrder: 1 }), off("o-b1", "b", { branchOrder: 0 }), pitch("p-b", "b")]);
    const b = byId(l);
    expect([b["a"].order, b["b"].order]).toEqual([1, 2]);
    expect(b["o-a"].order).toBe(3);
    // Row b: offshoots before the pitch, and o-b1 before o-b2 by his order.
    expect([b["o-b1"].order, b["o-b2"].order, b["p-b"].order]).toEqual([4, 5, 6]);
  });
  test("nudgeOrder moves one step and writes every sibling's order explicitly", () => {
    expect(nudgeOrder(["x", "y", "z"], "z", -1)).toEqual([{ id: "x", branchOrder: 0 }, { id: "z", branchOrder: 1 }, { id: "y", branchOrder: 2 }]);
    expect(nudgeOrder(["x", "y", "z"], "x", -1).map((o) => o.id)).toEqual(["x", "y", "z"]); // already first
    expect(nudgeOrder(["x", "y", "z"], "z", 1).map((o) => o.id)).toEqual(["x", "y", "z"]);  // already last
    expect(nudgeOrder(["x", "y"], "nope", 1)).toEqual([{ id: "x", branchOrder: 0 }, { id: "y", branchOrder: 1 }]);
  });
});

describe("orphans are drawn, never dropped", () => {
  test("a missing, absent or branch parent lands the child below the path with no number", () => {
    const l = layoutLanes([cram("a"), off("gone", "deleted"), { id: "noparent", name: "n", lane: "offshoot" }, off("o1", "a"), off("nested", "o1")]);
    const orphaned = l.nodes.filter((n) => n.orphan);
    expect(orphaned.map((n) => n.id).sort()).toEqual(["gone", "nested", "noparent"]);
    expect(orphaned.every((n) => n.order === 0)).toBe(true);
    expect(l.orphans).toBe(3);
  });
  test("no set is ever lost", () => {
    const sets = [cram("a"), cram("b"), off("o", "a"), pitch("p", "b"), off("orphan", "zzz")];
    expect(layoutLanes(sets).nodes.map((n) => n.id).sort()).toEqual(sets.map((s) => s.id).sort());
  });
});

describe("split provenance and bare sets", () => {
  test("a parent draws a dashed edge to each piece still in the topic, never to itself", () => {
    const l = layoutLanes([{ id: "whole", name: "whole", splitInto: ["p1", "gone", "whole"] }, cram("p1")]);
    expect(l.edges.filter((e) => e.kind === "split")).toEqual([{ from: "whole", to: "p1", kind: "split" }]);
  });
  test("bareCramIds is the cram sets with nothing hanging off them", () => {
    expect(bareCramIds(layoutLanes([cram("a"), cram("b"), cram("c"), off("o", "b")]))).toEqual(["a", "c"]);
  });
});
