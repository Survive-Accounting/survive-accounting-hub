// FRAME-GRID AUTHORING OVERLAY (AC2 + AC3) — two authoring-only aids drawn in
// FLOW coordinates (pan/zoom with the canvas), one level down from the region's
// GhostCellsLayer:
//   • GHOST SUB-FRAME SLOTS — each beat column shows dashed "+" placeholders for
//     its unused rows (up to the 5 cap); clicking one stamps a frame there.
//   • FILM-ORDER PATH — a toggleable numbered path threading a lesson's frames in
//     column-major walk order (chips on each frame's corner + connecting line).
// The parent renders this only in authoring (chrome), so nothing here shows in
// film. Pure geometry from the frames grid helpers — nothing persists.
import { ViewportPortal, useNodes } from "@xyflow/react";
import { Plus } from "lucide-react";

import { BEAT_COLUMNS, columnX, framesInBeat, framesInLesson, rowY, RESERVED_ROWS } from "./frames";
import { NEON } from "./theme";
import { FRAME_H, FRAME_W, type Beat } from "./types";

type FNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data?: { beat?: string; subIndex?: number } };

export function FrameGridOverlay({ showPath, onAddFrame }: { showPath: boolean; onAddFrame: (lessonId: string, beat: Beat, subIndex: number) => void }) {
  const nodes = useNodes() as unknown as FNode[];
  const lessons = nodes.filter((n) => n.type === "lesson");
  if (lessons.length === 0) return null;

  const ghosts: { key: string; x: number; y: number; lessonId: string; beat: Beat; sub: number }[] = [];
  const pathChips: { key: string; x: number; y: number; n: number }[] = [];
  const pathLines: { key: string; pts: string }[] = [];

  for (const lesson of lessons) {
    const lx = lesson.position.x;
    const ly = lesson.position.y;

    // GHOSTS — fill each beat column's gap up to one row past the tallest column
    // (capped at RESERVED_ROWS), so a lesson always shows a little room to grow.
    const used = BEAT_COLUMNS.map((b) => framesInBeat(nodes as never, lesson.id, b).length);
    const fillRows = Math.min(RESERVED_ROWS, Math.max(...used, 0) + 1);
    BEAT_COLUMNS.forEach((beat, bi) => {
      for (let r = used[bi]; r < fillRows; r++) {
        ghosts.push({ key: `${lesson.id}:${beat}:${r}`, x: lx + columnX(bi), y: ly + rowY(r), lessonId: lesson.id, beat, sub: r });
      }
    });

    // PATH — column-major order; chip on each frame's top-left, line through centers.
    if (showPath) {
      const ordered = framesInLesson(nodes as never, lesson.id) as unknown as FNode[];
      const centers: { x: number; y: number }[] = [];
      ordered.forEach((f, i) => {
        const fx = lx + f.position.x;
        const fy = ly + f.position.y;
        pathChips.push({ key: `${lesson.id}:chip:${f.id}`, x: fx, y: fy, n: i + 1 });
        centers.push({ x: fx + FRAME_W / 2, y: fy + FRAME_H / 2 });
      });
      if (centers.length > 1) pathLines.push({ key: `${lesson.id}:line`, pts: centers.map((c) => `${c.x},${c.y}`).join(" ") });
    }
  }

  if (ghosts.length === 0 && pathChips.length === 0) return null;

  return (
    <ViewportPortal>
      {/* connecting path lines (behind chips) */}
      {pathLines.length > 0 && (
        <svg className="pointer-events-none absolute overflow-visible" style={{ left: 0, top: 0, width: 1, height: 1, zIndex: 1 }}>
          {pathLines.map((l) => (
            <polyline key={l.key} points={l.pts} fill="none" stroke="rgba(252,163,17,0.55)" strokeWidth={5} strokeDasharray="2 14" strokeLinecap="round" />
          ))}
        </svg>
      )}
      {ghosts.map((g) => (
        <button
          key={`fg-${g.key}`}
          className="absolute grid place-items-center rounded-lg"
          style={{
            left: g.x, top: g.y, width: FRAME_W, height: FRAME_H, zIndex: 0,
            border: `2px dashed ${NEON.borderSoft}`,
            background: "repeating-linear-gradient(135deg, rgba(147,160,180,0.03) 0 18px, rgba(147,160,180,0.012) 18px 36px)",
            color: NEON.muted, opacity: 0.4, transition: "opacity 120ms",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.4")}
          title="Add a frame here"
          onClick={(e) => { e.stopPropagation(); onAddFrame(g.lessonId, g.beat, g.sub); }}
        >
          <Plus style={{ width: 90, height: 90 }} />
        </button>
      ))}
      {pathChips.map((c) => (
        <div
          key={`pc-${c.key}`}
          className="pointer-events-none absolute grid place-items-center rounded-full font-black tabular-nums"
          style={{
            left: c.x - 16, top: c.y - 16, width: 52, height: 52, fontSize: 26, zIndex: 2,
            background: "rgba(252,163,17,0.95)", color: "#0B1322",
            border: "3px solid #0B1322", boxShadow: "0 4px 14px -4px rgba(0,0,0,0.6)",
          }}
        >
          {c.n}
        </div>
      ))}
    </ViewportPortal>
  );
}
