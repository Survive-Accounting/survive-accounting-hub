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
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  MarkerType,
  useNodes,
  useReactFlow,
  useStore,
  type NodeProps,
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery } from "@tanstack/react-query";
import { Film, Grid3x3, Layers, Map as MapIcon, Plus, Save, FolderOpen, FilePlus2, Video as VideoIcon } from "lucide-react";

import { fetchJeBrowserTree } from "@/lib/je-api";
import { deleteScene, listScenes, loadScene, saveScene, type SceneListRow } from "@/lib/canvas.functions";
import { NEON } from "@/components/canvas/theme";
import { blankCard } from "@/components/canvas/templates";
import { buildLibrary } from "@/components/canvas/library";
import { Palette } from "@/components/canvas/Palette";
import { JeCardNode } from "@/components/canvas/cards/JeCardNode";
import { ScheduleCardNode } from "@/components/canvas/cards/ScheduleCardNode";
import {
  CeqCardNode, ComputationCardNode, MemorizeCardNode, NoteCardNode, TAccountCardNode, VideoCardNode,
} from "@/components/canvas/cards/OtherCards";
import { ListCardNode } from "@/components/canvas/cards/ListCardNode";
import { ImageCardNode, uploadImageFile } from "@/components/canvas/cards/ImageCardNode";
import { cardId, type CardData, type CardNode, type JeCard, type ListCard, type ScheduleCard, type ComputationCard, type ZoneBox } from "@/components/canvas/types";
import { EditableText } from "@/components/canvas/ui";
import { nextStageOrder, useCardActions } from "@/components/canvas/BaseCard";
import { BackstageRail, stagedInOrder } from "@/components/canvas/BackstageRail";
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
      <div className="px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.cyan }}>
        <EditableText value={d.label} onChange={(v) => update({ label: v })} placeholder="Zone" />
        <button className="nodrag zone-actions ml-2 text-[10px] normal-case opacity-50 hover:opacity-100" onPointerDown={(e) => e.stopPropagation()} onClick={remove}>
          ✕
        </button>
      </div>
    </div>
  );
}

const nodeTypes = {
  je: JeCardNode,
  schedule: ScheduleCardNode,
  computation: ComputationCardNode,
  taccount: TAccountCardNode,
  ceq: CeqCardNode,
  memorize: MemorizeCardNode,
  note: NoteCardNode,
  video: VideoCardNode,
  list: ListCardNode,
  image: ImageCardNode,
  zone: ZoneNode,
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
  return null;
}

/** Prep for filming: hide every hideable element on a card (stepper then walks them). */
function hideAll(data: CardData): Partial<CardData> | null {
  if (data.kind === "je") return { lines: (data as JeCard).lines.map((l) => ({ ...l, hidden: true })) } as Partial<CardData>;
  if (data.kind === "computation") return { steps: (data as ComputationCard).steps.map((s) => ({ ...s, hidden: true })) } as Partial<CardData>;
  if (data.kind === "list") return { rows: (data as ListCard).rows.map((r) => ({ ...r, hidden: true })) } as Partial<CardData>;
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
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Scenario library for the palette (same query key as /study — shared cache).
  const treeQuery = useQuery({ queryKey: ["je-tree"], queryFn: fetchJeBrowserTree, staleTime: 300_000, retry: 1 });
  const library = useMemo(() => (treeQuery.data ? buildLibrary(treeQuery.data) : []), [treeQuery.data]);

  // Minimized cards → bottom tray; STAGED cards → backstage rail. Both are hidden on
  // the canvas via the same node.hidden sync.
  const trayCards = liveNodes.filter((n) => (n.data as unknown as CardData).minimized);
  const offCanvas = (d: CardData) => !!d.minimized || !!d.staged;
  useEffect(() => {
    if (liveNodes.some((n) => !!n.hidden !== offCanvas(n.data as unknown as CardData) || (n.hidden && n.selected))) {
      rf.setNodes((nds) =>
        nds.map((n) => {
          const off = offCanvas(n.data as unknown as CardData);
          // off-canvas cards are also DESELECTED — otherwise the show key would step the
          // reveals of an invisible staged card instead of summoning the next one.
          if (!!n.hidden !== off || (off && n.selected)) return { ...n, hidden: off, selected: off ? false : n.selected };
          return n;
        }),
      );
    }
  }, [liveNodes, rf]);

  // ---- CARD-TO-CARD ARROWS: Ctrl/Cmd+click A (glows cyan as pending source), then
  // Ctrl/Cmd+click B → neon edge A→B. Esc cancels. Click edge + Delete removes it.
  // The pending source lives in NODE DATA (_arrowPending) — single source of truth, so
  // it can't desync from a ref across remounts and stale flags self-heal.
  const clearArrowPending = useCallback(() => {
    rf.setNodes((nds) =>
      nds.map((n) => ((n.data as Record<string, unknown>)._arrowPending ? { ...n, data: { ...n.data, _arrowPending: false } } : n)),
    );
  }, [rf]);
  // React Flow 12 invokes onNodeClick TWICE per click in this tree (observed on a fresh
  // page, single dispatched event) — dedupe on the event timestamp or the pending toggle
  // would cancel itself instantly.
  const lastClickStamp = useRef(0);
  const onNodeClick = useCallback(
    (e: React.MouseEvent, node: CardNode) => {
      if (!(e.ctrlKey || e.metaKey) || node.type === "zone") return;
      if (e.timeStamp === lastClickStamp.current) return;
      lastClickStamp.current = e.timeStamp;
      e.preventDefault();
      const src = rf.getNodes().find((n) => (n.data as Record<string, unknown>)._arrowPending)?.id ?? null;
      if (!src) {
        rf.updateNodeData(node.id, { _arrowPending: true });
      } else if (src !== node.id) {
        rf.addEdges([
          {
            id: cardId("edge"),
            source: src,
            target: node.id,
            style: { stroke: NEON.pink, strokeWidth: 2.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color: NEON.pink, width: 18, height: 18 },
          },
        ]);
        clearArrowPending();
      } else {
        clearArrowPending(); // mod+click the pending card again = cancel
      }
    },
    [rf, clearArrowPending],
  );

  // ---- SUMMON: bring a staged card on stage — visible, selected, everything else deselected.
  // (Un-hiding remounts the node, so the card's mount animation plays — the summon effect.)
  const summon = useCallback(
    (id: string) => {
      rf.setNodes((nds) =>
        nds.map((n) =>
          n.id === id
            ? { ...n, hidden: false, selected: true, data: { ...n.data, staged: false } }
            : n.selected
              ? { ...n, selected: false }
              : n,
        ),
      );
    },
    [rf],
  );

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
      const id = cardId(data.kind);
      rf.addNodes([
        {
          id,
          type: data.kind,
          position: at
            ? { x: center.x, y: center.y }
            : { x: center.x - 140 + (Math.random() * 40 - 20), y: center.y - 80 + (Math.random() * 40 - 20) },
          data: data as unknown as CardData & Record<string, unknown>,
          selected: true,
        },
      ]);
      return id;
    },
    [rf],
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

  // Ctrl+V with an image on the clipboard → image card at the cursor, uploading
  // in place. Skipped while typing (inputs own their own paste).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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

  const addZone = useCallback(() => {
    const rect = document.querySelector(".react-flow")?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({ x: (rect?.left ?? 0) + (rect?.width ?? 1200) / 2, y: (rect?.top ?? 0) + (rect?.height ?? 700) / 2 });
    rf.addNodes([
      {
        id: cardId("zone"),
        type: "zone",
        position: { x: center.x - 260, y: center.y - 160 },
        width: 520,
        height: 320,
        zIndex: -1,
        data: { kind: "note", label: "New zone", w: 520, h: 320 } as unknown as CardData & Record<string, unknown>,
      },
    ]);
  }, [rf]);

  // ---- zone membership: drop a card inside a zone → parent it (moves with the zone) ----
  const onNodeDragStop = useCallback((_e: unknown, node: CardNode) => {
    if (node.type === "zone") return;
    rf.setNodes((nds) => {
      const zones = nds.filter((n) => n.type === "zone");
      const abs = node.parentId
        ? (() => {
            const p = nds.find((n) => n.id === node.parentId);
            return p ? { x: p.position.x + node.position.x, y: p.position.y + node.position.y } : node.position;
          })()
        : node.position;
      const hit = zones.find((z) => {
        const w = (z.data as unknown as ZoneBox).w ?? z.width ?? 0;
        const h = (z.data as unknown as ZoneBox).h ?? z.height ?? 0;
        return abs.x > z.position.x && abs.y > z.position.y && abs.x < z.position.x + w && abs.y < z.position.y + h;
      });
      return nds.map((n) => {
        if (n.id !== node.id) return n;
        if (hit && n.parentId !== hit.id) {
          return { ...n, parentId: hit.id, position: { x: abs.x - hit.position.x, y: abs.y - hit.position.y } };
        }
        if (!hit && n.parentId) return { ...n, parentId: undefined, position: abs };
        return n;
      });
    });
  }, [rf]);

  // ---- scenes (JSON blobs cross the server-fn boundary as strings) ----
  const serialize = useCallback(() => {
    const vp = rf.getViewport();
    return {
      name: sceneName,
      // strip the transient _arrowPending flag; edges + schema_version ride along
      nodes_json: JSON.stringify({
        schema_version: 1,
        nodes: rf.getNodes().map((n) => {
          const { _arrowPending, ...data } = n.data as Record<string, unknown>;
          void _arrowPending;
          return { ...n, data };
        }),
        edges: rf.getEdges(),
      }),
      viewport_json: JSON.stringify(vp),
      bg: encodeBg(bgCfg),
    };
  }, [rf, sceneName, bgCfg]);

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
      let nj: { schema_version?: number; nodes?: CardNode[]; edges?: unknown[] } = {};
      let vp: Viewport | null = null;
      try {
        nj = JSON.parse(payload.nodes_json || "{}");
        vp = JSON.parse(payload.viewport_json || "null");
      } catch (e) {
        setDbDown(`Scene payload unreadable: ${e instanceof Error ? e.message : e}`); // fail loud
        return;
      }
      // schema_version 1 (loader tolerates absence — pre-versioning scenes load fine)
      rf.setNodes((nj.nodes ?? []) as CardNode[]);
      rf.setEdges((nj.edges ?? []) as never[]);
      setSceneName(payload.name);
      setSceneId(id);
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
    rf.setNodes([]);
    rf.setEdges([]);
    setSceneId(null);
    setSceneName("Untitled scene");
    setSavedAt(null);
  }, [rf]);

  // autosave every 30s (only once a scene exists or after first manual save attempt)
  const saveRef = useRef(doSave);
  saveRef.current = doSave;
  useEffect(() => {
    const t = setInterval(() => {
      if (sceneId) void saveRef.current();
    }, 30_000);
    return () => clearInterval(t);
  }, [sceneId]);

  // ---- hotkeys: c (clean screen), space (stepper), f (focus), Esc (full view) ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "c" || e.key === "C") {
        setClean((v) => !v);
      } else if (e.key === "v" || e.key === "V") {
        setFilm((v) => !v); // film mode: clean screen + at-rest chrome off + spotlight/ripple
      } else if (e.key === "b" || e.key === "B") {
        setCamera((v) => !v); // webcam bubble (screen-fixed filming chrome)
      } else if (e.key === "j" || e.key === "J") {
        quickSpawn("je");
      } else if (e.key === "t" || e.key === "T") {
        quickSpawn("taccount");
      } else if (e.key === "n" || e.key === "N") {
        quickSpawn("note");
      } else if (e.key === "q" || e.key === "Q") {
        quickSpawn("ceq");
      } else if (e.key === "l" || e.key === "L") {
        quickSpawn("list");
      } else if (e.key === "Escape") {
        setLoadOpen(false);
        clearArrowPending(); // cancel a pending arrow source
        rf.fitView({ duration: 500, padding: 0.15 });
      } else if (e.key === " ") {
        // THE SHOW KEY: selected card has hidden elements → reveal next; otherwise summon
        // the next staged card in rail order. One key walks the whole lesson.
        e.preventDefault();
        const sel = rf.getNodes().find((n) => n.selected && n.type !== "zone");
        const patch = sel ? stepReveal(sel.data as unknown as CardData) : null;
        if (sel && patch) {
          rf.updateNodeData(sel.id, patch);
        } else {
          const next = stagedInOrder(rf.getNodes() as never)[0];
          if (next) summon(next.id);
        }
      } else if (e.key === "s" || e.key === "S") {
        // stage/unstage selected card(s)
        const sel = rf.getNodes().filter((n) => n.selected && n.type !== "zone");
        if (sel.length === 0) return;
        let order = nextStageOrder(rf.getNodes());
        for (const n of sel) {
          const st = (n.data as unknown as CardData).staged;
          rf.updateNodeData(n.id, st ? { staged: false } : { staged: true, stageOrder: order++ });
        }
      } else if (e.key === "f" || e.key === "F") {
        const sel = rf.getNodes().find((n) => n.selected);
        if (sel) rf.fitView({ nodes: [{ id: sel.id }], duration: 500, padding: 0.35 });
      } else if (e.key === "h" || e.key === "H") {
        const sel = rf.getNodes().find((n) => n.selected && n.type !== "zone");
        if (!sel) return;
        const patch = hideAll(sel.data as unknown as CardData);
        if (patch) rf.updateNodeData(sel.id, patch);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rf, summon, quickSpawn, clearArrowPending]);

  // focus-zoom on double click (single click selects/edits — double is the zoom gesture)
  const onNodeDoubleClick = useCallback(
    (_e: unknown, node: CardNode) => {
      if (node.type === "zone") return;
      rf.fitView({ nodes: [{ id: node.id }], duration: 500, padding: 0.35 });
    },
    [rf],
  );

  const chrome = !clean && !film;

  return (
    <div className={`fixed inset-0 ${film ? "film-mode" : ""}`} style={{ background: NEON.bg }}>
      <style>{FILM_MODE_CSS}</style>
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
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeClick={onNodeClick}
        multiSelectionKeyCode="Shift" // free Ctrl/Cmd+click for the arrow gesture
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
        minZoom={0.08}
        maxZoom={2.5}
        panOnDrag
        panOnScroll
        zoomOnPinch
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
      {chrome && <Palette library={library} onSpawn={spawn} collapsed={paletteCollapsed} onToggle={() => setPaletteCollapsed((v) => !v)} />}

      {/* Backstage rail — the show queue (hidden in clean/film mode; spacebar still summons) */}
      {chrome && <BackstageRail onSummon={summon} />}

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
          <TB title="New (clear canvas)" onClick={newScene}><Plus className="h-3.5 w-3.5" /></TB>
          <span className="mx-1 h-4 w-px" style={{ background: NEON.borderSoft }} />
          <TB title="Add zone" onClick={addZone}><Layers className="h-3.5 w-3.5" /></TB>
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
          <TB title="Clean screen (c)" onClick={() => setClean(true)}><Film className="h-3.5 w-3.5" /></TB>
          {savedAt && <span className="pl-1 text-[10px]" style={{ color: NEON.muted }}>saved {savedAt}</span>}
        </div>
      )}

      {/* hotkey hint */}
      {chrome && (
        <div className="absolute bottom-3 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-[10.5px]" style={{ background: "rgba(0,0,0,0.45)", color: NEON.muted }}>
          space = reveal / summon next · h = hide all · s = stage · f = focus · Esc = full view · c = clean · v = film · b = camera · J/T/N/Q/L = quick-spawn
        </div>
      )}

      {/* fail-loud banner: scenes table missing / server down */}
      {dbDown && chrome && (
        <div className="absolute left-1/2 top-16 z-50 -translate-x-1/2 rounded-lg px-3 py-1.5 text-[12px] font-semibold" style={{ background: "rgba(255,92,122,0.15)", border: `1px solid ${NEON.red}`, color: NEON.red }}>
          Scene DB unavailable — {dbDown}. Falling back to localStorage.
        </div>
      )}

      {/* Bottom tray — minimized cards */}
      {chrome && trayCards.length > 0 && (
        <div className="absolute bottom-3 left-3 z-40 flex max-w-[60vw] flex-wrap gap-1.5">
          {trayCards.map((n) => {
            const d = n.data as unknown as CardData;
            return (
              <button
                key={n.id}
                className="rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{ background: NEON.panelSolid, color: NEON.pinkSoft, border: `1px solid ${NEON.border}` }}
                onClick={() => rf.updateNodeData(n.id, { minimized: false })}
                title="Restore card"
              >
                ▸ {d.title || d.kind}
              </button>
            );
          })}
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
                <div key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5" style={{ border: `1px solid ${NEON.borderSoft}` }}>
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
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
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
