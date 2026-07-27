// CEQ PREVIEWER (Lee — Studio v2 live sidekick) — a WYSIWYG mini-FRAME + a PRACTICE
// rig. It renders the 16:9 frame the set will be dealt into (a visible box you can
// zoom out to), with the selected CEQ + its chain memos at their REAL frame-local
// positions using lightweight preview nodes. DRAG to move / corner-grip to resize
// (writes position + data.scale back to the real node, so text scales and the deal
// matches). It also draws + shows chain arrows (memo → choice / memo → memo).
//
// ARROWS mirror the real frame EXACTLY: each choice exposes the same right-side
// text-end anchor the live CEQ card uses (TextAnchor → id `anc:<choiceId>`), and a
// memo's arrow leaves its LEFT source ("l"), so the arrow lands on the right side of
// the choice text — not wrapped around the card. Handles are threaded through from
// the real edges (CeqStudio's previewEdges now keeps source/targetHandle).
//
// PRACTICE (mouse-free, when the pointer is over the preview): CEQ opens BLANK.
//   Tab / Shift+Tab  — move the emphasis between answer choices (Tab-on-blank → A).
//   Enter            — resolve the emphasised choice (green / red+strike), then each
//                      further Enter reveals the next chain item of THAT choice.
//   Shift+Enter      — step back.
//   Space            — next question.  Shift+Space — previous.  ` — reset to blank.
// Keys are captured (capture phase + stopImmediatePropagation) while the pointer is
// over the preview, so the canvas space-walk / keymap never steals them.
//
// REHEARSAL SPOTLIGHTS (mirror the live performance gestures, LOCAL to the preview —
// never touches the real global spotlight): Ctrl+click a choice / memo / arrow = gold
// pill; Ctrl+Shift+click = 🔥 super-flame; Ctrl+Alt+Shift+click = 🚨 siren; re-Ctrl+
// click a lit target clears. Plain / Shift+click still selects an arrow (RF).
// A start/stop timer times the run. Practice + spotlight state are LOCAL — they never
// dirty the real CEQ, and reset when you switch questions.
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Background, BackgroundVariant, ConnectionMode, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Timer } from "lucide-react";

import { FLAME_CSS } from "./FilmOverlays";
import { renderInline } from "./inline-md";
import { memoAnchorId } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { playSfx } from "./sfx";
import { spotStyle } from "./SpotlightContext";
import { applyRegularClick, applySuperClick, spotKey, type SpotSets, type SuperTone } from "./spotlight";
import { NEON, PAPER } from "./theme";
import { clampScale, type CeqCard } from "./types";

/** Practice state read by the CEQ mock (emphasis + which choices are resolved). */
const PracticeContext = createContext<{ emph: number | null; resolved: Set<number> }>({ emph: null, resolved: new Set() });
/** The set of currently-revealed chain-memo node ids (read by memo chips). */
const RevealContext = createContext<Set<string>>(new Set());
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
/** LOCAL rehearsal-spotlight layer (never the global controller). Keyed spotKey. */
interface PreviewSpotApi { state: (key: string) => "spot" | null; flamed: (key: string) => boolean; tone: (key: string) => SuperTone; onClick: (key: string, e: React.PointerEvent) => void }
const PreviewSpotContext = createContext<PreviewSpotApi>({ state: () => null, flamed: () => false, tone: () => "focus", onClick: () => {} });
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const CARD_W = 560, CARD_H = 480;
export const dealCentre = (fw: number, fh: number) => ({ x: Math.max(0, Math.round((fw - CARD_W) / 2)), y: Math.max(0, Math.round((fh - CARD_H) / 2)) });
export const defaultMemoPos = (fw: number, fh: number, i: number) => { const c = dealCentre(fw, fh); return { x: Math.min(fw - 210, c.x + CARD_W + 70), y: Math.max(20, c.y + i * 160) }; };

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes" | "setEdges">;
export type PreviewEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
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
 *  green/strike on resolve). Each choice carries the SAME right-side text-end memo
 *  anchor the real card uses (TextAnchor → `anc:<choiceId>`). Scales with data.scale.
 *  Ctrl+click a choice = rehearsal spotlight (local). */
function CeqPreviewNode({ id, data }: NodeProps) {
  const pr = useContext(PracticeContext);
  const spot = useContext(PreviewSpotContext);
  const d = data as unknown as { stem: string; choices: { id: string; text: string; correct?: boolean }[]; scale?: number };
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
          const key = spotKey(id, c.id);
          const spState = spot.state(key);
          const flamed = spot.flamed(key);
          return (
            <div
              key={c.id ?? i}
              data-flame={flamed ? "on" : undefined}
              data-flame-tone={flamed ? spot.tone(key) : undefined}
              onPointerDownCapture={(e) => spot.onClick(key, e)}
              style={{ display: "flex", alignItems: "center", gap: 10 * s, borderRadius: 10 * s, border: `${1.5 * s}px solid ${border}`, background: bg, padding: `${9 * s}px ${12 * s}px`, position: "relative", boxShadow: emph ? `0 0 0 ${2 * s}px rgba(184,134,11,0.7)` : undefined, filter: st === "wrong" ? "grayscale(0.3)" : undefined, ...spotStyle(spState) }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 28 * s, height: 28 * s, borderRadius: 8 * s, fontWeight: 900, fontSize: 15 * s, color: st ? "#fff" : chipC, background: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : "transparent", border: `${2 * s}px solid ${chipC}` }}>{LETTER(i)}</span>
              <span style={{ fontSize: 18 * s, fontWeight: 600, color: PAPER.ink, textDecoration: st === "wrong" ? "line-through" : undefined, textDecorationThickness: st === "wrong" ? "0.1em" : undefined }}>{c.text || ""}</span>
              {/* Right-side memo anchor — the SAME id the real card uses (anc:<choiceId>)
                  so a memo arrow lands on the choice's right edge. A STATIC handle (no
                  useUpdateNodeInternals) — RF measures it on mount, so no per-render
                  handle churn in this nested flow. */}
              <Handle type="target" position={Position.Right} id={memoAnchorId(c.id)} isConnectable={false} style={{ right: -2, top: "50%", transform: "translateY(-50%)", width: 8, height: 8, background: "transparent", border: "none", opacity: 0, pointerEvents: "none" }} />
            </div>
          );
        })}
      </div>
      <ScaleGrip id={id} scale={s} color={NEON.yellow} />
    </div>
  );
}

/** A chain memo chip; grayed until revealed by the practice walk. The arrow leaves
 *  its LEFT source ("l") — matching the real memo card — and a right target ("r")
 *  receives drops. Ctrl+click = rehearsal spotlight (local). Scales with data.scale. */
function MemoPreviewNode({ id, data }: NodeProps) {
  const revealed = useContext(RevealContext);
  const spot = useContext(PreviewSpotContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string; scale?: number };
  const s = d.scale ?? 1;
  const walked = revealed.has(id);
  const key = spotKey(id, "self");
  const spState = spot.state(key);
  const flamed = spot.flamed(key);
  return (
    <div
      data-flame={flamed ? "on" : undefined}
      data-flame-tone={flamed ? spot.tone(key) : undefined}
      onPointerDownCapture={(e) => spot.onClick(key, e)}
      style={{ position: "relative", width: 210 * s, borderRadius: 12 * s, background: NEON.panelSolid, border: `${1.5 * s}px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: `${10 * s}px ${12 * s}px`, opacity: walked ? 1 : 0.4, filter: walked ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "grab", ...spotStyle(spState) }}
    >
      <span style={{ position: "absolute", top: -11 * s, left: -11 * s, display: "grid", placeItems: "center", width: 24 * s, height: 24 * s, borderRadius: 999, fontSize: 12 * s, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>
      <div style={{ fontSize: 9 * s, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 3 * s }}>choice {d.choice}</div>
      <div style={{ fontSize: 14 * s, color: NEON.text, lineHeight: 1.25 }}>{d.label}</div>
      <Handle id="l" type="source" position={Position.Left} style={HANDLE} />
      <Handle id="r" type="target" position={Position.Right} style={HANDLE} />
      <ScaleGrip id={id} scale={s} color={NEON.cyan} />
    </div>
  );
}

const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode };
const EMPTY_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

function Inner({ ceqId, mainRf, mainSig, frameW, frameH, chainEdges, onSelectMemo, onNextQuestion, onPrevQuestion }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; onSelectMemo?: (id: string | null) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  const ceq = mainRf.getNode(ceqId);
  const cd = ceq?.data as unknown as CeqCard | undefined;
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
  // ---- REHEARSAL SPOTLIGHT (local; never touches the real global spotlight) --
  const [spots, setSpots] = useState<SpotSets>(EMPTY_SPOTS);
  const [selEdgeIds, setSelEdgeIds] = useState<Set<string>>(new Set());
  // BOSS test cue (Lee): hear the cram-launch when you ADVANCE to a boss-flagged CEQ
  // in the previewer (not on the first open). Read the flag fresh from the main store.
  const bossArmed = useRef(false);
  useEffect(() => {
    setEmph(null); setResolved(new Set()); setShown(new Map()); setSpots(EMPTY_SPOTS); // BLANK on open / question change
    if (bossArmed.current && !!(mainRf.getNode(ceqId)?.data as { boss?: boolean } | undefined)?.boss) playSfx("cramLaunch");
    bossArmed.current = true;
  }, [ceqId, mainRf]);
  const nChoices = cd?.choices.length ?? 0;
  const chainLenOf = (ci: number) => cd?.choices[ci]?.chain?.length ?? 0;
  const resetPractice = () => { setEmph(null); setResolved(new Set()); setShown(new Map()); };
  const tabNav = (dir: 1 | -1) => setEmph((e) => (nChoices === 0 ? null : e == null ? (dir > 0 ? 0 : nChoices - 1) : (e + dir + nChoices) % nChoices));
  const advance = () => { // Enter — resolve the emphasised choice, then walk its chain
    const e = emph == null ? 0 : emph;
    if (emph == null) setEmph(0);
    if (!resolved.has(e)) {
      setResolved((r) => new Set(r).add(e)); setShown((s) => new Map(s).set(e, 0));
      // CHACHING test cue (Lee): hear it on the correct-resolve when the CEQ is
      // chaching-on (confirmSfx !== false). playSfx respects the global mute.
      if (cd?.choices[e]?.correct && cd?.confirmSfx !== false) playSfx("chaching");
    } else {
      const cur = shown.get(e) ?? 0;
      if (cur < chainLenOf(e)) {
        setShown((s) => new Map(s).set(e, cur + 1));
        const it = cd?.choices[e]?.chain?.[cur]; if (it?.sound) playSfx(it.sound); // per-chain-item reveal sound
      }
    }
  };
  const retreat = () => { // Shift+Enter
    if (emph == null) return;
    const cur = shown.get(emph) ?? 0;
    if (cur > 0) { setShown((s) => new Map(s).set(emph, cur - 1)); return; }
    if (resolved.has(emph)) { setResolved((r) => { const n = new Set(r); n.delete(emph); return n; }); setShown((s) => { const n = new Map(s); n.delete(emph); return n; }); }
  };
  const revealedMemoIds = useMemo(() => { const set = new Set<string>(); for (const w of walk) if (resolved.has(w.choiceIdx) && w.chainPos < (shown.get(w.choiceIdx) ?? 0)) set.add(w.memoNodeId); return set; }, [walk, resolved, shown]);
  const revealedCount = revealedMemoIds.size;

  // Rehearsal-spotlight click: Ctrl+Shift = super (Alt ⇒ siren); Ctrl = toggle a gold
  // pill (re-click a lit target clears all). Mirror the live gesture + stop the native
  // event so a draggable preview node never starts a drag on the spotlight click.
  const spotClick = useCallback((key: string, e: React.PointerEvent) => {
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => applySuperClick(s, key, e.altKey ? "warn" : "focus")); return; }
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); setSpots((s) => (s.regular.has(key) || s.superKey === key ? EMPTY_SPOTS : applyRegularClick(s, key))); }
  }, []);
  const spotApi = useMemo<PreviewSpotApi>(() => ({
    state: (key) => (spots.regular.has(key) || spots.superKey === key ? "spot" : null),
    flamed: (key) => spots.superKey === key,
    tone: () => spots.superTone ?? "focus",
    onClick: spotClick,
  }), [spots, spotClick]);
  // Ctrl+click an ARROW spotlights it too (same local layer, keyed on the edge id).
  const onEdgeClick = useCallback((e: React.MouseEvent, edge: Edge) => {
    const key = spotKey(edge.id, "self");
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); setSpots((s) => applySuperClick(s, key, e.altKey ? "warn" : "focus")); return; }
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopPropagation(); setSpots((s) => (s.regular.has(key) || s.superKey === key ? EMPTY_SPOTS : applyRegularClick(s, key))); }
  }, []);

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
      const revealed = revealedMemoIds.has(e.source) && (e.target === ceqId || revealedMemoIds.has(e.target));
      const sk = spotKey(e.id, "self");
      const flamedE = spots.superKey === sk;
      const spotE = spots.regular.has(sk) || flamedE;
      const selectedE = selEdgeIds.has(e.id);
      const stroke = flamedE ? "#FCA311" : spotE ? "#FFD36A" : selectedE ? NEON.cyan : revealed ? "#E0284A" : "rgba(147,160,180,0.45)";
      const width = flamedE ? 4 : spotE || selectedE ? 3.5 : 2.5;
      const lit = revealed || spotE || selectedE;
      return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "l", targetHandle: e.targetHandle ?? undefined, type: "smoothstep", style: { stroke, strokeWidth: width, opacity: lit ? 1 : 0.4, strokeDasharray: lit ? undefined : "5 4" }, markerEnd: { type: MarkerType.ArrowClosed, color: stroke } } as Edge;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainEdges, miniIds, revealedMemoIds, ceqId, spots, selEdgeIds]);
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const id = `chn-arrow-${c.source}-${c.target}`;
    mainRf.setEdges((eds) => (eds.some((e) => e.id === id) ? eds : [...eds, { id, source: c.source!, target: c.target!, sourceHandle: c.sourceHandle ?? "l", targetHandle: c.targetHandle ?? undefined, type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } } as Edge]));
  };

  // Timer for a practice run.
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => { if (!running) return; const iv = window.setInterval(() => { if (startRef.current != null) setElapsed(Date.now() - startRef.current); }, 250); return () => window.clearInterval(iv); }, [running]);
  const toggleRun = () => { if (running) { setRunning(false); return; } startRef.current = Date.now() - elapsed; setRunning(true); };
  const resetAll = () => { resetPractice(); setSpots(EMPTY_SPOTS); setRunning(false); setElapsed(0); startRef.current = null; };

  // Practice KEYS — only while the pointer is over the preview (so Tab/Enter/Space
  // don't hijack the rest of the Studio). CAPTURE phase + stopImmediatePropagation so
  // the canvas keymap's own "space" show-key (bubble phase, registered earlier) never
  // steals Space. Ignored while typing in a field. The listener binds to the window
  // that OWNS the preview's DOM (rootRef.ownerDocument) — the popout window when the
  // Studio is popped to a 2nd monitor, the main window when inline — so the keys work
  // in both. Re-runs when the owner document changes (inline ⇄ popped).
  const engagedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Bind to the window that OWNS the preview's DOM: the popout window when popped,
    // the main window inline (fallback while rootRef is not yet attached). The effect
    // re-runs on mount + `cd` change, by which point rootRef is populated.
    const win = rootRef.current?.ownerDocument?.defaultView ?? window;
    const onKey = (e: KeyboardEvent) => {
      if (!engagedRef.current) return;
      const el = (win.document.activeElement ?? document.activeElement) as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); tabNav(e.shiftKey ? -1 : 1); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; }
      if (e.key === " " || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) onPrevQuestion?.(); else onNextQuestion?.(); return; }
      if (e.key === "`" || e.code === "Backquote") { e.preventDefault(); e.stopImmediatePropagation(); resetPractice(); return; }
    };
    win.addEventListener("keydown", onKey, true);
    return () => win.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emph, resolved, shown, cd, onNextQuestion, onPrevQuestion]);

  if (!ceq || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    <PracticeContext.Provider value={{ emph, resolved }}>
      <RevealContext.Provider value={revealedMemoIds}>
        <ScaleContext.Provider value={setScale}>
          <PreviewSpotContext.Provider value={spotApi}>
            {/* FLAME/SIREN CSS injected locally so it works even when the Studio is
                popped out to a 2nd window (the global copy lives on the main canvas). */}
            <style>{FLAME_CSS}</style>
            <div ref={rootRef} className="flex h-full min-h-0 flex-col" onMouseEnter={() => { engagedRef.current = true; }} onMouseLeave={() => { engagedRef.current = false; }}>
              <div className="min-h-0 flex-1" style={{ background: "rgba(4,7,14,0.6)" }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onNodeDragStop={onDragStop as never}
                  onConnect={onConnect}
                  onEdgeClick={onEdgeClick}
                  onSelectionChange={({ nodes: sel, edges: selE }) => {
                    onSelectMemo?.((sel.find((n) => n.type === "memoPreview")?.id) ?? null);
                    // STABILIZE (fix #185): RF re-fires onSelectionChange every time the
                    // controlled `edges` prop is re-adopted; building a fresh Set here each
                    // time gave `selEdgeIds` a new reference → the `edges` memo (which reads
                    // it) recomputed → a new edges array → RF re-adopted → re-fired here …
                    // an infinite setEdges loop. Return the SAME Set when the selection is
                    // unchanged so React bails and the cycle can't start.
                    const ids = selE.map((e) => e.id);
                    setSelEdgeIds((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids)));
                  }}
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
              {/* PRACTICE BAR — hover the preview, then Tab/Enter/Space/` (mouse-free).
                  Ctrl+click a choice/memo/arrow = spotlight · +Shift = 🔥 · +Alt+Shift = 🚨. */}
              <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)" }}>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: running ? "#FF8B9E" : "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggleRun} title={running ? "Pause timer" : "Start practice timer"}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={resetAll} title="Reset the CEQ to blank + clear spotlights + timer (`)"><RotateCcw className="h-3.5 w-3.5" /></button>
                <span className="flex items-center gap-1 tabular-nums text-[12px] font-bold" style={{ color: NEON.text }}><Timer className="h-3.5 w-3.5" style={{ color: NEON.cyan }} />{mmss(elapsed)}</span>
                <span className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted }}>{revealedCount}/{walk.length} shown</span>
                <span className="hidden text-[9px] lg:inline" style={{ color: NEON.muted }} title="Rehearse the live gestures right here">· Ctrl+click = spotlight · +Shift = 🔥</span>
                <div className="ml-auto flex items-center gap-1">
                  <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onPrevQuestion?.()} title="Previous question (Shift+Space)"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onNextQuestion?.()} title="Next question (Space)"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          </PreviewSpotContext.Provider>
        </ScaleContext.Provider>
      </RevealContext.Provider>
    </PracticeContext.Provider>
  );
}

/** CONTAINMENT boundary — a bug in the isolated previewer must NEVER take down the
 *  whole authoring canvas (which would surface as the route's "This page didn't load").
 *  It catches, logs, and shows a recoverable fallback scoped to the preview pane. It is
 *  NOT keyed on the question (that remounted the whole previewer every advance, resetting
 *  the pointer-engaged flag so Space/Shift+Space died after one press) — instead it
 *  clears a stale error when `resetKey` (the question) changes, so a bad question can't
 *  wedge the pane while a healthy one keeps its mounted state. */
class PreviewErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("[CeqPreviewer] crashed (contained):", error); }
  componentDidUpdate(prev: { resetKey: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      return (
        <div className="grid h-full place-items-center p-3 text-center text-[11px]" style={{ color: NEON.muted }}>
          <div>
            <div style={{ color: "#FF8B9E", fontWeight: 700 }}>Preview hit an error.</div>
            <div className="mt-1">The rest of the Studio is fine — pick another question, or reopen the Studio.</div>
            <button className="mt-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => this.setState({ error: null })}>retry</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], onSelectMemo, onNextQuestion, onPrevQuestion }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; onSelectMemo?: (id: string | null) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <PreviewErrorBoundary resetKey={ceqId}>
      <ReactFlowProvider>
        <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} onSelectMemo={onSelectMemo} onNextQuestion={onNextQuestion} onPrevQuestion={onPrevQuestion} />
      </ReactFlowProvider>
    </PreviewErrorBoundary>
  );
}
