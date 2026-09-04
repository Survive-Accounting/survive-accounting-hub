// THE PERFORMANCE ARROWS on the capture surface (/v3/$topic/$set/blast-off/film) —
// the canvas's F1 tool, drawn by the SAME layer (canvas/PerfArrowLayer.tsx, extracted
// 2026-09-04 for exactly this), so an arrow on a short is the arrow on the canvas:
// same head, same stroke, same gold.
//
// THE KEYS
//   F1          drop one end of an arrow where the pointer is; moving the pointer
//               draws it live; F1 again sets it (no movement = no arrow, as on the canvas)
//   Delete /    take the most recent arrow back — a half-drawn one first
//   Backspace
//   Esc         cancel a half-drawn arrow. Claimed ONLY then — in the capture phase on
//               the window and stopped there — so with nothing pending Esc stays the
//               capture's exit key (BlastOffCapture: Esc → onExit)
//   `           clear every arrow. Left to bubble: the capture's ` is the full wipe
//               and this is one part of it
// Arrows belong to the slide: walking to another (frameId) clears them. Keys aimed at
// a field (input / textarea / contentEditable) are ignored.
//
// THE POINTER is tracked with a pointermove listener on the window, not with hover:
// BrandCursor hides the native cursor, and this layer is pointer-inert (it sits over
// the slide and must never eat a practice click), so F1 — a key — needs the last place
// the pointer was seen. Positions are FRACTIONS of the host, as on the canvas, so a
// window resize re-draws every arrow in place.
//
// Module-scope callables are `function` declarations (the render-path TDZ rule,
// canvas/tdz-graph.test.ts).
import { useEffect, useRef, useState, type RefObject } from "react";

import { PERF_ARROW_CLICK_EPS, PerfArrowSvg, type PerfArrow, type PerfArrowEnds } from "@/components/canvas/PerfArrowLayer";

/** A key aimed at a field is never an arrow key. */
function typingIn(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || !!el.isContentEditable);
}

export function CaptureArrows({ hostRef, frameId }: {
  /** The capture root — arrows are drawn in its coordinate space. */
  hostRef: RefObject<HTMLDivElement | null>;
  /** Arrows belong to a slide; walking to another clears them. */
  frameId: string;
}) {
  const [arrows, setArrows] = useState<PerfArrow[]>([]);
  /** The arrow being drawn: the anchored end + wherever the pointer is now. */
  const [draw, setDraw] = useState<PerfArrowEnds | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** The anchored end of a half-drawn arrow (host fractions); null = nothing pending. */
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  /** Last place the pointer was seen (host fractions), so F1 knows where to anchor. */
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const seq = useRef(0);

  // Arrows belong to the slide.
  useEffect(() => { pendingRef.current = null; setDraw(null); setArrows([]); }, [frameId]);

  // The host's size, so fractions become pixels — and a resize re-draws every arrow in place.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => { const r = host.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    measure();
    return () => ro.disconnect();
  }, [hostRef]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) { console.error("[capture arrows] no host element — the F1 arrows are off"); return; }
    // The host's own window: `window` here, and still right if the page is ever
    // portalled into a pop-out document.
    const win = host.ownerDocument.defaultView ?? window;
    const frac = (cx: number, cy: number) => { const r = host.getBoundingClientRect(); return { x: (cx - r.left) / (r.width || 1), y: (cy - r.top) / (r.height || 1) }; };
    const cancel = () => { pendingRef.current = null; setDraw(null); };
    const onMove = (e: PointerEvent) => {
      const c = frac(e.clientX, e.clientY);
      cursorRef.current = c;
      const p = pendingRef.current;
      if (p) setDraw({ x1: p.x, y1: p.y, x2: c.x, y2: c.y });
    };
    const onKey = (e: KeyboardEvent) => {
      if (typingIn(e.target)) return;
      if (e.key === "Escape") {
        if (!pendingRef.current) return;      // nothing half-drawn: Esc is the capture's exit key
        e.preventDefault(); e.stopImmediatePropagation(); cancel(); return;
      }
      if (e.code === "Backquote" || e.key === "`") { cancel(); setArrows([]); return; } // the capture's own wipe runs after this
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (pendingRef.current) cancel(); else setArrows((p) => p.slice(0, -1));
        return;
      }
      if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();                       // F1 is the browser's help key
      const c = cursorRef.current;
      if (!c) return;                           // no pointer seen yet — nothing to anchor to
      const p = pendingRef.current;
      if (!p) { pendingRef.current = c; setDraw({ x1: c.x, y1: c.y, x2: c.x, y2: c.y }); return; }
      if (Math.hypot(c.x - p.x, c.y - p.y) > PERF_ARROW_CLICK_EPS) {
        const id = `ca${seq.current++}`;
        setArrows((prev) => [...prev, { id, x1: p.x, y1: p.y, x2: c.x, y2: c.y }]);
      }
      cancel();
    };
    win.addEventListener("keydown", onKey, true); // capture phase — ahead of the capture's own (bubble) window listener
    win.addEventListener("pointermove", onMove);
    win.addEventListener("blur", cancel);
    return () => { win.removeEventListener("keydown", onKey, true); win.removeEventListener("pointermove", onMove); win.removeEventListener("blur", cancel); };
  }, [hostRef]);

  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none" }}>
      <PerfArrowSvg arrows={arrows} draw={draw} sel={null} w={size.w} h={size.h} hit={false} />
    </div>
  );
}
