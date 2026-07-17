// SURVIVE BACKDROP (flow-space) — a colossal "SURVIVE" wordmark laid ACROSS the
// whole scaffolding in canvas coordinates, so it pans/zooms with the scene and
// the lessons, frames and cards sit ON TOP of it. Zoom out and the entire stage
// reads as one branded plate. Authoring-only (parent gates it to the cinema
// backstage, !film). Behind the nodes (low z) + pointer-events-none.
import { ViewportPortal, useNodes } from "@xyflow/react";

type RNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; width?: number; height?: number; measured?: { width?: number; height?: number }; data?: { w?: number; h?: number } };

const WORD = "SURVIVE";

export function SurviveBackdrop() {
  const nodes = useNodes() as unknown as RNode[];
  // Union of the TOP-LEVEL boxes (lessons/zones/loose cards); frames live inside
  // lessons so their bounds are already covered.
  const tops = nodes.filter((n) => !n.parentId && (n.type === "lesson" || n.type === "zone" || n.type === "frame" || !n.type?.startsWith("react")));
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of tops) {
    const w = n.measured?.width ?? n.width ?? n.data?.w ?? 300;
    const h = n.measured?.height ?? n.height ?? n.data?.h ?? 180;
    minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + w); maxY = Math.max(maxY, n.position.y + h);
  }
  // Empty canvas → a generous default plate centered on the origin.
  if (!Number.isFinite(minX)) { minX = -2000; minY = -1000; maxX = 2000; maxY = 1000; }

  const w = maxX - minX;
  const h = maxY - minY;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // Span the wordmark across the content — width-driven, room-to-breathe height.
  const fontSize = Math.max(600, Math.min(w / 4.2, h * 1.15));
  const boxW = w * 1.5;
  const boxH = fontSize * 1.4;

  return (
    <ViewportPortal>
      <div
        className="pointer-events-none absolute grid select-none place-items-center"
        style={{ left: cx - boxW / 2, top: cy - boxH / 2, width: boxW, height: boxH, zIndex: 0 }}
      >
        <span
          style={{
            fontFamily: "'Poppins','Inter',system-ui,sans-serif",
            fontWeight: 900,
            fontSize,
            lineHeight: 1,
            letterSpacing: `${fontSize * 0.04}px`,
            whiteSpace: "nowrap",
            color: "rgba(255,214,196,0.05)",
            WebkitTextStroke: `${Math.max(2, fontSize * 0.006)}px rgba(255,110,120,0.10)`,
            textShadow: "0 0 60px rgba(255,60,80,0.10)",
          }}
        >
          {WORD}
        </span>
      </div>
    </ViewportPortal>
  );
}
