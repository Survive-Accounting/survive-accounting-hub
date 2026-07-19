// STORYBOARD (Phase 4) — a bird's-eye board of every frame in film order. Each
// cell shows its beat, title, script state, film status, World and card count.
// Click a cell to jump into that frame. Read-only navigation; mutates nothing.
import { useReactFlow } from "@xyflow/react";
import { Clapperboard, Copy, FileText, Timer, X } from "lucide-react";

import { useFrameNav } from "./FrameNavContext";
import { SCRIPT_STATE_META } from "./script-doc";
import { formatReadTime, isOverReadTime, type ScriptTimingOpts } from "./script-timing";
import { storyboardLessons, type StoryboardCell } from "./storyboard";
import { NEON } from "./theme";
import { worldById } from "./worlds";
import { WorldBackground } from "./WorldBackground";

const BEAT_TINT: Record<string, string> = {
  hook: "#8CC0EE", teach: "#E8B84B", model_practice: "#7EF3C0", cram: "#FF8B9E",
};
const FILM_DOT: Record<string, string> = { unfilmed: NEON.borderSoft, filmed: "#7EF3C0", retake: "#F5D48F" };

function Cell({ cell, current, onEnter, onDuplicate, onRehearse, threshold }: { cell: StoryboardCell; current: boolean; onEnter: () => void; onDuplicate: () => void; onRehearse: () => void; threshold: number }) {
  const sm = SCRIPT_STATE_META[cell.state];
  const beatColor = BEAT_TINT[cell.beat] ?? NEON.muted;
  const w = worldById(cell.world);
  const over = isOverReadTime(cell.estSeconds, threshold);
  return (
    <div className="group relative" style={{ width: 150 }}>
      {/* Hover overlay (buttons can't nest inside the cell button): duplicate +
          rehearse. PROMPT 1 duplicate + PROMPT 3 rehearse. */}
      <div className="absolute right-1 top-1 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onRehearse(); }}
          className="grid h-5 w-5 place-items-center rounded"
          style={{ background: "rgba(4,7,16,0.75)", color: "#7EF3C0", border: `1px solid ${NEON.borderSoft}` }}
          title="Rehearse this frame (timer + space-walk, no recording)"
        >
          <Timer className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }}
          className="grid h-5 w-5 place-items-center rounded"
          style={{ background: "rgba(4,7,16,0.75)", color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }}
          title="Duplicate this frame (choose lesson + beat)"
        >
          <Copy className="h-3 w-3" />
        </button>
      </div>
    <button
      onClick={onEnter}
      className="relative flex w-full flex-col overflow-hidden rounded-lg text-left"
      style={{ border: `1.5px solid ${current ? NEON.yellow : NEON.borderSoft}`, background: NEON.bg2 }}
      title={`Frame ${cell.n} — ${cell.beatLabel}${cell.title ? ` · ${cell.title}` : ""} · ${sm.label}. Click to enter.`}
    >
      {/* 16:9 preview: the World (if any) behind a beat wash */}
      <div className="relative" style={{ width: "100%", aspectRatio: "16/9", background: "#0A0F22" }}>
        {w && <WorldBackground worldId={w.id} intensity={w.defaultIntensity} motion={0} seed={1} />}
        <span className="absolute left-1 top-1 rounded px-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: beatColor, background: "rgba(4,7,16,0.6)" }}>{cell.beatLabel} {cell.n}</span>
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full" title={`Film: ${cell.filmStatus}`} style={{ background: FILM_DOT[cell.filmStatus] ?? NEON.borderSoft, boxShadow: cell.filmStatus === "filmed" ? "0 0 6px #7EF3C0" : "none" }} />
        {cell.cardCount > 0 && <span className="absolute bottom-1 right-1 rounded px-1 text-[8px] tabular-nums" style={{ color: "#C9D6F5", background: "rgba(4,7,16,0.6)" }}>{cell.cardCount} card{cell.cardCount === 1 ? "" : "s"}</span>}
        {/* READ-TIME (PROMPT 3): estimated spoken seconds; red when over the threshold */}
        {cell.estSeconds > 0 && (
          <span className="absolute bottom-1 left-1 rounded px-1 text-[8px] font-bold tabular-nums" title={over ? "Over the read-time threshold — trim it" : "Estimated spoken time"} style={{ color: over ? "#FF8B9E" : "#C9D6F5", background: "rgba(4,7,16,0.6)" }}>{formatReadTime(cell.estSeconds)}{over ? " ⚠" : ""}</span>
        )}
      </div>
      {/* caption */}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" title={`Script: ${sm.label}`} style={{ background: sm.color, opacity: cell.state === "empty" ? 0.4 : 1 }} />
        <span className="min-w-0 flex-1 truncate text-[10px] font-semibold" style={{ color: cell.title ? NEON.text : NEON.muted }}>{cell.title || "(untitled)"}</span>
        {typeof cell.lastRehearsalS === "number" && (
          <span className="shrink-0 text-[8px] tabular-nums" title="Last rehearsal time" style={{ color: NEON.muted }}>▶{formatReadTime(cell.lastRehearsalS)}</span>
        )}
      </div>
    </button>
    </div>
  );
}

export function Storyboard({ onClose, timing = {}, threshold = 60, onOpenScript, onRehearse }: {
  onClose: () => void;
  /** PROMPT 3: read-time knobs (riff multiplier / wpm) + over-threshold seconds. */
  timing?: ScriptTimingOpts;
  threshold?: number;
  /** Switch to the Script editor (item 1 — storyboard ⇄ script). */
  onOpenScript?: () => void;
  /** Rehearse a frame (item 4). */
  onRehearse?: (frameId: string) => void;
}) {
  const rf = useReactFlow();
  const nav = useFrameNav();
  const lessons = storyboardLessons(rf.getNodes() as never, timing);
  const totalFrames = lessons.reduce((a, l) => a + l.cells.length, 0);
  const lessonSeconds = (l: (typeof lessons)[number]) => l.cells.reduce((a, c) => a + c.estSeconds, 0);
  const totalSeconds = lessons.reduce((a, l) => a + lessonSeconds(l), 0);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "rgba(4,7,16,0.82)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="mx-auto mt-6 flex max-h-[86vh] w-[min(1100px,94vw)] flex-col overflow-hidden rounded-2xl" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: NEON.borderSoft }}>
          <Clapperboard className="h-4 w-4" style={{ color: NEON.yellow }} />
          <span className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NEON.yellow }}>Storyboard</span>
          <span className="text-[11px]" style={{ color: NEON.muted }}>{lessons.length} lesson{lessons.length === 1 ? "" : "s"} · {totalFrames} frames{totalSeconds > 0 ? ` · ${formatReadTime(totalSeconds)}` : ""} · film order</span>
          <span className="flex-1" />
          {onOpenScript && (
            <button className="flex items-center gap-1 rounded px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={onOpenScript} title="Switch to the Script editor">
              <FileText className="h-3 w-3" /> Script
            </button>
          )}
          <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted }} onClick={onClose} title="Close (Esc)"><X className="h-4 w-4" /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {totalFrames === 0 ? (
            <p style={{ color: NEON.muted }}>No frames yet — scaffold a lesson or add frames to see the storyboard.</p>
          ) : (
            lessons.map((l) => (
              <div key={l.lessonId} className="mb-5">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[11px] font-bold" style={{ color: NEON.text }}>{l.label}</span>
                  <span className="text-[9.5px]" style={{ color: NEON.muted }}>{l.cells.length} frames{lessonSeconds(l) > 0 ? ` · ${formatReadTime(lessonSeconds(l))}` : ""}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {l.cells.map((c) => (
                    <Cell
                      key={c.frameId}
                      cell={c}
                      current={nav.currentFrameId === c.frameId}
                      threshold={threshold}
                      onEnter={() => { nav.enter(c.frameId); onClose(); }}
                      onDuplicate={() => { onClose(); nav.duplicateDialog(c.frameId); }}
                      onRehearse={() => { onClose(); onRehearse?.(c.frameId); }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
