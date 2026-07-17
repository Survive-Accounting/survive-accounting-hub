// /study/canvas — PRESENT CANVAS v1. Infinite dark-neon whiteboard for filming and live
// tutoring. Cards spawn PREPARED (from the scenario-doc library) or BLANK (improvisation
// deck); everything is editable inline and scene-local. See docs in the handoff.
//
// Hotkeys: c = clean screen · space = reveal next hidden element on the selected card ·
// f / double-click = focus-zoom a card · Esc = back to full view · Delete = remove selection.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Background,
  BackgroundVariant,
  ConnectionLineType,
  ConnectionMode,
  MiniMap,
  NodeResizer,
  ReactFlow,
  ReactFlowProvider,
  useNodes,
  useReactFlow,
  useStore,
  useStoreApi,
  useUpdateNodeInternals,
  type Connection,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Columns3, Download, Film, Flag, FlaskConical, FileText, Frame, Grid3x3, Layers, LayoutTemplate, ListOrdered, Map as MapIcon, Milestone, Minimize2, PanelTop, Plus, Projector, Save, ScrollText, FolderOpen, FilePlus2, Settings2, Shrink, Upload, Video as VideoIcon, X } from "lucide-react";

import { chapterLabel, courseLabel, fetchCourseOptions, fetchJeBrowserTree } from "@/lib/je-api";
import { createFolder, deleteFolder, deleteScene, duplicateScene, listCourseAccounts, listFolders, listScenes, loadScene, moveSceneToFolder, renameFolder, saveScene, type SceneListRow } from "@/lib/canvas.functions";
import { retryUnlessMigrationHint } from "@/lib/pg-errors";
import { ManageAccountsDialog } from "@/components/canvas/ManageAccountsDialog";
import { ManageCourseDialog } from "@/components/canvas/ManageCourseDialog";
import { NEON } from "@/components/canvas/theme";
import { blankCard, formulaAle } from "@/components/canvas/templates";
import { buildLibrary } from "@/components/canvas/library";
import { Palette } from "@/components/canvas/Palette";
import { JeCardNode } from "@/components/canvas/cards/JeCardNode";
import { ScheduleCardNode } from "@/components/canvas/cards/ScheduleCardNode";
import {
  CeqCardNode, ComputationCardNode, MemorizeCardNode, TAccountCardNode,
} from "@/components/canvas/cards/OtherCards";
import { VideoCardNode } from "@/components/canvas/cards/VideoCardNode";
import { ListCardNode } from "@/components/canvas/cards/ListCardNode";
import { ImageCardNode, uploadImageFile } from "@/components/canvas/cards/ImageCardNode";
import { LegendCardNode } from "@/components/canvas/cards/LegendCardNode";
import { OutlineCardNode } from "@/components/canvas/cards/OutlineCardNode";
import { FormulaCardNode } from "@/components/canvas/cards/FormulaCardNode";
import { NoteCardNode } from "@/components/canvas/cards/NoteCardNode";
import { HeadingCardNode } from "@/components/canvas/cards/HeadingCardNode";
import { MemoCardNode } from "@/components/canvas/cards/MemoCardNode";
import { BEAT_META, FrameNode } from "@/components/canvas/cards/FrameNode";
import { FrameNavContext, useFrameNav, type FrameNav } from "@/components/canvas/FrameNavContext";
import { DecksContext } from "@/components/canvas/DecksContext";
import { SpotlightCtx, useSpotlightController, type FocusDimMode } from "@/components/canvas/SpotlightContext";
import { revealedTargetId } from "@/components/canvas/spotlight";
import { absRectOf, beatColOf, beatNeighborFrame, BEAT_COLUMNS, blankFrameData, columnX, frameCellLabel, frameCompositionGuides, framesInBeat, framesInLesson, frameWalkNext, frameWalkPrev, GRID, gridLayout, isWrapUpName, lessonCellSize, lessonGrid, lessonRollFrame, nextSubIndex, REGION, regionLayout, RESERVED_ROWS, rowY, SCAFFOLD_BEATS, subIndexOf, subNeighborFrame, type GuideWeight } from "@/components/canvas/frames";
import { BridgeCardNode, GateNode, TextElementNode } from "@/components/canvas/cards/elements";
import { LegendHud } from "@/components/canvas/LegendHud";
import { OutlinePanel } from "@/components/canvas/OutlinePanel";
import { loadPreviewStudent, savePreviewStudent, TOKEN_KEYS, type PreviewStudent } from "@/components/canvas/variables";
import { cardId, clampScale, FRAME_CARD_SCALE, FRAME_H, FRAME_W, isContainerType, isElementKind, type Beat, type CardBase, type CardData, type CardNode, type DeckDef, type FormulaCard, type FrameBox, type JeCard, type JeLine, type LegendCard, type LessonBox, type ListCard, type ScheduleCard, type ComputationCard, type ZoneBox } from "@/components/canvas/types";
import { EditableText } from "@/components/canvas/ui";
import { deckLessonFor, nextStageOrder, useCardActions } from "@/components/canvas/BaseCard";
import { withFaceDown } from "@/components/canvas/CardBack";
import { Deck, categoryOf, isTucked, nextTucked } from "@/components/canvas/Deck";
import { lastDealtCross, lastDealtInFrame, lessonIdOf, nextTuckedCross, nextTuckedInFrame } from "@/components/canvas/deck-logic";
import { addNodesCmd, bus, compositeCmd, moveNodesCmd, patchDataCmd, removeNodesCmd, type RfLike } from "@/components/canvas/commands";
import { isExplicitGroupDrag } from "@/components/canvas/drag-select";
import { useKeymap, type KeyBinding } from "@/components/canvas/keymap";
import { migrateDeckFields, migrateEdges, migrateElementDeckFields, migrateFrameGrid, migrateFrameLocks, migrateJeMemos, migrateLegendSlips, sanitizeSceneNodes } from "@/components/canvas/scene-io";
import { migrateZTiers, nextZ } from "@/components/canvas/zorder";
import { addEdgeCmd, lineIdOfHandle, memoOfHandle, resolveConnection, type EdgeLike } from "@/components/canvas/arrows";
import { ArrowEdge, ARROW_EDGE_CSS } from "@/components/canvas/ArrowEdge";
import { ConnectionDots, CONNECTION_DOTS_CSS } from "@/components/canvas/ConnectionDots";
import { SkeletonLayer } from "@/components/canvas/SkeletonLayer";
import { GhostCellsLayer } from "@/components/canvas/GhostCellsLayer";
import { FrameGridOverlay } from "@/components/canvas/FrameGridOverlay";
import { BackstageStage } from "@/components/canvas/BackstageStage";
import { SurviveBackdrop } from "@/components/canvas/SurviveBackdrop";
import { CueSheet } from "@/components/canvas/CueSheet";
import { ScriptEditor } from "@/components/canvas/ScriptEditor";
import { FrameTakesProvider, LessonMediaBar, MuxBanner, RetrimAllIntrosButton, TakeBoardCell } from "@/components/canvas/frame-takes";
import { RecorderSpike } from "@/components/canvas/RecorderSpike";
import { TeleprompterOverlay, type PrompterCorner } from "@/components/canvas/Teleprompter";
import { hubLayout, plateForCourse } from "@/components/canvas/hub-layout";
import { LessonPublishControl } from "@/components/canvas/lesson-publish";
import { cueIsDone, currentRevealCount, deriveFrameCues, nextCueIndex, orderedCues, revealPatchForCount, type CueState } from "@/components/canvas/cue-sheet";
import { onMissingMigration } from "@/lib/missing-migration";
import { CanvasSettingsContext, JE_INDENT_DEFAULT, JE_WIDTH_DEFAULT, type CanvasSettings } from "@/components/canvas/CanvasSettingsContext";
import { JE_PRESETS, groupCoa, hopToEnd, memosOf, normalizePreset, type JePreset } from "@/components/canvas/je-logic";
import { listSnapshots, loadSnapshot, snapshotScene, type SnapshotListRow } from "@/lib/canvas.functions";
import { downloadText, parseImport, sceneToOutline, type ImportPreview } from "@/components/canvas/export";
import { KeymapOverlay } from "@/components/canvas/KeymapOverlay";
import { CardTapPulse, CARD_CURSOR_CSS, ClickRipples, CursorSpotlight, FILM_MODE_CSS, FrameArmCue, type ArmState } from "@/components/canvas/FilmOverlays";
import { CameraBubble } from "@/components/canvas/CameraBubble";
import { BrandBar, BrandWatermark } from "@/components/canvas/BrandBar";

export const Route = createFileRoute("/study_/canvas")({
  ssr: false, // React Flow is client-only; nothing here needs SSR (unlinked playground)
  head: () => ({ meta: [{ title: "Present Canvas — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <ReactFlowProvider>
      <PresentCanvas />
    </ReactFlowProvider>
  ),
});

// ---------------------------------------------------------------------------
// Zone node — labeled translucent group box. Cards dropped inside get parentId
// (React Flow then moves them with the zone natively).
// ---------------------------------------------------------------------------
function ZoneNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as ZoneBox & { editMode?: boolean };
  const { update, remove } = useCardActions(id);
  const rf = useReactFlow();

  /** Grid-align this zone's children with even gaps — ONE undoable bus command. */
  const tidyZone = (zoneId: string) => {
    const zone = rf.getNode(zoneId);
    if (!zone) return;
    const children = rf.getNodes().filter((n) => n.parentId === zoneId && !n.hidden);
    if (children.length === 0) return;
    const GAP = 24;
    const PAD_TOP = 44; // clears the zone label row
    const zw = (zone.data as unknown as ZoneBox).w ?? zone.width ?? 520;
    const wOf = (n: CardNode) => n.measured?.width ?? ((n.data as unknown as CardBase).w as number | undefined) ?? 300;
    const hOf = (n: CardNode) => n.measured?.height ?? ((n.data as unknown as CardBase).h as number | undefined) ?? 170;
    let x = GAP;
    let y = PAD_TOP;
    let rowH = 0;
    const moves: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    for (const n of [...children].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)) {
      const w = wOf(n as CardNode);
      const h = hOf(n as CardNode);
      if (x > GAP && x + w > zw - GAP) { x = GAP; y += rowH + GAP; rowH = 0; }
      moves.push({ id: n.id, from: { ...n.position }, to: { x, y } });
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
    const c = moveNodesCmd(rf as unknown as RfLike, moves, "tidy zone");
    if (c) bus.dispatch(c);
  };
  return (
    <div
      className="h-full w-full rounded-2xl"
      style={{
        width: d.w, height: d.h,
        background: "rgba(79,163,227,0.05)",
        border: `1.5px solid ${selected ? NEON.cyan : "rgba(79,163,227,0.30)"}`,
        boxShadow: selected ? `0 0 24px -8px ${NEON.cyan}` : "none",
      }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.cyan }}>
        <EditableText value={d.label} onChange={(v) => update({ label: v })} placeholder="Zone" />
        {/* teaching-path position: deck deal order + the space-walk follow it when set */}
        <span
          className="zone-actions rounded px-1 text-[9px] font-bold normal-case tabular-nums"
          style={{
            border: `1px solid ${typeof d.pathOrder === "number" ? "rgba(252,163,17,0.55)" : NEON.borderSoft}`,
            color: typeof d.pathOrder === "number" ? NEON.yellow : NEON.muted,
          }}
          title="Teaching path position — deck deals this zone's cards in this order"
        >
          path{" "}
          <EditableText
            value={typeof d.pathOrder === "number" ? String(d.pathOrder) : ""}
            onChange={(v) => {
              const n = parseInt(v, 10);
              update({ pathOrder: Number.isFinite(n) ? n : null });
            }}
            placeholder="–"
          />
        </span>
        <button
          className="nodrag zone-actions text-[10px] normal-case opacity-50 hover:opacity-100"
          title="Tidy: grid-align this zone's cards with even gaps (one undo step)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => tidyZone(id)}
        >
          tidy
        </button>
        <button className="nodrag zone-actions text-[10px] normal-case opacity-50 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={remove}>
          ✕
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson node — the finer grouping tier (WORLD → REGION(zone) → LESSON → CARD).
// A LESSON IS A CALM BAND AT REST (L1): a labeled colored strip — title + a
// subtle brand tint — and nothing else, so a filmed board stays clean. ALL
// chrome (path badge, resize handles, ×, fit, beat/check toggles) reveals only
// on hover during authoring. Consecutive lessons alternate two brand tints
// (warm / navy) so the path segments read distinctly; a CHECK lesson wears a
// red gate tint — "this is where I get tested." Interior cards flow LEFT→RIGHT
// through four OPTIONAL beat guides (Hook · Teach · Model-Practice · Check),
// soft guides not hard containers. Cards inside ride parentId, so dragging the
// lesson moves them natively. (Campus-color theming is a World-v1 skin on top
// of this alternating-tint system — see docs/CANVAS-ROADMAP.md.)
// ---------------------------------------------------------------------------
const LESSON_TINTS = {
  warm: { fill: "rgba(252,163,17,0.09)", edge: "rgba(252,163,17,0.32)", edgeOn: NEON.yellow, glow: NEON.yellow, ink: "#E8B84B" },
  navy: { fill: "rgba(79,163,227,0.08)", edge: "rgba(79,163,227,0.30)", edgeOn: NEON.cyan, glow: NEON.cyan, ink: "#8CC0EE" },
  check: { fill: "rgba(206,17,38,0.10)", edge: "rgba(206,17,38,0.45)", edgeOn: "#E0284A", glow: "#E0284A", ink: "#FF8B9E" },
} as const;
const BEAT_LABELS = ["Hook", "Teach", "Model · Practice", "Check"] as const;
/** Stable parity for a lesson with no pathOrder, so the two tints still alternate. */
const lessonHash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) | 0; return Math.abs(h); };

function LessonNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LessonBox;
  const { update, remove } = useCardActions(id);
  const rf = useReactFlow();
  const nodes = useNodes(); // subscribe: the display label follows a contained heading live
  const frameNav = useFrameNav();
  const [hover, setHover] = useState(false);
  const showChrome = hover || selected; // chrome (incl. resize handles) is hover-only
  // manual resize (V2): NodeResizer writes live; the end commits ONE bus command
  const resizeStart = useRef<{ pos: { x: number; y: number }; w: number; h: number } | null>(null);

  const headingText = (() => {
    const h = nodes.find((n) => n.parentId === id && n.type === "heading");
    if (!h) return null;
    const raw = ((h.data as Record<string, unknown>).text as string) ?? "";
    const m = /^(.*?)\s*\[[^\]]+\]\s*$/s.exec(raw); // strip the "[sub]" tail
    return (m ? m[1] : raw).trim() || null;
  })();

  // ALTERNATING TINT (L1): pathOrder parity picks warm/navy; a CHECK lesson is
  // always the red gate. pathOrder-less lessons fall back to a stable id hash.
  const parity = (typeof d.pathOrder === "number" ? d.pathOrder : lessonHash(id)) % 2;
  const tint = d.check ? LESSON_TINTS.check : parity === 0 ? LESSON_TINTS.warm : LESSON_TINTS.navy;

  /** FIT TO CONTENTS (optional button — never automatic): shrink-wrap the box
   *  around its children (+padding) in ONE undo step. Children keep their
   *  absolute spots: the box moves, their rel coords shift. */
  const hug = () => {
    const me = rf.getNode(id);
    if (!me) return;
    const children = rf.getNodes().filter((n) => n.parentId === id && !n.hidden);
    if (children.length === 0) return;
    const PAD = 24;
    const PAD_TOP = 48; // clears the label row
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of children) {
      const w = c.measured?.width ?? ((c.data as unknown as CardBase).w as number | undefined) ?? 300;
      const h = c.measured?.height ?? ((c.data as unknown as CardBase).h as number | undefined) ?? 170;
      minX = Math.min(minX, c.position.x);
      minY = Math.min(minY, c.position.y);
      maxX = Math.max(maxX, c.position.x + w);
      maxY = Math.max(maxY, c.position.y + h);
    }
    const dx = minX - PAD;
    const dy = minY - PAD_TOP;
    const after = { pos: { x: me.position.x + dx, y: me.position.y + dy }, w: Math.round(maxX - minX + PAD * 2), h: Math.round(maxY - minY + PAD_TOP + PAD) };
    const before = { pos: { ...me.position }, w: d.w, h: d.h, kids: children.map((c) => ({ id: c.id, pos: { ...c.position } })) };
    const apply = (pos: { x: number; y: number }, w: number, h: number, kidPos: (n: { id: string; position: { x: number; y: number } }) => { x: number; y: number }) =>
      rf.setNodes((nds) =>
        nds.map((n) => {
          if (n.id === id) return { ...n, position: { ...pos }, width: w, height: h, data: { ...n.data, w, h } };
          if (n.parentId === id) return { ...n, position: kidPos(n) };
          return n;
        }),
      );
    bus.dispatch({
      label: "fit lesson to contents",
      do: () => apply(after.pos, after.w, after.h, (n) => ({ x: n.position.x - dx, y: n.position.y - dy })),
      undo: () => apply(before.pos, before.w, before.h, (n) => before.kids.find((k) => k.id === n.id)?.pos ?? n.position),
    });
  };

  const stop = (e: React.PointerEvent) => e.stopPropagation();
  const chromeBtn = "nodrag zone-actions grid h-4 w-4 place-items-center rounded opacity-60 hover:opacity-100";

  return (
    <div
      className="group/lesson relative h-full w-full rounded-2xl"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // size comes from the NODE (width/height) — NodeResizer drives it live;
        // data.w/h stay synced on resize-end for the parenting hit test
        minWidth: 180,
        minHeight: 56,
        background: tint.fill,
        border: `1.5px solid ${selected ? tint.edgeOn : tint.edge}`,
        boxShadow: selected ? `0 0 24px -8px ${tint.glow}` : "none",
      }}
    >
      {/* lessons connect too: card↔lesson, lesson↔lesson (V2) */}
      <ConnectionDots color={tint.edgeOn} />
      {/* the lesson is a DESIGNED SPACE: resize it by hand (handles on hover) */}
      <NodeResizer
        isVisible={showChrome}
        minWidth={180}
        minHeight={56}
        lineStyle={{ borderColor: tint.edgeOn }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: tint.edgeOn, border: "none" }}
        onResizeStart={() => {
          const me = rf.getNode(id);
          if (me) resizeStart.current = { pos: { ...me.position }, w: d.w, h: d.h };
        }}
        onResizeEnd={(_, p) => {
          const before = resizeStart.current;
          resizeStart.current = null;
          if (!before) return;
          const apply = (pos: { x: number; y: number }, w: number, h: number) =>
            rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { ...pos }, width: w, height: h, data: { ...n.data, w, h } } : n)));
          bus.dispatch({
            label: "resize lesson",
            // floor at the min even if the resizer reports garbage — a lesson
            // below header size is unrecoverable by hand
            do: () => apply({ x: p.x, y: p.y }, Math.max(180, Math.round(p.width)), Math.max(56, Math.round(p.height))),
            undo: () => apply(before.pos, before.w, before.h),
          });
        }}
      />

      {/* BEAT GUIDES (L2): four L→R sections with faint dividers + small labels —
          a soft guide for authoring AND students, never hard containers. Shown
          whenever enabled (toggle lives in the hover chrome); sits BEHIND cards. */}
      {(d as { beats?: boolean }).beats && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 top-9 z-0">
          {[1, 2, 3].map((k) => (
            <div key={k} className="absolute top-0 bottom-0" style={{ left: `${(k / 4) * 100}%`, width: 1, background: tint.edge }} />
          ))}
          {BEAT_LABELS.map((lab, k) => (
            <div
              key={lab}
              className="absolute top-0 text-[9px] font-bold uppercase tracking-wider"
              style={{ left: `calc(${(k / 4) * 100}% + 8px)`, color: NEON.muted, opacity: 0.7 }}
            >
              {lab}
            </div>
          ))}
        </div>
      )}

      {/* GRID COLUMN HEADERS (FG2): the 4 beats as labelled columns; the Check
          column keeps its red treatment. Empty beats show a placeholder cell so
          a beat never renders as a gap. Hidden in film (data-frame-chrome). */}
      <div data-frame-chrome className="pointer-events-none absolute inset-0 z-0">
        {BEAT_COLUMNS.map((b, ci) => {
          const cbm = BEAT_META[b];
          const col = framesInBeat(nodes as never, id, b);
          return (
            <div key={b} className="absolute" style={{ left: columnX(ci), top: GRID.lessonHeaderH, width: FRAME_W }}>
              <div className="rounded px-1.5 py-0.5 text-[13px] font-bold uppercase tracking-wider" style={{ color: cbm.color, background: b === "check" ? "rgba(206,17,38,0.10)" : "transparent", display: "inline-block" }}>{cbm.label}</div>
              {col.length === 0 && (
                <div className="mt-2 grid place-items-center rounded-lg text-[12px] italic" style={{ width: FRAME_W, height: FRAME_H, border: `1.5px dashed ${cbm.edge}`, background: cbm.tint, color: NEON.muted }}>
                  empty {cbm.label} — press ↓ inside a frame to add
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* THE CALM BAND LABEL — the only thing visible at rest (title + tint). */}
      <div className="relative z-[1] flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em]" style={{ color: tint.ink }}>
        {d.check && <Flag className="h-3 w-3 shrink-0" style={{ color: tint.ink }} />}
        {headingText ? (
          <span title="Label follows the heading inside this lesson">{headingText}</span>
        ) : (
          <EditableText value={d.label} onChange={(v) => update({ label: v })} placeholder="Lesson" />
        )}
        {/* LESSON MEDIA — intro/outro clip upload + preview by the title (always
            visible: the dropped/empty state is the whole point). */}
        <LessonMediaBar lessonId={id} />
        {/* CHROME — hover/selected only (L1); pointer-events off while hidden so
            invisible controls can't be clicked. */}
        <span className={`flex items-center gap-1 transition-opacity ${showChrome ? "opacity-100" : "pointer-events-none opacity-0"}`}>
          <span
            className="zone-actions rounded px-1 text-[9px] font-bold normal-case tabular-nums"
            style={{ border: `1px solid ${typeof d.pathOrder === "number" ? tint.edgeOn : NEON.borderSoft}`, color: typeof d.pathOrder === "number" ? tint.ink : NEON.muted }}
            title="Lesson path position within its region"
          >
            path{" "}
            <EditableText
              value={typeof d.pathOrder === "number" ? String(d.pathOrder) : ""}
              onChange={(v) => { const n = parseInt(v, 10); update({ pathOrder: Number.isFinite(n) ? n : null }); }}
              placeholder="–"
            />
          </span>
          <button
            className={chromeBtn}
            title={(d as { beats?: boolean }).beats ? "Hide the beat guides (Hook · Teach · Model-Practice · Check)" : "Show beat guides (Hook · Teach · Model-Practice · Check)"}
            onPointerDown={stop}
            onClick={() => update({ beats: !(d as { beats?: boolean }).beats })}
          >
            <Columns3 className="h-3 w-3" style={{ color: (d as { beats?: boolean }).beats ? tint.ink : NEON.muted }} />
          </button>
          <button
            className={chromeBtn}
            title={d.check ? "Not a Check gate" : "Mark as a Check gate — red, where students get tested"}
            onPointerDown={stop}
            onClick={() => update({ check: !d.check })}
          >
            <Flag className="h-3 w-3" style={{ color: d.check ? "#FF8B9E" : NEON.muted }} />
          </button>
          <button className={chromeBtn} title="Add a frame (a 16:9 shot) to this lesson" onPointerDown={stop} onClick={() => frameNav.addFrame(id)}>
            <Plus className="h-3 w-3" style={{ color: NEON.cyan }} />
          </button>
          <button className={chromeBtn} title="Fit to contents (one undo step)" onPointerDown={stop} onClick={hug}>
            <Shrink className="h-3 w-3" />
          </button>
          <button className={chromeBtn} title="Delete lesson" onPointerDown={stop} onClick={remove}>
            <X className="h-3 w-3" />
          </button>
        </span>
      </div>
    </div>
  );
}

// Every card kind rides the face-down gate (zone/lesson boxes can't be decked).
const nodeTypes = {
  je: withFaceDown(JeCardNode),
  schedule: withFaceDown(ScheduleCardNode),
  computation: withFaceDown(ComputationCardNode),
  taccount: withFaceDown(TAccountCardNode),
  ceq: withFaceDown(CeqCardNode),
  memorize: withFaceDown(MemorizeCardNode),
  note: withFaceDown(NoteCardNode),
  video: withFaceDown(VideoCardNode),
  list: withFaceDown(ListCardNode),
  image: withFaceDown(ImageCardNode),
  legend: withFaceDown(LegendCardNode),
  formula: withFaceDown(FormulaCardNode),
  outline: withFaceDown(OutlineCardNode),
  // ELEMENTS: plain — never face-down (elements don't deck)
  heading: HeadingCardNode,
  text: TextElementNode,
  memo: MemoCardNode,
  paygate: GateNode,
  signupgate: GateNode,
  // BRIDGE placeholders: deckable cards
  asklee: withFaceDown(BridgeCardNode),
  submitproblem: withFaceDown(BridgeCardNode),
  shareinvite: withFaceDown(BridgeCardNode),
  zone: ZoneNode,
  lesson: LessonNode,
  frame: FrameNode,
};

// ONE edge renderer, registered under "smoothstep" so existing scenes' edges
// upgrade in place: arrowhead, ×-on-select, pulse, straight-while-dragging.
const edgeTypes = { smoothstep: ArrowEdge };

// ---------------------------------------------------------------------------
// Spacebar stepper — reveal the NEXT hidden element on a card, reading order.
// Returns a patched data object, or null when nothing left to reveal.
// ---------------------------------------------------------------------------
function stepReveal(data: CardData): Partial<CardData> | null {
  if (data.kind === "je") {
    const d = data as JeCard;
    const i = d.lines.findIndex((l) => l.hidden);
    if (i === -1) return null;
    return { lines: d.lines.map((l, j) => (j === i ? { ...l, hidden: false } : l)) } as Partial<CardData>;
  }
  if (data.kind === "computation") {
    const d = data as ComputationCard;
    const i = d.steps.findIndex((s) => s.hidden);
    if (i === -1) return null;
    return { steps: d.steps.map((s, j) => (j === i ? { ...s, hidden: false } : s)) } as Partial<CardData>;
  }
  if (data.kind === "schedule") {
    const d = data as ScheduleCard;
    for (let r = 0; r < d.rows.length; r++) {
      for (let c = 0; c < d.rows[r].length; c++) {
        if (d.rows[r][c].hidden) {
          const rows = d.rows.map((row, ri) => row.map((cl, ci) => (ri === r && ci === c ? { ...cl, hidden: false } : cl)));
          return { rows } as Partial<CardData>;
        }
      }
    }
    return null;
  }
  if (data.kind === "list") {
    const d = data as ListCard;
    if (d.descHidden) return { descHidden: false } as Partial<CardData>; // description reveals first (it's above the rows)
    const i = d.rows.findIndex((r) => r.hidden);
    if (i === -1) return null;
    return { rows: d.rows.map((r, j) => (j === i ? { ...r, hidden: false } : r)) } as Partial<CardData>;
  }
  if (data.kind === "formula") {
    const d = data as FormulaCard;
    const i = d.segments.findIndex((s) => s.hidden);
    if (i === -1) return null;
    return { segments: d.segments.map((s, j) => (j === i ? { ...s, hidden: false } : s)) } as Partial<CardData>;
  }
  if (data.kind === "legend") {
    // STORY SLIPS reveal one at a time; the flavor line lands LAST (item 3).
    const d = data as LegendCard;
    const i = (d.slips ?? []).findIndex((s) => s.hidden);
    if (i !== -1) return { slips: d.slips.map((s, j) => (j === i ? { ...s, hidden: false } : s)) } as Partial<CardData>;
    if (d.flavorHidden) return { flavorHidden: false } as Partial<CardData>;
    return null;
  }
  return null;
}

/** SPACE-WALK REVERSE (item 3): re-hide the LAST reveal — the structural inverse
 *  of stepReveal. Hides the last currently-VISIBLE hideable item (list rows undo
 *  bottom→top, then the description last, mirroring the forward order). Returns
 *  null when nothing is visible-and-hideable, so Shift+Space falls through to
 *  untuck / step-back. (An un-prepped card that has never been hidden will hide
 *  its last item here — the honest inverse; forward Space restores it.) */
function stepRevealBack(data: CardData): Partial<CardData> | null {
  if (data.kind === "je") {
    const d = data as JeCard;
    for (let i = d.lines.length - 1; i >= 0; i--) if (!d.lines[i].hidden) return { lines: d.lines.map((l, j) => (j === i ? { ...l, hidden: true } : l)) } as Partial<CardData>;
    return null;
  }
  if (data.kind === "computation") {
    const d = data as ComputationCard;
    for (let i = d.steps.length - 1; i >= 0; i--) if (!d.steps[i].hidden) return { steps: d.steps.map((s, j) => (j === i ? { ...s, hidden: true } : s)) } as Partial<CardData>;
    return null;
  }
  if (data.kind === "schedule") {
    const d = data as ScheduleCard;
    for (let r = d.rows.length - 1; r >= 0; r--)
      for (let c = d.rows[r].length - 1; c >= 0; c--)
        if (d.rows[r][c].v !== "" && !d.rows[r][c].hidden)
          return { rows: d.rows.map((row, ri) => row.map((cl, ci) => (ri === r && ci === c ? { ...cl, hidden: true } : cl))) } as Partial<CardData>;
    return null;
  }
  if (data.kind === "list") {
    const d = data as ListCard;
    for (let i = d.rows.length - 1; i >= 0; i--) if (!d.rows[i].hidden) return { rows: d.rows.map((r, j) => (j === i ? { ...r, hidden: true } : r)) } as Partial<CardData>;
    if (d.description && !d.descHidden) return { descHidden: true } as Partial<CardData>; // description hides LAST (it revealed first)
    return null;
  }
  if (data.kind === "formula") {
    const d = data as FormulaCard;
    for (let i = d.segments.length - 1; i >= 0; i--) if (!d.segments[i].hidden) return { segments: d.segments.map((s, j) => (j === i ? { ...s, hidden: true } : s)) } as Partial<CardData>;
    return null;
  }
  if (data.kind === "legend") {
    // reverse of the reveal: hide the flavor FIRST (it revealed last), then slips bottom→top
    const d = data as LegendCard;
    if (d.flavor && !d.flavorHidden) return { flavorHidden: true } as Partial<CardData>;
    for (let i = (d.slips ?? []).length - 1; i >= 0; i--) if (!d.slips[i].hidden) return { slips: d.slips.map((s, j) => (j === i ? { ...s, hidden: true } : s)) } as Partial<CardData>;
    return null;
  }
  return null;
}

/** Prep for filming: hide every hideable element on a card (stepper then walks them). */
function hideAll(data: CardData): Partial<CardData> | null {
  if (data.kind === "je") return { lines: (data as JeCard).lines.map((l) => ({ ...l, hidden: true })) } as Partial<CardData>;
  if (data.kind === "computation") return { steps: (data as ComputationCard).steps.map((s) => ({ ...s, hidden: true })) } as Partial<CardData>;
  if (data.kind === "list") return { descHidden: !!(data as ListCard).description, rows: (data as ListCard).rows.map((r) => ({ ...r, hidden: true })) } as Partial<CardData>;
  if (data.kind === "formula") return { segments: (data as FormulaCard).segments.map((s) => ({ ...s, hidden: true })) } as Partial<CardData>;
  if (data.kind === "legend") {
    const d = data as LegendCard;
    return { slips: (d.slips ?? []).map((s) => ({ ...s, hidden: true })), flavorHidden: !!d.flavor } as Partial<CardData>;
  }
  if (data.kind === "schedule") {
    const d = data as ScheduleCard;
    return { rows: d.rows.map((row) => row.map((cl) => ({ ...cl, hidden: cl.v !== "" ? true : cl.hidden }))) } as Partial<CardData>;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Background config — flat navy, dot grid, or one of the /anim loop videos with
// adjustable opacity. Encoded into the scene's existing `bg` text column as
// "flat" | "grid" | "video|<file>|<opacity 0-100>" so old scenes keep loading.
const BG_VIDEOS = [
  { file: "car-intro.mp4", label: "Car" },
  { file: "dream-intro.mp4", label: "Dream" },
  { file: "space-intro.mp4", label: "Space" },
] as const;

interface BgConfig {
  mode: "flat" | "grid" | "video";
  video: string; // file inside /anim
  opacity: number; // 0..1
}
const BG_DEFAULT: BgConfig = { mode: "grid", video: BG_VIDEOS[2].file, opacity: 0.16 };

// ADD CARD menu — the card kinds Lee spawns while filming (Palette still has the
// full library in the drawer). "formula" routes through formulaAle() for A=L+E.
const ADD_CARD_KINDS: { kind: Parameters<typeof blankCard>[0]; label: string; preset?: Parameters<typeof blankCard>[1] }[] = [
  { kind: "heading", label: "Heading" },
  { kind: "text", label: "Text" },
  { kind: "list", label: "List" },
  { kind: "je", label: "Journal Entry" },
  { kind: "taccount", label: "T-Account" },
  { kind: "note", label: "Note" },
  { kind: "computation", label: "Computation" },
  { kind: "formula", label: "A = L + E" },
  { kind: "legend", label: "Legend" },
  { kind: "schedule", label: "Table", preset: "generic" },
  { kind: "ceq", label: "Question" },
  { kind: "memorize", label: "Memorize" },
  { kind: "image", label: "Image" },
  { kind: "video", label: "Video" },
];

const encodeBg = (c: BgConfig) => (c.mode === "video" ? `video|${c.video}|${Math.round(c.opacity * 100)}` : c.mode);
function decodeBg(s: string | null | undefined): BgConfig | null {
  if (!s) return null;
  if (s === "flat" || s === "grid") return { ...BG_DEFAULT, mode: s };
  if (s.startsWith("video")) {
    const [, video, op] = s.split("|");
    const opacity = op ? Math.min(1, Math.max(0.02, Number(op) / 100)) : BG_DEFAULT.opacity;
    return { mode: "video", video: video || BG_DEFAULT.video, opacity: Number.isNaN(opacity) ? BG_DEFAULT.opacity : opacity };
  }
  return null;
}

// ---------------------------------------------------------------------------
// SCENE TABS: one RF instance; a tab is a full snapshot swapped on switch.
interface TabSnap {
  nodes: CardNode[];
  edges: unknown[];
  viewport: Viewport | null;
  settings: {
    jeCardWidth: number;
    jeIndent: number;
    jePreset: JePreset;
    dealFaceDown: boolean;
    hideFdLabels: boolean;
    focusPalette: boolean;
    courseId: string | null;
    chapterId: string | null;
  };
  bg: BgConfig;
  film: boolean;
  clean: boolean;
  savedAt: string | null;
}
interface TabEntry {
  key: string;
  sceneId: string | null; // null = unsaved untitled
  name: string;
  snap?: TabSnap; // present once visited-and-switched-away
  dirty: boolean;
}

// ---------------------------------------------------------------------------
const LS_KEY = "sa-canvas-fallback-scene";

// GROUP CHROME (PROMPT B), isolated (hardening run): a floating action bar
// above a 2+ card selection. Its OWN component so the transform + nodes
// subscriptions it needs to track pan/zoom + drags live HERE — not on the
// 2500-line route, which previously re-rendered on every pan/zoom frame just
// to reposition this bar. Behavior identical; only the render scope shrank.
function GroupChromeBar() {
  const rf = useReactFlow();
  const nodes = useNodes();
  useStore((s) => s.transform); // re-render the BAR (not the route) on pan/zoom
  const selectedCards = nodes.filter((n) => n.selected && !isContainerType(n.type) && !(n.data as unknown as CardBase).tucked);
  if (selectedCards.length < 2) return null;

  const nds = rf.getNodes();
  let minX = Infinity, minY = Infinity, maxX = -Infinity;
  for (const n of selectedCards) {
    const p = n.parentId ? nds.find((x) => x.id === n.parentId) : null;
    const ax = (p?.position.x ?? 0) + n.position.x;
    const ay = (p?.position.y ?? 0) + n.position.y;
    minX = Math.min(minX, ax); minY = Math.min(minY, ay);
    maxX = Math.max(maxX, ax + (n.measured?.width ?? 280));
  }
  const pos = rf.flowToScreenPosition({ x: (minX + maxX) / 2, y: minY });

  const cloneAll = () => {
    const cur = rf.getNodes();
    const sel = cur.filter((n) => n.selected && !isContainerType(n.type));
    if (sel.length < 2) return;
    const absOf = (n: CardNode) => {
      const p = n.parentId ? cur.find((x) => x.id === n.parentId) : null;
      return { x: (p?.position.x ?? 0) + n.position.x, y: (p?.position.y ?? 0) + n.position.y };
    };
    let maxY = -Infinity, top = Infinity;
    for (const n of sel) { maxY = Math.max(maxY, absOf(n as CardNode).y + (n.measured?.height ?? 170)); top = Math.min(top, absOf(n as CardNode).y); }
    const dy = maxY - top + 48;
    const clones = sel.map((n) => {
      const abs = absOf(n as CardNode);
      const data = structuredClone(n.data) as Record<string, unknown>;
      delete data.deckMember; delete data.tucked; delete data.stageOrder; delete data.deckPos; delete data.deckCategory; delete data.faceDown;
      return { ...n, id: cardId((data.kind as string) ?? "card"), selected: false, parentId: undefined, position: { x: abs.x, y: abs.y + dy }, data };
    });
    bus.dispatch(addNodesCmd(rf as unknown as RfLike, clones, "clone group"));
  };
  const deleteAll = () => {
    const ids = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type)).map((n) => n.id);
    if (ids.length < 2) return;
    if (ids.length > 3 && !window.confirm(`Delete ${ids.length} selected cards? (Ctrl+Z restores)`)) return;
    const c = removeNodesCmd(rf as unknown as RfLike, ids, "delete group");
    if (c) bus.dispatch(c);
  };
  const deckAll = () => {
    const cur = rf.getNodes();
    const sel = cur.filter((n) => n.selected && !isContainerType(n.type) && !isElementKind((n.data as unknown as CardBase).kind));
    if (sel.length === 0) return;
    const base = nextStageOrder(cur);
    const cmds = sel.map((n, i) => {
      const kind = (n.data as unknown as CardBase).kind;
      const entryType = (n.data as Record<string, unknown>).entryType as string | undefined;
      return patchDataCmd(rf as unknown as RfLike, n.id, { deckMember: true, tucked: false, stageOrder: base + i, deckCategory: kind === "je" ? `je:${entryType ?? "standard"}` : kind, deckLessonId: deckLessonFor(rf, n.parentId) }, "add to deck");
    });
    const c = compositeCmd(cmds, "add group to deck");
    if (c) bus.dispatch(c);
  };
  const tuckAll = () => {
    const cur = rf.getNodes();
    const sel = cur.filter((n) => n.selected && !isContainerType(n.type) && !isElementKind((n.data as unknown as CardBase).kind));
    if (sel.length === 0) return;
    const base = nextStageOrder(cur);
    const cmds = sel.map((n, i) => {
      const d = n.data as unknown as CardBase;
      const entryType = (n.data as Record<string, unknown>).entryType as string | undefined;
      return patchDataCmd(rf as unknown as RfLike, n.id, { deckMember: true, tucked: true, stageOrder: d.deckMember ? d.stageOrder : base + i, deckPos: { x: n.position.x, y: n.position.y }, deckCategory: d.kind === "je" ? `je:${entryType ?? "standard"}` : d.kind, deckLessonId: d.deckMember ? (d.deckLessonId ?? deckLessonFor(rf, n.parentId)) : deckLessonFor(rf, n.parentId) }, "tuck into deck");
    });
    const c = compositeCmd(cmds, "tuck group into deck");
    if (c) bus.dispatch(c);
  };

  return (
    <div
      className="absolute z-[45] flex items-center gap-1 rounded-lg px-1.5 py-1"
      style={{ left: pos.x, top: pos.y - 12, transform: "translate(-50%, -100%)", background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 10px 28px -12px rgba(0,0,0,0.7)" }}
    >
      <span className="px-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>{selectedCards.length} cards</span>
      <button className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} title="Clone all — preserved layout, offset below (one undo step)" onClick={cloneAll}>clone</button>
      <button className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: NEON.cyan, border: `1px solid rgba(79,163,227,0.45)` }} title="Add all to the deck (one undo step)" onClick={deckAll}>deck</button>
      <button className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: NEON.cyan, border: `1px solid rgba(79,163,227,0.45)` }} title="Tuck all into the deck (one undo step)" onClick={tuckAll}>tuck</button>
      <button className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: NEON.red, border: "1px solid rgba(255,92,122,0.45)" }} title="Delete all (confirms past 3; one undo step)" onClick={deleteAll}>delete</button>
    </div>
  );
}

// BACKSTAGE (AC1) — the authoring-only pane background. Film + frame interiors
// keep the dark stage; this only dresses the area OUTSIDE frames while composing.
// "dark" reproduces the current dotted navy; "light" is the calmer new default.
type BackstageMode = "cinema" | "dark" | "light" | "gray";
const BACKSTAGE_BG: Record<BackstageMode, string> = {
  // CINEMA: a deep dark-red base; BackstageStage paints the animated studio over it.
  cinema: "radial-gradient(130% 120% at 50% 38%, #45101c 0%, #2a0910 48%, #150406 100%)",
  dark: `${NEON.bg} radial-gradient(rgba(147,160,180,0.16) 1px, transparent 1px) 0 0 / 28px 28px`,
  light: "linear-gradient(160deg, #EEF1F6 0%, #E4E8F0 55%, #DADFEA 100%)",
  gray: "#9AA1AD",
};
const BACKSTAGE_LABEL: Record<BackstageMode, string> = { cinema: "Cinema", dark: "Dark dotted", light: "Light gradient", gray: "Plain gray" };

// Composition-guide render treatment by weight — brand gold, strongest at the
// frame center, faintest at the fifths; the title-safe margin renders dashed.
function guideStyle(weight: GuideWeight): { thick: number; solid: string; dash: string; opacity: number } {
  const G = "252,163,17";
  switch (weight) {
    case "center": return { thick: 2, solid: `rgba(${G},0.95)`, dash: "none", opacity: 1 };
    case "card": return { thick: 1, solid: `rgba(${G},0.85)`, dash: "none", opacity: 1 };
    case "third": return { thick: 1, solid: `rgba(${G},0.6)`, dash: "none", opacity: 1 };
    case "safe": return { thick: 0, solid: "transparent", dash: `1px dashed rgba(${G},0.5)`, opacity: 1 };
    case "fifth": return { thick: 1, solid: `rgba(${G},0.38)`, dash: "none", opacity: 1 };
  }
}

function PresentCanvas() {
  const rf = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  // UNCONTROLLED React Flow (defaultNodes + store mutations via rf.*): cards edit their own
  // node data with rf.updateNodeData — a controlled useState copy would race those writes
  // and clobber edits (observed: JE amounts lost). useNodes() subscribes where the shell
  // needs to react (tray, minimize sync).
  const liveNodes = useNodes();
  const [bgCfg, setBgCfg] = useState<BgConfig>(BG_DEFAULT);
  const [bgOpen, setBgOpen] = useState(false); // background picker popover (removed from toolbar; dot grid forced)
  const [fileMenuOpen, setFileMenuOpen] = useState(false); // File menu (Save/Load/Export/…) upward dropdown
  const [addCardOpen, setAddCardOpen] = useState(false);   // Add Card menu — card-kind picker upward dropdown
  const [minimap, setMinimap] = useState(true);
  const [clean, setClean] = useState(false);
  const [film, setFilm] = useState(false); // "v": clean screen + at-rest card chrome off + spotlight/ripple
  const filmRef = useRef(film);
  filmRef.current = film;
  const [camera, setCamera] = useState(false); // "b": screen-fixed webcam bubble
  // SPOTLIGHT (performance cursor) — transient, never saved. focusDim: auto=ON in
  // film / OFF outside; followReveals default on. The controller reads them live.
  const [spotFocusDim, setSpotFocusDim] = useState<FocusDimMode>("auto");
  const [spotFollowReveals, setSpotFollowReveals] = useState(true);
  const spot = useSpotlightController({ film, focusDimMode: spotFocusDim, followReveals: spotFollowReveals });
  const spotRef = useRef(spot);
  spotRef.current = spot;
  // Type floor: warn when zoomed out enough that card text goes illegible on a 1080p recording.
  const lowZoom = useStore((s) => s.transform[2] < 0.75);
  // DECLUTTER (PROMPT B): the palette + key live in the left drawer now; the
  // open panel persists so the workspace reopens the way it was left.
  const [drawerPanel, setDrawerPanelRaw] = useState<string | null>(() => {
    try { return localStorage.getItem("sa-canvas-drawer-panel"); } catch { return null; }
  });
  const setDrawerPanel = useCallback((key: string | null) => {
    setDrawerPanelRaw(key);
    try {
      if (key) localStorage.setItem("sa-canvas-drawer-panel", key);
      else localStorage.removeItem("sa-canvas-drawer-panel");
    } catch { /* ignore */ }
  }, []);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState("Untitled scene");
  const [decks, setDecks] = useState<DeckDef[]>([]); // named decks (P3) — persisted in the scene payload
  // ITEM 4e — a transient "flash this deck's member cards" pulse (auto-clears).
  const [deckHighlightId, setDeckHighlightId] = useState<string | null>(null);
  const deckFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashDeck = useCallback((deckId: string) => {
    setDeckHighlightId(deckId);
    if (deckFlashTimer.current) clearTimeout(deckFlashTimer.current);
    deckFlashTimer.current = setTimeout(() => setDeckHighlightId(null), 1200);
  }, []);
  const decksCtx = useMemo(() => ({ decks, highlightId: deckHighlightId, flashDeck }), [decks, deckHighlightId, flashDeck]);
  const [currentFrameId, setCurrentFrameId] = useState<string | null>(null); // FRAMES: the frame the camera is fitted to
  const currentFrameRef = useRef<string | null>(null);
  currentFrameRef.current = currentFrameId;
  const [frameTransitions, setFrameTransitions] = useState(true); // F3: animate enter/step (off = instant cut)
  const frameTransitionsRef = useRef(true);
  frameTransitionsRef.current = frameTransitions;
  // SPACE-WALK ACROSS FRAMES: space advances to the next frame once the current
  // one is exhausted, but only after ARMING (a guard press) so a mid-take space
  // never jumps the camera. armState is transient (never persisted).
  const [spaceAdvancesFrames, setSpaceAdvancesFrames] = useState(true); // toggle: off = space stays in-frame
  const spaceAdvancesFramesRef = useRef(true);
  spaceAdvancesFramesRef.current = spaceAdvancesFrames;
  const [rehearsalHud, setRehearsalHud] = useState(false); // next-up "next: Teach 2" pill (rehearsal only)
  const [armState, setArmState] = useState<null | ArmState>(null);
  const armStateRef = useRef<null | ArmState>(null);
  armStateRef.current = armState;
  const disarm = useCallback(() => setArmState(null), []);
  // Armed transitions DISARM on any input other than the advancing space: a
  // click anywhere, or any non-space key (arrow nav, Esc, mode keys). Capture
  // phase so it runs BEFORE the keymap's own space handler advances the frame.
  useEffect(() => {
    if (!armState) return;
    const onPointer = () => setArmState(null);
    const onKey = (e: KeyboardEvent) => { if (e.key !== " " && e.key !== "Spacebar") setArmState(null); };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("pointerdown", onPointer, true); window.removeEventListener("keydown", onKey, true); };
  }, [armState]);
  // ARROW-KEY FRAME NAV — DOUBLE-TAP ARM: the arrow keys move between frames only
  // when nothing is selected (frameFreeNav). A first press ARMS the direction
  // (a glowing edge light below/right/etc.); a second press in the same direction
  // actually navigates. Any other input disarms. Spotlight movement always wins.
  const [arrowArm, setArrowArm] = useState<null | "up" | "down" | "left" | "right">(null);
  const arrowArmRef = useRef<null | "up" | "down" | "left" | "right">(null);
  arrowArmRef.current = arrowArm;
  const armOrStep = useCallback((dir: "up" | "down" | "left" | "right", step: () => void) => {
    if (arrowArmRef.current !== dir) { setArrowArm(dir); return; }
    setArrowArm(null); step();
  }, []);
  // disarm the arrow nav on anything but a matching arrow re-press
  useEffect(() => {
    if (!arrowArm) return;
    const KEY: Record<string, string> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
    const onPointer = () => setArrowArm(null);
    const onKey = (e: KeyboardEvent) => { if (KEY[e.key] !== arrowArm) setArrowArm(null); };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("pointerdown", onPointer, true); window.removeEventListener("keydown", onKey, true); };
  }, [arrowArm]);
  const [showFrameHeader, setShowFrameHeader] = useState(true); // FF-6: in-frame header HUD (settings toggle)
  const [framePickerOpen, setFramePickerOpen] = useState(false); // FG5: grid mini-map jump
  const [toast, setToast] = useState<string | null>(null); // brief transient notice (frame cap, soft warns)
  const toastTimer = useRef(0);
  const flashToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);
  // FAIL-LOUD: a dark feature's table missing → a visible toast naming the
  // migration (the data layer also console.errors). Held longer than a flash.
  useEffect(() => onMissingMigration((m) => {
    setToast(`Missing migration — run ${m} in Supabase`);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }), []);
  const [vpTick, setVpTick] = useState(0); // bump on resize → re-fit + re-letterbox the frame
  useEffect(() => {
    const onResize = () => setVpTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const [hideFrameChrome, setHideFrameChrome] = useState(false); // FF-6: hide frame headers outside film too
  const [compositionGuides, setCompositionGuides] = useState(true); // GUIDES item 1: center/thirds/fifths while dragging in a frame
  const [backstage, setBackstage] = useState<BackstageMode>("cinema"); // AC1: authoring-only pane background (film keeps the dark stage)
  const [filmEntrancePop, setFilmEntrancePop] = useState(true); // AC5a: dealt-card scale-pop in film
  const [filmCheckGlow, setFilmCheckGlow] = useState(true); // AC5b: hotter Check-gate red in film
  const [framePath, setFramePath] = useState(false); // AC3: numbered film-order path overlay (authoring)
  const [cueSheetOpen, setCueSheetOpen] = useState(false); // AC4: per-frame cue sheet panel
  const [scriptOpen, setScriptOpen] = useState(false); // SCRIPT EDITOR: the course-script modal
  const [spikeOpen, setSpikeOpen] = useState(false); // PHASE 3 EXPERIMENT: in-browser recorder spike (never the main flow)
  const [prompter, setPrompter] = useState(false); // TELEPROMPTER: hidden by default (incl. film); `p` toggles
  const [prompterCorner, setPrompterCorner] = useState<PrompterCorner>("tc"); // camera eyeline corner (persisted)
  const [introClipLength, setIntroClipLength] = useState(6.0); // AUTO-TRIM: intro clip length (s)
  const [autoTrimIntros, setAutoTrimIntros] = useState(true); // AUTO-TRIM: on by default
  const [dbDown, setDbDown] = useState<string | null>(null); // canvas_scenes missing → banner
  const [scenes, setScenes] = useState<SceneListRow[]>([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // "?" cheat sheet
  const [settingsOpen, setSettingsOpen] = useState(false); // toolbar canvas-settings gear
  const [savedAt, setSavedAt] = useState<string | null>(null);
  // SCENE TABS — the open set + which one drives the live canvas
  const [tabState, setTabState] = useState<{ tabs: TabEntry[]; active: string }>(() => {
    const key = Math.random().toString(36).slice(2);
    return { tabs: [{ key, sceneId: null, name: "Untitled scene", dirty: false }], active: key };
  });

  // SCENE FOLDERS (0088) — course groups in the Load dialog
  const qc = useQueryClient();
  // networkMode "always" everywhere here: these hit our own server fns. The
  // default "online" mode PAUSES a failed query's retry whenever the browser
  // thinks it's offline (embedded panes latch this spuriously), leaving the
  // query pending forever — the fail-loud banner never fires. "always" lets a
  // real network failure reject, which IS the loud path we want.
  const foldersQuery = useQuery({ queryKey: ["canvas-folders"], queryFn: () => listFolders(), retry: retryUnlessMigrationHint, staleTime: 60_000, networkMode: "always" });
  const folders = foldersQuery.data;
  const [foldersError, setFoldersError] = useState<string | null>(null);
  useEffect(() => {
    setFoldersError(foldersQuery.error ? (foldersQuery.error as Error).message : null);
  }, [foldersQuery.error]);
  const qcFolders = useCallback(() => qc.invalidateQueries({ queryKey: ["canvas-folders"] }), [qc]);
  const [newFolderName, setNewFolderName] = useState("");
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [renamingFolder, setRenamingFolder] = useState<{ id: string } | null>(null);

  /** Move a scene between folders. A COURSE folder also sets the scene's course
   *  context when unset (one gesture, one truth); a different existing course
   *  asks before forcing. */
  const moveScene = useCallback(
    async (s: SceneListRow, folderId: string | null) => {
      try {
        let res = await moveSceneToFolder({ data: { scene_id: s.id, folder_id: folderId } });
        if ("conflict" in res) {
          if (!window.confirm("This scene already has a DIFFERENT course set. Overwrite it with the folder's course?")) return;
          res = await moveSceneToFolder({ data: { scene_id: s.id, folder_id: folderId, force_course: true } });
        }
        if ("courseSet" in res && res.courseSet && s.id === sceneId) setSceneCourseId(res.courseSet);
        setScenes((xs) => xs.map((x) => (x.id === s.id ? { ...x, folder_id: folderId } : x)));
      } catch (e) {
        setFoldersError(e instanceof Error ? e.message : String(e));
      }
    },
    [sceneId],
  );

  // Scenario library for the palette (same query key as /study — shared cache).
  const treeQuery = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 300_000, retry: 1, networkMode: "always" });
  const library = useMemo(() => (treeQuery.data ? buildLibrary(treeQuery.data) : []), [treeQuery.data]);
  // FAIL LOUD until 0087 is applied: rows come back without lifecycle flags.
  const contentResetMissing = useMemo(() => library.length > 0 && library.every((i) => i.status === undefined), [library]);

  // SCENE COURSE CONTEXT (content reset): pickers scope to this course.
  const [sceneCourseId, setSceneCourseId] = useState<string | null>(null);
  const [sceneChapterId, setSceneChapterId] = useState<string | null>(null);
  const [manageAccountsOpen, setManageAccountsOpen] = useState(false);
  const [manageCourseOpen, setManageCourseOpen] = useState(false);
  const coursesQuery = useQuery({ queryKey: ["course-options"], queryFn: fetchCourseOptions, staleTime: 600_000, retry: 1, networkMode: "always" });
  const sceneCourse = (coursesQuery.data ?? []).find((c) => c.id === sceneCourseId) ?? null;

  // COURSE COA SET (0087): the JE picker shows ONLY the scene-course's curated
  // set (master chart_of_accounts stays reference-only, edited via Manage
  // accounts). No course → empty groups → picker renders its set-course state.
  const courseCoaQuery = useQuery({
    queryKey: ["course-coa", sceneCourseId],
    queryFn: () => listCourseAccounts({ data: { course_id: sceneCourseId! } }),
    enabled: !!sceneCourseId,
    staleTime: 60_000,
    retry: retryUnlessMigrationHint,
    networkMode: "always",
  });
  const coaGroups = useMemo(() => groupCoa(sceneCourseId ? (courseCoaQuery.data ?? []) : []), [sceneCourseId, courseCoaQuery.data]);
  const coaNames = useMemo(() => (sceneCourseId ? (courseCoaQuery.data ?? []) : []).map((r) => r.canonical_name), [sceneCourseId, courseCoaQuery.data]);

  // Scene-level card settings (persisted in the scene payload)
  const [jeCardWidth, setJeCardWidth] = useState(JE_WIDTH_DEFAULT);
  const [jeIndent, setJeIndent] = useState(JE_INDENT_DEFAULT); // tetris credit-block stagger
  const [jePreset, setJePreset] = useState<JePreset>("guided");
  const [dealFaceDown, setDealFaceDown] = useState(false); // deck toggle: deals arrive as card backs
  const [hideFdLabels, setHideFdLabels] = useState(false); // quiz mode: banners show "???"
  const [focusPalette, setFocusPalette] = useState(true); // blanks trimmed to JE/T-account/Note/Heading
  // PREVIEW STUDENT (template variables) — persisted in localStorage
  const [previewStudent, setPreviewStudent] = useState<PreviewStudent>(() => loadPreviewStudent());
  const patchPreview = useCallback((k: keyof PreviewStudent, v: string) => {
    setPreviewStudent((prev) => {
      const next = { ...prev, [k]: v };
      savePreviewStudent(next);
      return next;
    });
  }, []);
  const jeLibrary = useMemo(() => library.filter((it) => it.kind === "je"), [library]); // description picker (A12)
  // palette LIBRARY default: active + authored only (archived stays queryable via the picker toggle)
  const activeLibrary = useMemo(() => library.filter((i) => i.status === "active" && i.source === "authored"), [library]);
  // GLOBAL DIRECTOR NOTES (per beat) — set once, shown on that beat's frame in
  // every lesson. localStorage is the source of truth (truly global across
  // scenes); also saved into the scene payload so it travels on export/import.
  const [beatNotes, setBeatNotes] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("sa-canvas-beat-notes") || "{}"); } catch { return {}; }
  });
  const setBeatNote = useCallback((beat: string, text: string) => {
    setBeatNotes((prev) => {
      const next = { ...prev };
      if (text) next[beat] = text; else delete next[beat];
      try { localStorage.setItem("sa-canvas-beat-notes", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const canvasSettings = useMemo<CanvasSettings>(
    () => ({
      jeCardWidth,
      jeIndent,
      jePreset,
      coa: coaGroups,
      coaNames,
      hideFdLabels,
      jeLibrary,
      courseId: sceneCourseId,
      chapterId: sceneChapterId,
      courseName: sceneCourse ? courseLabel(sceneCourse) : null,
      contentResetMissing,
      onManageAccounts: () => setManageAccountsOpen(true),
      previewStudent,
      beatNotes,
      setBeatNote,
      setJeCardWidth,
      setJeIndent,
      setJePreset,
    }),
    [jeCardWidth, jeIndent, jePreset, coaGroups, coaNames, hideFdLabels, jeLibrary, sceneCourseId, sceneChapterId, sceneCourse, contentResetMissing, previewStudent, beatNotes, setBeatNote],
  );

  // Off-canvas = TUCKED deck members (dealt members are visible like loose cards);
  // legacy staged/minimized read as tucked until the load-time migration clears
  // them. ELEMENTS are never off-canvas — self-heals any stray membership.
  // cueHidden (Cue Sheet Phase 2): a memo in a cue-driven frame is hidden until
  // its memo cue fires; RF hides the node AND its pointer arrow (hidden endpoint).
  const offCanvas = (d: CardData) => (!isElementKind(d.kind) && isTucked(d)) || !!(d as { cueHidden?: boolean }).cueHidden;
  // LOCKS: posLock (B2, any card — position frozen, edits fine) and the JE
  // reviewLock (A3 — superset: also freezes edits inside the card face) both
  // pin the node by syncing React Flow's draggable flag off.
  const dragFrozen = (d: CardData) => !!(d as CardBase).posLock || !!(d as { reviewLock?: boolean }).reviewLock;
  useEffect(() => {
    const stale = liveNodes.some((n) => {
      const d = n.data as unknown as CardData;
      return !!n.hidden !== offCanvas(d) || (n.hidden && n.selected) || (n.draggable === false) !== dragFrozen(d);
    });
    if (stale) {
      rf.setNodes((nds) =>
        nds.map((n) => {
          const d = n.data as unknown as CardData;
          const off = offCanvas(d);
          const frozen = dragFrozen(d);
          // off-canvas cards are also DESELECTED — otherwise the show key would step the
          // reveals of an invisible staged card instead of summoning the next one.
          if (!!n.hidden !== off || (off && n.selected) || (n.draggable === false) !== frozen) {
            return { ...n, hidden: off, selected: off ? false : n.selected, draggable: frozen ? false : undefined };
          }
          return n;
        }),
      );
    }
  }, [liveNodes, rf]);

  // Z-ORDER: any node that lacks a zIndex is BRAND NEW (spawned, cloned, dealt,
  // generated, pasted, or a fresh memo) — give it the top of its tier so it lands
  // ON TOP of its peers and is grabbable, never buried. nextZ is monotonic +
  // tiered (container < frame < element < card < memo), so this also keeps memos
  // above their host cards. One assignment per node, then it's no longer
  // undefined — self-terminating.
  useEffect(() => {
    const fresh = liveNodes.filter((n) => n.zIndex === undefined);
    if (fresh.length === 0) return;
    const ids = new Set(fresh.map((n) => n.id));
    rf.setNodes((nds) => nds.map((n) => (ids.has(n.id) ? { ...n, zIndex: nextZ(n.type, (n.data as { kind?: string })?.kind) } : n)));
  }, [liveNodes, rf]);

  // FILM = STRUCTURE INERT: when film mode turns on, drop any lingering
  // selection on a structure/design node (frame, lesson, zone, heading, text,
  // gate) so no stray selection ring sits on the composed stage. Cards keep
  // their selection. The CSS gate (pointer-events:none in .film-mode) blocks NEW
  // structure selection/drag; this just cleans what was already selected. Purely
  // a mode gate — nothing here persists, and exiting film restores everything.
  const isStructureType = (t: string | undefined): boolean =>
    isContainerType(t) || t === "heading" || t === "text" || t === "paygate" || t === "signupgate";
  useEffect(() => {
    if (!film) return;
    if (rf.getNodes().some((n) => n.selected && isStructureType(n.type))) {
      rf.setNodes((nds) => nds.map((n) => (n.selected && isStructureType(n.type) ? { ...n, selected: false } : n)));
    }
  }, [film, rf]);

  // ---- CONNECTIONS (V2 + PROMPT A): hover dots on every card/lesson, plus
  // per-LINE dots on JE blocks (ln:<lineId>:l|r handles — edges anchored to a
  // line travel with its block through hops/reorders). Drag dot → live line →
  // drop on any dot; loose mode so every dot both starts and receives.
  //
  // THE UNDO FIX (PROMPT A item 4, root cause in arrows.ts): React Flow in
  // uncontrolled mode auto-adds its OWN plain edge before this callback runs —
  // the old dupe-guard saw it and bailed, so the bus never recorded arrows
  // (Ctrl+Z ignored them) and the visible edge was RF's unstyled bezier (no
  // arrowhead). Now: strip the auto edge raw (it was never a user action) and
  // dispatch the styled replacement through the bus.
  const onConnect = useCallback(
    (c: Connection) => {
      const { autoIds, edge } = resolveConnection(rf.getEdges() as EdgeLike[], c, () => cardId("edge"));
      if (autoIds.length) {
        const drop = new Set(autoIds);
        rf.setEdges((eds) => eds.filter((e) => !drop.has(e.id)));
      }
      // MEMO RE-TARGET (J3): a memo dot dropped on a block IN THE SAME card
      // (source === target, so no edge is made) re-points that memo's default
      // in-card leader at the dropped line — one undoable data patch. Cross-card
      // memo arrows fall through to the ordinary edge path below.
      const memoSrc = memoOfHandle(c.sourceHandle);
      if (memoSrc && c.source && c.source === c.target) {
        const targetLine = lineIdOfHandle(c.targetHandle);
        if (targetLine && targetLine !== memoSrc.lineId) {
          const node = rf.getNode(c.source);
          if (node) {
            const nextLines = ((node.data as unknown as JeCard).lines ?? []).map((l) =>
              l.id === memoSrc.lineId ? { ...l, memos: memosOf(l).map((m) => (m.kind === memoSrc.kind ? { ...m, point: targetLine } : m)) } : l,
            ) as JeLine[];
            const cmd = patchDataCmd(rf as unknown as RfLike, c.source, { lines: nextLines }, "re-target memo");
            if (cmd) bus.dispatch(cmd);
          }
        }
        return;
      }
      if (edge) bus.dispatch(addEdgeCmd(rf as unknown as RfLike, edge));
    },
    [rf],
  );

  // ---- edge click (#6): RF selects the edge (slow looping silver march + ×);
  // we additionally light BOTH endpoint blocks SILVER (same language as block
  // selection) via transient _glowLine. Cleared on pane click / Esc / next edge.
  const glowedNodes = useRef<string[]>([]);
  const clearEdgeGlow = useCallback(() => {
    for (const nid of glowedNodes.current) rf.updateNodeData(nid, { _glowLine: undefined });
    glowedNodes.current = [];
  }, [rf]);
  const onEdgeClick = useCallback(
    (_e: React.MouseEvent, edge: { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }) => {
      clearEdgeGlow();
      const ends: [string, string | null][] = [
        [edge.source, lineIdOfHandle(edge.sourceHandle)],
        [edge.target, lineIdOfHandle(edge.targetHandle)],
      ];
      for (const [nid, lineId] of ends) {
        if (!lineId) continue;
        rf.updateNodeData(nid, { _glowLine: lineId });
        glowedNodes.current.push(nid);
      }
    },
    [rf, clearEdgeGlow],
  );
  const onPaneClick = useCallback(() => clearEdgeGlow(), [clearEdgeGlow]);

  // ---- MULTI-SELECT (PROMPT B): Ctrl+drag = marquee — INCLUDING inside
  // lesson/region boxes. Containers are nodes, so a drag starting on one would
  // move it instead of drawing the box; while Ctrl is held a body class turns
  // their pointer-events off, the gesture falls through to the pane, and RF's
  // selectionKeyCode (Control) draws the marquee (ctrl+DRAG). Ctrl+CLICK is
  // SPOTLIGHT now (SpotlightContext) — multiSelectionKeyCode is ["Shift"] only so
  // RF no longer eats the ctrl+click; shift-click multi-selects. Cards inside
  // containers select normally — the marquee tests ABSOLUTE positions.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Control") document.body.classList.add("sa-ctrl"); };
    const up = (e: KeyboardEvent) => { if (e.key === "Control") document.body.classList.remove("sa-ctrl"); };
    const blur = () => document.body.classList.remove("sa-ctrl");
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.body.classList.remove("sa-ctrl");
    };
  }, []);

  // GROUP CHROME (PROMPT B) is now its own <GroupChromeBar/> component (see
  // module scope) so its pan/zoom + node subscriptions don't re-render this
  // whole route. Rendered below in the JSX, gated on `chrome`.

  // while a connection drag is live, EVERY node's dots show (drop targets)
  const connecting = useStore((s) => !!s.connection.inProgress);

  // User pan/zoom timestamp — auto-fit never fights a hand on the wheel.
  const lastUserView = useRef(0);
  const onMoveStart = useCallback((event: unknown) => {
    if (event) lastUserView.current = Date.now();
  }, []);

  /** No remembered spot → next free cell in a flowing grid from viewport center
   *  (cell = footprint + 40px gutter, max 5 columns, wrapping down). */
  const nextFreeGridSlot = useCallback(
    (w: number, h: number) => {
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const center = rf.screenToFlowPosition({
        x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2,
        y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2,
      });
      const GUTTER = 40;
      const COLS = 5;
      const cellW = w + GUTTER;
      const cellH = h + GUTTER;
      const originX = center.x - (cellW * COLS) / 2 + GUTTER / 2;
      const originY = center.y - cellH / 2;
      const others = rf.getNodes().filter((n) => !n.hidden && !isContainerType(n.type));
      const overlaps = (x: number, y: number) =>
        others.some((o) => {
          const ow = o.measured?.width ?? 300;
          const oh = o.measured?.height ?? 170;
          return x < o.position.x + ow && x + w > o.position.x && y < o.position.y + oh && y + h > o.position.y;
        });
      for (let i = 0; i < 60; i++) {
        const x = originX + (i % COLS) * cellW;
        const y = originY + Math.floor(i / COLS) * cellH;
        if (!overlaps(x, y)) return { x, y };
      }
      return { x: center.x, y: center.y };
    },
    [rf],
  );

  /** Post-deal: if visible cards spill past the viewport, zoom-to-fit (~250ms) —
   *  unless the user panned/zoomed within the last few seconds. */
  const maybeAutoFit = useCallback(() => {
    if (Date.now() - lastUserView.current < 4000) return;
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!rect) return;
    const vp = rf.getViewport();
    const view = { x: -vp.x / vp.zoom, y: -vp.y / vp.zoom, w: rect.width / vp.zoom, h: rect.height / vp.zoom };
    const visible = rf.getNodes().filter((n) => !n.hidden && !isContainerType(n.type));
    if (visible.length === 0) return;
    const outside = visible.some((n) => {
      const w = n.measured?.width ?? 300;
      const h = n.measured?.height ?? 170;
      return n.position.x < view.x || n.position.y < view.y || n.position.x + w > view.x + view.w || n.position.y + h > view.y + view.h;
    });
    if (outside) void rf.fitView({ duration: 250, padding: 0.12 });
  }, [rf]);

  // SPACE-WALK cursor (PROMPT C): the lesson whose deck the show key is
  // currently walking — follows the last deal; a selected card's lesson wins.
  const walkLessonRef = useRef<string | null | undefined>(undefined);

  // ---- REGION SCAFFOLD (PROMPT C, the Wednesday accelerator): one dialog
  // (region name + course) stamps a laid-out cluster — full-width header
  // banner (heading ELEMENT; its slot doubles as the future animation spot),
  // one lesson box per ACTIVE chapter left-to-right in path order, and a
  // final full-width "Course Wrap-up · Cram Decks" lesson. Everything is
  // ordinary editable nodes after the stamp; ONE undoable command.
  const [scaffoldOpen, setScaffoldOpen] = useState(false);
  const [scaffoldName, setScaffoldName] = useState("");
  const [scaffoldCourseId, setScaffoldCourseId] = useState<string>("");
  // ONE lesson cell = a lesson node + its 4 beat frames (Hook · Teach · M/P ·
  // Check, one sub-frame each at row 0). Reused by the scaffold and by the
  // ghost-cell "+ add lesson" click, so every cell is stamped identically.
  const buildLessonCell = useCallback((pos: { x: number; y: number }, label: string, pathOrder: number, check: boolean, allLabels: string[] = []): CardNode[] => {
    const cell = lessonCellSize();
    const lid = cardId("lesson");
    const lesson = {
      id: lid, type: "lesson", position: { x: pos.x, y: pos.y },
      data: { label, w: cell.w, h: cell.h, pathOrder, check } as unknown as CardNode["data"],
    };
    const frames = SCAFFOLD_BEATS.map((b, k) => ({
      id: cardId("frame"), type: "frame", parentId: lid,
      position: { x: columnX(k), y: rowY(0) }, width: FRAME_W, height: FRAME_H,
      // No seeded notes — director notes are GLOBAL per beat now (Lee sets them;
      // one note shows on that beat's frame in every lesson). See beatNotes.
      data: { ...blankFrameData(b.beat, 0) } as unknown as CardNode["data"],
    }));
    // HOOK · FRAME 1 — the lesson TITLE, prefilled. A resizable/positionable
    // heading so Lee frames it wherever the intro shot needs it.
    const titleCard = {
      id: cardId("heading"), type: "heading", parentId: frames[0].id,
      position: { x: 110, y: 150 },
      data: { kind: "heading", text: label, level: 1, scrim: true } as unknown as CardNode["data"],
    };
    // HOOK · FRAME 2 — the COURSE OUTLINE as a plain LIST of every lesson, with
    // THIS lesson's row marked "you are here" (auto-spotlight). Prefilled so the
    // intro's "here's where we're going" beat is one card, no authoring.
    const outlineFrameId = cardId("frame");
    const outlineFrame = {
      id: outlineFrameId, type: "frame", parentId: lid,
      position: { x: columnX(0), y: rowY(1) }, width: FRAME_W, height: FRAME_H,
      data: { ...blankFrameData("hook", 1), title: "Outline" } as unknown as CardNode["data"],
    };
    const labels = allLabels.length ? allLabels : [label];
    const outlineList = {
      id: cardId("list"), type: "list", parentId: outlineFrameId,
      position: { x: 130, y: 72 },
      data: {
        kind: "list", title: "Lessons", showChips: false,
        rows: labels.map((t) => ({ id: cardId("r"), text: t, youAreHere: t === label })),
      } as unknown as CardNode["data"],
    };
    return [lesson, ...frames, titleCard, outlineFrame, outlineList] as CardNode[];
  }, []);

  const spawnRegionScaffold = useCallback(() => {
    const course = (coursesQuery.data ?? []).find((c) => c.id === scaffoldCourseId);
    if (!course) return;
    const chapters = course.chapters
      .filter((ch) => ch.status !== "archived")
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
    if (chapters.length === 0) return;
    // REGION GRID (supersedes the snake): chapters become fixed-footprint lesson
    // CELLS laid in a 5-wide reading-order grid with reserved space, so a sub-
    // frame never overlaps a neighbour. The WRAP-UP chapter is pulled out and
    // centered below the grid as the destination. Empty slots render as ghost
    // "+ add lesson" placeholders (an overlay, not nodes).
    const gridChapters = chapters.filter((ch) => !isWrapUpName(ch.name));
    const wrapChapter = chapters.find((ch) => isWrapUpName(ch.name)) ?? null;
    const cell = lessonCellSize();
    const HEADER_H = 96;
    const HEADER_GAP = 60;
    const HOME_H = 150;
    const rl = regionLayout(gridChapters.length, 0, 0, !!wrapChapter, cell);
    const name = scaffoldName.trim() || courseLabel(course);

    // WHERE THE REGION LANDS: inside the course's HUB PLATE (Start Here today; the
    // four future plates once lit) so the scaffold nests in its box under the
    // SURVIVE ACCOUNTING crown instead of floating over the hub. Unknown courses
    // fall back to the viewport centre (old behaviour).
    const slot = plateForCourse(course.course_name ?? name);
    let ox: number, gridTop: number, homeX: number, homeY: number;
    let regionHeader: CardNode[];
    let fitRect: { x: number; y: number; w: number; h: number } | null;
    if (slot === "start") {
      const hub = hubLayout();
      ox = hub.regionOrigin.x;
      gridTop = hub.regionOrigin.y;
      homeX = hub.homeOrigin.x;
      homeY = hub.homeOrigin.y;
      regionHeader = []; // the hub crown IS the region header — no duplicate
      fitRect = hub.startPlate;
    } else {
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const center = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
      const fullH = HEADER_H + HEADER_GAP + rl.gridH + (rl.wrapUp ? REGION.wrapGapY + cell.h : 0);
      ox = center.x - rl.gridW / 2;
      const oy = center.y - fullH / 2;
      gridTop = oy + HEADER_H + HEADER_GAP;
      homeX = ox;
      homeY = oy - HOME_H;
      regionHeader = [{ id: cardId("heading"), type: "heading", position: { x: ox, y: oy },
        data: { kind: "heading", text: `${name} [animation slot — region header]`, level: 1, w: rl.gridW } as unknown as CardNode["data"] }];
      fitRect = null;
    }

    // Every lesson's Hook-2 outline list shows the WHOLE course (grid + wrap-up).
    const allLabels = [...gridChapters.map(chapterLabel), ...(wrapChapter ? [chapterLabel(wrapChapter)] : [])];
    const nodes: CardNode[] = [
      { id: cardId("heading"), type: "heading", position: { x: homeX, y: homeY },
        data: { kind: "heading", text: `Welcome — start here [${name}]`, level: 2 } as unknown as CardNode["data"] },
      { id: cardId("asklee"), type: "asklee", position: { x: homeX + Math.min(560, rl.gridW - 300), y: homeY + 6 },
        data: { kind: "asklee" } as unknown as CardNode["data"] },
      ...regionHeader,
      // GRID CHAPTERS → cells in reading order (reserved footprint each).
      ...gridChapters.flatMap((ch, i) => buildLessonCell({ x: ox + rl.cells[i].x, y: gridTop + rl.cells[i].y }, chapterLabel(ch), i + 1, false, allLabels)),
      // WRAP-UP → centered below, region-level red Check tint, same 4-beat arc.
      ...(wrapChapter && rl.wrapUp
        ? buildLessonCell({ x: ox + rl.wrapUp.x, y: gridTop + rl.wrapUp.y }, chapterLabel(wrapChapter), gridChapters.length + 1, true, allLabels)
        : []),
    ] as CardNode[];
    bus.dispatch(addNodesCmd(rf as unknown as RfLike, nodes, `region scaffold: ${name}`));
    setScaffoldOpen(false);
    setScaffoldName("");
    window.setTimeout(() => {
      if (fitRect) void rf.fitBounds({ x: fitRect.x, y: fitRect.y, width: fitRect.w, height: fitRect.h }, { duration: 500, padding: 0.06 });
      else void rf.fitView({ duration: 300, padding: 0.15 });
    }, 60);
  }, [rf, coursesQuery.data, scaffoldCourseId, scaffoldName, buildLessonCell]);

  // REFLOW / TIDY (path nav #4): re-run the snaking layout on the region's
  // lessons (ordered by pathOrder, then reading order) — even spacing, clean
  // turns, no overlap — as ONE undoable command. Never automatic: manual
  // placement (and manual resize) is preserved until Lee presses this.
  const reflowPath = useCallback(() => {
    const all = rf.getNodes() as CardNode[];
    const lessons = all.filter((n) => n.type === "lesson" && !n.parentId);
    // Each entry can carry a position AND a footprint normalize (w/h) — a Tidy
    // migrates pre-grid regions to the reserved-footprint cells too.
    type Slot = { x: number; y: number; w?: number; h?: number };
    const before = new Map<string, Slot>();
    const after = new Map<string, Slot>();
    const snap = (n: CardNode): Slot => ({ x: n.position.x, y: n.position.y, w: (n.data as Record<string, unknown>).w as number, h: (n.data as Record<string, unknown>).h as number });
    // 1) re-lay the region's lessons into the reserved 5-wide GRID by pathOrder,
    //    wrap-up centered below. Anchored at the region's current top-left.
    if (lessons.length >= 1) {
      const po = (n: CardNode) => { const v = (n.data as Record<string, unknown>).pathOrder; return typeof v === "number" ? v : Number.POSITIVE_INFINITY; };
      const labelOf = (n: CardNode) => (n.data as Record<string, unknown>).label as string | undefined;
      const ordered = [...lessons].sort((a, b) => po(a) - po(b) || a.position.y - b.position.y || a.position.x - b.position.x);
      const gridLessons = ordered.filter((n) => !isWrapUpName(labelOf(n)));
      const wrapLesson = ordered.find((n) => isWrapUpName(labelOf(n))) ?? null;
      const cell = lessonCellSize();
      const minX = Math.min(...lessons.map((n) => n.position.x));
      const minY = Math.min(...lessons.map((n) => n.position.y));
      const rl = regionLayout(gridLessons.length, minX, minY, !!wrapLesson, cell);
      gridLessons.forEach((n, i) => { before.set(n.id, snap(n)); after.set(n.id, { ...rl.cells[i], w: cell.w, h: cell.h }); });
      if (wrapLesson && rl.wrapUp) { before.set(wrapLesson.id, snap(wrapLesson)); after.set(wrapLesson.id, { ...rl.wrapUp, w: cell.w, h: cell.h }); }
    }
    // 2) re-lay each lesson's FRAMES as the beat GRID (lesson-relative — they
    //    ride along with the lesson's new spot).
    const byId = new Map(all.map((n) => [n.id, n]));
    for (const l of lessons) {
      const gl = gridLayout(lessonGrid(all as never, l.id), FRAME_W, FRAME_H);
      gl.positions.forEach((pos, fid) => { const f = byId.get(fid); if (f) { before.set(fid, snap(f)); after.set(fid, pos); } });
    }
    if (after.size === 0) return;
    const apply = (m: Map<string, Slot>) =>
      rf.setNodes((nds) => nds.map((n) => {
        const s = m.get(n.id); if (!s) return n;
        if (s.w == null || s.h == null) return { ...n, position: { x: s.x, y: s.y } };
        return { ...n, position: { x: s.x, y: s.y }, width: s.w, height: s.h, data: { ...(n.data as Record<string, unknown>), w: s.w, h: s.h } } as CardNode;
      }));
    bus.dispatch({ label: "tidy layout", do: () => apply(after), undo: () => apply(before) });
    window.setTimeout(() => void rf.fitView({ duration: 300, padding: 0.15 }), 60);
  }, [rf]);

  // ---- PREP FOR FILMING (PROMPT C): hide every card's reveals + tuck every
  // deck member — ONE undoable command. Run it on a duplicated scene and the
  // master stays pristine while the copy is show-ready.
  const prepForFilming = useCallback(() => {
    const nds = rf.getNodes();
    const cmds: (ReturnType<typeof patchDataCmd>)[] = [];
    for (const n of nds) {
      if (isContainerType(n.type)) continue;
      const d = n.data as unknown as CardData;
      const hide = hideAll(d);
      if (hide) cmds.push(patchDataCmd(rf as unknown as RfLike, n.id, hide as Record<string, unknown>, "hide reveals"));
      // Cue Sheet Phase 2: a memo inside a CUE-DRIVEN frame hides until its cue
      // fires (derived-order frames leave memos visible — unchanged behavior).
      if (d.kind === "memo" && !(d as { cueHidden?: boolean }).cueHidden) {
        const co = (n.parentId ? (rf.getNode(n.parentId)?.data as { cueOrder?: string[] }) : undefined)?.cueOrder;
        if (co && co.length) cmds.push(patchDataCmd(rf as unknown as RfLike, n.id, { cueHidden: true }, "hide memo (cue)"));
      }
      if (!isElementKind(d.kind) && (d.deckMember || d.staged || d.minimized) && !isTucked(d)) {
        cmds.push(
          patchDataCmd(
            rf as unknown as RfLike,
            n.id,
            {
              deckMember: true,
              tucked: true,
              staged: undefined,
              minimized: undefined,
              deckPos: { x: n.position.x, y: n.position.y },
              deckCategory: categoryOf(d),
            },
            "tuck",
          ),
        );
      }
    }
    const c = compositeCmd(cmds, "prep for filming");
    if (c) bus.dispatch(c);
  }, [rf]);

  // ---- DEAL: card leaves the deck for its REMEMBERED canvas spot (else the next
  // free grid slot), selected on arrival; mount animation = the entrance. One
  // dispatcher command — undo returns it to the deck at its old order.
  const deal = useCallback(
    (id: string) => {
      const node = rf.getNode(id);
      if (!node) return;
      walkLessonRef.current = lessonIdOf(node as never, rf.getNodes() as never);
      const d = node.data as unknown as CardData;
      const fw = node.measured?.width ?? (d.kind === "je" ? jeCardWidth : ((d as CardData & { w?: number }).w ?? 300));
      const fh = node.measured?.height ?? 190;
      const target = d.deckPos ?? nextFreeGridSlot(fw, fh);
      const before = {
        deckMember: d.deckMember,
        tucked: d.tucked,
        staged: d.staged,
        minimized: d.minimized,
        faceDown: d.faceDown,
        position: { ...node.position },
      };
      const fd = dealFaceDown;
      bus.dispatch({
        label: "deal card",
        do: () => {
          // dealt member: stays IN the deck roster, just visible again
          rf.updateNodeData(id, { deckMember: true, tucked: false, staged: undefined, minimized: undefined, faceDown: fd });
          rf.setNodes((nds) =>
            nds.map((n) =>
              n.id === id
                ? { ...n, position: { ...target }, hidden: false, selected: true }
                : n.selected
                  ? { ...n, selected: false }
                  : n,
            ),
          );
        },
        undo: () => {
          rf.updateNodeData(id, { deckMember: before.deckMember, tucked: before.tucked, staged: before.staged, minimized: before.minimized, faceDown: before.faceDown });
          rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { ...before.position }, selected: false } : n)));
        },
      });
      setTimeout(maybeAutoFit, 40); // after the store settles
    },
    [rf, dealFaceDown, jeCardWidth, nextFreeGridSlot, maybeAutoFit],
  );

  /** CUE SHEET PHASE 2 — perform the frame's NEXT (dir=1) / undo its LAST (dir=-1)
   *  cue from the explicit cueOrder. Returns "handled" (a content cue ran → the
   *  key handler returns), "boundary" (forward: next is Advance; reverse: at the
   *  start → the caller runs its arm/advance or arm-back), or "none" (this frame
   *  isn't cue-driven → fall through to the derived precedence, unchanged). */
  const performFrameCue = useCallback((frameId: string, dir: 1 | -1): "handled" | "boundary" | "none" => {
    const nodes = rf.getNodes();
    const co = (rf.getNode(frameId)?.data as { cueOrder?: string[] } | undefined)?.cueOrder;
    if (!co || co.length === 0) return "none";
    const children = nodes.filter((n) => n.parentId === frameId);
    const cards = children.filter((n) => !isContainerType(n.type) && (n.data as { kind?: string }).kind !== "memo");
    const memos = children.filter((n) => (n.data as { kind?: string }).kind === "memo");
    const hasNext = !!frameWalkNext(nodes as never, frameId);
    const cues = orderedCues(deriveFrameCues(cards as never, memos as never, rf.getEdges() as never, hasNext), co);
    const dataOf = (id: string) => rf.getNode(id)?.data as CardData | undefined;
    const state: CueState = {
      isDealt: (id) => { const d = dataOf(id); return !!d && !isTucked(d as never); },
      revealCount: (id) => { const d = dataOf(id); return d ? currentRevealCount(d) : 0; },
      memoVisible: (id) => { const d = dataOf(id) as { cueHidden?: boolean } | undefined; return !!d && !d.cueHidden; },
    };
    const rfl = rf as unknown as RfLike;
    const select = (id?: string) => { if (id) rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === id) ? { ...n, selected: n.id === id } : n))); };
    const dispatch = (c: ReturnType<typeof patchDataCmd>) => { if (c) bus.dispatch(c); };

    if (dir > 0) {
      const idx = nextCueIndex(cues, state);
      if (idx < 0) return "boundary";
      const cue = cues[idx];
      if (cue.kind === "advance") return "boundary";
      if (cue.kind === "deal" && cue.cardId) { deal(cue.cardId); disarm(); return "handled"; }
      if (cue.kind === "reveal" && cue.cardId) {
        const d = dataOf(cue.cardId);
        if (d) { dispatch(patchDataCmd(rfl, cue.cardId, revealPatchForCount(d, cue.revealCount ?? 0) as Record<string, unknown>, "reveal (cue)")); select(cue.cardId); spotRef.current?.onReveal(cue.cardId, cue.cardId); }
        disarm(); return "handled";
      }
      if (cue.kind === "memo" && cue.memoId) { dispatch(patchDataCmd(rfl, cue.memoId, { cueHidden: false }, "reveal memo (cue)")); spotRef.current?.onReveal(cue.memoId, cue.memoId); disarm(); return "handled"; }
      return "handled";
    }
    // reverse — undo the LAST done, non-advance cue
    let li = -1;
    for (let i = cues.length - 1; i >= 0; i--) { const c = cues[i]; if (c.kind !== "advance" && cueIsDone(c, state)) { li = i; break; } }
    if (li < 0) return "boundary";
    const cue = cues[li];
    if (cue.kind === "deal" && cue.cardId) { dispatch(patchDataCmd(rfl, cue.cardId, { tucked: true }, "un-deal (cue)")); disarm(); return "handled"; }
    if (cue.kind === "reveal" && cue.cardId) {
      const d = dataOf(cue.cardId);
      if (d) { dispatch(patchDataCmd(rfl, cue.cardId, revealPatchForCount(d, Math.max(0, (cue.revealCount ?? 1) - 1)) as Record<string, unknown>, "un-reveal (cue)")); select(cue.cardId); }
      disarm(); return "handled";
    }
    if (cue.kind === "memo" && cue.memoId) { dispatch(patchDataCmd(rfl, cue.memoId, { cueHidden: true }, "hide memo (cue)")); disarm(); return "handled"; }
    return "handled";
  }, [rf, deal, disarm]);

  // ---- FRAMES: enter/exit/step camera (the frame's bounds = the viewport) ----
  const enterFrame = useCallback((frameId: string) => {
    const nodes = rf.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const f = byId.get(frameId);
    if (!f || f.type !== "frame") return;
    const r = absRectOf(f as never, byId as never);
    setCurrentFrameId(frameId);
    lastUserView.current = Date.now(); // suppress auto-fit fighting the frame camera
    // EXACT FIT (the whole point: frame bounds = the viewport). Compute the
    // viewport directly rather than fitBounds so the shot is deterministic —
    // "contain" the 16:9 frame, centered, clamped to the zoom range.
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const cw = rect?.width ?? window.innerWidth;
    const ch = rect?.height ?? window.innerHeight;
    const zoom = Math.max(0.08, Math.min(2.5, Math.min(cw / r.w, ch / r.h)));
    const x = cw / 2 - (r.x + r.w / 2) * zoom;
    const y = ch / 2 - (r.y + r.h / 2) * zoom;
    void rf.setViewport({ x, y, zoom }, { duration: frameTransitionsRef.current ? 280 : 0 });
  }, [rf]);

  // Keep the frame pinned to its exact 16:9 fit when the window resizes.
  useEffect(() => {
    if (currentFrameRef.current) enterFrame(currentFrameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vpTick]);

  const exitFrame = useCallback(() => {
    const cur = currentFrameRef.current;
    setCurrentFrameId(null);
    if (!cur) return;
    const nodes = rf.getNodes();
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const f = byId.get(cur);
    const lesson = f?.parentId ? byId.get(f.parentId) : undefined;
    const dur = frameTransitionsRef.current ? 280 : 0;
    if (lesson) {
      const r = absRectOf(lesson as never, byId as never);
      void rf.fitBounds({ x: r.x, y: r.y, width: r.w, height: r.h }, { duration: dur, padding: 0.12 });
    } else {
      void rf.fitView({ duration: dur, padding: 0.2 });
    }
  }, [rf]);

  /** Lesson-relative grid position for a (beat, subIndex) cell. */
  const gridPos = useCallback((beat: Beat, subIndex: number) => ({ x: columnX(BEAT_COLUMNS.indexOf(beat)), y: rowY(subIndex) }), []);

  /** Create a frame at a grid cell (returns its id). node.width/height MUST be
   *  set (the FrameNode is w/h-full) or RF sizes it to min-content. */
  const makeFrameAt = useCallback((lessonId: string, beat: Beat, subIndex: number, title = ""): string | null => {
    // CAP (item 4): max RESERVED_ROWS frames per beat — the reserved footprint
    // holds exactly this many, so we never grow the cell or overlap a neighbour.
    if (subIndex >= RESERVED_ROWS) return null;
    const fid = cardId("frame");
    const node = { id: fid, type: "frame", parentId: lessonId, position: gridPos(beat, subIndex), width: FRAME_W, height: FRAME_H, data: { ...blankFrameData(beat, subIndex), title } } as unknown as CardNode;
    bus.dispatch(addNodesCmd(rf as unknown as RfLike, [node], "add frame"));
    return fid;
  }, [rf, gridPos]);

  /** ↑ / ↓ — walk sub-frames within the current beat column. Authoring: ↓ past the
   *  last sub-frame CREATES a new one (same beat) and enters it. Film: no-op. */
  const stepSub = useCallback((dir: -1 | 1) => {
    const cur = currentFrameRef.current;
    if (!cur) return;
    const adj = subNeighborFrame(rf.getNodes() as never, cur, dir);
    if (adj) { enterFrame(adj.id); return; }
    if (dir > 0 && !filmRef.current) {
      const f = rf.getNode(cur);
      if (!f?.parentId) return;
      const beat = beatColOf(f as never);
      const fid = makeFrameAt(f.parentId, beat, nextSubIndex(rf.getNodes() as never, f.parentId, beat));
      if (!fid) { flashToast(`max ${RESERVED_ROWS} frames per beat`); return; } // cap reached (item 4)
      window.setTimeout(() => enterFrame(fid), 40);
    }
  }, [rf, enterFrame, makeFrameAt, flashToast]);

  /** → / ← — walk beat COLUMNS (same subIndex if it exists, else the beat's first
   *  frame); at a lesson's end, roll into the adjacent lesson (→ next Hook 1, ←
   *  prev lesson's last beat). → alone walks the whole region on camera. */
  const stepBeat = useCallback((dir: -1 | 1) => {
    const cur = currentFrameRef.current;
    if (!cur) return;
    const t = beatNeighborFrame(rf.getNodes() as never, cur, dir) ?? lessonRollFrame(rf.getNodes() as never, cur, dir);
    if (t) enterFrame(t.id);
  }, [rf, enterFrame]);

  const canStepBeat = useCallback((frameId: string, dir: -1 | 1) => !!(beatNeighborFrame(rf.getNodes() as never, frameId, dir) || lessonRollFrame(rf.getNodes() as never, frameId, dir)), [rf]);

  /** Arrows mean frame-navigation only inside a frame AND nothing selected. */
  const frameFreeNav = useCallback(() => {
    if (!currentFrameRef.current) return false;
    const nodes = rf.getNodes();
    const sel = nodes.some((n) => n.selected || (n.data as { _selLine?: string })?._selLine) || rf.getEdges().some((e) => e.selected);
    return !sel;
  }, [rf]);

  /** Lesson "+frame" — appends a Hook sub-frame (grid model). */
  const addFrameToLesson = useCallback((lessonId: string) => makeFrameAt(lessonId, "hook", nextSubIndex(rf.getNodes() as never, lessonId, "hook")), [rf, makeFrameAt]);

  /** HUD "+ frame after" — a new sub-frame in the SAME beat, entered. */
  const addFrameAfter = useCallback((frameId: string) => {
    const f = rf.getNode(frameId);
    if (!f?.parentId) return;
    const beat = beatColOf(f as never);
    const fid = makeFrameAt(f.parentId, beat, nextSubIndex(rf.getNodes() as never, f.parentId, beat));
    if (!fid) { flashToast(`max ${RESERVED_ROWS} frames per beat`); return; }
    window.setTimeout(() => enterFrame(fid), 40);
  }, [rf, makeFrameAt, enterFrame, flashToast]);

  /** ‹ › in the frame header — reorder WITHIN the beat column (swap subIndex +
   *  grid position with the up/down neighbour), one undoable command. */
  const reorderFrame = useCallback((frameId: string, dir: -1 | 1) => {
    const f = rf.getNode(frameId);
    if (!f?.parentId) return;
    const beat = beatColOf(f as never);
    const col = framesInBeat(rf.getNodes() as never, f.parentId, beat);
    const i = col.findIndex((x) => x.id === frameId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= col.length) return;
    const cmds = [
      patchDataCmd(rf as unknown as RfLike, col[i].id, { subIndex: j }, "reorder"),
      patchDataCmd(rf as unknown as RfLike, col[j].id, { subIndex: i }, "reorder"),
    ];
    // grid positions travel with subIndex
    rf.setNodes((nds) => nds.map((n) => (n.id === col[i].id ? { ...n, position: gridPos(beat, j) } : n.id === col[j].id ? { ...n, position: gridPos(beat, i) } : n)));
    const cmd = compositeCmd(cmds, "reorder frame");
    if (cmd) bus.dispatch(cmd);
  }, [rf, gridPos]);

  const frameNav = useMemo<FrameNav>(() => ({ currentFrameId, enter: enterFrame, exit: exitFrame, step: stepBeat, canStep: canStepBeat, addFrame: addFrameToLesson, reorder: reorderFrame }), [currentFrameId, enterFrame, exitFrame, stepBeat, canStepBeat, addFrameToLesson, reorderFrame]);

  /** Row ×: remove MEMBERSHIP only — a tucked card re-deals to its remembered
   *  spot as a loose card first. Cards never vanish. */
  const removeMembership = useCallback(
    (id: string) => {
      const node = rf.getNode(id);
      if (!node) return;
      const d = node.data as unknown as CardData;
      const wasTucked = isTucked(d);
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const center = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
      const target = d.deckPos ?? { x: center.x - 190, y: center.y - 120 };
      const before = { deckMember: d.deckMember, tucked: d.tucked, staged: d.staged, minimized: d.minimized, position: { ...node.position } };
      bus.dispatch({
        label: "leave deck",
        do: () => {
          rf.updateNodeData(id, { deckMember: false, tucked: false, staged: undefined, minimized: undefined });
          if (wasTucked) rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { ...target }, hidden: false } : n)));
        },
        undo: () => {
          rf.updateNodeData(id, { deckMember: before.deckMember, tucked: before.tucked, staged: before.staged, minimized: before.minimized });
          rf.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, position: { ...before.position } } : n)));
        },
      });
    },
    [rf],
  );

  // Focus-zoom tracking — the Esc ladder's rung 3 exits it exactly once.
  const zoomedRef = useRef(false);
  // FOCUS ZOOM INSIDE FILM LOCK (item 1): double-click pushes the camera toward
  // one card, but REMEMBERS the framed shot. In film + inside a frame we capture
  // the exact fitted viewport; ← (the back button) and Esc snap back to it — no
  // free panning while pushed (the film lock already disables panOnDrag).
  const [framePushView, setFramePushView] = useState<{ x: number; y: number; zoom: number } | null>(null);
  const framePushRef = useRef<{ x: number; y: number; zoom: number } | null>(null);
  framePushRef.current = framePushView;
  const returnFromPush = useCallback(() => {
    const v = framePushRef.current;
    if (!v) return false;
    zoomedRef.current = false;
    setFramePushView(null);
    void rf.setViewport(v, { duration: 400 });
    return true;
  }, [rf]);
  const focusNode = useCallback(
    (id: string) => {
      zoomedRef.current = true;
      // remember the framed view to snap back to (temporary push, not a re-frame)
      if (filmRef.current && currentFrameRef.current) setFramePushView(rf.getViewport());
      void rf.fitView({ nodes: [{ id }], duration: 400, padding: 0.4 });
    },
    [rf],
  );

  // DEV probe: drive the React Flow instance from the console (import.meta.env.DEV only).
  // __rfStore lets headless tests force node measurement synchronously — hidden tabs
  // freeze requestAnimationFrame, which starves ResizeObserver AND the public
  // useUpdateNodeInternals hook (both deliver on frames).
  const storeApi = useStoreApi();
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__rf = rf;
      (window as unknown as Record<string, unknown>).__rfStore = storeApi;
    }
  }, [rf, storeApi]);

  // ARROWS ROOT CAUSE (C1, finally nailed in V2): React Flow keeps a node
  // INVISIBLE and unconnectable until initialized — measured.width set AND
  // handleBounds registered. Both normally arrive via ResizeObserver→rAF, and
  // rAF can be throttled to ZERO in occluded/background windows (measured
  // live: rAF never fired at all — even useUpdateNodeInternals defers through
  // its own rAF, so the old hook-based rescue was dead in exactly the
  // environments that needed it). Rescue synchronously through the store
  // instead. Zones are exempt: no handles by design, so they'd loop forever.
  useEffect(() => {
    const { nodeLookup, domNode, updateNodeInternals: forceInternals } = storeApi.getState();
    const updates = new Map<string, { id: string; nodeElement: HTMLDivElement; force: boolean }>();
    for (const n of liveNodes) {
      if (n.hidden || n.type === "zone") continue;
      const initialized = n.measured && typeof n.measured.width === "number" && !!nodeLookup.get(n.id)?.internals.handleBounds;
      if (initialized) continue;
      const nodeElement = domNode?.querySelector<HTMLDivElement>(`.react-flow__node[data-id="${n.id}"]`);
      if (nodeElement) updates.set(n.id, { id: n.id, nodeElement, force: true });
    }
    if (updates.size > 0) forceInternals(updates, { triggerFitView: false });
  }, [liveNodes, storeApi]);

  // Last known pointer position (screen coords) — quick-spawn drops cards at the cursor.
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const onMove = (e: PointerEvent) => { lastMouse.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  // ---- spawn at viewport center (palette) or at a screen point (quick-spawn) ----
  const spawn = useCallback(
    (data: CardData, at?: { x: number; y: number }) => {
      const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
      const center = rf.screenToFlowPosition(
        at ?? {
          x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2,
          y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2,
        },
      );
      // exclusive-select the new card so the stepper/focus hotkeys target it
      rf.setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
      // newly spawned JE cards get the CURRENT canvas default mode stamped in
      if (data.kind === "je" && !(data as JeCard).settings) {
        data = { ...data, mode: jePreset, settings: { ...JE_PRESETS[jePreset] } } as CardData;
      }
      const id = cardId(data.kind);
      bus.dispatch(
        addNodesCmd(
          rf as unknown as RfLike,
          [
            {
              id,
              type: data.kind,
              position: at
                ? { x: center.x, y: center.y }
                : { x: center.x - 140 + (Math.random() * 40 - 20), y: center.y - 80 + (Math.random() * 40 - 20) },
              data: data as unknown as CardData & Record<string, unknown>,
              selected: true,
            },
          ],
          `spawn ${data.kind}`,
        ),
      );
      return id;
    },
    [rf, jePreset],
  );

  /** Quick-spawn (J/T/N/Q/L): blank at the cursor, edit mode on, first field focused. */
  const quickSpawn = useCallback(
    (kind: Parameters<typeof blankCard>[0]) => {
      const id = spawn(blankCard(kind), lastMouse.current ?? undefined);
      // focus the first editable field once the node has mounted
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(
            `.react-flow__node[data-id="${id}"] input:not([placeholder="${kind}"]), .react-flow__node[data-id="${id}"] textarea`,
          );
          el?.focus();
        }),
      );
    },
    [spawn],
  );

  /** "D" — duplicate the single selected card, landing directly UNDERNEATH it
   *  (the same clone-below rule the JE Copy button uses). Bus command, so one
   *  Ctrl+Z removes the copy. No-op unless exactly one non-container card is
   *  selected (a group is the GroupChromeBar's clone job, not this). */
  const duplicateSelected = useCallback(() => {
    const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type));
    if (sel.length !== 1) return;
    const node = sel[0];
    const kind = (node.data as unknown as CardBase).kind ?? "card";
    const below = { x: node.position.x, y: node.position.y + (node.measured?.height ?? 180) + 24 };
    bus.dispatch(
      addNodesCmd(
        rf as unknown as RfLike,
        [{ ...node, id: cardId(kind), selected: false, parentId: node.parentId, position: below, data: structuredClone(node.data) }],
        "duplicate card",
      ),
    );
  }, [rf]);

  /** FF-2: nudge the filming SCALE of every selected card by ±step (clamped
   *  0.25–1), one undoable command. Reads the EFFECTIVE scale first (so the
   *  first nudge on a framed 60% card moves from 0.6, not 1). Containers/elements
   *  are skipped — only cards scale. */
  const scaleSelected = useCallback((step: number) => {
    const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type) && !isElementKind((n.data as unknown as CardBase).kind));
    if (!sel.length) return;
    const cmds = sel.map((n) => {
      const d = n.data as unknown as CardBase;
      const cur = typeof d.scale === "number"
        ? d.scale
        : (n.parentId && rf.getNode(n.parentId)?.type === "frame" ? FRAME_CARD_SCALE : 1);
      return patchDataCmd(rf as unknown as RfLike, n.id, { scale: clampScale(cur + step) }, "scale card");
    });
    const cmd = compositeCmd(cmds, step > 0 ? "scale up" : "scale down");
    if (cmd) bus.dispatch(cmd);
  }, [rf]);

  // ---- PASTE ROUTER (cross-tab copy/paste) ----------------------------------
  // 1. our card JSON (marker __saCanvasCards) → spawn with FRESH ids at cursor
  // 2. image file → image card uploading in place
  // 3. plain text → focused editor only (typing targets return early; the
  //    canvas itself ignores loose text)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (text.includes("__saCanvasCards")) {
        try {
          const payload = JSON.parse(text) as { __saCanvasCards?: number; cards?: CardNode[] };
          if (payload.__saCanvasCards === 1 && Array.isArray(payload.cards) && payload.cards.length) {
            e.preventDefault();
            const at = lastMouse.current
              ? rf.screenToFlowPosition(lastMouse.current)
              : rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
            // keep the copied group's relative layout, anchored at the cursor
            const minX = Math.min(...payload.cards.map((n) => n.position.x));
            const minY = Math.min(...payload.cards.map((n) => n.position.y));
            const fresh = payload.cards.map((n) => ({
              ...n,
              id: cardId((n.data as unknown as CardData).kind),
              position: { x: at.x + (n.position.x - minX), y: at.y + (n.position.y - minY) },
              parentId: undefined,
              selected: true,
            }));
            rf.setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
            bus.dispatch(addNodesCmd(rf as unknown as RfLike, fresh, "paste cards"));
            return;
          }
        } catch { /* not ours — fall through */ }
      }
      const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!file) return;
      e.preventDefault();
      const id = spawn({ kind: "image", url: "", fit: "contain", caption: "" }, lastMouse.current ?? undefined);
      void uploadImageFile(file)
        .then((url) => rf.updateNodeData(id, { url }))
        .catch((err) => rf.updateNodeData(id, { caption: `upload failed: ${err instanceof Error ? err.message : err}` }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [spawn, rf]);

  // Ctrl+C with cards selected (and no text selection) → card JSON to the SYSTEM
  // clipboard with our marker — works across tabs and windows.
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((window.getSelection()?.toString() ?? "") !== "") return; // real text copy wins
      const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type));
      if (sel.length === 0) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", JSON.stringify({ __saCanvasCards: 1, cards: sanitizeSceneNodes(structuredClone(sel)) }));
    };
    window.addEventListener("copy", onCopy);
    return () => window.removeEventListener("copy", onCopy);
  }, [rf]);

  const addZone = useCallback(() => {
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    bus.dispatch(
      addNodesCmd(
        rf as unknown as RfLike,
        [
          {
            id: cardId("zone"),
            type: "zone",
            position: { x: center.x - 260, y: center.y - 160 },
            width: 520,
            height: 320,
            zIndex: -1,
            data: { kind: "note", label: "New zone", w: 520, h: 320 } as unknown as CardData & Record<string, unknown>,
          },
        ],
        "add zone",
      ),
    );
  }, [rf]);

  const addLesson = useCallback(() => {
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    bus.dispatch(
      addNodesCmd(
        rf as unknown as RfLike,
        [
          {
            id: cardId("lesson"),
            type: "lesson",
            position: { x: center.x - 230, y: center.y - 140 },
            width: 460,
            height: 280,
            zIndex: -1,
            data: { kind: "note", label: "New lesson", w: 460, h: 280, pathOrder: null } as unknown as CardData & Record<string, unknown>,
          },
        ],
        "add lesson",
      ),
    );
  }, [rf]);

  // ---- drag undo: snapshot {position, parentId} at drag start; one command per drag ----
  const dragStart = useRef<Map<string, { position: { x: number; y: number }; parentId?: string }> | null>(null);
  const onNodeDragStart = useCallback(
    (_e: unknown, _node: CardNode, nodes: CardNode[]) => {
      dragStart.current = new Map(nodes.map((n) => [n.id, { position: { ...n.position }, parentId: n.parentId }]));
      // DRAG PERF (PROMPT A): edges touching a dragged node simplify to a
      // straight path for the duration (no smoothstep corner math per frame).
      // Transient — raw setEdges, not the bus; onNodeDragStop restores.
      const dragged = new Set(nodes.map((n) => n.id));
      rf.setEdges((eds) =>
        eds.map((e) => (dragged.has(e.source) || dragged.has(e.target) ? { ...e, data: { ...e.data, _drag: true } } : e)),
      );
    },
    [rf],
  );
  // ---- SNAP GUIDES: edge/center matches vs nearby cards while dragging; the
  // drop settles onto a guide within threshold (no mid-drag position fighting).
  const SNAP_TH = 6; // flow units
  // Guides carry a WEIGHT so composition lines render at different strengths
  // (frame center strongest → fifths lightest); positions are in SCREEN px.
  type ScreenGuide = { pos: number; weight: GuideWeight };
  const [guides, setGuides] = useState<{ v: ScreenGuide[]; h: ScreenGuide[] }>({ v: [], h: [] });
  const guideMatches = useCallback(
    (node: CardNode) => {
      const w = node.measured?.width ?? 300;
      const h = node.measured?.height ?? 170;
      const mine = { xs: [node.position.x, node.position.x + w / 2, node.position.x + w], ys: [node.position.y, node.position.y + h / 2, node.position.y + h] };
      const vx: number[] = [];
      const vy: number[] = [];
      let snapX: number | null = null;
      let snapY: number | null = null;
      for (const o of rf.getNodes()) {
        if (o.id === node.id || isContainerType(o.type) || o.hidden) continue;
        const ow = o.measured?.width ?? 300;
        const oh = o.measured?.height ?? 170;
        for (const ox of [o.position.x, o.position.x + ow / 2, o.position.x + ow]) {
          for (let i = 0; i < 3; i++) {
            const d = ox - mine.xs[i];
            if (Math.abs(d) <= SNAP_TH) { vx.push(ox); if (snapX == null) snapX = node.position.x + d; }
          }
        }
        for (const oy of [o.position.y, o.position.y + oh / 2, o.position.y + oh]) {
          for (let i = 0; i < 3; i++) {
            const d = oy - mine.ys[i];
            if (Math.abs(d) <= SNAP_TH) { vy.push(oy); if (snapY == null) snapY = node.position.y + d; }
          }
        }
      }
      return { vx: [...new Set(vx)].slice(0, 3), vy: [...new Set(vy)].slice(0, 3), snapX, snapY };
    },
    [rf],
  );
  // dimensions + absolute origin of a node (measured wins, then explicit, then data)
  type RfNodeLike = { id: string; type?: string; parentId?: string; position: { x: number; y: number }; measured?: { width?: number; height?: number }; width?: number; height?: number; data?: Record<string, unknown>; hidden?: boolean };
  const dimW = useCallback((n: RfNodeLike) => (n.measured?.width ?? n.width ?? ((n.data?.w as number | undefined)) ?? 300), []);
  const dimH = useCallback((n: RfNodeLike) => (n.measured?.height ?? n.height ?? ((n.data?.h as number | undefined)) ?? 170), []);
  const absOrigin = useCallback((n: RfNodeLike) => {
    let x = n.position.x, y = n.position.y;
    let p = n.parentId ? rf.getNode(n.parentId) : undefined;
    let g = 0;
    while (p && g++ < 20) { x += p.position.x; y += p.position.y; p = p.parentId ? rf.getNode(p.parentId) : undefined; }
    return { x, y };
  }, [rf]);
  const frameSiblingRects = useCallback((frameId: string, exceptId: string) =>
    rf.getNodes()
      .filter((n) => n.parentId === frameId && n.id !== exceptId && !isContainerType(n.type) && !n.hidden)
      .map((n) => ({ x: n.position.x, y: n.position.y, w: dimW(n), h: dimH(n) })),
    [rf, dimW, dimH]);
  // COMPOSITION GUIDES (item 1) — a card dragged INSIDE a frame gets the frame's
  // center/thirds/fifths/safe lines + sibling-center matches in frame-local space.
  const frameGuidesFor = useCallback((node: RfNodeLike, parent: RfNodeLike, altBypass: boolean) => {
    return frameCompositionGuides(
      { w: dimW(parent), h: dimH(parent) },
      { x: node.position.x, y: node.position.y, w: dimW(node), h: dimH(node) },
      frameSiblingRects(parent.id, node.id),
      { altBypass },
    );
  }, [dimW, dimH, frameSiblingRects]);
  const onNodeDrag = useCallback(
    (e: unknown, node: CardNode) => {
      if (isContainerType(node.type)) { setGuides({ v: [], h: [] }); return; }
      const parent = node.parentId ? rf.getNode(node.parentId) : undefined;
      if (parent?.type === "frame") {
        if (!compositionGuides || filmRef.current) { setGuides({ v: [], h: [] }); return; }
        const g = frameGuidesFor(node, parent, !!(e as MouseEvent | undefined)?.altKey);
        const fo = absOrigin(parent);
        setGuides({
          v: g.v.map((l) => ({ pos: rf.flowToScreenPosition({ x: fo.x + l.pos, y: 0 }).x, weight: l.weight })),
          h: g.h.map((l) => ({ pos: rf.flowToScreenPosition({ x: 0, y: fo.y + l.pos }).y, weight: l.weight })),
        });
        return;
      }
      if (node.parentId) { setGuides({ v: [], h: [] }); return; }
      const m = guideMatches(node);
      setGuides({
        v: m.vx.map((gx) => ({ pos: rf.flowToScreenPosition({ x: gx, y: 0 }).x, weight: "card" as GuideWeight })),
        h: m.vy.map((gy) => ({ pos: rf.flowToScreenPosition({ x: 0, y: gy }).y, weight: "card" as GuideWeight })),
      });
    },
    [rf, guideMatches, compositionGuides, frameGuidesFor, absOrigin],
  );

  /** Runs AFTER container parenting settles: diff the snapshots, dispatch ONE move
   *  command. do() re-applies the landing spot, so dispatching post-hoc is a visual
   *  no-op. `settled` carries the parenting updater's OWN output — rf.getNode()
   *  lags one setNodes call behind the store updaters see (observed live: the
   *  after-snapshot read the pre-parenting state and stripped a just-set parentId,
   *  which is why cards never actually rode their zones). */
  const commitDrag = useCallback((settled?: Map<string, { position: { x: number; y: number }; parentId?: string }> | null) => {
    const before = dragStart.current;
    dragStart.current = null;
    if (!before) return;
    const after = new Map<string, { position: { x: number; y: number }; parentId?: string }>();
    let changed = false;
    for (const [nid, b] of before) {
      const n = settled?.get(nid) ?? rf.getNode(nid);
      if (!n) continue;
      const a = { position: { ...n.position }, parentId: n.parentId };
      after.set(nid, a);
      if (a.position.x !== b.position.x || a.position.y !== b.position.y || a.parentId !== b.parentId) changed = true;
    }
    if (!changed) return;
    const apply = (m: typeof before) =>
      rf.setNodes((nds) => nds.map((n) => (m.has(n.id) ? { ...n, position: { ...m.get(n.id)!.position }, parentId: m.get(n.id)!.parentId } : n)));
    bus.dispatch({ label: "move card", do: () => apply(after), undo: () => apply(before) });
  }, [rf]);

  // ---- container membership: drop a card inside a LESSON (finer tier wins)
  // or a zone/region → parent it (it then moves with the box natively) ----
  const onNodeDragStop = useCallback((e: unknown, node: CardNode) => {
    setGuides({ v: [], h: [] });
    // restore smoothstep routing on every edge the drag simplified
    rf.setEdges((eds) => eds.map((ed) => (ed.data?._drag ? { ...ed, data: { ...ed.data, _drag: undefined } } : ed)));
    // regions + lessons stay top-level; FRAMES fall through — they parent INTO a lesson
    if (node.type === "zone" || node.type === "lesson") { commitDrag(); return; }
    // COMPOSITION SNAP (item 1) — a card dropped inside a frame settles onto the
    // nearest frame line (center/thirds/fifths/safe/sibling-center); Alt bypasses.
    // Keeps parentId=frame so the parenting math below reads the snapped local pos.
    if (node.parentId && compositionGuides && !filmRef.current) {
      const parent = rf.getNode(node.parentId);
      if (parent?.type === "frame") {
        const g = frameGuidesFor(node, parent, !!(e as MouseEvent | undefined)?.altKey);
        if (g.snapX != null || g.snapY != null) {
          const np = { x: g.snapX ?? node.position.x, y: g.snapY ?? node.position.y };
          rf.setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: np } : n)));
          node = { ...node, position: np };
        }
      }
    }
    // settle onto a matched guide (within threshold) before parenting/commit
    if (!node.parentId) {
      const m = guideMatches(node);
      if (m.snapX != null || m.snapY != null) {
        rf.setNodes((nds) =>
          nds.map((n) => (n.id === node.id ? { ...n, position: { x: m.snapX ?? n.position.x, y: m.snapY ?? n.position.y } } : n)),
        );
        node = { ...node, position: { x: m.snapX ?? node.position.x, y: m.snapY ?? node.position.y } };
      }
    }
    // Decide the parenting SYNCHRONOUSLY from the current store, then write.
    // rf.setNodes defers its updater, so nothing written here can be read back
    // in this tick (observed live: a settled-state capture inside the updater
    // was still null when the drag command snapshotted, and the command's
    // queued do() then stripped the just-set parentId — cards never actually
    // rode their zones). The decision below feeds BOTH the store write and the
    // drag command's after-snapshot, so they can't disagree.
    //
    // GROUP MOVE (PROMPT B): the SAME container decision runs for EVERY
    // co-dragged card (multi-select drag), so moving a group into or out of a
    // lesson reparents the whole group — one setNodes, one drag command.
    const nds = rf.getNodes();
    const byId = new Map(nds.map((n) => [n.id, n]));
    // absolute pos walking the full parent chain (card→frame→lesson)
    const absPos = (n: CardNode): { x: number; y: number } => {
      let x = n.position.x, y = n.position.y;
      let p = n.parentId ? byId.get(n.parentId) : undefined;
      let g = 0;
      while (p && g++ < 20) { x += p.position.x; y += p.position.y; p = p.parentId ? byId.get(p.parentId) : undefined; }
      return { x, y };
    };
    // FRAMES parent to LESSONS; a CARD prefers a FRAME (innermost), then a lesson,
    // then a zone. Frames listed first so a card dropped in a frame joins the frame.
    const isFrameDrag = node.type === "frame";
    const containers = isFrameDrag
      ? nds.filter((n) => n.type === "lesson")
      : [...nds.filter((n) => n.type === "frame"), ...nds.filter((n) => n.type === "lesson"), ...nds.filter((n) => n.type === "zone")];
    const absOf = (n: CardNode) => absPos(n);
    const hitFor = (abs: { x: number; y: number }) =>
      containers.find((z) => {
        const w = (z.data as unknown as ZoneBox).w ?? z.width ?? 0;
        const h = (z.data as unknown as ZoneBox).h ?? z.height ?? 0;
        const zp = absPos(z as CardNode);
        return abs.x > zp.x && abs.y > zp.y && abs.x < zp.x + w && abs.y < zp.y + h;
      });
    // Co-dragged nodes: rf.getNode lags XYDrag's writes at drag-stop (deferred
    // store), so their end positions derive from the PRIMARY's DELTA against
    // the drag-start snapshot — parents can't change mid-drag, so start-abs +
    // delta IS the true landing spot.
    const start = dragStart.current;
    const startAbsOf = (nid: string): { x: number; y: number } | null => {
      const s = start?.get(nid);
      if (!s) return null;
      if (!s.parentId) return s.position;
      // walk from the (unchanged) start parent up the live chain
      let x = s.position.x, y = s.position.y;
      let p = byId.get(s.parentId);
      let g = 0;
      while (p && g++ < 20) { x += p.position.x; y += p.position.y; p = p.parentId ? byId.get(p.parentId) : undefined; }
      return { x, y };
    };
    const primaryStartAbs = startAbsOf(node.id);
    const primaryEndAbs = absOf(node);
    const delta = primaryStartAbs
      ? { x: primaryEndAbs.x - primaryStartAbs.x, y: primaryEndAbs.y - primaryStartAbs.y }
      : { x: 0, y: 0 };
    const draggedIds = new Set(start?.keys() ?? []);
    draggedIds.add(node.id);
    // SINGLE-SELECT INVARIANT (#1): a GROUP move happens ONLY with an explicit
    // multi-selection (≥2 cards selected, the grabbed one among them). React
    // Flow's drag set is `selected ∪ grabbed`, so a stray still-selected card
    // would otherwise ride along when you drag a lone card. When it's not a
    // genuine group drag, move ONLY the primary and snap any card XYDrag
    // already nudged back to its drag-start spot. (rule: intendedDragIds)
    const selectedCardIds = nds.filter((n) => n.selected && !isContainerType(n.type)).map((n) => n.id);
    const isGroupDrag = isExplicitGroupDrag(selectedCardIds, node.id);
    if (!isGroupDrag && draggedIds.size > 1) {
      const restores: { id: string; position: { x: number; y: number }; parentId?: string }[] = [];
      for (const nid of draggedIds) {
        if (nid === node.id) continue;
        const s = start?.get(nid);
        if (s) restores.push({ id: nid, position: { ...s.position }, parentId: s.parentId });
      }
      if (restores.length) {
        rf.setNodes((cur) =>
          cur.map((n) => {
            const r = restores.find((x) => x.id === n.id);
            return r ? { ...n, position: { ...r.position }, parentId: r.parentId } : n;
          }),
        );
      }
      draggedIds.clear();
      draggedIds.add(node.id);
    }
    const decisions = new Map<string, { position: { x: number; y: number }; parentId?: string }>();
    for (const nid of draggedIds) {
      const cur = nid === node.id ? node : rf.getNode(nid);
      if (!cur || isContainerType(cur.type)) continue;
      const sAbs = nid === node.id ? null : startAbsOf(nid);
      const abs = nid === node.id ? primaryEndAbs : sAbs ? { x: sAbs.x + delta.x, y: sAbs.y + delta.y } : absOf(cur as CardNode);
      const hit = hitFor(abs);
      const startParent = start?.get(nid)?.parentId ?? cur.parentId;
      if (hit && startParent !== hit.id) {
        const hp = absPos(hit as CardNode); // parent-relative pos = abs − parent-abs (nesting-safe)
        decisions.set(nid, { parentId: hit.id, position: { x: abs.x - hp.x, y: abs.y - hp.y } });
      } else if (!hit && startParent) {
        decisions.set(nid, { parentId: undefined, position: abs });
      }
    }
    if (decisions.size > 0) {
      rf.setNodes((cur) =>
        cur.map((n) => {
          const d = decisions.get(n.id);
          return d ? { ...n, parentId: d.parentId, position: { ...d.position } } : n;
        }),
      );
    }
    // after-state: decisions win; undecided dragged nodes fall back to
    // rf.getNode inside commitDrag — XYDrag's own position writes ARE visible
    // by drag-stop. The primary's snap-settled spot rides along explicitly.
    const settled = new Map(decisions);
    if (!settled.has(node.id)) settled.set(node.id, { position: { ...node.position }, parentId: node.parentId });
    commitDrag(settled);
    // ARROWS STAY ATTACHED (#2): after a move — especially a reparent, which
    // changes a node's coordinate space — React Flow can hold stale handle
    // bounds, so a line-anchored (ln:<lineId>) edge renders to the old spot and
    // looks detached. Re-measuring the dragged nodes' internals re-pins every
    // edge to its live handle. Runs next frame so the setNodes writes above land
    // first.
    requestAnimationFrame(() => {
      for (const nid of draggedIds) updateNodeInternals(nid);
    });
  }, [rf, commitDrag, guideMatches, updateNodeInternals, compositionGuides, frameGuidesFor]);

  // ---- scenes (JSON blobs cross the server-fn boundary as strings) ----
  const serialize = useCallback(() => {
    const vp = rf.getViewport();
    return {
      name: sceneName,
      // sanitize: transient state (selected/dragging/_arrowPending) must not round-trip —
      // persisted multi-selection made loaded cards drag as a group (S2.0 bug)
      nodes_json: JSON.stringify({
        // v2: deckMember/tucked replace staged/minimized (loader migrates v1)
        // v3: blind retired (loader normalizes), lesson nodes, JE mode/solution/
        //     reviewLock/helpOpen, posLock, video plannedTitle/internalNote — all
        //     additive, so v2 scenes open unchanged.
        // v4: FRAME nodes (16:9 shot tier) + named decks (scene.decks) + memo
        //     nodes — all additive; v≤3 scenes load unchanged (no frames/decks).
        schema_version: 5,
        nodes: sanitizeSceneNodes(rf.getNodes()),
        // edges: strip transient interaction data (_drag/_pulse) — same
        // contract as node _-keys; selected must not round-trip either
        edges: rf.getEdges().map(({ selected, ...e }) => {
          void selected;
          if (!e.data) return e;
          const data = Object.fromEntries(Object.entries(e.data).filter(([k]) => !k.startsWith("_")));
          return { ...e, data };
        }),
        sceneSettings: { jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette, courseId: sceneCourseId, chapterId: sceneChapterId, frameTransitions, spaceAdvancesFrames, rehearsalHud, compositionGuides, backstage, filmEntrancePop, filmCheckGlow, framePath, prompterCorner, introClipLength, autoTrimIntros, beatNotes },
        decks, // NAMED DECKS (P3)
      }),
      viewport_json: JSON.stringify(vp),
      bg: encodeBg(bgCfg),
    };
  }, [rf, sceneName, bgCfg, jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette, sceneCourseId, sceneChapterId, decks, frameTransitions, spaceAdvancesFrames, rehearsalHud, compositionGuides, backstage, filmEntrancePop, filmCheckGlow, framePath, prompterCorner, introClipLength, autoTrimIntros, beatNotes]);

  const doSave = useCallback(
    async (asNew?: boolean) => {
      const body = serialize();
      try {
        const res = await saveScene({ data: { ...body, id: asNew ? undefined : sceneId ?? undefined } });
        setSceneId(res.id);
        setSavedAt(new Date().toLocaleTimeString());
        setDbDown(null);
        // the active tab is clean now (and knows its scene row)
        setTabState((p) => ({ ...p, tabs: p.tabs.map((t) => (t.key === p.active ? { ...t, dirty: false, sceneId: res.id, name: body.name } : t)) }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDbDown(msg);
        try {
          localStorage.setItem(LS_KEY, JSON.stringify(body));
          setSavedAt(`${new Date().toLocaleTimeString()} (localStorage)`);
        } catch { /* ignore */ }
      }
    },
    [serialize, sceneId],
  );

  const applyScene = useCallback(
    (payload: { name: string; nodes_json: string; viewport_json: string; bg?: string | null }, id: string | null) => {
      let nj: {
        schema_version?: number;
        nodes?: CardNode[];
        edges?: unknown[];
        sceneSettings?: { jeCardWidth?: number; jeIndent?: number; jePreset?: string; dealFaceDown?: boolean; hideFdLabels?: boolean; focusPalette?: boolean };
        decks?: DeckDef[];
      } = {};
      let vp: Viewport | null = null;
      try {
        nj = JSON.parse(payload.nodes_json || "{}");
        vp = JSON.parse(payload.viewport_json || "null");
      } catch (e) {
        setDbDown(`Scene payload unreadable: ${e instanceof Error ? e.message : e}`); // fail loud
        return;
      }
      // schema_version 1 (loader tolerates absence — pre-versioning scenes load fine)
      bus.clear(); // history refers to nodes that no longer exist
      // sanitize on LOAD too (S2.0 heal) + migrate v1 staged/minimized → deckMember/tucked
      rf.setNodes(migrateLegendSlips(migrateZTiers(migrateFrameLocks(migrateFrameGrid(migrateJeMemos(migrateElementDeckFields(migrateDeckFields(sanitizeSceneNodes((nj.nodes ?? []) as CardNode[])), isElementKind)))))));
      // old Ctrl+click-era edges have no handle ids — stamp r→l + smoothstep
      rf.setEdges(migrateEdges((nj.edges ?? []) as never[]));
      setSceneName(payload.name);
      setSceneId(id);
      setDecks(Array.isArray(nj.decks) ? nj.decks : []); // named decks (P3)
      if (typeof nj.sceneSettings?.jeCardWidth === "number") setJeCardWidth(nj.sceneSettings.jeCardWidth);
      if (typeof nj.sceneSettings?.jeIndent === "number") setJeIndent(nj.sceneSettings.jeIndent);
      // v≤2 scenes may say "blind" — normalize maps it to practice (blind retired)
      if (typeof nj.sceneSettings?.jePreset === "string") setJePreset(normalizePreset(nj.sceneSettings.jePreset));
      if (typeof nj.sceneSettings?.dealFaceDown === "boolean") setDealFaceDown(nj.sceneSettings.dealFaceDown);
      if (typeof nj.sceneSettings?.hideFdLabels === "boolean") setHideFdLabels(nj.sceneSettings.hideFdLabels);
      if (typeof nj.sceneSettings?.focusPalette === "boolean") setFocusPalette(nj.sceneSettings.focusPalette);
      setFrameTransitions((nj.sceneSettings as { frameTransitions?: boolean } | undefined)?.frameTransitions !== false); // default on
      setSpaceAdvancesFrames((nj.sceneSettings as { spaceAdvancesFrames?: boolean } | undefined)?.spaceAdvancesFrames !== false); // default on
      setRehearsalHud((nj.sceneSettings as { rehearsalHud?: boolean } | undefined)?.rehearsalHud === true); // default off
      setCompositionGuides((nj.sceneSettings as { compositionGuides?: boolean } | undefined)?.compositionGuides !== false); // default on
      { const bs = (nj.sceneSettings as { backstage?: string } | undefined)?.backstage; setBackstage(bs === "dark" || bs === "gray" || bs === "light" ? bs : "cinema"); } // default cinema
      setFilmEntrancePop((nj.sceneSettings as { filmEntrancePop?: boolean } | undefined)?.filmEntrancePop !== false); // default on
      setFilmCheckGlow((nj.sceneSettings as { filmCheckGlow?: boolean } | undefined)?.filmCheckGlow !== false); // default on
      setFramePath((nj.sceneSettings as { framePath?: boolean } | undefined)?.framePath === true); // default off
      { const pc = (nj.sceneSettings as { prompterCorner?: string } | undefined)?.prompterCorner; setPrompterCorner(pc === "tl" || pc === "tr" ? pc : "tc"); } // teleprompter corner, default top-center
      { const cl = (nj.sceneSettings as { introClipLength?: number } | undefined)?.introClipLength; if (typeof cl === "number" && cl > 0) setIntroClipLength(cl); setAutoTrimIntros((nj.sceneSettings as { autoTrimIntros?: boolean } | undefined)?.autoTrimIntros !== false); } // auto-trim default on
      { const bn = (nj.sceneSettings as { beatNotes?: Record<string, string> } | undefined)?.beatNotes; if (bn && typeof bn === "object") setBeatNotes((prev) => ({ ...prev, ...bn })); } // global director notes travel with the scene, merged over the local set
      const ss = nj.sceneSettings as { courseId?: string | null; chapterId?: string | null } | undefined;
      setSceneCourseId(ss?.courseId ?? null);
      setSceneChapterId(ss?.chapterId ?? null);
      const cfg = decodeBg(payload.bg);
      if (cfg) setBgCfg(cfg);
      const vpFinal = vp;
      if (vpFinal && typeof vpFinal.zoom === "number") setTimeout(() => rf.setViewport(vpFinal), 0);
      // HYDRATION INTEGRITY: rf.setNodes silently no-ops when the RF store
      // isn't ready (fresh mount + restore effect races onInit). Re-apply once;
      // if the canvas is still empty, say so loudly — autosave already refuses
      // empty writes, so the row is safe either way.
      const expected = (nj.nodes ?? []).length;
      if (expected > 0) {
        setTimeout(() => {
          if (rf.getNodes().length === 0) {
            rf.setNodes(migrateLegendSlips(migrateZTiers(migrateFrameLocks(migrateFrameGrid(migrateJeMemos(migrateElementDeckFields(migrateDeckFields(sanitizeSceneNodes((nj.nodes ?? []) as CardNode[])), isElementKind)))))));
            rf.setEdges(migrateEdges((nj.edges ?? []) as never[]));
            setTimeout(() => {
              if (rf.getNodes().length === 0) setDbDown(`Scene "${payload.name}" loaded but the canvas failed to hydrate — reload the page (autosave is holding off).`);
            }, 600);
          }
        }, 250);
      }
    },
    [rf],
  );

  const openLoad = useCallback(async () => {
    try {
      const rows = await listScenes();
      setScenes(rows);
      setDbDown(null);
      setLoadOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDbDown(msg);
      // localStorage fallback: offer the one fallback scene if present
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
      if (raw) {
        const body = JSON.parse(raw) as { name: string; nodes_json: string; viewport_json: string; bg?: string };
        applyScene(body, null);
      }
    }
  }, [applyScene]);

  /** Reset the CURRENT tab's canvas to a blank untitled scene. */
  const clearCanvasState = useCallback(() => {
    bus.clear();
    rf.setNodes([]);
    rf.setEdges([]);
    setSceneId(null);
    setSceneName("Untitled scene");
    setDecks([]);
    setSavedAt(null);
    setSceneCourseId(null);
    setSceneChapterId(null);
    setFilm(false);
    setClean(false);
  }, [rf]);

  // ---- SCENE TABS (workspace chrome): ONE React Flow instance; every tab is a
  // full snapshot (nodes, edges, viewport, settings, film/clean) swapped in and
  // out on switch — deck, space-walk, film mode, and selection all ride the
  // snapshot, so they're per-tab by construction. Undo history is per-visit
  // (the bus clears on switch: its commands reference the other tab's nodes).
  const snapshotCurrent = useCallback(
    (): TabSnap => ({
      nodes: structuredClone(rf.getNodes()) as CardNode[],
      edges: structuredClone(rf.getEdges()) as unknown[],
      viewport: rf.getViewport(),
      settings: { jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette, courseId: sceneCourseId, chapterId: sceneChapterId },
      bg: bgCfg,
      film,
      clean,
      savedAt,
    }),
    [rf, jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette, sceneCourseId, sceneChapterId, bgCfg, film, clean, savedAt],
  );

  const applySnap = useCallback(
    (t: TabEntry) => {
      const s = t.snap!;
      bus.clear();
      rf.setNodes(structuredClone(s.nodes));
      rf.setEdges(structuredClone(s.edges) as never[]);
      setSceneId(t.sceneId);
      setSceneName(t.name);
      setSavedAt(s.savedAt);
      setJeCardWidth(s.settings.jeCardWidth);
      setJeIndent(s.settings.jeIndent);
      setJePreset(s.settings.jePreset);
      setDealFaceDown(s.settings.dealFaceDown);
      setHideFdLabels(s.settings.hideFdLabels);
      setFocusPalette(s.settings.focusPalette);
      setSceneCourseId(s.settings.courseId);
      setSceneChapterId(s.settings.chapterId);
      setBgCfg(s.bg);
      setFilm(s.film);
      setClean(s.clean);
      if (s.viewport) setTimeout(() => rf.setViewport(s.viewport!), 0);
    },
    [rf],
  );

  /** True while a scene row is in flight for the ACTIVE tab. While set, the
   *  canvas content is NOT the scene's truth — autosave must not write it and
   *  tab switches must not snapshot it. Guards the data-loss path where a tab
   *  carried a sceneId over a blank canvas (load pending, rejected, or
   *  rf.setNodes dropped pre-init) and autosave overwrote the real row with
   *  zero nodes (killed "polish round-trip"/"arrows round-trip", 2026-07-14). */
  const sceneLoadingRef = useRef(false);

  /** Activate a tab whose scene was never visited this session — load from db;
   *  missing scenes drop silently (spec) and the canvas blanks. */
  const activateSceneTab = useCallback(
    async (t: TabEntry) => {
      sceneLoadingRef.current = true;
      try {
        const row = await loadScene({ data: { id: t.sceneId! } });
        applyScene(row, row.id);
      } catch {
        setTabState((p) => {
          const rest = p.tabs.filter((x) => x.key !== t.key);
          return rest.length ? { tabs: rest, active: rest[0].key } : p;
        });
        clearCanvasState();
      } finally {
        sceneLoadingRef.current = false;
      }
    },
    [applyScene, clearCanvasState],
  );

  const switchTab = useCallback(
    (key: string) => {
      if (key === tabState.active) return;
      const target = tabState.tabs.find((t) => t.key === key);
      if (!target) return;
      // mid-load the live canvas is NOT this tab's content — keep its entry
      // snap-less so the next visit reloads from db instead of a bogus snapshot
      const snapped = tabState.tabs.map((t) =>
        t.key === tabState.active ? (sceneLoadingRef.current ? t : { ...t, sceneId, name: sceneName, snap: snapshotCurrent() }) : t,
      );
      setTabState({ tabs: snapped, active: key });
      if (target.snap) applySnap(target);
      else if (target.sceneId) void activateSceneTab(target);
      else clearCanvasState();
    },
    [tabState, sceneId, sceneName, snapshotCurrent, applySnap, activateSceneTab, clearCanvasState],
  );

  /** Toolbar "+": NEW TAB — never clears the current canvas. */
  const newTab = useCallback(() => {
    const key = Math.random().toString(36).slice(2);
    setTabState((p) => ({
      tabs: [...p.tabs.map((t) => (t.key === p.active ? (sceneLoadingRef.current ? t : { ...t, sceneId, name: sceneName, snap: snapshotCurrent() }) : t)), { key, sceneId: null, name: "Untitled scene", dirty: false }],
      active: key,
    }));
    clearCanvasState();
  }, [sceneId, sceneName, snapshotCurrent, clearCanvasState]);

  const closeTab = useCallback(
    (key: string) => {
      const t = tabState.tabs.find((x) => x.key === key);
      if (!t) return;
      const isActive = key === tabState.active;
      const dirty = isActive ? t.dirty : t.dirty; // active dirtiness tracked on the entry
      if (dirty && !window.confirm(`"${isActive ? sceneName : t.name}" has unsaved changes — close anyway?`)) return;
      const rest = tabState.tabs.filter((x) => x.key !== key);
      if (rest.length === 0) {
        const fresh = { key: Math.random().toString(36).slice(2), sceneId: null, name: "Untitled scene", dirty: false };
        setTabState({ tabs: [fresh], active: fresh.key });
        clearCanvasState();
        return;
      }
      if (!isActive) {
        setTabState({ tabs: rest, active: tabState.active });
        return;
      }
      const idx = tabState.tabs.findIndex((x) => x.key === key);
      const next = rest[Math.max(0, idx - 1)];
      setTabState({ tabs: rest, active: next.key });
      if (next.snap) applySnap(next);
      else if (next.sceneId) void activateSceneTab(next);
      else clearCanvasState();
    },
    [tabState, sceneName, applySnap, activateSceneTab, clearCanvasState],
  );

  /** Load-dialog open: focuses the existing tab when the scene is already open
   *  (in-app duplicate prevention); otherwise a NEW tab. */
  const openSceneInTab = useCallback(
    (row: SceneListRow) => {
      setLoadOpen(false);
      const existing = tabState.tabs.find((t) => t.sceneId === row.id);
      if (existing) {
        switchTab(existing.key);
        return;
      }
      const key = Math.random().toString(36).slice(2);
      setTabState((p) => ({
        tabs: [...p.tabs.map((t) => (t.key === p.active ? (sceneLoadingRef.current ? t : { ...t, sceneId, name: sceneName, snap: snapshotCurrent() }) : t)), { key, sceneId: row.id, name: row.name, dirty: false }],
        active: key,
      }));
      void (async () => {
        sceneLoadingRef.current = true;
        try {
          const full = await loadScene({ data: { id: row.id } });
          applyScene(full, full.id);
        } catch (e) {
          setDbDown(e instanceof Error ? e.message : String(e));
        } finally {
          sceneLoadingRef.current = false;
        }
      })();
    },
    [tabState, sceneId, sceneName, snapshotCurrent, switchTab, applyScene],
  );

  // dirty tracking: every bus mutation marks the ACTIVE tab
  useEffect(() => {
    bus.onMutate = () => setTabState((p) => ({ ...p, tabs: p.tabs.map((t) => (t.key === p.active ? { ...t, dirty: true } : t)) }));
    return () => { bus.onMutate = null; };
  }, []);

  // tab set + active persist; restore on reload (saved scenes only — untitled
  // tabs can't be restored without a scene row)
  const restoredTabsRef = useRef(false);
  useEffect(() => {
    if (!restoredTabsRef.current) return; // skip until restore ran
    try {
      const active = tabState.tabs.find((t) => t.key === tabState.active);
      localStorage.setItem(
        "sa-canvas-tabs-v1",
        JSON.stringify({
          tabs: tabState.tabs.filter((t) => (t.key === tabState.active ? sceneId : t.sceneId)).map((t) => (t.key === tabState.active ? { sceneId, name: sceneName } : { sceneId: t.sceneId, name: t.name })),
          activeSceneId: active?.key === tabState.active ? sceneId : null,
        }),
      );
    } catch { /* ignore */ }
  }, [tabState, sceneId, sceneName]);
  useEffect(() => {
    if (restoredTabsRef.current) return;
    restoredTabsRef.current = true;
    try {
      const raw = localStorage.getItem("sa-canvas-tabs-v1");
      if (!raw) return;
      const saved = JSON.parse(raw) as { tabs: { sceneId: string; name: string }[]; activeSceneId: string | null };
      if (!saved.tabs?.length) return;
      const entries: TabEntry[] = saved.tabs.map((s) => ({ key: Math.random().toString(36).slice(2), sceneId: s.sceneId, name: s.name, dirty: false }));
      const activeEntry = entries.find((e) => e.sceneId === saved.activeSceneId) ?? entries[0];
      setTabState({ tabs: entries, active: activeEntry.key });
      void activateSceneTab(activeEntry);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- two-tab guard: first tab to open a scene owns its autosave; a second
  // tab sees the fresh foreign lock, pauses autosave, and shows a banner.
  const TAB_ID = useRef(Math.random().toString(36).slice(2));
  const [tabConflict, setTabConflict] = useState(false);
  const lockKey = sceneId ? `sa-canvas-lock-${sceneId}` : null;
  const lockOwned = useCallback(() => {
    if (!lockKey) return true;
    try {
      const raw = localStorage.getItem(lockKey);
      if (!raw) return true;
      const l = JSON.parse(raw) as { tab: string; at: number };
      return l.tab === TAB_ID.current || Date.now() - l.at > 12_000; // stale = takeable
    } catch { return true; }
  }, [lockKey]);
  useEffect(() => {
    if (!lockKey) { setTabConflict(false); return; }
    const beat = () => {
      const owned = lockOwned();
      setTabConflict(!owned);
      if (!owned) return; // never overwrite a live foreign lock
      try { localStorage.setItem(lockKey, JSON.stringify({ tab: TAB_ID.current, at: Date.now() })); } catch { /* ignore */ }
    };
    beat();
    const t = setInterval(beat, 5_000);
    return () => {
      clearInterval(t);
      try {
        const raw = localStorage.getItem(lockKey);
        if (raw && (JSON.parse(raw) as { tab: string }).tab === TAB_ID.current) localStorage.removeItem(lockKey);
      } catch { /* ignore */ }
    };
  }, [lockKey, lockOwned]);

  // autosave every 30s: the ACTIVE scene (lock-guarded), plus any DIRTY
  // background tabs from their snapshots — each tab autosaves independently.
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;
  useEffect(() => {
    const saveSnapTab = async (t: TabEntry) => {
      // never autosave a 0-node snapshot over a scene row — a blank snap here
      // means load-order breakage, not an intentionally emptied scene (manual
      // Save is the path for persisting a deliberate clear)
      if (!t.sceneId || !t.snap || t.snap.nodes.length === 0) return;
      const s = t.snap;
      await saveScene({
        data: {
          id: t.sceneId,
          name: t.name,
          nodes_json: JSON.stringify({ schema_version: 5, nodes: sanitizeSceneNodes(s.nodes), edges: s.edges, sceneSettings: s.settings }),
          viewport_json: JSON.stringify(s.viewport ?? {}),
          bg: encodeBg(s.bg),
        },
      });
      setTabState((p) => ({ ...p, tabs: p.tabs.map((x) => (x.key === t.key ? { ...x, dirty: false } : x)) }));
    };
    const t = setInterval(() => {
      // AUTOSAVE SAFETY: skip while a scene load is in flight (canvas isn't the
      // scene's truth yet) and never write an EMPTY canvas over a scene row —
      // rf.setNodes can drop pre-init, leaving sceneId set over zero nodes.
      // Deliberate empties persist via manual Save only.
      if (sceneId && lockOwned() && !sceneLoadingRef.current && rf.getNodes().length > 0) void saveRef.current();
      for (const tab of tabStateRef.current.tabs) {
        if (tab.key !== tabStateRef.current.active && tab.dirty && tab.sceneId && tab.snap) {
          void saveSnapTab(tab).catch(() => { /* next tick retries */ });
        }
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [sceneId, lockOwned]);

  // ---- export / import ----
  const importRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const exportScene = useCallback(() => {
    const body = serialize();
    const stem = (sceneName || "scene").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "scene";
    downloadText(`${stem}.canvas.json`, JSON.stringify(body, null, 2));
    downloadText(`${stem}.outline.md`, sceneToOutline(body), "text/markdown");
  }, [serialize, sceneName]);
  const onImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setImportPreview(parseImport(await f.text()));
  }, []);

  // ---- snapshot restore (Load dialog) ----
  const [snapsFor, setSnapsFor] = useState<string | null>(null); // scene id expanded
  const [snaps, setSnaps] = useState<SnapshotListRow[]>([]);
  const [snapErr, setSnapErr] = useState<string | null>(null);
  const [confirmSnap, setConfirmSnap] = useState<SnapshotListRow | null>(null);
  const openSnaps = useCallback(async (sceneRowId: string) => {
    if (snapsFor === sceneRowId) { setSnapsFor(null); return; }
    setSnapErr(null);
    try {
      setSnaps(await listSnapshots({ data: { scene_id: sceneRowId } }));
      setSnapsFor(sceneRowId);
    } catch (e) {
      setSnapErr(e instanceof Error ? e.message : String(e));
      setSnapsFor(sceneRowId);
      setSnaps([]);
    }
  }, [snapsFor]);
  /** Replace the canvas with a snapshot's content — ONE undoable bus command. */
  const restoreSnapshot = useCallback(
    async (snapId: string) => {
      const snap = await loadSnapshot({ data: { id: snapId } });
      let nj: { nodes?: CardNode[]; edges?: unknown[]; sceneSettings?: { jeCardWidth?: number; jePreset?: string } } = {};
      try { nj = JSON.parse(snap.nodes_json || "{}"); } catch { return; }
      const nodesAfter = migrateZTiers(migrateFrameLocks(migrateFrameGrid(migrateJeMemos(migrateElementDeckFields(migrateDeckFields(sanitizeSceneNodes((nj.nodes ?? []) as CardNode[])), isElementKind)))));
      const edgesAfter = migrateEdges((nj.edges ?? []) as never[]);
      const nodesBefore = structuredClone(rf.getNodes());
      const edgesBefore = structuredClone(rf.getEdges());
      bus.dispatch({
        label: "restore snapshot",
        do: () => { rf.setNodes(structuredClone(nodesAfter)); rf.setEdges(structuredClone(edgesAfter)); },
        undo: () => { rf.setNodes(structuredClone(nodesBefore)); rf.setEdges(structuredClone(edgesBefore)); },
      });
      if (typeof nj.sceneSettings?.jeCardWidth === "number") setJeCardWidth(nj.sceneSettings.jeCardWidth);
      if (typeof (nj.sceneSettings as { jeIndent?: number } | undefined)?.jeIndent === "number") setJeIndent((nj.sceneSettings as { jeIndent: number }).jeIndent);
      const cfg = decodeBg(snap.bg);
      if (cfg) setBgCfg(cfg);
    },
    [rf],
  );

  // ---- auto-snapshot when film mode turns ON (keeps the 10 newest per scene) ----
  const filmSnapDone = useRef(false);
  useEffect(() => {
    if (!film) { filmSnapDone.current = false; return; }
    if (filmSnapDone.current || !sceneId) return;
    filmSnapDone.current = true;
    const body = serialize();
    void snapshotScene({ data: { scene_id: sceneId, label: "auto (film mode)", nodes_json: body.nodes_json, viewport_json: body.viewport_json, bg: body.bg } })
      .catch((err) => console.warn("[canvas] scene snapshot skipped:", err instanceof Error ? err.message : err));
  }, [film, sceneId, serialize]);

  // ← / → hop the SELECTED line of the selected JE card to the other column.
  // hopToEnd moves exactly _selLine or nothing (never a neighbor) and lands it
  // at the END of the target side's group (#1 — canonical grouped shape).
  const hopSelectedLine = useCallback(
    (to: "dr" | "cr") => {
      const sel = rf.getNodes().find((n) => n.selected && n.type === "je");
      if (!sel) return;
      const lid = (sel.data as Record<string, unknown>)._selLine as string | undefined;
      const next = hopToEnd((sel.data as unknown as JeCard).lines, lid, to);
      if (!next) return;
      const c = patchDataCmd(rf as unknown as RfLike, sel.id, { lines: next }, "hop line");
      if (c) bus.dispatch(c);
    },
    [rf],
  );

  /** FILM-mode distractor flip on the SPOTLIT JE line (SL6): toggles the trap
   *  version so it lands with the eye already on it. Returns false if the spotlit
   *  target isn't a JE line with a trap (caller falls through to the side-hop). */
  const spotTrapFlip = useCallback((): boolean => {
    const sp = spotRef.current;
    if (!sp?.active || !sp.spot) return false;
    const cardId = sp.spot.cardId;
    const tid = sp.focusTargetId();
    const node = rf.getNode(cardId);
    const lines = node?.data && (node.data as unknown as JeCard).lines;
    const line = tid && lines ? lines.find((l) => l.id === tid) : undefined;
    if (!node || node.type !== "je" || !line?.trap) return false;
    const c = patchDataCmd(rf as unknown as RfLike, cardId, { lines: lines!.map((l) => (l.id === tid ? { ...l, flipped: !l.flipped } : l)) }, "flip trap (spotlight)");
    if (c) bus.dispatch(c);
    return true;
  }, [rf]);

  // ---- hotkeys: every binding lives in the registry; "?" renders the cheat sheet ----
  const bindings = useMemo<KeyBinding[]>(
    () => [
      {
        combo: "space",
        group: "Show",
        description: "Reveal / deal within the frame; when exhausted, arm then advance to the next frame",
        handler: (e) => {
          // THE SHOW KEY — one key performs the whole lesson. Ordered precedence:
          //   (a) selected card has hidden reveals → reveal next (flip first)
          //   (b) the current FRAME's deck has tucked items → deal next into slot
          //   (c) frame exhausted → ARM the transition (no camera move) + arm cue
          //   (d) armed + space → advance to the next COLUMN-MAJOR frame, disarmed
          //   (e) at the lesson's last frame → arm shows "end of lesson"; never
          //       advances past (→ is the manual roll to the next lesson).
          // Any reveal/deal DISARMS. Not inside a frame → the old cross-lesson walk.
          e.preventDefault();
          // CUE-DRIVEN (Phase 2): a frame with an explicit cueOrder runs its cues
          // in that exact order; ONLY such frames take this path — every other
          // frame keeps the derived precedence below, byte-for-byte unchanged.
          const cueF = currentFrameRef.current;
          if (cueF && (rf.getNode(cueF)?.data as { cueOrder?: string[] } | undefined)?.cueOrder?.length) {
            const res = performFrameCue(cueF, 1);
            if (res === "handled") return;
            // "boundary" — all content done → arm, then advance (same as derived)
            if (!spaceAdvancesFramesRef.current) return;
            const nf = frameWalkNext(rf.getNodes() as never, cueF);
            if (armStateRef.current !== "ready") { setArmState(nf ? "ready" : "end"); return; }
            if (!nf) return;
            enterFrame(nf.id);
            const kids2 = rf.getNodes().filter((n) => n.parentId === nf.id && !isContainerType(n.type) && !isTucked(n.data as never));
            const firstRevealable2 = kids2.find((k) => stepReveal(k.data as unknown as CardData) !== null);
            rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === firstRevealable2?.id) ? { ...n, selected: n.id === firstRevealable2?.id } : n)));
            setArmState(null);
            return;
          }
          const nodes = rf.getNodes();
          const sel = nodes.find((n) => n.selected && !isContainerType(n.type));
          // (a) flip / reveal on the selected card
          if (sel && (sel.data as unknown as CardData).faceDown) {
            const c = patchDataCmd(rf as unknown as RfLike, sel.id, { faceDown: false }, "flip card");
            if (c) bus.dispatch(c);
            disarm(); return;
          }
          const patch = sel ? stepReveal(sel.data as unknown as CardData) : null;
          if (sel && patch) {
            const c = patchDataCmd(rf as unknown as RfLike, sel.id, patch as Record<string, unknown>, "reveal step");
            if (c) bus.dispatch(c);
            const tid = revealedTargetId(sel.data as unknown as CardData, patch as Partial<CardData>);
            if (tid) spotRef.current?.onReveal(sel.id, tid);
            disarm(); return;
          }
          // (b) deal — the current FRAME's deck if we're in one, else cross-lesson
          const frameId = currentFrameRef.current;
          if (frameId) {
            const next = nextTuckedInFrame(nodes as never, frameId);
            if (next) { deal(next.id); disarm(); return; }
          } else {
            const current = sel ? lessonIdOf(sel as never, nodes as never) : walkLessonRef.current;
            const next = nextTuckedCross(nodes as never, current);
            if (next) { deal(next.id); disarm(); return; }
            return; // no frame context + nothing to deal → no transition to arm
          }
          // (c/d/e) FRAME EXHAUSTED. Toggle off → space stays at the frame edge.
          if (!spaceAdvancesFramesRef.current) return;
          const nextFrame = frameWalkNext(nodes as never, frameId);
          if (armStateRef.current !== "ready") {
            setArmState(nextFrame ? "ready" : "end"); // ARM forward (also re-arms if a back-arm was pending)
            return;
          }
          if (!nextFrame) return; // never advance past the lesson
          // (d) armed + space → transition, then seed the walk in the new frame
          enterFrame(nextFrame.id);
          const kids = rf.getNodes().filter((n) => n.parentId === nextFrame.id && !isContainerType(n.type) && !isTucked(n.data as never));
          const firstRevealable = kids.find((k) => stepReveal(k.data as unknown as CardData) !== null);
          rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === firstRevealable?.id) ? { ...n, selected: n.id === firstRevealable?.id } : n)));
          setArmState(null);
        },
      },
      {
        combo: "shift+space",
        group: "Show",
        description: "Step BACK: un-reveal / un-deal within the frame; at the frame's start, arm then step back a frame",
        handler: (e) => {
          // THE REVERSE SHOW KEY (item 3) — the exact inverse of space, precedence
          // reversed: (a) re-hide the selected card's last reveal → (b) re-tuck the
          // last-dealt deck item → (c/d/e) at the frame's START, arm then step BACK
          // one column-major frame (arm-then-move, mirroring forward). Never steps
          // before the lesson's first frame (← is the manual roll).
          e.preventDefault();
          // CUE-DRIVEN reverse (Phase 2): a cueOrder frame un-does its cues in
          // reverse; non-cue frames keep the derived reverse walk below.
          const cueFB = currentFrameRef.current;
          if (cueFB && (rf.getNode(cueFB)?.data as { cueOrder?: string[] } | undefined)?.cueOrder?.length) {
            const res = performFrameCue(cueFB, -1);
            if (res === "handled") return;
            // "boundary" — at the frame's start → arm back, then step back a frame
            if (!spaceAdvancesFramesRef.current) return;
            const pf = frameWalkPrev(rf.getNodes() as never, cueFB);
            if (armStateRef.current !== "ready-back") { setArmState(pf ? "ready-back" : "start"); return; }
            if (!pf) return;
            enterFrame(pf.id);
            const kidsB = rf.getNodes().filter((n) => n.parentId === pf.id && !isContainerType(n.type) && !isTucked(n.data as never));
            const lastCardB = kidsB[kidsB.length - 1];
            rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === lastCardB?.id) ? { ...n, selected: n.id === lastCardB?.id } : n)));
            setArmState(null);
            return;
          }
          const nodes = rf.getNodes();
          const sel = nodes.find((n) => n.selected && !isContainerType(n.type));
          // (a) un-reveal the last-revealed item on the selected card
          if (sel) {
            const patch = stepRevealBack(sel.data as unknown as CardData);
            if (patch) {
              const c = patchDataCmd(rf as unknown as RfLike, sel.id, patch as Record<string, unknown>, "un-reveal step");
              if (c) bus.dispatch(c);
              disarm(); return;
            }
          }
          // (b) re-tuck — the LAST-DEALT of the current FRAME's deck, else cross-lesson
          const frameId = currentFrameRef.current;
          const retuck = (rid: string) => { const c = patchDataCmd(rf as unknown as RfLike, rid, { tucked: true }, "un-deal card"); if (c) bus.dispatch(c); };
          if (frameId) {
            const last = lastDealtInFrame(nodes as never, frameId);
            if (last) { retuck(last.id); disarm(); return; }
          } else {
            const last = lastDealtCross(nodes as never);
            if (last) { retuck(last.id); disarm(); return; }
            return; // no frame context + nothing dealt → nothing to reverse
          }
          // (c/d/e) FRAME AT ITS START. Toggle off → shift+space stays at the edge.
          if (!spaceAdvancesFramesRef.current) return;
          const prevFrame = frameWalkPrev(nodes as never, frameId);
          if (armStateRef.current !== "ready-back") {
            setArmState(prevFrame ? "ready-back" : "start"); // ARM back (also re-arms if a forward-arm was pending)
            return;
          }
          if (!prevFrame) return; // never step before the lesson's first frame
          // (d) armed + shift+space → step back, select the LAST card in the prev frame
          enterFrame(prevFrame.id);
          const kids = rf.getNodes().filter((n) => n.parentId === prevFrame.id && !isContainerType(n.type) && !isTucked(n.data as never));
          const lastCard = kids[kids.length - 1];
          rf.setNodes((nds) => nds.map((n) => (n.selected !== (n.id === lastCard?.id) ? { ...n, selected: n.id === lastCard?.id } : n)));
          setArmState(null);
        },
      },
      {
        combo: "h",
        group: "Show",
        description: "Hide all reveals on selected card",
        handler: () => {
          const sel = rf.getNodes().find((n) => n.selected && !isContainerType(n.type));
          if (!sel) return;
          const patch = hideAll(sel.data as unknown as CardData);
          if (patch) {
            const c = patchDataCmd(rf as unknown as RfLike, sel.id, patch as Record<string, unknown>, "hide all");
            if (c) bus.dispatch(c);
          }
        },
      },
      {
        combo: "s",
        group: "Show",
        description: "Tuck selected card(s) into the deck (joins if loose)",
        handler: () => {
          // elements never deck — the show is cards only
          const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type) && !isElementKind((n.data as unknown as CardBase).kind));
          if (sel.length === 0) return;
          let order = nextStageOrder(rf.getNodes());
          const c = compositeCmd(
            sel.map((n) => {
              const d = n.data as unknown as CardData;
              return patchDataCmd(
                rf as unknown as RfLike,
                n.id,
                {
                  deckMember: true,
                  tucked: true,
                  staged: undefined,
                  minimized: undefined,
                  stageOrder: d.deckMember ? d.stageOrder : order++,
                  deckPos: { x: n.position.x, y: n.position.y },
                  deckCategory: categoryOf(d),
                  deckLessonId: d.deckMember ? (d.deckLessonId ?? deckLessonFor(rf, n.parentId)) : deckLessonFor(rf, n.parentId),
                },
                "tuck",
              );
            }),
            "tuck into deck",
          );
          if (c) bus.dispatch(c);
        },
      },
      {
        combo: "f",
        group: "Show",
        description: "Focus-zoom the selected card",
        handler: () => {
          const sel = rf.getNodes().find((n) => n.selected);
          if (sel) focusNode(sel.id);
        },
      },
      {
        combo: "escape",
        group: "Show",
        description: "Escape ladder: dialog → interaction → zoom → chrome → deselect",
        handler: (e) => {
          // THE ESCAPE LADDER — one prioritized handler; each press consumes
          // exactly one rung. Card popovers (CardPopover) consume Esc themselves
          // with a capture listener, so rung 1 covers them inherently.
          e.preventDefault();
          // RUNG 1 — close any open route-level dialog/popover
          if (helpOpen || loadOpen || importPreview || confirmSnap || manageAccountsOpen || manageCourseOpen || settingsOpen || bgOpen) {
            setHelpOpen(false);
            setLoadOpen(false);
            setImportPreview(null);
            setConfirmSnap(null);
            setManageAccountsOpen(false);
            setManageCourseOpen(false);
            setSettingsOpen(false);
            setBgOpen(false);
            return;
          }
          // RUNG 2 — cancel an in-progress connection drag
          const st = storeApi.getState() as unknown as { connection?: { inProgress?: boolean }; cancelConnection?: () => void };
          if (st.connection?.inProgress && st.cancelConnection) {
            st.cancelConnection();
            return;
          }
          // RUNG 2.5 — SPOTLIGHT exits first (SL2), before focus-zoom/film/frame
          if (spotRef.current?.active) { spotRef.current.exit(); return; }
          // RUNG 3 — exit focus zoom. A film-lock PUSH snaps back to the exact
          // framed view; a normal focus-zoom fits the whole board (item 1).
          if (zoomedRef.current) {
            if (returnFromPush()) return;
            zoomedRef.current = false;
            void rf.fitView({ duration: 400, padding: 0.15 });
            return;
          }
          // RUNG 4 — FILM mode exits FIRST (FF-3), even inside a frame
          if (film) { setFilm(false); return; }
          // RUNG 5 — a selection deselects (FF-4: Esc clears selection first so the
          // arrows switch to frame-nav); frame-exit waits for the next Esc
          const anySel = rf.getNodes().some((n) => n.selected) || rf.getEdges().some((e) => e.selected);
          if (anySel) {
            clearEdgeGlow();
            rf.setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false, data: { ...n.data, _selLine: undefined } } : n)));
            rf.setEdges((eds) => eds.map((ed) => (ed.selected ? { ...ed, selected: false } : ed)));
            return;
          }
          // RUNG 6 — leave the framed shot back to the lesson (FRAMES)
          if (currentFrameRef.current) { exitFrame(); return; }
          // RUNG 7 — clean screen off
          if (clean) { setClean(false); return; }
        },
      },
      { combo: "c", group: "Modes", description: "Clean screen (chrome off)", handler: () => setClean((v) => !v) },
      { combo: "v", group: "Modes", description: "Film mode (spotlight + ripple + chrome off)", handler: () => setFilm((v) => { const on = !v; if (on) { setPrompter(false); if (currentFrameRef.current) enterFrame(currentFrameRef.current); } return on; }) },
      { combo: "b", group: "Modes", description: "Camera bubble", handler: () => setCamera((v) => !v) },
      { combo: "p", group: "Modes", description: "Teleprompter — the current frame's script (authoring + film)", handler: () => setPrompter((v) => { const on = !v; if (on && !currentFrameRef.current) flashToast("Enter a frame — the prompter reads the current frame's script"); return on; }) },
      { combo: "j", group: "Quick-spawn", description: "Journal entry at cursor", handler: () => quickSpawn("je") },
      { combo: "t", group: "Quick-spawn", description: "T-account at cursor", handler: () => quickSpawn("taccount") },
      { combo: "n", group: "Quick-spawn", description: "Note at cursor", handler: () => quickSpawn("note") },
      { combo: "q", group: "Quick-spawn", description: "Question (CEQ) at cursor — inert in focus mode", handler: () => { if (!focusPalette) quickSpawn("ceq"); } },
      { combo: "l", group: "Quick-spawn", description: "Reveal list at cursor — inert in focus mode", handler: () => { if (!focusPalette) quickSpawn("list"); } },
      { combo: "d", group: "Cards", description: "Duplicate the selected card (lands underneath)", handler: () => duplicateSelected() },
      { combo: ">", group: "Cards", description: "Scale the selected card(s) up (filming size, max 100%)", handler: () => scaleSelected(0.05) },
      { combo: "<", group: "Cards", description: "Scale the selected card(s) down (filming size, min 25%)", handler: () => scaleSelected(-0.05) },
      {
        combo: "arrowleft",
        group: "JE lines",
        description: "Spotlight+film: flip a spotlit trap · else hop JE line debit · else prev lesson",
        handler: (e) => {
          if (film && spotRef.current?.active && spotTrapFlip()) { e.preventDefault(); return; }
          if (frameFreeNav()) { e.preventDefault(); armOrStep("left", () => stepBeat(-1)); } else hopSelectedLine("dr");
        },
      },
      {
        combo: "arrowright",
        group: "JE lines",
        description: "Spotlight+film: flip a spotlit trap · else hop JE line credit · else next lesson",
        handler: (e) => {
          if (film && spotRef.current?.active && spotTrapFlip()) { e.preventDefault(); return; }
          if (frameFreeNav()) { e.preventDefault(); armOrStep("right", () => stepBeat(1)); } else hopSelectedLine("cr");
        },
      },
      {
        combo: "arrowup",
        group: "Spotlight",
        description: "Spotlight: move focus up (↑ off the top exits) · else prev frame",
        handler: (e) => {
          if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(-1); return; }
          if (frameFreeNav()) { e.preventDefault(); armOrStep("up", () => stepSub(-1)); }
        },
      },
      {
        combo: "arrowdown",
        group: "Spotlight",
        description: "Spotlight: move focus down · re-enter after an exit · else next frame",
        handler: (e) => {
          if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(1); return; }
          if (spotRef.current?.tryReenter(1)) { e.preventDefault(); return; }
          if (frameFreeNav()) { e.preventDefault(); armOrStep("down", () => stepSub(1)); }
        },
      },
      { combo: "shift+arrowdown", group: "Spotlight", description: "Extend the spotlight range down", handler: (e) => { if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(1, { range: true }); } } },
      { combo: "shift+arrowup", group: "Spotlight", description: "Extend the spotlight range up", handler: (e) => { if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(-1, { range: true }); } } },
      { combo: "ctrl+arrowdown", group: "Spotlight", description: "Spotlight jump to the last target", handler: (e) => { if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(1, { jump: true }); } } },
      { combo: "ctrl+arrowup", group: "Spotlight", description: "Spotlight jump to the first target", handler: (e) => { if (spotRef.current?.active) { e.preventDefault(); spotRef.current.move(-1, { jump: true }); } } },
      // F2 GLOBAL EDIT (item 4): one binding — edit the spotlit target if a
      // spotlight is active, else stamp a transient _editSeq on the SELECTED node
      // so its own editor opens (per-kind: heading/text/memo/list/JE line/frame
      // title all watch it via useEditSignal / openSeq). Film mode is a no-op.
      { combo: "f2", group: "Edit", description: "Edit the selected element (heading · text · JE line · list · memo · frame title)", handler: (e) => {
        if (film) return;
        if (spotRef.current?.active) { e.preventDefault(); spotRef.current.editSpot(); return; }
        const sel = rf.getNodes().find((n) => n.selected);
        if (sel) { e.preventDefault(); rf.updateNodeData(sel.id, { _editSeq: Date.now() }); }
      } },
      { combo: "]", group: "Frames", description: "Next beat → (also PageDown)", handler: () => stepBeat(1) },
      { combo: "[", group: "Frames", description: "Previous beat ← (also PageUp)", handler: () => stepBeat(-1) },
      { combo: "pagedown", group: "Frames", description: "Next beat", hidden: true, handler: (e) => { e.preventDefault(); stepBeat(1); } },
      { combo: "pageup", group: "Frames", description: "Previous beat", hidden: true, handler: (e) => { e.preventDefault(); stepBeat(-1); } },
      { combo: "ctrl+z", group: "History", description: "Undo", handler: (e) => { e.preventDefault(); bus.undo(); } },
      { combo: "ctrl+y", group: "History", description: "Redo", handler: (e) => { e.preventDefault(); bus.redo(); } },
      { combo: "ctrl+shift+z", group: "History", description: "Redo", hidden: true, handler: (e) => { e.preventDefault(); bus.redo(); } },
      { combo: "?", group: "Help", description: "This cheat sheet", handler: () => setHelpOpen((v) => !v) },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ladder reads live dialog state
    [rf, storeApi, deal, performFrameCue, quickSpawn, duplicateSelected, scaleSelected, hopSelectedLine, spotTrapFlip, focusNode, focusPalette, film, clean, helpOpen, loadOpen, importPreview, confirmSnap, manageAccountsOpen, manageCourseOpen, settingsOpen, bgOpen, clearEdgeGlow, stepSub, stepBeat, frameFreeNav, exitFrame, enterFrame, disarm, returnFromPush, armOrStep],
  );
  useKeymap(bindings);

  // Delete-key removals happen natively inside React Flow; record them on the
  // bus AFTER the fact so Ctrl+Z restores the exact nodes + edges. dispatch()
  // re-runs do(), which re-filters the already-deleted ids — a safe no-op.
  const onDelete = useCallback(
    ({ nodes, edges }: { nodes: CardNode[]; edges: { id: string; source: string; target: string }[] }) => {
      if (nodes.length === 0 && edges.length === 0) return;
      const nodesSnap = structuredClone(nodes);
      const edgesSnap = structuredClone(edges);
      const nIds = new Set(nodesSnap.map((n) => n.id));
      const eIds = new Set(edgesSnap.map((e) => e.id));
      bus.dispatch({
        label: "delete selection",
        do: () => {
          rf.setNodes((nds) => nds.filter((n) => !nIds.has(n.id)));
          rf.setEdges((eds) => eds.filter((e) => !eIds.has(e.id)));
        },
        undo: () => {
          if (nodesSnap.length) rf.addNodes(structuredClone(nodesSnap));
          if (edgesSnap.length) rf.setEdges((eds) => [...eds, ...structuredClone(edgesSnap)]);
        },
      });
    },
    [rf],
  );

  // focus-zoom on double click (single click selects/edits — double is the zoom gesture)
  const onNodeDoubleClick = useCallback(
    (_e: unknown, node: CardNode) => {
      // DIVE INTO A FRAME (regression fix): double-clicking a frame ENTERS it (fits
      // the camera). Frames are container types, so this must run BEFORE the
      // container early-return below — otherwise dbl-click does nothing.
      if (node.type === "frame") {
        enterFrame(node.id);
        return;
      }
      if (isContainerType(node.type)) return;
      focusNode(node.id);
    },
    [focusNode, enterFrame],
  );

  const chrome = !clean && !film;

  return (
    <CanvasSettingsContext.Provider value={canvasSettings}>
    <DecksContext.Provider value={decksCtx}>
    <FrameNavContext.Provider value={frameNav}>
    <SpotlightCtx.Provider value={spot}>
    <FrameTakesProvider courseName={sceneCourse ? courseLabel(sceneCourse) : null} introClipLength={introClipLength} autoTrimIntros={autoTrimIntros}>
    <div className={`fixed inset-0 ${film ? "film-mode" : ""} ${clean ? "sa-clean" : ""} ${connecting ? "sa-connecting" : ""} ${film && filmEntrancePop ? "sa-entrance-pop" : ""} ${film && filmCheckGlow ? "sa-check-glow" : ""} ${chrome && backstage === "cinema" ? "sa-cinema" : ""}`} style={{ background: chrome ? BACKSTAGE_BG[backstage] : NEON.bg }}>
      <style>{FILM_MODE_CSS}</style>
      {/* TAKE BOARD: loud banner when Mux env vars / frame_takes table are missing */}
      {chrome && <MuxBanner />}
      {/* CINEMA BACKSTAGE (authoring only) — dark-red animated studio behind the canvas.
          Honour the scene's chosen loop if it set one, else the colourful dream glow. */}
      {chrome && backstage === "cinema" && <BackstageStage video={bgCfg.mode === "video" ? bgCfg.video : "dream-intro.mp4"} />}
      <style>{CARD_CURSOR_CSS}</style>
      <style>{CONNECTION_DOTS_CSS}</style>
      <style>{ARROW_EDGE_CSS}</style>
      {/* card tap feedback — always on (authoring); the audience never sees it in film/clean */}
      {chrome && <CardTapPulse />}
      {film && (
        <>
          <CursorSpotlight />
          <ClickRipples />
        </>
      )}
      {/* Camera bubble — screen-fixed; deliberately OUTSIDE chrome gating (it IS filming) */}
      {camera && <CameraBubble onClose={() => setCamera(false)} />}

      {/* SPACE-WALK ARM CUE — Lee's tell that the frame is exhausted and the next
          space will transition. Filming chrome (fixed overlay, not lesson DOM). */}
      {armState && currentFrameId && (() => {
        const back = armState === "ready-back" || armState === "start";
        const target = back ? frameWalkPrev(rf.getNodes() as never, currentFrameId) : frameWalkNext(rf.getNodes() as never, currentFrameId);
        const label = armState === "end" ? "end of lesson" : armState === "start" ? "start of lesson" : !target ? (back ? "start of lesson" : "end of lesson") : frameCellLabel(target as never);
        return <FrameArmCue state={armState} nextLabel={label} showHud={rehearsalHud} />;
      })()}

      {/* ARROW-NAV ARM LIGHT — a glowing edge on the side of the pending move
          (↓ below = new frame · → right = new beat). Press the same arrow again
          to go; any other input disarms. */}
      {arrowArm && currentFrameId && (
        <>
        <style>{`@keyframes sa-arm-pulse { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }`}</style>
        <div
          className="pointer-events-none fixed z-[66]"
          style={{
            ...(arrowArm === "down" ? { left: 0, right: 0, bottom: 0, height: 6 }
              : arrowArm === "up" ? { left: 0, right: 0, top: 0, height: 6 }
              : arrowArm === "right" ? { top: 0, bottom: 0, right: 0, width: 6 }
              : { top: 0, bottom: 0, left: 0, width: 6 }),
            background: NEON.yellow,
            boxShadow: `0 0 22px 4px ${NEON.yellow}`,
            animation: "sa-arm-pulse 1s ease-in-out infinite",
          }}
        />
        </>
      )}

      {/* Type floor — prep warning, only INSIDE a frame (composing a shot).
          Region overview is never a shot, so the badge is just noise there (item 7). */}
      {lowZoom && !film && currentFrameId && (
        <div
          className="absolute left-1/2 top-14 z-40 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.55)", color: NEON.yellow }}
        >
          zoom &lt; 75% — text may be illegible on camera
        </div>
      )}
      {/* FOCUS-PUSH BACK (item 1) — while pushed into a card inside a framed
          shot, one click snaps back to the exact framed view. */}
      {framePushView && (
        <button
          onClick={returnFromPush}
          className="absolute left-4 top-14 z-[80] flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "rgba(11,15,30,0.85)", border: `1px solid ${NEON.yellow}`, color: NEON.yellow, backdropFilter: "blur(6px)" }}
          title="Back to the framed shot (Esc)"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> back to frame
        </button>
      )}
      {/* TRANSIENT TOAST — frame-cap notice, soft warns (auto-clears) */}
      {toast && (
        <div
          className="pointer-events-none absolute bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
          style={{ background: "rgba(11,15,30,0.85)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text, backdropFilter: "blur(6px)" }}
        >
          {toast}
        </div>
      )}
      {/* looping video background (low opacity, filming-optional); key remounts on swap.
          In the cinema backstage BackstageStage owns the animation, so skip this one. */}
      {bgCfg.mode === "video" && !(chrome && backstage === "cinema") && (
        <video
          key={bgCfg.video}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ opacity: bgCfg.opacity }}
          src={`/anim/${bgCfg.video}`}
          autoPlay
          muted
          loop
          playsInline
        />
      )}

      <ReactFlow
        defaultNodes={[]}
        defaultEdges={[]}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onMoveStart={onMoveStart}
        onDelete={onDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        onConnect={onConnect}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: NEON.cyan, strokeWidth: 2 }}
        multiSelectionKeyCode={["Shift"]}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.08}
        maxZoom={2.5}
        // FIGMA-STYLE NAV: wheel = zoom at the cursor; drag on empty canvas =
        // pan; shift+drag = selection marquee; pinch zoom native. Inner
        // scrollables opt out with `nowheel` (pickers, card bodies) so their
        // scrolling never zooms the canvas.
        // FILM LOCK (FF-3): film mode inside a frame PINS the stage — no
        // scroll-zoom, no pane-drag, no dbl-click zoom; only the frame-nav keys
        // move the camera. Kills accidental zoom-outs mid-take.
        panOnDrag={!(film && !!currentFrameId)}
        panOnScroll={false}
        zoomOnScroll={!(film && !!currentFrameId)}
        zoomOnPinch={!(film && !!currentFrameId)}
        zoomOnDoubleClick={false}
        selectionKeyCode={["Shift"]}
        selectionOnDrag={false}
        deleteKeyCode={["Delete", "Backspace"]}
        style={{ background: "transparent" }}
        fitView
      >
        {bgCfg.mode !== "video" && <Background variant={BackgroundVariant.Dots} gap={28} size={1.5} color="rgba(147,160,180,0.28)" />}
        {/* SKELETON GRID (P4): ghost previews for named decks' undealt slots */}
        <SkeletonLayer decks={decks} />
        {/* GHOST CELLS: empty region-grid slots as "+ add lesson" (authoring only) */}
        {chrome && (
          <GhostCellsLayer
            onAdd={(pos, pathOrder) => {
              // the outline list on the new lesson shows every existing lesson + itself
              const existing = rf.getNodes().filter((n) => n.type === "lesson").map((n) => String((n.data as { label?: string }).label ?? "")).filter(Boolean);
              const cellNodes = buildLessonCell(pos, "New lesson", pathOrder, false, [...existing, "New lesson"]);
              bus.dispatch(addNodesCmd(rf as unknown as RfLike, cellNodes, "add lesson"));
              if (pathOrder > 15) flashToast("16th lesson — grid extended a row"); // soft warn, never block
            }}
          />
        )}
        {/* AC2/AC3: per-lesson ghost sub-frame slots + toggleable numbered film-order path */}
        {chrome && <FrameGridOverlay showPath={framePath} onAddFrame={(lessonId, beat, sub) => { makeFrameAt(lessonId, beat, sub); }} />}
        {/* CINEMA: giant SURVIVE wordmark laid across the scaffolding, behind the nodes */}
        {chrome && backstage === "cinema" && <SurviveBackdrop />}
        {/* Key lives in the drawer now (declutter run) — see BrandBar below */}
        {chrome && minimap && (
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            style={{ background: NEON.bg2, border: `1px solid ${NEON.borderSoft}`, borderRadius: 10 }}
            maskColor="rgba(11,19,34,0.75)"
            nodeColor={() => "#FBF9F4"}
          />
        )}
      </ReactFlow>

      {/* LETTERBOX (FF-5): inside a frame, solid bars mask the canvas outside the
          exact 16:9 region the frame fills, so the shot is 16:9 in any window.
          Film mode → pure black. pointer-events pass through outside film. */}
      {currentFrameId && (() => {
        const cw = window.innerWidth, ch = window.innerHeight;
        const innerW = Math.min(cw, (ch * 16) / 9);
        const innerH = innerW * 9 / 16;
        const mx = Math.max(0, Math.round((cw - innerW) / 2));
        const my = Math.max(0, Math.round((ch - innerH) / 2));
        const bar = film ? "#000" : "rgba(6,10,20,0.975)";
        const B = (s: React.CSSProperties) => <div className="pointer-events-none absolute z-[52]" style={{ background: bar, ...s }} />;
        return (
          <>
            {mx > 0 && B({ left: 0, top: 0, bottom: 0, width: mx })}
            {mx > 0 && B({ right: 0, top: 0, bottom: 0, width: mx })}
            {my > 0 && B({ top: 0, left: 0, right: 0, height: my })}
            {my > 0 && B({ bottom: 0, left: 0, right: 0, height: my })}
          </>
        );
      })()}

      {/* FRAME HUD — while inside a frame: ‹ prev · "LESSON · frame — Beat" · next ›
          (FF-6). Frame title is inline-editable here. Auto-hidden in film/clean
          unless the frame-header toggle forces it; the tiny film HUD covers film. */}
      {currentFrameId && chrome && showFrameHeader && (() => {
        const fnode = rf.getNode(currentFrameId);
        const fd = fnode?.data as FrameBox | undefined;
        const lessonId = fnode?.parentId;
        const lessonTitle = (lessonId ? (rf.getNode(lessonId)?.data as { label?: string } | undefined)?.label : "") || "Lesson";
        const beat = (fd?.beat ?? "hook") as Beat;
        const bm = BEAT_META[beat];
        const sub = (fd?.subIndex ?? 0) + 1;
        return (
        <div data-frame-chrome className="absolute left-1/2 top-3 z-[58] flex max-w-[92vw] -translate-x-1/2 flex-col gap-1.5 rounded-2xl p-2.5" style={{ background: "linear-gradient(180deg, rgba(16,22,40,0.96), rgba(9,13,26,0.96))", border: `1px solid rgba(232,184,75,0.28)`, color: NEON.text, boxShadow: "0 18px 44px -16px rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
          {/* lesson name (prominent, never cut) + beat chip + hide */}
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[17px] font-black tracking-wide" style={{ color: "#FBEFD6", textShadow: "0 0 18px rgba(232,184,75,0.35)" }}>{lessonTitle}</span>
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: bm.color, border: `1px solid ${bm.edge}`, background: `${bm.color}14` }}>{bm.label} {sub}</span>
            <span className="flex-1" />
            <button className="grid h-6 w-6 place-items-center rounded-full" title="Hide the frame navigator (bring back with the panel-top toggle in the toolbar)" onClick={() => setShowFrameHeader(false)} style={{ color: NEON.muted }}><PanelTop className="h-3.5 w-3.5" /></button>
          </div>

          {/* frame title — underneath the lesson name */}
          <div className="whitespace-nowrap text-[13px] font-bold" style={{ color: "#F4EFE6" }}>
            <EditableText value={fd?.title ?? ""} onChange={(v) => { const c = patchDataCmd(rf as unknown as RfLike, currentFrameId, { title: v }, "rename frame"); if (c) bus.dispatch(c); }} placeholder="untitled frame" />
          </div>

          <div className="flex items-center gap-1">
            <button className="grid h-6 w-6 place-items-center rounded-full disabled:opacity-30" title="Previous beat ( ← / [ )" disabled={!frameNav.canStep(currentFrameId, -1)} onClick={() => stepBeat(-1)} style={{ color: NEON.text }}><ChevronLeft className="h-4 w-4" /></button>
            <button className="grid h-6 w-6 place-items-center rounded-full disabled:opacity-30" title="Next beat ( → / ] )" disabled={!frameNav.canStep(currentFrameId, 1)} onClick={() => stepBeat(1)} style={{ color: NEON.text }}><ChevronRight className="h-4 w-4" /></button>
            <span className="mx-0.5 h-4 w-px" style={{ background: NEON.borderSoft }} />
            <button className="grid h-6 w-6 place-items-center rounded-full" title="Add a sub-frame below (same beat)" onClick={() => addFrameAfter(currentFrameId)} style={{ color: NEON.cyan }}><Plus className="h-4 w-4" /></button>
            <button className="grid h-6 w-6 place-items-center rounded-full" title="Exit frame (Esc)" onClick={exitFrame} style={{ color: NEON.yellow }}><Minimize2 className="h-3.5 w-3.5" /></button>
          </div>

          {/* FRAMES GRID — always visible, fixed box; click a cell to jump */}
          {lessonId && (
            <div className="flex gap-1.5 rounded-lg p-1.5" style={{ background: "rgba(0,0,0,0.28)", border: `1px solid ${NEON.borderSoft}` }}>
              {BEAT_COLUMNS.map((b) => {
                const col = framesInBeat(rf.getNodes() as never, lessonId, b);
                const cbm = BEAT_META[b];
                return (
                  <div key={b} className="flex flex-col items-center gap-1">
                    <span className="text-[8px] font-bold uppercase tracking-wide" style={{ color: cbm.color }}>{cbm.label.split(" ")[0]}</span>
                    {col.length === 0 && <span className="grid h-6 w-10 place-items-center rounded text-[8px]" style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}>–</span>}
                    {col.map((f, ri) => (
                      <button key={f.id} className="grid h-6 w-10 place-items-center rounded text-[10px] font-bold transition-transform hover:scale-105" style={{ border: `1px solid ${f.id === currentFrameId ? cbm.color : NEON.borderSoft}`, background: f.id === currentFrameId ? `${cbm.color}2e` : "rgba(255,255,255,0.02)", color: f.id === currentFrameId ? cbm.color : NEON.text, boxShadow: f.id === currentFrameId ? `0 0 12px -2px ${cbm.color}` : "none" }} title={`${cbm.label} ${ri + 1}`} onClick={() => enterFrame(f.id)}>{ri + 1}</button>
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        );
      })()}

      {/* BRAND BAR + DRAWER (workspace chrome) — the drawer is the menu:
          Cards (palette) and Key (legend) open as panels inside it, keeping
          the canvas top-left clean. Film/clean swap the bar for the watermark. */}
      {chrome && (
        <BrandBar
          items={[{ key: "cards", label: "Cards" }, { key: "outline", label: "Outline" }, { key: "key", label: "Key" }]}
          activeItem={drawerPanel}
          onItem={setDrawerPanel}
        >
          {drawerPanel === "cards" && (
            <Palette
              docked
              library={activeLibrary}
              onSpawn={spawn}
              focus={focusPalette}
              sceneCourseKey={sceneCourseId}
            />
          )}
          {drawerPanel === "outline" && <OutlinePanel />}
          {drawerPanel === "key" && <LegendHud docked />}
        </BrandBar>
      )}
      {!chrome && <BrandWatermark />}

      {/* GROUP CHROME (PROMPT B) — floats above a 2+ card selection; owns its
          own subscriptions so pan/zoom doesn't re-render the route */}
      {chrome && <GroupChromeBar />}

      {/* The DECK — one holding system (hidden in clean/film mode; spacebar still deals) */}
      {chrome && (
        <Deck
          onDeal={deal}
          onFocus={focusNode}
          onRemoveMembership={removeMembership}
          dealFaceDown={dealFaceDown}
          setDealFaceDown={setDealFaceDown}
          hideFdLabels={hideFdLabels}
          setHideFdLabels={setHideFdLabels}
          decks={decks}
          setDecks={setDecks}
        />
      )}

      {/* Toolbar */}
      {chrome && (
        <div
          className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl px-2.5 py-1.5"
          style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
        >
          <input
            className="w-40 bg-transparent text-[12.5px] font-semibold outline-none"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            title="Scene name"
          />
          {/* FILE — save / load / export / import / new tab (upward dropdown) */}
          <div className="relative">
            <MenuButton icon={<FileText className="h-3.5 w-3.5" />} label="File" open={fileMenuOpen} onClick={() => { setFileMenuOpen((v) => !v); setAddCardOpen(false); }} />
            {fileMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFileMenuOpen(false)} />
                <div className="absolute bottom-9 left-0 z-50 w-44 rounded-xl p-1.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)" }}>
                  <MenuRow icon={<Save className="h-3.5 w-3.5" />} label="Save" onClick={() => { setFileMenuOpen(false); void doSave(); }} />
                  <MenuRow icon={<FilePlus2 className="h-3.5 w-3.5" />} label="Save as new" onClick={() => { setFileMenuOpen(false); void doSave(true); }} />
                  <MenuRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Load scene" onClick={() => { setFileMenuOpen(false); void openLoad(); }} />
                  <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />
                  <MenuRow icon={<Download className="h-3.5 w-3.5" />} label="Export (.json + .md)" onClick={() => { setFileMenuOpen(false); exportScene(); }} />
                  <MenuRow icon={<Upload className="h-3.5 w-3.5" />} label="Import from file" onClick={() => { setFileMenuOpen(false); importRef.current?.click(); }} />
                  <div className="my-1 h-px" style={{ background: NEON.borderSoft }} />
                  <MenuRow icon={<Plus className="h-3.5 w-3.5" />} label="New tab" onClick={() => { setFileMenuOpen(false); newTab(); }} />
                </div>
              </>
            )}
          </div>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onImportFile(e)} />
          <span className="mx-1 h-4 w-px" style={{ background: NEON.borderSoft }} />
          {/* ADD CARD — card-kind picker (upward). Replaces Add region / Add lesson. */}
          <div className="relative">
            <MenuButton icon={<Plus className="h-3.5 w-3.5" />} label="Card" open={addCardOpen} onClick={() => { setAddCardOpen((v) => !v); setFileMenuOpen(false); }} />
            {addCardOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAddCardOpen(false)} />
                <div className="absolute bottom-9 left-0 z-50 grid w-64 grid-cols-2 gap-0.5 rounded-xl p-1.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)" }}>
                  {ADD_CARD_KINDS.map((c) => (
                    <BgOption key={c.label} label={c.label} active={false} onClick={() => { setAddCardOpen(false); spawn(c.kind === "formula" ? formulaAle() : blankCard(c.kind, c.preset)); }} />
                  ))}
                </div>
              </>
            )}
          </div>
          <TB
            title="Add region scaffold — full-width header + chapters laid on a snaking path (layout stamp)"
            onClick={() => { setScaffoldCourseId(sceneCourseId ?? ""); setScaffoldOpen(true); }}
          >
            <LayoutTemplate className="h-3.5 w-3.5" />
          </TB>
          <TB title="Cue sheet — the entered frame's space-walk sequence (enter a frame first)" active={cueSheetOpen} onClick={() => { setCueSheetOpen((v) => { const nv = !v; if (nv && !currentFrameId) flashToast("Enter a frame to see its cue sheet"); return nv; }); }}><ListOrdered className="h-3.5 w-3.5" /></TB>
          <TB title="Script editor — write the whole course script (entry / beats / exit per frame)" active={scriptOpen} onClick={() => setScriptOpen((v) => !v)}><ScrollText className="h-3.5 w-3.5" /></TB>
          <TB title="Teleprompter — current frame's script near the camera eyeline (p)" active={prompter} onClick={() => setPrompter((v) => !v)}><Projector className="h-3.5 w-3.5" /></TB>
          <TB title="Recorder spike (EXPERIMENT — cam+mic in the browser; OBS remains the filming flow)" active={spikeOpen} onClick={() => setSpikeOpen((v) => !v)}><FlaskConical className="h-3.5 w-3.5" /></TB>
          <TB title="Toggle minimap" active={minimap} onClick={() => setMinimap((v) => !v)}><MapIcon className="h-3.5 w-3.5" /></TB>
          {currentFrameId && <TB title={showFrameHeader ? "Hide the frame header while inside a frame" : "Show the frame header (LESSON · frame · beat)"} active={showFrameHeader} onClick={() => setShowFrameHeader((v) => !v)}><PanelTop className="h-3.5 w-3.5" /></TB>}
          <div className="relative">
            <TB title="Canvas settings (JE width, default preset)" active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />
            </TB>
            {settingsOpen && (
              <div
                className="absolute bottom-9 left-1/2 z-50 max-h-[75vh] w-52 -translate-x-1/2 overflow-y-auto rounded-xl p-2.5"
                style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)" }}
              >
                <label className="block text-[10px]" style={{ color: NEON.muted }}>
                  JE card width · {jeCardWidth}px <span className="opacity-60">(all JE cards)</span>
                  <input
                    type="range"
                    min={300}
                    max={520}
                    step={10}
                    value={jeCardWidth}
                    onChange={(e) => setJeCardWidth(Number(e.target.value))}
                    className="mt-0.5 w-full"
                    style={{ accentColor: NEON.yellow }}
                  />
                </label>
                <label className="mt-1.5 block text-[10px]" style={{ color: NEON.muted }}>
                  Credit indent · {jeIndent}px <span className="opacity-60">(tetris stagger)</span>
                  <input
                    type="range"
                    min={16}
                    max={64}
                    step={4}
                    value={jeIndent}
                    onChange={(e) => setJeIndent(Number(e.target.value))}
                    className="mt-0.5 w-full"
                    style={{ accentColor: NEON.yellow }}
                  />
                </label>
                <label className="mt-2 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: focusPalette ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={focusPalette} onChange={(e) => setFocusPalette(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Focus palette <span className="opacity-60">(trims CARDS to JE · T · Note)</span>
                </label>
                {/* INTRO AUTO-TRIM (publish pipeline) */}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Intro auto-trim</div>
                <label className="mt-0.5 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: autoTrimIntros ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={autoTrimIntros} onChange={(e) => setAutoTrimIntros(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Auto-trim intro takes
                </label>
                <label className="mt-1 flex items-center justify-between text-[10px]" style={{ color: NEON.muted }}>
                  <span>Intro clip length (s)</span>
                  <input type="number" min={1} max={30} step={0.5} value={introClipLength} onChange={(e) => setIntroClipLength(Math.max(1, Number(e.target.value) || 6))} className="w-14 rounded px-1.5 py-0.5 text-right tabular-nums outline-none" style={{ background: "rgba(255,255,255,0.06)", border: `1px solid ${NEON.borderSoft}`, color: NEON.text }} />
                </label>
                <RetrimAllIntrosButton />
                {/* SPOTLIGHT (performance cursor) toggles */}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Spotlight</div>
                <div className="mt-0.5 flex items-center justify-between text-[10px]" style={{ color: NEON.muted }}>
                  <span>Focus-dim</span>
                  <div className="flex gap-0.5">
                    {(["auto", "on", "off"] as FocusDimMode[]).map((m) => (
                      <button key={m} className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase" style={{ color: spotFocusDim === m ? "#0B1322" : NEON.text, background: spotFocusDim === m ? NEON.yellow : "transparent", border: `1px solid ${NEON.borderSoft}` }} onClick={() => setSpotFocusDim(m)}>{m}</button>
                    ))}
                  </div>
                </div>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: spotFollowReveals ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={spotFollowReveals} onChange={(e) => setSpotFollowReveals(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Spotlight follows reveals
                </label>
                {/* SPACE-WALK (film performance) toggles */}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Filming</div>
                <label className="mt-0.5 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: spaceAdvancesFrames ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={spaceAdvancesFrames} onChange={(e) => setSpaceAdvancesFrames(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Space advances frames <span className="opacity-60">(arm-then-go; off = stay in frame)</span>
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: rehearsalHud ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={rehearsalHud} onChange={(e) => setRehearsalHud(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Rehearsal HUD <span className="opacity-60">(next-up when armed)</span>
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: filmEntrancePop ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={filmEntrancePop} onChange={(e) => setFilmEntrancePop(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Entrance pop <span className="opacity-60">(dealt card scale-pop, film)</span>
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: filmCheckGlow ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={filmCheckGlow} onChange={(e) => setFilmCheckGlow(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Check glow <span className="opacity-60">(hotter red Check gate, film)</span>
                </label>
                <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[10px]" style={{ color: compositionGuides ? NEON.yellow : NEON.muted }}>
                  <input type="checkbox" checked={compositionGuides} onChange={(e) => setCompositionGuides(e.target.checked)} style={{ accentColor: "#FCA311" }} />
                  Composition guides <span className="opacity-60">(center/thirds/fifths in a frame; hold Alt to bypass)</span>
                </label>
                {/* AC1: backstage background — authoring only; film keeps the dark stage */}
                <div className="mt-1.5 text-[10px]" style={{ color: NEON.muted }}>Backstage <span className="opacity-60">(authoring only)</span></div>
                <div className="mt-0.5 flex gap-1">
                  {(["cinema", "light", "dark", "gray"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setBackstage(m)}
                      className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-semibold"
                      style={{ color: backstage === m ? NEON.yellow : NEON.muted, background: backstage === m ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${backstage === m ? "rgba(252,163,17,0.5)" : NEON.borderSoft}` }}
                    >
                      {BACKSTAGE_LABEL[m]}
                    </button>
                  ))}
                </div>
                {/* SCENE COURSE CONTEXT (content reset): pickers scope to this */}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: sceneCourseId ? NEON.yellow : NEON.muted }}>Scene course</div>
                <select
                  value={sceneCourseId ?? ""}
                  onChange={(e) => { setSceneCourseId(e.target.value || null); setSceneChapterId(null); }}
                  className="mt-1 w-full rounded bg-black/40 px-1 py-1 text-[11px] outline-none"
                  style={{ border: `1px solid ${sceneCourseId ? "rgba(252,163,17,0.5)" : NEON.borderSoft}`, color: NEON.text }}
                >
                  <option value="">— no course set —</option>
                  {(coursesQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{courseLabel(c)}</option>
                  ))}
                </select>
                {sceneCourse && (
                  <select
                    value={sceneChapterId ?? ""}
                    onChange={(e) => setSceneChapterId(e.target.value || null)}
                    className="mt-1 w-full rounded bg-black/40 px-1 py-1 text-[11px] outline-none"
                    style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                  >
                    <option value="">All chapters</option>
                    {sceneCourse.chapters.map((ch) => (
                      <option key={ch.id} value={ch.id}>{chapterLabel(ch)}</option>
                    ))}
                  </select>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <button
                    className="flex-1 rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide disabled:opacity-40"
                    style={{ color: NEON.cyan, border: `1px solid rgba(79,163,227,0.45)` }}
                    disabled={!sceneCourseId}
                    title={sceneCourseId ? "Curate this course's account list" : "Set the scene course first"}
                    onClick={() => { setManageAccountsOpen(true); setSettingsOpen(false); }}
                  >
                    Manage accounts
                  </button>
                  <button
                    className="flex-1 rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide disabled:opacity-40"
                    style={{ color: NEON.yellow, border: `1px solid rgba(252,163,17,0.45)` }}
                    disabled={!sceneCourseId}
                    title={sceneCourseId ? "Rename this course; add/rename/reorder/archive its chapters" : "Set the scene course first"}
                    onClick={() => { setManageCourseOpen(true); setSettingsOpen(false); }}
                  >
                    Manage course
                  </button>
                </div>
                {/* PREP FOR FILMING (PROMPT C): duplicate the master first,
                    then run this on the copy — hide-all + tuck-all, one undo */}
                <button
                  className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.45)" }}
                  title="Hide every card's reveals + tuck all deck members (one undo step). Duplicate the scene first to keep the master."
                  onClick={() => { prepForFilming(); setSettingsOpen(false); }}
                >
                  Prep for filming
                </button>
                {/* CLEAR SCENE — the old "+" semantics, now explicit and guarded */}
                <button
                  className="mt-1.5 w-full rounded px-1 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: NEON.red, border: "1px solid rgba(255,92,122,0.45)" }}
                  title="Reset this tab to a blank untitled scene"
                  onClick={() => {
                    if (window.confirm("Clear this scene? The canvas resets to a blank untitled scene (saved scenes are untouched).")) {
                      clearCanvasState();
                      setSettingsOpen(false);
                    }
                  }}
                >
                  Clear scene
                </button>
                {/* PREVIEW STUDENT — template-variable substitution source */}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }} title="Substitutes {first_name} etc. in headings/text. Live student data arrives with World v1.">
                  Preview student
                </div>
                {TOKEN_KEYS.map((k) => (
                  <label key={k} className="mt-1 flex items-center gap-1 text-[9.5px]" style={{ color: NEON.muted }}>
                    <span className="w-20 shrink-0 truncate">{k}</span>
                    <input
                      className="min-w-0 flex-1 rounded bg-black/30 px-1.5 py-0.5 text-[11px] outline-none"
                      style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                      value={previewStudent[k]}
                      onChange={(e) => patchPreview(k, e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                  </label>
                ))}
                <div className="mt-2 text-[10px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>New-JE mode</div>
                <div className="mt-1 flex gap-1">
                  {(["guided", "practice"] as const).map((p) => (
                    <button
                      key={p}
                      className="flex-1 rounded px-1 py-0.5 text-[9.5px] font-bold uppercase"
                      style={{
                        color: jePreset === p ? NEON.yellow : NEON.muted,
                        border: `1px solid ${jePreset === p ? "rgba(252,163,17,0.5)" : NEON.borderSoft}`,
                        background: jePreset === p ? "rgba(252,163,17,0.12)" : "transparent",
                      }}
                      onClick={() => setJePreset(p)}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <TB title="Clean screen (c)" onClick={() => setClean(true)}><Film className="h-3.5 w-3.5" /></TB>
          {savedAt && <span className="pl-1 text-[10px]" style={{ color: NEON.muted }}>saved {savedAt}</span>}
        </div>
      )}

      {/* SCENE TABS — bottom-left; drag the strip to scroll when overflowing */}
      {chrome && (
        <div
          className="absolute bottom-3 left-3 z-40 flex max-w-[30vw] cursor-grab items-center gap-1 overflow-x-auto rounded-xl px-1.5 py-1 active:cursor-grabbing"
          style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", scrollbarWidth: "none" }}
          onMouseDown={(e) => {
            const el = e.currentTarget;
            const startX = e.clientX;
            const startLeft = el.scrollLeft;
            const move = (ev: MouseEvent) => { el.scrollLeft = startLeft - (ev.clientX - startX); };
            const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
          }}
        >
          {tabState.tabs.map((t) => {
            const active = t.key === tabState.active;
            return (
              <div
                key={t.key}
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-0.5 text-[11px]"
                style={{
                  background: active ? "rgba(252,163,17,0.14)" : "transparent",
                  border: `1px solid ${active ? "rgba(252,163,17,0.5)" : "transparent"}`,
                  color: active ? NEON.yellow : NEON.muted,
                  cursor: "pointer",
                }}
                title={active ? sceneName : t.name}
                onClick={() => switchTab(t.key)}
              >
                <span className="max-w-[110px] truncate font-semibold">{active ? sceneName : t.name}</span>
                {t.dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: NEON.yellow }} title="Unsaved changes" />}
                <button className="shrink-0 opacity-60 hover:opacity-100" title="Close tab" onClick={(e) => { e.stopPropagation(); closeTab(t.key); }}>
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* the persistent hotkey strip is GONE — "?" owns the cheat sheet */}

      {/* "?" cheat sheet — rendered from the keymap registry */}
      {helpOpen && <KeymapOverlay bindings={bindings} onClose={() => setHelpOpen(false)} />}

      {/* AC4: CUE SHEET — the entered frame's derived space-walk sequence (authoring) */}
      {chrome && cueSheetOpen && currentFrameId && <CueSheet frameId={currentFrameId} onClose={() => setCueSheetOpen(false)} />}

      {/* SCRIPT EDITOR — the whole course script in one modal (authoring only) */}
      {chrome && scriptOpen && (
        <ScriptEditor
          courseName={(sceneCourse ? courseLabel(sceneCourse) : null) ?? sceneName ?? "Course"}
          currentFrameId={currentFrameId}
          onClose={() => setScriptOpen(false)}
          statusCell={(fid, status) => <TakeBoardCell frameId={fid} status={status} />}
          lessonControl={(lessonId) => <LessonPublishControl lessonId={lessonId} courseName={sceneCourse ? courseLabel(sceneCourse) : null} />}
        />
      )}

      {/* PHASE 3 EXPERIMENT — in-browser recorder spike (report-only; OBS stays) */}
      {chrome && spikeOpen && <RecorderSpike onClose={() => setSpikeOpen(false)} />}

      {/* TELEPROMPTER — author-only, works in authoring AND film; `p` toggles.
          Never a student surface: it's an overlay on Lee's filming canvas. */}
      {prompter && (
        <TeleprompterOverlay
          frameId={currentFrameId}
          corner={prompterCorner}
          onCorner={setPrompterCorner}
          onClose={() => setPrompter(false)}
        />
      )}


      {/* snap/composition guides — brand-gold lines while a drag aligns. Weight
          sets the treatment: frame CENTER strongest → FIFTHS lightest; SAFE dashed. */}
      {guides.v.map((g, i) => { const s = guideStyle(g.weight); return (
        <div key={`gv${i}-${g.pos}`} className="pointer-events-none absolute z-[45]" style={{ left: g.pos, top: 0, bottom: 0, width: s.thick, background: s.solid, borderLeft: s.dash, opacity: s.opacity }} />
      ); })}
      {guides.h.map((g, i) => { const s = guideStyle(g.weight); return (
        <div key={`gh${i}-${g.pos}`} className="pointer-events-none absolute z-[45]" style={{ top: g.pos, left: 0, right: 0, height: s.thick, background: s.solid, borderTop: s.dash, opacity: s.opacity }} />
      ); })}

      {/* snapshot restore confirm */}
      {confirmSnap && (
        <div className="absolute inset-0 z-[60] grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setConfirmSnap(null)}>
          <div className="w-80 rounded-xl p-4" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <p className="text-[12.5px]">
              Replace the current canvas with the snapshot from{" "}
              <b className="tabular-nums">{new Date(confirmSnap.taken_at).toLocaleString()}</b>? Ctrl+Z brings the current state back.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-2.5 py-1 text-[11.5px] font-semibold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setConfirmSnap(null)}>
                cancel
              </button>
              <button
                className="rounded px-2.5 py-1 text-[11.5px] font-bold"
                style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
                onClick={() => {
                  void restoreSnapshot(confirmSnap.id);
                  setConfirmSnap(null);
                  setLoadOpen(false);
                }}
              >
                restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* two-tab guard banner */}
      {tabConflict && chrome && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(252,163,17,0.15)", border: `1px solid ${NEON.yellow}`, color: NEON.yellow }}>
          This scene is open in another tab — autosave paused here (manual Save still works).
        </div>
      )}

      {/* import diff preview */}
      {importPreview && (
        <div className="absolute inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setImportPreview(null)}>
          <div className="w-96 rounded-xl p-4" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Import preview</div>
            {importPreview.error ? (
              <p className="text-[12px]" style={{ color: NEON.red }}>{importPreview.error}</p>
            ) : (
              <>
                <p className="text-[12.5px]">
                  “{importPreview.name}” brings <b>{importPreview.incomingTotal}</b> cards
                  {Object.entries(importPreview.incomingByKind).map(([k, n]) => ` · ${n} ${k}`).join("")}
                </p>
                <p className="mt-1.5 text-[11.5px]" style={{ color: NEON.muted }}>
                  Applying REPLACES the current canvas ({rf.getNodes().filter((n) => !isContainerType(n.type)).length} cards). The imported scene
                  arrives unsaved — hit Save to keep it. Your DB scenes are untouched until then.
                </p>
              </>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-2.5 py-1 text-[11.5px] font-semibold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setImportPreview(null)}>
                cancel
              </button>
              {!importPreview.error && (
                <button
                  className="rounded px-2.5 py-1 text-[11.5px] font-bold"
                  style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
                  onClick={() => {
                    applyScene(importPreview.payload, null);
                    setImportPreview(null);
                  }}
                >
                  apply import
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REGION SCAFFOLD dialog (PROMPT C) */}
      {scaffoldOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setScaffoldOpen(false)}>
          <div className="w-96 max-w-[92vw] rounded-xl p-4" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.yellow }}>Add region scaffold</div>
            <label className="block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
              region name
              <input
                className="mt-0.5 w-full rounded bg-black/30 px-2 py-1 text-[12px] font-normal normal-case outline-none"
                style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                placeholder="defaults to the course name"
                value={scaffoldName}
                onChange={(e) => setScaffoldName(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </label>
            <label className="mt-2 block text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>
              course
              <select
                className="mt-0.5 w-full rounded bg-black/40 px-1 py-1 text-[11px] font-normal normal-case outline-none"
                style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                value={scaffoldCourseId}
                onChange={(e) => setScaffoldCourseId(e.target.value)}
              >
                <option value="">— pick —</option>
                {(coursesQuery.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{courseLabel(c)} ({c.chapters.filter((ch) => ch.status !== "archived").length} chapters)</option>
                ))}
              </select>
            </label>
            <p className="mt-2 text-[10.5px] leading-snug" style={{ color: NEON.muted }}>
              Stamps a full-width header + one lesson per chapter laid on a snaking path (row 1 →, row 2 ←, …),
              path order following the snake, the course’s final chapter at the end. Everything is ordinary
              editable nodes afterwards — one Ctrl+Z removes the stamp; “Tidy layout” re-snakes later.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded px-2.5 py-1 text-[11.5px] font-semibold" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={() => setScaffoldOpen(false)}>
                cancel
              </button>
              <button
                className="rounded px-2.5 py-1 text-[11.5px] font-bold disabled:opacity-40"
                style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)", background: "rgba(252,163,17,0.12)" }}
                disabled={!scaffoldCourseId}
                onClick={spawnRegionScaffold}
              >
                scaffold
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage accounts (course COA curation) */}
      {manageAccountsOpen && sceneCourseId && (
        <ManageAccountsDialog
          courseId={sceneCourseId}
          courseName={sceneCourse ? courseLabel(sceneCourse) : "Course"}
          onClose={() => setManageAccountsOpen(false)}
        />
      )}

      {/* Manage course (course structure cleanup — rename + chapter CRUD/reorder) */}
      {manageCourseOpen && sceneCourseId && (
        <ManageCourseDialog
          courseId={sceneCourseId}
          courseName={sceneCourse ? courseLabel(sceneCourse) : "Course"}
          onClose={() => setManageCourseOpen(false)}
        />
      )}

      {/* fail-loud banner: content-reset migration not applied */}
      {contentResetMissing && chrome && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(255,92,122,0.15)", border: `1px solid ${NEON.red}`, color: NEON.red }}>
          Scenario lifecycle columns missing — run migration/supabase-migrations/0087_content_reset.sql in the Supabase SQL editor.
        </div>
      )}

      {/* fail-loud banner: scenes table missing / server down */}
      {dbDown && chrome && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(255,92,122,0.15)", border: `1px solid ${NEON.red}`, color: NEON.red }}>
          Scene DB unavailable — {dbDown}. Falling back to localStorage.
        </div>
      )}

      {/* Load dialog — scenes grouped by FOLDER (= course groups, 0088) */}
      {loadOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setLoadOpen(false)}>
          <div className="max-h-[75vh] w-[430px] overflow-y-auto rounded-xl p-3" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.pink }}>Load scene</span>
              <input
                className="ml-auto w-32 rounded bg-black/30 px-1.5 py-0.5 text-[10.5px] outline-none"
                style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                placeholder="New folder…"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && newFolderName.trim()) {
                    void createFolder({ data: { name: newFolderName.trim() } })
                      .then(() => { setNewFolderName(""); void qcFolders(); })
                      .catch((err) => setFoldersError(err instanceof Error ? err.message : String(err)));
                  }
                }}
              />
            </div>
            {foldersError && <p className="mb-2 rounded px-2 py-1 text-[11px]" style={{ color: NEON.red, border: "1px solid rgba(255,92,122,0.4)" }}>{foldersError}</p>}
            {scenes.length === 0 && <p className="text-[12px] italic" style={{ color: NEON.muted }}>No saved scenes yet.</p>}
            {[...(folders ?? []), { id: null as string | null, name: "Unfiled", course_id: null, sort: 9999 }].map((f) => {
              const inFolder = scenes.filter((s) => (s.folder_id ?? null) === f.id);
              const fkey = f.id ?? "__unfiled__";
              const isCollapsed = collapsedFolders.has(fkey);
              return (
                <div key={fkey} className="mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <button
                      className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10.5px] font-bold uppercase tracking-wider"
                      style={{ color: f.id ? NEON.yellow : NEON.muted }}
                      onClick={() => setCollapsedFolders((p) => { const n = new Set(p); if (n.has(fkey)) n.delete(fkey); else n.add(fkey); return n; })}
                    >
                      {isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                      {renamingFolder?.id === f.id ? (
                        <input
                          autoFocus
                          className="w-32 rounded bg-black/40 px-1 text-[10.5px] font-bold uppercase outline-none"
                          style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.text }}
                          defaultValue={f.name}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Enter") {
                              const v = (e.target as HTMLInputElement).value.trim();
                              if (v && f.id) void renameFolder({ data: { id: f.id, name: v } }).then(() => void qcFolders());
                              setRenamingFolder(null);
                            }
                            if (e.key === "Escape") setRenamingFolder(null);
                          }}
                          onBlur={() => setRenamingFolder(null)}
                        />
                      ) : (
                        <span
                          className="truncate"
                          title={f.id ? "Double-click to rename" : "Scenes without a folder"}
                          onDoubleClick={(e) => { e.stopPropagation(); if (f.id) setRenamingFolder({ id: f.id }); }}
                        >
                          {f.name}
                        </span>
                      )}
                      <span style={{ color: NEON.muted }}>({inFolder.length})</span>
                    </button>
                    {f.id && (
                      <button
                        className="shrink-0 text-[10px]"
                        style={{ color: NEON.red }}
                        title={f.course_id ? "Delete folder (course-linked — scenes move to Unfiled)" : "Delete folder (scenes move to Unfiled)"}
                        onClick={() => {
                          const warn = f.course_id
                            ? `"${f.name}" is linked to a course — folder assignments also set scene course context. Delete it anyway? Its ${inFolder.length} scene(s) move to Unfiled (nothing is deleted).`
                            : `Delete folder "${f.name}"? Its ${inFolder.length} scene(s) move to Unfiled (nothing is deleted).`;
                          if (!window.confirm(warn)) return;
                          void deleteFolder({ data: { id: f.id! } })
                            .then(() => {
                              void qcFolders();
                              // repoint the local list too so the rows appear under Unfiled immediately
                              setScenes((xs) => xs.map((x) => (x.folder_id === f.id ? { ...x, folder_id: null } : x)));
                            })
                            .catch((err) => setFoldersError(err instanceof Error ? err.message : String(err)));
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {!isCollapsed && (
                    <div className="mt-1 space-y-1 pl-3">
                      {inFolder.length === 0 && <p className="text-[10px] italic" style={{ color: NEON.muted }}>empty</p>}
                      {inFolder.map((s) => (
                <div key={s.id} className="rounded-md px-2 py-1.5" style={{ border: `1px solid ${NEON.borderSoft}` }}>
                  <div className="flex items-center gap-2">
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium hover:underline"
                      title={tabState.tabs.some((t) => t.sceneId === s.id) ? "Already open — focuses its tab" : "Open in a new tab"}
                      onClick={() => openSceneInTab(s)}
                    >
                      {s.name}
                    </button>
                    <span className="text-[10px]" style={{ color: NEON.muted }}>{new Date(s.updated_at).toLocaleString()}</span>
                    <select
                      className="max-w-[70px] rounded bg-black/40 px-0.5 py-0.5 text-[9px] outline-none"
                      style={{ border: `1px solid ${NEON.borderSoft}`, color: NEON.muted }}
                      title="Move to folder"
                      value={s.folder_id ?? ""}
                      onChange={(e) => void moveScene(s, e.target.value || null)}
                    >
                      <option value="">Unfiled</option>
                      {(folders ?? []).map((fo) => <option key={fo.id} value={fo.id ?? ""}>{fo.name}</option>)}
                    </select>
                    <button
                      className="text-[9.5px] font-semibold uppercase"
                      style={{ color: NEON.cyan }}
                      title="Duplicate scene — full copy, same folder, '(copy)' name"
                      onClick={async () => {
                        const res = await duplicateScene({ data: { id: s.id } });
                        setScenes((xs) => [{ ...s, id: res.id, name: res.name, updated_at: new Date().toISOString() }, ...xs]);
                      }}
                    >
                      dup
                    </button>
                    <button
                      className="text-[9.5px] font-semibold uppercase"
                      style={{ color: snapsFor === s.id ? NEON.yellow : NEON.muted }}
                      title="Snapshots (auto-saved when film mode starts)"
                      onClick={() => void openSnaps(s.id)}
                    >
                      snaps
                    </button>
                    <button
                      className="text-[10px]"
                      style={{ color: NEON.red }}
                      title="Delete scene"
                      onClick={async () => {
                        await deleteScene({ data: { id: s.id } });
                        setScenes((xs) => xs.filter((x) => x.id !== s.id));
                        if (sceneId === s.id) setSceneId(null);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  {snapsFor === s.id && (
                    <div className="mt-1 space-y-0.5 border-t pt-1" style={{ borderColor: NEON.borderSoft }}>
                      {snapErr && <p className="text-[10px]" style={{ color: NEON.red }}>{snapErr}</p>}
                      {!snapErr && snaps.length === 0 && (
                        <p className="text-[10px] italic" style={{ color: NEON.muted }}>No snapshots yet — one is taken each time film mode starts.</p>
                      )}
                      {snaps.map((sn) => (
                        <div key={sn.id} className="flex items-center gap-2 text-[10.5px]">
                          <span className="flex-1 tabular-nums" style={{ color: NEON.text }}>{new Date(sn.taken_at).toLocaleString()}</span>
                          <span style={{ color: NEON.muted }}>{sn.label ?? ""}</span>
                          <button
                            className="rounded px-1.5 text-[9.5px] font-bold uppercase"
                            style={{ color: NEON.yellow, border: "1px solid rgba(252,163,17,0.5)" }}
                            onClick={() => setConfirmSnap(sn)}
                          >
                            restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </FrameTakesProvider>
    </SpotlightCtx.Provider>
    </FrameNavContext.Provider>
    </DecksContext.Provider>
    </CanvasSettingsContext.Provider>
  );
}

function TB({ children, onClick, title, active }: { children: React.ReactNode; onClick: () => void; title: string; active?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded-md transition-colors"
      style={{ color: active === false ? NEON.muted : NEON.text, background: active ? "rgba(252,163,17,0.16)" : "transparent", border: `1px solid transparent` }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = NEON.border)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
    >
      {children}
    </button>
  );
}

/** Labeled toolbar button that opens a dropdown (File, Add Card). */
function MenuButton({ icon, label, open, onClick }: { icon: React.ReactNode; label: string; open: boolean; onClick: () => void }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="flex h-7 items-center gap-1 rounded-md px-2 text-[12px] font-semibold transition-colors"
      style={{ color: NEON.text, background: open ? "rgba(252,163,17,0.16)" : "transparent", border: "1px solid transparent" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = NEON.border)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = open ? NEON.border : "transparent")}
    >
      {icon} {label}
    </button>
  );
}

/** One icon+label row inside a toolbar dropdown menu. */
function MenuRow({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors"
      style={{ color: NEON.text }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(252,163,17,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      onClick={onClick}
    >
      <span style={{ color: NEON.muted }}>{icon}</span> {label}
    </button>
  );
}

function BgOption({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className="block w-full rounded-md px-2 py-1 text-left text-[12px] font-medium transition-colors"
      style={{
        color: active ? NEON.yellow : NEON.text,
        background: active ? "rgba(252,163,17,0.14)" : "transparent",
      }}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
