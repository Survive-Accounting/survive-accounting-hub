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
}: {
  /** The element the popover hangs under (a chip, a gear button…). */
  anchor: HTMLElement;
  onClose: () => void;
  children: React.ReactNode;
  /** Horizontal alignment against the anchor. */
  align?: "left" | "right";
  offsetY?: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Position under the anchor, clamped into the viewport once we know our size.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const box = boxRef.current?.getBoundingClientRect();
      const w = box?.width ?? 260;
      const h = box?.height ?? 200;
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
  }, [anchor, align, offsetY]);

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
