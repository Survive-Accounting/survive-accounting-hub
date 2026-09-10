// DRAGGING ON THE SPINE (2026-09-09, Lee's notes: group drag, bundled ghost, zoom-out while
// dragging, auto-scroll). Reordering a sixty-row running order meant the scroll-up zone at the
// top was a millimetre — because the spine is not its own scroller, the page is, and the only
// auto-scroll was the browser's native edge band with the step bar sitting on top of it. And a
// multi-pick drags as one bundle with one badge, not five browser snapshots.
//
// The math is here, pure and tested; ReviewDeck owns the listeners. Module-scope callables are
// `function` declarations (the TDZ ratchet, canvas/tdz-graph.test.ts).

/** DEFAULTS: the band is the strip inside each edge where scrolling starts; max is the fastest
 *  scroll, per frame, at the edge itself. */
export const SCROLL_BAND_PX = 140;
export const SCROLL_MAX_PX = 28;

/** How far to scroll THIS FRAME for a pointer at `y` over a scroller spanning `top..bottom`:
 *  0 in the middle, ramping linearly to -max at the top edge and +max at the bottom, and
 *  clamped to ±max when the pointer has left the scroller altogether (a drag that overshoots
 *  the window keeps scrolling at full speed rather than stopping dead). */
export function autoScrollDelta(y: number, top: number, bottom: number, band = SCROLL_BAND_PX, max = SCROLL_MAX_PX): number {
  if (bottom <= top || band <= 0 || max <= 0) return 0;
  const inset = Math.min(band, (bottom - top) / 2);
  if (y <= top) return -max;
  if (y >= bottom) return max;
  const fromTop = y - top;
  if (fromTop < inset) return -max * (1 - fromTop / inset);
  const fromBottom = bottom - y;
  if (fromBottom < inset) return max * (1 - fromBottom / inset);
  return 0;
}

/** How long a drag has to run before the spine zooms out (rows shrink so the whole running
 *  order fits the viewport and the target is findable). Short enough that a real reorder gets
 *  it; long enough that a click-that-wobbled never does. */
export const DRAG_ZOOM_AFTER_MS = 350;

/** The badge on a bundle ghost. */
export function bundleBadge(count: number): string {
  return `${count} slide${count === 1 ? "" : "s"}`;
}

/** THE BUNDLE GHOST — what rides under the pointer when a multi-pick is dragged: three stacked
 *  cream cards offset 3 px, a gold badge with the count, the first slide's words as the label.
 *  Built offscreen (setDragImage needs a rendered node) and handed back so the caller can
 *  remove it on dragend. Colours are the deck's own (cream / gold / navy panel). */
export function buildBundleGhost(doc: Document, count: number, label: string): HTMLElement {
  const root = doc.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = "position:fixed;top:-200px;left:-200px;width:150px;height:44px;pointer-events:none;z-index:-1;font-family:system-ui,sans-serif";
  const stacks = Math.min(3, Math.max(1, count));
  for (let k = stacks - 1; k >= 0; k--) {
    const card = doc.createElement("div");
    card.style.cssText = `position:absolute;left:${k * 3}px;top:${k * 3}px;width:120px;height:28px;background:#F4EFE6;border:1px solid rgba(9,13,26,0.35);border-radius:5px;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;padding:0 8px;box-sizing:border-box;overflow:hidden;color:#101828;font-size:11px;font-weight:700;white-space:nowrap;text-overflow:ellipsis`;
    if (k === 0) card.textContent = label;
    root.appendChild(card);
  }
  const badge = doc.createElement("span");
  badge.textContent = bundleBadge(count);
  badge.style.cssText = "position:absolute;left:112px;top:-6px;background:#FCA311;color:#101828;border-radius:9px;padding:2px 7px;font-size:10px;font-weight:800;letter-spacing:0.04em;white-space:nowrap";
  root.appendChild(badge);
  doc.body.appendChild(root);
  return root;
}
