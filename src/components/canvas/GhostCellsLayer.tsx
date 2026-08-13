// GHOST CELLS (region grid) — the "room to grow" made visible. Empty slots in
// the reserved 5-wide lesson grid render as dashed "+ add lesson" placeholders,
// derived live from the lessons' positions (nothing persists). Authoring-only —
// the parent hides this in film mode. Clicking a ghost stamps a lesson there.
// Rendered in flow coordinates via ViewportPortal (pans/zooms with the canvas).
import { ViewportPortal, useNodes } from "@xyflow/react";
import { Plus } from "lucide-react";

import { isWrapUpName, lessonCellSize, REGION } from "./frames";
import { NEON } from "./theme";

type LNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data?: { label?: string } };

export function GhostCellsLayer({ onAdd }: { onAdd: (pos: { x: number; y: number }, pathOrder: number) => void }) {
  const nodes = useNodes() as unknown as LNode[];
  const lessons = nodes.filter((n) => n.type === "lesson" && !n.parentId);
  const grid = lessons.filter((n) => !isWrapUpName(n.data?.label));
  if (grid.length === 0) return null;

  const cell = lessonCellSize();
  const stepX = cell.w + REGION.gutterX;
  const stepY = cell.h + REGION.gutterY;
  const originX = Math.min(...grid.map((n) => n.position.x));
  const originY = Math.min(...grid.map((n) => n.position.y));

  // which slots are filled + how many rows the grid spans
  const occupied = new Set<number>();
  let maxRow = 0;
  for (const l of grid) {
    const col = Math.round((l.position.x - originX) / stepX);
    const row = Math.round((l.position.y - originY) / stepY);
    if (col >= 0 && col < REGION.cols && row >= 0) { occupied.add(row * REGION.cols + col); maxRow = Math.max(maxRow, row); }
  }
  let rows = Math.max(REGION.minRows, maxRow + 1);
  let total = rows * REGION.cols;
  // Grid full → reveal one growth row so there's always room to add into (the
  // 16th lesson soft-extends to a 4th row — warn, never block).
  if (occupied.size >= total) { rows += 1; total = rows * REGION.cols; }

  const ghosts: { x: number; y: number; idx: number }[] = [];
  for (let i = 0; i < total; i++) {
    if (occupied.has(i)) continue;
    const col = i % REGION.cols;
    const row = Math.floor(i / REGION.cols);
    ghosts.push({ x: originX + col * stepX, y: originY + row * stepY, idx: i });
  }
  if (ghosts.length === 0) return null;

  return (
    <ViewportPortal>
      {ghosts.map((g) => (
        <button
          key={`ghost-${g.idx}`}
          className="absolute grid place-items-center rounded-2xl"
          style={{
            left: g.x, top: g.y, width: cell.w, height: cell.h,
            border: `3px dashed ${NEON.borderSoft}`,
            background: "repeating-linear-gradient(135deg, rgba(147,160,180,0.035) 0 22px, rgba(147,160,180,0.015) 22px 44px)",
            color: NEON.muted, opacity: 0.5,
          }}
          title="Add a lesson here"
          onClick={(e) => { e.stopPropagation(); onAdd({ x: g.x, y: g.y }, g.idx + 1); }}
        >
          <span className="flex items-center gap-3">
            <Plus style={{ width: 64, height: 64 }} />
            <span className="text-[44px] font-bold uppercase tracking-[0.2em]">add lesson</span>
          </span>
        </button>
      ))}
    </ViewportPortal>
  );
}
