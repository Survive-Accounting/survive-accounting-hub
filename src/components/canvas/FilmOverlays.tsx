// Film-mode overlays: cursor spotlight (soft radial glow that follows the pointer) and
// click ripple (expanding ring on every pointer-down). Sized and contrasted to survive
// 1080p YouTube compression on the dark background. Mounted only while film mode is on.
import { useEffect, useRef, useState } from "react";
import { NEON } from "./theme";

export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const el = ref.current;
        if (el) el.style.transform = `translate(${e.clientX - 90}px, ${e.clientY - 90}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[70] h-[180px] w-[180px]"
      style={{
        background: `radial-gradient(circle, rgba(252,163,17,0.26) 0%, rgba(252,163,17,0.09) 45%, transparent 70%)`,
        mixBlendMode: "screen",
        transform: "translate(-200px, -200px)", // offscreen until first move
      }}
    />
  );
}

export function ClickRipples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    let seq = 0;
    const onDown = (e: PointerEvent) => {
      const id = ++seq;
      setRipples((rs) => [...rs, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setRipples((rs) => rs.filter((r) => r.id !== id)), 650);
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as never);
  }, []);

  return (
    <>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none fixed z-[71] rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            border: `2.5px solid ${NEON.yellow}`,
            boxShadow: `0 0 12px ${NEON.yellow}`,
            animation: "canvas-ripple 0.6s ease-out forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes canvas-ripple {
          0%   { transform: scale(1);   opacity: 0.95; }
          100% { transform: scale(7.5); opacity: 0;    }
        }
      `}</style>
    </>
  );
}

/** CARD TAP PULSE (#10) — a small, subtle silver ring on pointer-down anywhere
 *  ON A CARD (not the empty pane), always on. Reads as tactile "you grabbed
 *  this" feedback, quieter than the film-mode amber ripple. Ignores clicks in
 *  text fields so typing doesn't strobe. */
export function CardTapPulse() {
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => {
    let seq = 0;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest(".react-flow__node")) return; // cards only
      if (t.closest("input, textarea, [contenteditable='true']")) return; // not while typing
      const id = ++seq;
      setPulses((ps) => [...ps, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setPulses((ps) => ps.filter((p) => p.id !== id)), 480);
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as never);
  }, []);
  return (
    <>
      {pulses.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none fixed z-[72] rounded-full"
          style={{
            left: p.x, top: p.y, width: 10, height: 10, marginLeft: -5, marginTop: -5,
            border: "2px solid rgba(174,185,201,0.9)",
            boxShadow: "0 0 8px rgba(174,185,201,0.6)",
            animation: "canvas-tap-pulse 0.45s ease-out forwards",
          }}
        />
      ))}
      <style>{`@keyframes canvas-tap-pulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(4); opacity: 0; } }`}</style>
    </>
  );
}

// CUSTOM CARD CURSOR (#10) — replaces the OS grab-hand with an on-brand 4-way
// move glyph (platinum stroke + dark halo so it reads on any background). Built
// through encodeURIComponent so the data URI can't be malformed by a stray #.
const MOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5 V22.5 M3.5 13 H22.5 M13 3.5 l-2.4 2.4 M13 3.5 l2.4 2.4 M13 22.5 l-2.4 -2.4 M13 22.5 l2.4 -2.4 M3.5 13 l2.4 -2.4 M3.5 13 l2.4 2.4 M22.5 13 l-2.4 -2.4 M22.5 13 l-2.4 2.4" stroke="#0B0F1E" stroke-width="3.4"/><path d="M13 3.5 V22.5 M3.5 13 H22.5 M13 3.5 l-2.4 2.4 M13 3.5 l2.4 2.4 M13 22.5 l-2.4 -2.4 M13 22.5 l2.4 -2.4 M3.5 13 l2.4 -2.4 M3.5 13 l2.4 2.4 M22.5 13 l-2.4 -2.4 M22.5 13 l-2.4 2.4" stroke="#AEB9C9" stroke-width="1.5"/></g></svg>`;
const MOVE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(MOVE_SVG)}") 13 13, move`;
export const CARD_CURSOR_CSS = `
  /* compound selector (0,2,0) so it beats React Flow's own
     .react-flow__node.draggable { cursor: grab }. Branded 4-way move glyph
     where SVG cursors are honored; reliable 'move' fallback otherwise —
     never the grab-hand. Containers keep grab. */
  .react-flow__node.react-flow__node-je, .react-flow__node.react-flow__node-taccount,
  .react-flow__node.react-flow__node-note, .react-flow__node.react-flow__node-computation,
  .react-flow__node.react-flow__node-memorize, .react-flow__node.react-flow__node-ceq,
  .react-flow__node.react-flow__node-list, .react-flow__node.react-flow__node-schedule,
  .react-flow__node.react-flow__node-image, .react-flow__node.react-flow__node-heading,
  .react-flow__node.react-flow__node-video, .react-flow__node.react-flow__node-formula {
    cursor: ${MOVE_CURSOR};
  }
  /* inner controls keep their own affordance (they're child elements — no
     specificity fight with the node div above) */
  .react-flow__node input, .react-flow__node textarea, .react-flow__node [contenteditable="true"] { cursor: text; }
  .react-flow__node button, .react-flow__node a, .react-flow__node select, .react-flow__node [role="button"] { cursor: pointer; }
  /* film/clean present views: no move cursor for the audience */
  .film-mode .react-flow__node, .sa-clean .react-flow__node { cursor: default; }
`;

/** CSS that removes at-rest card chrome in film mode. Interactions keep working —
 *  drag (header), dbl-click edit, hotkeys — only passive affordances disappear. */
export const FILM_MODE_CSS = `
  .film-mode .card-actions { display: none !important; }
  .film-mode .react-flow__resize-control { display: none !important; }
  .film-mode .zone-actions { display: none !important; }
`;
