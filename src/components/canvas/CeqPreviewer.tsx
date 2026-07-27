// CEQ PREVIEWER (Lee — Studio v2 live sidekick) — a WYSIWYG mini-frame that mirrors
// a CEQ card + its chain memos as a SECOND, isolated React Flow. It renders the REAL
// nodes' data at their REAL (frame-local) positions with lightweight preview node
// types (so we never fight the heavy card components' store bindings), and DRAGGING a
// memo/card writes the new position straight back to the real node in the MAIN store
// — true "place it where it lands". Chain memos are badged #1 #2 #3, grayed until
// walked → colour once walked; a REHEARSAL bar (start/stop timer + step ◀ ▶) runs a
// practice walk without touching the film state. The main React Flow is untouched.
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

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes">;

/** Lightweight mock of the CEQ card (stem + lettered choices). Read-only. */
function CeqPreviewNode({ data }: NodeProps) {
  const d = data as unknown as { stem: string; choices: { text: string; correct?: boolean }[] };
  return (
    <div style={{ width: 360, borderRadius: 12, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 6px 20px -8px rgba(0,0,0,0.5)", padding: 12 }}>
      <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.28, color: PAPER.ink, marginBottom: 8 }}>{renderInline(d.stem || "Question")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {d.choices.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, borderRadius: 8, border: `1px solid ${c.correct ? "rgba(30,127,79,0.6)" : PAPER.line}`, padding: "6px 8px" }}>
            <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, fontWeight: 900, fontSize: 12, color: c.correct ? "#fff" : PAPER.inkMuted, background: c.correct ? PAPER.green : "transparent", border: `1.5px solid ${c.correct ? PAPER.green : PAPER.inkMuted}` }}>{LETTER(i)}</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: PAPER.ink }}>{c.text || ""}</span>
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
    <div style={{ position: "relative", width: 190, borderRadius: 10, background: NEON.panelSolid, border: `1px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: "8px 10px", opacity: walked ? 1 : 0.45, filter: walked ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms" }}>
      <span style={{ position: "absolute", top: -9, left: -9, display: "grid", placeItems: "center", width: 20, height: 20, borderRadius: 999, fontSize: 10, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>
      <div style={{ fontSize: 8, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 2 }}>choice {d.choice}</div>
      <div style={{ fontSize: 12, color: NEON.text, lineHeight: 1.25 }}>{d.label}</div>
    </div>
  );
}

const nodeTypes = { ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode };

function Inner({ ceqId, mainRf, mainSig }: { ceqId: string; mainRf: MainRf; mainSig: string }) {
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

  const build = useMemo(() => () => {
    if (!ceq || !cd) return [];
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { ...ceq.position }, data: { stem: cd.prompt, choices: cd.choices }, draggable: true };
    const memoNodes = walk.map((w) => { const m = mainRf.getNode(w.memoNodeId); return { id: w.memoNodeId, type: "memoPreview", position: m ? { ...m.position } : { x: 480, y: w.num * 90 }, data: { label: w.label, walkNum: w.num, choice: w.choice }, draggable: true }; });
    return [ceqNode, ...memoNodes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  useEffect(() => { setNodes(build() as never); }, [build, setNodes]);

  // Commit a drag to the REAL node (frame-local position == mini position).
  const onDragStop = (_e: unknown, node: { id: string; position: { x: number; y: number } }) => {
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
  const toggleRun = () => {
    if (running) { setRunning(false); return; }
    startRef.current = Date.now() - elapsed; setRunning(true);
  };
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
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.25 }}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
            nodesConnectable={false}
            elementsSelectable={false}
            zoomOnDoubleClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(147,160,180,0.22)" />
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

export function CeqPreviewer({ ceqId, mainRf, mainSig }: { ceqId: string | null; mainRf: MainRf; mainSig: string }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <ReactFlowProvider>
      <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} />
    </ReactFlowProvider>
  );
}
