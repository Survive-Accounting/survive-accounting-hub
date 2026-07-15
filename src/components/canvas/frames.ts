// FRAME helpers (pure) — the SHOT tier. A frame is a 16:9 stage parented to a
// lesson; cards parent to the frame. Camera "enter" fits a frame's ABSOLUTE
// rect exactly; prev/next walk the lesson's ordered frames. No React/RF here.
import { FRAME_H, FRAME_W, type FrameBox } from "./types";

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

export const frameOrderOf = (n: RectNode): number => {
  const v = (n.data as FrameBox | undefined)?.order;
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
};

/** A lesson's frames in walk order: explicit `order`, then left-to-right, top. */
export function framesInLesson(nodes: RectNode[], lessonId: string): RectNode[] {
  return nodes
    .filter((n) => n.type === "frame" && n.parentId === lessonId)
    .sort((a, b) => frameOrderOf(a) - frameOrderOf(b) || a.position.x - b.position.x || a.position.y - b.position.y);
}

/** The next `order` value for a new frame in a lesson (1-based, appended). */
export function nextFrameOrder(nodes: RectNode[], lessonId: string): number {
  const frames = framesInLesson(nodes, lessonId);
  const max = frames.reduce((m, f) => Math.max(m, Number.isFinite(frameOrderOf(f)) ? frameOrderOf(f) : 0), 0);
  return max + 1;
}

/** The adjacent frame in the SAME lesson (dir -1 prev / +1 next), or null at the
 *  lesson's edge — we stop at edges (no wrap into sibling lessons for now). */
export function adjacentFrame(nodes: RectNode[], frameId: string, dir: -1 | 1): RectNode | null {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame || !frame.parentId) return null;
  const list = framesInLesson(nodes, frame.parentId);
  const i = list.findIndex((f) => f.id === frameId);
  const j = i + dir;
  return i < 0 || j < 0 || j >= list.length ? null : list[j];
}

/** The first (dir +1, next lesson) / last (dir -1, prev lesson) frame of the
 *  lesson adjacent to this frame's lesson, ordered by lesson pathOrder. Null at
 *  the region's edge or if the neighbour has no frames. Powers →/← lesson jumps. */
export function lessonNeighborFrame(nodes: RectNode[], frameId: string, dir: -1 | 1): RectNode | null {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame?.parentId) return null;
  const po = (l: RectNode) => {
    const v = (l.data as { pathOrder?: number | null } | undefined)?.pathOrder;
    return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
  };
  const lessons = nodes.filter((n) => n.type === "lesson" && !n.parentId).sort((a, b) => po(a) - po(b) || a.position.x - b.position.x || a.position.y - b.position.y);
  const li = lessons.findIndex((l) => l.id === frame.parentId);
  const lj = li + dir;
  if (li < 0 || lj < 0 || lj >= lessons.length) return null;
  const frames = framesInLesson(nodes, lessons[lj].id);
  if (frames.length === 0) return null;
  return dir > 0 ? frames[0] : frames[frames.length - 1];
}

/** Aspect-lock a width to 16:9. */
export const frame169 = (w: number): { w: number; h: number } => ({ w: Math.round(w), h: Math.round((w * 9) / 16) });

export function blankFrameData(beat: FrameBox["beat"] = "none", order?: number): FrameBox {
  return { title: "", w: FRAME_W, h: FRAME_H, beat, order: order ?? null };
}

/** The four beats a scaffolded lesson pre-loads, in walk order. */
export const SCAFFOLD_BEATS: { beat: FrameBox["beat"]; title: string }[] = [
  { beat: "hook", title: "Hook" },
  { beat: "teach", title: "Teach" },
  { beat: "model_practice", title: "Model · Practice" },
  { beat: "check", title: "Check" },
];

export const FILMSTRIP = { headerH: 56, pad: 30, gap: 80 };

/** Lay `count` frames as a horizontal FILMSTRIP inside a lesson: each frame's
 *  LESSON-relative position + the lesson size needed to contain the strip. */
export function filmstripLayout(count: number, frameW = FRAME_W, frameH = FRAME_H): {
  positions: { x: number; y: number }[];
  w: number;
  h: number;
} {
  const { headerH, pad, gap } = FILMSTRIP;
  const positions = Array.from({ length: count }, (_, i) => ({ x: pad + i * (frameW + gap), y: headerH + pad }));
  const w = count > 0 ? pad + count * frameW + (count - 1) * gap + pad : 460;
  const h = headerH + pad + frameH + pad;
  return { positions, w, h };
}
