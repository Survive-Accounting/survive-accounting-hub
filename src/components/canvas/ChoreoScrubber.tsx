// CHOREO SCRUBBER (Item 4) — a thin horizontal bar under the frame's 16:9 box.
// One dot per space-walk step (+ a start marker at 0); dragging or clicking a dot
// seeks the frame to exactly that step through the SHARED materializer (the same
// apply path as Space / Shift+Space). Shown in authoring AND film. There is no
// window-capture exclusion API in this app, so it lives in the LETTERBOX band
// (below the captured 16:9 rect) and is styled minimal + dark — flagged in the
// report as visible to a full-window capture.
import { useCallback, useRef } from "react";

export function ChoreoScrubber({ left, width, top, steps, pos, onSeek }: {
  left: number;
  width: number;
  top: number;
  steps: number;
  pos: number;
  onSeek: (k: number) => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const seekAt = useCallback((clientX: number) => {
    const el = barRef.current;
    if (!el || steps <= 0) return;
    const r = el.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
    onSeek(Math.round(t * steps));
  }, [onSeek, steps]);
  const pct = (i: number) => (steps > 0 ? (i / steps) * 100 : 0);

  return (
    <div
      className="nodrag fixed z-[56] select-none"
      style={{ left, top, width, pointerEvents: "auto" }}
      title="Scrubber — drag or click a dot to jump to that step (0 = blank)"
      onPointerDown={(e) => { dragging.current = true; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); seekAt(e.clientX); }}
      onPointerMove={(e) => { if (dragging.current) seekAt(e.clientX); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <div ref={barRef} className="relative h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.14)", cursor: "pointer" }}>
        <div className="pointer-events-none absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct(pos)}%`, background: "rgba(214,158,46,0.8)" }} />
        {Array.from({ length: steps + 1 }, (_, i) => (
          <div
            key={i}
            className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              left: `${pct(i)}%`,
              width: i === pos ? 11 : 7,
              height: i === pos ? 11 : 7,
              background: i <= pos ? "#f0c24b" : "rgba(255,255,255,0.5)",
              boxShadow: i === pos ? "0 0 8px rgba(240,194,75,0.9)" : undefined,
            }}
          />
        ))}
      </div>
      <div className="pointer-events-none mt-1 text-center text-[10px]" style={{ color: "rgba(255,255,255,0.55)" }}>
        {pos} / {steps}
      </div>
    </div>
  );
}
