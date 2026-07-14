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
  MarkerType,
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
import { useQuery } from "@tanstack/react-query";
import { Download, Film, Frame, Grid3x3, Home, Layers, Map as MapIcon, Plus, Save, FolderOpen, FilePlus2, Settings2, Shrink, Upload, Video as VideoIcon } from "lucide-react";

import { fetchJeBrowserTree } from "@/lib/je-api";
import { deleteScene, listScenes, loadScene, saveScene, type SceneListRow } from "@/lib/canvas.functions";
import { NEON } from "@/components/canvas/theme";
import { blankCard } from "@/components/canvas/templates";
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
import { FormulaCardNode } from "@/components/canvas/cards/FormulaCardNode";
import { NoteCardNode } from "@/components/canvas/cards/NoteCardNode";
import { HeadingCardNode } from "@/components/canvas/cards/HeadingCardNode";
import { cardId, isContainerType, type CardBase, type CardData, type CardNode, type FormulaCard, type JeCard, type LessonBox, type ListCard, type ScheduleCard, type ComputationCard, type ZoneBox } from "@/components/canvas/types";
import { EditableText } from "@/components/canvas/ui";
import { nextStageOrder, useCardActions } from "@/components/canvas/BaseCard";
import { withFaceDown } from "@/components/canvas/CardBack";
import { Deck, categoryOf, isTucked, nextTucked } from "@/components/canvas/Deck";
import { addNodesCmd, bus, compositeCmd, moveNodesCmd, patchDataCmd, type RfLike } from "@/components/canvas/commands";
import { useKeymap, type KeyBinding } from "@/components/canvas/keymap";
import { migrateDeckFields, migrateEdges, sanitizeSceneNodes } from "@/components/canvas/scene-io";
import { ConnectionDots, CONNECTION_DOTS_CSS } from "@/components/canvas/ConnectionDots";
import { CanvasSettingsContext, JE_INDENT_DEFAULT, JE_WIDTH_DEFAULT, type CanvasSettings } from "@/components/canvas/CanvasSettingsContext";
import { JE_PRESETS, groupCoa, hopTo, normalizePreset, type JePreset } from "@/components/canvas/je-logic";
import { listCoa, listSnapshots, loadSnapshot, snapshotScene, type SnapshotListRow } from "@/lib/canvas.functions";
import { downloadText, parseImport, sceneToOutline, type ImportPreview } from "@/components/canvas/export";
import { KeymapOverlay } from "@/components/canvas/KeymapOverlay";
import { ClickRipples, CursorSpotlight, FILM_MODE_CSS } from "@/components/canvas/FilmOverlays";
import { CameraBubble } from "@/components/canvas/CameraBubble";

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
// A titled translucent box that HUGS a heading + its cards: neon-gold border,
// display label follows a contained heading, hug button auto-fits to children,
// pathOrder within the region, HOME flag (welcome lesson: badge + placeholder
// menu slot — the nav menu itself is roadmap). Cards inside ride parentId, so
// dragging the lesson moves them natively, exactly like zones.
// ---------------------------------------------------------------------------
function LessonNode({ id, data, selected }: NodeProps) {
  const d = data as unknown as LessonBox;
  const { update, remove } = useCardActions(id);
  const rf = useReactFlow();
  const nodes = useNodes(); // subscribe: the display label follows a contained heading live
  // manual resize (V2): NodeResizer writes live; the end commits ONE bus command
  const resizeStart = useRef<{ pos: { x: number; y: number }; w: number; h: number } | null>(null);

  const headingText = (() => {
    const h = nodes.find((n) => n.parentId === id && n.type === "heading");
    if (!h) return null;
    const raw = ((h.data as Record<string, unknown>).text as string) ?? "";
    const m = /^(.*?)\s*\[[^\]]+\]\s*$/s.exec(raw); // strip the "[sub]" tail
    return (m ? m[1] : raw).trim() || null;
  })();

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

  return (
    <div
      className="h-full w-full rounded-2xl"
      style={{
        // size comes from the NODE (width/height) — NodeResizer drives it live;
        // data.w/h stay synced on resize-end for the parenting hit test
        minWidth: 180,
        minHeight: 56,
        background: "rgba(252,163,17,0.045)",
        border: `1.5px solid ${selected ? NEON.yellow : "rgba(252,163,17,0.35)"}`,
        boxShadow: selected ? `0 0 24px -8px ${NEON.yellow}` : "none",
      }}
    >
      {/* lessons connect too: card↔lesson, lesson↔lesson (V2) */}
      <ConnectionDots color={NEON.yellow} />
      {/* the lesson is a DESIGNED SPACE: resize it by hand; min = the header */}
      <NodeResizer
        isVisible={!!selected}
        minWidth={180}
        minHeight={56}
        lineStyle={{ borderColor: NEON.yellow }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, background: NEON.yellow, border: "none" }}
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
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11.5px] font-bold uppercase tracking-[0.14em]" style={{ color: NEON.yellow }}>
        {d.home && (
          <span className="grid h-4 w-4 place-items-center rounded" title="HOME lesson — this region's welcome" style={{ background: "rgba(252,163,17,0.18)" }}>
            <Home className="h-3 w-3" />
          </span>
        )}
        {headingText ? (
          <span title="Label follows the heading inside this lesson">{headingText}</span>
        ) : (
          <EditableText value={d.label} onChange={(v) => update({ label: v })} placeholder="Lesson" />
        )}
        {/* teaching-path position within the region */}
        <span
          className="zone-actions rounded px-1 text-[9px] font-bold normal-case tabular-nums"
          style={{
            border: `1px solid ${typeof d.pathOrder === "number" ? "rgba(252,163,17,0.55)" : NEON.borderSoft}`,
            color: typeof d.pathOrder === "number" ? NEON.yellow : NEON.muted,
          }}
          title="Lesson path position within its region"
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
          title="Fit to contents (optional — one undo step)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={hug}
        >
          <Shrink className="h-3 w-3" />
        </button>
        <button
          className="nodrag zone-actions text-[10px] normal-case opacity-50 hover:opacity-100"
          title={d.home ? "Unset HOME" : "Mark as this region's HOME lesson"}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => update({ home: !d.home })}
        >
          <Home className="h-3 w-3" />
        </button>
        <button className="nodrag zone-actions text-[10px] normal-case opacity-50 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={remove}>
          ✕
        </button>
      </div>
      {/* HOME lesson: placeholder nav-menu slot (guided navigation menu = roadmap) */}
      {d.home && (
        <div
          className="absolute bottom-2 left-3 rounded-md px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wider"
          style={{ border: `1px dashed rgba(252,163,17,0.45)`, color: NEON.muted }}
          title="Navigation menu lands here (roadmap: prev/home/next + full region menu)"
        >
          menu · soon
        </div>
      )}
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
  heading: withFaceDown(HeadingCardNode),
  zone: ZoneNode,
  lesson: LessonNode,
};

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
  return null;
}

/** Prep for filming: hide every hideable element on a card (stepper then walks them). */
function hideAll(data: CardData): Partial<CardData> | null {
  if (data.kind === "je") return { lines: (data as JeCard).lines.map((l) => ({ ...l, hidden: true })) } as Partial<CardData>;
  if (data.kind === "computation") return { steps: (data as ComputationCard).steps.map((s) => ({ ...s, hidden: true })) } as Partial<CardData>;
  if (data.kind === "list") return { rows: (data as ListCard).rows.map((r) => ({ ...r, hidden: true })) } as Partial<CardData>;
  if (data.kind === "formula") return { segments: (data as FormulaCard).segments.map((s) => ({ ...s, hidden: true })) } as Partial<CardData>;
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
  { file: "car intro (1).mp4", label: "Car" },
  { file: "dream intro (1).mp4", label: "Dream" },
  { file: "space intro (1).mp4", label: "Space" },
] as const;

interface BgConfig {
  mode: "flat" | "grid" | "video";
  video: string; // file inside /anim
  opacity: number; // 0..1
}
const BG_DEFAULT: BgConfig = { mode: "flat", video: BG_VIDEOS[2].file, opacity: 0.16 };

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
const LS_KEY = "sa-canvas-fallback-scene";

function PresentCanvas() {
  const rf = useReactFlow();
  // UNCONTROLLED React Flow (defaultNodes + store mutations via rf.*): cards edit their own
  // node data with rf.updateNodeData — a controlled useState copy would race those writes
  // and clobber edits (observed: JE amounts lost). useNodes() subscribes where the shell
  // needs to react (tray, minimize sync).
  const liveNodes = useNodes();
  const [bgCfg, setBgCfg] = useState<BgConfig>(BG_DEFAULT);
  const [bgOpen, setBgOpen] = useState(false); // background picker popover
  const [minimap, setMinimap] = useState(true);
  const [clean, setClean] = useState(false);
  const [film, setFilm] = useState(false); // "v": clean screen + at-rest card chrome off + spotlight/ripple
  const [camera, setCamera] = useState(false); // "b": screen-fixed webcam bubble
  // Type floor: warn when zoomed out enough that card text goes illegible on a 1080p recording.
  const lowZoom = useStore((s) => s.transform[2] < 0.75);
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [sceneId, setSceneId] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState("Untitled scene");
  const [dbDown, setDbDown] = useState<string | null>(null); // canvas_scenes missing → banner
  const [scenes, setScenes] = useState<SceneListRow[]>([]);
  const [loadOpen, setLoadOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false); // "?" cheat sheet
  const [settingsOpen, setSettingsOpen] = useState(false); // toolbar canvas-settings gear
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Scenario library for the palette (same query key as /study — shared cache).
  const treeQuery = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 300_000, retry: 1 });
  const library = useMemo(() => (treeQuery.data ? buildLibrary(treeQuery.data) : []), [treeQuery.data]);

  // Chart of accounts (Ole Miss canonical vocabulary — repaired in 0083) for the
  // JE picker + free-text autocomplete. Served by a service-role server fn (RLS
  // blocks anon select). Empty on failure: picker degrades, typing works.
  const coaQuery = useQuery({ queryKey: ["chart-of-accounts"], queryFn: () => listCoa(), staleTime: 600_000, retry: 1 });
  const coaGroups = useMemo(() => groupCoa(coaQuery.data ?? []), [coaQuery.data]);
  const coaNames = useMemo(() => (coaQuery.data ?? []).map((r) => r.canonical_name), [coaQuery.data]);

  // Scene-level card settings (persisted in the scene payload)
  const [jeCardWidth, setJeCardWidth] = useState(JE_WIDTH_DEFAULT);
  const [jeIndent, setJeIndent] = useState(JE_INDENT_DEFAULT); // tetris credit-block stagger
  const [jePreset, setJePreset] = useState<JePreset>("guided");
  const [dealFaceDown, setDealFaceDown] = useState(false); // deck toggle: deals arrive as card backs
  const [hideFdLabels, setHideFdLabels] = useState(false); // quiz mode: banners show "???"
  const [focusPalette, setFocusPalette] = useState(true); // blanks trimmed to JE/T-account/Note/Heading
  const jeLibrary = useMemo(() => library.filter((it) => it.kind === "je"), [library]); // description picker (A12)
  const canvasSettings = useMemo<CanvasSettings>(
    () => ({ jeCardWidth, jeIndent, jePreset, coa: coaGroups, coaNames, hideFdLabels, jeLibrary, setJeCardWidth, setJeIndent, setJePreset }),
    [jeCardWidth, jeIndent, jePreset, coaGroups, coaNames, hideFdLabels, jeLibrary],
  );

  // Off-canvas = TUCKED deck members (dealt members are visible like loose cards);
  // legacy staged/minimized read as tucked until the load-time migration clears them.
  const offCanvas = (d: CardData) => isTucked(d);
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

  // ---- CONNECTIONS (V2): hover dots on every card/lesson (ConnectionDots),
  // drag dot → live smoothstep line → drop on another node's dot. Loose mode:
  // every dot both starts and receives; the chosen sides (t/b/l/r handles)
  // anchor the edge so it never cuts through either endpoint. Click edge +
  // Delete removes (onDelete records it on the bus). Replaces the Ctrl+click
  // gesture era (_arrowPending) entirely.
  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const edge = {
        id: cardId("edge"),
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle ?? "r",
        targetHandle: c.targetHandle ?? "l",
        type: "smoothstep" as const,
        style: { stroke: NEON.pink, strokeWidth: 2.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: NEON.pink, width: 18, height: 18 },
      };
      bus.dispatch({
        label: "connect",
        do: () => rf.addEdges([{ ...edge }]),
        undo: () => rf.setEdges((eds) => eds.filter((e) => e.id !== edge.id)),
      });
    },
    [rf],
  );
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

  // ---- DEAL: card leaves the deck for its REMEMBERED canvas spot (else the next
  // free grid slot), selected on arrival; mount animation = the entrance. One
  // dispatcher command — undo returns it to the deck at its old order.
  const deal = useCallback(
    (id: string) => {
      const node = rf.getNode(id);
      if (!node) return;
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

  const focusNode = useCallback((id: string) => rf.fitView({ nodes: [{ id }], duration: 400, padding: 0.4 }), [rf]);

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

  // ARROWS ROOT CAUSE (C1, extended in V2): React Flow keeps a node invisible
  // and unconnectable until it's INITIALIZED — measured.width set AND
  // handleBounds registered. Both ride a ResizeObserver/rAF path that can lag
  // or sit inert (observed: headless panes; slow tabs). When a rendered node is
  // missing either, force updateNodeInternals for it. Zones are exempt — they
  // have no handles, so their handleBounds never exist by design. No-op when
  // RO already did its job.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    const lookup = storeApi.getState().nodeLookup;
    const stale = liveNodes
      .filter(
        (n) =>
          !n.hidden &&
          n.type !== "zone" &&
          (!(n.measured && typeof n.measured.width === "number") || !lookup.get(n.id)?.internals.handleBounds),
      )
      .map((n) => n.id);
    if (stale.length === 0) return;
    const raf = requestAnimationFrame(() => updateNodeInternals(stale));
    return () => cancelAnimationFrame(raf);
  }, [liveNodes, updateNodeInternals, storeApi]);

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
    },
    [],
  );
  // ---- SNAP GUIDES: edge/center matches vs nearby cards while dragging; the
  // drop settles onto a guide within threshold (no mid-drag position fighting).
  const SNAP_TH = 6; // flow units
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
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
  const onNodeDrag = useCallback(
    (_e: unknown, node: CardNode) => {
      if (isContainerType(node.type) || node.parentId) { setGuides({ v: [], h: [] }); return; }
      const m = guideMatches(node);
      setGuides({
        v: m.vx.map((gx) => rf.flowToScreenPosition({ x: gx, y: 0 }).x),
        h: m.vy.map((gy) => rf.flowToScreenPosition({ x: 0, y: gy }).y),
      });
    },
    [rf, guideMatches],
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
  const onNodeDragStop = useCallback((_e: unknown, node: CardNode) => {
    setGuides({ v: [], h: [] });
    if (isContainerType(node.type)) { commitDrag(); return; } // boxes stay top-level
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
    const nds = rf.getNodes();
    // lessons FIRST: a card dropped where a lesson overlaps its region joins the lesson
    const containers = [...nds.filter((n) => n.type === "lesson"), ...nds.filter((n) => n.type === "zone")];
    const abs = node.parentId
      ? (() => {
          const p = nds.find((n) => n.id === node.parentId);
          return p ? { x: p.position.x + node.position.x, y: p.position.y + node.position.y } : node.position;
        })()
      : node.position;
    const hit = containers.find((z) => {
      const w = (z.data as unknown as ZoneBox).w ?? z.width ?? 0;
      const h = (z.data as unknown as ZoneBox).h ?? z.height ?? 0;
      return abs.x > z.position.x && abs.y > z.position.y && abs.x < z.position.x + w && abs.y < z.position.y + h;
    });
    let decision: { position: { x: number; y: number }; parentId?: string } | null = null;
    if (hit && node.parentId !== hit.id) {
      decision = { parentId: hit.id, position: { x: abs.x - hit.position.x, y: abs.y - hit.position.y } };
    } else if (!hit && node.parentId) {
      decision = { parentId: undefined, position: abs };
    }
    if (decision) {
      const d = decision;
      rf.setNodes((cur) => cur.map((n) => (n.id === node.id ? { ...n, parentId: d.parentId, position: { ...d.position } } : n)));
    }
    // after-state for the dragged node: the decision (or its snap-settled spot);
    // co-dragged selection members fall back to rf.getNode inside commitDrag —
    // XYDrag's own position writes ARE visible by drag-stop.
    commitDrag(new Map([[node.id, decision ?? { position: { ...node.position }, parentId: node.parentId }]]));
  }, [rf, commitDrag, guideMatches]);

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
        schema_version: 3,
        nodes: sanitizeSceneNodes(rf.getNodes()),
        edges: rf.getEdges(),
        sceneSettings: { jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette },
      }),
      viewport_json: JSON.stringify(vp),
      bg: encodeBg(bgCfg),
    };
  }, [rf, sceneName, bgCfg, jeCardWidth, jeIndent, jePreset, dealFaceDown, hideFdLabels, focusPalette]);

  const doSave = useCallback(
    async (asNew?: boolean) => {
      const body = serialize();
      try {
        const res = await saveScene({ data: { ...body, id: asNew ? undefined : sceneId ?? undefined } });
        setSceneId(res.id);
        setSavedAt(new Date().toLocaleTimeString());
        setDbDown(null);
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
      rf.setNodes(migrateDeckFields(sanitizeSceneNodes((nj.nodes ?? []) as CardNode[])));
      // old Ctrl+click-era edges have no handle ids — stamp r→l + smoothstep
      rf.setEdges(migrateEdges((nj.edges ?? []) as never[]));
      setSceneName(payload.name);
      setSceneId(id);
      if (typeof nj.sceneSettings?.jeCardWidth === "number") setJeCardWidth(nj.sceneSettings.jeCardWidth);
      if (typeof nj.sceneSettings?.jeIndent === "number") setJeIndent(nj.sceneSettings.jeIndent);
      // v≤2 scenes may say "blind" — normalize maps it to practice (blind retired)
      if (typeof nj.sceneSettings?.jePreset === "string") setJePreset(normalizePreset(nj.sceneSettings.jePreset));
      if (typeof nj.sceneSettings?.dealFaceDown === "boolean") setDealFaceDown(nj.sceneSettings.dealFaceDown);
      if (typeof nj.sceneSettings?.hideFdLabels === "boolean") setHideFdLabels(nj.sceneSettings.hideFdLabels);
      if (typeof nj.sceneSettings?.focusPalette === "boolean") setFocusPalette(nj.sceneSettings.focusPalette);
      const cfg = decodeBg(payload.bg);
      if (cfg) setBgCfg(cfg);
      const vpFinal = vp;
      if (vpFinal && typeof vpFinal.zoom === "number") setTimeout(() => rf.setViewport(vpFinal), 0);
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

  const newScene = useCallback(() => {
    bus.clear();
    rf.setNodes([]);
    rf.setEdges([]);
    setSceneId(null);
    setSceneName("Untitled scene");
    setSavedAt(null);
  }, [rf]);

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

  // autosave every 30s (only once a scene exists; paused while another tab owns it)
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useEffect(() => {
    const t = setInterval(() => {
      if (sceneId && lockOwned()) void saveRef.current();
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
      const nodesAfter = migrateDeckFields(sanitizeSceneNodes((nj.nodes ?? []) as CardNode[]));
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
  // hopTo moves exactly _selLine or nothing (A6: never a neighbor).
  const hopSelectedLine = useCallback(
    (to: "dr" | "cr") => {
      const sel = rf.getNodes().find((n) => n.selected && n.type === "je");
      if (!sel) return;
      const lid = (sel.data as Record<string, unknown>)._selLine as string | undefined;
      const next = hopTo((sel.data as unknown as JeCard).lines, lid, to);
      if (!next) return;
      const c = patchDataCmd(rf as unknown as RfLike, sel.id, { lines: next }, "hop line");
      if (c) bus.dispatch(c);
    },
    [rf],
  );

  // ---- hotkeys: every binding lives in the registry; "?" renders the cheat sheet ----
  const bindings = useMemo<KeyBinding[]>(
    () => [
      {
        combo: "space",
        group: "Show",
        description: "Flip face-down card, else reveal next, else deal from the deck",
        handler: (e) => {
          // THE SHOW KEY: one key walks the whole lesson.
          e.preventDefault();
          const sel = rf.getNodes().find((n) => n.selected && !isContainerType(n.type));
          if (sel && (sel.data as unknown as CardData).faceDown) {
            const c = patchDataCmd(rf as unknown as RfLike, sel.id, { faceDown: false }, "flip card");
            if (c) bus.dispatch(c);
            return;
          }
          const patch = sel ? stepReveal(sel.data as unknown as CardData) : null;
          if (sel && patch) {
            const c = patchDataCmd(rf as unknown as RfLike, sel.id, patch as Record<string, unknown>, "reveal step");
            if (c) bus.dispatch(c);
          } else {
            const next = nextTucked(rf.getNodes() as never);
            if (next) deal(next.id);
          }
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
          const sel = rf.getNodes().filter((n) => n.selected && !isContainerType(n.type));
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
          if (sel) rf.fitView({ nodes: [{ id: sel.id }], duration: 500, padding: 0.35 });
        },
      },
      {
        combo: "escape",
        group: "Show",
        description: "Restore controls (clean screen) · full view · close dialogs",
        handler: () => {
          setClean(false); // A13: Esc brings the chrome back after "c"
          setHelpOpen(false);
          setLoadOpen(false);
          rf.fitView({ duration: 500, padding: 0.15 });
        },
      },
      { combo: "c", group: "Modes", description: "Clean screen (chrome off)", handler: () => setClean((v) => !v) },
      { combo: "v", group: "Modes", description: "Film mode (spotlight + ripple + chrome off)", handler: () => setFilm((v) => !v) },
      { combo: "b", group: "Modes", description: "Camera bubble", handler: () => setCamera((v) => !v) },
      { combo: "j", group: "Quick-spawn", description: "Journal entry at cursor", handler: () => quickSpawn("je") },
      { combo: "t", group: "Quick-spawn", description: "T-account at cursor", handler: () => quickSpawn("taccount") },
      { combo: "n", group: "Quick-spawn", description: "Note at cursor", handler: () => quickSpawn("note") },
      { combo: "q", group: "Quick-spawn", description: "Question (CEQ) at cursor — inert in focus mode", handler: () => { if (!focusPalette) quickSpawn("ceq"); } },
      { combo: "l", group: "Quick-spawn", description: "Reveal list at cursor — inert in focus mode", handler: () => { if (!focusPalette) quickSpawn("list"); } },
      {
        combo: "arrowleft",
        group: "JE lines",
        description: "Hop selected JE line to the debit side",
        handler: () => hopSelectedLine("dr"),
      },
      {
        combo: "arrowright",
        group: "JE lines",
        description: "Hop selected JE line to the credit side",
        handler: () => hopSelectedLine("cr"),
      },
      { combo: "ctrl+z", group: "History", description: "Undo", handler: (e) => { e.preventDefault(); bus.undo(); } },
      { combo: "ctrl+y", group: "History", description: "Redo", handler: (e) => { e.preventDefault(); bus.redo(); } },
      { combo: "ctrl+shift+z", group: "History", description: "Redo", hidden: true, handler: (e) => { e.preventDefault(); bus.redo(); } },
      { combo: "?", group: "Help", description: "This cheat sheet", handler: () => setHelpOpen((v) => !v) },
    ],
    [rf, deal, quickSpawn, hopSelectedLine, focusPalette],
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
      if (isContainerType(node.type)) return;
      rf.fitView({ nodes: [{ id: node.id }], duration: 500, padding: 0.35 });
    },
    [rf],
  );

  const chrome = !clean && !film;

  return (
    <CanvasSettingsContext.Provider value={canvasSettings}>
    <div className={`fixed inset-0 ${film ? "film-mode" : ""} ${clean ? "sa-clean" : ""} ${connecting ? "sa-connecting" : ""}`} style={{ background: NEON.bg }}>
      <style>{FILM_MODE_CSS}</style>
      <style>{CONNECTION_DOTS_CSS}</style>
      {film && (
        <>
          <CursorSpotlight />
          <ClickRipples />
        </>
      )}
      {/* Camera bubble — screen-fixed; deliberately OUTSIDE chrome gating (it IS filming) */}
      {camera && <CameraBubble onClose={() => setCamera(false)} />}

      {/* Type floor — prep warning, hidden while actually filming */}
      {lowZoom && !film && (
        <div
          className="absolute bottom-12 left-1/2 z-40 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold"
          style={{ background: "rgba(252,163,17,0.14)", border: "1px solid rgba(252,163,17,0.55)", color: NEON.yellow }}
        >
          zoom &lt; 75% — text may be illegible on camera
        </div>
      )}
      {/* looping video background (low opacity, filming-optional); key remounts on swap */}
      {bgCfg.mode === "video" && (
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
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: NEON.cyan, strokeWidth: 2 }}
        multiSelectionKeyCode="Shift"
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.08}
        maxZoom={2.5}
        // FIGMA-STYLE NAV: wheel = zoom at the cursor; drag on empty canvas =
        // pan; shift+drag = selection marquee; pinch zoom native. Inner
        // scrollables opt out with `nowheel` (pickers, card bodies) so their
        // scrolling never zooms the canvas.
        panOnDrag
        panOnScroll={false}
        zoomOnScroll
        zoomOnPinch
        selectionKeyCode="Shift"
        selectionOnDrag={false}
        deleteKeyCode={["Delete", "Backspace"]}
        style={{ background: "transparent" }}
        fitView
      >
        {bgCfg.mode === "grid" && <Background variant={BackgroundVariant.Dots} gap={28} size={1.5} color="rgba(147,160,180,0.28)" />}
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

      {/* Palette */}
      {chrome && <Palette library={library} onSpawn={spawn} collapsed={paletteCollapsed} onToggle={() => setPaletteCollapsed((v) => !v)} focus={focusPalette} />}

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
        />
      )}

      {/* Toolbar */}
      {chrome && (
        <div
          className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl px-2.5 py-1.5"
          style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
        >
          <input
            className="w-40 bg-transparent text-[12.5px] font-semibold outline-none"
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            title="Scene name"
          />
          <TB title="Save" onClick={() => void doSave()}><Save className="h-3.5 w-3.5" /></TB>
          <TB title="Save as new scene" onClick={() => void doSave(true)}><FilePlus2 className="h-3.5 w-3.5" /></TB>
          <TB title="Load scene" onClick={() => void openLoad()}><FolderOpen className="h-3.5 w-3.5" /></TB>
          <TB title="Export scene (.json + outline.md)" onClick={exportScene}><Download className="h-3.5 w-3.5" /></TB>
          <TB title="Import scene from file" onClick={() => importRef.current?.click()}><Upload className="h-3.5 w-3.5" /></TB>
          <input ref={importRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => void onImportFile(e)} />
          <TB title="New (clear canvas)" onClick={newScene}><Plus className="h-3.5 w-3.5" /></TB>
          <span className="mx-1 h-4 w-px" style={{ background: NEON.borderSoft }} />
          <TB title="Add region (zone)" onClick={addZone}><Layers className="h-3.5 w-3.5" /></TB>
          <TB title="Add lesson (heading + cards in a hugging box)" onClick={addLesson}><Frame className="h-3.5 w-3.5" /></TB>
          <div className="relative">
            <TB title="Background & animations" active={bgOpen || bgCfg.mode === "video"} onClick={() => setBgOpen((v) => !v)}>
              {bgCfg.mode === "video" ? <VideoIcon className="h-3.5 w-3.5" /> : <Grid3x3 className="h-3.5 w-3.5" />}
            </TB>
            {bgOpen && (
              <div
                className="absolute left-1/2 top-9 z-50 w-44 -translate-x-1/2 rounded-xl p-2"
                style={{ background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}`, boxShadow: "0 18px 40px -16px rgba(0,0,0,0.7)" }}
              >
                <div className="mb-1 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Background</div>
                <BgOption label="Flat" active={bgCfg.mode === "flat"} onClick={() => { setBgCfg({ ...bgCfg, mode: "flat" }); setBgOpen(false); }} />
                <BgOption label="Dot grid" active={bgCfg.mode === "grid"} onClick={() => { setBgCfg({ ...bgCfg, mode: "grid" }); setBgOpen(false); }} />
                <div className="mb-1 mt-2 text-[9.5px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Animations</div>
                {BG_VIDEOS.map((v) => (
                  <BgOption
                    key={v.file}
                    label={v.label}
                    active={bgCfg.mode === "video" && bgCfg.video === v.file}
                    onClick={() => setBgCfg({ ...bgCfg, mode: "video", video: v.file })}
                  />
                ))}
                {bgCfg.mode === "video" && (
                  <label className="mt-2 block px-1 text-[10px]" style={{ color: NEON.muted }}>
                    opacity · {Math.round(bgCfg.opacity * 100)}%
                    <input
                      type="range"
                      min={4}
                      max={60}
                      value={Math.round(bgCfg.opacity * 100)}
                      onChange={(e) => setBgCfg({ ...bgCfg, opacity: Number(e.target.value) / 100 })}
                      className="mt-0.5 w-full"
                      style={{ accentColor: NEON.yellow }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>
          <TB title="Toggle minimap" active={minimap} onClick={() => setMinimap((v) => !v)}><MapIcon className="h-3.5 w-3.5" /></TB>
          <div className="relative">
            <TB title="Canvas settings (JE width, default preset)" active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}>
              <Settings2 className="h-3.5 w-3.5" />
            </TB>
            {settingsOpen && (
              <div
                className="absolute left-1/2 top-9 z-50 w-52 -translate-x-1/2 rounded-xl p-2.5"
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
                  Focus palette <span className="opacity-60">(JE · T · Note · Heading)</span>
                </label>
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

      {/* hotkey hint — the full sheet lives on "?" */}
      {chrome && (
        <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-[10.5px]" style={{ background: "rgba(0,0,0,0.45)", color: NEON.muted }}>
          space = reveal / deal next · s = stage · c = clean · v = film · b = camera · Ctrl+Z = undo · ? = all keys
        </div>
      )}

      {/* "?" cheat sheet — rendered from the keymap registry */}
      {helpOpen && <KeymapOverlay bindings={bindings} onClose={() => setHelpOpen(false)} />}

      {/* snap guides — gold hairlines while a drag aligns with a neighbor */}
      {guides.v.map((x) => (
        <div key={`gv${x}`} className="pointer-events-none absolute z-[45]" style={{ left: x, top: 0, bottom: 0, width: 1, background: "rgba(252,163,17,0.75)" }} />
      ))}
      {guides.h.map((y) => (
        <div key={`gh${y}`} className="pointer-events-none absolute z-[45]" style={{ top: y, left: 0, right: 0, height: 1, background: "rgba(252,163,17,0.75)" }} />
      ))}

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

      {/* fail-loud banner: scenes table missing / server down */}
      {dbDown && chrome && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(255,92,122,0.15)", border: `1px solid ${NEON.red}`, color: NEON.red }}>
          Scene DB unavailable — {dbDown}. Falling back to localStorage.
        </div>
      )}

      {/* Load dialog */}
      {loadOpen && (
        <div className="absolute inset-0 z-50 grid place-items-center" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setLoadOpen(false)}>
          <div className="max-h-[70vh] w-96 overflow-y-auto rounded-xl p-3" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, color: NEON.text }} onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-[12px] font-bold uppercase tracking-wider" style={{ color: NEON.pink }}>Load scene</div>
            {scenes.length === 0 && <p className="text-[12px] italic" style={{ color: NEON.muted }}>No saved scenes yet.</p>}
            <div className="space-y-1">
              {scenes.map((s) => (
                <div key={s.id} className="rounded-md px-2 py-1.5" style={{ border: `1px solid ${NEON.borderSoft}` }}>
                  <div className="flex items-center gap-2">
                    <button
                      className="min-w-0 flex-1 truncate text-left text-[12.5px] font-medium hover:underline"
                      onClick={async () => {
                        const row = await loadScene({ data: { id: s.id } });
                        applyScene(row, row.id);
                        setLoadOpen(false);
                      }}
                    >
                      {s.name}
                    </button>
                    <span className="text-[10px]" style={{ color: NEON.muted }}>{new Date(s.updated_at).toLocaleString()}</span>
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
          </div>
        </div>
      )}
    </div>
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
