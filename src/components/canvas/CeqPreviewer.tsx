// CEQ PREVIEWER (Lee — Studio v2 live sidekick) — a WYSIWYG mini-FRAME. It renders
// the 16:9 frame the set will be dealt into, with the selected CEQ pinned at the
// exact deal-centre and its chain memos at their REAL frame-local positions, using
// lightweight preview node types (so we never fight the heavy card components).
// DRAGGING a memo writes its new frame-local position straight back to the real
// node in the MAIN store — so what you compose here IS what "deal into frame"
// produces, no post-deal editing. Chain memos are badged #1 #2 #3, grayed until
// walked → colour once walked; a REHEARSAL bar (start/stop timer + step ◀ ▶) runs
// a practice walk without touching film state. The main React Flow is untouched.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useNodesState, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Pause, Play, RotateCcw, SkipBack, SkipForward, Timer } from "lucide-react";

import { renderInline } from "./inline-md";
import { NEON, PAPER } from "./theme";
import type { CeqCard } from "./types";

/** The current rehearsal step, read by memo nodes to decide grayed vs colour. */
const WalkContext = createContext(0);
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The CEQ card's footprint (matches CEQ_WIDE_W and the deal estimate) — used to
// centre it identically to dealIntoFrame so the preview == the dealt frame.
const CARD_W = 560, CARD_H = 480;
export const dealCentre = (fw: number, fh: number) => ({ x: Math.max(0, Math.round((fw - CARD_W) / 2)), y: Math.max(0, Math.round((fh - CARD_H) / 2)) });
/** Default frame-local spot for a NEW memo (stacked to the card's right). */
export const defaultMemoPos = (fw: number, fh: number, i: number) => { const c = dealCentre(fw, fh); return { x: Math.min(fw - 210, c.x + CARD_W + 70), y: Math.max(20, c.y + i * 150) }; };

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes">;

/** The 16:9 frame outline — a non-interactive backdrop so you see the real bounds. */
function FrameBgNode({ data }: NodeProps) {
  const d = data as unknown as { w: number; h: number };
  return <div style={{ width: d.w, height: d.h, borderRadius: 10, border: `2px dashed ${NEON.borderSoft}`, background: "rgba(8,12,22,0.55)", pointerEvents: "none" }} />;
}

/** Lightweight mock of the CEQ card (stem + lettered choices). Read-only. */
function CeqPreviewNode({ data }: NodeProps) {
  const d = data as unknown as { stem: string; choices: { text: string; correct?: boolean }[] };
  return (
    <div style={{ width: CARD_W, borderRadius: 14, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 }}>{renderInline(d.stem || "Question")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {d.choices.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, border: `1.5px solid ${c.correct ? "rgba(30,127,79,0.6)" : PAPER.line}`, padding: "9px 12px" }}>
            <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, fontWeight: 900, fontSize: 15, color: c.correct ? "#fff" : PAPER.inkMuted, background: c.correct ? PAPER.green : "transparent", border: `2px solid ${c.correct ? PAPER.green : PAPER.inkMuted}` }}>{LETTER(i)}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: PAPER.ink }}>{c.text || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A chain memo chip with a #N walk badge; grayed until its step is reached. */
function MemoPreviewNode({ data }: NodeProps) {
  const walkStep = useContext(WalkContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string };
  const walked = d.walkNum <= walkStep;
  return (
    <div style={{ position: "relative", width: 210, borderRadius: 12, background: NEON.panelSolid, border: `1.5px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: "10px 12px", opacity: walked ? 1 : 0.4, filter: walked ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "grab" }}>
      <span style={{ position: "absolute", top: -11, left: -11, display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 999, fontSize: 12, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 3 }}>choice {d.choice}</div>
      <div style={{ fontSize: 14, color: NEON.text, lineHeight: 1.25 }}>{d.label}</div>
    </div>
  );
}

const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode };

function Inner({ ceqId, mainRf, mainSig, frameW, frameH }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number }) {
  const ceq = mainRf.getNode(ceqId);
  const cd = ceq?.data as unknown as CeqCard | undefined;
  const centre = dealCentre(frameW, frameH);
  // Flat walk list across choices, in walk order (choice order → chain index).
  const walk = useMemo(() => {
    const list: { memoNodeId: string; label: string; choice: string; num: number }[] = [];
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), num: list.length + 1 })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig]);
  const total = walk.length;

  const build = useMemo(() => () => {
    if (!ceq || !cd) return [];
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: 0 }, data: { w: frameW, h: frameH }, draggable: false, selectable: false, zIndex: -10 };
    // The CEQ is PINNED at the deal-centre (matches dealIntoFrame), so it never drifts
    // and the preview equals the dealt frame; only memos are placed by dragging.
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { ...centre }, data: { stem: cd.prompt, choices: cd.choices }, draggable: false, zIndex: 1 };
    const memoNodes = walk.map((w, i) => { const m = mainRf.getNode(w.memoNodeId); return { id: w.memoNodeId, type: "memoPreview", position: m ? { ...m.position } : defaultMemoPos(frameW, frameH, i), data: { label: w.label, walkNum: w.num, choice: w.choice }, draggable: true, zIndex: 5 }; });
    return [frameNode, ceqNode, ...memoNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  useEffect(() => { setNodes(build() as never); }, [build, setNodes]);

  // Re-fit whenever the question (or frame size) changes — kills the rightward drift.
  const fitRef = useRef<{ fitView: (o?: { padding?: number }) => void } | null>(null);
  useEffect(() => { const t = window.setTimeout(() => fitRef.current?.fitView({ padding: 0.12 }), 40); return () => window.clearTimeout(t); }, [ceqId, frameW, frameH]);

  // Commit a memo drag to the REAL node (frame-local position == mini position).
  const onDragStop = (_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
    if (node.id === "__frame__" || node.id === ceqId) return;
    mainRf.setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: { ...node.position } } : n)));
  };

  // Rehearsal — a practice walk over the memos; does NOT touch film state.
  const [walkStep, setWalkStep] = useState(0);
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
  const step = (d: -1 | 1) => setWalkStep((s) => Math.max(0, Math.min(total, s + d)));

  if (!ceq || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    <WalkContext.Provider value={walkStep}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1" style={{ background: "rgba(4,7,14,0.6)" }}>
          <ReactFlow
            nodes={nodes as never}
            onNodesChange={onNodesChange}
            onNodeDragStop={onDragStop as never}
            onInit={(inst) => { fitRef.current = inst; }}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.05}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            elementsSelectable={false}
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
            <button disabled={walkStep === 0} className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => step(-1)} title="Step back (hide last)"><SkipBack className="h-3.5 w-3.5" /></button>
            <span className="w-10 text-center text-[11px] font-bold tabular-nums" style={{ color: NEON.yellow }}>{walkStep}/{total}</span>
            <button disabled={walkStep >= total} className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => step(1)} title="Step forward (reveal next)"><SkipForward className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </WalkContext.Provider>
  );
}

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900 }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <ReactFlowProvider>
      <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} />
    </ReactFlowProvider>
  );
}
