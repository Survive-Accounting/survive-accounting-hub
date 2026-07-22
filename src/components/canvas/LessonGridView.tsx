// GRID-BY-TYPE VIEW (topic-grouping batch, ITEM 4) — a read-only projection of
// the lesson nodes into a table: COLUMNS are the four lesson types in priority
// order (CEQ_CRAM · CEQ_FULL · CONCEPT · EXTRA), ROWS are topics. Each lesson
// renders as a chip in its (type, topic) cell; same-type siblings on one topic
// stack in the cell. FREE/PAID (gate B&W + lock) and OPTIONAL (dimmed/off-axis)
// treatments render here too, plus an estimated-runtime chip (soft warn past
// ~3:00 — warning only, never blocks). This NEVER moves nodes — toggling back to
// the canvas is lossless because no placement data is read or written.
import { useMemo } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { Lock, X } from "lucide-react";

import { estimateTotalSeconds, formatReadTime } from "./script-timing";
import { LESSON_TYPES, LESSON_TYPE_LABEL, type FrameScript, type LessonAccess, type LessonBox, type LessonPathing, type LessonType } from "./types";
import { NEON } from "./theme";

const RUNTIME_WARN_S = 180; // ~3:00 — soft warning only

const TYPE_TONE: Record<LessonType, string> = { CEQ_CRAM: "#FF8B9E", CEQ_FULL: NEON.yellow, CONCEPT: NEON.cyan, EXTRA: NEON.muted };

interface LessonRow {
  id: string;
  label: string;
  lessonType: LessonType;
  topic: string;
  access: LessonAccess;
  pathing: LessonPathing;
  pathOrder: number;
  runtimeS: number;
}

export function LessonGridView({ onClose }: { onClose: () => void }) {
  const nodes = useNodes();
  const rf = useReactFlow();

  const lessons: LessonRow[] = useMemo(() => {
    const all = rf.getNodes();
    return all
      .filter((n) => n.type === "lesson")
      .map((n) => {
        const d = n.data as unknown as LessonBox;
        const scripts = all.filter((f) => f.type === "frame" && f.parentId === n.id).map((f) => (f.data as { script?: FrameScript }).script);
        return {
          id: n.id,
          label: (d.label || "").trim() || "Lesson",
          lessonType: d.lessonType ?? "CONCEPT",
          topic: (d.topic ?? d.label ?? "").trim() || "(no topic)",
          access: d.access ?? "FREE",
          pathing: d.pathing ?? "RECOMMENDED",
          pathOrder: typeof d.pathOrder === "number" ? d.pathOrder : 9999,
          runtimeS: estimateTotalSeconds(scripts),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Topic rows in path order (min pathOrder among a topic's lessons), then name.
  const topics = useMemo(() => {
    const byTopic = new Map<string, number>();
    for (const l of lessons) byTopic.set(l.topic, Math.min(byTopic.get(l.topic) ?? Infinity, l.pathOrder));
    return [...byTopic.keys()].sort((a, b) => (byTopic.get(a)! - byTopic.get(b)!) || a.localeCompare(b));
  }, [lessons]);

  const cellOf = (topic: string, type: LessonType) => lessons.filter((l) => l.topic === topic && l.lessonType === type);

  const jump = (id: string) => {
    // Close FIRST (never let a camera hiccup keep the overlay stuck), then move
    // the camera to the lesson on the next tick once the overlay has unmounted.
    onClose();
    if (rf.getNode(id)) window.setTimeout(() => { void rf.fitView({ nodes: [{ id }], duration: 400, padding: 0.25 }); }, 30);
  };

  return (
    <div className="absolute inset-0 z-[60] flex flex-col" style={{ background: "rgba(6,10,20,0.97)", color: NEON.text }}>
      {/* header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
        <div className="text-[15px] font-bold uppercase tracking-[0.2em]" style={{ color: NEON.yellow }}>Lessons by type</div>
        <div className="flex items-center gap-3">
          <div className="text-[11px]" style={{ color: NEON.muted }}>{lessons.length} lessons · {topics.length} topics · read-only view (toggle back is lossless)</div>
          <button className="grid h-7 w-7 place-items-center rounded" style={{ border: `1px solid ${NEON.borderSoft}` }} title="Close (back to canvas)" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
      </div>

      {/* grid */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {lessons.length === 0 ? (
          <div className="grid h-full place-items-center text-[13px]" style={{ color: NEON.muted }}>No lessons in this scene yet.</div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: `180px repeat(${LESSON_TYPES.length}, minmax(180px, 1fr))` }}>
            {/* column headers */}
            <div />
            {LESSON_TYPES.map((t) => (
              <div key={t} className="sticky top-0 rounded-md px-2 py-2 text-center text-[13px] font-bold uppercase tracking-widest" style={{ color: "#0B0F1E", background: TYPE_TONE[t] }}>
                {LESSON_TYPE_LABEL[t]}
              </div>
            ))}
            {/* topic rows */}
            {topics.map((topic) => (
              <div key={topic} className="contents">
                <div className="flex items-center rounded-md px-2 py-2 text-[12px] font-bold uppercase tracking-wider" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
                  {topic}
                </div>
                {LESSON_TYPES.map((t) => {
                  const cell = cellOf(topic, t);
                  return (
                    <div key={t} className="flex flex-col gap-1.5 rounded-md p-1.5" style={{ background: "rgba(0,0,0,0.25)", border: `1px solid ${NEON.borderSoft}`, minHeight: 44 }}>
                      {cell.map((l) => {
                        const paid = l.access === "PAID";
                        const optional = l.pathing === "OPTIONAL";
                        const over = l.runtimeS > RUNTIME_WARN_S;
                        const rt = formatReadTime(l.runtimeS);
                        return (
                          <button
                            key={l.id}
                            onClick={() => jump(l.id)}
                            className="flex flex-col items-start gap-1 rounded-md px-2 py-1.5 text-left transition-transform hover:-translate-y-px"
                            title={`${l.label} — jump to this lesson`}
                            style={{
                              background: "rgba(255,255,255,0.04)",
                              border: `1px solid ${TYPE_TONE[t]}55`,
                              filter: paid ? "grayscale(0.55)" : undefined,
                              opacity: optional ? 0.72 : 1,
                              transform: optional ? "rotate(-1.2deg)" : undefined,
                            }}
                          >
                            <div className="flex w-full items-center gap-1">
                              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" style={{ color: NEON.text }}>{l.label}</span>
                              {paid && <Lock className="h-3 w-3 shrink-0" style={{ color: "#FF8B9E" }} />}
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide" style={paid ? { color: "#FF8B9E", border: "1px solid rgba(255,92,108,0.5)" } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>
                                {paid ? "Paid" : "Free"}
                              </span>
                              {optional && <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide italic" style={{ color: NEON.muted, border: `1px dashed ${NEON.borderSoft}` }}>Optional</span>}
                              {rt && (
                                <span className="rounded px-1 py-0.5 text-[8px] font-bold tabular-nums" style={over ? { color: "#FFD08A", border: "1px solid rgba(252,163,17,0.55)", background: "rgba(252,163,17,0.12)" } : { color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} title={over ? "Over ~3:00 — consider tightening (warning only)" : "Estimated runtime from the script"}>
                                  {over ? "⚠ " : ""}{rt}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
