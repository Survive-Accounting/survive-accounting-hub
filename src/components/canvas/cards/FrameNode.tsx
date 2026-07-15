// FRAME node — one shot / one screen / one sitting. A bounded 16:9 stage that
// lives inside a lesson and holds cards (parented, so they move with it). Calm
// bordered stage at rest; chrome (title, beat tag, enter, ‹ ›, ×) on hover. The
// beat is a TAG (hook|teach|model_practice|check|none), not a container — Check
// frames wear the red gate tint. Click the header (or double-click the stage) to
// ENTER: the camera fits the frame exactly (frame bounds = viewport). ‹ › walk
// the lesson's frames; Esc / ⌂ exits.
import { useEffect, useRef, useState } from "react";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Film, Maximize2, Pause, Play, Tag, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { bus } from "../commands";
import { ConnectionDots } from "../ConnectionDots";
import { useFrameNav } from "../FrameNavContext";
import { BEAT_COLUMNS, columnX, frame169, framesInBeat, rowY } from "../frames";
import { EditableText } from "../ui";
import { NEON } from "../theme";
import { FRAME_BG_DEFAULT_OPACITY, FRAME_BG_LOOPS, type Beat, type FrameBeat, type FrameBox } from "../types";
export const BEAT_META: Record<FrameBeat, { label: string; color: string; tint: string; edge: string }> = {
  none: { label: "Frame", color: NEON.muted, tint: "rgba(147,160,180,0.035)", edge: "rgba(147,160,180,0.3)" },
  hook: { label: "Hook", color: "#8CC0EE", tint: "rgba(79,163,227,0.05)", edge: "rgba(79,163,227,0.35)" },
  teach: { label: "Teach", color: "#E8B84B", tint: "rgba(252,163,17,0.045)", edge: "rgba(252,163,17,0.35)" },
  model_practice: { label: "Model · Practice", color: "#7EF3C0", tint: "rgba(59,245,160,0.05)", edge: "rgba(59,245,160,0.4)" },
  check: { label: "Check", color: "#FF8B9E", tint: "rgba(206,17,38,0.06)", edge: "rgba(206,17,38,0.45)" },
};

export function FrameNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FrameBox;
  const { update, remove } = useCardActions(id);
  const rf = useReactFlow();
  const nav = useFrameNav();
  const [hover, setHover] = useState(false);
  const [bgMenu, setBgMenu] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const beat = d.beat ?? "none";
  const meta = BEAT_META[beat];
  const showChrome = hover || selected;
  const isCurrent = nav.currentFrameId === id;

  const bgLoop = d.bgSrc ? FRAME_BG_LOOPS.find((l) => l.id === d.bgSrc) : undefined;
  const bgOpacity = d.bgOpacity ?? FRAME_BG_DEFAULT_OPACITY;
  // Drive the <video> from the persisted bgPlaying flag (play before a take, pause
  // on action). muted+playsInline so browsers allow programmatic play.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (d.bgPlaying) void v.play().catch(() => {});
    else v.pause();
  }, [d.bgPlaying, d.bgSrc]);

  /** Cycle the frame to the NEXT beat COLUMN — lands at the end of that column
   *  (new subIndex) and repositions to the grid cell. */
  const cycleBeat = () => {
    const cur = (beat === "none" ? "hook" : beat) as Beat;
    const next = BEAT_COLUMNS[(BEAT_COLUMNS.indexOf(cur) + 1) % BEAT_COLUMNS.length];
    const me = rf.getNode(id);
    if (!me?.parentId) { update({ beat: next, subIndex: 0 }); return; }
    const sub = framesInBeat(rf.getNodes() as never, me.parentId, next).length;
    update({ beat: next, subIndex: sub });
    rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { x: columnX(BEAT_COLUMNS.indexOf(next)), y: rowY(sub) } } : n)));
  };

  /** Delete the frame but KEEP its cards (spec): reparent children to the frame's
   *  lesson (offset by the frame's position so they stay put), then drop the
   *  frame — ONE undoable command. */
  const deleteFrame = () => {
    const me = rf.getNode(id);
    if (!me) { remove(); return; }
    const kids = rf.getNodes().filter((n) => n.parentId === id);
    const frameSnap = structuredClone(me);
    const kidSnaps = kids.map((k) => structuredClone(k));
    const framePos = me.position;
    const newParent = me.parentId;
    bus.dispatch({
      label: "delete frame (keep cards)",
      do: () =>
        rf.setNodes((nds) =>
          nds
            .filter((n) => n.id !== id)
            .map((n) => (n.parentId === id ? { ...n, parentId: newParent, position: { x: n.position.x + framePos.x, y: n.position.y + framePos.y } } : n)),
        ),
      undo: () =>
        rf.setNodes((nds) => {
          const base = nds.some((n) => n.id === id) ? nds : [...nds, structuredClone(frameSnap)];
          return base.map((n) => {
            const ks = kidSnaps.find((k) => k.id === n.id);
            return ks ? { ...n, parentId: ks.parentId, position: { ...ks.position } } : n;
          });
        }),
    });
    if (isCurrent) nav.exit();
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const btn = "nodrag grid h-5 w-5 place-items-center rounded";

  return (
    <div
      className="group/frame relative h-full w-full rounded-lg"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={(e) => { e.stopPropagation(); nav.enter(id); }}
      style={{
        minWidth: 320,
        minHeight: 180,
        background: meta.tint,
        border: `1.5px solid ${selected || isCurrent ? meta.color : meta.edge}`,
        boxShadow: isCurrent ? `0 0 0 2px ${meta.color}, 0 0 26px -8px ${meta.color}` : selected ? `0 0 20px -10px ${meta.color}` : "none",
      }}
    >
      {/* BACKGROUND ANIMATION — a trimmed loop plays behind every card at the
          author-set opacity; pointer-events-none so the stage still enters on
          double-click. Keyed by src so switching loops remounts the element. */}
      {bgLoop && (
        <video
          ref={videoRef}
          key={bgLoop.id}
          className="pointer-events-none absolute inset-0 h-full w-full rounded-lg object-cover"
          style={{ opacity: bgOpacity }}
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={`${bgLoop.base}.webm`} type="video/webm" />
          <source src={`${bgLoop.base}.mp4`} type="video/mp4" />
        </video>
      )}
      <ConnectionDots color={meta.color} />
      {/* aspect-LOCKED 16:9 resize (handles on hover) */}
      <NodeResizer
        isVisible={showChrome}
        keepAspectRatio
        minWidth={320}
        minHeight={180}
        lineStyle={{ borderColor: meta.color }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: meta.color, border: "none" }}
        onResizeEnd={(_, p) => {
          const before = { w: d.w, h: d.h };
          const sz = frame169(Math.max(320, p.width));
          const apply = (w: number, h: number) =>
            rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, width: w, height: h, data: { ...n.data, w, h } } : n)));
          bus.dispatch({ label: "resize frame", do: () => apply(sz.w, sz.h), undo: () => apply(before.w, before.h) });
        }}
      />

      {/* HEADER — click to ENTER; carries the beat·row chip, title + nav chrome.
          data-frame-chrome so FILM mode hides it completely (FG4). */}
      <div
        data-frame-chrome
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ borderBottom: `1px solid ${meta.edge}` }}
        onClick={(e) => { e.stopPropagation(); nav.enter(id); }}
        title="Enter this frame (fit the camera to it)"
      >
        <span className="shrink-0 rounded px-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: meta.color, border: `1px solid ${meta.edge}` }}>
          {meta.label} {(d.subIndex ?? 0) + 1}
        </span>
        <span className="min-w-0 flex-1 text-[12px] font-bold" style={{ color: "#F4EFE6" }} onClick={(e) => e.stopPropagation()}>
          <EditableText value={d.title ?? ""} onChange={(v) => update({ title: v })} placeholder="Frame title" />
        </span>
        <span className={`flex items-center gap-0.5 transition-opacity ${showChrome ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {bgLoop && (
            <button className={btn} style={{ color: d.bgPlaying ? meta.color : NEON.text }} title={d.bgPlaying ? "Pause the background loop" : "Play the background loop"} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); update({ bgPlaying: !d.bgPlaying }); }}>
              {d.bgPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          )}
          <button className={btn} style={{ color: bgLoop ? meta.color : NEON.text }} title="Background animation" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setBgMenu((v) => !v); }}><Film className="h-3 w-3" /></button>
          <button className={btn} style={{ color: nav.canStep(id, -1) ? NEON.text : NEON.borderSoft }} title="Move frame earlier (reorder)" disabled={!nav.canStep(id, -1)} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); nav.reorder(id, -1); }}><ChevronLeft className="h-3.5 w-3.5" /></button>
          <button className={btn} style={{ color: nav.canStep(id, 1) ? NEON.text : NEON.borderSoft }} title="Move frame later (reorder)" disabled={!nav.canStep(id, 1)} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); nav.reorder(id, 1); }}><ChevronRight className="h-3.5 w-3.5" /></button>
          <button className={btn} style={{ color: meta.color }} title="Cycle beat tag (Hook · Teach · Model-Practice · Check)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); cycleBeat(); }}><Tag className="h-3 w-3" /></button>
          <button className={btn} style={{ color: NEON.text }} title="Enter frame" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); nav.enter(id); }}><Maximize2 className="h-3 w-3" /></button>
          <button className={btn} style={{ color: NEON.red }} title="Delete frame (its cards go loose in the lesson)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); deleteFrame(); }}><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>

      {/* BACKGROUND PICKER — loop chooser + opacity slider (author-facing). nodrag/
          nowheel so the slider works; stops propagation so clicks don't enter. */}
      {bgMenu && (
        <div
          className="nodrag nowheel absolute right-2 top-9 z-[6] w-52 rounded-lg p-2 text-[11px]"
          style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, color: NEON.text, boxShadow: "0 12px 30px -12px rgba(0,0,0,0.7)" }}
          onPointerDown={stop}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Background loop</div>
          <div className="flex flex-wrap gap-1">
            <button className="rounded px-2 py-1 font-semibold" style={{ background: !d.bgSrc ? meta.color : "transparent", color: !d.bgSrc ? "#0B1322" : NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => update({ bgSrc: undefined, bgPlaying: false })}>None</button>
            {FRAME_BG_LOOPS.map((l) => (
              <button key={l.id} className="rounded px-2 py-1 font-semibold" style={{ background: d.bgSrc === l.id ? meta.color : "transparent", color: d.bgSrc === l.id ? "#0B1322" : NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => update({ bgSrc: l.id, bgOpacity: d.bgOpacity ?? FRAME_BG_DEFAULT_OPACITY })}>{l.label}</button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span style={{ color: NEON.muted }}>Opacity</span>
            <input type="range" min={0} max={100} value={Math.round(bgOpacity * 100)} disabled={!bgLoop} className="flex-1 accent-current" onChange={(e) => update({ bgOpacity: Number(e.target.value) / 100 })} />
            <span className="w-8 text-right tabular-nums" style={{ color: NEON.text }}>{Math.round(bgOpacity * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
