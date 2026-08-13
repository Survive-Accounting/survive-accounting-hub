// FRAME REARRANGE GRID (Lee) — a big-picture, full 4-column × N-row grid of a
// lesson's frames so the whole flow is visible at once. Drag a frame onto another
// (MOVE + reflow across beats) or onto an empty beat column (append); empty cells
// show a placeholder. Copy a frame, then paste it into an empty slot. The heavy
// lifting (reflow moves, deep-copy) lives in the route — this is the surface.
import { Copy, ClipboardPaste, Plus, X } from "lucide-react";

import { BEAT_COLUMNS, BEAT_LABEL, framesInBeat, framesInLesson, RESERVED_ROWS } from "./frames";
import { NEON } from "./theme";
import type { Beat } from "./types";

interface FrameNodeLike { id: string; parentId?: string; type?: string; data: Record<string, unknown> }

const BEAT_TINT: Record<string, string> = {
  hook: "#E0284A",
  teach: "#2B6CB0",
  model_practice: "#8A5A00",
  cram: "#1E7F4F",
};

export function FrameRearrangeGrid({
  lessonId,
  lessonLabel,
  frames,
  currentFrameId,
  copiedFrameId,
  onEnter,
  onMoveToFrame,
  onMoveToBeat,
  onCreate,
  onCopy,
  onPaste,
  onClose,
}: {
  lessonId: string;
  lessonLabel: string;
  frames: FrameNodeLike[];
  currentFrameId: string | null;
  copiedFrameId: string | null;
  onEnter: (frameId: string) => void;
  onMoveToFrame: (src: string, dest: string) => void;
  onMoveToBeat: (src: string, beat: Beat) => void;
  onCreate: (beat: Beat) => void;
  onCopy: (frameId: string) => void;
  onPaste: (beat: Beat) => void;
  onClose: () => void;
}) {
  const cols = BEAT_COLUMNS as readonly Beat[];
  const colFrames = (beat: Beat) => framesInBeat(frames as never, lessonId, beat) as unknown as FrameNodeLike[];
  // Frame code = its 1-based position in the lesson's column-major PLAY order.
  const order = framesInLesson(frames as never, lessonId) as unknown as FrameNodeLike[];
  const codeOf = (fid: string) => `#${Math.max(1, order.findIndex((x) => x.id === fid) + 1)}`;
  const rows = Math.max(1, ...cols.map((b) => colFrames(b).length + 1)); // +1 so there's always a trailing empty slot
  const rowsClamped = Math.min(RESERVED_ROWS, rows);

  const drop = (beat: Beat, frameAt?: FrameNodeLike) => (e: React.DragEvent) => {
    e.preventDefault();
    const src = e.dataTransfer.getData("text/frame");
    if (!src) return;
    if (frameAt && frameAt.id !== src) onMoveToFrame(src, frameAt.id);
    else if (!frameAt) onMoveToBeat(src, beat);
  };

  return (
    <div className="fixed inset-0 z-[95] grid place-items-center" style={{ background: "rgba(6,10,20,0.72)" }} onClick={onClose}>
      <div
        className="max-h-[88vh] w-[min(94vw,980px)] overflow-auto rounded-2xl p-4"
        style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.8)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-bold" style={{ color: NEON.text }}>Rearrange — {lessonLabel}</div>
            <div className="text-[11px]" style={{ color: NEON.muted }}>Drag a frame to reorder (others reflow) · copy a frame, then paste into an empty slot · click to open</div>
          </div>
          <button className="grid h-7 w-7 place-items-center rounded-lg" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }}>
          {cols.map((beat) => (
            <div key={beat} className="text-center text-[10px] font-black uppercase tracking-wider" style={{ color: BEAT_TINT[beat] ?? NEON.muted }}>
              {BEAT_LABEL[beat] ?? beat}
            </div>
          ))}

          {Array.from({ length: rowsClamped }, (_, row) => cols.map((beat) => {
            const f = colFrames(beat)[row];
            if (f) {
              const active = f.id === currentFrameId;
              const copied = f.id === copiedFrameId;
              const title = (f.data.title as string) || codeOf(f.id);
              return (
                <div
                  key={`${beat}-${row}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/frame", f.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={drop(beat, f)}
                  onClick={() => { onEnter(f.id); onClose(); }}
                  className="group/rf relative cursor-grab overflow-hidden rounded-lg px-2 py-2 text-left active:cursor-grabbing"
                  style={{
                    aspectRatio: "16 / 9",
                    background: "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${active ? NEON.yellow : copied ? NEON.cyan : NEON.borderSoft}`,
                    boxShadow: active ? `0 0 0 2px ${NEON.yellow}55` : undefined,
                  }}
                  title={`${codeOf(f.id)} · drag to reorder`}
                >
                  <div className="text-[9px] font-black uppercase" style={{ color: BEAT_TINT[beat] ?? NEON.muted }}>{codeOf(f.id)}</div>
                  <div className="mt-0.5 line-clamp-3 text-[11px] font-semibold leading-tight" style={{ color: NEON.text }}>{title}</div>
                  <button
                    className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded opacity-0 transition-opacity group-hover/rf:opacity-100"
                    style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: copied ? NEON.cyan : NEON.muted }}
                    onClick={(e) => { e.stopPropagation(); onCopy(f.id); }}
                    title="Copy this frame (then paste into an empty slot)"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </div>
              );
            }
            // empty placeholder — drop target + new/paste affordances
            const isNextEmpty = colFrames(beat).length === row; // the first empty slot in this column
            return (
              <div
                key={`${beat}-${row}`}
                onDragOver={(e) => e.preventDefault()}
                onDrop={drop(beat)}
                className="grid place-items-center rounded-lg"
                style={{ aspectRatio: "16 / 9", border: `1.5px dashed ${NEON.borderSoft}`, background: "rgba(255,255,255,0.015)" }}
              >
                {isNextEmpty && (
                  <div className="flex flex-col items-center gap-1">
                    <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onCreate(beat)} title={`New frame in ${BEAT_LABEL[beat] ?? beat}`}><Plus className="h-3.5 w-3.5" /></button>
                    {copiedFrameId && (
                      <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.cyan, border: `1px solid ${NEON.cyan}66` }} onClick={() => onPaste(beat)} title="Paste the copied frame here"><ClipboardPaste className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                )}
              </div>
            );
          }))}
        </div>
      </div>
    </div>
  );
}
