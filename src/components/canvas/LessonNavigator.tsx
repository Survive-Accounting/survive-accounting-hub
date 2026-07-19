// LESSON NAVIGATOR — the bottom pager that replaces the minimap big-picture.
// Shows ONE lesson at a time: ‹ / › step between lessons (the camera fits each
// lesson), and the label toggles a strip of that lesson's frames — click a frame
// to jump straight into it. Only lessons show by default; expand for frames.
// Authoring chrome only; self-contained (reads nodes + the frame-nav camera).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNodes, useReactFlow } from "@xyflow/react";
import { ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

import { absRectOf, BEAT_COLUMNS, beatColOf, subIndexOf } from "./frames";
import { useFrameNav } from "./FrameNavContext";
import { NEON } from "./theme";

type NavNode = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; data: Record<string, unknown> };

export function LessonNavigator() {
  const nodes = useNodes() as unknown as NavNode[];
  const rf = useReactFlow();
  const nav = useFrameNav();

  const lessons = useMemo(
    () => nodes.filter((n) => n.type === "lesson").sort(
      (a, b) => ((a.data.pathOrder as number) ?? 1e9) - ((b.data.pathOrder as number) ?? 1e9) || a.position.y - b.position.y || a.position.x - b.position.x,
    ),
    [nodes],
  );
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const [idx, setIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const didInit = useRef(false);

  const cur = Math.min(idx, Math.max(0, lessons.length - 1));
  const lesson = lessons[cur];
  const frames = useMemo(
    () => (lesson
      ? nodes.filter((n) => n.type === "frame" && n.parentId === lesson.id).sort(
          (a, b) => BEAT_COLUMNS.indexOf(beatColOf(a as never)) - BEAT_COLUMNS.indexOf(beatColOf(b as never)) || subIndexOf(a as never) - subIndexOf(b as never),
        )
      : []),
    [lesson, nodes],
  );

  const fitLesson = (l: NavNode) => { const r = absRectOf(l as never, byId as never); void rf.fitBounds({ x: r.x, y: r.y, width: r.w, height: r.h }, { duration: 320, padding: 0.12 }); };
  const framesOfLesson = (lessonId: string) => nodes.filter((n) => n.type === "frame" && n.parentId === lessonId).sort(
    (a, b) => BEAT_COLUMNS.indexOf(beatColOf(a as never)) - BEAT_COLUMNS.indexOf(beatColOf(b as never)) || subIndexOf(a as never) - subIndexOf(b as never),
  );
  // NAVIGATING TO A LESSON = enter its FIRST frame (fall back to fitting the
  // lesson band only if it somehow has no frames).
  const enterLesson = (l: NavNode) => { const fs = framesOfLesson(l.id); if (fs[0]) nav.enter(fs[0].id); else fitLesson(l); };

  // FOLLOW the camera: entering a frame in another lesson syncs the pager.
  useEffect(() => {
    if (!nav.currentFrameId) return;
    const f = byId.get(nav.currentFrameId);
    if (!f?.parentId) return;
    const li = lessons.findIndex((l) => l.id === f.parentId);
    if (li >= 0 && li !== cur) setIdx(li);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav.currentFrameId]);

  // ON LOAD: open the course's FIRST frame (locked into frames, not the grid).
  useEffect(() => {
    if (didInit.current || lessons.length === 0) return;
    didInit.current = true;
    if (!nav.currentFrameId) window.setTimeout(() => enterLesson(lessons[0]), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons.length]);

  if (lessons.length === 0) return null;

  const goLesson = (d: -1 | 1) => { const ni = Math.max(0, Math.min(lessons.length - 1, cur + d)); setIdx(ni); enterLesson(lessons[ni]); };

  return (
    <div className="absolute bottom-[4.5rem] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-1">
      {/* SIMPLE MENU (de-lag): solid panels, no backdrop-blur (it repainted the
          whole screen over the animated backstage every frame), no transitions. */}
      {expanded && (
        <div className="flex max-w-[80vw] flex-wrap justify-center gap-1 rounded-xl px-2 py-1.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }}>
          {frames.length === 0 && <span className="px-1 text-[10px] italic" style={{ color: NEON.muted }}>no frames in this lesson</span>}
          {frames.map((f, i) => {
            const active = nav.currentFrameId === f.id;
            return (
              <button
                key={f.id}
                onClick={() => nav.enter(f.id)}
                className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold"
                style={{ color: active ? "#0B1322" : NEON.text, background: active ? NEON.yellow : "transparent", border: `1px solid ${active ? NEON.yellow : NEON.borderSoft}` }}
                title={(f.data.title as string) || `Frame ${i + 1}`}
              >
                {(f.data.title as string) || `F${i + 1}`}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-1 rounded-full px-1 py-1" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}>
        <button className="grid h-6 w-6 place-items-center rounded-full disabled:opacity-40" style={{ color: NEON.text }} disabled={cur === 0} onClick={() => goLesson(-1)} title="Previous lesson"><ChevronLeft className="h-4 w-4" /></button>
        <button className="flex items-center gap-1.5 px-2 text-[11.5px] font-bold" style={{ color: NEON.text }} onClick={() => { setExpanded((v) => !v); enterLesson(lesson); }} title="Enter this lesson's first frame · click to list its frames">
          <span className="text-[9px] tabular-nums" style={{ color: NEON.muted }}>{cur + 1}/{lessons.length}</span>
          <span className="max-w-[38vw] truncate">{(lesson.data.label as string) || "Lesson"}</span>
          <ChevronUp className="h-3 w-3" style={{ transform: expanded ? "none" : "rotate(180deg)", color: NEON.muted }} />
        </button>
        <button className="grid h-6 w-6 place-items-center rounded-full disabled:opacity-40" style={{ color: NEON.text }} disabled={cur >= lessons.length - 1} onClick={() => goLesson(1)} title="Next lesson"><ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
