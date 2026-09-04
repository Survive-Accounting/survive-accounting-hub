// THE PERFORMANCE ARROWS on the capture surface — F1, move, F1 draws one;
// Delete removes the last. SLOT (2026-09-04): the layer is being extracted from
// the canvas previewer (PerfArrowLayer in CeqPreviewer.tsx) so both surfaces
// draw the same arrow. Until that lands this renders nothing.
import type { RefObject } from "react";

export function CaptureArrows(_props: {
  /** The capture root — arrows are drawn in its coordinate space. */
  hostRef: RefObject<HTMLDivElement | null>;
  /** Arrows belong to a slide; walking to another clears them. */
  frameId: string;
}) {
  return null;
}
