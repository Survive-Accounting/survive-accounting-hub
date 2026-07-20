// FRAME node — one shot / one screen / one sitting. A bounded 16:9 stage that
// lives inside a lesson and holds cards (parented, so they move with it). Calm
// bordered stage at rest; chrome (title, beat tag, enter, ‹ ›, ×) on hover. The
// beat is a TAG (hook|teach|model_practice|check|none), not a container — Check
// frames wear the red gate tint. Click the header (or double-click the stage) to
// ENTER: the camera fits the frame exactly (frame bounds = viewport). ‹ › walk
// the lesson's frames; Esc / ⌂ exits.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizer, useReactFlow, type NodeProps } from "@xyflow/react";
import { Clapperboard, Copy, Film, Loader2, Lock, LockOpen, Maximize2, Pause, Play, Plus, Smartphone, Sparkles, StickyNote, Upload, X } from "lucide-react";

import { useCardActions } from "../BaseCard";
import { useCanvasSettings } from "../CanvasSettingsContext";
import { addNodesCmd, bus, compositeCmd, patchDataCmd, type RfLike } from "../commands";
import { blankCard } from "../templates";
import { FRAME_TEMPLATES, placeTemplate, type FrameTemplate } from "../frame-templates";
import { baseTextPxForKind, phoneChecks, PHONE_LANDSCAPE, type PhoneEl } from "../phone-check";
import { cycleScriptState, deriveScriptState, SCRIPT_STATE_META } from "../script-doc";
import { templateById } from "../frame-templates";
import type { FrameContext, VisualSuggestion } from "../suggest-visual";
import { suggestVisualForFrame } from "@/lib/suggest-visual.functions";
import { ConnectionDots } from "../ConnectionDots";
import { FilmStatusChip, TakesPanel, useFileDrop, useFrameTakes } from "../frame-takes";
import { useFrameNav } from "../FrameNavContext";
import { beatColOf, frame169, framesInBeat, framesInLesson, rowY, subIndexOf } from "../frames";
import { EditableText } from "../ui";
import { NEON } from "../theme";
import { WorldBackground } from "../WorldBackground";
import { WORLDS, worldById } from "../worlds";
import { cardId, FRAME_BG_ANCHOR_CSS, FRAME_BG_DEFAULT_OPACITY, FRAME_BG_DEFAULT_ZOOM, FRAME_BG_LOOPS, FRAME_CARD_SCALE, FRAME_H, FRAME_W, type FrameBeat, type FrameBgAnchor, type FrameBox, type LessonBox } from "../types";

/** 9-point anchor grid, row-major for a 3×3 button pad. */
const BG_ANCHORS: FrameBgAnchor[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
export const BEAT_META: Record<FrameBeat, { label: string; color: string; tint: string; edge: string }> = {
  none: { label: "Frame", color: NEON.muted, tint: "rgba(147,160,180,0.035)", edge: "rgba(147,160,180,0.3)" },
  hook: { label: "Hook", color: "#8CC0EE", tint: "rgba(79,163,227,0.05)", edge: "rgba(79,163,227,0.35)" },
  teach: { label: "Teach", color: "#E8B84B", tint: "rgba(252,163,17,0.045)", edge: "rgba(252,163,17,0.35)" },
  model_practice: { label: "Model · Practice", color: "#7EF3C0", tint: "rgba(59,245,160,0.05)", edge: "rgba(59,245,160,0.4)" },
  cram: { label: "Cram", color: "#FF8B9E", tint: "rgba(206,17,38,0.06)", edge: "rgba(206,17,38,0.45)" },
};

/** SEAMLESS LOOP — two stacked <video>s crossfade at the loop boundary so the
 *  restart seam never hard-cuts (the "choppy" Dream loop). The back copy is armed
 *  ~0.7s before the front ends, then we swap and fade — the outgoing tail dissolves
 *  into the incoming head. muted+playsInline so browsers allow programmatic play. */
function BgLoopVideo({ base, playing, style }: { base: string; playing: boolean; style: React.CSSProperties }) {
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState(0);
  const XFADE = 0.7;
  const baseOpacity = typeof style.opacity === "number" ? style.opacity : 1;

  useEffect(() => {
    [a.current, b.current].forEach((v) => { if (!v) return; if (playing) void v.play().catch(() => {}); else v.pause(); });
  }, [playing, base]);

  useEffect(() => {
    const f = (front === 0 ? a : b).current;
    const back = (front === 0 ? b : a).current;
    if (!f || !back) return;
    const onTime = () => {
      if (!f.duration || Number.isNaN(f.duration)) return;
      if (f.currentTime >= f.duration - XFADE) {
        back.currentTime = 0;
        if (playing) void back.play().catch(() => {});
        setFront((x) => (x === 0 ? 1 : 0));
      }
    };
    f.addEventListener("timeupdate", onTime);
    return () => f.removeEventListener("timeupdate", onTime);
  }, [front, playing]);

  const vid = (ref: React.RefObject<HTMLVideoElement | null>, isFront: boolean) => (
    <video
      ref={ref}
      className="absolute inset-0 h-full w-full"
      style={{ ...style, opacity: (isFront ? baseOpacity : 0), transition: `opacity ${XFADE}s linear` }}
      muted
      playsInline
      preload="auto"
    >
      <source src={`${base}.webm`} type="video/webm" />
      <source src={`${base}.mp4`} type="video/mp4" />
    </video>
  );
  return <>{vid(a, front === 0)}{vid(b, front === 1)}</>;
}

export function FrameNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as FrameBox;
  const { update, remove } = useCardActions(id);
  const rf = useReactFlow();
  const nav = useFrameNav();
  const [hover, setHover] = useState(false);
  const [bgMenu, setBgMenu] = useState(false);
  const [phoneCheck, setPhoneCheck] = useState(false); // phone-landscape advisory overlay
  const [suggest, setSuggest] = useState<{ loading: boolean; result: VisualSuggestion | null; error: string | null }>({ loading: false, result: null, error: null }); // ✨ Suggest visual
  const [noteEdit, setNoteEdit] = useState(false); // director note editor open
  const [takesOpen, setTakesOpen] = useState(false); // TAKE BOARD: per-frame takes panel
  const { upload, takesFor } = useFrameTakes();
  const drop = useFileDrop((f) => void upload(id, f)); // drop an OBS clip → Mux
  const takeCount = takesFor(id).length;
  const bgMenuRef = useRef<HTMLDivElement>(null);
  // legacy "check" folds to "cram" so un-migrated scenes still find their meta.
  const beat: FrameBeat = (d.beat as string) === "check" ? "cram" : (d.beat ?? "none");
  const meta = BEAT_META[beat];
  const settings = useCanvasSettings();
  // GLOBAL director note for THIS beat — one note, shown on every frame of the
  // beat (across all lessons). Set by Lee; no default seeding.
  const note = settings.beatNotes?.[beat] ?? "";
  const showChrome = hover || selected;
  const isCurrent = nav.currentFrameId === id;

  // VISUAL WORLD (Phase 2 + per-beat): the frame's own `world`, else this BEAT's
  // lesson default, else the lesson default. (own → beat → lesson → none.)
  const lessonData = (() => { const p = rf.getNode(id)?.parentId; return p ? (rf.getNode(p)?.data as LessonBox | undefined) : undefined; })();
  const beatDef = lessonData?.worldByBeat?.[beat];
  const worldId = d.world ?? beatDef?.world ?? lessonData?.worldDefault;
  const worldPreset = worldById(worldId);
  const worldInten = d.world ? d.worldIntensity : beatDef?.world ? beatDef.intensity : lessonData?.worldDefaultIntensity;
  const worldMot = d.world ? d.worldMotion : beatDef?.world ? beatDef.motion : lessonData?.worldDefaultMotion;
  // FRAME CODE (#lesson.frame) — Lee's identifier: the lesson's number + this
  // frame's 1-based ordinal in the lesson's film order. Replaces the "HOOK 1" chip.
  const frameCode = (() => {
    const p = rf.getNode(id)?.parentId;
    const lessonNum = (lessonData as { pathOrder?: number } | undefined)?.pathOrder ?? 1;
    if (!p) return `#${lessonNum}.1`;
    const order = framesInLesson(rf.getNodes() as never, p);
    const i = order.findIndex((f) => f.id === id);
    return `#${lessonNum}.${i < 0 ? 1 : i + 1}`;
  })();

  // PHONE-LANDSCAPE CHECK (Phase 6) — advisory only. Build lightweight element
  // rects from the frame's child card nodes (position + size × card scale) and run
  // the pure checks. Never blocks; never writes.
  const estCardH = (k: string) => (k === "heading" ? 70 : k === "note" || k === "memo" || k === "text" ? 120 : k === "list" ? 210 : 180);
  const phoneEls: PhoneEl[] = phoneCheck
    ? rf.getNodes().filter((n) => n.parentId === id).map((n) => {
        const cd = n.data as { kind?: string; w?: number; h?: number; scale?: number };
        const kind = cd.kind ?? n.type ?? "card";
        const cs = typeof cd.scale === "number" ? cd.scale : FRAME_CARD_SCALE;
        return {
          id: n.id, kind, label: kind,
          x: n.position.x, y: n.position.y,
          w: (n.width ?? cd.w ?? 240) * cs,
          h: (n.height ?? cd.h ?? estCardH(kind)) * cs,
          textPx: baseTextPxForKind(kind) * cs,
        } as PhoneEl;
      })
    : [];
  const phoneFlags = phoneCheck ? phoneChecks({ frameW: d.w ?? FRAME_W, frameH: d.h ?? FRAME_H, elements: phoneEls }) : [];
  const phoneWarnCount = phoneFlags.filter((f) => f.level === "warn").length;

  const bgLoop = d.bgSrc ? FRAME_BG_LOOPS.find((l) => l.id === d.bgSrc) : undefined;
  const bgOpacity = d.bgOpacity ?? FRAME_BG_DEFAULT_OPACITY;
  const bgFit = d.bgFit ?? "cover";
  const bgZoom = d.bgZoom ?? FRAME_BG_DEFAULT_ZOOM;
  const bgAnchor = d.bgAnchor ?? "center";
  const bgAnchorCss = FRAME_BG_ANCHOR_CSS[bgAnchor];
  // The background/framing menu closes on Escape (consumed in CAPTURE so the
  // route's Escape ladder doesn't also fire and zoom the canvas out) OR on any
  // click outside it. Fixes the "menu gets stuck" bug.
  useEffect(() => {
    if (!bgMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setBgMenu(false); } };
    const onDown = (e: PointerEvent) => { const t = e.target as HTMLElement; if (!bgMenuRef.current?.contains(t) && !t.closest("[data-bg-toggle]")) setBgMenu(false); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("pointerdown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("pointerdown", onDown, true); };
  }, [bgMenu]);

  /** Delete the frame but KEEP its cards (spec): reparent children to the frame's
   *  lesson (offset by the frame's position so they stay put), then drop the
   *  frame — and REFLOW the beat column so every frame BELOW slides up one row
   *  (subIndex − 1 + new grid Y). ONE undoable command. */
  const deleteFrame = () => {
    const me = rf.getNode(id);
    if (!me) { remove(); return; }
    const kids = rf.getNodes().filter((n) => n.parentId === id);
    const frameSnap = structuredClone(me);
    const kidSnaps = kids.map((k) => structuredClone(k));
    const framePos = me.position;
    const newParent = me.parentId;
    // frames below me in the same beat column — reflow them up by one row
    const myBeat = beatColOf(me as never);
    const mySub = subIndexOf(me as never);
    const below = newParent
      ? framesInBeat(rf.getNodes() as never, newParent, myBeat).filter((s) => s.id !== id && subIndexOf(s) > mySub)
      : [];
    const belowSnaps = below.map((s) => structuredClone(s as never)) as { id: string; position: { x: number; y: number }; data: Record<string, unknown> }[];
    bus.dispatch({
      label: "delete frame (keep cards)",
      do: () =>
        rf.setNodes((nds) =>
          nds
            .filter((n) => n.id !== id)
            .map((n) => {
              if (n.parentId === id) return { ...n, parentId: newParent, position: { x: n.position.x + framePos.x, y: n.position.y + framePos.y } };
              if (below.some((s) => s.id === n.id)) { const ns = subIndexOf(n as never) - 1; return { ...n, position: { x: n.position.x, y: rowY(ns) }, data: { ...n.data, subIndex: ns } }; }
              return n;
            }),
        ),
      undo: () =>
        rf.setNodes((nds) => {
          const base = nds.some((n) => n.id === id) ? nds : [...nds, structuredClone(frameSnap)];
          return base.map((n) => {
            const ks = kidSnaps.find((k) => k.id === n.id);
            if (ks) return { ...n, parentId: ks.parentId, position: { ...ks.position } };
            const bs = belowSnaps.find((s) => s.id === n.id);
            if (bs) return { ...n, position: { ...bs.position }, data: { ...n.data, subIndex: (bs.data as { subIndex?: number }).subIndex } };
            return n;
          });
        }),
    });
    if (isCurrent) nav.exit();
  };

  // WORLD picker actions (Phase 2). Apply resets the sliders to the chosen
  // preset's tasteful defaults; None clears the frame's own world (it then
  // inherits the lesson default, if any).
  const applyWorld = (wid: string | undefined) => {
    if (!wid) { update({ world: undefined }); return; }
    const p = worldById(wid);
    update({ world: wid, worldIntensity: p?.defaultIntensity, worldMotion: p?.motionIntensity, worldSeed: d.worldSeed ?? 1 });
  };
  const applyWorldToLesson = () => {
    const me = rf.getNode(id);
    if (!me?.parentId) return;
    const patch = { world: d.world, worldIntensity: d.worldIntensity, worldMotion: d.worldMotion, worldSeed: d.worldSeed };
    const frames = rf.getNodes().filter((n) => n.type === "frame" && n.parentId === me.parentId);
    const cmds = frames.map((f) => patchDataCmd(rf as unknown as RfLike, f.id, patch, "world→lesson")).filter((c): c is NonNullable<typeof c> => !!c);
    const cmd = compositeCmd(cmds, "apply world to all frames");
    if (cmd) bus.dispatch(cmd);
  };
  const setLessonDefaultWorld = () => {
    const me = rf.getNode(id);
    if (!me?.parentId) return;
    const c = patchDataCmd(rf as unknown as RfLike, me.parentId, { worldDefault: d.world, worldDefaultIntensity: d.worldIntensity, worldDefaultMotion: d.worldMotion }, "lesson world default");
    if (c) bus.dispatch(c);
  };
  // PER-BEAT default: every frame of THIS beat in the lesson (that has no world of
  // its own) inherits this — subtle Hook/Teach/Practice/Cram differentiation.
  const setBeatDefaultWorld = () => {
    const me = rf.getNode(id);
    if (!me?.parentId || beat === "none") return;
    const cur = (rf.getNode(me.parentId)?.data as LessonBox | undefined)?.worldByBeat ?? {};
    const next = { ...cur, [beat]: { world: d.world, intensity: d.worldIntensity, motion: d.worldMotion } };
    const c = patchDataCmd(rf as unknown as RfLike, me.parentId, { worldByBeat: next }, `world→${beat} beat`);
    if (c) bus.dispatch(c);
  };

  // FRAME TEMPLATE (Phase 5, additive) — spawn a template's EXISTING card kinds,
  // parented to this frame at safe placements. The spawned cards are ordinary,
  // fully editable; the frame is tagged with the template's visualType for the
  // Visual Mix summary. One undoable command.
  const applyTemplate = (t: FrameTemplate) => {
    const fw = d.w ?? FRAME_W;
    const fh = d.h ?? FRAME_H;
    const nodes = placeTemplate(t, fw, fh).map((pl) => ({
      id: cardId(pl.kind),
      type: pl.kind,
      parentId: id,
      position: { x: pl.x, y: pl.y },
      data: { ...blankCard(pl.kind), w: pl.w } as Record<string, unknown>,
    }));
    bus.dispatch(addNodesCmd(rf as unknown as RfLike, nodes, `apply ${t.name} template`));
    update({ visualType: t.visualType });
    setBgMenu(false);
  };

  // ✨ SUGGEST VISUAL (Phase 5 #13) — ask the AI Gateway to recommend a World +
  // template from this frame's beat/title/script/cards. Read-only: it only shows
  // a suggestion; applying it uses the same undoable actions above.
  const runSuggest = async () => {
    setSuggest({ loading: true, result: null, error: null });
    const ctx: FrameContext = {
      title: d.title,
      beat: String(beat),
      entry: d.script?.entry,
      beats: d.script?.beats,
      exit: d.script?.exit,
      cardKinds: rf.getNodes().filter((n) => n.parentId === id).map((n) => ((n.data as { kind?: string }).kind ?? n.type ?? "card") as string),
    };
    try {
      const { suggestion } = await suggestVisualForFrame({ data: ctx });
      setSuggest({ loading: false, result: suggestion, error: null });
    } catch (e) {
      setSuggest({ loading: false, result: null, error: e instanceof Error ? e.message : "Suggestion failed" });
    }
  };
  const applySuggestedWorld = (s: VisualSuggestion) => { if (!s.world) return; applyWorld(s.world); if (s.worldIntensity != null) update({ worldIntensity: s.worldIntensity }); };
  const applySuggestedTemplate = (s: VisualSuggestion) => { const t = s.template ? templateById(s.template) : undefined; if (t) applyTemplate(t); };

  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const btn = "nodrag grid h-5 w-5 place-items-center rounded";

  return (
    <div
      className="group/frame relative h-full w-full rounded-lg"
      data-beat={beat}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={() => nav.enter(id)}
      {...drop.props}
      style={{
        minWidth: 320,
        minHeight: 180,
        background: meta.tint,
        border: `1.5px solid ${selected || isCurrent ? meta.color : meta.edge}`,
        boxShadow: isCurrent ? `0 0 0 2px ${meta.color}, 0 0 26px -8px ${meta.color}` : selected ? `0 0 20px -10px ${meta.color}` : "none",
      }}
    >
      {/* VISUAL WORLD (Phase 2) — a rendered atmosphere behind ALL cards. Deepest
          layer (z-0, pointer-events-none) so cards, chrome and the spotlight
          overlay always read on top. Frame's own world wins; else lesson default. */}
      {worldPreset && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
          <WorldBackground worldId={worldPreset.id} intensity={worldInten} motion={worldMot} seed={d.worldSeed} />
        </div>
      )}
      {/* BACKGROUND ANIMATION — a trimmed loop plays behind every card at the
          author-set opacity; pointer-events-none so the stage still enters on
          double-click. Wrapper CLIPS (overflow-hidden) so zoom overflow crops
          inside the 16:9 stage. fit (cover/contain) + zoom (scale) + anchor
          (object-position AND transform-origin) let Lee compose the focal
          content without re-cutting the file. Keyed by src so switching remounts. */}
      {bgLoop && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
          <BgLoopVideo
            key={bgLoop.id}
            base={bgLoop.base}
            playing={!!d.bgPlaying}
            style={{
              opacity: bgOpacity,
              objectFit: bgFit,
              objectPosition: bgAnchorCss,
              transform: `scale(${bgZoom / 100})`,
              transformOrigin: bgAnchorCss,
            }}
          />
        </div>
      )}
      {/* BACKGROUND SCRIM (Lee) — a black wash over the loop so cards read on top of
          a busy backdrop. Above the video, below the cards (cards are DOM siblings). */}
      {bgLoop && (d.bgScrim ?? 0) > 0 && (
        <div className="pointer-events-none absolute inset-0 rounded-lg" style={{ background: "#000", opacity: Math.min(0.92, d.bgScrim ?? 0) }} />
      )}
      <ConnectionDots color={meta.color} />
      {/* FRAMES ARE STATIC — resize handles disabled (the frame is a fixed 16:9
          stage; size/position never change, only the cards inside move). */}
      <NodeResizer
        isVisible={false}
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
        className="relative flex items-center gap-1.5 rounded-t-lg px-2 py-1"
        style={{ borderBottom: `1px solid ${meta.edge}`, background: "rgba(9,13,26,0.82)", backdropFilter: "blur(2px)" }}
        onClick={(e) => { e.stopPropagation(); nav.enter(id); }}
        title="Enter this frame (fit the camera to it)"
      >
        {/* FRAME CODE (#lesson.frame) — the beat is already the grid column, so no
            "HOOK 1" chip (Lee's call); this identifies the frame instead. */}
        <span className="shrink-0 rounded px-1 text-[10px] font-bold tabular-nums" style={{ color: meta.color, border: `1px solid ${meta.edge}` }}>
          {frameCode}
        </span>
        {/* TAKE BOARD: film status chip (authoring chrome — header hides in film) */}
        <FilmStatusChip frameId={id} status={d.filmStatus ?? "unfilmed"} small />
        {/* SCRIPT STATE (Phase 3): the script's writing status — click to cycle
            draft → review → final. "Empty" is derived and inert. Authoring chrome. */}
        {(() => {
          const st = deriveScriptState(d.script);
          const m = SCRIPT_STATE_META[st];
          return (
            <button
              className="shrink-0 rounded px-1 text-[8.5px] font-bold uppercase tracking-wider"
              title={st === "empty" ? "No script yet — write it in the Script editor" : `Script: ${m.label} — click to cycle draft · review · final`}
              style={{ color: m.color, border: `1px solid ${m.color}66`, opacity: st === "empty" ? 0.5 : 1 }}
              onPointerDown={stop}
              onClick={(e) => { e.stopPropagation(); if (st === "empty") return; update({ script: { ...(d.script ?? {}), scriptState: cycleScriptState(st) } }); }}
            >
              {m.short} {m.label}
            </button>
          );
        })()}
        <span className="min-w-0 flex-1 text-[12px] font-bold" style={{ color: "#F4EFE6" }} onClick={(e) => e.stopPropagation()}>
          <EditableText value={d.title ?? ""} onChange={(v) => update({ title: v })} placeholder="title (optional)" openSeq={(data as { _editSeq?: number })._editSeq} />
        </span>
        <span className={`flex items-center gap-0.5 transition-opacity ${showChrome ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          {bgLoop && (
            <button className={btn} style={{ color: d.bgPlaying ? meta.color : NEON.text }} title={d.bgPlaying ? "Pause the background loop" : "Play the background loop"} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); update({ bgPlaying: !d.bgPlaying }); }}>
              {d.bgPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
          )}
          <button data-bg-toggle className={btn} style={{ color: bgLoop || d.world || lessonData?.worldDefault ? meta.color : NEON.text }} title="Frame visuals — world, background loop, layout template" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setBgMenu((v) => !v); }}><Film className="h-3 w-3" /></button>
          <button className={btn} style={{ color: phoneCheck ? (phoneWarnCount ? "#FF8B9E" : "#7EF3C0") : NEON.text }} title="Phone-landscape check — flags text/edges that won't read on a phone" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setPhoneCheck((v) => !v); }}><Smartphone className="h-3 w-3" /></button>
          {/* TAKE BOARD: review the frame's uploaded takes (latest plays inline) */}
          <button className={btn} style={{ color: takeCount ? meta.color : NEON.text }} title={takeCount ? `Takes (${takeCount}) — review the latest clip` : "Takes — drop an OBS clip on the frame to upload"} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setTakesOpen((v) => !v); }}>
            <Clapperboard className="h-3 w-3" />
          </button>
          {/* DIRECTOR NOTE — GLOBAL per beat: the note shows on every frame of this
              beat, in every lesson. Filming chrome, hidden in film. */}
          <button className={btn} style={{ color: note ? meta.color : NEON.text }} title={note ? `Edit the ${meta.label} director note (shown on every ${meta.label} frame)` : `Add a director note for every ${meta.label} frame`} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); setNoteEdit((v) => !v); }}>
            <StickyNote className="h-3 w-3" />
          </button>
          {/* LOCK (item 2): frames ship locked so they stop getting nudged. */}
          <button className={btn} style={{ color: d.posLock ? meta.color : NEON.text }} title={d.posLock ? "Frame locked (no accidental drags) — click to unlock" : "Lock the frame in place"} onPointerDown={stop} onClick={(e) => { e.stopPropagation(); update({ posLock: !d.posLock }); }}>
            {d.posLock ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
          </button>
          {/* DUPLICATE (PROMPT 1): deep-copy this frame to the next slot in its beat;
              Shift-click to pick a target lesson + beat. Cards, script, @marks,
              world + scenario bindings copy; deck membership does not. */}
          <button className={btn} style={{ color: NEON.text }} title="Duplicate frame → next slot in this beat (Shift-click: choose lesson + beat)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); if (e.shiftKey) nav.duplicateDialog(id); else nav.duplicate(id); }}><Copy className="h-3 w-3" /></button>
          <button className={btn} style={{ color: NEON.text }} title="Enter frame" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); nav.enter(id); }}><Maximize2 className="h-3 w-3" /></button>
          <button className={btn} style={{ color: NEON.red }} title="Delete frame (its cards go loose in the lesson)" onPointerDown={stop} onClick={(e) => { e.stopPropagation(); deleteFrame(); }}><X className="h-3.5 w-3.5" /></button>
        </span>
      </div>

      {/* BACKGROUND PICKER — loop chooser + opacity slider (author-facing). nodrag/
          nowheel so the slider works; stops propagation so clicks don't enter. */}
      {bgMenu && createPortal((
        // A FIXED right-side drawer (portaled to <body>) so it ALWAYS sits above
        // every card + header (Lee's call), never gets clipped by the frame, and
        // fits the screen height with its own scroll. Sticky header carries an
        // obvious X. See [[panel-popouts-directors-monitor]] for the portal pattern.
        <div
          ref={bgMenuRef}
          className="nodrag nowheel fixed right-3 top-16 z-[200] flex max-h-[calc(100vh-5.5rem)] w-72 flex-col rounded-xl text-[11px]"
          style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text, boxShadow: "0 20px 55px -12px rgba(0,0,0,0.85)" }}
          onPointerDown={stop}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {/* STICKY HEADER — title + obvious close (Lee couldn't find how to
              dismiss it, and the body ran off-screen). */}
          <div className="flex items-center gap-2 rounded-t-xl border-b px-2.5 py-2" style={{ borderColor: NEON.borderSoft, background: NEON.panelSolid }}>
            <Film className="h-3.5 w-3.5" style={{ color: meta.color }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: NEON.text }}>Frame visuals</span>
            <button
              className="ml-auto grid h-6 w-6 place-items-center rounded-md"
              style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }}
              title="Close (Esc)"
              onClick={() => setBgMenu(false)}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* SCROLL BODY — the whole menu scrolls inside the fixed drawer. */}
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {/* VISUAL WORLD (Phase 2) — thumbnail library + intensity/motion/seed +
              lesson-level actions. Atmosphere behind the cards; never a hero. */}
          <div className="mb-1 flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Visual world</span>
            {(d.world ?? lessonData?.worldDefault) && <span className="text-[8.5px]" style={{ color: NEON.muted }}>{d.world ? "frame" : "lesson"}</span>}
          </div>
          <div className="grid grid-cols-3 gap-1">
            <button title="No world" className="relative grid place-items-center overflow-hidden rounded" style={{ aspectRatio: "16/9", border: `1px solid ${!worldId ? meta.color : NEON.borderSoft}`, background: "#0A0F22", color: NEON.muted }} onClick={() => applyWorld(undefined)}>
              <span className="text-[8px] font-semibold">None</span>
            </button>
            {WORLDS.map((w) => (
              <button key={w.id} title={`${w.name} — ${w.blurb}`} className="relative overflow-hidden rounded" style={{ aspectRatio: "16/9", border: `1px solid ${d.world === w.id ? meta.color : NEON.borderSoft}` }} onClick={() => applyWorld(w.id)}>
                <WorldBackground worldId={w.id} intensity={w.defaultIntensity} motion={0} seed={1} />
                <span className="absolute inset-x-0 bottom-0 truncate px-0.5 text-[7px] font-semibold" style={{ color: "#C9D6F5", background: "rgba(4,7,16,0.5)" }}>{w.name}</span>
              </button>
            ))}
          </div>
          {d.world ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span style={{ color: NEON.muted }}>Intensity</span>
                <input type="range" min={0} max={60} value={Math.round((d.worldIntensity ?? worldPreset?.defaultIntensity ?? 0.3) * 100)} className="flex-1 accent-current" onChange={(e) => update({ worldIntensity: Number(e.target.value) / 100 })} />
                <span className="w-8 text-right tabular-nums">{Math.round((d.worldIntensity ?? worldPreset?.defaultIntensity ?? 0.3) * 100)}%</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span style={{ color: NEON.muted }}>Motion</span>
                <input type="range" min={0} max={100} value={Math.round((d.worldMotion ?? worldPreset?.motionIntensity ?? 0.15) * 100)} className="flex-1 accent-current" onChange={(e) => update({ worldMotion: Number(e.target.value) / 100 })} />
                <span className="w-8 text-right tabular-nums">{Math.round((d.worldMotion ?? worldPreset?.motionIntensity ?? 0.15) * 100)}%</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <button className="rounded px-1.5 py-0.5" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} title="Nudge the atmosphere layout" onClick={() => update({ worldSeed: (d.worldSeed ?? 1) + 1 })}>Seed ↻ {d.worldSeed ?? 1}</button>
                <button className="rounded px-1.5 py-0.5" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }} title="Reset intensity/motion to the preset defaults" onClick={() => applyWorld(worldPreset?.id)}>Reset</button>
              </div>
              <div className="mt-1 flex gap-1">
                <button className="flex-1 rounded px-1 py-0.5 font-semibold" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} title="Give every frame in this lesson this world" onClick={applyWorldToLesson}>Apply to lesson</button>
                <button className="flex-1 rounded px-1 py-0.5 font-semibold" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} title="Make this the lesson's default world (frames without their own inherit it)" onClick={setLessonDefaultWorld}>Set default</button>
              </div>
              {beat !== "none" && (
                <button className="mt-1 w-full rounded px-1 py-0.5 font-semibold" style={{ border: `1px solid ${meta.edge}`, color: meta.color }} title={`Make this the default for every ${meta.label} frame in this lesson (subtle per-beat differentiation)`} onClick={setBeatDefaultWorld}>Default for all {meta.label} frames</button>
              )}
            </>
          ) : (
            (lessonData?.worldDefault) && <p className="mt-1 text-[9px] leading-snug" style={{ color: NEON.muted }}>Inherits the lesson default. Pick a world above to override just this frame.</p>
          )}

          {/* ✨ SUGGEST VISUAL (Phase 5 #13) — AI recommends a world + template
              from this frame's beat/script/cards. Read-only until you Apply. */}
          <button
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded px-2 py-1 text-[10.5px] font-semibold"
            style={{ border: `1px solid ${NEON.border}`, color: NEON.yellow, opacity: suggest.loading ? 0.6 : 1 }}
            disabled={suggest.loading}
            title="Ask the AI to suggest a World + layout for this frame"
            onClick={runSuggest}
          >
            {suggest.loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {suggest.loading ? "Thinking…" : "Suggest visual"}
          </button>
          {suggest.error && <p className="mt-1 text-[9px] leading-snug" style={{ color: "#FF8B9E" }}>{suggest.error}</p>}
          {suggest.result && (
            <div className="mt-1.5 rounded-md p-1.5" style={{ background: NEON.bg2, border: `1px solid ${NEON.borderSoft}` }}>
              {suggest.result.rationale && <p className="mb-1 text-[9.5px] italic leading-snug" style={{ color: NEON.muted }}>{suggest.result.rationale}</p>}
              <div className="flex gap-1">
                <button
                  className="flex-1 rounded px-1 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                  style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                  disabled={!suggest.result.world}
                  title={suggest.result.world ? `Apply world: ${worldById(suggest.result.world)?.name}` : "No world suggested"}
                  onClick={() => applySuggestedWorld(suggest.result!)}
                >
                  World: {suggest.result.world ? worldById(suggest.result.world)?.name : "—"}
                </button>
                <button
                  className="flex-1 rounded px-1 py-0.5 text-[10px] font-semibold disabled:opacity-40"
                  style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                  disabled={!suggest.result.template}
                  title={suggest.result.template ? `Spawn the ${templateById(suggest.result.template)?.name} template` : "No template suggested"}
                  onClick={() => applySuggestedTemplate(suggest.result!)}
                >
                  Layout: {suggest.result.template ? templateById(suggest.result.template)?.name : "—"}
                </button>
              </div>
            </div>
          )}

          <div className="my-2 border-t" style={{ borderColor: NEON.borderSoft }} />

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
          <div className="mt-1 flex items-center gap-2">
            <span style={{ color: NEON.muted }} title="Black wash over the loop so cards read on top">Card scrim</span>
            <input type="range" min={0} max={90} value={Math.round((d.bgScrim ?? 0) * 100)} disabled={!bgLoop} className="flex-1 accent-current" onChange={(e) => update({ bgScrim: Number(e.target.value) / 100 })} />
            <span className="w-8 text-right tabular-nums" style={{ color: NEON.text }}>{Math.round((d.bgScrim ?? 0) * 100)}%</span>
          </div>

          {/* FRAMING — fit (fill/fit) · zoom · 9-point anchor. Compose without re-cutting. */}
          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft, opacity: bgLoop ? 1 : 0.4, pointerEvents: bgLoop ? "auto" : "none" }}>
            <div className="mb-1 font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Framing</div>
            <div className="flex items-center gap-2">
              <span style={{ color: NEON.muted }}>Scale</span>
              <div className="flex overflow-hidden rounded" style={{ border: `1px solid ${NEON.borderSoft}` }}>
                {(["cover", "contain"] as const).map((f) => (
                  <button key={f} className="px-2 py-0.5 font-semibold" style={{ background: bgFit === f ? meta.color : "transparent", color: bgFit === f ? "#0B1322" : NEON.text }} onClick={() => update({ bgFit: f })}>{f === "cover" ? "Fill" : "Fit"}</button>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span style={{ color: NEON.muted }}>Zoom</span>
              <input type="range" min={50} max={200} value={Math.round(bgZoom)} className="flex-1 accent-current" onChange={(e) => update({ bgZoom: Number(e.target.value) })} />
              <span className="w-9 text-right tabular-nums" style={{ color: NEON.text }}>{Math.round(bgZoom)}%</span>
            </div>
            <div className="mt-2 flex items-start gap-2">
              <span className="pt-0.5" style={{ color: NEON.muted }}>Anchor</span>
              <div className="grid grid-cols-3 gap-0.5" style={{ width: 60 }}>
                {BG_ANCHORS.map((a) => (
                  <button
                    key={a}
                    title={a.replace("-", " ")}
                    className="grid h-4 w-4 place-items-center rounded-sm"
                    style={{ background: bgAnchor === a ? meta.color : "transparent", border: `1px solid ${bgAnchor === a ? meta.color : NEON.borderSoft}` }}
                    onClick={() => update({ bgAnchor: a })}
                  >
                    <span className="h-1 w-1 rounded-full" style={{ background: bgAnchor === a ? "#0B1322" : NEON.muted }} />
                  </button>
                ))}
              </div>
              <button className="ml-auto self-start rounded px-1.5 py-0.5 text-[10px]" style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }} onClick={() => update({ bgFit: "cover", bgZoom: FRAME_BG_DEFAULT_ZOOM, bgAnchor: "center" })}>Reset</button>
            </div>
          </div>

          {/* CINEMATIC CAMERA (Lee) — camera-only pushes while filming. Both default
              OFF, per-frame. Ambient = slow Ken-Burns on entry (stage frames);
              Spotlight push = the camera dollies toward whatever you Spotlight. */}
          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-1 font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Cinematic camera</div>
            <button
              className="flex w-full items-center justify-between rounded px-2 py-1 font-semibold"
              style={{ border: `1px solid ${d.ambientPush ? meta.color : NEON.borderSoft}`, color: d.ambientPush ? meta.color : NEON.text }}
              onClick={() => update({ ambientPush: !d.ambientPush })}
            >
              <span>Ambient push (Ken-Burns)</span><span>{d.ambientPush ? "on" : "off"}</span>
            </button>
            <button
              className="mt-1 flex w-full items-center justify-between rounded px-2 py-1 font-semibold"
              style={{ border: `1px solid ${d.spotlightPush ? meta.color : NEON.borderSoft}`, color: d.spotlightPush ? meta.color : NEON.text }}
              onClick={() => update({ spotlightPush: !d.spotlightPush })}
            >
              <span>Spotlight push (dolly-in)</span><span>{d.spotlightPush ? "on" : "off"}</span>
            </button>
            <p className="mt-1 text-[9px] leading-snug" style={{ color: NEON.muted }}>Camera only — never moves cards. Motion plays in film; authoring shows the framing.</p>
          </div>

          {/* LAYOUT TEMPLATE (Phase 5) — spawn a safe starting layout of existing
              card kinds into this frame. The spawned cards are fully editable. */}
          <div className="mt-2 border-t pt-2" style={{ borderColor: NEON.borderSoft }}>
            <div className="mb-1 font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Layout template</div>
            <div className="grid grid-cols-2 gap-1">
              {FRAME_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  title={`${t.blurb} — spawns ${t.placements.map((p) => p.kind).join(" + ")}`}
                  className="rounded px-1.5 py-1 text-left text-[10px] font-semibold"
                  style={{ border: `1px solid ${d.visualType === t.visualType ? meta.color : NEON.borderSoft}`, color: NEON.text }}
                  onClick={() => applyTemplate(t)}
                >
                  {t.name}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[9px] leading-snug" style={{ color: NEON.muted }}>Spawns editable cards at safe spots. Add on top of what's here.</p>
          </div>
          </div>
        </div>
      ), document.body)}

      {/* PHONE-LANDSCAPE CHECK (Phase 6) — advisory overlay: the phone-safe region
          + a non-blocking list of warnings. data-frame-chrome so film hides it;
          stores nothing. */}
      {phoneCheck && (
        <div data-frame-chrome className="pointer-events-none absolute inset-0 z-[7]">
          <div className="absolute rounded" style={{ inset: "5%", border: "1.5px dashed rgba(126,243,192,0.55)" }} />
          <div className="absolute left-2 top-9 max-w-[74%] rounded-md p-1.5 text-[9px]" style={{ background: "rgba(6,10,20,0.86)", border: `1px solid ${meta.edge}`, color: NEON.text, pointerEvents: "auto" }} onPointerDown={stop} onClick={(e) => e.stopPropagation()}>
            <div className="mb-0.5 flex items-center gap-1 font-bold uppercase tracking-wider">
              <Smartphone className="h-2.5 w-2.5" style={{ color: "#7EF3C0" }} />
              <span style={{ color: "#7EF3C0" }}>Phone check</span>
              <span style={{ color: NEON.muted }}>{PHONE_LANDSCAPE.w}×{PHONE_LANDSCAPE.h} · advisory</span>
            </div>
            {phoneFlags.length === 0 ? (
              <div style={{ color: NEON.muted }}>Reads fine on a phone 👍</div>
            ) : (
              <>
                {phoneFlags.slice(0, 6).map((f, i) => (
                  <div key={i} className="flex gap-1 leading-tight">
                    <span style={{ color: f.level === "warn" ? "#FF8B9E" : NEON.muted }}>{f.level === "warn" ? "⚠" : "·"}</span>
                    <span>{f.message}</span>
                  </div>
                ))}
                {phoneFlags.length > 6 && <div style={{ color: NEON.muted }}>+{phoneFlags.length - 6} more</div>}
              </>
            )}
          </div>
        </div>
      )}

      {/* TAKE BOARD: drop-target overlay while a file drags over the stage */}
      {drop.over && (
        <div data-frame-chrome className="pointer-events-none absolute inset-0 z-[8] grid place-items-center rounded-lg" style={{ background: "rgba(11,19,34,0.72)", border: `2px dashed ${meta.color}` }}>
          <div className="flex items-center gap-2 text-[13px] font-bold" style={{ color: meta.color }}>
            <Upload className="h-4 w-4" /> Drop the OBS clip — upload take {takeCount + 1}
          </div>
        </div>
      )}
      {/* TAKE BOARD: the frame's takes panel (authoring only — filming chrome) */}
      {takesOpen && (
        <div data-frame-chrome>
          <TakesPanel frameId={id} onClose={() => setTakesOpen(false)} />
        </div>
      )}

      {/* DIRECTOR NOTE strip — GLOBAL per beat. Bottom of the stage, FILMING
          CHROME (data-frame-chrome → film mode hides it). Amber sticky-note look
          so it reads as an instruction, never student content. */}
      {beat !== "none" && (note || noteEdit) && (
        <div
          data-frame-chrome
          className="nodrag nowheel absolute inset-x-2 bottom-2 z-[5] rounded-md px-2 py-1"
          style={{ background: "rgba(20,16,4,0.82)", border: "1px solid rgba(252,163,17,0.5)", boxShadow: "0 6px 18px -8px rgba(0,0,0,0.7)" }}
          onPointerDown={stop}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => { e.stopPropagation(); setNoteEdit(true); }}
        >
          <div className="mb-0.5 flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-widest" style={{ color: "#F5D48F" }}>
            <StickyNote className="h-2.5 w-2.5" /> director note · every {meta.label} frame
          </div>
          {noteEdit ? (
            <textarea
              autoFocus
              rows={2}
              className="w-full resize-none rounded bg-black/30 px-1 py-0.5 text-[11px] leading-snug outline-none"
              style={{ color: "#FCE9C6", border: "1px solid rgba(252,163,17,0.4)" }}
              defaultValue={note}
              placeholder={`Note for every ${meta.label} frame…`}
              onBlur={(e) => { settings.setBeatNote(beat, e.target.value.trim()); setNoteEdit(false); }}
              onKeyDown={(e) => { if (e.key === "Escape") setNoteEdit(false); e.stopPropagation(); }}
            />
          ) : (
            <div className="cursor-text whitespace-pre-wrap text-[11px] leading-snug" style={{ color: "#FCE9C6" }} title="Double-click to edit">{note}</div>
          )}
        </div>
      )}

      {/* BIG-PICTURE "+ / clone" — sits just BELOW the frame on hover so it's easy
          to add a blank frame or duplicate THIS frame into the next sub-row of this
          beat (Lee's call). data-frame-chrome → film mode hides it. */}
      <div
        data-frame-chrome
        className="absolute -bottom-9 left-1/2 z-[9] flex -translate-x-1/2 items-center gap-1 rounded-full px-1 py-1 opacity-0 transition-opacity group-hover/frame:opacity-100"
        style={{ background: NEON.panelSolid, border: `1px solid ${meta.edge}`, boxShadow: "0 8px 22px -10px rgba(0,0,0,0.75)" }}
        onPointerDown={stop}
        onDoubleClick={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="grid h-6 w-6 place-items-center rounded-full" style={{ color: meta.color }} title="Add a blank frame below (same beat)" onClick={() => nav.addBelow(id)}><Plus className="h-3.5 w-3.5" /></button>
        <button className="grid h-6 w-6 place-items-center rounded-full" style={{ color: NEON.text }} title="Duplicate this frame below (same beat)" onClick={() => nav.duplicate(id)}><Copy className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
