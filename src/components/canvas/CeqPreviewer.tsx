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
import { Background, BackgroundVariant, ConnectionMode, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodes, useNodesState, useUpdateNodeInternals, type Connection, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Clapperboard, ChevronLeft, ChevronRight, LayoutGrid, Maximize2, Pause, Play, Plus, RotateCcw, Rows3, Spline, Timer } from "lucide-react";

import { BrandWatermark } from "./BrandBar";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { FLAME_CSS } from "./FilmOverlays";
import { openPopoutWindow, PanelPopout } from "./PanelPopout";
import { WorldBackground } from "./WorldBackground";
import { WORLDS } from "./worlds";
import { renderInline } from "./inline-md";
import { TextAnchor } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { playSfx } from "./sfx";
import { spotStyle } from "./SpotlightContext";
import { applyRegularClick, applySuperClick, spotKey, type SpotSets, type SuperTone } from "./spotlight";
import { NEON, PAPER } from "./theme";
import { clampScale, type CeqCard, type CeqChainItem, type DeckLayout, type DeckSlotLayout } from "./types";

/** Practice state read by the CEQ mock (emphasis + which choices are resolved). */
const PracticeContext = createContext<{ emph: number | null; resolved: Set<number> }>({ emph: null, resolved: new Set() });
/** The set of currently-revealed chain-memo node ids (read by memo chips). */
const RevealContext = createContext<Set<string>>(new Set());
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
/** Called once when a resize DRAG ends (pointer-up), so the new size can be persisted. */
const ScaleCommitContext = createContext<() => void>(() => {});
/** LOCAL rehearsal-spotlight layer (never the global controller). Keyed spotKey. */
interface PreviewSpotApi { state: (key: string) => "spot" | null; flamed: (key: string) => boolean; tone: (key: string) => SuperTone; onClick: (key: string, e: React.PointerEvent) => void }
const PreviewSpotContext = createContext<PreviewSpotApi>({ state: () => null, flamed: () => false, tone: () => "focus", onClick: () => {} });
/** FILM view (the popout mirror): true ⇒ nodes render CLEAN — no scale grips, no
 *  frame outline/label, no chain-number badges — just the composition the camera sees. */
const FilmContext = createContext(false);
/** Toggle a chain memo's DISPLAY flags from its preview node (hide choice label / hide
 *  arrow / vinyl-on-entry). Keyed by memoNodeId; writes back through the main store
 *  (undoable) via CeqStudio's onPatchChainItem. Noop when not authoring. */
const ChainToggleContext = createContext<(memoNodeId: string, patch: Partial<CeqChainItem>) => void>(() => {});
/** Drop a library memo onto a CEQ choice IN THE PREVIEWER (chains it). The dataTransfer
 *  mime must match CeqStudio's MEMO_DND — a memo node id. Same-window drag only. */
const MEMO_DND = "text/sa-studio-memo";
const AttachMemoContext = createContext<(choiceId: string, memoId: string) => void>(() => {});
/** VERTICAL OVERVIEW — click a stacked (non-active) question frame to make it active. */
const SelectQuestionContext = createContext<(qid: string) => void>(() => {});
/** RIGHT-CLICK a choice row → "Add memo to this choice" flow (category → text). */
const ChoiceMenuContext = createContext<(choiceId: string, e: React.MouseEvent) => void>(() => {});
/** QUESTION 0 (layout mode) — the placeholder card shown on the baseline stage. */
const LAYOUT_CARD = { prompt: "**LAYOUT** — the question card deals here", choices: [
  { id: "__l-a", text: "Answer choice A" }, { id: "__l-b", text: "Answer choice B" }, { id: "__l-c", text: "Answer choice C" },
  { id: "__l-d", text: "Answer choice D" }, { id: "__l-e", text: "Answer choice E" },
] };
/** In the film popout the resize grips are HOVER-ONLY (like the real canvas film
 *  mode) — invisible on camera, but there when Lee reaches in to nudge a card. */
const PV_CSS = `
.sa-pv-node .sa-grip-film { opacity: 0; pointer-events: none; transition: opacity 120ms ease; }
.sa-pv-node:hover .sa-grip-film { opacity: 1; pointer-events: auto; }
/* Modern transitions (Lee): a CEQ slides+fades in when the question changes (the
   card node remounts on ceqId change), and a chain memo POPS in when it's revealed
   in film — a touch more emphatic than a plain fade. */
@keyframes sa-ceq-in { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes sa-memo-pop { 0% { opacity: 0; transform: scale(0.84) translateY(9px); } 55% { opacity: 1; transform: scale(1.05) translateY(0); } 100% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .sa-ceq-in, .sa-memo-pop { animation: none !important; } }
/* SPOTLIGHT GUARDRAILS (Lee) — cap the FLAME super-scale inside the previewer so a
   flamed choice/memo can't blow outside the CEQ box / frame on a take (beats
   FLAME_CSS's scale(1.4) !important by specificity; origin stays left-center). */
.sa-ceq-choice[data-flame="on"] { transform: scale(1.08) !important; }
.sa-pv-node[data-flame="on"] { transform: scale(1.08) !important; }
`;
/** SPOTLIGHT GUARDRAIL — tame spotStyle's size bump so a spotlit choice/memo stays in
 *  the CEQ box / frame (spotStyle uses scale(1.2), which spilled a full-width choice
 *  ~100px past the card). The gold pill + glow carry the emphasis; the CEQ card also
 *  clips its content so the residual growth/glow can never leave the box on camera. */
function containSpot(state: "spot" | null): React.CSSProperties {
  const s = spotStyle(state);
  return state === "spot" ? { ...s, transform: "scale(1.06)" } : s;
}
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

const CARD_W = 560, CARD_H = 480;
export const dealCentre = (fw: number, fh: number) => ({ x: Math.max(0, Math.round((fw - CARD_W) / 2)), y: Math.max(0, Math.round((fh - CARD_H) / 2)) });
export const defaultMemoPos = (fw: number, fh: number, i: number) => { const c = dealCentre(fw, fh); return { x: Math.min(fw - 210, c.x + CARD_W + 70), y: Math.max(20, c.y + i * 160) }; };

type MainRf = Pick<ReactFlowInstance, "getNode" | "setNodes" | "setEdges">;
export type PreviewEdge = { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null };
const HANDLE: React.CSSProperties = { width: 9, height: 9, background: NEON.cyan, border: "1.5px solid #05070d" };

/** A corner grip that drives a node's data.scale (300 screen-px ≈ full range).
 *  `film` ⇒ hover-only (see PV_CSS) so it never shows on camera. Pointer events use
 *  the grip's OWN window (ev target) so the drag tracks in the popout too. */
function ScaleGrip({ id, scale, color, film }: { id: string; scale: number; color: string; film?: boolean }) {
  const setScale = useContext(ScaleContext);
  const commit = useContext(ScaleCommitContext);
  const start = useRef({ v: 0, s: 1 });
  const down = (e: React.PointerEvent) => {
    e.stopPropagation(); e.preventDefault();
    start.current = { v: e.clientX + e.clientY, s: scale };
    const win = (e.currentTarget as HTMLElement).ownerDocument?.defaultView ?? window;
    const move = (ev: PointerEvent) => setScale(id, clampScale(start.current.s + ((ev.clientX + ev.clientY) - start.current.v) / 300));
    const up = () => { win.removeEventListener("pointermove", move); win.removeEventListener("pointerup", up); commit(); };
    win.addEventListener("pointermove", move);
    win.addEventListener("pointerup", up);
  };
  return <div className={`nodrag${film ? " sa-grip-film" : ""}`} onPointerDown={down} title={`Scale ${Math.round(scale * 100)}% — drag to resize (text scales too)`} style={{ position: "absolute", right: -9, bottom: -9, width: 18, height: 18, borderRadius: 5, background: color, border: "2px solid #05070d", cursor: "nwse-resize", zIndex: 20 }} />;
}

/** The 16:9 frame — a visible guideline in the previewer; in the FILM mirror it
 *  becomes a clean stage (no outline/label — the camera sees only the cards). Both
 *  render the set's chosen visual WORLD (worlds.ts) behind the cards when set, so the
 *  frame reads as a real canvas frame; the world only animates under `.film-mode`. */
function FrameBgNode({ data }: NodeProps) {
  const film = useContext(FilmContext);
  const d = data as unknown as { w: number; h: number; world?: string; worldIntensity?: number; worldMotion?: number; qNum?: number };
  const world = d.world ? <WorldBackground worldId={d.world} intensity={d.worldIntensity} motion={d.worldMotion} /> : null;
  // FILM: clean stage + a soft cinematic EDGE GLOW (like the canvas film frame) —
  // a faint outer bloom into the letterbox + an inner vignette over the world. The
  // brand watermark lives in the popout wrapper ABOVE this, so it stays crisp.
  if (film) return (
    <div style={{ width: d.w, height: d.h, background: "#05070d", position: "relative", overflow: "hidden", pointerEvents: "none", boxShadow: "0 0 48px 8px rgba(96,140,230,0.16), 0 0 0 1px rgba(120,160,235,0.14)" }}>
      {world}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 90px 14px rgba(0,0,0,0.42)" }} />
    </div>
  );
  return (
    <div style={{ width: d.w, height: d.h, borderRadius: 12, border: `2px solid ${NEON.cyan}`, background: d.world ? "#05070d" : "rgba(8,14,26,0.5)", boxShadow: `0 0 0 1px rgba(79,163,227,0.25), inset 0 0 60px rgba(0,0,0,0.35)`, pointerEvents: "none", position: "relative", overflow: "hidden" }}>
      {world}
      <span style={{ position: "absolute", top: 8, left: 12, fontSize: 13, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(79,163,227,0.7)" }}>16:9 frame</span>
      {/* QUESTION NUMBER — authoring chrome: which question of the set this is (deck
          order, the same number the Studio rows and take filenames use). The film
          branch above returns early so it can never reach a take; data-frame-chrome
          is belt-and-braces if this ever mounts under a .film-mode root. */}
      {!!d.qNum && <span data-frame-chrome style={{ position: "absolute", top: 26, left: 12, fontSize: 92, fontWeight: 900, lineHeight: 1, letterSpacing: "-0.03em", color: "rgba(244,239,230,0.10)", pointerEvents: "none", userSelect: "none" }}>Q{d.qNum}</span>}
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
  const film = useContext(FilmContext);
  const attachMemo = useContext(AttachMemoContext);
  const choiceMenu = useContext(ChoiceMenuContext);
  const [dropChoice, setDropChoice] = useState<string | null>(null); // choice a memo is hovering (drag-to-chain)
  const d = data as unknown as { stem: string; choices: { id: string; text: string; correct?: boolean }[]; scale?: number; layoutBadge?: boolean };
  const s = d.scale ?? 1;
  return (
    <div className="sa-pv-node sa-ceq-in" style={{ position: "relative", width: CARD_W * s, borderRadius: 14 * s, background: PAPER.card, border: d.layoutBadge ? `2px dashed ${NEON.yellow}` : `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", animation: "sa-ceq-in 380ms cubic-bezier(0.2,0.7,0.3,1) both" }}>
      {/* QUESTION 0 ribbon — unmistakably the LAYOUT stage, never content. */}
      {d.layoutBadge && <span style={{ position: "absolute", top: -12, left: 12, borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0B0F1E", background: NEON.yellow, zIndex: 21 }}>Layout</span>}
      {/* CLIP — a spotlit choice's scale + glow stays INSIDE the CEQ box (never spills
          into the frame on a take). The ScaleGrip lives OUTSIDE this clip. */}
      <div style={{ overflow: "hidden", borderRadius: 13 * s, padding: 16 * s }}>
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
              className="sa-ceq-choice"
              data-flame={flamed ? "on" : undefined}
              data-flame-tone={flamed ? spot.tone(key) : undefined}
              onPointerDownCapture={(e) => spot.onClick(key, e)}
              onContextMenu={(e) => choiceMenu(c.id, e)}
              // DRAG-TO-CHAIN (Lee) — drop a library memo straight onto a choice here in
              // the previewer (same-window drag) to chain it, exactly like the Pane-2 rows.
              onDragOver={film ? undefined : (e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (dropChoice !== c.id) setDropChoice(c.id); } }}
              onDragLeave={film ? undefined : () => setDropChoice((p) => (p === c.id ? null : p))}
              onDrop={film ? undefined : (e) => { const mid = e.dataTransfer.getData(MEMO_DND); setDropChoice(null); if (mid) { e.preventDefault(); attachMemo(c.id, mid); } }}
              style={{ display: "flex", alignItems: "center", gap: 10 * s, borderRadius: 10 * s, border: `${1.5 * s}px solid ${dropChoice === c.id ? "#FCA311" : border}`, background: dropChoice === c.id ? "rgba(252,163,17,0.16)" : bg, padding: `${9 * s}px ${12 * s}px`, position: "relative", boxShadow: dropChoice === c.id ? `0 0 0 ${2 * s}px rgba(252,163,17,0.6)` : emph ? `0 0 0 ${2 * s}px rgba(184,134,11,0.7)` : undefined, filter: st === "wrong" ? "grayscale(0.3)" : undefined, ...containSpot(spState) }}
            >
              <span style={{ display: "grid", placeItems: "center", width: 28 * s, height: 28 * s, borderRadius: 8 * s, fontWeight: 900, fontSize: 15 * s, color: st ? "#fff" : chipC, background: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : "transparent", border: `${2 * s}px solid ${chipC}` }}>{LETTER(i)}</span>
              {/* TextAnchor drops the anc:<choiceId> handle ~7px past the choice TEXT
                  (exactly like the real dealt card), so the memo arrow lands AT the choice
                  — right after "Asset" — not at the card's far edge. It measures the text
                  end + re-reads on reflow via updateNodeInternals; the #185 loop was a
                  separate selEdgeIds bug (fixed), so this is safe again. */}
              <span style={{ fontSize: 18 * s, fontWeight: 600, color: PAPER.ink }}>
                <TextAnchor subId={c.id} nodeId={id} strike={st === "wrong"}>{c.text || ""}</TextAnchor>
              </span>
            </div>
          );
        })}
      </div>
      </div>
      <ScaleGrip id={id} scale={s} color={NEON.yellow} film={film} />
    </div>
  );
}

/** A chain memo chip; grayed until revealed by the practice walk. The arrow leaves
 *  its LEFT source ("l") — matching the real memo card — and a right target ("r")
 *  receives drops. Ctrl+click = rehearsal spotlight (local). Scales with data.scale. */
function MemoPreviewNode({ id, data }: NodeProps) {
  const revealed = useContext(RevealContext);
  const spot = useContext(PreviewSpotContext);
  const film = useContext(FilmContext);
  const chainToggle = useContext(ChainToggleContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string; scale?: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: string };
  const s = d.scale ?? 1;
  const vinyl = d.sound === "vinylScratch";
  const walked = revealed.has(id);
  const key = spotKey(id, "self");
  const spState = spot.state(key);
  const flamed = spot.flamed(key);
  return (
    <div
      className={`sa-pv-node${film && walked ? " sa-memo-pop" : ""}`}
      data-flame={flamed ? "on" : undefined}
      data-flame-tone={flamed ? spot.tone(key) : undefined}
      onPointerDownCapture={(e) => spot.onClick(key, e)}
      style={{ position: "relative", width: 210 * s, borderRadius: 12 * s, background: NEON.panelSolid, border: `${1.5 * s}px solid ${walked ? NEON.yellow : NEON.borderSoft}`, padding: `${10 * s}px ${12 * s}px`, opacity: walked ? 1 : film ? 0 : 0.4, filter: walked || film ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "grab", animation: film && walked ? "sa-memo-pop 340ms cubic-bezier(0.2,0.7,0.3,1)" : undefined, ...containSpot(spState) }}
    >
      {/* chain-order badge — useful IN the previewer, never on camera (hidden in film). */}
      {!film && <span style={{ position: "absolute", top: -11 * s, left: -11 * s, display: "grid", placeItems: "center", width: 24 * s, height: 24 * s, borderRadius: 999, fontSize: 12 * s, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>}
      {/* DISPLAY TOGGLES (Lee) — authoring-only, hover-only cluster on the memo:
          choice-caption toggle, arrow show/hide, and vinyl-on-entry. Never on camera. */}
      {!film && (
        <div className="sa-grip-film nodrag" style={{ position: "absolute", top: -9, right: -6, display: "flex", gap: 3, zIndex: 22 }}>
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { hideChoiceLabel: !d.hideChoiceLabel }); }} title={d.hideChoiceLabel ? `Show the "choice ${d.choice}" caption` : `Hide the "choice ${d.choice}" caption`} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 900, cursor: "pointer", color: d.hideChoiceLabel ? NEON.muted : "#0B0F1E", background: d.hideChoiceLabel ? "transparent" : NEON.yellow, border: `1px solid ${d.hideChoiceLabel ? NEON.borderSoft : NEON.yellow}` }}>{d.choice}</button>
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { hideArrow: !d.hideArrow }); }} title={d.hideArrow ? "Show the memo → choice arrow" : "Hide the memo → choice arrow"} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 900, cursor: "pointer", color: d.hideArrow ? NEON.muted : "#0B0F1E", background: d.hideArrow ? "transparent" : NEON.cyan, border: `1px solid ${d.hideArrow ? NEON.borderSoft : NEON.cyan}` }}>↜</button>
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { sound: vinyl ? undefined : "vinylScratch" }); }} title={vinyl ? "Vinyl scratch on entry (film) — click to remove" : "Play the vinyl scratch when this memo enters (film)"} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, cursor: "pointer", opacity: vinyl ? 1 : 0.5, background: vinyl ? "rgba(252,163,17,0.22)" : "transparent", border: `1px solid ${vinyl ? NEON.yellow : NEON.borderSoft}` }}>💿</button>
        </div>
      )}
      {!d.hideChoiceLabel && <div style={{ fontSize: 9 * s, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 3 * s }}>choice {d.choice}</div>}
      <div style={{ fontSize: 14 * s, color: NEON.text, lineHeight: 1.25 }}>{d.label}</div>
      <Handle id="l" type="source" position={Position.Left} style={HANDLE} />
      <Handle id="r" type="target" position={Position.Right} style={HANDLE} />
      <ScaleGrip id={id} scale={s} color={NEON.cyan} film={film} />
    </div>
  );
}

/** A NON-active question in the vertical overview — a static, clickable mini-CEQ (stem
 *  + choices, no practice/arrows). Click makes it the active question (smooth fit). */
function OverviewCeqNode({ data }: NodeProps) {
  const onSelect = useContext(SelectQuestionContext);
  const d = data as unknown as { qid: string; num: number; stem: string; choices: { id?: string; text: string }[] };
  return (
    <div onClick={() => onSelect(d.qid)} title="Click to open this question" style={{ cursor: "pointer", width: CARD_W, borderRadius: 14, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.5)", padding: 16, opacity: 0.9 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, fontWeight: 900, fontSize: 16, color: "#0B0F1E", background: NEON.yellow, flexShrink: 0 }}>{d.num}</span>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.2, color: PAPER.ink }}>{renderInline(d.stem || "Question")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {d.choices.map((c, i) => (
          <div key={c.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 10, border: `1.5px solid ${PAPER.line}`, padding: "9px 12px" }}>
            <span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 8, fontWeight: 900, fontSize: 15, color: PAPER.inkMuted, border: `2px solid ${PAPER.inkMuted}` }}>{LETTER(i)}</span>
            <span style={{ fontSize: 18, fontWeight: 600, color: PAPER.ink }}>{c.text || ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode, ovCeq: OverviewCeqNode };
const EMPTY_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

/** FILM ARROW FIX — TextAnchor registers each choice's `anc:<id>` target handle via
 *  useUpdateNodeInternals, which is SCOPED to its ReactFlowProvider. The film popout is
 *  a SECOND provider that mounts later, so its handle registration races and the memo
 *  arrow falls back to the node origin (top-left). Rendered INSIDE the film provider,
 *  this nudges RF to re-scan every node's handles on open + question change (a few
 *  settle passes), so the anc handles register and the arrow lands at the choice. */
function FilmInternalsNudge({ sig }: { sig: string }) {
  const upd = useUpdateNodeInternals();
  const filmNodes = useNodes();
  const idsRef = useRef<string[]>([]);
  idsRef.current = filmNodes.map((n) => n.id);
  useEffect(() => {
    const fire = () => idsRef.current.forEach((id) => upd(id));
    fire();
    const timers = [60, 180, 400, 800].map((ms) => window.setTimeout(fire, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [sig, upd]);
  return null;
}

function Inner({ ceqId, mainRf, mainSig, frameW, frameH, chainEdges, baseline, world, worldIntensity, worldMotion, deckCeqIds, layoutMode, onSaveBaseline, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onNextQuestion, onPrevQuestion }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  const ceq = mainRf.getNode(ceqId);
  // QUESTION 0 (layoutMode): the stage edits the SET BASELINE directly — a placeholder
  // LAYOUT card + "Slot N" placeholders stand in for a real question. Same nodes, same
  // grips, same auto-persist path; it IS the baseline, made visible.
  const cd = layoutMode ? (LAYOUT_CARD as unknown as CeqCard) : (ceq?.data as unknown as CeqCard | undefined);
  // Flat walk list: each chain memo with its choice index + position within the chain.
  const walk = useMemo(() => {
    const list: { memoNodeId: string; label: string; choice: string; choiceIdx: number; chainPos: number; num: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: string }[] = [];
    if (layoutMode) {
      // Question 0: one placeholder per baseline memo slot (add/remove via +/− slot).
      const n = baseline?.memoSlots?.length ?? 0;
      for (let i = 0; i < n; i++) list.push({ memoNodeId: `__slot${i}`, label: `Slot ${i + 1}`, choice: "—", choiceIdx: 0, chainPos: i, num: i + 1 });
      return list;
    }
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it, p) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), choiceIdx: ci, chainPos: p, num: list.length + 1, hideChoiceLabel: it.hideChoiceLabel, hideArrow: it.hideArrow, sound: it.sound })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig, layoutMode, baseline?.memoSlots?.length]);

  // ---- PRACTICE (local; never touches the real CEQ) ------------------------
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState<Map<number, number>>(new Map());
  // ---- REHEARSAL SPOTLIGHT (local; never touches the real global spotlight) --
  const [spots, setSpots] = useState<SpotSets>(EMPTY_SPOTS);
  const [selEdgeIds, setSelEdgeIds] = useState<Set<string>>(new Set());
  // VERTICAL OVERVIEW (Lee) — render every question as its own frame stacked vertically
  // so you can zoom out to see them all + click to navigate. The ACTIVE question keeps
  // the full live rig; the others are static clickable cards. Off ⇒ the focused single
  // frame (unchanged). Needs the deck's ordered ceq ids (deckCeqIds).
  const [overview, setOverview] = useState(false);
  const overviewOn = overview && !!deckCeqIds && deckCeqIds.length > 1;
  // COPY/PASTE STYLE (Lee) — marquee-select (Ctrl+drag) memos, right-click → copy their
  // STYLE (size + frame-local position + choice-label/arrow flags, NOT content), then
  // paste onto another selection. Generic node op (cards later). styleClip is ordered.
  const [selMemoIds, setSelMemoIds] = useState<Set<string>>(new Set());
  const [styleClip, setStyleClip] = useState<{ x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean }[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string; kind: "memo" | "pane" | "choice"; choiceId?: string; pos?: { x: number; y: number } } | null>(null);
  // RIGHT-CLICK ADD-MEMO flow: pick a category, then type the text inline.
  const [addCat, setAddCat] = useState<string | null>(null);
  // The active frame's vertical offset in the stack (0 outside overview). Node positions
  // carry it; the baseline is FRAME-LOCAL, so persistence subtracts it back off.
  const activeYOff = useMemo(() => (overviewOn && deckCeqIds ? Math.max(0, deckCeqIds.indexOf(ceqId)) * (frameH + Math.round(frameH * 0.16)) : 0), [overviewOn, deckCeqIds, ceqId, frameH]);
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
  // SHOW ARROWS (Lee) — force every memo revealed so the arrows render in their FILM-lit
  // state (solid memo + lit arrow, aligned at the choice), for checking alignment +
  // spotlighting them without walking. Off ⇒ the normal Enter-walk reveal.
  const [showAll, setShowAll] = useState(false);
  const revealedMemoIds = useMemo(() => { if (showAll || layoutMode) return new Set<string>(walk.map((w) => w.memoNodeId)); const set = new Set<string>(); for (const w of walk) if (resolved.has(w.choiceIdx) && w.chainPos < (shown.get(w.choiceIdx) ?? 0)) set.add(w.memoNodeId); return set; }, [walk, resolved, shown, showAll, layoutMode]);
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
  // SPOTLIGHT AN ARROW (Lee): Ctrl+Shift+click → super/flame (🔥, +Alt = 🚨); Ctrl OR
  // SHIFT click → toggle a spotlight on the arrow. Spotlit/flamed arrows ANIMATE (see
  // the edges memo). Used at Lee's discretion, like the card spotlight/super-spotlight.
  const onEdgeClick = useCallback((e: React.MouseEvent, edge: Edge) => {
    const key = spotKey(edge.id, "self");
    if (e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopPropagation(); setSpots((s) => applySuperClick(s, key, e.altKey ? "warn" : "focus")); return; }
    if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); e.stopPropagation(); setSpots((s) => (s.regular.has(key) || s.superKey === key ? EMPTY_SPOTS : applyRegularClick(s, key))); }
  }, []);

  // Seed EVERY question from the SET BASELINE (deck.layout) — NOT the drifting real
  // node positions — so Q1..Qn deal identically; the default (no saved layout) is the
  // centred card + right-stacked memos (dealCentre/defaultMemoPos), which matches the
  // seed spots. Memos key off the FLAT chain-slot index `i` (choice-major, chain-order).
  const build = useMemo(() => () => {
    if ((!layoutMode && !ceq) || !cd) return [];
    const cb = baseline?.card;
    // In OVERVIEW the active frame sits at its deck index in the vertical stack (gap =
    // 16% of a frame); otherwise at the origin. The active frame + CEQ + memos are
    // IDENTICAL to the single-frame render, just offset by yOff — so all the practice /
    // arrow / spotlight / film machinery is untouched.
    const GAP = Math.round(frameH * 0.16);
    const yOff = activeYOff;
    const dc = dealCentre(frameW, frameH);
    // qNum = this question's DECK position (what the Studio rows and take filenames
    // use). Q0/layout is not in deckCeqIds → 0 → the overlay doesn't render.
    const qNum = layoutMode ? 0 : Math.max(0, (deckCeqIds?.indexOf(ceqId) ?? -1) + 1);
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: yOff }, data: { w: frameW, h: frameH, world, worldIntensity, worldMotion, qNum }, draggable: false, selectable: false, zIndex: -10 };
    const ceqNode = { id: ceqId, type: "ceqPreview", position: cb ? { x: cb.x, y: yOff + cb.y } : { x: dc.x, y: yOff + dc.y }, data: { stem: cd.prompt, choices: cd.choices, scale: cb?.scale ?? 1, layoutBadge: layoutMode }, draggable: true, zIndex: 1 };
    // SPEEDIER MEMOS (Lee): a memo with no baseline slot of its own inherits the previous
    // memo's SIZE and column (x), stacked UNDERNEATH it with padding (not on top). First
    // memo with no layout falls to defaultMemoPos.
    let lastGeom: { x: number; y: number; scale: number } | null = null;
    const memoNodes = walk.map((w, i) => {
      const slot = baseline?.memoSlots?.[i];
      const geom = slot
        ? { x: slot.x, y: slot.y, scale: slot.scale ?? 1 }
        : lastGeom
          ? { x: lastGeom.x, y: lastGeom.y + Math.round(150 * lastGeom.scale), scale: lastGeom.scale }
          : { ...defaultMemoPos(frameW, frameH, i), scale: 1 };
      lastGeom = geom;
      return { id: w.memoNodeId, type: "memoPreview", position: { x: geom.x, y: yOff + geom.y }, data: { label: w.label, walkNum: w.num, choice: w.choice, scale: geom.scale, hideChoiceLabel: w.hideChoiceLabel, hideArrow: w.hideArrow, sound: w.sound }, draggable: true, zIndex: 5 };
    });
    const active = [frameNode, ceqNode, ...memoNodes];
    if (!overviewOn || !deckCeqIds) return active;
    // OVERVIEW — lightweight static frames for the OTHER questions (prefixed ids so a
    // memo shared across questions can't collide with the active render). No memos/
    // arrows — just the CEQ card, clickable to make it active.
    const others: unknown[] = [];
    deckCeqIds.forEach((qid, k) => {
      if (qid === ceqId) return;
      const y = k * (frameH + GAP);
      const od = mainRf.getNode(qid)?.data as unknown as CeqCard | undefined;
      others.push({ id: `ovf:${qid}`, type: "frameBg", position: { x: 0, y }, data: { w: frameW, h: frameH, world, worldIntensity, worldMotion, qNum: k + 1 }, draggable: false, selectable: false, zIndex: -10 });
      others.push({ id: `ov:${qid}`, type: "ovCeq", position: { x: dc.x, y: y + dc.y }, data: { qid, num: k + 1, stem: od?.prompt ?? "", choices: od?.choices ?? [] }, draggable: false, selectable: false, zIndex: 1 });
    });
    return [...active, ...others] as typeof active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH, baseline, world, worldIntensity, worldMotion, overviewOn, deckCeqIds, activeYOff, layoutMode, walk]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => { setNodes(build() as unknown as Node[]); }, [build, setNodes]);

  const fitRef = useRef<ReactFlowInstance | null>(null);
  // Fit to the ACTIVE frame; in overview that's the frame at its stack index, so a
  // question change SMOOTHLY glides the view to it. `fitAll` zooms out to every frame.
  const fitActive = useCallback((duration = 0) => fitRef.current?.fitView({ nodes: [{ id: "__frame__" }], padding: 0.14, duration }), []);
  const fitAll = useCallback(() => fitRef.current?.fitView({ padding: 0.08, duration: 420 }), []);
  useEffect(() => { const t = window.setTimeout(() => fitActive(overviewOn ? 420 : 0), 40); return () => window.clearTimeout(t); }, [ceqId, frameW, frameH, overviewOn, fitActive]);

  // FILM MODE (Lee) — a popout window on the 2nd monitor that MIRRORS this previewer
  // (same CEQ + memos + practice/spotlight state, since it's the same React tree), and
  // is now INTERACTIVE (drag/resize/spotlight two-way). The view stays fitted to the
  // 16:9 frame; refit ONLY on open / question change / frame-size / window resize —
  // NOT on `nodes` changes, else dragging a card in film would snap the view back.
  const [filmWin, setFilmWin] = useState<Window | null>(null);
  const filmFitRef = useRef<ReactFlowInstance | null>(null);
  const fitFilm = useCallback(() => filmFitRef.current?.fitView({ nodes: [{ id: "__frame__" }], padding: 0.012, duration: 0 }), []);
  useEffect(() => {
    if (!filmWin) return;
    // Double-fire (40ms + 240ms) so a maximize/resize that ANIMATES its layout still
    // lands filled; also refit when the film window regains focus (post-maximize).
    const refit = () => { window.setTimeout(fitFilm, 40); window.setTimeout(fitFilm, 240); };
    refit();
    filmWin.addEventListener("resize", refit);
    filmWin.addEventListener("focus", refit);
    return () => { filmWin.removeEventListener("resize", refit); filmWin.removeEventListener("focus", refit); };
  }, [filmWin, ceqId, frameW, frameH, fitFilm]);
  const toggleFilm = () => { if (filmWin) { try { filmWin.close(); } catch { /* ignore */ } setFilmWin(null); return; } const w = openPopoutWindow("ceqfilm", 1000, 600); if (w) setFilmWin(w); };

  // Drags (via onNodesChange) + grip resizes are TRANSIENT per-instance overrides —
  // they live ONLY in the local `nodes` state and DIE when build() re-seeds (question
  // switch / baseline change). We no longer write them back to the real canvas nodes;
  // the SET BASELINE is the single source of truth. Promote via "Set as layout" only.
  const setScale = (nodeId: string, scale: number) => setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
  /** SET AS LAYOUT — snapshot the current card + memo geometry as the set's baseline.
   *  Keys memos by flat chain-slot index. Two write modes:
   *  "replace" — the explicit Set-layout button (and Q0's stage, where the walk IS the
   *  full slot list): rebuild the slots wholesale from what's on stage.
   *  "merge" — auto-persist from drags/resizes: start from the EXISTING baseline and
   *  overwrite only the slots this question's chain actually shows, so sculpted extra
   *  slots survive and a chainless question can never truncate or wipe the baseline. */
  const saveBaseline = (writeMode: "replace" | "merge") => {
    const c = nodes.find((n) => n.id === ceqId);
    const memoSlots: DeckSlotLayout[] = writeMode === "merge" ? (baseline?.memoSlots ?? []).map((s) => ({ ...s })) : [];
    walk.forEach((w, i) => { const m = nodes.find((n) => n.id === w.memoNodeId); if (m) memoSlots[i] = { x: Math.round(m.position.x), y: Math.round(m.position.y - activeYOff), scale: (m.data as { scale?: number }).scale ?? 1 }; });
    onSaveBaseline?.({ card: c ? { x: Math.round(c.position.x), y: Math.round(c.position.y - activeYOff), scale: (c.data as { scale?: number }).scale ?? 1 } : undefined, memoSlots });
  };
  // AUTO-PERSIST (Lee) — a drag or resize commits the current geometry to the set
  // baseline so it STICKS across navigation (was transient → reverted on re-seed).
  // Always a MERGE: only the walked slots are overwritten (in QUESTION 0 the walk
  // covers every slot, so dragging the stage still edits the whole baseline).
  const commitGeom = () => { if (onSaveBaseline) saveBaseline("merge"); };
  /** QUESTION 0 — add/remove a baseline memo slot (snapshots live geometry so slots
   *  keep any unsaved drags, then appends below the last / pops the last). */
  const snapshotSlots = (): { card: DeckSlotLayout | undefined; memoSlots: DeckSlotLayout[] } => {
    const c = nodes.find((n) => n.id === ceqId);
    const memoSlots: DeckSlotLayout[] = [];
    walk.forEach((w, i) => { const m = nodes.find((n) => n.id === w.memoNodeId); if (m) memoSlots[i] = { x: Math.round(m.position.x), y: Math.round(m.position.y - activeYOff), scale: (m.data as { scale?: number }).scale ?? 1 }; });
    return { card: c ? { x: Math.round(c.position.x), y: Math.round(c.position.y - activeYOff), scale: (c.data as { scale?: number }).scale ?? 1 } : baseline?.card, memoSlots };
  };
  const addSlot = () => {
    const { card, memoSlots } = snapshotSlots();
    const last = memoSlots[memoSlots.length - 1];
    memoSlots.push(last ? { x: last.x, y: last.y + Math.round(150 * (last.scale ?? 1)), scale: last.scale } : { ...defaultMemoPos(frameW, frameH, 0), scale: 1 });
    onSaveBaseline?.({ card, memoSlots });
  };
  const removeSlot = () => {
    const { card, memoSlots } = snapshotSlots();
    if (memoSlots.length === 0) return;
    memoSlots.pop();
    onSaveBaseline?.({ card, memoSlots });
  };

  // COPY / PASTE STYLE — the acted-on memos = the marquee selection if it includes the
  // right-clicked memo, else just that memo. Ordered by flat chain index for a stable
  // arrangement. Style captured = frame-local {x,y,scale} + the choice-label/arrow flags.
  const styleTargets = (nodeId: string) => {
    const ids = selMemoIds.size > 0 && selMemoIds.has(nodeId) ? [...selMemoIds] : [nodeId];
    return ids.map((id) => ({ id, idx: walk.findIndex((w) => w.memoNodeId === id) })).filter((x) => x.idx >= 0).sort((a, b) => a.idx - b.idx);
  };
  const copyStyle = (nodeId: string) => {
    const styles = styleTargets(nodeId).map(({ id, idx }) => {
      const n = nodes.find((nn) => nn.id === id);
      const w = walk[idx];
      return { x: Math.round(n?.position.x ?? 0), y: Math.round((n?.position.y ?? 0) - activeYOff), scale: (n?.data as { scale?: number } | undefined)?.scale ?? 1, hideChoiceLabel: w?.hideChoiceLabel, hideArrow: w?.hideArrow };
    });
    setStyleClip(styles); setCtxMenu(null);
  };
  const pasteStyle = (nodeId: string) => {
    setCtxMenu(null);
    if (styleClip.length === 0 || !onSaveBaseline) return;
    const targets = styleTargets(nodeId);
    // Snapshot current geometry MERGED over the existing baseline (untouched memos and
    // sculpted extra slots keep their spots), then overwrite the paste targets.
    const memoSlots: DeckSlotLayout[] = (baseline?.memoSlots ?? []).map((s) => ({ ...s }));
    walk.forEach((w, i) => { const m = nodes.find((n) => n.id === w.memoNodeId); if (m) memoSlots[i] = { x: Math.round(m.position.x), y: Math.round(m.position.y - activeYOff), scale: (m.data as { scale?: number }).scale ?? 1 }; });
    const pos1to1 = styleClip.length === 1 && targets.length === 1; // exact 1↔1 copies location too
    targets.forEach(({ idx }, i) => {
      const s = styleClip.length === 1 ? styleClip[0] : styleClip[Math.min(i, styleClip.length - 1)];
      const cur = memoSlots[idx] ?? { x: 0, y: 0, scale: 1 };
      const copyPos = styleClip.length > 1 || pos1to1; // multi = replicate arrangement; single→many keeps positions
      memoSlots[idx] = copyPos ? { x: s.x, y: s.y, scale: s.scale } : { x: cur.x, y: cur.y, scale: s.scale };
    });
    const c = nodes.find((n) => n.id === ceqId);
    onSaveBaseline({ card: c ? { x: Math.round(c.position.x), y: Math.round(c.position.y - activeYOff), scale: (c.data as { scale?: number }).scale ?? 1 } : undefined, memoSlots });
    targets.forEach(({ id }, i) => { const s = styleClip.length === 1 ? styleClip[0] : styleClip[Math.min(i, styleClip.length - 1)]; onPatchChainItem?.(id, { hideChoiceLabel: s.hideChoiceLabel, hideArrow: s.hideArrow }); });
  };
  /** RIGHT-CLICK a choice row → the add-memo flow (category → inline text). Main
   *  window only (the fixed-position menu lives in the inline tree). */
  const onChoiceMenu = (choiceId: string, e: React.MouseEvent) => {
    if (!onAddMemoAtChoice || layoutMode) return;
    if ((e.target as HTMLElement).ownerDocument !== document) { e.preventDefault(); return; } // film popout: suppress, don't mis-place
    e.preventDefault(); e.stopPropagation();
    setAddCat(null);
    setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: "", kind: "choice", choiceId });
  };
  /** STYLE → ALL IN SET (Lee, bulk) — capture the acted-on memos' full style (frame-
   *  local geometry + caption/arrow/sound) keyed by flat slot index and hand it to the
   *  Studio, which applies it set-wide (single = size+settings to all; multi = 1→1, 2→2). */
  const copyStyleToSetAll = (nodeId: string) => {
    setCtxMenu(null);
    if (!onCopyStyleToSet) return;
    const styles = styleTargets(nodeId).map(({ id, idx }) => {
      const n = nodes.find((nn) => nn.id === id);
      const w = walk[idx];
      return { idx, x: Math.round(n?.position.x ?? 0), y: Math.round((n?.position.y ?? 0) - activeYOff), scale: (n?.data as { scale?: number } | undefined)?.scale ?? 1, hideChoiceLabel: w?.hideChoiceLabel, hideArrow: w?.hideArrow, sound: w?.sound as CeqChainItem["sound"] };
    });
    onCopyStyleToSet(styles);
  };

  const miniIds = useMemo(() => new Set<string>(["__frame__", ceqId, ...walk.map((w) => w.memoNodeId)]), [ceqId, walk]);
  // Memos whose arrow Lee has toggled OFF — the previewer shows them faint (so the
  // toggle is discoverable), the film mirror drops them entirely (see filmEdges).
  const hideArrowSources = useMemo(() => new Set(walk.filter((w) => w.hideArrow).map((w) => w.memoNodeId)), [walk]);
  const edges: Edge[] = useMemo(() => (chainEdges ?? [])
    .filter((e) => miniIds.has(e.source) && miniIds.has(e.target))
    .map((e) => {
      const revealed = revealedMemoIds.has(e.source) && (e.target === ceqId || revealedMemoIds.has(e.target));
      const sk = spotKey(e.id, "self");
      const flamedE = spots.superKey === sk;
      const spotE = spots.regular.has(sk) || flamedE;
      const selectedE = selEdgeIds.has(e.id);
      const hidden = hideArrowSources.has(e.source);
      const stroke = flamedE ? "#FCA311" : spotE ? "#FFD36A" : selectedE ? NEON.cyan : revealed ? "#E0284A" : "rgba(147,160,180,0.45)";
      const width = flamedE ? 4 : spotE || selectedE ? 3.5 : 2.5;
      const lit = revealed || spotE || selectedE;
      // Spotlit/flamed → RF's flowing-dash `animated` + a glow (Lee's "show animation
      // of it"). markerEnd sized up so the ← arrowhead reads at the choice.
      return { id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle ?? "l", targetHandle: e.targetHandle ?? undefined, type: "smoothstep", animated: spotE && !hidden, style: { stroke, strokeWidth: width, opacity: hidden ? 0.14 : lit ? 1 : 0.4, strokeDasharray: hidden ? "3 5" : spotE ? undefined : lit ? undefined : "5 4", filter: hidden ? undefined : flamedE ? "drop-shadow(0 0 6px rgba(252,163,17,0.95))" : spotE ? "drop-shadow(0 0 4px rgba(255,211,106,0.8))" : undefined }, markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 18, height: 18 } } as Edge;
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chainEdges, miniIds, revealedMemoIds, ceqId, spots, selEdgeIds, hideArrowSources]);
  // FILM edges — the mirror drops arrows toggled OFF entirely (clean take).
  const filmEdges = useMemo(() => edges.filter((e) => !hideArrowSources.has(e.source)), [edges, hideArrowSources]);
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

  // Practice KEYS (Tab/Enter/Space/`) — CAPTURE phase + stopImmediatePropagation so
  // the canvas keymap's own "space" show-key (bubble phase, registered earlier) never
  // steals Space. Ignored while typing in a field. Bound to BOTH windows so Lee can
  // drive from either screen: (a) the window that OWNS the inline preview DOM
  // (rootRef.ownerDocument — the main window inline, the Studio popout when popped),
  // gated on the hover-engage flag; and (b) the FILM popout window whenever it's open,
  // ALWAYS engaged (that window is dedicated to this preview — nothing else to type
  // there). Native key events fire on the focused window only and don't cross the
  // window boundary, so one listener can't cover both.
  const engagedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ownerWin = rootRef.current?.ownerDocument?.defaultView ?? window;
    const handle = (e: KeyboardEvent, win: Window, forceEngaged: boolean) => {
      if (!forceEngaged && !engagedRef.current) return;
      const el = (win.document.activeElement ?? document.activeElement) as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); tabNav(e.shiftKey ? -1 : 1); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; }
      if (e.key === " " || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) onPrevQuestion?.(); else onNextQuestion?.(); return; }
      if (e.key === "`" || e.code === "Backquote") { e.preventDefault(); e.stopImmediatePropagation(); resetPractice(); return; }
    };
    const onOwnerKey = (e: KeyboardEvent) => handle(e, ownerWin, false);
    ownerWin.addEventListener("keydown", onOwnerKey, true);
    let filmCleanup: (() => void) | undefined;
    if (filmWin && filmWin !== ownerWin) {
      const onFilmKey = (e: KeyboardEvent) => handle(e, filmWin, true);
      filmWin.addEventListener("keydown", onFilmKey, true);
      filmCleanup = () => filmWin.removeEventListener("keydown", onFilmKey, true);
    }
    return () => { ownerWin.removeEventListener("keydown", onOwnerKey, true); filmCleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emph, resolved, shown, cd, onNextQuestion, onPrevQuestion, filmWin]);

  if ((!layoutMode && !ceq) || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    <PracticeContext.Provider value={{ emph, resolved }}>
      <RevealContext.Provider value={revealedMemoIds}>
        <ScaleContext.Provider value={setScale}>
         <ScaleCommitContext.Provider value={commitGeom}>
          <PreviewSpotContext.Provider value={spotApi}>
           <ChainToggleContext.Provider value={onPatchChainItem ?? (() => {})}>
           <AttachMemoContext.Provider value={onAttachMemo ?? (() => {})}>
           <SelectQuestionContext.Provider value={onSelectQuestion ?? (() => {})}>
           <ChoiceMenuContext.Provider value={onChoiceMenu}>
            {/* FLAME/SIREN CSS injected locally so it works even when the Studio is
                popped out to a 2nd window (the global copy lives on the main canvas). */}
            <style>{FLAME_CSS}{PV_CSS}</style>
            <div ref={rootRef} className="flex h-full min-h-0 flex-col" onMouseEnter={() => { engagedRef.current = true; }} onMouseLeave={() => { engagedRef.current = false; }}>
              <div className="min-h-0 flex-1" style={{ background: "rgba(4,7,14,0.6)" }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onNodeDragStop={commitGeom}
                  onConnect={onConnect}
                  onEdgeClick={onEdgeClick}
                  onSelectionChange={({ nodes: sel, edges: selE }) => {
                    onSelectMemo?.((sel.find((n) => n.type === "memoPreview")?.id) ?? null);
                    // Track the marquee memo selection (for Copy/Paste style) — same
                    // compare-before-set discipline as the edges below.
                    const mids = sel.filter((n) => n.type === "memoPreview").map((n) => n.id);
                    setSelMemoIds((prev) => (prev.size === mids.length && mids.every((id) => prev.has(id)) ? prev : new Set(mids)));
                    // STABILIZE (fix #185): RF re-fires onSelectionChange every time the
                    // controlled `edges` prop is re-adopted; building a fresh Set here each
                    // time gave `selEdgeIds` a new reference → the `edges` memo (which reads
                    // it) recomputed → a new edges array → RF re-adopted → re-fired here …
                    // an infinite setEdges loop. Return the SAME Set when the selection is
                    // unchanged so React bails and the cycle can't start.
                    const ids = selE.map((e) => e.id);
                    setSelEdgeIds((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids)));
                  }}
                  onNodeContextMenu={(e, node) => { if (node.type === "memoPreview") { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, kind: "memo" }); } }}
                  onPaneContextMenu={(e) => { if (!hasItemsClip && !onAddMemoAt) return; e.preventDefault(); const me = e as React.MouseEvent; const fp = fitRef.current?.screenToFlowPosition({ x: me.clientX, y: me.clientY }); setAddCat(null); setCtxMenu({ x: me.clientX, y: me.clientY, nodeId: "", kind: "pane", pos: fp ? { x: Math.round(fp.x), y: Math.round(fp.y - activeYOff) } : undefined }); }}
                  onInit={(inst) => { fitRef.current = inst; }}
                  nodeTypes={nodeTypes}
                  fitView
                  fitViewOptions={{ padding: 0.14 }}
                  minZoom={0.04}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  connectionMode={ConnectionMode.Loose}
                  selectionKeyCode="Control"
                  nodesConnectable
                  elementsSelectable
                  deleteKeyCode={null}
                  zoomOnDoubleClick={false}
                  onlyRenderVisibleElements={overviewOn}
                >
                  <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(147,160,180,0.18)" />
                </ReactFlow>
              </div>
              {/* PRACTICE BAR — hover the preview, then Tab/Enter/Space/` (mouse-free).
                  Ctrl+click a choice/memo/arrow = spotlight · +Shift = 🔥 · +Alt+Shift = 🚨. */}
              <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)" }}>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: running ? "#FF8B9E" : "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggleRun} title={running ? "Pause timer" : "Start practice timer"}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={resetAll} title="Reset the CEQ to blank + clear spotlights + timer (`)"><RotateCcw className="h-3.5 w-3.5" /></button>
                <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: filmWin ? "#0B0F1E" : "#FF8B9E", background: filmWin ? "#FF8B9E" : "transparent", border: `1px solid ${filmWin ? "#FF8B9E" : "rgba(255,139,158,0.5)"}` }} onClick={toggleFilm} title={filmWin ? "Close the film window" : "FILM MODE — pops a clean 16:9 canvas frame (world background + watermark) onto your 2nd monitor. TWO-WAY: drag / resize / spotlight / Space-Tab-Enter work in EITHER window and stay in sync. Maximize it for OBS."}><Clapperboard className="h-3.5 w-3.5" /> {filmWin ? "Filming" : "Film"}</button>
                {onSaveBaseline && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={() => saveBaseline("replace")} title="Set as layout — save THIS card + memo arrangement as the set's baseline (same baseline Question 0 edits directly). Every question then deals/previews at this geometry."><LayoutGrid className="h-3.5 w-3.5" /> Set layout</button>}
                {layoutMode && onSaveBaseline && (<>
                  <span className="flex h-6 items-center rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#0B0F1E", background: NEON.yellow }}>Q0 · Layout</span>
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={addSlot} title="Add a memo slot to the baseline (lands below the last slot)"><Plus className="h-3 w-3" /> slot</button>
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} disabled={walk.length === 0} onClick={removeSlot} title="Remove the last memo slot from the baseline">− slot</button>
                </>)}
                {deckCeqIds && deckCeqIds.length > 1 && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: overview ? "#0B0F1E" : NEON.cyan, background: overview ? NEON.cyan : "transparent", border: `1px solid ${overview ? NEON.cyan : NEON.borderSoft}` }} onClick={() => setOverview((v) => !v)} title="Overview — stack every question as its own frame vertically. Zoom out (scroll) to see them all, drag to pan, click a question to glide to it. The active question stays fully live."><Rows3 className="h-3.5 w-3.5" /> {overview ? "Overview" : "Overview"}</button>}
                {overviewOn && <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={fitAll} title="Fit all questions in view (zoom out)"><Maximize2 className="h-3.5 w-3.5" /></button>}
                {onSetWorld && (
                  <select
                    className="h-6 rounded px-1 text-[9.5px] font-bold uppercase"
                    style={{ color: world ? NEON.yellow : NEON.muted, background: "transparent", border: `1px solid ${NEON.borderSoft}`, maxWidth: 118 }}
                    value={world ?? ""}
                    onChange={(e) => onSetWorld(e.target.value || undefined)}
                    title="Visual world — a per-set background (orbital grid, deep space, …) shown behind the CEQ in the previewer + film mode. Set once per set."
                  >
                    <option value="">No world</option>
                    {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
                <span className="flex items-center gap-1 tabular-nums text-[12px] font-bold" style={{ color: NEON.text }}><Timer className="h-3.5 w-3.5" style={{ color: NEON.cyan }} />{mmss(elapsed)}</span>
                {walk.length > 0 && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: showAll ? "#0B0F1E" : "#E0284A", background: showAll ? "#E0284A" : "transparent", border: `1px solid ${showAll ? "#E0284A" : "rgba(224,40,74,0.5)"}` }} onClick={() => setShowAll((v) => !v)} title="Show arrows — reveal every memo so the arrows render exactly as they will in film (aligned + lit). Ctrl/Shift-click an arrow to check its spotlight. Toggle off to Enter-walk normally."><Spline className="h-3.5 w-3.5" /> Arrows</button>}
                <span className="text-[9px] uppercase tracking-wide" style={{ color: NEON.muted }}>{showAll ? `${walk.length} shown` : `${revealedCount}/${walk.length} shown`}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onPrevQuestion?.()} title="Previous question (Shift+Space)"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} onClick={() => onNextQuestion?.()} title="Next question (Space)"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
            {/* COPY / PASTE STYLE context menu (right-click a memo). Marquee-select
                (Ctrl+drag) first to act on several at once. */}
            {ctxMenu && (
              <>
                <div className="fixed inset-0 z-[60]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
                <div className="fixed z-[61] flex flex-col gap-0.5 rounded-lg p-1 shadow-2xl" style={{ left: ctxMenu.x, top: ctxMenu.y, background: NEON.panelSolid, border: `1px solid ${NEON.border}`, minWidth: 172 }}>
                  {ctxMenu.kind === "memo" ? (
                    <>
                      <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>{selMemoIds.size > 1 && selMemoIds.has(ctxMenu.nodeId) ? `${selMemoIds.size} memos selected` : "memo"}</div>
                      <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => copyStyle(ctxMenu.nodeId)} title="Copy size + position + choice-label/arrow flags (not the memo text)">Copy style</button>
                      <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5 disabled:opacity-40" style={{ color: styleClip.length ? NEON.cyan : NEON.muted }} disabled={!styleClip.length} onClick={() => pasteStyle(ctxMenu.nodeId)} title="Apply the copied style to the selected memo(s)">Paste style{styleClip.length ? ` (${styleClip.length})` : ""}</button>
                      {onCopyStyleToSet && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.yellow }} onClick={() => copyStyleToSetAll(ctxMenu.nodeId)} title="Apply this memo's size + settings (caption/arrow/sound, copied exactly) to EVERY memo in the set. With several selected: slot-mapped — selection memo #1 styles every question's memo #1, 2→2, 3→3.">Style → all in set</button>}
                      {onCopyItems && <><div className="my-0.5 border-t" style={{ borderColor: NEON.borderSoft }} />
                      <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => { onCopyItems(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId]); setCtxMenu(null); }} title="Copy the actual memo(s) — paste into another question as new copies or shared references">Copy items</button></>}
                      {onSendToStarred && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5 disabled:opacity-40" style={{ color: starredCount ? "#FFD23F" : NEON.muted }} disabled={!starredCount} onClick={() => { onSendToStarred(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId]); setCtxMenu(null); }} title="Send NEW copies of the memo(s) to every ★ starred question in the set (same choice letters). Star questions first to build the target list.">Send to ★ starred{starredCount ? ` (${starredCount})` : ""}</button>}
                    </>
                  ) : ctxMenu.kind === "choice" ? (
                    <>
                      <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Add memo to this choice</div>
                      {addCat === null ? (
                        MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setAddCat(c)}>{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)
                      ) : (
                        <input autoFocus placeholder={`${addCat} memo… (Enter)`} className="nodrag m-1 rounded bg-black/40 px-1.5 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v && ctxMenu.choiceId) onAddMemoAtChoice?.(ctxMenu.choiceId, v, addCat); setCtxMenu(null); setAddCat(null); } else if (e.key === "Escape") { setAddCat(null); } }} />
                      )}
                    </>
                  ) : (
                    <>
                      {onAddMemoAt && ctxMenu.pos && (
                        <>
                          <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Add memo here (unchained)</div>
                          {addCat === null ? (
                            MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setAddCat(c)}>{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)
                          ) : (
                            <input autoFocus placeholder={`${addCat} memo… (Enter)`} className="nodrag m-1 rounded bg-black/40 px-1.5 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v && ctxMenu.pos) onAddMemoAt?.(ctxMenu.pos, v, addCat); setCtxMenu(null); setAddCat(null); } else if (e.key === "Escape") { setAddCat(null); } }} />
                          )}
                        </>
                      )}
                      {!!hasItemsClip && <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Paste into this question</div>}
                    </>
                  )}
                  {ctxMenu.kind !== "choice" && onPasteItems && !!hasItemsClip && <>
                    <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.cyan }} onClick={() => { onPasteItems("new"); setCtxMenu(null); }} title="Paste the copied memos as fresh, INDEPENDENT copies">Paste items ({hasItemsClip}) — new copies</button>
                    <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: "#FF8B9E" }} onClick={() => { onPasteItems("exact"); setCtxMenu(null); }} title="Paste as the SAME shared memos — editing them changes the originals too">Paste items — exact (shared ⚠)</button>
                  </>}
                </div>
              </>
            )}
            {/* FILM MODE popout — a clean 16:9 canvas frame on the 2nd monitor that is
                TWO-WAY with this previewer: it renders the SAME nodes/edges + Practice/
                Reveal/Spot state (one React tree ⇒ live mirror), and its ReactFlow is now
                INTERACTIVE — dragging / resizing / spotlighting / arrow-drawing here writes
                the same shared state the previewer reads, so edits flow both directions.
                Pan/zoom stay LOCKED to the fitted frame so OBS framing never drifts; the
                world background + brand watermark make it read like a real canvas frame.
                `film-mode` class lets the world gradient breathe (WorldBackground). */}
            {filmWin && (
              <PanelPopout win={filmWin} title="Film — CEQ" onReturn={() => setFilmWin(null)} chromeless>
                <FilmContext.Provider value={true}>
                  <style>{FLAME_CSS}{PV_CSS}</style>
                  <div className="film-mode" style={{ position: "relative", width: "100%", height: "100%" }}>
                    <ReactFlowProvider>
                      <ReactFlow
                        nodes={nodes}
                        edges={filmEdges}
                        onNodesChange={onNodesChange}
                        onNodeDragStop={commitGeom}
                        onConnect={onConnect}
                        onEdgeClick={onEdgeClick}
                        nodeTypes={nodeTypes}
                        onInit={(inst) => { filmFitRef.current = inst; window.setTimeout(fitFilm, 60); }}
                        minZoom={0.02}
                        maxZoom={4}
                        proOptions={{ hideAttribution: true }}
                        connectionMode={ConnectionMode.Loose}
                        onlyRenderVisibleElements={overviewOn}
                        nodesDraggable
                        nodesConnectable
                        elementsSelectable
                        deleteKeyCode={null}
                        panOnDrag={false}
                        zoomOnScroll={false}
                        zoomOnPinch={false}
                        zoomOnDoubleClick={false}
                        preventScrolling={false}
                        style={{ width: "100%", height: "100%", background: "#05070d" }}
                      />
                      <FilmInternalsNudge sig={`${ceqId}|${nodes.length}`} />
                    </ReactFlowProvider>
                    <BrandWatermark />
                  </div>
                </FilmContext.Provider>
              </PanelPopout>
            )}
           </ChoiceMenuContext.Provider>
           </SelectQuestionContext.Provider>
           </AttachMemoContext.Provider>
           </ChainToggleContext.Provider>
          </PreviewSpotContext.Provider>
         </ScaleCommitContext.Provider>
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
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Surface the REAL cause so Lee can report it (we don't fix it blind). Log the
    // error + React component stack under a clear prefix; the cause line below the
    // RETRY button shows the message inline so it's visible without the console.
    console.error("[CeqPreviewer] preview crashed (contained) — cause:", error, "\ncomponent stack:", info?.componentStack ?? "(none)");
  }
  componentDidUpdate(prev: { resetKey: string }) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (this.state.error) {
      const cause = (this.state.error.message || String(this.state.error)).split("\n")[0].slice(0, 200);
      return (
        <div className="grid h-full place-items-center p-3 text-center text-[11px]" style={{ color: NEON.muted }}>
          <div>
            <div style={{ color: "#FF8B9E", fontWeight: 700 }}>Preview hit an error.</div>
            <div className="mt-1">The rest of the Studio is fine — pick another question, or reopen the Studio.</div>
            <button className="mt-2 rounded px-2 py-0.5 text-[10px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={() => this.setState({ error: null })}>retry</button>
            {/* One-line cause (full error + component stack are in the console). */}
            <div className="mx-auto mt-2 max-w-[280px] break-words font-mono text-[9.5px] leading-snug" style={{ color: "#FFB3BE" }} title={cause}>Cause: {cause}</div>
            <div className="mt-0.5 text-[8.5px]" style={{ color: NEON.muted }}>Full details in the browser console.</div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], baseline, world, worldIntensity, worldMotion, deckCeqIds, layoutMode, onSaveBaseline, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onNextQuestion, onPrevQuestion }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <PreviewErrorBoundary resetKey={ceqId}>
      <ReactFlowProvider>
        <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} baseline={baseline} world={world} worldIntensity={worldIntensity} worldMotion={worldMotion} deckCeqIds={deckCeqIds} layoutMode={layoutMode} onSaveBaseline={onSaveBaseline} onSetWorld={onSetWorld} onPatchChainItem={onPatchChainItem} onAttachMemo={onAttachMemo} onSelectMemo={onSelectMemo} onSelectQuestion={onSelectQuestion} onCopyItems={onCopyItems} onPasteItems={onPasteItems} hasItemsClip={hasItemsClip} onSendToStarred={onSendToStarred} onCopyStyleToSet={onCopyStyleToSet} starredCount={starredCount} onAddMemoAtChoice={onAddMemoAtChoice} onAddMemoAt={onAddMemoAt} onNextQuestion={onNextQuestion} onPrevQuestion={onPrevQuestion} />
      </ReactFlowProvider>
    </PreviewErrorBoundary>
  );
}
