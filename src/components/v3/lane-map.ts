// THE MAP'S LAYOUT — pure. Where every set sits in three columns, what connects to what, and
// the order Lee films them in.
//
// Lee, 2026-09-09: "you have a path in the middle and you have offshoots… to the right of the
// path" and, on the left, pitch videos. 2026-09-10: "These splits are cram videos and each can
// have offshoots… I want to start arranging the offshoots in particular orders, connect them to
// the right splits, and this way I'll know what order of production I'm making the videos today."
// Later the same day: "I picture the pitch being the first one, so I'll make a short for Easy
// Points is free, explain the process, then jump right into the cram path… a pitch at the
// beginning, a pitch at the end, or I can move them to the middle."
//
//   col 0  PITCHES     what sells (chapters, campus reps)
//   col 1  CRAM PATH   the spine, in the queue's own order — each set with its splits
//   col 2  OFFSHOOTS   the teaching / go-deeper videos, grouped under the split they hang off
//
// PRODUCTION ORDER is the play order, row by row down the cram path. Within a row: the pitches
// that hang off the whole set play BEFORE it; then the cram set itself; then, split by split in
// the plan's order, that split's offshoots and then the pitches placed after that split; then the
// offshoots that hang off the whole set. A branch whose split the plan no longer has plays last.
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
  /** k-th child on that side of that row, in play order. 0 for cram. */
  sub: number;
  /** Its branchFrom names nothing usable — drawn below the path, dashed, never hidden. */
  orphan: boolean;
  /** For a branch: the split it hangs off, resolved against the parent's plan. null = the whole
   *  set, or a head the plan no longer has. */
  take: { headId: string; name: string; index: number } | null;
  /** For a branch: the raw branchTakeHead it was saved with — null = the whole set — whether or
   *  not the plan still has it. What a drop compares against. null for cram. */
  takeHead: string | null;
  /** True when branchTakeHead named a split the parent's plan does not have — drawn, flagged. */
  takeMissing: boolean;
  /** The 1-based production number, in play order. 0 for an orphan. */
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

/** takeIndex of a branch whose split the plan lost — sorts after everything. */
const TAKE_MISSING = Number.MAX_SAFE_INTEGER;

/** Branches on one side of one parent, in the order Lee films them: by the split they hang off
 *  (plan order; a missing split last — the whole set is takeIndex -1 for a pitch, which plays
 *  before the set, and takeIndex = the split count for an offshoot, which plays after them all),
 *  then branchOrder (absent last), then name — so a set he has not arranged still draws the same
 *  way every time. */
export function sortBranches<T extends { name: string; branchOrder?: number; takeIndex: number }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    a.takeIndex - b.takeIndex
    || (a.branchOrder ?? Number.POSITIVE_INFINITY) - (b.branchOrder ?? Number.POSITIVE_INFINITY)
    || a.name.localeCompare(b.name));
}

/** Where a branch falls in its row's play order, against the parent's `splits`. The cram set is
 *  phase 1; whole-set pitches 0; split i's offshoots 2+2i and its pitches 3+2i; whole-set
 *  offshoots after the last split; anything off a lost split at the very end. */
function phaseOf(lane: DeckLane, takeIndex: number, splits: number): number {
  if (takeIndex === TAKE_MISSING) return 2 + 2 * splits + (lane === "offshoot" ? 1 : 2);
  if (lane === "pitch") return takeIndex < 0 ? 0 : 3 + 2 * takeIndex;
  return 2 + 2 * Math.min(takeIndex, splits);
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

  // The cram path. Its production numbers are filled in below, once the pitches that play before
  // each set are known.
  const cramNodes = cram.map((s, i): LaneNode => ({ id: s.id, name: s.name, lane: "cram", col: 1, row: i, sub: 0, orphan: false, take: null, takeHead: null, takeMissing: false, order: 0 }));
  nodes.push(...cramNodes);

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
    // The whole set: a pitch plays before it, an offshoot after its last split.
    let takeIndex = lane === "pitch" ? -1 : takes.length;
    if (s.branchTakeHead) {
      const idx = takes.findIndex((t) => t.headId === s.branchTakeHead);
      if (idx >= 0) { take = { headId: takes[idx].headId, name: takes[idx].name, index: idx }; takeIndex = idx; }
      else { takeMissing = true; takeIndex = TAKE_MISSING; }
    }
    const key = `${parentRow}:${lane === "pitch" ? "L" : "R"}`;
    const list = bySide.get(key) ?? [];
    list.push({ s, lane, row: parentRow, take, takeMissing, takeIndex, branchOrder: s.branchOrder, name: s.name });
    bySide.set(key, list);
  }

  let next = 1;
  for (let row = 0; row < cram.length; row++) {
    const splits = takesOf(cram[row].id).length;
    const right = sortBranches(bySide.get(`${row}:R`) ?? []);
    const left = sortBranches(bySide.get(`${row}:L`) ?? []);
    depth[row] = { left: left.length, right: right.length };
    const branchNodes: LaneNode[] = [];
    for (const side of [right, left]) {
      side.forEach((p, sub) => {
        branchNodes.push({ id: p.s.id, name: p.s.name, lane: p.lane, col: COL[p.lane], row, sub, orphan: false, take: p.take, takeHead: p.s.branchTakeHead || null, takeMissing: p.takeMissing, order: 0 });
        edges.push({ from: p.s.branchFrom as string, to: p.s.id, kind: "branch" });
      });
    }
    // THE PLAY ORDER of this row: phase first, then the side's own order (stable within a phase,
    // since one phase only ever holds one side).
    const phased = branchNodes.map((n, i) => ({ n, phase: phaseOf(n.lane, n.takeMissing ? TAKE_MISSING : n.take ? n.take.index : n.lane === "pitch" ? -1 : splits, splits), i }));
    phased.push({ n: cramNodes[row], phase: 1, i: -1 });
    phased.sort((a, b) => a.phase - b.phase || a.n.sub - b.n.sub || a.i - b.i);
    for (const p of phased) p.n.order = next++;
    nodes.push(...branchNodes);
  }
  // Orphans are drawn, never dropped — a set Lee cannot see is a set he cannot fix. They get no
  // production number: nothing hangs off nothing.
  for (const { s, lane } of orphanList) {
    nodes.push({ id: s.id, name: s.name, lane, col: COL[lane], row: cram.length + orphans, sub: 0, orphan: true, take: null, takeHead: s.branchTakeHead || null, takeMissing: false, order: 0 });
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

/** The tallest side of a row — how many branches it stacks. */
export function rowDepth(layout: LaneLayout, row: number): number {
  const d = layout.depth[row];
  return d ? Math.max(d.left, d.right) : 0;
}

/** ONE ROW, BAND BY BAND — the geometry LaneMap draws and the drop targets it offers. A cram set
 *  with splits is a header band (the set's name; the whole-set pitches hang level with it), one
 *  band per split (that split's offshoots right, its pitches left), and — only when something
 *  needs it — a tail band after the last split for the whole-set offshoots and anything off a
 *  split the plan lost. A set with no splits is a single header band holding every branch. */
export interface RowBand {
  kind: "head" | "split" | "tail";
  /** The drop target this band stands for: a split's head id, or null = the whole set. */
  takeHead: string | null;
  /** The split's name; "" for head and tail. */
  name: string;
  /** Pitches on this band, in play order. */
  left: LaneNode[];
  /** Offshoots on this band, in play order. */
  right: LaneNode[];
}

export function rowBands(layout: LaneLayout, row: number, takes: readonly LaneTake[]): RowBand[] {
  const bySub = (a: LaneNode, b: LaneNode) => a.sub - b.sub;
  const here = layout.nodes.filter((n) => n.row === row && !n.orphan && n.lane !== "cram");
  const pitches = here.filter((n) => n.lane === "pitch").sort(bySub);
  const offshoots = here.filter((n) => n.lane === "offshoot").sort(bySub);
  if (takes.length <= 1) return [{ kind: "head", takeHead: null, name: "", left: pitches, right: offshoots }];
  const bands: RowBand[] = [{ kind: "head", takeHead: null, name: "", left: pitches.filter((n) => n.takeHead == null), right: [] }];
  for (const t of takes) {
    bands.push({ kind: "split", takeHead: t.headId, name: t.name, left: pitches.filter((n) => n.take?.headId === t.headId), right: offshoots.filter((n) => n.take?.headId === t.headId) });
  }
  const tail: RowBand = { kind: "tail", takeHead: null, name: "", left: pitches.filter((n) => n.takeMissing), right: offshoots.filter((n) => n.take == null) };
  if (tail.left.length || tail.right.length) bands.push(tail);
  return bands;
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

/** DRAG AND DROP, planned. Lee, 2026-09-10: "▲▼ says it's moving it but it doesn't move it, so
 *  drag and drop would be best." One drop is one write: the dragged branch's new parent and split,
 *  plus the FULL ordering of every sibling on that parent and lane (0..n-1 in play order — the
 *  same law as nudgeOrder, so an unarranged set becomes explicit the first time he touches it). */
export interface BranchMove {
  id: string;
  lane: "offshoot" | "pitch";
  parentId: string;
  takeHead: string | null;
  orders: { id: string; branchOrder: number }[];
}

/** Where the dragged branch lands: under `parentId`, on split `takeHead` (null = the whole set —
 *  before it for a pitch, after its last split for an offshoot), at `index` among the branches
 *  already on that parent + lane + split (the dragged one not counted). Returns null when the
 *  target is not a cram set on the map, names a split its plan lacks, the branch is not a drawn
 *  branch of that lane, or the drop would change nothing. Ids are deck ids. */
export function planDrop(
  layout: LaneLayout,
  takesOf: (setId: string) => readonly LaneTake[],
  dragged: { id: string; lane: "offshoot" | "pitch" },
  target: { parentId: string; takeHead: string | null; index: number },
): BranchMove | null {
  const node = layout.nodes.find((n) => n.id === dragged.id);
  if (!node || node.orphan || node.lane !== dragged.lane) return null;
  const parent = layout.nodes.find((n) => n.id === target.parentId && n.lane === "cram" && !n.orphan);
  if (!parent) return null;
  const takes = takesOf(parent.id);
  if (target.takeHead != null && !takes.some((t) => t.headId === target.takeHead)) return null;

  const bySub = (a: LaneNode, b: LaneNode) => a.sub - b.sub;
  const siblings = layout.nodes.filter((n) => n.row === parent.row && n.lane === dragged.lane && !n.orphan && n.id !== dragged.id).sort(bySub);
  // A group per split, in the lane's play order; a lost split keeps its own group at the end.
  const keyOf = (n: LaneNode): string | null => n.takeMissing ? `!${n.takeHead}` : n.take ? n.take.headId : null;
  const heads = takes.map((t) => t.headId);
  const keys: (string | null)[] = dragged.lane === "pitch" ? [null, ...heads] : [...heads, null];
  for (const n of siblings) { const k = keyOf(n); if (!keys.includes(k)) keys.push(k); }

  const next: string[] = [];
  for (const k of keys) {
    const group = siblings.filter((n) => keyOf(n) === k).map((n) => n.id);
    if (k === target.takeHead) group.splice(Math.max(0, Math.min(group.length, Math.floor(target.index))), 0, dragged.id);
    next.push(...group);
  }

  if (node.row === parent.row && node.takeHead === target.takeHead) {
    const current = layout.nodes.filter((n) => n.row === parent.row && n.lane === dragged.lane && !n.orphan).sort(bySub).map((n) => n.id);
    if (current.length === next.length && current.every((id, i) => id === next[i])) return null;
  }
  return { id: dragged.id, lane: dragged.lane, parentId: parent.id, takeHead: target.takeHead, orders: next.map((id, k) => ({ id, branchOrder: k })) };
}
