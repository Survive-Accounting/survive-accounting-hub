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
import { Background, BackgroundVariant, BaseEdge, ConnectionMode, getSmoothStepPath, Handle, MarkerType, Position, ReactFlow, ReactFlowProvider, useNodesState, useStore, ViewportPortal, type Connection, type Edge, type EdgeProps, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Clapperboard, ChevronLeft, ChevronRight, Grid3x3, LayoutGrid, Maximize2, Pause, Play, Plus, RotateCcw, Rows3, Save, Spline, Timer, X } from "lucide-react";

import { Bolt, BOLT_PRESETS, BOLT_RATIO, boltColorById, BRAND_DISPLAY } from "./brand";
import { frameCompositionGuides, SAFE_INSET_FRAC, type Guide } from "./frames";

import { BrandWatermark } from "./BrandBar";
import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { FLAME_CSS } from "./FilmOverlays";
import { openPopoutWindow, PanelPopout } from "./PanelPopout";
import { WorldBackground } from "./WorldBackground";
import { WORLDS } from "./worlds";
import { renderInline } from "./inline-md";
import { resolveCardSpot, resolveMemoSpot, withInstanceSpot } from "./ceq-geom";
import { memoAnchorId, TextAnchor } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { playSfx } from "./sfx";
import { spotStyle } from "./SpotlightContext";
import { applyRegularClick, applySuperClick, spotKey, type SpotSets, type SuperTone } from "./spotlight";
import { CHAINED_MARKER, NEON, PAPER } from "./theme";
import { clampScale, type CeqCard, type CeqChainItem, type CeqInstanceGeom, type DeckLayout, type DeckSlotLayout } from "./types";

/** Practice state read by the CEQ mock (emphasis + which choices are resolved). */
const PracticeContext = createContext<{ emph: number | null; resolved: Set<number> }>({ emph: null, resolved: new Set() });
/** The set of currently-revealed chain-memo node ids (read by memo chips). */
const RevealContext = createContext<Set<string>>(new Set());
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
/** Called once when a resize DRAG ends (pointer-up), so the new size can be persisted. */
const ScaleCommitContext = createContext<() => void>(() => {});
/** LOCAL rehearsal-spotlight layer (never the global controller). Keyed spotKey. */
interface PreviewSpotApi { state: (key: string) => "spot" | null; flamed: (key: string) => boolean; tone: (key: string) => SuperTone; onClick: (key: string, e: React.PointerEvent) => void; any: () => boolean }
const PreviewSpotContext = createContext<PreviewSpotApi>({ state: () => null, flamed: () => false, tone: () => "focus", onClick: () => {}, any: () => false });
/** FILM view (the popout mirror): true ⇒ nodes render CLEAN — no scale grips, no
 *  frame outline/label, no chain-number badges — just the composition the camera sees. */
const FilmContext = createContext(false);
/** Toggle a chain memo's DISPLAY flags from its preview node (hide choice label / hide
 *  arrow / vinyl-on-entry). Keyed by memoNodeId; writes back through the main store
 *  (undoable) via CeqStudio's onPatchChainItem. Noop when not authoring. */
const ChainToggleContext = createContext<(memoNodeId: string, patch: Partial<CeqChainItem>) => void>(() => {});
/** QUESTION 0 — switch a palette slot on/off from its number badge. Non-null ONLY on
 *  the layout stage, so a real question's memo chips keep their normal badge. */
const SlotToggleContext = createContext<((slotIdx: number) => void) | null>(null);
/** ON-MEMO chain reorder (authoring cluster) — move this memo earlier/later in its
 *  choice's chain; the walk renumbers live because the chain IS the order. */
const ChainReorderContext = createContext<((memoNodeId: string, dir: -1 | 1) => void) | null>(null);
/** EXCLUSIVE CHAIN VIEW (authoring) — which choice's chain is on stage, and the
 *  handler to switch it. null = none shown. Never provided in film: a performance
 *  reveals by Enter-walk and accumulates across choices. */
const ViewChoiceContext = createContext<{ view: number | null; set: (i: number) => void } | null>(null);
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
/* MOVE STRIPS (Lee) — the memo moves only by its top/bottom edge; a faint amber handle
   hints where to grab on hover (invisible at rest, so it never reads on camera). */
.sa-memo-move { border-radius: 4px; transition: background 120ms ease; }
.sa-pv-node:hover .sa-memo-move { background: rgba(252,163,17,0.12); }
.sa-memo-move:hover { background: rgba(252,163,17,0.3) !important; }
/* TEXT SELECTION inside a memo reads in the brand's amber instead of the OS blue. */
.sa-pv-node ::selection { background: rgba(252,163,17,0.9); color: #0B0F1E; }
.sa-pv-node ::-moz-selection { background: rgba(252,163,17,0.9); color: #0B0F1E; }
/* FREE-ARROW endpoint dots in film: faint (so they barely read on camera) but grabbable,
   and they pop to full on hover so Lee can aim the arrow mid-take. */
.sa-arrow-end-film { opacity: 0.14; transition: opacity 120ms ease; }
.sa-arrow-end-film:hover { opacity: 1; }
/* Modern transitions (Lee): a CEQ slides+fades in when the question changes (the
   card node remounts on ceqId change), and a chain memo POPS in when it's revealed
   in film — a touch more emphatic than a plain fade. */
@keyframes sa-ceq-in { from { opacity: 0; transform: translateY(12px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes sa-memo-pop { 0% { opacity: 0; transform: scale(0.84) translateY(9px); } 55% { opacity: 1; transform: scale(1.05) translateY(0); } 100% { opacity: 1; transform: scale(1); } }
/* Anchor the entrance to the element's TOP-LEFT — the node's authored position.
   With the default 50% 50% origin the keyframes' scale() pulls the card off its
   baseline anchor and it settles back, reading as "it animated from the wrong
   spot". Origin only: durations/easing above are untouched. (Non-!important, so
   the flame rule's own transform-origin !important still wins.) */
/* MEMO ARRIVES (Lee) — Enter-walk reveal (film only): the memo translates up + fades
   over 260ms rather than the old scale-overshoot POP. A 40ms delay lets the choice
   arrow (which lights immediately) read a beat AHEAD, so the arrow leads and the memo
   settles into it. GPU-only (transform/opacity); will-change released on animationend. */
@keyframes sa-memo-in { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
.sa-memo-in { animation: sa-memo-in 260ms cubic-bezier(0.2,0.7,0.3,1) 40ms both; will-change: transform, opacity; }
/* CORRECT SETTLE (Lee) — a small scale-pulse on the right answer at resolve, timed to
   land with the chaching (both fire on the same Enter). A settle, not a bounce. */
@keyframes sa-ceq-correct { 0% { transform: scale(1); } 45% { transform: scale(1.035); } 100% { transform: scale(1); } }
.sa-ceq-correct { animation: sa-ceq-correct 300ms cubic-bezier(0.2,0.7,0.3,1) both; will-change: transform; }
/* WRONG STRIKE (Lee) — the line-through DRAWS left-to-right over 200ms instead of
   snapping in. Base is scaleX(1) so a surface WITHOUT these keyframes (the canvas card)
   still shows a full strike; where the keyframes exist it animates. */
@keyframes sa-strike { from { transform: translateY(-50%) scaleX(0); } to { transform: translateY(-50%) scaleX(1); } }
.sa-strike-draw { animation: sa-strike 200ms cubic-bezier(0.4,0,0.2,1) both; }
.sa-ceq-in, .sa-memo-pop, .sa-memo-in { transform-origin: 0 0; }
/* On-memo cluster: slight grow on hover (legibility), authoring-only by gating. */
.sa-memo-cluster { transition: transform 120ms; }
.sa-memo-cluster:hover { scale: 1.15; }
/* Selection ring in film: present but quiet — the shot shows intent, not UI. */
.film-mode .sa-msel { outline: none; }
@media (prefers-reduced-motion: reduce) { .sa-ceq-in, .sa-memo-pop, .sa-memo-in, .sa-ceq-correct, .sa-strike-draw { animation: none !important; } }
/* SPOTLIGHT GUARDRAILS (Lee) — cap the FLAME super-scale inside the previewer so a
   flamed choice/memo can't blow outside the CEQ box / frame on a take (beats
   FLAME_CSS's scale(1.4) !important by specificity; origin stays left-center). */
.sa-ceq-choice[data-flame="on"] { transform: scale(1.08) !important; }
.sa-pv-node[data-flame="on"] { transform: scale(1.08) !important; }
/* MEMO ARROWS (Lee) — a spotlit arrow's dash flows choice→memo (left→right), like a
   reading eye; loops so re-reading feels natural. The path is drawn choice→memo, so a
   NEGATIVE stroke-dashoffset advances the dashes in that (reading) direction. */
@keyframes sa-arrow-read { to { stroke-dashoffset: -19; } }
/* READING SPOTLIGHT (Lee) — a soft highlight sweeps left→right across a spotlit
   choice/memo, so emphasis mimics reading. ::after is inset (no glow clipping). */
.sa-spot-read::after { content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 2;
  background-image: linear-gradient(100deg, transparent 34%, rgba(255,255,255,0.34) 50%, transparent 66%);
  background-size: 230% 100%; background-repeat: no-repeat; animation: sa-read-sweep 1.7s ease-in-out infinite; }
@keyframes sa-read-sweep { from { background-position: 130% 0; } to { background-position: -30% 0; } }
@media (prefers-reduced-motion: reduce) { .sa-spot-read::after { animation: none; opacity: 0; } }
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
export const defaultMemoPos = (fw: number, fh: number, i: number) => paletteSlots(fw, fh)[Math.min(i, PALETTE_N - 1)];

/** THE SLOT PALETTE (Lee) — a set's baseline is a fixed rack of {@link PALETTE_N}
 *  slots running down the RIGHT side of the frame, evenly spaced and guaranteed not
 *  to overlap (the step is never smaller than a slot's own height). Generated, never
 *  hand-placed, so two slots can't be born at the same coordinate. Lee then drags
 *  any slot where he wants it and resizes it — a bigger slot is simply one that fits
 *  bigger content. */
export const PALETTE_N = 5;
const SLOT_H = 150; // nominal chip height at scale 1 — the minimum clear gap between slots
export const paletteSlots = (fw: number, fh: number, n: number = PALETTE_N): { x: number; y: number; scale: number }[] => {
  const c = dealCentre(fw, fh);
  const x = Math.min(fw - 210, c.x + CARD_W + 70);
  const top = 20;
  const span = Math.max(SLOT_H, fh - top - 20 - SLOT_H); // room the rack can use
  const step = n > 1 ? Math.max(SLOT_H + 12, Math.round(span / (n - 1))) : 0;
  return Array.from({ length: n }, (_, i) => ({ x, y: top + i * step, scale: 1 }));
};
/** The set's slot rack: whatever is saved, padded out to the full palette with
 *  INACTIVE generated slots. Saved slots keep their geometry and their on/off state;
 *  layouts predating the palette have no `off` flag, so all of their slots stay
 *  active and nothing moves. */
export const rackOf = (saved: DeckSlotLayout[] | undefined, fw: number, fh: number): DeckSlotLayout[] => {
  const gen = paletteSlots(fw, fh);
  return gen.map((g, i) => saved?.[i] ?? { ...g, off: true }).concat((saved ?? []).slice(PALETTE_N));
};
/** Only ACTIVE slots take placements, in order. */
export const activeSlots = (rack: DeckSlotLayout[]): DeckSlotLayout[] => rack.filter((s) => !s.off);

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
/** COMPOSITION GUIDES (authoring only) — rule-of-thirds grid + broadcast safe
 *  zones drawn in FRAME-LOCAL space, so they scale with the frame and sit behind
 *  the cards. Same zone fractions as the canvas SafeGuidesOverlay so the two
 *  surfaces agree. Never rendered in film. */
function GuidesOverlay({ w, h }: { w: number; h: number }) {
  const lf = Math.max(9, Math.round(h * 0.028)); // label size, proportional to the frame
  const rule = (o: React.CSSProperties) => <div className="absolute" style={{ background: "rgba(126,243,192,0.20)", ...o }} />;
  const box = (x: number, y: number, bw: number, bh: number, color: string, label: string) => (
    <div className="absolute" style={{ left: x, top: y, width: bw, height: bh, border: `${Math.max(1, Math.round(h * 0.0025))}px dashed ${color}`, borderRadius: Math.round(h * 0.01) }}>
      <span className="absolute font-bold uppercase" style={{ left: 3, top: 2, fontSize: lf, letterSpacing: "0.06em", color }}>{label}</span>
    </div>
  );
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 2 }}>
      {/* rule of thirds */}
      {rule({ left: w / 3, top: 0, width: 1, height: h })}
      {rule({ left: (2 * w) / 3, top: 0, width: 1, height: h })}
      {rule({ left: 0, top: h / 3, width: w, height: 1 })}
      {rule({ left: 0, top: (2 * h) / 3, width: w, height: 1 })}
      {box(w * SAFE_INSET_FRAC, h * SAFE_INSET_FRAC, w * (1 - 2 * SAFE_INSET_FRAC), h * (1 - 2 * SAFE_INSET_FRAC), "rgba(126,243,192,0.5)", "title-safe")}
      {box(w * 0.72, h * 0.7, w * 0.26, h * 0.28, "rgba(140,192,238,0.6)", "camera")}
      {box(w * 0.78, h * 0.03, w * 0.2, h * 0.12, "rgba(245,212,143,0.55)", "watermark")}
      {box(w * 0.62, h * 0.12, w * 0.34, h * 0.76, "rgba(255,139,158,0.42)", "end-screen")}
    </div>
  );
}

function FrameBgNode({ data }: NodeProps) {
  const film = useContext(FilmContext);
  const d = data as unknown as { w: number; h: number; world?: string; worldIntensity?: number; worldMotion?: number; qNum?: number; guides?: boolean };
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
      {d.guides && <GuidesOverlay w={d.w} h={d.h} />}
    </div>
  );
}

/** Lightweight mock of the CEQ card — BLANK until practiced (emphasis ring, then
 *  green/strike on resolve). Each choice carries the SAME right-side text-end memo
 *  anchor the real card uses (TextAnchor → `anc:<choiceId>`). Scales with data.scale.
 *  Ctrl+click a choice = rehearsal spotlight (local). */
function CeqPreviewNode({ id, data }: NodeProps) {
  const pr = useContext(PracticeContext);
  const vc = useContext(ViewChoiceContext);
  const viewChoice = vc?.view ?? null;
  const onViewChoice = vc?.set;
  const spot = useContext(PreviewSpotContext);
  const film = useContext(FilmContext);
  const attachMemo = useContext(AttachMemoContext);
  const choiceMenu = useContext(ChoiceMenuContext);
  const [dropChoice, setDropChoice] = useState<string | null>(null); // choice a memo is hovering (drag-to-chain)
  const d = data as unknown as { stem: string; choices: { id: string; text: string; correct?: boolean; chain?: unknown[] }[]; scale?: number; layoutBadge?: boolean; brandBolt?: false | string; progress?: { x: number; y: number } | null; topic?: string | null };
  const s = d.scale ?? 1;
  // BRANDING — the bolt sits top-left of the CEQ box, filmed with the card. Floated
  // so the stem wraps around it. `brandBolt` false hides it; a string picks a colour
  // (preset/SEC id); default = house red/blue. Not on the Q0 layout stage.
  const boltCol = d.brandBolt === false ? null : d.layoutBadge ? null : typeof d.brandBolt === "string" ? boltColorById(d.brandBolt) : BOLT_PRESETS[0];
  return (
    <div className="sa-pv-node sa-ceq-in" onAnimationEnd={(ev) => { if (ev.animationName === "sa-ceq-in") (ev.currentTarget as HTMLElement).style.willChange = "auto"; }} style={{ position: "relative", width: CARD_W * s, borderRadius: 14 * s, background: PAPER.card, border: d.layoutBadge && !film ? `2px dashed ${NEON.yellow}` : `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", willChange: "transform, opacity", animation: "sa-ceq-in 300ms cubic-bezier(0.2,0.7,0.3,1) both" }}>
      {/* QUESTION 0 ribbon — unmistakably the LAYOUT stage, never content. */}
      {d.layoutBadge && !film && <span style={{ position: "absolute", top: -12, left: 12, borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0B0F1E", background: NEON.yellow, zIndex: 21 }}>Layout</span>}
      {/* STUDENT PROGRESS — "X of Y" top-right + a slim fill bar along the top edge;
          filmed with the card. Momentum cue: "you're 3 of 22, keep going". */}
      {d.progress && (<>
        <div style={{ position: "absolute", top: 0, left: 0, height: 4 * s, width: `${Math.round((d.progress.x / d.progress.y) * 100)}%`, background: `linear-gradient(90deg, ${PAPER.green}, #3BF5A0)`, borderTopLeftRadius: 14 * s, borderBottomRightRadius: 3 * s, zIndex: 8 }} />
        <span style={{ position: "absolute", top: 12 * s, right: 14 * s, fontSize: 15 * s, fontWeight: 800, letterSpacing: "0.02em", color: PAPER.inkMuted, zIndex: 8 }}>{d.progress.x} <span style={{ opacity: 0.6 }}>of</span> {d.progress.y}</span>
      </>)}
      {/* CLIP — a spotlit choice's scale + glow stays INSIDE the CEQ box (never spills
          into the frame on a take). The ScaleGrip lives OUTSIDE this clip. */}
      <div style={{ overflow: "hidden", borderRadius: 13 * s, padding: 16 * s }}>
      {/* TOPIC kicker — name only (no Ch#), small uppercase above the stem so a
          viewer landing mid-clip knows the topic. */}
      {d.topic && <div style={{ fontSize: 12 * s, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: PAPER.inkMuted, marginBottom: 6 * s, maxWidth: "58%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.topic}</div>}
      <div style={{ fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 * s }}>
        {boltCol && <span style={{ float: "left", height: 42 * s, width: 42 * s * BOLT_RATIO, marginRight: 12 * s, marginTop: 2 * s }}><Bolt c1={boltCol.c1} c2={boltCol.c2} keyline={PAPER.card} /></span>}
        {renderInline(d.stem || "Question")}
      </div>
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
              className={`sa-ceq-choice${st === "right" ? " sa-ceq-correct" : ""}`}
              onAnimationEnd={(ev) => { if (ev.animationName === "sa-ceq-correct") (ev.currentTarget as HTMLElement).style.willChange = "auto"; }}
              data-flame={flamed ? "on" : undefined}
              data-flame-tone={flamed ? spot.tone(key) : undefined}
              onPointerDownCapture={(e) => spot.onClick(key, e)}
              onClick={film ? undefined : (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; onViewChoice?.(i); }}
              onContextMenu={(e) => choiceMenu(c.id, e)}
              // DRAG-TO-CHAIN (Lee) — drop a library memo straight onto a choice here in
              // the previewer (same-window drag) to chain it, exactly like the Pane-2 rows.
              onDragOver={film ? undefined : (e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; if (dropChoice !== c.id) setDropChoice(c.id); } }}
              onDragLeave={film ? undefined : () => setDropChoice((p) => (p === c.id ? null : p))}
              onDrop={film ? undefined : (e) => { const mid = e.dataTransfer.getData(MEMO_DND); setDropChoice(null); if (mid) { e.preventDefault(); attachMemo(c.id, mid); } }}
              style={{ display: "flex", alignItems: "center", gap: 10 * s, borderRadius: 10 * s, border: `${1.5 * s}px solid ${!film && viewChoice === i ? NEON.cyan : dropChoice === c.id ? "#FCA311" : border}`, outline: !film && viewChoice === i ? `${2 * s}px solid rgba(79,163,227,0.35)` : undefined, outlineOffset: 2, background: dropChoice === c.id ? "rgba(252,163,17,0.16)" : bg, padding: `${9 * s}px ${12 * s}px`, position: "relative", boxShadow: dropChoice === c.id ? `0 0 0 ${2 * s}px rgba(252,163,17,0.6)` : emph ? `0 0 0 ${2 * s}px rgba(184,134,11,0.7)` : undefined, filter: st === "wrong" ? "grayscale(0.3)" : undefined, opacity: spot.any() && !spState ? 0.55 : undefined, ...containSpot(spState) }}
            >
              <span title={(c.chain?.length ?? 0) > 0 ? `${c.chain!.length} explanation memo(s) behind this choice` : undefined} style={{ display: "grid", placeItems: "center", width: 28 * s, height: 28 * s, borderRadius: 8 * s, fontWeight: 900, fontSize: 15 * s, color: st ? "#fff" : chipC, background: st === "right" ? PAPER.green : st === "wrong" ? PAPER.red : "transparent", border: `${2 * s}px solid ${chipC}`, ...((c.chain?.length ?? 0) > 0 ? { boxShadow: film ? CHAINED_MARKER.ringFilm : CHAINED_MARKER.ring } : {}) }}>{LETTER(i)}</span>
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
      {!film && <ScaleGrip id={id} scale={s} color={NEON.yellow} film={film} />}
    </div>
  );
}

/** A chain memo chip; grayed until revealed by the practice walk. The arrow leaves
 *  its LEFT source ("l") — matching the real memo card — and a right target ("r")
 *  receives drops. Ctrl+click = rehearsal spotlight (local). Scales with data.scale. */
function MemoPreviewNode({ id, data, selected }: NodeProps) {
  const revealed = useContext(RevealContext);
  const spot = useContext(PreviewSpotContext);
  const film = useContext(FilmContext);
  const chainToggle = useContext(ChainToggleContext);
  const chainReorder = useContext(ChainReorderContext);
  // INVERSE ZOOM — the icon cluster stays a constant readable size at any zoom.
  const pvZoom = useStore((st) => (st as unknown as { transform: [number, number, number] }).transform[2]) || 1;
  const slotToggle = useContext(SlotToggleContext);
  const d = data as unknown as { label: string; walkNum: number; choice: string; scale?: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: string; slotOff?: boolean };
  const s = d.scale ?? 1;
  // QUESTION 0 only: an INACTIVE palette slot. It stays on the stage (so it can be
  // switched on and positioned) but reads as dashed + faded, and it never takes a
  // memo in a real question.
  const slotOff = !!d.slotOff;
  const vinyl = d.sound === "vinylScratch";
  const walked = revealed.has(id);
  const key = spotKey(id, "self");
  const spState = spot.state(key);
  const flamed = spot.flamed(key);
  return (
    <div
      className={`sa-pv-node${film && walked ? " sa-memo-in" : ""}${selected ? " sa-msel" : ""}`}
      onAnimationEnd={(ev) => { if (ev.animationName === "sa-memo-in") (ev.currentTarget as HTMLElement).style.willChange = "auto"; }}
      data-flame={flamed ? "on" : undefined}
      data-flame-tone={flamed ? spot.tone(key) : undefined}
      onPointerDownCapture={(e) => spot.onClick(key, e)}
      // SPOTLIT MEMO POPS IN ITS OWN NAVY (Lee) — spotStyle paints a spotlit target with
      // var(--spot-bg): a choice inherits the card's PAPER so it pops in the card material,
      // but a memo isn't inside a card, so it fell back to a translucent gold wash and read
      // see-through over the CEQ card. Give the memo its own lifted navy here so a spotlit
      // memo stays OPAQUE and pops out above the paper card (gold rail + glow + lift do the rest).
      style={{ ["--spot-bg" as string]: "#1B2B49", boxShadow: selected ? (film ? "0 0 0 1.5px rgba(79,163,227,0.35)" : "0 0 0 2px rgba(79,163,227,0.8)") : undefined, position: "relative", width: 210 * s, borderRadius: 12 * s, background: slotOff ? "transparent" : NEON.panelSolid, border: `${1.5 * s}px ${slotOff ? "dashed" : "solid"} ${slotOff ? NEON.borderSoft : walked ? NEON.yellow : NEON.borderSoft}`, opacity: (slotOff ? 0.3 : walked ? 1 : film ? 0 : 0.4) * (spot.any() && !spState ? 0.5 : 1), filter: slotOff || walked || film ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "default", ...containSpot(spState) }}
    >
      {/* chain-order badge — useful IN the previewer, never on camera (hidden in film). */}
      {!film && (slotToggle ? (
        <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); slotToggle(d.walkNum - 1); }}
          title={slotOff ? `Slot ${d.walkNum} is OFF — click to switch it on (memos will fill it in order)` : `Slot ${d.walkNum} is ON — click to switch it off (no memo will use it)`}
          style={{ position: "absolute", top: -11 * s, left: -11 * s, display: "grid", placeItems: "center", width: 24 * s, height: 24 * s, borderRadius: 999, fontSize: 12 * s, fontWeight: 900, cursor: "pointer", color: slotOff ? NEON.muted : "#0B0F1E", background: slotOff ? "transparent" : NEON.yellow, border: `${1.5 * s}px ${slotOff ? "dashed" : "solid"} ${slotOff ? NEON.borderSoft : NEON.yellow}` }}>{d.walkNum}</button>
      ) : (
        <span style={{ position: "absolute", top: -11 * s, left: -11 * s, display: "grid", placeItems: "center", width: 24 * s, height: 24 * s, borderRadius: 999, fontSize: 12 * s, fontWeight: 900, color: "#0B0F1E", background: walked ? NEON.yellow : NEON.muted }}>{d.walkNum}</span>
      ))}
      {/* DISPLAY TOGGLES (Lee) — authoring-only, hover-only cluster on the memo:
          choice-caption toggle, arrow show/hide, and vinyl-on-entry. Never on camera. */}
      {!film && !slotToggle && (
        <div className="sa-grip-film sa-memo-cluster nodrag" style={{ position: "absolute", top: -9, right: -6, display: "flex", gap: 3, zIndex: 22, transform: `scale(${Math.max(1, 1 / pvZoom)})`, transformOrigin: "top right" }}>
          {chainReorder && <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainReorder(id, -1); }} title="Earlier in the walk (renumbers live)" style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 900, cursor: "pointer", color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>↑</button>}
          {chainReorder && <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainReorder(id, 1); }} title="Later in the walk (renumbers live)" style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 900, cursor: "pointer", color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }}>↓</button>}
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { hideChoiceLabel: !d.hideChoiceLabel }); }} title={d.hideChoiceLabel ? `Show the "choice ${d.choice}" caption` : `Hide the "choice ${d.choice}" caption`} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, fontWeight: 900, cursor: "pointer", color: d.hideChoiceLabel ? NEON.muted : "#0B0F1E", background: d.hideChoiceLabel ? "transparent" : NEON.yellow, border: `1px solid ${d.hideChoiceLabel ? NEON.borderSoft : NEON.yellow}` }}>{d.choice}</button>
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { hideArrow: !d.hideArrow }); }} title={d.hideArrow ? "Show the memo → choice arrow" : "Hide the memo → choice arrow"} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 11, fontWeight: 900, cursor: "pointer", color: d.hideArrow ? NEON.muted : "#0B0F1E", background: d.hideArrow ? "transparent" : NEON.cyan, border: `1px solid ${d.hideArrow ? NEON.borderSoft : NEON.cyan}` }}>↜</button>
          <button className="nodrag" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); chainToggle(id, { sound: vinyl ? undefined : "vinylScratch" }); }} title={vinyl ? "Vinyl scratch on entry (film) — click to remove" : "Play the vinyl scratch when this memo enters (film)"} style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: 5, fontSize: 10, cursor: "pointer", opacity: vinyl ? 1 : 0.5, background: vinyl ? "rgba(252,163,17,0.22)" : "transparent", border: `1px solid ${vinyl ? NEON.yellow : NEON.borderSoft}` }}>💿</button>
        </div>
      )}
      {/* MOVE STRIPS (Lee) — the memo now moves ONLY by grabbing its top or bottom edge.
          The body below is `nodrag` + text-selectable, so a click-drag in the text SELECTS
          it instead of dragging the node; corners still resize via the ScaleGrip. */}
      <div className="sa-memo-move" title="Drag to move" style={{ position: "absolute", top: 0, left: 12, right: 12, height: 11 * s, cursor: "move", zIndex: 4 }} />
      <div className="sa-memo-move" title="Drag to move" style={{ position: "absolute", bottom: 0, left: 12, right: 20, height: 11 * s, cursor: "move", zIndex: 4 }} />
      {/* CONTENT — nodrag + selectable (branded orange ::selection via PV_CSS). */}
      <div className="nodrag" style={{ padding: `${10 * s}px ${12 * s}px`, userSelect: "text", WebkitUserSelect: "text", cursor: "text", position: "relative", zIndex: 1 }}>
        {!d.hideChoiceLabel && <div style={{ fontFamily: BRAND_DISPLAY, fontSize: 9 * s, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: NEON.muted, marginBottom: 3 * s }}>choice {d.choice}</div>}
        <div style={{ fontFamily: BRAND_DISPLAY, fontWeight: 500, fontSize: 14 * s, color: NEON.text, lineHeight: 1.28 }}>{d.label}</div>
      </div>
      <Handle id="l" type="source" position={Position.Left} style={HANDLE} />
      <Handle id="r" type="target" position={Position.Right} style={HANDLE} />
      {/* RESIZE — grip now shows in film too (hover-only via sa-grip-film, so it's
          invisible on camera but there when Lee reaches in to resize a memo). */}
      <ScaleGrip id={id} scale={s} color={NEON.cyan} film={film} />
    </div>
  );
}

/** A NON-active question in the vertical overview — a static, clickable mini-CEQ (stem
 *  + choices, no practice/arrows). Click makes it the active question (smooth fit). */
function OverviewCeqNode({ data }: NodeProps) {
  const onSelect = useContext(SelectQuestionContext);
  const d = data as unknown as { qid: string; num: number; stem: string; choices: { id?: string; text: string }[]; scale?: number };
  const s = d.scale ?? 1; // match the live card's size too, so a swap doesn't resize
  return (
    // pointerEvents:auto is LOAD-BEARING — React Flow gives a node wrapper
    // `pointer-events:none` unless it is selectable/draggable or the flow has node
    // mouse handlers, and these overview stand-ins are deliberately neither. Without
    // this the click below never fires (the cursor/tooltip don't even show).
    <div onClick={() => onSelect(d.qid)} title="Click (or double-click) to open this question — the view glides to it" style={{ pointerEvents: "auto", cursor: "pointer", width: CARD_W, borderRadius: 14, background: PAPER.card, border: `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.5)", padding: 16, opacity: 0.9, ...(s === 1 ? {} : { transform: `scale(${s})`, transformOrigin: "0 0" }) }}>
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

/** BUNDLED chain arrow — when several memos point at the SAME choice they share one
 *  trunk that lands on the choice, with a branch back to each memo. Each memo keeps
 *  its OWN edge (so ids, spotlight, selection and the reveal styling are unchanged);
 *  the edge simply routes via the group's junction, and only the carrier draws the
 *  trunk + arrowhead. Groups of one never use this type at all. */
function ChainBundleEdge({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, style, markerEnd, data }: EdgeProps) {
  const d = data as unknown as { jx: number; jy: number; trunk?: boolean };
  const [branch] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX: d.jx, targetY: d.jy, targetPosition: Position.Right, borderRadius: 8 });
  const [trunk] = d.trunk ? getSmoothStepPath({ sourceX: d.jx, sourceY: d.jy, sourcePosition: Position.Left, targetX, targetY, targetPosition, borderRadius: 8 }) : [null];
  return (<>
    <BaseEdge path={branch} style={style} interactionWidth={16} />
    {trunk && <BaseEdge path={trunk} style={style} markerEnd={markerEnd} interactionWidth={16} />}
  </>);
}
/** Overview stand-in memo — a static chip at the question's own instance spot. */
function OvMemoNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; scale?: number };
  const sc = d.scale ?? 1;
  return <div style={{ pointerEvents: "none", width: 210 * sc, borderRadius: 12 * sc, background: NEON.panelSolid, border: `${1.5 * sc}px solid ${NEON.borderSoft}`, padding: `${10 * sc}px ${12 * sc}px`, opacity: 0.55, fontSize: 13 * sc, color: NEON.text }}>{d.label}</div>;
}
/** MEMO reading arrow (Lee) — the CHOICE points AT the memo. RF still stores the edge
 *  memo(source)→choice(target), but we DRAW it reversed: a STRAIGHT line from the
 *  choice's right-text anchor (targetX/Y) to the memo (sourceX/Y), arrowhead on the
 *  memo. No snake; reads left→right. All look (width/dash/reading-sweep/glow) rides in
 *  `style` from buildEdges. */
function ChainArrowEdge({ sourceX, sourceY, targetX, targetY, style, markerEnd }: EdgeProps) {
  const path = `M ${targetX} ${targetY} L ${sourceX} ${sourceY}`;
  return <BaseEdge path={path} style={style} markerEnd={markerEnd} interactionWidth={22} />;
}
/** FREE ARROW (Lee) — a THICK, POINTY pointer. The CHOICE points AT the memo: the tail
 *  sits at the choice's text anchor and the arrowhead lands on the memo's draggable head
 *  dot. `data.headAtSource` puts the arrowhead on the edge SOURCE (the head node) with the
 *  tail at the TARGET (the choice anchor); without it, head-at-target (legacy). The line
 *  stops short of the head so the wide triangle reads clean; both use the stroke colour. */
function FreeArrowEdge({ sourceX, sourceY, targetX, targetY, style, data }: EdgeProps) {
  const headAtSource = (data as { headAtSource?: boolean } | undefined)?.headAtSource;
  const hx = headAtSource ? sourceX : targetX, hy = headAtSource ? sourceY : targetY; // arrowhead point
  const tx = headAtSource ? targetX : sourceX, ty = headAtSource ? targetY : sourceY; // tail (line start)
  const dx = hx - tx, dy = hy - ty;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;                       // unit vector toward the head
  const HEAD = 26, HALF = 11;                               // long + broad = thick but pointy
  const bx = hx - ux * HEAD, by = hy - uy * HEAD;           // base of the head triangle
  const px = -uy, py = ux;                                  // perpendicular
  const color = (style?.stroke as string) ?? "#E0284A";
  const line = `M ${tx} ${ty} L ${bx} ${by}`;
  const head = `M ${hx} ${hy} L ${bx + px * HALF} ${by + py * HALF} L ${bx - px * HALF} ${by - py * HALF} Z`;
  return (<>
    <BaseEdge path={line} style={{ ...style, strokeLinecap: "round" }} interactionWidth={26} />
    <path d={head} fill={color} stroke={color} strokeWidth={2} strokeLinejoin="round" />
  </>);
}
/** A draggable endpoint dot for a free arrow (tail or head). Hidden until its memo is
 *  revealed; in film it's faint (grabbable) and pops on hover, so it never distracts on
 *  camera but Lee can still reach in and aim the arrow mid-take. */
function ArrowEndNode({ data }: NodeProps) {
  const d = data as unknown as { head?: boolean; color?: string; memoNodeId?: string };
  const revealed = useContext(RevealContext);
  const film = useContext(FilmContext);
  const shown = d.memoNodeId ? revealed.has(d.memoNodeId) : true;
  const hidden = film && !shown;
  return (
    <div className={`nodrag${film && shown ? " sa-arrow-end-film" : ""}`} title="Drag to aim the arrow" style={{ width: 16, height: 16, borderRadius: 999, background: d.head ? (d.color ?? "#E0284A") : "rgba(224,40,74,0.55)", border: "2px solid #fff", cursor: "grab", opacity: hidden ? 0 : film ? undefined : 1, pointerEvents: hidden ? "none" : "auto", boxShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
      <Handle id="s" type="source" position={Position.Left} style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 1, opacity: 0, border: "none", background: "transparent", pointerEvents: "none" }} />
      <Handle id="t" type="target" position={Position.Right} style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 1, height: 1, opacity: 0, border: "none", background: "transparent", pointerEvents: "none" }} />
    </div>
  );
}
const edgeTypes = { chainBundle: ChainBundleEdge, chainArrow: ChainArrowEdge, freeArrow: FreeArrowEdge };
const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode, ovCeq: OverviewCeqNode, ovMemo: OvMemoNode, arrowEnd: ArrowEndNode };
const EMPTY_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };


function Inner({ ceqId, mainRf, mainSig, frameW, frameH, chainEdges, baseline, world, worldIntensity, worldMotion, deckCeqIds, layoutMode, onSaveBaseline, onSaveInstance, onReorderChainMemo, layoutOn, onSetLayoutMode, onApplyLayoutToAll, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onRenameMemo, onDuplicateMemo, onSetMemoCategory, onDeleteMemo, onSetMisconception, misconceptionSlugs, onNextQuestion, onPrevQuestion, showProgress, onSetShowProgress, onOpenMemoLib, topicName }: { ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSaveInstance?: (g: CeqInstanceGeom) => void; onReorderChainMemo?: (memoNodeId: string, dir: -1 | 1) => void; layoutOn?: boolean; onSetLayoutMode?: (on: boolean) => void; onApplyLayoutToAll?: () => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onRenameMemo?: (memoNodeId: string, label: string) => void; onDuplicateMemo?: (memoNodeId: string) => void; onSetMemoCategory?: (memoNodeIds: string[], category: string) => void; onSetMisconception?: (memoNodeIds: string[], slug: string | null) => void; misconceptionSlugs?: string[]; onDeleteMemo?: (memoNodeIds: string[]) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void; showProgress?: boolean; onSetShowProgress?: (b: boolean) => void; onOpenMemoLib?: (id: string) => void; topicName?: string }) {
  const ceq = mainRf.getNode(ceqId);
  // QUESTION 0 (layoutMode): the stage edits the SET BASELINE directly — a placeholder
  // LAYOUT card + "Slot N" placeholders stand in for a real question. Same nodes, same
  // grips, same auto-persist path; it IS the baseline, made visible.
  const cd = layoutMode ? (LAYOUT_CARD as unknown as CeqCard) : (ceq?.data as unknown as CeqCard | undefined);
  // Flat walk list: each chain memo with its choice index + position within the chain.
  // The set's slot rack (saved slots padded out to the full palette) and the ACTIVE
  // ones, which are what real questions actually place memos into.
  const rack = useMemo(() => rackOf(baseline?.memoSlots, frameW, frameH), [baseline?.memoSlots, frameW, frameH]);
  const liveSlots = useMemo(() => activeSlots(rack), [rack]);
  const walk = useMemo(() => {
    const list: { memoNodeId: string; label: string; choice: string; choiceIdx: number; choiceId: string; chainPos: number; num: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: string; slotOff?: boolean; arrow?: CeqChainItem["arrow"] }[] = [];
    if (layoutMode) {
      // QUESTION 0 — the whole palette is on stage: every slot, active or not, so the
      // rack is visible and Lee can switch slots on as a question needs them.
      rack.forEach((s, i) => list.push({ memoNodeId: `__slot${i}`, label: `Slot ${i + 1}`, choice: "—", choiceIdx: 0, choiceId: "", chainPos: i, num: i + 1, slotOff: !!s.off }));
      return list;
    }
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it, p) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), choiceIdx: ci, choiceId: ch.id ?? "", chainPos: p, num: list.length + 1, hideChoiceLabel: it.hideChoiceLabel, hideArrow: it.hideArrow, sound: it.sound, arrow: it.arrow })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig, layoutMode, rack]);

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
  // Where the ACTIVE id sits in the deck order. -1 = it isn't one of the deck's
  // questions at all (Question 0's layout stage), so it has no slot in the vertical
  // stack — and a stack built around it would draw the deck's questions straight
  // through it. Whenever the active id isn't a member, overview is simply off and
  // the single-frame render stands alone.
  const activeIdx = deckCeqIds ? deckCeqIds.indexOf(ceqId) : -1;
  const overviewOn = overview && !!deckCeqIds && deckCeqIds.length > 1 && activeIdx >= 0;
  // COPY/PASTE STYLE (Lee) — marquee-select (Ctrl+drag) memos, right-click → copy their
  // STYLE (size + frame-local position + choice-label/arrow flags, NOT content), then
  // paste onto another selection. Generic node op (cards later). styleClip is ordered.
  const [selMemoIds, setSelMemoIds] = useState<Set<string>>(new Set());
  const [styleClip, setStyleClip] = useState<{ x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean }[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; nodeId: string; kind: "memo" | "pane" | "choice"; choiceId?: string; pos?: { x: number; y: number } } | null>(null);
  // RIGHT-CLICK ADD-MEMO flow: pick a category, then type the text inline.
  const [addCat, setAddCat] = useState<string | null>(null);
  // Right-click memo sub-modes: inline rename field / category picker.
  const [memoMode, setMemoMode] = useState<null | "rename" | "cat" | "trap">(null);
  // The active frame's vertical offset in the stack (0 outside overview). Node positions
  // carry it; the baseline is FRAME-LOCAL, so persistence subtracts it back off.
  const activeYOff = useMemo(() => (overviewOn ? activeIdx * (frameH + Math.round(frameH * 0.16)) : 0), [overviewOn, activeIdx, frameH]);
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
  /** MEMO SWEEP (Shift+`) — clear the memos off the board WITHOUT un-resolving
   *  anything: struck distractors stay struck, the correct choice stays green, and
   *  because nothing re-resolves no sound re-fires. Every chain's walk position goes
   *  back to zero, so Enter on a choice re-walks it from memo 1. `resolved` is what
   *  drives the choice styling and `shown` is what drives the reveals — so sweeping
   *  is exactly "empty `shown`, keep `resolved`". */
  const sweepMemos = () => setShown((s) => (s.size === 0 ? s : new Map()));
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
        const it = cd?.choices[e]?.chain?.[cur]; if (it?.sound) { const snd = it.sound; window.setTimeout(() => playSfx(snd), 200); } // per-chain-item reveal sound — fire at SETTLE (~200ms), as the memo arrives, not at the start of the ease-in
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
  // EXCLUSIVE CHAIN VIEW (authoring): which choice's chain is on stage. Click a choice
  // to show its chain alone; click it again to close. Reset whenever the question
  // changes so a new question opens clean.
  const [viewChoice, setViewChoice] = useState<number | null>(null);
  // COMPOSITION GUIDES (authoring) — the thirds/safe-zone overlay + drag snap for
  // laying out the CEQ card and its memo slots. Toggle persists across sessions.
  const [guidesOn, setGuidesOn] = useState<boolean>(() => { try { return localStorage.getItem("sa-ceq-guides") === "1"; } catch { return false; } });
  const toggleGuides = () => setGuidesOn((v) => { const nv = !v; try { localStorage.setItem("sa-ceq-guides", nv ? "1" : "0"); } catch { /* ignore */ } return nv; });
  const [dragGuides, setDragGuides] = useState<{ v: Guide[]; h: Guide[] }>({ v: [], h: [] });
  useEffect(() => { setViewChoice(null); }, [ceqId]);
  // TRUE walk state — what the CAMERA sees: only memos the Enter-walk has revealed.
  const walkRevealedIds = useMemo(() => { const set = new Set<string>(); for (const w of walk) if (resolved.has(w.choiceIdx) && w.chainPos < (shown.get(w.choiceIdx) ?? 0)) set.add(w.memoNodeId); return set; }, [walk, resolved, shown]);
  // AUTHORING view — the Arrows toggle (and Q0) light everything so Lee can check
  // alignment without walking. Deliberately NOT given to the film subtree: an
  // authoring aid must never change what a take records.
  const revealedMemoIds = useMemo(() => {
    // Exclusive view wins in AUTHORING only — it is a way of looking at one chain, not
    // a change to the walk. Film reads walkRevealedIds and is unaffected.
    if (viewChoice != null) return new Set<string>(walk.filter((w) => w.choiceIdx === viewChoice).map((w) => w.memoNodeId));
    return showAll || layoutMode ? new Set<string>(walk.map((w) => w.memoNodeId)) : walkRevealedIds;
  }, [walk, showAll, layoutMode, walkRevealedIds, viewChoice]);
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
    // Anything spotlit? → dim everything else, so the spotlight commands attention.
    any: () => spots.regular.size > 0 || spots.superKey !== null,
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
    // The RESOLVED card spot (frame-local): the set's baseline, else the deal centre.
    // ONE source for BOTH the live card and the overview stand-ins — otherwise a
    // question change swaps a card between two different spots and it visibly snaps
    // to centre mid-transition.
    // INSTANCE ?? TEMPLATE. In Question 0 there is no instance by construction — the
    // stage IS the template — so Q0 always shows the template exactly as saved.
    const cs = resolveCardSpot(layoutMode ? undefined : cd?.geom, baseline, frameW, frameH);
    // qNum = this question's DECK position (what the Studio rows and take filenames
    // use). Q0/layout is not in deckCeqIds → 0 → the overlay doesn't render.
    const qNum = layoutMode ? 0 : Math.max(0, (deckCeqIds?.indexOf(ceqId) ?? -1) + 1);
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: yOff }, data: { w: frameW, h: frameH, world, worldIntensity, worldMotion, qNum, guides: guidesOn }, draggable: false, selectable: false, zIndex: -10 };
    // STUDENT OVERLAY (Lee) — filmed on the card, one toggle (showProgress):
    //   "X of Y" over the deck order + a fill bar, and the TOPIC name kicker
    //   (name only, no chapter number — Lee's call). Never on the Q0 stage.
    const student = showProgress !== false && !layoutMode;
    const pIdx = deckCeqIds?.indexOf(ceqId) ?? -1;
    const pTot = deckCeqIds?.length ?? 0;
    const progress = student && pIdx >= 0 && pTot > 1 ? { x: pIdx + 1, y: pTot } : null;
    const topic = student && topicName ? topicName : null;
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { x: cs.x, y: yOff + cs.y }, data: { stem: cd.prompt, choices: cd.choices, scale: cs.scale, layoutBadge: layoutMode, progress, topic }, draggable: true, zIndex: 1 };
    // PLACEMENT: in Question 0 each stage chip IS its slot (whole rack, so inactive
    // ones stay visible to switch on). In a real question memos fill the ACTIVE slots
    // in order — inactive slots simply don't exist here. Past the last active slot,
    // memos stack below it at THAT slot's size (never on top of each other).
    const memoGeoms = walk.map((w, i) => {
      // Q0 stages the WHOLE rack (inactive slots included, so they can be switched on);
      // a real question resolves its own instance first, then the active template slots.
      const rs = rack[i];
      // While ONE chain is on stage its items lay out from slot 1 upward (A’s memo 1 and
      // B’s memo 1 both use slot 1 — they are never on stage together). A saved instance
      // spot still wins, so anything Lee has placed by hand stays put.
      const slotIdx = viewChoice != null ? w.chainPos : i;
      const geom = layoutMode
        ? (rs ? { x: rs.x, y: rs.y, scale: rs.scale ?? 1 } : { ...defaultMemoPos(frameW, frameH, i), scale: 1 })
        : resolveMemoSpot(cd?.geom, baseline, slotIdx, frameW, frameH);
      return { w, geom };
    });
    const memoNodes = memoGeoms.map(({ w, geom }) => ({ id: w.memoNodeId, type: "memoPreview", position: { x: geom.x, y: yOff + geom.y }, data: { label: w.label, walkNum: w.num, choice: w.choice, scale: geom.scale, hideChoiceLabel: w.hideChoiceLabel, hideArrow: w.hideArrow, sound: w.sound, slotOff: w.slotOff }, draggable: true, zIndex: 5 }));
    // MEMO ARROW HEAD (Lee) — the arrow's TAIL is pinned to the choice's last-letter
    // text anchor (an RF edge source handle in buildEdges); only the HEAD is a draggable
    // dot. It starts at the memo's centre-right and item.arrow.x2/y2 (once dragged) wins.
    // Not in Q0, and skipped when the memo's arrow is toggled off or it has no choice.
    const arrowNodes = layoutMode ? [] : memoGeoms.flatMap(({ w, geom }) => {
      if (w.hideArrow || !w.choiceId) return [];
      const memoW = Math.round(210 * geom.scale);
      const head = w.arrow ? { x: w.arrow.x2, y: w.arrow.y2 } : { x: geom.x + memoW, y: geom.y + Math.round(30 * geom.scale) };
      return [
        { id: `ah:${w.memoNodeId}`, type: "arrowEnd", position: { x: head.x, y: yOff + head.y }, data: { memoNodeId: w.memoNodeId, head: true, color: "#E0284A" }, draggable: true, selectable: false, zIndex: 6 },
      ];
    });
    const active = [frameNode, ceqNode, ...memoNodes, ...arrowNodes];
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
      // Each stand-in sits at ITS OWN resolved card spot (not the active card's), so
      // the overview shows every question's TRUE layout — after "apply to all" they
      // all conform; before, each reads honestly (fix: neighbours used the active
      // card's x, making the active question look like the odd one out).
      const ocs = resolveCardSpot(od?.geom, baseline, frameW, frameH);
      others.push({ id: `ov:${qid}`, type: "ovCeq", position: { x: ocs.x, y: y + ocs.y }, data: { qid, num: k + 1, stem: od?.prompt ?? "", choices: od?.choices ?? [], scale: ocs.scale }, draggable: false, selectable: false, zIndex: 1 });
      // ALL-CHAINS: the other questions' chained memos, at their resolved instance
      // spots — static, non-interactive, ovm:-prefixed (excluded from film + save).
      let mi = 0;
      for (const ch of (od?.choices ?? [])) for (const it of (ch.chain ?? [])) {
        const sp = resolveMemoSpot(od?.geom, baseline, mi, frameW, frameH);
        others.push({ id: `ovm:${qid}:${mi}`, type: "ovMemo", position: { x: sp.x, y: y + sp.y }, data: { label: it.label, scale: sp.scale }, draggable: false, selectable: false, zIndex: 5 });
        mi++;
      }
    });
    return [...active, ...others] as typeof active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH, baseline, world, worldIntensity, worldMotion, overviewOn, deckCeqIds, activeYOff, layoutMode, walk, viewChoice, guidesOn, showProgress, topicName]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // A drag/resize writeback (commitGeom → onSaveInstance) bumps mainSig, which would
  // re-seed and REPLACE every node — a visible flash on drop. The local nodes already
  // hold the dropped position/scale, so skip exactly that self-triggered re-seed; the
  // next genuine change (question switch, baseline edit, walk) seeds normally.
  const skipSeedRef = useRef(false);
  useEffect(() => {
    if (skipSeedRef.current) { skipSeedRef.current = false; return; }
    setNodes(build() as unknown as Node[]);
  }, [build, setNodes]);

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
  /** FILL the popout (cover), not fitView (contain). fitView preserves aspect, so a
   *  16:9 frame in a window of any other shape letterboxed — black bars Lee then had
   *  to crop in OBS. This scales to the LARGER ratio and centres, so the frame runs
   *  edge to edge; on a 16:9 window cover and contain are identical. */
  const fitFilm = useCallback(() => {
    const inst = filmFitRef.current; const win = filmWin;
    if (!inst || !win) return;
    const w = win.innerWidth, h = win.innerHeight;
    if (!w || !h) return;
    const zoom = Math.max(w / frameW, h / frameH);
    inst.setViewport({ x: (w - frameW * zoom) / 2, y: (h - frameH * zoom) / 2 - activeYOff * zoom, zoom }, { duration: 0 });
  }, [filmWin, frameW, frameH, activeYOff]);
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
  // Q0 / LAYOUT NEVER FILMS — it's the authoring stage (already excluded from
  // counts/stitch/deck). If film is entered while on it, jump to the first real
  // question so the take opens on Q1 and the space-walk has real question state.
  // Covers every film-entry path (toolbar toggle, keyboard), not just one button.
  useEffect(() => {
    if (filmWin && layoutMode && deckCeqIds && deckCeqIds.length) onSelectQuestion?.(deckCeqIds[0]);
  }, [filmWin, layoutMode, deckCeqIds, onSelectQuestion]);

  // Drags (via onNodesChange) + grip resizes are TRANSIENT per-instance overrides —
  // they live ONLY in the local `nodes` state and DIE when build() re-seeds (question
  // switch / baseline change). We no longer write them back to the real canvas nodes;
  // the SET BASELINE is the single source of truth. Promote via "Set as layout" only.
  const setScale = (nodeId: string, scale: number) => setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, scale } } : n)));
  /** Which RACK slot a stage chip owns. In Question 0 the chips ARE the rack, 1:1. In
   *  a real question only ACTIVE slots are on stage, so chip i owns the i-th active
   *  slot — writing rack[i] there would edit the wrong (possibly inactive) slot.
   *  Returns -1 for an overflow chip, which owns no slot and must not persist. */
  const rackIndexOf = (i: number): number => {
    if (layoutMode) return i;
    let seen = -1;
    for (let r = 0; r < rack.length; r++) if (!rack[r].off) { seen += 1; if (seen === i) return r; }
    return -1;
  };
  /** SET AS LAYOUT / auto-persist — write the stage's geometry into the set's rack.
   *  ALWAYS starts from the full rack, so slots that aren't on stage (inactive ones,
   *  or slots a chain-less question never shows) keep their geometry and on/off state
   *  and a wipe is structurally impossible. Only the slots a chip actually occupies
   *  are updated, and `off` is carried through untouched — this writes geometry, and
   *  geometry is all a slot has. */
  /** Snapshot the current arrangement into a DeckLayout (card + memo slots) —
   *  shared by "Set layout" and "Save as template". */
  const captureLayout = (): DeckLayout => {
    const c = nodes.find((n) => n.id === ceqId);
    const memoSlots: DeckSlotLayout[] = rack.map((s) => ({ ...s }));
    walk.forEach((w, i) => {
      const r = rackIndexOf(i); if (r < 0 || !memoSlots[r]) return;
      const m = nodes.find((n) => n.id === w.memoNodeId); if (!m) return;
      memoSlots[r] = { ...memoSlots[r], x: Math.round(m.position.x), y: Math.round(m.position.y - activeYOff), scale: (m.data as { scale?: number }).scale ?? 1 };
    });
    return { card: c ? { x: Math.round(c.position.x), y: Math.round(c.position.y - activeYOff), scale: (c.data as { scale?: number }).scale ?? 1 } : undefined, memoSlots };
  };
  const saveBaseline = () => onSaveBaseline?.(captureLayout());
  // NAMED LAYOUT TEMPLATES (Lee) — arrange the card + memo slots, name it, save.
  // Stored in localStorage so a template is reusable across sets. Applying one
  // writes the SET baseline (deck.layout); "Apply to all" then stamps every CEQ.
  const [templates, setTemplates] = useState<{ name: string; layout: DeckLayout }[]>(() => { try { return JSON.parse(localStorage.getItem("sa-ceq-layout-templates") || "[]"); } catch { return []; } });
  const [tplName, setTplName] = useState("");
  const [tplSel, setTplSel] = useState("");
  const persistTemplates = (list: { name: string; layout: DeckLayout }[]) => { setTemplates(list); try { localStorage.setItem("sa-ceq-layout-templates", JSON.stringify(list)); } catch { /* ignore */ } };
  const saveTemplate = () => { const name = tplName.trim(); if (!name) return; persistTemplates([...templates.filter((t) => t.name !== name), { name, layout: captureLayout() }]); setTplName(""); };
  const applyTemplate = (name: string) => { const t = templates.find((x) => x.name === name); if (t) onSaveBaseline?.(t.layout); };
  const deleteTemplate = (name: string) => persistTemplates(templates.filter((t) => t.name !== name));
  /** QUESTION 0 — the stage's live geometry folded back into the rack. Every rack
   *  edit starts here so an unsaved drag is never lost by a click. */
  const snapshotRack = (): { card: DeckSlotLayout | undefined; memoSlots: DeckSlotLayout[] } => {
    const c = nodes.find((n) => n.id === ceqId);
    const memoSlots: DeckSlotLayout[] = rack.map((s) => ({ ...s }));
    walk.forEach((w, k) => { const m = nodes.find((n) => n.id === w.memoNodeId); if (m && memoSlots[k]) memoSlots[k] = { ...memoSlots[k], x: Math.round(m.position.x), y: Math.round(m.position.y - activeYOff), scale: (m.data as { scale?: number }).scale ?? 1 }; });
    return { card: c ? { x: Math.round(c.position.x), y: Math.round(c.position.y - activeYOff), scale: (c.data as { scale?: number }).scale ?? 1 } : baseline?.card, memoSlots };
  };
  /** Switch a slot on/off. Inactive slots stay in the rack (and on the Q0 stage,
   *  greyed) but never take a placement in a real question. */
  const toggleSlot = (i: number) => {
    const { card, memoSlots } = snapshotRack();
    if (!memoSlots[i]) return;
    memoSlots[i] = { ...memoSlots[i], off: !memoSlots[i].off };
    onSaveBaseline?.({ card, memoSlots });
  };
  /** Grow the rack past the palette — a 6th, 7th… slot, ON by default (you only add
   *  one when you want it) and placed a clear slot-height below the last so it can't
   *  land on top of anything. */
  /** + slot RAISES the active count: switch the next OFF slot back on; if all are on,
   *  grow the rack a clear slot-height below the last. */
  const addSlot = () => {
    const { card, memoSlots } = snapshotRack();
    const off = memoSlots.findIndex((sl) => sl.off);
    if (off >= 0) memoSlots[off] = { ...memoSlots[off], off: false };
    else { const last = memoSlots[memoSlots.length - 1]; memoSlots.push(last ? { x: last.x, y: last.y + Math.max(SLOT_H + 12, Math.round(SLOT_H * (last.scale ?? 1))), scale: last.scale } : { ...paletteSlots(frameW, frameH)[0] }); }
    onSaveBaseline?.({ card, memoSlots });
  };
  /** - slot LOWERS the active count: trim a real extra (>PALETTE_N) first, else switch
   *  off the LAST active slot, keeping at least one on. So "- -" from 5 lands on 3. */
  const removeSlot = () => {
    const { card, memoSlots } = snapshotRack();
    if (memoSlots.length > PALETTE_N) { memoSlots.pop(); }
    else { const on = memoSlots.map((sl, i) => (sl.off ? -1 : i)).filter((i) => i >= 0); if (on.length <= 1) return; memoSlots[on[on.length - 1]] = { ...memoSlots[on[on.length - 1]], off: true }; }
    onSaveBaseline?.({ card, memoSlots });
  };
  // AUTO-PERSIST — a drag or resize sticks across navigation. WHERE it sticks is the
  // whole point of the template/instance split:
  //   QUESTION 0  → the stage IS the template, so it writes deck.layout.
  //   a REAL question → it writes THAT QUESTION'S OWN instance, so nudging question
  //   6's memo can never move question 1's.
  // Before the split this wrote the shared template either way — which is exactly why
  // one move moved the whole set.
  const commitGeom = () => {
    if (layoutMode) { if (onSaveBaseline) { skipSeedRef.current = true; saveBaseline(); } return; }
    if (!onSaveInstance) return;
    let g: CeqInstanceGeom | undefined = cd?.geom;
    const card = nodes.find((n) => n.id === ceqId);
    if (card) g = withInstanceSpot(g, undefined, { x: card.position.x, y: card.position.y - activeYOff, scale: (card.data as { scale?: number }).scale ?? 1 });
    walk.forEach((w, i) => {
      const m = nodes.find((nn) => nn.id === w.memoNodeId); if (!m) return;
      g = withInstanceSpot(g, i, { x: m.position.x, y: m.position.y - activeYOff, scale: (m.data as { scale?: number }).scale ?? 1 });
    });
    if (g) { skipSeedRef.current = true; onSaveInstance(g); }
  };
  // commitGeom closes over `nodes`; a ref keeps snap-on-drop pointed at the
  // latest one so it persists the SNAPPED position, not the pre-snap state.
  const commitRef = useRef(commitGeom);
  commitRef.current = commitGeom;

  // COMPOSITION SNAP — reuse the canvas frame guides (frames.ts) on the previewer.
  // Only while the guides overlay is ON and not in overview (single-question
  // authoring); alt-drag keeps the lines but places freely.
  const snapOf = (node: Node, altBypass: boolean) => {
    if (!guidesOn || overviewOn) return null;
    if (node.type !== "memoPreview" && node.id !== ceqId) return null;
    const dim = (n: Node) => { const m = (n as { measured?: { width?: number; height?: number } }).measured; return { w: m?.width ?? 210, h: m?.height ?? 130 }; };
    const nd = dim(node);
    const rect = { x: node.position.x, y: node.position.y - activeYOff, w: nd.w, h: nd.h };
    const sibs = nodes.filter((n) => n.id !== node.id && (n.type === "memoPreview" || n.id === ceqId)).map((n) => { const d = dim(n); return { x: n.position.x, y: n.position.y - activeYOff, w: d.w, h: d.h }; });
    return frameCompositionGuides({ w: frameW, h: frameH }, rect, sibs, { safeInset: Math.round(frameH * SAFE_INSET_FRAC), altBypass, threshold: Math.max(10, Math.round(frameW * 0.012)) });
  };
  const onNodeDrag = (e: MouseEvent | TouchEvent, node: Node) => {
    const g = snapOf(node, "altKey" in e && e.altKey);
    setDragGuides(g ? { v: g.v, h: g.h } : { v: [], h: [] });
  };
  // MEMO ARROW persistence — only the HEAD dot is draggable now (the tail is pinned to
  // the choice's text anchor), so we save the head in x2/y2 (frame-local). x1/y1 are
  // legacy (the tail is derived from the choice, not stored). skipSeed keeps it smooth.
  const persistArrow = (memoNodeId: string) => {
    const head = nodes.find((n) => n.id === `ah:${memoNodeId}`);
    if (!head || !onPatchChainItem) return;
    skipSeedRef.current = true;
    onPatchChainItem(memoNodeId, { arrow: { x1: 0, y1: 0, x2: Math.round(head.position.x), y2: Math.round(head.position.y - activeYOff) } });
  };
  const onNodeDragStop = (e: MouseEvent | TouchEvent, node: Node) => {
    if (node.id.startsWith("ah:")) { setDragGuides({ v: [], h: [] }); persistArrow(node.id.slice(3)); return; }
    const g = snapOf(node, "altKey" in e && e.altKey);
    setDragGuides({ v: [], h: [] });
    if (g && (g.snapX != null || g.snapY != null)) {
      setNodes((nds) => nds.map((n) => (n.id === node.id ? { ...n, position: { x: g.snapX ?? n.position.x, y: g.snapY != null ? g.snapY + activeYOff : n.position.y } } : n)));
      requestAnimationFrame(() => commitRef.current()); // after the snap flushes to state
    } else {
      commitRef.current();
    }
  };

  /** STANDARD LANDSCAPE — a saveable baseline: CEQ card top-left, three memo slots
   *  down the right ABOVE the bottom-right camera box, the other two off. One click
   *  to a camera-safe layout Lee can then tweak. Writes the set template. */
  const standardLandscape = () => {
    if (!onSaveBaseline) return;
    const card: DeckSlotLayout = { x: Math.round(frameW * 0.06), y: Math.round(frameH * 0.16), scale: 0.92 };
    const sx = Math.round(frameW * 0.66);
    const extra = paletteSlots(frameW, frameH).slice(3).map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), scale: s.scale, off: true }));
    const memoSlots: DeckSlotLayout[] = [
      { x: sx, y: Math.round(frameH * 0.1), scale: 0.85 },
      { x: sx, y: Math.round(frameH * 0.32), scale: 0.85 },
      { x: sx, y: Math.round(frameH * 0.54), scale: 0.85 },
      ...extra,
    ];
    onSaveBaseline({ card, memoSlots });
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
  // Live choice anchors — an edge pointing at a handle that no longer exists (choice
  // deleted, memo unchained) draws nothing anyway; dropping it here keeps the
  // bundler from grouping around a dead anchor. Unchained memos never reach `walk`,
  // so they're already out via miniIds: a memo with no choice simply has no arrow.
  const choiceHandles = useMemo(() => new Set((cd?.choices ?? []).map((c) => memoAnchorId(c.id))), [cd]);
  const liveChain = useMemo(() => (chainEdges ?? []).filter((e) => miniIds.has(e.source) && miniIds.has(e.target) && (e.target !== ceqId || !e.targetHandle || choiceHandles.has(e.targetHandle))), [chainEdges, miniIds, ceqId, choiceHandles]);
  // BUNDLE PER CHOICE — 2+ arrows into the SAME choice become one trunk landing on
  // that choice with a branch back to each memo, instead of N lines crowding it.
  // Only edges that are actually DRAWN count toward a group (an un-revealed memo's
  // branch is faint but present, so the trunk grows as the walk reveals them).
  const bundles = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of liveChain) if (e.target === ceqId && e.targetHandle) { const l = groups.get(e.targetHandle) ?? []; l.push(e.source); groups.set(e.targetHandle, l); }
    const out = new Map<string, { jx: number; jy: number; carrier: string }>();
    for (const [handle, sources] of groups) {
      if (sources.length < 2) continue;
      const pts = sources.map((sid) => nodes.find((n) => n.id === sid)).filter((n): n is NonNullable<typeof n> => !!n)
        .map((n) => ({ x: n.position.x, y: n.position.y + (n.measured?.height ?? 60) / 2 }));
      if (pts.length < 2) continue;
      // Junction sits just left of the memo column, vertically centred on the group.
      const jx = Math.min(...pts.map((p) => p.x)) - 40;
      const jy = (Math.min(...pts.map((p) => p.y)) + Math.max(...pts.map((p) => p.y))) / 2;
      // The trunk (the leg with the arrowhead) rides a memo whose arrow is ON, so a
      // hidden memo can't take the shared trunk down with it.
      const carrier = sources.find((s) => !hideArrowSources.has(s));
      if (carrier) out.set(handle, { jx, jy, carrier });
    }
    return out;
  }, [liveChain, ceqId, nodes, hideArrowSources]);
  /** MEMO ARROWS (Lee) — one thick, pointy arrow per REVEALED memo (unless its arrow is
   *  toggled off): the CHOICE points at the memo. Tail = the choice's last-letter text
   *  anchor (anc:<choiceId>, an RF target handle on the CEQ node); head = the memo's
   *  draggable dot (ah:<memoId>), with the arrowhead at that end (headAtSource). The
   *  previewer passes the authoring reveal set; film passes the true walk state, so an
   *  arrow shows on camera exactly when its memo is revealed (no ghost when you step back). */
  const buildEdges = (revealSet: Set<string>): Edge[] => walk.flatMap((w) => {
    if (w.hideArrow || !w.choiceId || !revealSet.has(w.memoNodeId)) return [];
    return [{
      id: `arr:${w.memoNodeId}`,
      source: `ah:${w.memoNodeId}`, sourceHandle: "s",
      target: ceqId, targetHandle: memoAnchorId(w.choiceId),
      type: "freeArrow",
      zIndex: EDGE_Z,
      data: { headAtSource: true },
      style: { stroke: "#E0284A", strokeWidth: 6 },
    } as Edge];
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const edges: Edge[] = useMemo(() => buildEdges(revealedMemoIds), [walk, revealedMemoIds, ceqId]);
  // FILM edges — arrows ARE part of the shot (Lee wants them on camera). Two
  // differences from the previewer's set, both deliberate: memos toggled arrow-OFF
  // are dropped entirely rather than shown faint (a clean take), and the styling is
  // built from the TRUE walk state, so the Arrows authoring toggle can't light the
  // whole board mid-take. A bundled trunk survives because its carrier is always a
  // memo whose arrow is on.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  /** FILM NODES — the take is ONE frame. In Overview the node list also carries the
   *  other questions' stand-ins (ovf:/ov:), which sat just outside the fit and became
   *  visible the moment the window wasn't exactly 16:9 — complete with their yellow
   *  number badges. The camera gets the active frame only. */
  const filmNodes = useMemo(() => nodes.filter((n) => !n.id.startsWith("ov:") && !n.id.startsWith("ovf:") && !n.id.startsWith("ovm:")), [nodes]);
  const filmEdges = useMemo(() => buildEdges(walkRevealedIds), [walk, walkRevealedIds, ceqId]);
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
  // ` also resets the ARROWS (Lee) — clear every memo's dragged head so the whole CEQ
  // starts over: each arrow snaps back to the choice-anchor → memo-centre-right default.
  const resetArrows = () => { if (!onPatchChainItem) return; walk.forEach((w) => { if (w.arrow) onPatchChainItem(w.memoNodeId, { arrow: null }); }); };

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
      // MEMO SELECTION keys (authoring): Delete removes (in-app confirm upstream),
      // Esc clears, arrows nudge the INSTANCE geometry only (never the template).
      if ((e.key === "Delete" || e.key === "Backspace") && selMemoIds.size > 0 && !layoutMode) { e.preventDefault(); e.stopImmediatePropagation(); onDeleteMemo?.([...selMemoIds]); return; }
      if (e.key === "Escape" && selMemoIds.size > 0) { e.stopImmediatePropagation(); setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n))); setSelMemoIds(new Set()); return; }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") && selMemoIds.size > 0 && !layoutMode) {
        e.preventDefault(); e.stopImmediatePropagation();
        const step = e.shiftKey ? 16 : 4;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setNodes((nds) => nds.map((n) => (selMemoIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
        // commit on the NEXT frame so the moved positions are what commitGeom reads
        window.setTimeout(() => commitGeom(), 0);
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); tabNav(e.shiftKey ? -1 : 1); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; }
      if (e.key === " " || e.code === "Space") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) onPrevQuestion?.(); else onNextQuestion?.(); return; }
      // ` = full reset (choices + memos). SHIFT+` = MEMO SWEEP: clear the memos off
      // the board but KEEP every choice's resolution, so a wrong answer stays struck
      // and the correct one stays green. Nothing re-resolves, so no sound re-fires.
      if (e.key === "`" || e.code === "Backquote" || (e.shiftKey && e.key === "~")) { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) sweepMemos(); else { resetPractice(); setSpots(EMPTY_SPOTS); resetArrows(); } return; }
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
           {/* Q0 only — the number badge becomes the slot on/off switch. */}
           <SlotToggleContext.Provider value={layoutMode && onSaveBaseline ? toggleSlot : null}>
           <ViewChoiceContext.Provider value={layoutMode ? null : { view: viewChoice, set: (i) => setViewChoice((p) => (p === i ? null : i)) }}>
           <ChainReorderContext.Provider value={layoutMode || !onReorderChainMemo ? null : onReorderChainMemo}>
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
                  onNodeDrag={onNodeDrag}
                  onNodeDragStop={onNodeDragStop}
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
                  onNodeContextMenu={(e, node) => { if (node.type === "memoPreview") { e.preventDefault(); setMemoMode(null); setAddCat(null); setCtxMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, kind: "memo" }); } }}
                  // DOUBLE-CLICK TO ZOOM (Lee) — in Overview, double-clicking the ACTIVE
                  // question's card/memos glides back to its frame (the same fitActive the
                  // question-switch effect uses), so "Fit all" → double-click re-frames.
                  // Neighbours are handled by their own click → setQId → that effect; the
                  // guard keeps this from fitting the OLD offset before the switch commits.
                  onNodeDoubleClick={(_e, n) => { if (n.type === "memoPreview") { onSelectMemo?.(n.id); onOpenMemoLib?.(n.id); return; } if (overviewOn && !n.id.startsWith("ov:")) fitActive(420); }}
                  onPaneContextMenu={(e) => { if (!hasItemsClip && !onAddMemoAt) return; e.preventDefault(); const me = e as React.MouseEvent; const fp = fitRef.current?.screenToFlowPosition({ x: me.clientX, y: me.clientY }); setAddCat(null); setCtxMenu({ x: me.clientX, y: me.clientY, nodeId: "", kind: "pane", pos: fp ? { x: Math.round(fp.x), y: Math.round(fp.y - activeYOff) } : undefined }); }}
                  onInit={(inst) => { fitRef.current = inst; }}
                  nodeTypes={nodeTypes} edgeTypes={edgeTypes}
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
                  {/* LIVE SNAP LINES while dragging a slot/card — frame-local coords
                      (frame origin is flow (0, activeYOff)); brighter = stronger guide. */}
                  {(dragGuides.v.length > 0 || dragGuides.h.length > 0) && (
                    <ViewportPortal>
                      {dragGuides.v.map((g, i) => <div key={`gv${i}`} className="pointer-events-none absolute" style={{ left: g.pos, top: activeYOff, width: 1, height: frameH, background: g.weight === "center" ? "rgba(79,163,227,0.95)" : g.weight === "card" ? "rgba(255,139,158,0.9)" : g.weight === "safe" ? "rgba(126,243,192,0.9)" : "rgba(252,163,17,0.85)" }} />)}
                      {dragGuides.h.map((g, i) => <div key={`gh${i}`} className="pointer-events-none absolute" style={{ left: 0, top: activeYOff + g.pos, width: frameW, height: 1, background: g.weight === "center" ? "rgba(79,163,227,0.95)" : g.weight === "card" ? "rgba(255,139,158,0.9)" : g.weight === "safe" ? "rgba(126,243,192,0.9)" : "rgba(252,163,17,0.85)" }} />)}
                    </ViewportPortal>
                  )}
                </ReactFlow>
              </div>
              {/* PRACTICE BAR — hover the preview, then Tab/Enter/Space/` (mouse-free).
                  Ctrl+click a choice/memo/arrow = spotlight · +Shift = 🔥 · +Alt+Shift = 🚨. */}
              <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)" }}>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: running ? "#FF8B9E" : "#3BF5A0", border: `1px solid ${NEON.borderSoft}` }} onClick={toggleRun} title={running ? "Pause timer" : "Start practice timer"}>{running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}</button>
                <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.muted, border: `1px solid ${NEON.borderSoft}` }} onClick={resetAll} title="Reset the CEQ to blank + clear spotlights + timer (`) — Shift+` instead SWEEPS just the memos and keeps the choice states"><RotateCcw className="h-3.5 w-3.5" /></button>
                <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: filmWin ? "#0B0F1E" : "#FF8B9E", background: filmWin ? "#FF8B9E" : "transparent", border: `1px solid ${filmWin ? "#FF8B9E" : "rgba(255,139,158,0.5)"}` }} onClick={toggleFilm} title={filmWin ? "Close the film window" : "FILM MODE — pops a clean 16:9 canvas frame (world background + watermark) onto your 2nd monitor. TWO-WAY: drag / resize / spotlight / Space-Tab-Enter work in EITHER window and stay in sync. Maximize it for OBS."}><Clapperboard className="h-3.5 w-3.5" /> {filmWin ? "Filming" : "Film"}</button>
                {/* COMPOSITION GUIDES — thirds grid + safe zones (title-safe, camera,
                    watermark, end-screen) for laying out the CEQ; drag a slot/card and
                    it snaps to the lines (hold Alt to place freely). Persists. */}
                <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: guidesOn ? "#0B0F1E" : NEON.muted, background: guidesOn ? "#7EF3C0" : "transparent", border: `1px solid ${guidesOn ? "#7EF3C0" : NEON.borderSoft}` }} onClick={toggleGuides} title={guidesOn ? "Composition guides ON — rule-of-thirds + title-safe/camera/watermark/end-screen zones, and drag-to-snap. Click to hide." : "Composition guides — show the rule-of-thirds grid + safe zones and snap dragged slots/cards to them (hold Alt while dragging to place freely)."}><Grid3x3 className="h-3.5 w-3.5" /> Guides</button>
                {layoutMode && onSaveBaseline && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={standardLandscape} title="Standard Landscape — set a camera-safe baseline in one click: CEQ card top-left, three memo slots down the right above the camera box (the other two off). Tweak from there; writes the set's layout.">Standard</button>}
                {/* NAMED TEMPLATES — save the current arrangement under a name (reusable
                    across sets); pick one to apply it to this set's layout, then
                    "Apply to all" stamps every CEQ. */}
                {layoutMode && onSaveBaseline && (<>
                  <input className="h-6 w-20 rounded bg-black/30 px-1.5 text-[9px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.borderSoft}` }} placeholder="name…" value={tplName} onChange={(e) => setTplName(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") saveTemplate(); }} title="Name for a new layout template" />
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} disabled={!tplName.trim()} onClick={saveTemplate} title="Save the current card + memo arrangement as a named template (stored for every set)"><Save className="h-3 w-3" /> tpl</button>
                  {templates.length > 0 && (<>
                    <select className="h-6 rounded px-1 text-[9.5px] font-bold" style={{ color: NEON.cyan, background: "transparent", border: `1px solid ${NEON.borderSoft}`, maxWidth: 120 }} value={tplSel} onChange={(e) => { setTplSel(e.target.value); if (e.target.value) applyTemplate(e.target.value); }} title="Apply a saved template to this set's layout — then 'Apply to all' stamps every CEQ">
                      <option value="">apply template…</option>
                      {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                    <button className="grid h-6 w-6 place-items-center rounded disabled:opacity-30" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} disabled={!tplSel} onClick={() => { if (tplSel) { deleteTemplate(tplSel); setTplSel(""); } }} title="Delete the selected template"><X className="h-3 w-3" /></button>
                  </>)}
                </>)}
                {onSetShowProgress && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: showProgress === false ? NEON.muted : "#0B0F1E", background: showProgress === false ? "transparent" : "#3BF5A0", border: `1px solid ${showProgress === false ? NEON.borderSoft : "#3BF5A0"}` }} onClick={() => onSetShowProgress(showProgress === false)} title={showProgress === false ? "Student overlay OFF — click to film the topic name + \"X of Y\" progress + fill bar on every CEQ box (momentum cue for viewers)." : "Student overlay ON — topic name + \"X of Y\" + fill bar filmed on every CEQ. Click to hide."}>Student</button>}
                {onSetLayoutMode && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: layoutOn === false ? NEON.muted : "#0B0F1E", background: layoutOn === false ? "transparent" : NEON.cyan, border: `1px solid ${layoutOn === false ? NEON.borderSoft : NEON.cyan}` }} onClick={() => onSetLayoutMode(layoutOn === false)} title={layoutOn === false ? "Layout mode OFF — deals land where each question was last authored, nothing conforms. Click to turn ON (the layout governs new deals)." : "Layout mode ON — a deal starts each question from the layout, and new memos snap to the next active slot. Click to turn OFF for fully freeform placement. Either way, a move you make always sticks to that question."}>Layout {layoutOn === false ? "off" : "on"}</button>}
                {/* LAYOUT WRITES LIVE AT Q0 ONLY (Lee) — Standard / templates / Apply-to-all
                    are Q0-only now, so moving memos in a normal CEQ (or on camera) can never
                    change the set layout. "Set layout" is gone: Q0 IS the layout, edited directly. */}
                {layoutMode && onApplyLayoutToAll && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}` }} onClick={onApplyLayoutToAll} title="Apply the Q0 layout to EVERY question in the set — re-stamps each question's card + memo spots from the baseline. Overwrites hand-placed geometry; one Ctrl+Z puts it all back."><LayoutGrid className="h-3.5 w-3.5" /> Apply to all</button>}
                {layoutMode && onSaveBaseline && (<>
                  <span className="flex h-6 items-center rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#0B0F1E", background: NEON.yellow }}>Q0 · Layout</span>
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={addSlot} title="Add a slot past the palette — lands a clear gap below the last one, switched ON"><Plus className="h-3 w-3" /> slot</button>
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase disabled:opacity-40" style={{ color: NEON.red, border: `1px solid ${NEON.borderSoft}` }} disabled={liveSlots.length <= 1 && rack.length <= PALETTE_N} onClick={removeSlot} title={rack.length <= PALETTE_N ? `The ${PALETTE_N}-slot palette is the floor — switch a slot OFF with its number badge instead of removing it` : "Remove the last added slot (the base palette stays)"}>− slot</button>
                  <span className="flex h-6 items-center text-[9px] font-bold uppercase" style={{ color: NEON.muted }}>{liveSlots.length}/{rack.length} on — click a number to switch</span>
                </>)}
                {deckCeqIds && deckCeqIds.length > 1 && activeIdx >= 0 && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: overview ? "#0B0F1E" : NEON.cyan, background: overview ? NEON.cyan : "transparent", border: `1px solid ${overview ? NEON.cyan : NEON.borderSoft}` }} onClick={() => setOverview((v) => !v)} title="Overview — stack every question as its own frame vertically. Zoom out (scroll) to see them all, drag to pan, click a question to glide to it. The active question stays fully live."><Rows3 className="h-3.5 w-3.5" /> {overview ? "Overview" : "Overview"}</button>}
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
                {walk.length > 0 && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: showAll ? "#0B0F1E" : "#E0284A", background: showAll ? "#E0284A" : "transparent", border: `1px solid ${showAll ? "#E0284A" : "rgba(224,40,74,0.5)"}` }} onClick={() => setShowAll((v) => !v)} title="Show arrows — AUTHORING AID: reveal every memo here so you can check the arrows land on the right choices (Ctrl/Shift-click one to test its spotlight). Arrows DO appear on camera, but this toggle does not — the film window keeps showing the real Enter-walk. Toggle off to walk normally."><Spline className="h-3.5 w-3.5" /> Arrows</button>}
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
                <div className="fixed inset-0 z-[60]" onClick={() => { setCtxMenu(null); setMemoMode(null); }} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); setMemoMode(null); }} />
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
                      {/* THE MEMO ITSELF (rename / duplicate / category / delete) — never
                          in Question 0, where the "memos" are synthetic slot placeholders. */}
                      {!layoutMode && (onRenameMemo || onDuplicateMemo || onSetMemoCategory || onDeleteMemo) && <div className="my-0.5 border-t" style={{ borderColor: NEON.borderSoft }} />}
                      {!layoutMode && onRenameMemo && (memoMode === "rename" ? (
                        <input autoFocus defaultValue={walk.find((w) => w.memoNodeId === ctxMenu.nodeId)?.label ?? ""} placeholder="new text… (Enter)" className="nodrag m-1 rounded bg-black/40 px-1.5 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v) onRenameMemo(ctxMenu.nodeId, v); setCtxMenu(null); setMemoMode(null); } else if (e.key === "Escape") { setMemoMode(null); } }} />
                      ) : (
                        <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setMemoMode("rename")} title="Rename this memo — updates the card here, in film, and every question that chains it">Rename…</button>
                      ))}
                      {!layoutMode && onDuplicateMemo && memoMode === null && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => { onDuplicateMemo(ctxMenu.nodeId); setCtxMenu(null); }} title="Duplicate onto the SAME choice, at the next baseline slot">Duplicate</button>}
                      {!layoutMode && onSetMemoCategory && memoMode !== "rename" && (memoMode === "cat" ? (
                        MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => { onSetMemoCategory(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId], c); setCtxMenu(null); setMemoMode(null); }}>{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)
                      ) : (
                        <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setMemoMode("cat")} title="Change the memo's category (drives its icon + how it files in the library)">Change category ▸</button>
                      ))}
                      {!layoutMode && onSetMisconception && memoMode !== "rename" && memoMode !== "cat" && (memoMode === "trap" ? (
                        <>
                          {(misconceptionSlugs ?? []).map((sl) => <button key={sl} className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.yellow }} onClick={() => { onSetMisconception(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId], sl); setCtxMenu(null); setMemoMode(null); }}>{sl}</button>)}
                          <button className="rounded px-1.5 py-1 text-left text-[10.5px] hover:bg-white/5" style={{ color: NEON.muted }} onClick={() => { onSetMisconception(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId], null); setCtxMenu(null); setMemoMode(null); }}>clear tag</button>
                        </>
                      ) : (
                        <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setMemoMode("trap")} title="Tag the trap this memo kills — questions chaining it derive the exposure chip">Misconception ▸</button>
                      ))}
                      {!layoutMode && onDeleteMemo && memoMode === null && <button className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.red }} onClick={() => { onDeleteMemo(selMemoIds.size > 0 && selMemoIds.has(ctxMenu.nodeId) ? [...selMemoIds] : [ctxMenu.nodeId]); setCtxMenu(null); }} title="Delete the memo from the scene — removes it from every question that chains it (confirm first; Ctrl+Z restores)">Delete memo…</button>}
                    </>
                  ) : ctxMenu.kind === "choice" ? (
                    <>
                      <div className="px-1.5 py-0.5 text-[8px] font-bold uppercase" style={{ color: NEON.muted }}>Add memo to this choice</div>
                      {addCat === null ? (
                        MEMO_CATEGORIES.map((c) => <button key={c} className="rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.text }} onClick={() => setAddCat(c)}>{c === "ELEMENT" ? "🧩 ELEMENT" : c}</button>)
                      ) : (
                        <input autoFocus placeholder={`${addCat} memo… (Enter)`} className="nodrag m-1 rounded bg-black/40 px-1.5 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v && ctxMenu.choiceId) onAddMemoAtChoice?.(ctxMenu.choiceId, v, addCat); setCtxMenu(null); setAddCat(null); setMemoMode(null); } else if (e.key === "Escape") { setAddCat(null); } }} />
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
                            <input autoFocus placeholder={`${addCat} memo… (Enter)`} className="nodrag m-1 rounded bg-black/40 px-1.5 py-1 text-[11px] outline-none" style={{ color: NEON.text, border: `1px solid ${NEON.border}` }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { const v = (e.target as HTMLInputElement).value.trim(); if (v && ctxMenu.pos) onAddMemoAt?.(ctxMenu.pos, v, addCat); setCtxMenu(null); setAddCat(null); setMemoMode(null); } else if (e.key === "Escape") { setAddCat(null); } }} />
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
                {/* The camera sees the TRUE walk state — the Arrows toggle lights every
                    memo for authoring, and that must not reach a take. */}
                <RevealContext.Provider value={walkRevealedIds}>
                <FilmContext.Provider value={true}>
                  <style>{FLAME_CSS}{PV_CSS}</style>
                  <div className="film-mode" style={{ position: "relative", width: "100%", height: "100%" }}>
                    <ReactFlowProvider>
                      <ReactFlow
                        nodes={filmNodes}
                        edges={filmEdges}
                        onNodesChange={onNodesChange}
                        onNodeDragStop={(_e, node) => { if (node.id.startsWith("ah:")) persistArrow(node.id.slice(3)); /* FILM = PERFORMANCE (Lee): a memo/card move on camera is NOT persisted — it resets on the next deal/seed, never touching the layout. */ }}
                        onConnect={onConnect}
                        onEdgeClick={onEdgeClick}
                        nodeTypes={nodeTypes} edgeTypes={edgeTypes}
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
                    </ReactFlowProvider>
                    <BrandWatermark />
                  </div>
                </FilmContext.Provider>
                </RevealContext.Provider>
              </PanelPopout>
            )}
           </ChoiceMenuContext.Provider>
           </SelectQuestionContext.Provider>
           </AttachMemoContext.Provider>
           </ChainReorderContext.Provider>
           </ViewChoiceContext.Provider>
           </SlotToggleContext.Provider>
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

export function CeqPreviewer({ ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], baseline, world, worldIntensity, worldMotion, deckCeqIds, layoutMode, onSaveBaseline, onSaveInstance, onReorderChainMemo, layoutOn, onSetLayoutMode, onApplyLayoutToAll, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onRenameMemo, onDuplicateMemo, onSetMemoCategory, onDeleteMemo, onSetMisconception, misconceptionSlugs, onNextQuestion, onPrevQuestion, showProgress, onSetShowProgress, onOpenMemoLib, topicName }: { ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSaveInstance?: (g: CeqInstanceGeom) => void; onReorderChainMemo?: (memoNodeId: string, dir: -1 | 1) => void; layoutOn?: boolean; onSetLayoutMode?: (on: boolean) => void; onApplyLayoutToAll?: () => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onRenameMemo?: (memoNodeId: string, label: string) => void; onDuplicateMemo?: (memoNodeId: string) => void; onSetMemoCategory?: (memoNodeIds: string[], category: string) => void; onSetMisconception?: (memoNodeIds: string[], slug: string | null) => void; misconceptionSlugs?: string[]; onDeleteMemo?: (memoNodeIds: string[]) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void; showProgress?: boolean; onSetShowProgress?: (b: boolean) => void; onOpenMemoLib?: (id: string) => void; topicName?: string }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <PreviewErrorBoundary resetKey={ceqId}>
      <ReactFlowProvider>
        <Inner ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} baseline={baseline} world={world} worldIntensity={worldIntensity} worldMotion={worldMotion} deckCeqIds={deckCeqIds} layoutMode={layoutMode} onSaveBaseline={onSaveBaseline} onSaveInstance={onSaveInstance} onReorderChainMemo={onReorderChainMemo} layoutOn={layoutOn} onSetLayoutMode={onSetLayoutMode} onApplyLayoutToAll={onApplyLayoutToAll} onSetWorld={onSetWorld} onPatchChainItem={onPatchChainItem} onAttachMemo={onAttachMemo} onSelectMemo={onSelectMemo} onSelectQuestion={onSelectQuestion} onCopyItems={onCopyItems} onPasteItems={onPasteItems} hasItemsClip={hasItemsClip} onSendToStarred={onSendToStarred} onCopyStyleToSet={onCopyStyleToSet} starredCount={starredCount} onAddMemoAtChoice={onAddMemoAtChoice} onAddMemoAt={onAddMemoAt} onRenameMemo={onRenameMemo} onDuplicateMemo={onDuplicateMemo} onSetMemoCategory={onSetMemoCategory} onDeleteMemo={onDeleteMemo} onSetMisconception={onSetMisconception} misconceptionSlugs={misconceptionSlugs} onNextQuestion={onNextQuestion} onPrevQuestion={onPrevQuestion} showProgress={showProgress} onSetShowProgress={onSetShowProgress} onOpenMemoLib={onOpenMemoLib} topicName={topicName} />
      </ReactFlowProvider>
    </PreviewErrorBoundary>
  );
}
