// FRAME GRID helpers (pure) — the SHOT tier. A frame belongs to a lesson and
// sits at (beat, subIndex): the BEAT is a COLUMN (Hook · Teach · Model-Practice
// · Check, left→right), subIndex is its ROW within that column (0-based). A
// lesson's frames form a grid — 4 beat columns, each 1..n sub-frames. This
// CORRECTS the earlier flat "beat is a loose tag + order index" model.
//
// LINEAR ORDER is COLUMN-MAJOR: Hook 1..n, Teach 1..n, M/P 1..n, Check 1..n —
// the single source for the outline, deck order, tours, and any auto-walk.
import { FRAME_BG_DEFAULT_OPACITY, FRAME_H, FRAME_W, type Beat, type FrameBox } from "./types";

export interface RectNode {
  id: string;
  type?: string;
  parentId?: string;
  position: { x: number; y: number };
  measured?: { width?: number; height?: number };
  data?: Record<string, unknown>;
}

/** Absolute rect of a node, walking the full parent chain (card→frame→lesson). */
export function absRectOf(n: RectNode, byId: Map<string, RectNode>): { x: number; y: number; w: number; h: number } {
  let x = n.position.x;
  let y = n.position.y;
  let p = n.parentId ? byId.get(n.parentId) : undefined;
  let guard = 0;
  while (p && guard++ < 20) {
    x += p.position.x;
    y += p.position.y;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  const w = (n.measured?.width ?? (n.data?.w as number | undefined) ?? 300) as number;
  const h = (n.measured?.height ?? (n.data?.h as number | undefined) ?? 170) as number;
  return { x, y, w, h };
}

// ---- the 4 beat columns ----------------------------------------------------
export const BEAT_COLUMNS: Beat[] = ["hook", "teach", "model_practice", "cram"];
export const BEAT_LABEL: Record<Beat, string> = { hook: "Hook", teach: "Teach", model_practice: "Model · Practice", cram: "Cram" };

/** A frame's beat COLUMN — legacy "check" folds to "cram", anything else
 *  unrecognized (legacy "none") folds to Hook. Keeps un-migrated scenes readable. */
export function beatColOf(n: RectNode): Beat {
  const b = (n.data as FrameBox | undefined)?.beat;
  if ((b as string) === "check") return "cram"; // legacy 4th-column value
  return b && (BEAT_COLUMNS as string[]).includes(b) ? (b as Beat) : "hook";
}
export function subIndexOf(n: RectNode): number {
  const s = (n.data as FrameBox | undefined)?.subIndex;
  return typeof s === "number" ? s : 0;
}

/** A lesson-beat column's frames, ordered by subIndex (then y as a tiebreak). */
export function framesInBeat(nodes: RectNode[], lessonId: string, beat: Beat): RectNode[] {
  return nodes
    .filter((n) => n.type === "frame" && n.parentId === lessonId && beatColOf(n) === beat)
    .sort((a, b) => subIndexOf(a) - subIndexOf(b) || a.position.y - b.position.y);
}

/** The whole grid: each beat column's frames (may be empty). */
export function lessonGrid(nodes: RectNode[], lessonId: string): Record<Beat, RectNode[]> {
  return {
    hook: framesInBeat(nodes, lessonId, "hook"),
    teach: framesInBeat(nodes, lessonId, "teach"),
    model_practice: framesInBeat(nodes, lessonId, "model_practice"),
    cram: framesInBeat(nodes, lessonId, "cram"),
  };
}

/** COLUMN-MAJOR linear order — the canonical sequence (outline/deck/tour). Also
 *  what `framesInLesson` returns, so every "walk order" caller agrees. */
export function framesInLesson(nodes: RectNode[], lessonId: string): RectNode[] {
  const g = lessonGrid(nodes, lessonId);
  return BEAT_COLUMNS.flatMap((b) => g[b]);
}

/** The next free subIndex in a lesson-beat column (append). */
export function nextSubIndex(nodes: RectNode[], lessonId: string, beat: Beat): number {
  return framesInBeat(nodes, lessonId, beat).length;
}

// ---- navigation ------------------------------------------------------------
/** →/← : the frame in the next/prev NON-EMPTY beat column of the SAME lesson —
 *  same subIndex if it exists, else that column's first frame. Null when there's
 *  no non-empty column that way (caller rolls into the adjacent lesson). */
export function beatNeighborFrame(nodes: RectNode[], frameId: string, dir: -1 | 1): RectNode | null {
  const f = nodes.find((n) => n.id === frameId);
  if (!f?.parentId) return null;
  const sub = subIndexOf(f);
  const ci = BEAT_COLUMNS.indexOf(beatColOf(f));
  for (let nci = ci + dir; nci >= 0 && nci < BEAT_COLUMNS.length; nci += dir) {
    const col = framesInBeat(nodes, f.parentId, BEAT_COLUMNS[nci]);
    if (col.length) return col.find((x) => subIndexOf(x) === sub) ?? col[0];
  }
  return null;
}

/** ↑/↓ : the prev/next sub-frame in the SAME beat column, or null at the column
 *  edge (caller creates on ↓-past-last in authoring). */
export function subNeighborFrame(nodes: RectNode[], frameId: string, dir: -1 | 1): RectNode | null {
  const f = nodes.find((n) => n.id === frameId);
  if (!f?.parentId) return null;
  const col = framesInBeat(nodes, f.parentId, beatColOf(f));
  const i = col.findIndex((x) => x.id === frameId);
  const j = i + dir;
  return i < 0 || j < 0 || j >= col.length ? null : col[j];
}

/** Cross-lesson roll: → past the last beat lands on the NEXT lesson's first Hook
 *  frame; ← before the first beat lands on the PREV lesson's LAST non-empty beat
 *  (its first frame). Lessons ordered by pathOrder. Null at the region edge. */
export function lessonRollFrame(nodes: RectNode[], frameId: string, dir: -1 | 1): RectNode | null {
  const f = nodes.find((n) => n.id === frameId);
  if (!f?.parentId) return null;
  const po = (l: RectNode) => {
    const v = (l.data as { pathOrder?: number | null } | undefined)?.pathOrder;
    return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
  };
  const lessons = nodes
    .filter((n) => n.type === "lesson" && !n.parentId)
    .sort((a, b) => po(a) - po(b) || a.position.x - b.position.x || a.position.y - b.position.y);
  const lj = lessons.findIndex((l) => l.id === f.parentId) + dir;
  if (lj < 0 || lj >= lessons.length) return null;
  const lid = lessons[lj].id;
  if (dir > 0) {
    // next lesson: first frame in column-major order (Hook 1, else earliest col)
    return framesInLesson(nodes, lid)[0] ?? null;
  }
  // prev lesson: LAST non-empty beat column, its first frame
  for (let ci = BEAT_COLUMNS.length - 1; ci >= 0; ci--) {
    const col = framesInBeat(nodes, lid, BEAT_COLUMNS[ci]);
    if (col.length) return col[0];
  }
  return null;
}

/** SPACE-WALK: the next frame in COLUMN-MAJOR order within the SAME lesson, or
 *  null at the lesson's last frame. Space NEVER rolls to the next lesson — that
 *  stays the manual → roll (the lesson is the video). */
export function frameWalkNext(nodes: RectNode[], frameId: string): RectNode | null {
  const f = nodes.find((n) => n.id === frameId);
  if (!f?.parentId) return null;
  const seq = framesInLesson(nodes, f.parentId);
  const i = seq.findIndex((x) => x.id === frameId);
  return i < 0 || i + 1 >= seq.length ? null : seq[i + 1];
}

/** SPACE-WALK REVERSE (item 3): the PREVIOUS frame in column-major order within
 *  the same lesson, or null at the lesson's first frame. Shift+Space never rolls
 *  back to the previous lesson — mirror of frameWalkNext. */
export function frameWalkPrev(nodes: RectNode[], frameId: string): RectNode | null {
  const f = nodes.find((n) => n.id === frameId);
  if (!f?.parentId) return null;
  const seq = framesInLesson(nodes, f.parentId);
  const i = seq.findIndex((x) => x.id === frameId);
  return i <= 0 ? null : seq[i - 1];
}

/** Human label for a frame's grid cell, e.g. "Teach 2" (beat + 1-based row) —
 *  the next-up HUD and rehearsal cues read from this. */
export function frameCellLabel(node: RectNode | undefined): string {
  if (!node) return "Frame";
  return `${BEAT_LABEL[beatColOf(node)]} ${subIndexOf(node) + 1}`;
}

// ---- layout ----------------------------------------------------------------
/** Aspect-lock a width to 16:9. */
export const frame169 = (w: number): { w: number; h: number } => ({ w: Math.round(w), h: Math.round((w * 9) / 16) });

/** Grid geometry: the lesson's own heading band, then a beat-column header row,
 *  then the frame cells. */
export const GRID = { lessonHeaderH: 60, colHeaderH: 34, padX: 30, padTop: 16, padBottom: 30, colGap: 70, rowGap: 56 };

/** RESERVED FOOTPRINT: a lesson cell is ALWAYS sized for the full 5 frame rows
 *  (base + up to 4 sub-frames), whether or not sub-frames exist. Space is
 *  pre-allocated so adding a sub-frame never pushes or overlaps the cell below.
 *  This is the max frames per beat (the ↓ cap, Lee's self-imposed discipline). */
export const RESERVED_ROWS = 5;

/** The x of each beat column (lesson-relative). */
export function columnX(colIndex: number, frameW = FRAME_W): number {
  return GRID.padX + colIndex * (frameW + GRID.colGap);
}
/** The y of a sub-frame row (lesson-relative). */
export function rowY(subIndex: number, frameH = FRAME_H): number {
  return GRID.lessonHeaderH + GRID.colHeaderH + GRID.padTop + subIndex * (frameH + GRID.rowGap);
}

/** Lesson-relative positions for every frame in the grid + the lesson size to
 *  contain it. `columns` gives each beat's x for header/placeholder rendering. */
export function gridLayout(grid: Record<Beat, RectNode[]>, frameW = FRAME_W, frameH = FRAME_H): {
  positions: Map<string, { x: number; y: number }>;
  w: number;
  h: number;
  columns: { beat: Beat; x: number }[];
} {
  const positions = new Map<string, { x: number; y: number }>();
  const columns = BEAT_COLUMNS.map((beat, ci) => {
    const x = columnX(ci, frameW);
    grid[beat].forEach((f, ri) => positions.set(f.id, { x, y: rowY(ri, frameH) }));
    return { beat, x };
  });
  const w = GRID.padX * 2 + BEAT_COLUMNS.length * frameW + (BEAT_COLUMNS.length - 1) * GRID.colGap;
  // RESERVED FOOTPRINT — always tall enough for RESERVED_ROWS, so a sub-frame
  // never grows the cell or overlaps its neighbour below (region-grid contract).
  const h = GRID.lessonHeaderH + GRID.colHeaderH + GRID.padTop + RESERVED_ROWS * (frameH + GRID.rowGap) - GRID.rowGap + GRID.padBottom;
  return { positions, w, h, columns };
}

// ---- region grid (reserved-space map) --------------------------------------
/** Region layout geometry: a lesson cell is a fixed footprint; cells lay in a
 *  5-wide reading-order grid (wrap down) with generous gutters; the wrap-up cell
 *  sits centered BELOW the grid. */
export const REGION = { cols: 5, minRows: 3, gutterX: 220, gutterY: 260, wrapGapY: 320 };

/** The fixed lesson-cell footprint (4 beats × RESERVED_ROWS). */
export function lessonCellSize(frameW = FRAME_W, frameH = FRAME_H): { w: number; h: number } {
  const g = gridLayout({ hook: [], teach: [], model_practice: [], cram: [] }, frameW, frameH);
  return { w: g.w, h: g.h };
}

export interface RegionLayout {
  cells: { x: number; y: number }[]; // every grid SLOT (filled first, then ghosts), reading order
  totalSlots: number;
  filled: number;
  cols: number;
  rows: number;
  gridW: number;
  gridH: number;
  wrapUp: { x: number; y: number } | null; // centered below the grid (null if no wrap-up)
}

/** Lay `nGrid` lesson cells in the reserved 5-wide grid from (originX, originY),
 *  padding to at least minRows×cols slots (ghost cells fill the rest). A 16th+
 *  cell extends to more rows (soft — warn, never block). If `hasWrapUp`, the
 *  wrap-up sits centered below the grid. */
export function regionLayout(nGrid: number, originX: number, originY: number, hasWrapUp: boolean, cell = lessonCellSize()): RegionLayout {
  const cols = REGION.cols;
  const rows = Math.max(REGION.minRows, Math.ceil(nGrid / cols));
  const totalSlots = cols * rows;
  const cells: { x: number; y: number }[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({ x: originX + col * (cell.w + REGION.gutterX), y: originY + row * (cell.h + REGION.gutterY) });
  }
  const gridW = cols * cell.w + (cols - 1) * REGION.gutterX;
  const gridH = rows * cell.h + (rows - 1) * REGION.gutterY;
  const wrapUp = hasWrapUp ? { x: originX + (gridW - cell.w) / 2, y: originY + gridH + REGION.wrapGapY } : null;
  return { cells, totalSlots, filled: nGrid, cols, rows, gridW, gridH, wrapUp };
}

/** The wrap-up chapter is the LAST one whose name reads "wrap-up" (fallback: the
 *  highest-ordered chapter). Pulled out of the grid, centered below as the
 *  destination. */
export function isWrapUpName(name: string | null | undefined): boolean {
  return !!name && /wrap.?up/i.test(name);
}

// ---- construction ----------------------------------------------------------
export function blankFrameData(beat: Beat = "hook", subIndex = 0): FrameBox {
  // Hook frames get the background SLOT primed (default opacity set, src empty).
  const bg = beat === "hook" ? { bgOpacity: FRAME_BG_DEFAULT_OPACITY, bgPlaying: false } : {};
  // FRAMES SHIP LOCKED (item 2) — they stop getting dragged by accident; the
  // frame hover-chrome lock toggles it.
  return { title: "", w: FRAME_W, h: FRAME_H, beat, subIndex, posLock: true, ...bg };
}

/** The four beats a scaffolded lesson pre-loads — one frame per column. */
export const SCAFFOLD_BEATS: { beat: Beat; title: string }[] = [
  { beat: "hook", title: "Hook" },
  { beat: "teach", title: "Teach" },
  { beat: "model_practice", title: "Model · Practice" },
  { beat: "cram", title: "Cram" },
];

/** DIRECTOR NOTES (item 8) stamped on the scaffold's beat openers — Lee's on-set
 *  reminder for each shot. Filming chrome (hidden in film). */
export const SCAFFOLD_NOTES: Partial<Record<Beat, string>> = {
  teach: "Kill THE misconception. Open on the hardest CEQ — nearly full screen, centered.",
  model_practice: "Model the next hardest 3-5. Narrate your reasoning slowly.",
};

// ---- COMPOSITION GUIDES (pure) --------------------------------------------
// While Lee drags a card INSIDE a frame, help him compose the SHOT: show the
// frame's center, rule-of-thirds, and fifths lines (plus a title-safe margin and
// sibling-card centers), and softly snap the card onto whichever line it's
// closest to. All math is in FRAME-LOCAL coordinates (a child's position is
// relative to its frame), so the caller passes local rects and renders the
// returned line positions by offsetting to the frame's absolute origin.

/** Guide weight = both the compositional strength AND the render treatment
 *  (center strongest → thickest/brightest; fifth lightest). */
export type GuideWeight = "center" | "third" | "fifth" | "card" | "safe";
export interface Guide { pos: number; weight: GuideWeight }
export interface CompositionGuides { v: Guide[]; h: Guide[]; snapX: number | null; snapY: number | null }

/** Default title-safe inset as a FRACTION of the frame's short-ish dimension —
 *  ~5% action-safe, the broadcast convention. The caller passes px. */
export const SAFE_INSET_FRAC = 0.05;

// Strongest (lowest rank) wins when several lines are within threshold at once.
const WEIGHT_RANK: Record<GuideWeight, number> = { center: 0, card: 1, third: 2, safe: 3, fifth: 4 };

type Cand = { pos: number; weight: GuideWeight; align: "center" | "start" | "end" };

/** One axis: given the frame size, the dragged node's [start,size] and the
 *  siblings' [start,size] on this axis, return the matched guide lines and the
 *  single best snapped `start` (null if nothing within threshold). */
function axisGuides(
  frameSize: number,
  nodeStart: number,
  nodeSize: number,
  siblings: { start: number; size: number }[],
  th: number,
  safeInset: number | null,
): { lines: Guide[]; snap: number | null } {
  const cands: Cand[] = [
    { pos: frameSize / 2, weight: "center", align: "center" },
    { pos: frameSize / 3, weight: "third", align: "center" },
    { pos: (2 * frameSize) / 3, weight: "third", align: "center" },
    { pos: frameSize / 5, weight: "fifth", align: "center" },
    { pos: (2 * frameSize) / 5, weight: "fifth", align: "center" },
    { pos: (3 * frameSize) / 5, weight: "fifth", align: "center" },
    { pos: (4 * frameSize) / 5, weight: "fifth", align: "center" },
  ];
  if (safeInset != null && safeInset > 0) {
    cands.push({ pos: safeInset, weight: "safe", align: "start" });
    cands.push({ pos: frameSize - safeInset, weight: "safe", align: "end" });
  }
  for (const s of siblings) cands.push({ pos: s.start + s.size / 2, weight: "card", align: "center" });

  const nodeCenter = nodeStart + nodeSize / 2;
  const nodeEnd = nodeStart + nodeSize;
  const lines: Guide[] = [];
  let best: { rank: number; abs: number; start: number } | null = null;
  for (const c of cands) {
    const alignPoint = c.align === "center" ? nodeCenter : c.align === "start" ? nodeStart : nodeEnd;
    const delta = c.pos - alignPoint;
    if (Math.abs(delta) > th) continue;
    lines.push({ pos: c.pos, weight: c.weight });
    const rank = WEIGHT_RANK[c.weight];
    const abs = Math.abs(delta);
    if (!best || rank < best.rank || (rank === best.rank && abs < best.abs)) {
      best = { rank, abs, start: nodeStart + delta };
    }
  }
  // dedupe lines at the same position, keeping the strongest weight
  const byPos = new Map<number, Guide>();
  for (const g of lines) {
    const cur = byPos.get(g.pos);
    if (!cur || WEIGHT_RANK[g.weight] < WEIGHT_RANK[cur.weight]) byPos.set(g.pos, g);
  }
  return { lines: [...byPos.values()], snap: best ? best.start : null };
}

/** Frame composition guides for a dragged card. `frame` and `node`/`siblings`
 *  rects are FRAME-LOCAL (node.position as stored). `altBypass` keeps the guides
 *  visible but suppresses the snap (hold Alt to place freely). */
export function frameCompositionGuides(
  frame: { w: number; h: number },
  node: { x: number; y: number; w: number; h: number },
  siblings: { x: number; y: number; w: number; h: number }[],
  opts?: { threshold?: number; safeInset?: number | null; altBypass?: boolean },
): CompositionGuides {
  const th = opts?.threshold ?? 6;
  const safeInset = opts?.safeInset === undefined ? Math.round(Math.min(frame.w, frame.h) * SAFE_INSET_FRAC) : opts.safeInset;
  const vx = axisGuides(frame.w, node.x, node.w, siblings.map((s) => ({ start: s.x, size: s.w })), th, safeInset);
  const hy = axisGuides(frame.h, node.y, node.h, siblings.map((s) => ({ start: s.y, size: s.h })), th, safeInset);
  return {
    v: vx.lines,
    h: hy.lines,
    snapX: opts?.altBypass ? null : vx.snap,
    snapY: opts?.altBypass ? null : hy.snap,
  };
}
