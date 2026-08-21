// ANIMATED CAMPUS BOLT — GEOMETRY.
//
// THE SHAPE IS NOT REDESIGNED HERE AND MUST NEVER BE. BOLT_OUTER (the silhouette) and BOLT_RIGHT
// (the right interior region — its shared edge with the silhouette IS the internal zig-zag
// divider) come straight from brand.tsx, which is Lee's hand-traced Logo Lab export and the one
// source of truth for the mark everywhere on the site. This module re-exports them under bolt-lab
// names and adds ONLY the arithmetic the conveyor needs on top: where a campus panel sits, and
// which way its ribbons lean.
//
// ONE `d` DOES THREE JOBS — the interior clip, the visible white outline, and the glow are all
// BOLT_OUTER. They therefore cannot disagree by a pixel, which is what guarantees "no navy gap
// between fill and outline": the fill is clipped to the silhouette and the outline is a stroke
// CENTRED on that same silhouette, so half the stroke always lies on top of the fill.
import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX } from "@/components/canvas/brand";

export { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX };

/** The viewBox as numbers. Kept literal (rather than parsed at import time) so a typo in either
 *  place is caught by the geometry test rather than by a broken hero. */
export const VB = { x: -18.21, y: -2.26, w: 109.27, h: 146.96 } as const;
export const BOLT_ASPECT = VB.w / VB.h;

/** Horizontal overscan for the flowing panels. They must extend well past the silhouette on both
 *  sides so a leaning edge can never expose a corner inside the clip. */
const OVERSCAN = 46;
export const PANEL_X0 = VB.x - OVERSCAN;
export const PANEL_X1 = VB.x + VB.w + OVERSCAN;
/** The x the lean pivots around — the middle of the bolt, so a tilt does not shift the panel. */
export const PANEL_CX = VB.x + VB.w / 2;

/** How many campus panels exist on the tape at once.
 *    slot 0 — the campus currently owning (and leaving through) the bolt
 *    slot 1 — the campus arriving from below
 *    slot 2 — pre-warmed, so the frame on which React swaps the queue is already covered
 *  Three is the minimum that makes the hand-off frame provably gap-free. */
export const PANEL_SLOTS = 3;

/** Panel height in user units, from the span (in bolt-heights) chosen in bolt-config. */
export const panelHeight = (panelSpan: number) => VB.h * panelSpan;

/** The local y of slot `i`'s TOP edge (at the pivot x). Slot 0 is placed so that at offset 0 it
 *  covers the whole visible bolt with its own bottom portion — i.e. the bolt is full of ONE
 *  campus at the start of every cycle. */
export const slotTop = (i: number, panelSpan: number) =>
  VB.y - VB.h * (panelSpan - 1) + i * panelHeight(panelSpan);

/** tan of the lean. Positive RIBBON_ANGLE tilts the flow so its edge rises to the LEFT. */
export const leanOf = (angleDeg: number) => Math.tan((angleDeg * Math.PI) / 180);

/** One campus panel as a PARALLELOGRAM: a horizontal band sheared by the lean. Adjacent slots
 *  share an edge exactly (slot i's bottom edge is slot i+1's top edge, vertex for vertex), so the
 *  tape tiles with no seam and no overlap however far it is translated. */
export function panelPoints(i: number, panelSpan: number, angleDeg: number): string {
  const k = leanOf(angleDeg);
  const top = slotTop(i, panelSpan);
  const h = panelHeight(panelSpan);
  const yAt = (x: number, base: number) => base + (x - PANEL_CX) * k;
  return [
    [PANEL_X0, yAt(PANEL_X0, top)],
    [PANEL_X1, yAt(PANEL_X1, top)],
    [PANEL_X1, yAt(PANEL_X1, top + h)],
    [PANEL_X0, yAt(PANEL_X0, top + h)],
  ]
    .map(([x, y]) => `${round(x)},${round(y)}`)
    .join(" ");
}

/** The gradient axis for slot `i`: the segment PERPENDICULAR to the panel's leaning edges, running
 *  from its top edge to its bottom edge through the centre. Gradient offset 0 therefore lands
 *  exactly on the top edge and offset 1 exactly on the bottom edge, whatever the lean — which is
 *  what lets the tone wave meet the next panel cleanly. */
export function panelGradientAxis(i: number, panelSpan: number, angleDeg: number) {
  const k = leanOf(angleDeg);
  const h = panelHeight(panelSpan);
  const yc = slotTop(i, panelSpan) + h / 2;
  const d = h / (1 + k * k); // so the segment's length is exactly the panel's perpendicular depth
  return {
    x1: round(PANEL_CX + (k * d) / 2),
    y1: round(yc - d / 2),
    x2: round(PANEL_CX - (k * d) / 2),
    y2: round(yc + d / 2),
  };
}

/** The tone wave one panel's gradient runs through: base → light → base → deep → (base). Broad and
 *  SMOOTH — this is a sheen travelling through the colour, not a stack of stripes. Both ends are
 *  the exact school hex so consecutive panels butt together without a visible tone step. */
export function ribbonStops(count: number): Array<{ offset: number; tone: 0 | 1 | -1 }> {
  const wave: Array<0 | 1 | -1> = [0, 1, 0, -1];
  const n = Math.max(1, Math.round(count));
  const out: Array<{ offset: number; tone: 0 | 1 | -1 }> = [];
  for (let j = 0; j < n; j++) out.push({ offset: j / n, tone: wave[j % wave.length] });
  out.push({ offset: 1, tone: 0 });
  return out;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}
