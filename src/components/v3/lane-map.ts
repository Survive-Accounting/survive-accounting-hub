// THE MAP'S LAYOUT — pure. Where every set sits in three columns, what connects to what, and
// the order Lee films them in.
//
// Lee, 2026-09-09: "you have a path in the middle and you have offshoots… to the right of the
// path" and, on the left, pitch videos. 2026-09-10: "These splits are cram videos and each can
// have offshoots… I want to start arranging the offshoots in particular orders, connect them to
// the right splits, and this way I'll know what order of production I'm making the videos today."
//
//   col 0  PITCHES     what sells (chapters, campus reps)
//   col 1  CRAM PATH   the spine, in the queue's own order — each set with its splits
//   col 2  OFFSHOOTS   the teaching / go-deeper videos, grouped under the split they hang off
//
// PRODUCTION ORDER is the cram path first, top to bottom, then the branches in map order — because
// Lee's plan is "complete the cram path quickly, then go back and fill in offshoots after."
//
// Deterministic: no Date, no random, no network.
import { laneOf, type DeckLane } from "@/lib/deck-lane";

/** What the map knows about a set. Structural only — stage, count and runtime are looked up by id
 *  at render, so this layer never goes stale. */
export interface LaneSet {
  id: string;
  name: string;
  lane?: unknown;
  branchFrom?: string;
  /** The head frame id of the parent's split this hangs off; absent = the set as a whole. */
  branchTakeHead?: string;
  /** Lee's arrangement among the branches on one parent. Absent sorts last. */
  branchOrder?: number;
  splitInto?: string[];
}

/** One split of a cram set, as the parent's plan lists them (lib/blastoff.functions.ts). */
export interface LaneTake { headId: string; name: string }

export interface LaneNode {
  id: string;
  name: string;
  lane: DeckLane;
  /** 0 = pitch, 1 = cram, 2 = offshoot. */
  col: 0 | 1 | 2;
  /** The cram row this sits on. A branch shares its parent's row. */
  row: number;
  /** k-th child on that side of that row, after grouping by split and Lee's order. 0 for cram. */
  sub: number;
  /** Its branchFrom names nothing usable — drawn below the path, dashed, never hidden. */
  orphan: boolean;
  /** For a branch: the split it hangs off, resolved against the parent's plan. null = the whole
   *  set, or a head the plan no longer has. */
  take: { headId: string; name: string; index: number } | null;
  /** True when branchTakeHead named a split the parent's plan does not have — drawn, flagged. */
  takeMissing: boolean;
  /** The 1-based production number: cram path first, then branches. */
  order: number;
}

export interface LaneEdge { from: string; to: string; kind: "branch" | "split" }

export interface LaneLayout {
  nodes: LaneNode[];
  edges: LaneEdge[];
  rows: number;
  orphans: number;
  depth: { left: number; right: number }[];
}

const COL: Record<DeckLane, 0 | 1 | 2> = { pitch: 0, cram: 1, offshoot: 2 };

/** Branches on one side of one parent, in the order Lee films them: by the split they hang off
 *  (plan order; "the whole set" comes first, a missing split last), then branchOrder (absent
 *  last), then name — so a set he has not arranged still draws the same way every time. */
export function sortBranches<T extends { name: string; branchOrder?: number; takeIndex: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    a.takeIndex - b.takeIndex
    || (a.branchOrder ?? Number.POSITIVE_INFINITY) - (b.branchOrder ?? Number.POSITIVE_INFINITY)
    || a.name.localeCompare(b.name));
}

/** Lay a topic's sets out. `order` must already be in the order the queue shows them
 *  (v3-topic-groups.ts orderedSets). `takesOf` returns a cram set's splits from its saved plan;
 *  a set with no plan has none, and a branch that names one is flagged, not hidden. */
export function layoutLanes(order: readonly LaneSet[], takesOf: (setId: string) => readonly LaneTake[] = () => []): LaneLayout {
  const cram = order.filter((s) => laneOf(s) === "cram");
  const rowOf = new Map<string, number>();
  cram.forEach((s, i) => rowOf.set(s.id, i));

  const nodes: LaneNode[] = [];
  const edges: LaneEdge[] = [];
  const depth = cram.map(() => ({ left: 0, right: 0 }));
  let orphans = 0;

  // The cram path, numbered first.
  cram.forEach((s, i) => nodes.push({ id: s.id, name: s.name, lane: "cram", col: 1, row: i, sub: 0, orphan: false, take: null, takeMissing: false, order: i + 1 }));

  // The branches, gathered per parent per side, then sorted the way Lee arranged them.
  type Pending = { s: LaneSet; lane: DeckLane; row: number; take: LaneNode["take"]; takeMissing: boolean; takeIndex: number; branchOrder?: number; name: string };
  const bySide = new Map<string, Pending[]>();
  const orphanList: { s: LaneSet; lane: DeckLane }[] = [];
  for (const s of order) {
    const lane = laneOf(s);
    if (lane === "cram") continue;
    const parentRow = s.branchFrom != null ? rowOf.get(s.branchFrom) : undefined;
    if (parentRow == null) { orphanList.push({ s, lane }); continue; }
    const takes = takesOf(s.branchFrom as string);
    let take: LaneNode["take"] = null;
    let takeMissing = false;
    let takeIndex = -1; // "the whole set" leads
    if (s.branchTakeHead) {
      const idx = takes.findIndex((t) => t.headId === s.branchTakeHead);
      if (idx >= 0) { take = { headId: takes[idx].headId, name: takes[idx].name, index: idx }; takeIndex = idx; }
      else { takeMissing = true; takeIndex = Number.MAX_SAFE_INTEGER; }
    }
    const key = `${parentRow}:${lane === "pitch" ? "L" : "R"}`;
    const list = bySide.get(key) ?? [];
    list.push({ s, lane, row: parentRow, take, takeMissing, takeIndex, branchOrder: s.branchOrder, name: s.name });
    bySide.set(key, list);
  }

  let next = cram.length + 1;
  // Walk rows top to bottom, right side (offshoots) before left (pitches) — the teaching video
  // is the one he goes back for; a pitch is a fifteen-second aside.
  for (let row = 0; row < cram.length; row++) {
    for (const side of ["R", "L"] as const) {
      const list = sortBranches(bySide.get(`${row}:${side}`) ?? []);
      list.forEach((p, sub) => {
        nodes.push({ id: p.s.id, name: p.s.name, lane: p.lane, col: COL[p.lane], row, sub, orphan: false, take: p.take, takeMissing: p.takeMissing, order: next++ });
        edges.push({ from: p.s.branchFrom as string, to: p.s.id, kind: "branch" });
      });
      depth[row][side === "L" ? "left" : "right"] = list.length;
    }
  }
  // Orphans are drawn, never dropped — a set Lee cannot see is a set he cannot fix. They get no
  // production number: nothing hangs off nothing.
  for (const { s, lane } of orphanList) {
    nodes.push({ id: s.id, name: s.name, lane, col: COL[lane], row: cram.length + orphans, sub: 0, orphan: true, take: null, takeMissing: false, order: 0 });
    orphans += 1;
  }

  // SPLIT PROVENANCE, free: the pieces a set was cut into are already recorded.
  const present = new Set(order.map((s) => s.id));
  for (const s of order) {
    for (const piece of s.splitInto ?? []) {
      if (present.has(piece) && piece !== s.id) edges.push({ from: s.id, to: piece, kind: "split" });
    }
  }

  return { nodes, edges, rows: cram.length, orphans, depth };
}

/** The tallest side of a row — how much vertical room it needs. */
export function rowDepth(layout: LaneLayout, row: number): number {
  const d = layout.depth[row];
  return d ? Math.max(d.left, d.right) : 0;
}

/** Cram sets with nothing hanging off them, in order — "which of these still needs a deeper
 *  one?" is the question the map exists to answer. */
export function bareCramIds(layout: LaneLayout): string[] {
  const parented = new Set(layout.edges.filter((e) => e.kind === "branch").map((e) => e.from));
  return layout.nodes.filter((n) => n.lane === "cram" && !parented.has(n.id)).map((n) => n.id);
}

/** Move a branch one step among its siblings on the same parent and side, returning the new
 *  branchOrder for EVERY sibling (0..n-1) so the arrangement is explicit from then on — a set
 *  that has never been arranged has no orders at all, and one nudge must not leave it half-set.
 *  `ids` is the siblings in their current drawn order. */
export function nudgeOrder(ids: readonly string[], id: string, dir: -1 | 1): { id: string; branchOrder: number }[] {
  const i = ids.indexOf(id);
  if (i < 0) return ids.map((x, k) => ({ id: x, branchOrder: k }));
  const j = Math.max(0, Math.min(ids.length - 1, i + dir));
  const next = [...ids];
  next.splice(i, 1);
  next.splice(j, 0, id);
  return next.map((x, k) => ({ id: x, branchOrder: k }));
}
