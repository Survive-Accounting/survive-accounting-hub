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
        background: `radial-gradient(circle, rgba(255,45,149,0.28) 0%, rgba(255,45,149,0.10) 45%, transparent 70%)`,
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

/** CSS that removes at-rest card chrome in film mode. Interactions keep working —
 *  drag (header), dbl-click edit, hotkeys — only passive affordances disappear. */
export const FILM_MODE_CSS = `
  .film-mode .card-actions { display: none !important; }
  .film-mode .react-flow__resize-control { display: none !important; }
  .film-mode .zone-actions { display: none !important; }
`;
