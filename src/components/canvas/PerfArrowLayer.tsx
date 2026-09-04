// PERFORMANCE ARROWS (Lee) — a freehand pointer layer OVER the pane, for live use on
// camera (never authored/persisted to the scene). F1 drops one end at the cursor, the
// preview follows the mouse, F1 again sets the arrow. A set arrow is click-to-select +
// Delete, and ` clears them all. Coords are stored as FRACTIONS of the pane, so the same
// arrow renders in both the inline + film panes. It's a plain SVG driven by explicit
// state — clearing the state leaves ZERO remnants (no lingering React Flow nodes). The
// layer only intercepts pointers while an anchor is pending; otherwise it's click-through.
//
// EXTRACTED from CeqPreviewer.tsx (2026-09-04) so the capture surface
// (blastoff/capture/arrows.tsx) draws the SAME arrow — same head, same stroke, same
// gold — from its own key handling. Three pieces:
//   perfArrowGeom    the shaft + head paths for a pane of w×h px (pure)
//   PerfArrowSvg     the SVG: every set arrow plus the one being drawn (no state, no listeners)
//   PerfArrowLayer   the canvas's interactive layer — F1 tap-tap, click-to-select, the
//                    cursor tracked on the document — behaviour unchanged by the move.
// Module-scope callables are `function` declarations: this module is on the render path
// (tdz-graph.test.ts).
import { useEffect, useRef, useState } from "react";

export type PerfArrow = { id: string; x1: number; y1: number; x2: number; y2: number };
/** An arrow's two ends, as FRACTIONS of the pane (0..1 each way). */
export type PerfArrowEnds = Omit<PerfArrow, "id">;

/** Brand gold — the one colour the arrows come in. */
export const PERF_ARROW_COLOUR = "#FCA311";
/** Under this movement (a fraction of the pane) two taps count as the same point, and
 *  no arrow is set. */
export const PERF_ARROW_CLICK_EPS = 0.012;

/** The shaft + head paths for an arrow on a pane of w×h px, plus its midpoint. */
export function perfArrowGeom(a: PerfArrowEnds, w: number, h: number): { line: string; head: string; mx: number; my: number } {
  const x1 = a.x1 * w, y1 = a.y1 * h, x2 = a.x2 * w, y2 = a.y2 * h;
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
  const HEAD = 30, HALF = 15, bx = x2 - ux * HEAD, by = y2 - uy * HEAD, px = -uy, py = ux;
  return { line: `M ${x1} ${y1} L ${bx} ${by}`, head: `M ${x2} ${y2} L ${bx + px * HALF} ${by + py * HALF} L ${bx - px * HALF} ${by - py * HALF} Z`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
}

/** THE SVG — every set arrow, the selected one lit, plus the one being drawn. Holds no
 *  state and binds no listeners; the caller owns both. `hit` says whether a set arrow
 *  catches the pointer (click to select): the canvas turns it off while an anchor is
 *  pending, the capture surface never turns it on. */
export function PerfArrowSvg({ arrows, draw, sel, w, h, hit, onSelect }: { arrows: PerfArrow[]; draw: PerfArrowEnds | null; sel: string | null; w: number; h: number; hit: boolean; onSelect?: (id: string | null) => void }) {
  const COL = PERF_ARROW_COLOUR;
  return (
    <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      {arrows.map((a) => { const g = perfArrowGeom(a, w, h); const on = sel === a.id; return (
        <g key={a.id}>
          <path d={g.line} stroke={COL} strokeWidth={on ? 10 : 8} strokeLinecap="round" fill="none" style={{ pointerEvents: hit ? "stroke" : "none", cursor: "pointer", filter: on ? "drop-shadow(0 0 6px rgba(252,163,17,0.8))" : undefined }} onPointerDown={(ev) => { if (!hit) return; ev.stopPropagation(); onSelect?.(on ? null : a.id); }} />
          <path d={g.head} fill={COL} stroke={COL} strokeWidth={2} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
          {on && <circle cx={g.mx} cy={g.my} r={5} fill="#fff" stroke={COL} strokeWidth={2} style={{ pointerEvents: "none" }} />}
        </g>
      ); })}
      {draw && (() => { const g = perfArrowGeom(draw, w, h); return (<g><path d={g.line} stroke={COL} strokeWidth={8} strokeLinecap="round" fill="none" opacity={0.92} /><path d={g.head} fill={COL} /></g>); })()}
    </svg>
  );
}

/** THE CANVAS LAYER — the interactive F1 tool over the previewer's film pane. */
export function PerfArrowLayer({ arrows, add, sel, setSel }: { arrows: PerfArrow[]; add: (a: Omit<PerfArrow, "id">) => void; sel: string | null; setSel: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [armed, setArmed] = useState(false);
  const [draw, setDraw] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // F1 TAP-TAP (Lee, 2026-09-01) — this tool used to be armed by ALT, which made
  // Alt unusable for anything else and meant a stray alt-drag drew a line across
  // a take. Alt now belongs to picking cards up; the arrow tool moved to F1.
  //
  // F1 drops one end at the cursor, the preview follows the mouse, F1 again sets
  // the arrow. Esc or ` cancels a pending anchor. The layer is pointer-inert
  // unless an anchor is pending, so it can never intercept a card gesture.
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  /** Last known cursor position, so F1 (a KEY) knows where to put the end. */
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const cancel = () => { setArmed(false); pendingRef.current = null; setDraw(null); };
    const kd = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "`" || e.code === "Backquote") { if (pendingRef.current) cancel(); return; }
      if (e.key !== "F1" || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();                       // F1 is the browser's help key
      const c = cursorRef.current;
      if (!c) return;                           // no cursor seen yet — nothing to anchor to
      const pending = pendingRef.current;
      if (!pending) { pendingRef.current = c; setArmed(true); setDraw({ x1: c.x, y1: c.y, x2: c.x, y2: c.y }); return; }
      if (Math.hypot(c.x - pending.x, c.y - pending.y) > CLICK_EPS) add({ x1: pending.x, y1: pending.y, x2: c.x, y2: c.y });
      cancel();
    };
    // The cursor is tracked on the DOCUMENT, not the layer: while the layer is
    // pointer-inert (the normal state) it receives no pointer events at all.
    const pm = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (r) cursorRef.current = { x: (e.clientX - r.left) / (r.width || 1), y: (e.clientY - r.top) / (r.height || 1) };
      const pending = pendingRef.current;
      if (pending && cursorRef.current) setDraw({ x1: pending.x, y1: pending.y, x2: cursorRef.current.x, y2: cursorRef.current.y });
    };
    doc.addEventListener("keydown", kd); doc.addEventListener("pointermove", pm); win.addEventListener("blur", cancel);
    return () => { doc.removeEventListener("keydown", kd); doc.removeEventListener("pointermove", pm); win.removeEventListener("blur", cancel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const frac = (cx: number, cy: number) => { const r = ref.current?.getBoundingClientRect(); return r ? { x: (cx - r.left) / (r.width || 1), y: (cy - r.top) / (r.height || 1) } : { x: 0, y: 0 }; };
  // Every set arrow persists; select+Delete removes one, ` clears them all.
  const CLICK_EPS = PERF_ARROW_CLICK_EPS; // under this movement two taps count as the same point
  // A CLICK while an anchor is pending sets the arrow — the mouse can finish what
  // F1 started. With nothing pending the layer is inert and this never fires.
  const onDown = (e: React.PointerEvent) => {
    const pending = pendingRef.current;
    if (!pending) return;
    e.preventDefault(); e.stopPropagation();
    const p = frac(e.clientX, e.clientY);
    if (Math.hypot(p.x - pending.x, p.y - pending.y) > CLICK_EPS) add({ x1: pending.x, y1: pending.y, x2: p.x, y2: p.y });
    pendingRef.current = null; setArmed(false); setDraw(null);
  };
  return (
    <div ref={ref} onPointerDown={onDown} style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: armed ? "auto" : "none", cursor: armed ? "crosshair" : "default" }}>
      <PerfArrowSvg arrows={arrows} draw={draw} sel={sel} w={size.w} h={size.h} hit={!armed} onSelect={setSel} />
    </div>
  );
}
