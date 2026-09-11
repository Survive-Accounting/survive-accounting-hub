// WHERE THE BOLT'S INK ACTUALLY IS — so a bolt can be centred on itself rather than on its
// viewBox, and the avatar can prove it never touches its circle.
//
// brand.tsx's viewBox carries keyline padding and is not centred on the mark (the tip leans up
// and right), so centring the viewBox puts the ink off-centre. These numbers are read off the real
// paths when the module loads — never typed — so a redraw of the bolt moves them with it.
import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX, boltSvgMarkup } from "@/components/canvas/brand";

export function pathPoints(d: string): [number, number][] {
  return d.replace(/\s*Z\s*$/i, "").split(/\s*[ML]\s*/).filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return [x, y] as [number, number];
    });
}

const VB = BOLT_VIEWBOX.trim().split(/\s+/).map(Number);
export const BOLT_VB = { x: VB[0], y: VB[1], w: VB[2], h: VB[3] } as const;

/** The white keyline's stroke width in path units, read out of the markup brand.tsx emits (its
 *  OUTLINE constant is private) so the two can never disagree. Half of it shows outside the fill. */
export const BOLT_KEYLINE = Number(/stroke-width="([\d.]+)"/.exec(boltSvgMarkup({ c1: "#000000", c2: "#111111" }))?.[1] ?? NaN);

const INK_POINTS: [number, number][] = [...pathPoints(BOLT_OUTER), ...pathPoints(BOLT_RIGHT)];

function inkBox(pts: [number, number][]) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** The box around the bolt's fill (both regions, no keyline), in path units. */
export const BOLT_INK = inkBox(INK_POINTS);

/** The rect a nested `<svg viewBox={BOLT_VIEWBOX}>` must occupy so the bolt's INK is `inkH` tall and
 *  centred on (cx, cy). */
export function boltRectCentered(cx: number, cy: number, inkH: number): { x: number; y: number; w: number; h: number } {
  const s = inkH / BOLT_INK.h;
  return { x: cx - (BOLT_INK.cx - BOLT_VB.x) * s, y: cy - (BOLT_INK.cy - BOLT_VB.y) * s, w: BOLT_VB.w * s, h: BOLT_VB.h * s };
}

/** How far the bolt reaches from its ink centre, keyline included, when its ink is `inkH` tall: the
 *  radius of the smallest circle about that centre that holds every pixel of it. */
export function boltReach(inkH: number): number {
  const s = inkH / BOLT_INK.h;
  let far = 0;
  for (const [x, y] of INK_POINTS) far = Math.max(far, Math.hypot(x - BOLT_INK.cx, y - BOLT_INK.cy));
  return (far + BOLT_KEYLINE / 2) * s;
}
