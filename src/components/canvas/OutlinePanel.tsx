// OUTLINE — the STRUCTURAL navigation half (spatial = pan/zoom/minimap). A live
// tree rendered FROM scene structure, never hand-maintained: Region → Lessons
// (path_order) → Cards nested under their lesson, loose cards under "Unfiled".
// Click any row → the camera flies there, framed to fit. Lessons collapse. The
// lesson nearest the viewport centre highlights (you-are-here) as you pan. It
// updates live because it reads the same node store the canvas mutates.
import { useMemo, useState } from "react";
import { useNodes, useReactFlow, useStore } from "@xyflow/react";
import { ChevronDown, ChevronRight, Clapperboard, Frame, Layers } from "lucide-react";

import { NEON } from "./theme";
import { useFrameNav } from "./FrameNavContext";
import { framesInLesson } from "./frames";
import { BEAT_META } from "./cards/FrameNode";
import { isContainerType, type CardBase, type CardNode, type FrameBox } from "./types";

/** Absolute rect of a node (a card parented to a lesson carries a relative pos). */
function absRect(n: CardNode, byId: Map<string, CardNode>) {
  let x = n.position.x;
  let y = n.position.y;
  let p = n.parentId ? byId.get(n.parentId) : undefined;
  while (p) {
    x += p.position.x;
    y += p.position.y;
    p = p.parentId ? byId.get(p.parentId) : undefined;
  }
  const w = (n.measured?.width ?? ((n.data as unknown as CardBase).w as number) ?? 300) as number;
  const h = (n.measured?.height ?? ((n.data as unknown as CardBase).h as number) ?? 170) as number;
  return { x, y, w, h };
}

const labelOf = (n: CardNode): string => {
  const d = n.data as unknown as Record<string, unknown>;
  return (
    (d.label as string) ||
    (d.caption as string) ||
    (d.title as string) ||
    (d.text as string) ||
    (d.name as string) ||
    ((d.kind as string) ?? n.type ?? "card")
  );
};

const pathOrderOf = (n: CardNode): number => {
  const v = (n.data as unknown as Record<string, unknown>).pathOrder;
  return typeof v === "number" ? v : Number.POSITIVE_INFINITY;
};

export function OutlinePanel() {
  const nodes = useNodes() as CardNode[];
  const rf = useReactFlow();
  const transform = useStore((s) => s.transform); // [tx, ty, zoom] — you-are-here
  const nav = useFrameNav();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const lessons = useMemo(
    () => nodes.filter((n) => n.type === "lesson").sort((a, b) => pathOrderOf(a) - pathOrderOf(b) || absRect(a, byId).y - absRect(b, byId).y),
    [nodes, byId],
  );
  const regionLabel = useMemo(() => {
    const zone = nodes.find((n) => n.type === "zone");
    return zone ? labelOf(zone) : "Region";
  }, [nodes]);
  // FRAMES nest between lesson and card: a card parents to a FRAME (shot) or
  // directly to a lesson (loose-in-lesson); cards under neither are "Unfiled".
  const framesByLesson = useMemo(() => {
    const m = new Map<string, CardNode[]>();
    for (const l of nodes.filter((n) => n.type === "lesson")) m.set(l.id, framesInLesson(nodes as never, l.id) as unknown as CardNode[]);
    return m;
  }, [nodes]);
  const cardsByLesson = useMemo(() => {
    const m = new Map<string, CardNode[]>(); // parentId (lesson OR frame) → cards
    const loose: CardNode[] = [];
    for (const n of nodes) {
      if (isContainerType(n.type) || (n.data as unknown as CardBase).tucked) continue;
      const pt = n.parentId ? byId.get(n.parentId)?.type : undefined;
      if (n.parentId && (pt === "lesson" || pt === "frame")) {
        const arr = m.get(n.parentId) ?? [];
        arr.push(n);
        m.set(n.parentId, arr);
      } else {
        loose.push(n);
      }
    }
    return { m, loose };
  }, [nodes, byId]);

  // YOU-ARE-HERE: the lesson whose centre is nearest the viewport centre.
  const hereLessonId = useMemo(() => {
    if (lessons.length === 0) return null;
    const [tx, ty, zoom] = transform;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const cx = (-tx + vw / 2) / zoom;
    const cy = (-ty + vh / 2) / zoom;
    let best: string | null = null;
    let bestD = Infinity;
    for (const l of lessons) {
      const r = absRect(l, byId);
      const d = (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2;
      if (d < bestD) { bestD = d; best = l.id; }
    }
    return best;
  }, [lessons, transform, byId]);

  const fly = (n: CardNode) => {
    const r = absRect(n, byId);
    void rf.fitBounds({ x: r.x, y: r.y, width: r.w, height: r.h }, { duration: 600, padding: 0.25 });
  };
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="nodrag nowheel max-h-[70vh] w-full overflow-y-auto px-0.5 py-1 text-[12px]" style={{ color: NEON.text }}>
      {/* Region row */}
      <button
        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-bold hover:bg-white/5"
        style={{ color: NEON.yellow }}
        onClick={() => { const z = nodes.find((n) => n.type === "zone"); if (z) fly(z); else void rf.fitView({ duration: 500, padding: 0.15 }); }}
        title="Frame the whole region"
      >
        <Layers className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{regionLabel}</span>
      </button>

      {lessons.length === 0 && (
        <p className="px-2 py-2 text-[11px] italic" style={{ color: NEON.muted }}>
          No lessons yet — “Add region scaffold” lays a snaking path, or add a lesson.
        </p>
      )}

      <div className="ml-1 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
        {lessons.map((l) => {
          const frames = framesByLesson.get(l.id) ?? [];
          const looseKids = cardsByLesson.m.get(l.id) ?? []; // cards directly in the lesson (not in a frame)
          const hasContent = frames.length > 0 || looseKids.length > 0;
          const isCol = collapsed.has(l.id);
          const here = hereLessonId === l.id;
          const po = pathOrderOf(l);
          const cardRow = (c: CardNode) => (
            <button
              key={c.id}
              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
              style={{ color: NEON.muted }}
              onClick={() => fly(c)}
              title="Fly here"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: NEON.muted }} />
              <span className="min-w-0 flex-1 truncate">{labelOf(c)}</span>
            </button>
          );
          return (
            <div key={l.id}>
              <div
                className="group/row flex items-center gap-1 rounded px-1 py-0.5"
                style={here ? { background: "rgba(252,163,17,0.14)", boxShadow: "inset 2px 0 0 " + NEON.yellow } : undefined}
              >
                <button className="shrink-0 rounded p-0.5 hover:bg-white/10" style={{ color: NEON.muted }} onClick={() => toggle(l.id)} title={isCol ? "Expand" : "Collapse"}>
                  {hasContent ? (isCol ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <span className="inline-block h-3 w-3" />}
                </button>
                {here && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: NEON.yellow, boxShadow: `0 0 6px ${NEON.yellow}` }} />}
                <button
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 text-left hover:text-white"
                  style={{ color: here ? NEON.yellow : NEON.text }}
                  onClick={() => fly(l)}
                  title="Fly here"
                >
                  {Number.isFinite(po) && (
                    <span className="shrink-0 rounded px-1 text-[9px] font-bold tabular-nums" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>{po}</span>
                  )}
                  <Frame className="h-3 w-3 shrink-0 opacity-50" />
                  <span className="min-w-0 flex-1 truncate">{labelOf(l)}</span>
                </button>
              </div>
              {!isCol && hasContent && (
                <div className="ml-4 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                  {/* FRAMES (shots), in order, with beat tag — click ENTERS the frame */}
                  {frames.map((f) => {
                    const fd = f.data as unknown as FrameBox;
                    const bm = BEAT_META[fd.beat ?? "none"];
                    const fcards = cardsByLesson.m.get(f.id) ?? [];
                    return (
                      <div key={f.id}>
                        <button
                          className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
                          style={{ color: nav.currentFrameId === f.id ? bm.color : NEON.text }}
                          onClick={() => nav.enter(f.id)}
                          title="Enter this frame (fit the camera to it)"
                        >
                          <Clapperboard className="h-3 w-3 shrink-0 opacity-70" style={{ color: bm.color }} />
                          {fd.beat && fd.beat !== "none" && (
                            <span className="shrink-0 rounded px-1 text-[8px] font-bold uppercase tracking-wide" style={{ color: bm.color, border: `1px solid ${bm.edge}` }}>{bm.label}</span>
                          )}
                          <span className="min-w-0 flex-1 truncate">{fd.title || "Frame"}</span>
                        </button>
                        {fcards.length > 0 && (
                          <div className="ml-4 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
                            {fcards.map(cardRow)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {/* loose-in-lesson cards (not inside any frame) */}
                  {looseKids.map(cardRow)}
                </div>
              )}
            </div>
          );
        })}

        {cardsByLesson.loose.length > 0 && (
          <div className="mt-1">
            <div className="px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Unfiled</div>
            <div className="ml-4 border-l pl-1" style={{ borderColor: NEON.borderSoft }}>
              {cardsByLesson.loose.map((c) => (
                <button
                  key={c.id}
                  className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-white/5"
                  style={{ color: NEON.muted }}
                  onClick={() => fly(c)}
                  title="Fly here"
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-sm" style={{ background: NEON.muted }} />
                  <span className="min-w-0 flex-1 truncate">{labelOf(c)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
