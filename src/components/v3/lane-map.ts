// THE MAP'S LAYOUT — pure. Where every set sits in three columns, and what connects to what.
//
// Lee, 2026-09-09: "I can picture the UI being really cool for this… you have a path in the
// middle and you have offshoots… to the right of the path" and, on the left, "pitch videos —
// there's going to be moments where I'm making a pause in the midst of things to say hey we
// partner with chapters."
//
//   col 0  PITCHES     what sells (chapters, campus reps)
//   col 1  CRAM PATH   the spine, in the queue's own order
//   col 2  OFFSHOOTS   the teaching / go-deeper videos
//
// Deterministic: no Date, no random, no network. Given the same sets in the same order it draws
// the same picture, which is what makes it testable and what makes the SVG cacheable.
import { laneOf, type DeckLane } from "@/lib/deck-lane";

/** What the map knows about a set. Structural only — the stage chip, the question count and the
 *  runtime are looked up by id at render, so this layer never goes stale. */
export interface LaneSet {
  id: string;
  name: string;
  lane?: unknown;
  branchFrom?: string;
  splitInto?: string[];
}

export interface LaneNode {
  id: string;
  name: string;
  lane: DeckLane;
  /** 0 = pitch, 1 = cram, 2 = offshoot. */
  col: 0 | 1 | 2;
  /** The cram row this sits on. A branch shares its parent's row. */
  row: number;
  /** k-th child on that side of that row; 0 for cram. */
  sub: number;
  /** Its branchFrom names nothing usable — drawn below the path, dashed, never hidden. */
  orphan: boolean;
}

export interface LaneEdge {
  from: string;
  to: string;
  /** "branch" = a pitch/offshoot hanging off its cram parent. "split" = provenance: this set was
   *  cut out of that one (lib/split-set.functions.ts wrote it). */
  kind: "branch" | "split";
}

export interface LaneLayout {
  nodes: LaneNode[];
  edges: LaneEdge[];
  /** Cram sets — the number of rows on the spine. */
  rows: number;
  orphans: number;
  /** Per row, how many children hang on each side — the renderer grows a row to fit the taller. */
  depth: { left: number; right: number }[];
}

const COL: Record<DeckLane, 0 | 1 | 2> = { pitch: 0, cram: 1, offshoot: 2 };

/** Lay a topic's sets out. `order` must already be in the order the queue shows them
 *  (v3-topic-groups.ts orderedSets) — the map and the queue must agree row for row or the map
 *  is lying about the path. */
export function layoutLanes(order: readonly LaneSet[]): LaneLayout {
  const cram = order.filter((s) => laneOf(s) === "cram");
  const rowOf = new Map<string, number>();
  cram.forEach((s, i) => rowOf.set(s.id, i));

  const nodes: LaneNode[] = [];
  const edges: LaneEdge[] = [];
  const depth: { left: number; right: number }[] = cram.map(() => ({ left: 0, right: 0 }));
  let orphans = 0;

  for (const s of order) {
    const lane = laneOf(s);
    if (lane === "cram") {
      nodes.push({ id: s.id, name: s.name, lane, col: 1, row: rowOf.get(s.id) ?? 0, sub: 0, orphan: false });
      continue;
    }
    // A BRANCH. Its parent has to be a cram set in this same list; anything else is an orphan —
    // drawn, never dropped, because a set Lee cannot see is a set he cannot fix.
    const parentRow = s.branchFrom != null ? rowOf.get(s.branchFrom) : undefined;
    if (parentRow == null) {
      nodes.push({ id: s.id, name: s.name, lane, col: COL[lane], row: cram.length + orphans, sub: 0, orphan: true });
      orphans += 1;
      continue;
    }
    const side = lane === "pitch" ? "left" : "right";
    const sub = depth[parentRow][side];
    depth[parentRow][side] = sub + 1;
    nodes.push({ id: s.id, name: s.name, lane, col: COL[lane], row: parentRow, sub, orphan: false });
    edges.push({ from: s.branchFrom as string, to: s.id, kind: "branch" });
  }

  // SPLIT PROVENANCE, free: the pieces a set was cut into are already recorded, so the map can
  // show that this row and that row came out of the same original.
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
