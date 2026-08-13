// FLOATING ARROW ANCHORS (Lee: "attach arrows to any point on any element's
// border"). A plain card→card arrow is marked data.floating and, instead of
// snapping to one of the four t/b/l/r dots, its endpoint slides to the exact
// point on each node's border that faces the other node — anywhere along the
// full perimeter, live as either node moves.
//
// Pure math (no React Flow import) so it unit-tests on plain rects. Semantic
// arrows (ln:/mn:/anc: handles) are NOT floating — they keep their fixed handle.

export interface Rect {
  x: number; // top-left, absolute canvas coords
  y: number;
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

/** Center point of a rect. */
export function centerOf(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

/**
 * The point on `node`'s border along the ray from its center toward `target`'s
 * center. This is the first border the ray crosses, so the anchor lands on
 * whichever edge (and wherever along it) actually faces the other node.
 */
export function borderIntersection(node: Rect, target: Rect): { x: number; y: number } {
  const nc = centerOf(node);
  const tc = centerOf(target);
  const dx = tc.x - nc.x;
  const dy = tc.y - nc.y;
  if (dx === 0 && dy === 0) return nc; // fully overlapping centers — degenerate
  const hw = node.width / 2;
  const hh = node.height / 2;
  // t at which the ray hits each pair of borders; the smaller is hit first.
  const tX = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const tY = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tX, tY);
  return { x: nc.x + dx * t, y: nc.y + dy * t };
}

/** Which border a point sits on (used to pick the smoothstep exit direction). */
export function sideOf(point: { x: number; y: number }, node: Rect): Side {
  const left = node.x;
  const right = node.x + node.width;
  const top = node.y;
  const bottom = node.y + node.height;
  // pick the border the point is closest to (ties resolve horizontal-first)
  const dl = Math.abs(point.x - left);
  const dr = Math.abs(point.x - right);
  const dt = Math.abs(point.y - top);
  const db = Math.abs(point.y - bottom);
  const min = Math.min(dl, dr, dt, db);
  if (min === dl) return "left";
  if (min === dr) return "right";
  if (min === dt) return "top";
  return "bottom";
}

export interface FloatingGeometry {
  sx: number;
  sy: number;
  sourceSide: Side;
  tx: number;
  ty: number;
  targetSide: Side;
}

/** Both endpoints + their border sides for a floating source→target edge. */
export function floatingGeometry(source: Rect, target: Rect): FloatingGeometry {
  const sp = borderIntersection(source, target);
  const tp = borderIntersection(target, source);
  return {
    sx: sp.x,
    sy: sp.y,
    sourceSide: sideOf(sp, source),
    tx: tp.x,
    ty: tp.y,
    targetSide: sideOf(tp, target),
  };
}

/** A card dot (t/b/l/r or none) — anything else (ln:/mn:/anc:) is semantic. */
export function isPlainHandle(h: string | null | undefined): boolean {
  return h == null || h === "t" || h === "b" || h === "l" || h === "r";
}
