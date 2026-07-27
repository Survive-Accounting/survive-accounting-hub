// CEQ PREVIEWER (Lee — Studio v2 live sidekick) — a WYSIWYG mini-FRAME + a PRACTICE
// rig. It renders the 16:9 frame the set will be dealt into (a visible box you can
// zoom out to), with the selected CEQ + its chain memos at their REAL frame-local
// positions using lightweight preview nodes. DRAG to move / corner-grip to resize
// (writes position + data.scale back to the real node, so text scales and the deal
// matches). It also draws + shows chain arrows (memo → choice / memo → memo).
//
// PRACTICE (mouse-free, when the pointer is over the preview): CEQ opens BLANK.
//   Tab / Shift+Tab  — move the emphasis between answer choices (Tab-on-blank → A).
//   Enter            — resolve the emphasised choice (green / red+strike), then each
//                      further Enter reveals the next chain item of THAT choice.
//   Shift+Enter      — step back.
//   Space            — jump to the next question.  ` (backquote) — reset to blank.
// A start/stop timer times the run. Practice state is LOCAL — it never dirties the
// real CEQ, and resets when you switch questions.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, ConnectionMode, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Timer } from "lucide-react";

import { renderInline } from "./inline-md";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { NEON, PAPER } from "./theme";
import { clampScale, type CeqCard } from "./types";

/** Practice state read by the CEQ mock (emphasis + which choices are resolved). */
const PracticeContext = createContext<{ emph: number | null; resolved: Set<number> }>({ emph: null, resolved: new Set() });
/** The set of currently-revealed chain-memo node ids (read by memo chips). */
const RevealContext = createContext<Set<string>>(new Set());
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const CARD_W = 560, CARD_H = 480;
export const dealCentre = (fw: number, fh: number) => ({ x: Math.max(0, Math.round((fw - CARD_W) / 2)), y: Math.max(0, Math.round((fh - CARD_H) / 2)) });
export const defaultMemoPos = (fw: number, fh: number, i: number) => { const c = dealCentre(fw, fh); return { x: Math.min(fw - 210, c.x + CARD_W + 70), y: Math.max(20, c.y + i * 160) }; };

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes" | "setEdges">;
export type PreviewEdge = { id: string; source: string; target: string };
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
  return <div className="nodrag" onPointerDown={down} title={`Scale ${Math.round(scale * 100)}% — drag to resize (text scales too)`} style={{ position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: 5, background: color, border: "2px solid #05070d", cursor: "nwse-resize", zIndex: 20 }} />;
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

/** Lightweight mock of the CEQ card — BLANK until practiced (emphasis ring, then
 *  green/strike on resolve). Scales with data.scale. */
function CeqPreviewNode({ id, data }: NodeProps) {
  const pr = useContext(PracticeContext);
  const d = data as unknown as { stem: string; choices: { text: string; correct?: boolean }[]; scale?: number };
  const s = d.scale ?? 1;
  return (
    <div style={{ position: "relative", width: CARD_W * s, borderRadius: 14 * s, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", padding: 16 * s }}>
      <div style={{ fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 * s }}>{renderInline(d.stem || "Question")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 * s }}>
        {d.choices.map((c, i) => {
          const emph = pr.emph === i;
          const done = pr.resolved.has(i);
          const st = done ? (c.correct ? "right" : "wrong") : null;
          const border = st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : emph ? "#B8860B" : PAPER.line;
          const bg = st === "right" ? "rgba(30,127,79,0.12)" : st === "wrong" ? "rgba(194,24,50,0.09)" : "transparent";
          const chipC = st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : emph ? "#B8860B" : PAPER.inkMuted;
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 * s, borderRadius: 10 * s, border: `${1.5 * s}px solid ${border}`, background: bg, padding: `${9 * s}px ${12 * s}px`, boxShadow: emph ? `0 0 0 ${2 * s}px rgba(184,134,11,0.7)` : undefined, filter: st === "wrong" ? "grayscale(0.3)" : undefined }}>
              <span style={{ display: "grid", placeItems: "center", width: 28 * s, height: 28 * s, borderRadius: 8 * s, fontWeight: 900, fontSize: 15 * s, color: st ? "#fff" : chipC, background: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : "transparent", border: `${2 * s}px solid ${chipC}` }}>{LETTER(i)}</span>
              <span style={{ fontSize: 18 * s, fontWeight: 600, color: PAPER.ink, textDecoration: st === "wrong" ? "line-through" : undefined, textDecorationThickness: st === "wrong" ? `${0.1 * 18 * s}px` : undefined }}>{c.text || ""}</span>
            </div>
          );
        })}
      </div>
      <Handle type="target" position={Position.Left} style={{ ...HANDLE, background: PAPER.inkMuted }} />
      <ScaleGrip id={id} scale={s} color={NEON.yellow} />
    </div>
  );
}

/** A chain memo chip; grayed until revealed by the practice walk. Scales with data.scale. */
function MemoPreviewNode({ id, data }: NodeProps) {
  const revealed = useContext(RevealContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string; scale?: number };
  const s = d.scale ?? 1;
  const walked = revealed.has(id);
  return (
    <div style={{ position: "relative", width: 210 * s, borderRadius: 12 * s, background: NEON.panelSolid, border: `${1.5 * s}px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: `${10 * s}px ${12 * s}px`, opacity: walked ? 1 : 0.4, filter: walked ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "grab" }}>
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

function Inner({ ceqId, mainRf, mainSig, frameW, frameH, chainEdges, onSelectMemo, onNextQuestion, onPrevQuestion }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; onSelectMemo?: (id: string | null) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  const ceq = mainRf.getNode(ceqId);
  const cd = ceq?.data as unknown as CeqCard | undefined;
  const centre = dealCentre(frameW, frameH);
  // Flat walk list: each chain memo with its choice index + position within the chain.
  const walk = useMemo(() => {
    const list: { memoNodeId: string; label: string; choice: string; choiceIdx: number; chainPos: number; num: number }[] = [];
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it, p) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), choiceIdx: ci, chainPos: p, num: list.length + 1 })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig]);

  // ---- PRACTICE (local; never touches the real CEQ) ------------------------
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState<Map<number, number>>(new Map());
  useEffect(() => { setEmph(null); setResolved(new Set()); setShown(new Map()); }, [ceqId]); // BLANK on open / question change
  const nChoices = cd?.choices.length ?? 0;
  const chainLenOf = (ci: number) => cd?.choices[ci]?.chain?.length ?? 0;
  const resetPractice = () => { setEmph(null); setResolved(new Set()); setShown(new Map()); };
  const tabNav = (dir: 1 | -1) => setEmph((e) => (nChoices === 0 ? null : e == null ? (dir > 0 ? 0 : nChoices - 1) : (e + dir + nChoices) % nChoices));
  const advance = () => { // Enter — resolve the emphasised choice, then walk its chain
    const e = emph == null ? 0 : emph;
    if (emph == null) setEmph(0);
    if (!resolved.has(e)) { setResolved((r) => new Set(r).add(e)); setShown((s) => new Map(s).set(e, 0)); }
    else { const cur = shown.get(e) ?? 0; if (cur < chainLenOf(e)) setShown((s) => new Map(s).set(e, cur + 1)); }
  };
  const retreat = () => { // Shift+Enter
    if (emph == null) return;
    const cur = shown.get(emph) ?? 0;
    if (cur > 0) { setShown((s) => new Map(s).set(emph, cur - 1)); return; }
    if (resolved.has(emph)) { setResolved((r) => { const n = new Set(r); n.delete(emph); return n; }); setShown((s) => { const n = new Map(s); n.delete(emph); return n; }); }
  };
  const revealedMemoIds = useMemo(() => { const set = new Set<string>(); for (const w of walk) if (resolved.has(w.choiceIdx) && w.chainPos < (shown.get(w.choiceIdx) ?? 0)) set.add(w.memoNodeId); return set; }, [walk, resolved, shown]);
  const revealedCount = revealedMemoIds.size;

  const build = useMemo(() => () => {
    if (!ceq || !cd) return [];
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: 0 }, data: { w: frameW, h: frameH }, draggable: false, selectable: false, zIndex: -10 };
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { ...ceq.position }, data: { stem: cd.prompt, choices: cd.choices, scale: (ceq.data as { scale?: number }).scale ?? 1 }, draggable: true, zIndex: 1 };
    const memoNodes = walk.map((w, i) => { const m = mainRf.getNode(w.memoNodeId); return { id: w.memoNodeId, type: "memoPreview", position: m ? { ...m.position } : defaultMemoPos(frameW, frameH, i), data: { label: w.label, walkNum: w.num, choice: w.choice, scale: (m?.data as { scale?: number } | undefined)?.scale ?? 1 }, draggable: true, zIndex: 5 }; });
    return [frameNode, ceqNode, ...memoNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => { setNodes(build() as unknown as Node[]); }, [build, setNodes]);

  const fitRef = useRef<{ fitView: (o?: { padding?: number }) => void } | null>(null);
  useEffect(() => { const t = window.setTimeout(() => fitRef.current?.fitView({ padding: 0.14 }), 40); return () => window.clearTimeout(t); }, [ceqId, frameW, frameH]);

  const onDragStop = (_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
    if (node.id === "__frame__") return;
    mainRf.setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: { ...node.position } } : n)));
  };
  const setScale = (nodeId: string, scale: number) => {
    setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
    mainRf.setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
  };

  const miniIds = useMemo(() => new Set<string>(["__frame__", ceqId, ...walk.map((w) => w.memoNodeId)]), [ceqId, walk]);
  const edges: Edge[] = useMemo(() => (chainEdges ?? [])
    .filter((e) => miniIds.has(e.source) && miniIds.has(e.target))
    .map((e) => {
      const on = revealedMemoIds.has(e.source) && (e.target === ceqId || revealedMemoIds.has(e.target));
      return { id: e.id, source: e.source, target: e.target, type: "smoothstep", style: { stroke: on ? "#E0284A" : "rgba(147,160,180,0.45)", strokeWidth: 2.5, opacity: on ? 1 : 0.4, strokeDasharray: on ? undefined : "5 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: on ? "#E0284A" : "rgba(147,160,180,0.5)" } } as Edge;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainEdges, miniIds, revealedMemoIds, ceqId]);
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const id = `chn-arrow-${c.source}-${c.target}`;
    mainRf.setEdges((eds) => (eds.some((e) => e.id === id) ? eds : [...eds, { id, source: c.source!, target: c.target!, type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } } as Edge]));
  };

  // Timer for a practice run.
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => { if (!running) return; const iv = window.setInterval(() => { if (startRef.current != null) setElapsed(Date.now() - startRef.current); }, 250); return () => window.clearInterval(iv); }, [running]);
  const toggleRun = () => { if (running) { setRunning(false); return; } startRef.current = Date.now() - elapsed; setRunning(true); };
  const resetAll = () => { resetPractice(); setRunning(false); setElapsed(0); startRef.current = null; };

  // Practice KEYS — only while the pointer is over the preview (so Tab/Enter/Space
  // don't hijack the rest of the Studio). Ignored while typing in a field.
  const engagedRef = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!engagedRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); tabNav(e.shiftKey ? -1 : 1); return; }
      if (e.key === "Enter") { e.preventDefault(); if (e.shiftKey) retreat(); else advance(); return; }
      if (e.key === " " || e.code === "Space") { e.preventDefault(); onNextQuestion?.(); return; }
      if (e.key === "`" || e.code === "Backquote") { e.preventDefault(); resetPractice(); return; }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emph, resolved, shown, cd, onNextQuestion]);

  if (!ceq || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    <PracticeContext.Provider value={{ emph, resolved }}>
      <RevealContext.Provider value={revealedMemoIds}>
        <ScaleContext.Provider value={setScale}>
          <div className="flex h-full min-h-0 flex-col" onMouseEnter={() => { engagedRef.current = true; }} onMouseLeave={() => { engagedRef.current = false; }}>
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
            {/* PRACTICE BAR — hover the preview, then Tab/Enter/Space/` (mouse-free). */}
            <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)" }}>
              <button className="grid h-6 w-6 place-items-center rounded" style={{ color: running ? "#FF8B9E" : "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggleRun} title={running ? "Pause timer" : "Start practice timer"}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
              <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={resetAll} title="Reset the CEQ to blank + timer (`)"><RotateCcw className="h-3.5 w-3.5" /></button>
              <span className="flex items-center gap-1 tabular-nums text-[12px] font-bold" style={{ color: NEON.text }}><Timer className="h-3.5 w-3.5" style={{ color: NEON.cyan }} />{mmss(elapsed)}</span>
              <span className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted }}>{revealedCount}/{walk.length} shown</span>
              <div className="ml-auto flex items-center gap-1">
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onPrevQuestion?.()} title="Previous question"><ChevronLeft className="h-3.5 w-3.5" /></button>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onNextQuestion?.()} title="Next question (Space)"><ChevronRight className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>
        </ScaleContext.Provider>
      </RevealContext.Provider>
    </PracticeContext.Provider>
  );
}

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], onSelectMemo, onNextQuestion, onPrevQuestion }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; onSelectMemo?: (id: string | null) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <ReactFlowProvider>
      <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} onSelectMemo={onSelectMemo} onNextQuestion={onNextQuestion} onPrevQuestion={onPrevQuestion} />
    </ReactFlowProvider>
  );
}
