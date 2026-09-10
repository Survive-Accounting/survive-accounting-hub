// THE MAP'S LAYOUT. The picture is only as honest as this: a branch on the wrong row, or a set
// silently dropped because its parent went away, would have Lee planning against a lie.
import { describe, expect, test } from "bun:test";

import { bareCramIds, layoutLanes, rowDepth, type LaneSet } from "./lane-map";

const cram = (id: string): LaneSet => ({ id, name: id });
const off = (id: string, parent: string): LaneSet => ({ id, name: id, lane: "offshoot", branchFrom: parent });
const pitch = (id: string, parent: string): LaneSet => ({ id, name: id, lane: "pitch", branchFrom: parent });

describe("the spine", () => {
  test("cram sets run down the middle in the order given", () => {
    const l = layoutLanes([cram("a"), cram("b"), cram("c")]);
    expect(l.rows).toBe(3);
    expect(l.nodes.map((n) => [n.id, n.col, n.row])).toEqual([["a", 1, 0], ["b", 1, 1], ["c", 1, 2]]);
    expect(l.edges).toEqual([]);
  });
  test("an unmarked bank is all spine — the default drawn", () => {
    const l = layoutLanes([{ id: "x", name: "x" }, { id: "y", name: "y", lane: "nonsense" }]);
    expect(l.nodes.every((n) => n.lane === "cram" && n.col === 1)).toBe(true);
    expect(l.orphans).toBe(0);
  });
  test("an empty topic lays out to nothing rather than throwing", () => {
    const l = layoutLanes([]);
    expect(l).toEqual({ nodes: [], edges: [], rows: 0, orphans: 0, depth: [] });
  });
});

describe("the sides", () => {
  test("pitches go left, offshoots right, both on the parent's row", () => {
    const l = layoutLanes([cram("a"), cram("b"), off("deep-b", "b"), pitch("ad-b", "b")]);
    const by = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
    expect(by["deep-b"].col).toBe(2);
    expect(by["ad-b"].col).toBe(0);
    expect(by["deep-b"].row).toBe(1);
    expect(by["ad-b"].row).toBe(1);
  });
  test("several children on one side stack, numbered in the order given", () => {
    const l = layoutLanes([cram("a"), off("o1", "a"), off("o2", "a"), off("o3", "a")]);
    expect(l.nodes.filter((n) => n.lane === "offshoot").map((n) => n.sub)).toEqual([0, 1, 2]);
    expect(rowDepth(l, 0)).toBe(3);
  });
  test("the two sides are counted apart — a pitch never pushes an offshoot down", () => {
    const l = layoutLanes([cram("a"), pitch("p1", "a"), off("o1", "a"), pitch("p2", "a")]);
    const by = Object.fromEntries(l.nodes.map((n) => [n.id, n]));
    expect([by["p1"].sub, by["p2"].sub]).toEqual([0, 1]);
    expect(by["o1"].sub).toBe(0);
    expect(l.depth[0]).toEqual({ left: 2, right: 1 });
  });
  test("every branch draws an edge from its parent", () => {
    const l = layoutLanes([cram("a"), off("o", "a"), pitch("p", "a")]);
    expect(l.edges.filter((e) => e.kind === "branch")).toEqual([
      { from: "a", to: "o", kind: "branch" },
      { from: "a", to: "p", kind: "branch" },
    ]);
  });
});

describe("orphans are drawn, never dropped", () => {
  test("a parent that is missing, absent or itself lands the child below the path", () => {
    const l = layoutLanes([cram("a"), off("gone", "deleted"), { id: "noparent", name: "n", lane: "offshoot" }]);
    const orphaned = l.nodes.filter((n) => n.orphan);
    expect(orphaned.map((n) => n.id).sort()).toEqual(["gone", "noparent"]);
    expect(l.orphans).toBe(2);
    // Below the spine, one per row, and no edge to a parent that isn't there.
    expect(orphaned.map((n) => n.row)).toEqual([1, 2]);
    expect(l.edges.filter((e) => e.kind === "branch")).toEqual([]);
  });
  test("a branch whose parent is itself a branch is an orphan — the tree stays one level deep", () => {
    const l = layoutLanes([cram("a"), off("o1", "a"), off("o2", "o1")]);
    expect(l.nodes.find((n) => n.id === "o2")?.orphan).toBe(true);
  });
  test("no set is ever lost", () => {
    const sets = [cram("a"), cram("b"), off("o", "a"), pitch("p", "b"), off("orphan", "zzz")];
    const l = layoutLanes(sets);
    expect(l.nodes.map((n) => n.id).sort()).toEqual(sets.map((s) => s.id).sort());
  });
});

describe("split provenance", () => {
  test("a parent draws a dashed edge to each piece that is still in the topic", () => {
    const l = layoutLanes([{ id: "whole", name: "whole", splitInto: ["p1", "p2", "gone"] }, cram("p1"), cram("p2")]);
    expect(l.edges.filter((e) => e.kind === "split")).toEqual([
      { from: "whole", to: "p1", kind: "split" },
      { from: "whole", to: "p2", kind: "split" },
    ]);
  });
  test("a set that names itself does not draw an edge to itself", () => {
    const l = layoutLanes([{ id: "a", name: "a", splitInto: ["a"] }]);
    expect(l.edges).toEqual([]);
  });
});

describe("what still needs one", () => {
  test("bareCramIds is the cram sets with nothing hanging off them", () => {
    const l = layoutLanes([cram("a"), cram("b"), cram("c"), off("o", "b")]);
    expect(bareCramIds(l)).toEqual(["a", "c"]);
  });
  test("a pitch counts as something hanging off it", () => {
    const l = layoutLanes([cram("a"), pitch("p", "a")]);
    expect(bareCramIds(l)).toEqual([]);
  });
});
