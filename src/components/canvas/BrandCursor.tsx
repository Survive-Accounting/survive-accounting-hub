// BRAND CURSOR (08-19) — a filmable, on-brand pointer for the study canvas and
// the capture window. It replaces the OS cursor with the real split-bolt (the
// same BOLT_OUTER/BOLT_RIGHT paths as the wordmark and the flyer), angled like a
// pointer, and "boils" energy rings on click (hold = keeps boiling).
//
// WHY A DOM ELEMENT, NOT `cursor: url(...)`: a CSS image cursor is drawn by the
// OS, not the page — OBS window-capture does NOT reliably record it, and it
// can't animate. This is a real element the page renders, so OBS captures it and
// the click ripples animate. The native cursor is hidden (`cursor: none`) on the
// host; disable "Capture Cursor" on the OBS source so the OS arrow doesn't
// double up.
//
// COLORS: default Ole Miss red + powder blue with a WHITE keyline (the keyline is
// what keeps the bolt legible on BOTH the navy stage and a white CEQ card).
// c1/c2 are props so a campus video can pass that school's colorway later.
import { useEffect, useRef, useState } from "react";

import { BOLT_OUTER, BOLT_RATIO, BOLT_RIGHT, BOLT_VIEWBOX } from "./brand";

/** Height of the bolt cursor, px. Bigger than a real cursor so it reads on
 *  camera. */
const H = 56;
const W = H * BOLT_RATIO;
/** FLIP the bolt so its sharp tip points TOP-LEFT like a normal cursor (the raw
 *  bolt's tip is upper-right). Mirror horizontally; the hotspot mirrors with it. */
const FLIP = true;
/** The bolt's sharp tip in box-fraction (BOLT_OUTER's first point through the
 *  viewBox). After the flip the hotspot x mirrors to (1 − TIP_FX). */
const TIP_FX = 0.862;
const TIP_FY = 0.042;
const HX = FLIP ? 1 - TIP_FX : TIP_FX; // hotspot x-fraction under the mouse
const HY = TIP_FY;
/** Extra lean (deg) on top of the flip. 0 = the flipped bolt's natural NW point. */
const LEAN = 0;
/** Hold-to-boil cadence, ms. */
const BOIL_EVERY = 240;

const CURSOR_CSS = `
@keyframes sa-cursor-boil { from { transform: translate(-50%,-50%) scale(0.18); opacity: 0.5; } to { transform: translate(-50%,-50%) scale(1); opacity: 0; } }
.sa-cursor-ring { position: absolute; border-radius: 9999px; will-change: transform, opacity; }
/* Hide the native cursor on the host AND every child (ReactFlow panes/nodes set
   their own cursor, so the host alone isn't enough — that's the "two cursors"). */
[data-sa-brand-cursor], [data-sa-brand-cursor] * { cursor: none !important; }
`;

interface Ring { id: number; x: number; y: number; c: string; d: number; s: number }

export function BrandCursor({ hostRef, c1 = "#CE1126", c2 = "#7FB2E8", keyline = "#FFFFFF", enabled = true }: {
  /** The element to track + cover. Its own cursor is hidden while enabled. */
  hostRef: React.RefObject<HTMLElement | null>;
  c1?: string;
  c2?: string;
  keyline?: string;
  enabled?: boolean;
}) {
  const boltRef = useRef<HTMLDivElement | null>(null);
  const ptRef = useRef<{ x: number; y: number } | null>(null);
  const [inside, setInside] = useState(false);
  const [down, setDown] = useState(false);
  const [rings, setRings] = useState<Ring[]>([]);
  const idRef = useRef(0);
  const holdRef = useRef<number | undefined>(undefined);

  // Hide the native cursor on the host AND all children (the CSS rule keys off
  // this attribute). Removing it fully restores the native cursor when toggled off.
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;
    host.setAttribute("data-sa-brand-cursor", "");
    return () => host.removeAttribute("data-sa-brand-cursor");
  }, [hostRef, enabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled) return;
    const local = (e: PointerEvent) => { const r = host.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    // TWO rings per boil (staggered) → the concentric "boiling" look.
    const boil = (p: { x: number; y: number }) => setRings((rs) => {
      const base = idRef.current;
      idRef.current += 2;
      const next = rs.length > 24 ? rs.slice(-16) : rs; // never let held-boil pile unbounded
      return [...next,
        { id: base, x: p.x, y: p.y, c: c2, d: 620, s: 92 },
        { id: base + 1, x: p.x, y: p.y, c: keyline, d: 760, s: 122 },
      ];
    });

    let raf = 0;
    const tick = () => {
      const b = boltRef.current, p = ptRef.current;
      if (b && p) b.style.transform = `translate(${p.x - HX * W}px, ${p.y - HY * H}px) rotate(${LEAN}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: PointerEvent) => { ptRef.current = local(e); setInside(true); }; // setInside(true) is a no-op once true
    const onDown = (e: PointerEvent) => { const p = local(e); ptRef.current = p; setDown(true); boil(p); if (holdRef.current == null) holdRef.current = window.setInterval(() => { if (ptRef.current) boil(ptRef.current); }, BOIL_EVERY); };
    const stop = () => { setDown(false); if (holdRef.current != null) { window.clearInterval(holdRef.current); holdRef.current = undefined; } };
    const onLeave = () => { setInside(false); stop(); };
    const doc = host.ownerDocument;
    host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerdown", onDown);
    doc.addEventListener("pointerup", stop);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerdown", onDown);
      doc.removeEventListener("pointerup", stop);
      host.removeEventListener("pointerleave", onLeave);
      if (holdRef.current != null) window.clearInterval(holdRef.current);
    };
  }, [hostRef, enabled, c2, keyline]);

  if (!enabled) return null;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 2147483000 }} aria-hidden>
      <style>{CURSOR_CSS}</style>
      {rings.map((r) => (
        <span key={r.id} className="sa-cursor-ring" onAnimationEnd={() => setRings((rs) => rs.filter((x) => x.id !== r.id))}
          style={{ left: r.x, top: r.y, width: r.s, height: r.s, border: `2px solid ${r.c}`, boxShadow: `0 0 10px ${r.c}`, animation: `sa-cursor-boil ${r.d}ms cubic-bezier(0.22,0.8,0.3,1) forwards` }} />
      ))}
      <div ref={boltRef} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transformOrigin: `${HX * W}px ${HY * H}px`, opacity: inside ? 1 : 0, transition: "opacity 120ms", filter: `drop-shadow(0 2px 5px rgba(0,0,0,0.55)) drop-shadow(0 0 ${down ? 14 : 8}px rgba(255,214,140,${down ? 0.6 : 0.4}))` }}>
        <svg viewBox={BOLT_VIEWBOX} width={W} height={H} style={{ display: "block", transform: `${FLIP ? "scaleX(-1) " : ""}scale(${down ? 0.94 : 1})`, transformOrigin: "50% 50%", transition: "transform 90ms ease-out" }}>
          <path d={BOLT_OUTER} fill={c1} stroke={keyline} strokeWidth={7} strokeLinejoin="round" strokeLinecap="round" paintOrder="stroke" />
          <path d={BOLT_RIGHT} fill={c2} />
        </svg>
      </div>
    </div>
  );
}
