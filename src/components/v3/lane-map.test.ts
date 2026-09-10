// THE MAP'S LAYOUT. The picture is only as honest as this: a branch on the wrong row or under the
// wrong split, or a set silently dropped because its parent went away, would have Lee planning
// against a lie — and the production number is the thing he reads to decide what to film next.
import { describe, expect, test } from "bun:test";

import { bareCramIds, layoutLanes, nudgeOrder, planDrop, rowBands, rowDepth, sortBranches, type LaneSet, type LaneTake } from "./lane-map";

const cram = (id: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, ...extra });
const off = (id: string, parent: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, lane: "offshoot", branchFrom: parent, ...extra });
const pitch = (id: string, parent: string, extra: Partial<LaneSet> = {}): LaneSet => ({ id, name: id, lane: "pitch", branchFrom: parent, ...extra });
const byId = (l: ReturnType<typeof layoutLanes>) => Object.fromEntries(l.nodes.map((n) => [n.id, n]));
/** Every numbered node, in production order. */
const playOrder = (l: ReturnType<typeof layoutLanes>) => l.nodes.filter((n) => n.order > 0).sort((a, b) => a.order - b.order).map((n) => n.id);

const takes: Record<string, LaneTake[]> = { a: [{ headId: "h-assets", name: "Assets" }, { headId: "h-liab", name: "Liabilities" }] };
const takesOf = (id: string) => takes[id] ?? [];

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
  test("a branch resolves its split against the parent's plan and keeps the raw head", () => {
    const b = byId(layoutLanes([cram("a"), off("o", "a", { branchTakeHead: "h-liab" }), off("w", "a")], takesOf));
    expect(b["o"].take).toEqual({ headId: "h-liab", name: "Liabilities", index: 1 });
    expect(b["o"].takeHead).toBe("h-liab");
    expect(b["o"].takeMissing).toBe(false);
    expect(b["w"].takeHead).toBeNull();
    expect(b["a"].takeHead).toBeNull();
  });
  test("offshoots group under their split, in plan order, with the whole-set ones after the last split", () => {
    const l = layoutLanes([
      cram("a"),
      off("liab-1", "a", { branchTakeHead: "h-liab" }),
      off("whole", "a"),
      off("assets-1", "a", { branchTakeHead: "h-assets" }),
    ], takesOf);
    const right = l.nodes.filter((n) => n.col === 2).sort((x, y) => x.sub - y.sub).map((n) => n.id);
    expect(right).toEqual(["assets-1", "liab-1", "whole"]);
  });
  test("pitches: the whole-set ones lead (they play before the set), then per split", () => {
    const l = layoutLanes([cram("a"), pitch("after-liab", "a", { branchTakeHead: "h-liab" }), pitch("intro", "a")], takesOf);
    const left = l.nodes.filter((n) => n.col === 0).sort((x, y) => x.sub - y.sub).map((n) => n.id);
    expect(left).toEqual(["intro", "after-liab"]);
  });
  test("a split the plan no longer has is flagged, drawn last, never dropped", () => {
    const b = byId(layoutLanes([cram("a"), off("gone", "a", { branchTakeHead: "h-deleted" }), off("ok", "a", { branchTakeHead: "h-assets" }), off("whole", "a")], takesOf));
    expect(b["gone"].takeMissing).toBe(true);
    expect(b["gone"].take).toBeNull();
    expect(b["gone"].takeHead).toBe("h-deleted");
    expect(b["gone"].sub).toBeGreaterThan(b["ok"].sub);
    expect(b["gone"].sub).toBeGreaterThan(b["whole"].sub);
  });
  test("a parent with no plan cannot resolve any split — flagged, not crashed", () => {
    const b = byId(layoutLanes([cram("noplan"), off("o", "noplan", { branchTakeHead: "h-x" })]));
    expect(b["o"].takeMissing).toBe(true);
  });
});

describe("the production order is the play order", () => {
  test("branchOrder wins within a split; absent sorts last; then name", () => {
    const sorted = sortBranches([
      { name: "c", takeIndex: 0 },
      { name: "b", takeIndex: 0, branchOrder: 1 },
      { name: "a", takeIndex: 0, branchOrder: 0 },
      { name: "z", takeIndex: 0 },
    ]);
    expect(sorted.map((s) => s.name)).toEqual(["a", "b", "c", "z"]);
  });
  test("a whole-set pitch plays BEFORE its cram set; offshoots after it", () => {
    const l = layoutLanes([cram("a"), off("o-a", "a"), cram("b"), off("o-b2", "b", { branchOrder: 1 }), off("o-b1", "b", { branchOrder: 0 }), pitch("p-b", "b")]);
    expect(playOrder(l)).toEqual(["a", "o-a", "p-b", "b", "o-b1", "o-b2"]);
    const b = byId(l);
    expect([b["a"].order, b["b"].order]).toEqual([1, 4]);
  });
  test("with splits: pitch-before → set → per split (offshoots, then the pitch after it) → whole-set offshoots → lost splits", () => {
    const l = layoutLanes([
      cram("a"),
      off("whole", "a"),
      off("liab-1", "a", { branchTakeHead: "h-liab" }),
      pitch("after-assets", "a", { branchTakeHead: "h-assets" }),
      off("assets-2", "a", { branchTakeHead: "h-assets", branchOrder: 1 }),
      off("assets-1", "a", { branchTakeHead: "h-assets", branchOrder: 0 }),
      pitch("intro", "a"),
      off("lost", "a", { branchTakeHead: "h-gone" }),
      pitch("lost-pitch", "a", { branchTakeHead: "h-gone" }),
      cram("b"),
      pitch("outro", "b"),
    ], takesOf);
    expect(playOrder(l)).toEqual(["intro", "a", "assets-1", "assets-2", "after-assets", "liab-1", "whole", "lost", "lost-pitch", "outro", "b"]);
    expect(byId(l)["b"].order).toBe(11);
  });
  test("two whole-set pitches keep Lee's order before the set", () => {
    const l = layoutLanes([cram("a"), pitch("p2", "a", { branchOrder: 1 }), pitch("p1", "a", { branchOrder: 0 })]);
    expect(playOrder(l)).toEqual(["p1", "p2", "a"]);
  });
  test("nudgeOrder moves one step and writes every sibling's order explicitly", () => {
    expect(nudgeOrder(["x", "y", "z"], "z", -1)).toEqual([{ id: "x", branchOrder: 0 }, { id: "z", branchOrder: 1 }, { id: "y", branchOrder: 2 }]);
    expect(nudgeOrder(["x", "y", "z"], "x", -1).map((o) => o.id)).toEqual(["x", "y", "z"]); // already first
    expect(nudgeOrder(["x", "y", "z"], "z", 1).map((o) => o.id)).toEqual(["x", "y", "z"]);  // already last
    expect(nudgeOrder(["x", "y"], "nope", 1)).toEqual([{ id: "x", branchOrder: 0 }, { id: "y", branchOrder: 1 }]);
  });
});

describe("rowBands — what LaneMap draws and drops onto", () => {
  test("a set with no splits is one head band holding every branch, in play order", () => {
    const l = layoutLanes([cram("a"), off("o2", "a", { branchOrder: 1 }), off("o1", "a", { branchOrder: 0 }), pitch("p", "a")]);
    const bands = rowBands(l, 0, []);
    expect(bands.map((b) => b.kind)).toEqual(["head"]);
    expect(bands[0].right.map((n) => n.id)).toEqual(["o1", "o2"]);
    expect(bands[0].left.map((n) => n.id)).toEqual(["p"]);
    expect(bands[0].takeHead).toBeNull();
  });
  test("a set with splits: head (whole-set pitches), one band per split, a tail only when needed", () => {
    const l = layoutLanes([
      cram("a"), pitch("intro", "a"), off("assets-1", "a", { branchTakeHead: "h-assets" }),
      pitch("after-liab", "a", { branchTakeHead: "h-liab" }), off("whole", "a"), off("lost", "a", { branchTakeHead: "h-gone" }),
    ], takesOf);
    const bands = rowBands(l, 0, takesOf("a"));
    expect(bands.map((b) => [b.kind, b.takeHead, b.name])).toEqual([
      ["head", null, ""], ["split", "h-assets", "Assets"], ["split", "h-liab", "Liabilities"], ["tail", null, ""],
    ]);
    expect(bands[0].left.map((n) => n.id)).toEqual(["intro"]);
    expect(bands[0].right).toEqual([]);
    expect(bands[1].right.map((n) => n.id)).toEqual(["assets-1"]);
    expect(bands[2].left.map((n) => n.id)).toEqual(["after-liab"]);
    expect(bands[3].right.map((n) => n.id)).toEqual(["whole", "lost"]);
  });
  test("no tail band when nothing needs one", () => {
    const l = layoutLanes([cram("a"), off("assets-1", "a", { branchTakeHead: "h-assets" })], takesOf);
    expect(rowBands(l, 0, takesOf("a")).map((b) => b.kind)).toEqual(["head", "split", "split"]);
  });
  test("a row with no branches still has its bands (drop targets exist before anything is there)", () => {
    const l = layoutLanes([cram("a")], takesOf);
    expect(rowBands(l, 0, takesOf("a")).map((b) => b.kind)).toEqual(["head", "split", "split"]);
  });
});

describe("planDrop — one drop, one write", () => {
  const sets = [
    cram("a"),
    off("assets-1", "a", { branchTakeHead: "h-assets", branchOrder: 0 }),
    off("assets-2", "a", { branchTakeHead: "h-assets", branchOrder: 1 }),
    off("liab-1", "a", { branchTakeHead: "h-liab", branchOrder: 2 }),
    off("whole", "a", { branchOrder: 3 }),
    pitch("intro", "a"),
    cram("b"),
    off("o-b", "b"),
  ];
  const l = layoutLanes(sets, takesOf);
  const ids = (m: ReturnType<typeof planDrop>) => m?.orders.map((o) => o.id);

  test("reorder within a split: every sibling on that parent + lane gets an explicit order, in play order", () => {
    const m = planDrop(l, takesOf, { id: "assets-2", lane: "offshoot" }, { parentId: "a", takeHead: "h-assets", index: 0 });
    expect(m).toEqual({ id: "assets-2", lane: "offshoot", parentId: "a", takeHead: "h-assets", orders: [
      { id: "assets-2", branchOrder: 0 }, { id: "assets-1", branchOrder: 1 }, { id: "liab-1", branchOrder: 2 }, { id: "whole", branchOrder: 3 },
    ] });
  });
  test("move to another split lands at the index among THAT split's branches", () => {
    const m = planDrop(l, takesOf, { id: "assets-1", lane: "offshoot" }, { parentId: "a", takeHead: "h-liab", index: 1 });
    expect(m?.takeHead).toBe("h-liab");
    expect(ids(m)).toEqual(["assets-2", "liab-1", "assets-1", "whole"]);
  });
  test("move to the whole set: an offshoot goes after the last split", () => {
    const m = planDrop(l, takesOf, { id: "liab-1", lane: "offshoot" }, { parentId: "a", takeHead: null, index: 0 });
    expect(m?.takeHead).toBeNull();
    expect(ids(m)).toEqual(["assets-1", "assets-2", "liab-1", "whole"]);
  });
  test("a pitch dropped on the whole set goes BEFORE the set, ahead of the per-split pitches", () => {
    const withPitch = layoutLanes([...sets, pitch("after-assets", "a", { branchTakeHead: "h-assets" })], takesOf);
    const m = planDrop(withPitch, takesOf, { id: "after-assets", lane: "pitch" }, { parentId: "a", takeHead: null, index: 99 });
    expect(m?.lane).toBe("pitch");
    expect(ids(m)).toEqual(["intro", "after-assets"]);
    const back = planDrop(withPitch, takesOf, { id: "intro", lane: "pitch" }, { parentId: "a", takeHead: "h-liab", index: 0 });
    expect(ids(back)).toEqual(["after-assets", "intro"]);
    expect(back?.takeHead).toBe("h-liab");
  });
  test("move to another parent: the orders are that parent's siblings plus the newcomer", () => {
    const m = planDrop(l, takesOf, { id: "whole", lane: "offshoot" }, { parentId: "b", takeHead: null, index: 0 });
    expect(m?.parentId).toBe("b");
    expect(ids(m)).toEqual(["whole", "o-b"]);
  });
  test("the index clamps to the group's ends", () => {
    expect(ids(planDrop(l, takesOf, { id: "liab-1", lane: "offshoot" }, { parentId: "a", takeHead: "h-assets", index: 99 }))).toEqual(["assets-1", "assets-2", "liab-1", "whole"]);
    expect(ids(planDrop(l, takesOf, { id: "liab-1", lane: "offshoot" }, { parentId: "a", takeHead: "h-assets", index: -5 }))).toEqual(["liab-1", "assets-1", "assets-2", "whole"]);
  });
  test("null when nothing would change", () => {
    expect(planDrop(l, takesOf, { id: "assets-2", lane: "offshoot" }, { parentId: "a", takeHead: "h-assets", index: 1 })).toBeNull();
    expect(planDrop(l, takesOf, { id: "whole", lane: "offshoot" }, { parentId: "a", takeHead: null, index: 0 })).toBeNull();
    expect(planDrop(l, takesOf, { id: "intro", lane: "pitch" }, { parentId: "a", takeHead: null, index: 0 })).toBeNull();
  });
  test("null for a split the plan lacks, a target that is not a cram set, a lane mismatch, or an orphan", () => {
    expect(planDrop(l, takesOf, { id: "assets-1", lane: "offshoot" }, { parentId: "a", takeHead: "h-nope", index: 0 })).toBeNull();
    expect(planDrop(l, takesOf, { id: "assets-1", lane: "offshoot" }, { parentId: "whole", takeHead: null, index: 0 })).toBeNull();
    expect(planDrop(l, takesOf, { id: "assets-1", lane: "pitch" }, { parentId: "b", takeHead: null, index: 0 })).toBeNull();
    const withOrphan = layoutLanes([...sets, off("lost", "zzz")], takesOf);
    expect(planDrop(withOrphan, takesOf, { id: "lost", lane: "offshoot" }, { parentId: "a", takeHead: null, index: 0 })).toBeNull();
  });
  test("a branch off a lost split keeps its own place at the end while a sibling moves", () => {
    const withLost = layoutLanes([...sets, off("lost", "a", { branchTakeHead: "h-gone" })], takesOf);
    const m = planDrop(withLost, takesOf, { id: "assets-1", lane: "offshoot" }, { parentId: "a", takeHead: null, index: 0 });
    expect(ids(m)).toEqual(["assets-2", "liab-1", "assets-1", "whole", "lost"]);
    // And the lost one itself can be rescued onto a real split.
    expect(planDrop(withLost, takesOf, { id: "lost", lane: "offshoot" }, { parentId: "a", takeHead: "h-liab", index: 0 })?.takeHead).toBe("h-liab");
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
