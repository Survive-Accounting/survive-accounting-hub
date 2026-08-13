// CardPopover — the ONE way card popovers render (COA picker, settings gear,
// memo editor, anything future). Portals to document.body so it floats ABOVE
// the card on the whiteboard: it can never be clipped by the card's
// overflow-hidden shell and never inherits React Flow's pan/zoom transform
// (the anchor's getBoundingClientRect is already in screen coords, so zoom is
// baked in at open time). Closes on Esc, outside pointerdown, or wheel outside
// (a scroll-zoom would strand it mid-air — closing beats drifting).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function CardPopover({
  anchor,
  onClose,
  children,
  align = "left",
  offsetY = 4,
  side = "below",
}: {
  /** The element the popover hangs under (a chip, a gear button…). */
  anchor: HTMLElement;
  onClose: () => void;
  children: React.ReactNode;
  /** Horizontal alignment against the anchor (only used when side="below"). */
  align?: "left" | "right";
  offsetY?: number;
  /** Placement relative to the anchor's JE cluster. "below" (default) hangs
   *  under the anchor; "left" floats to the LEFT of the whole cluster so it
   *  never covers the entry being built (JE account + scenario pickers). Both
   *  are edge-aware: "left" flips to the cluster's right near the left edge,
   *  "below" flips above near the bottom. */
  side?: "below" | "left";
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position relative to the anchor, clamped into the viewport once we know
  // our size. side="left" anchors off the JE cluster's LEFT edge, not the
  // little button, so the popover clears the whole entry.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      const w = box?.width ?? 260;
      const h = box?.height ?? 200;
      const GAP = 8;
      if (side === "left") {
        // reference the enclosing node cluster so we clear the whole entry
        const cluster = (anchor.closest(".react-flow__node") as HTMLElement | null) ?? anchor;
        const c = cluster.getBoundingClientRect();
        let left = c.left - w - GAP; // to the LEFT of the cluster
        if (left < 8) left = c.right + GAP; // edge-aware: flip to the cluster's right
        left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
        const top = Math.max(8, Math.min(a.top, window.innerHeight - h - 8)); // align with the clicked row
        setPos({ left, top });
        return;
      }
      let left = align === "left" ? a.left : a.right - w;
      let top = a.bottom + offsetY;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      if (top + h > window.innerHeight - 8) top = Math.max(8, a.top - h - offsetY); // flip above
      setPos({ left, top });
    };
    place();
    // re-place once after first paint so clamping uses the real size
    const t = setTimeout(place, 0);
    return () => clearTimeout(t);
  }, [anchor, align, offsetY, side]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onWheel = (e: WheelEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("wheel", onWheel, { capture: true } as never);
    };
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={boxRef}
      className="nodrag nowheel fixed z-[120]"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
      // keep canvas hotkeys/gestures out of the popover
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key !== "Escape") e.stopPropagation(); }}
    >
      {children}
    </div>,
    document.body,
  );
}
