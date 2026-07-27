// CEQ PREVIEWER (Lee — Studio v2 live sidekick) — a WYSIWYG mini-FRAME. It renders
// the 16:9 frame the set will be dealt into (a visible box you can zoom out to see),
// with the selected CEQ + its chain memos at their REAL frame-local positions, using
// lightweight preview node types (so we never fight the heavy card components).
// MOVE the CEQ/memos by dragging and RESIZE them by the corner grip — both write the
// position + `data.scale` straight back to the real node in the MAIN store, and the
// dealt card reads that same scale (so text scales with it). So what you compose here
// IS what "deal into frame" produces, no post-deal editing. Chain memos are badged
// #1 #2 #3, grayed until walked → colour once walked; a REHEARSAL bar (start/stop
// timer + step ◀ ▶) runs a practice walk without touching film state.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, ConnectionMode, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Timer } from "lucide-react";

import { renderInline } from "./inline-md";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { NEON, PAPER } from "./theme";
import { clampScale, type CeqCard } from "./types";

/** The current rehearsal step, read by memo nodes to decide grayed vs colour. */
const WalkContext = createContext(0);
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The CEQ card's base footprint (matches CEQ_WIDE_W) — centred identically to
// dealIntoFrame so the preview == the dealt frame.
const CARD_W = 560, CARD_H = 480;
export const dealCentre = (fw: number, fh: number) => ({ x: Math.max(0, Math.round((fw - CARD_W) / 2)), y: Math.max(0, Math.round((fh - CARD_H) / 2)) });
/** Default frame-local spot for a NEW memo (stacked to the card's right). */
export const defaultMemoPos = (fw: number, fh: number, i: number) => { const c = dealCentre(fw, fh); return { x: Math.min(fw - 210, c.x + CARD_W + 70), y: Math.max(20, c.y + i * 160) }; };

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes" | "setEdges">;
/** A chain arrow to show in the previewer: memo (source) → choice/other (target). */
export type PreviewEdge = { id: string; source: string; target: string };
// Tiny connection handles so chain arrows can render + be drawn memo→memo/choice.
const HANDLE: React.CSSProperties = { width: 9, height: 9, background: NEON.cyan, border: "1.5px solid #05070d" };

/** A corner grip that drives a node's data.scale (300 screen-px ≈ full range). */
function ScaleGrip({ id, scale, color }: { id: string; scale: number; color: string }) {
  const setScale = useContext(ScaleContext);
  const start = useRef({ v: 0, s: 1 });
  const down = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    start.current = { v: e.clientX + e.clientY, s: scale };
    const move = (ev: PointerEvent) => setScale(id, clampScale(start.current.s + ((ev.clientX + ev.clientY) - start.current.v) / 300));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div className="nodrag" onPointerDown={down} title={`Scale ${Math.round(scale * 100)}% — drag to resize (text scales too)`}
      style={{ position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: 5, background: color, border: "2px solid #05070d", cursor: "nwse-resize", zIndex: 20 }} />
  );
}

/** The 16:9 frame outline — a visible box you can zoom out to; non-interactive. */
function FrameBgNode({ data }: NodeProps) {
  const d = data as unknown as { w: number; h: number };
  return (
    <div style={{ width: d.w, height: d.h, borderRadius: 12, border: `2px solid ${NEON.cyan}`, background: "rgba(8,14,26,0.5)", boxShadow: `0 0 0 1px rgba(79,163,227,0.25), inset 0 0 60px rgba(0,0,0,0.35)`, pointerEvents: "none", position: "relative" }}>
      <span style={{ position: "absolute", top: 8, left: 12, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(79,163,227,0.7)" }}>16:9 frame</span>
    </div>
  );
}

/** Lightweight mock of the CEQ card (stem + lettered choices). Scales with data.scale. */
function CeqPreviewNode({ id, data }: NodeProps) {
  const d = data as unknown as { stem: string; choices: { text: string; correct?: boolean }[]; scale?: number };
  const s = d.scale ?? 1;
  return (
    <div style={{ position: "relative", width: CARD_W * s, borderRadius: 14 * s, background: PAPER.card, border: `${1 * s}px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", padding: 16 * s }}>
      <div style={{ fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 * s }}>{renderInline(d.stem || "Question")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 * s }}>
        {d.choices.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 * s, borderRadius: 10 * s, border: `${1.5 * s}px solid ${c.correct ? "rgba(30,127,79,0.6)" : PAPER.line}`, padding: `${9 * s}px ${12 * s}px` }}>
            <span style={{ display: "grid", placeItems: "center", width: 28 * s, height: 28 * s, borderRadius: 8 * s, fontWeight: 900, fontSize: 15 * s, color: c.correct ? "#fff" : PAPER.inkMuted, background: c.correct ? PAPER.green : "transparent", border: `${2 * s}px solid ${c.correct ? PAPER.green : PAPER.inkMuted}` }}>{LETTER(i)}</span>
            <span style={{ fontSize: 18 * s, fontWeight: 600, color: PAPER.ink }}>{c.text || ""}</span>
          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE, background: PAPER.inkMuted }} />
      <ScaleGrip id={id} scale={s} color={NEON.yellow} />
    </div>
  );
}

/** A chain memo chip with a #N walk badge; grayed until walked. Scales with data.scale. */
function MemoPreviewNode({ id, data }: NodeProps) {
  const walkStep = useContext(WalkContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string; scale?: number };
  const s = d.scale ?? 1;
  const walked = d.walkNum <= walkStep;
  return (
    <div style={{ position: "relative", width: 210 * s, borderRadius: 12 * s, background: NEON.panelSolid, border: `${1.5 * s}px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: `${10 * s}px ${12 * s}px`, opacity: walked ? 1 : 0.45, filter: walked ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "grab" }}>
      <span style={{ position: "absolute", top: -11 * s, left: -11 * s, display: "grid", placeItems: "center", width: 24 * s, height: 24 * s, borderRadius: 999, fontSize: 12 * s, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>
      <div style={{ fontSize: 9 * s, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 3 * s }}>choice {d.choice}</div>
      <div style={{ fontSize: 14 * s, color: NEON.text, lineHeight: 1.25 }}>{d.label}</div>
      <Handle type="target" position={Position.Left} style={HANDLE} />
      <Handle type="source" position={Position.Right} style={HANDLE} />
      <ScaleGrip id={id} scale={s} color={NEON.cyan} />
    </div>
  );
}

const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode };

function Inner({ ceqId, mainRf, mainSig, frameW, frameH, chainEdges, onSelectMemo }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; onSelectMemo?: (id: string | null) => void }) {
  const ceq = mainRf.getNode(ceqId);
  const cd = ceq?.data as unknown as CeqCard | undefined;
  // Flat walk list across choices, in walk order (choice order → chain index).
  const walk = useMemo(() => {
    const list: { memoNodeId: string; label: string; choice: string; num: number }[] = [];
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), num: list.length + 1 })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig]);
  const total = walk.length;
  const walkNumOf = useMemo(() => new Map(walk.map((w) => [w.memoNodeId, w.num])), [walk]);
  const [walkStep, setWalkStep] = useState(0); // rehearsal step (also gates arrow reveal)

  const build = useMemo(() => () => {
    if (!ceq || !cd) return [];
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: 0 }, data: { w: frameW, h: frameH }, draggable: false, selectable: false, zIndex: -10 };
    // The CEQ starts at its stored (frame-local) position; drag to move, grip to
    // resize — both persist so the preview equals the dealt frame.
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { ...ceq.position }, data: { stem: cd.prompt, choices: cd.choices, scale: (ceq.data as { scale?: number }).scale ?? 1 }, draggable: true, zIndex: 1 };
    const memoNodes = walk.map((w, i) => { const m = mainRf.getNode(w.memoNodeId); return { id: w.memoNodeId, type: "memoPreview", position: m ? { ...m.position } : defaultMemoPos(frameW, frameH, i), data: { label: w.label, walkNum: w.num, choice: w.choice, scale: (m?.data as { scale?: number } | undefined)?.scale ?? 1 }, draggable: true, zIndex: 5 }; });
    return [frameNode, ceqNode, ...memoNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => { setNodes(build() as unknown as Node[]); }, [build, setNodes]);

  // Re-fit whenever the question (or frame size) changes — shows the whole frame box.
  const fitRef = useRef<{ fitView: (o?: { padding?: number }) => void } | null>(null);
  useEffect(() => { const t = window.setTimeout(() => fitRef.current?.fitView({ padding: 0.14 }), 40); return () => window.clearTimeout(t); }, [ceqId, frameW, frameH]);

  // Commit a drag to the REAL node (frame-local position == mini position).
  const onDragStop = (_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
    if (node.id === "__frame__") return;
    mainRf.setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: { ...node.position } } : n)));
  };
  // Chain arrows to render: memo → choice/other. Revealed (colour) once the LATER
  // endpoint's walk step is reached (matches film, where an arrow hides until both
  // its ends are shown); a memo owning an arrow reveals it as it's walked.
  const miniIds = useMemo(() => new Set<string>(["__frame__", ceqId, ...walk.map((w) => w.memoNodeId)]), [ceqId, walk]);
  const edges: Edge[] = useMemo(() => (chainEdges ?? [])
    .filter((e) => miniIds.has(e.source) && miniIds.has(e.target))
    .map((e) => {
      const need = Math.max(walkNumOf.get(e.source) ?? 0, walkNumOf.get(e.target) ?? 0);
      const on = need > 0 && walkStep >= need;
      return { id: e.id, source: e.source, target: e.target, type: "smoothstep", style: { stroke: on ? "#E0284A" : "rgba(147,160,180,0.45)", strokeWidth: 2.5, opacity: on ? 1 : 0.4, strokeDasharray: on ? undefined : "5 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: on ? "#E0284A" : "rgba(147,160,180,0.5)" } } as Edge;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainEdges, miniIds, walkNumOf, walkStep]);
  // DRAW a new arrow (memo → memo / choice / card) straight into the MAIN store —
  // its SOURCE memo becomes the parent, so the walk reveals it with that memo.
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const id = `chn-arrow-${c.source}-${c.target}`;
    mainRf.setEdges((eds) => (eds.some((e) => e.id === id) ? eds : [...eds, { id, source: c.source!, target: c.target!, type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } } as Edge]));
  };
  // Live resize — write data.scale to the mini node (for the preview) AND the real node.
  const setScale = (nodeId: string, scale: number) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
    mainRf.setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
  };

  // Rehearsal — a practice walk over the memos; does NOT touch film state.
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    const iv = window.setInterval(() => { if (startRef.current != null) setElapsed(Date.now() - startRef.current); }, 250);
    return () => window.clearInterval(iv);
  }, [running]);
  const toggleRun = () => { if (running) { setRunning(false); return; } startRef.current = Date.now() - elapsed; setRunning(true); };
  const reset = () => { setRunning(false); setWalkStep(0); setElapsed(0); startRef.current = null; };
  const stepWalk = (d: -1 | 1) => setWalkStep((s) => Math.max(0, Math.min(total, s + d)));

  if (!ceq || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    <WalkContext.Provider value={walkStep}>
      <ScaleContext.Provider value={setScale}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1" style={{ background: "rgba(4,7,14,0.6)" }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onNodeDragStop={onDragStop as never}
              onConnect={onConnect}
              onSelectionChange={({ nodes: sel }) => onSelectMemo?.((sel.find((n) => n.type === "memoPreview")?.id) ?? null)}
              onInit={(inst) => { fitRef.current = inst; }}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.14 }}
              minZoom={0.04}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              connectionMode={ConnectionMode.Loose}
              nodesConnectable
              elementsSelectable
              deleteKeyCode={null}
              zoomOnDoubleClick={false}
            >
              <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(147,160,180,0.18)" />
            </ReactFlow>
          </div>
          {/* REHEARSAL BAR */}
          <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)" }}>
            <button className="grid h-6 w-6 place-items-center rounded" style={{ color: running ? "#FF8B9E" : "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggleRun} title={running ? "Pause timer" : "Start practice run"}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
            <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={reset} title="Reset walk + timer"><RotateCcw className="h-3.5 w-3.5" /></button>
            <span className="flex items-center gap-1 tabular-nums text-[12px] font-bold" style={{ color: NEON.text }}><Timer className="h-3.5 w-3.5" style={{ color: NEON.cyan }} />{mmss(elapsed)}</span>
            <div className="ml-auto flex items-center gap-1">
              <button disabled={walkStep === 0} className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => stepWalk(-1)} title="Step back (hide last)"><SkipBack className="h-3.5 w-3.5" /></button>
              <span className="w-10 text-center text-[11px] font-bold tabular-nums" style={{ color: NEON.yellow }}>{walkStep}/{total}</span>
              <button disabled={walkStep >= total} className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => stepWalk(1)} title="Step forward (reveal next)"><SkipForward className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </ScaleContext.Provider>
    </WalkContext.Provider>
  );
}

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], onSelectMemo }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; onSelectMemo?: (id: string | null) => void }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <ReactFlowProvider>
      <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} onSelectMemo={onSelectMemo} />
    </ReactFlowProvider>
  );
}
