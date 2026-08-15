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
//   Space / PageDown — next question (deal).  Shift+Space / PageUp — previous.
//   `                — reset to blank.
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
import { Clapperboard, ChevronDown, ChevronRight, Eye, Grid3x3, LayoutGrid, Maximize2, Plus, Rows3, Save, Spline, X } from "lucide-react";

import { Bolt, BOLT_PRESETS, BOLT_RATIO, boltColorById, BRAND_DISPLAY } from "./brand";
import { frameCompositionGuides, SAFE_INSET_FRAC, type Guide } from "./frames";

import { MEMO_CATEGORIES } from "./cards/MemoCardNode";
import { FLAME_CSS } from "./FilmOverlays";
import { openPopoutWindow, PanelPopout } from "./PanelPopout";
import { WorldBackground } from "./WorldBackground";
import { WORLDS } from "./worlds";
import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { renderInline } from "./inline-md";
import { resolveCardSpot, resolveMemoSpot, templateFor, withInstanceSpot } from "./ceq-geom";
import { CALLOUT_KINDS, CalloutBody, calloutKindForCategory, nextCalloutKind } from "./cards/CalloutCard";
import { clearExhibitHighlights } from "./exhibit-highlights";
import { FILM_LOCK_CSS, FilmContext, filmDragAllowed, isTypingTarget } from "./film-lock";
import { memoAnchorId, TextAnchor } from "./MemoLightbulb";
import { EDGE_MARKER, EDGE_STYLE, EDGE_Z } from "./scene-io";
import { playSfx } from "./sfx";
import { spotStyle } from "./SpotlightContext";
import { CardWriteCtx } from "./BaseCard";
import { bus, patchDataCmd, type RfLike } from "./commands";
import { STAGE_NODE_TYPES, stageNodeType } from "./stage-elements";
import { applyRegularClick, applySuperClick, spotKey, type SpotSets, type SuperTone } from "./spotlight";
import { CHAINED_MARKER, NEON, PAPER } from "./theme";
import { clampScale, type CalloutSettings, type CeqCard, type CeqChainItem, type CeqInstanceGeom, type DeckLayout, type DeckSlotLayout } from "./types";

/** Practice state read by the CEQ mock (emphasis + which choices are resolved). */
const PracticeContext = createContext<{ emph: number | null; resolved: Set<number>; select?: (i: number) => void; boss?: boolean; toggleBoss?: () => void }>({ emph: null, resolved: new Set() });
/** The set of currently-revealed chain-memo node ids (read by memo chips). */
const RevealContext = createContext<Set<string>>(new Set());
/** Live resize: write a node's data.scale (mini + main store). */
const ScaleContext = createContext<(id: string, s: number) => void>(() => {});
/** Called once when a resize DRAG ends (pointer-up), so the new size can be persisted. */
const ScaleCommitContext = createContext<() => void>(() => {});
/** LOCAL rehearsal-spotlight layer (never the global controller). Keyed spotKey. */
interface PreviewSpotApi { state: (key: string) => "spot" | null; flamed: (key: string) => boolean; tone: (key: string) => SuperTone; onClick: (key: string, e: React.PointerEvent) => void; any: () => boolean }
const PreviewSpotContext = createContext<PreviewSpotApi>({ state: () => null, flamed: () => false, tone: () => "focus", onClick: () => {}, any: () => false });
// FILM view (the popout mirror): true ⇒ nodes render CLEAN — no scale grips, no
// frame outline/label, no chain-number badges — just the composition the camera
// sees. Now lives in film-lock.ts (shared) so staged exhibit cards can consume
// the same signal — they never knew they were on camera before (A1).
/** Toggle a chain memo's DISPLAY flags from its preview node (hide choice label / hide
 *  arrow / vinyl-on-entry). Keyed by memoNodeId; writes back through the main store
 *  (undoable) via CeqStudio's onPatchChainItem. Noop when not authoring. */
const ChainToggleContext = createContext<(memoNodeId: string, patch: Partial<CeqChainItem>) => void>(() => {});
/** INLINE-EDIT a memo's text from the previewer (authoring only). Commits the new text as
 *  the memo LABEL everywhere it's chained (node title + every question's chain[].label) via
 *  CeqStudio's renameMemoEverywhere, so an edit ripples to the library + all CEQ sets. null
 *  ⇒ editing disabled (film / layout stage). */
const MemoEditContext = createContext<((memoNodeId: string, text: string) => void) | null>(null);
/** INLINE-EDIT the CEQ stem from the previewer (authoring only). Commits the new text as the
 *  question prompt via CeqStudio's patchQ. null ⇒ disabled (film / layout stage). */
const StemEditContext = createContext<((ceqId: string, text: string) => void) | null>(null);
/** Strip the inline-md markers so a film text-selection's char offsets (measured against the
 *  RENDERED text) line up with the string we slice for the bold-emphasis re-render. */
const stripInlineMarks = (t: string) => t.replace(/\*\*([^*]+?)\*\*/g, "$1").replace(/==([^=]+?)==/g, "$1");
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
/* BOSS MOMENT (P3) — charge-up then settle: a hard energy flash relaxing to a
   sharper hi-tech border. Shadow/border only (film-lock law); no text, no sound. */
@keyframes sa-boss-charge {
  0% { box-shadow: 0 0 0 0 rgba(79,209,224,0), 0 8px 26px -10px rgba(0,0,0,0.6); }
  30% { box-shadow: 0 0 0 7px rgba(79,209,224,0.4), 0 0 70px rgba(252,163,17,0.85); }
  100% { box-shadow: 0 0 0 2px rgba(79,209,224,0.55), 0 0 24px rgba(252,163,17,0.3), 0 8px 26px -10px rgba(0,0,0,0.6); }
}
.sa-boss-card { animation: sa-boss-charge 750ms cubic-bezier(0.22,1,0.36,1) both !important; border-color: #4FD1E0 !important; }
@keyframes sa-boss-bolt-in { from { transform: translateX(30px) rotate(9deg); opacity: 0; } to { transform: none; opacity: 1; } }
.sa-boss-bolt { animation: sa-boss-bolt-in 480ms 160ms cubic-bezier(0.16,1,0.3,1) both; }
.sa-pv-node .sa-grip-film { opacity: 0; pointer-events: none; transition: opacity 120ms ease; }
.sa-pv-node:hover .sa-grip-film { opacity: 1; pointer-events: auto; }
/* MOVE STRIPS (Lee) — the memo moves only by its top/bottom edge, but the strips are
   INVISIBLE (Lee knows they're there); the move cursor on hover is the only hint. */
.sa-memo-move { background: transparent; }
/* TEXT SELECTION inside a memo reads in the brand's amber instead of the OS blue. */
.sa-pv-node ::selection { background: rgba(252,163,17,0.9); color: #0B0F1E; }
/* KEPT SELECTION EMPHASIS (Lee) — after you release, the highlighted text stays BOLD +
   amber; when the memo is spotlit it also grows a touch, so it reads as "spotlighted". */
.sa-sel-emph { font-weight: 900; background: rgba(252,163,17,0.92); color: #0B0F1E; border-radius: 3px; padding: 0 2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.sa-sel-emph-spot { font-size: 1.18em; }
.sa-pv-node ::-moz-selection { background: rgba(252,163,17,0.9); color: #0B0F1E; }
/* FREE-ARROW endpoint dots in film: faint (so they barely read on camera) but grabbable,
   and they pop to full on hover so Lee can aim the arrow mid-take. */
.sa-arrow-end-film { opacity: 0.14; transition: opacity 120ms ease; }
.sa-arrow-end-film:hover { opacity: 1; }
/* Modern transitions (Lee): a CEQ slides+fades in when the question changes (the
   card node remounts on ceqId change), and a chain memo POPS in when it's revealed
   in film — a touch more emphatic than a plain fade. */
/* CEQ ARRIVAL (Lee — "same frame, a new CEQ just appears") — a SETTLE, not a fade-in.
   It used to start at opacity 0: because each question is its own node id, the old card
   unmounts and the new one mounts INVISIBLE, so every space-press showed a blank beat —
   that blink is what read as flickery. Starting at 0.5 keeps a card on screen the whole
   way through; the eye sees one card resolve, never an empty frame. Short travel (7px),
   a hair of scale, and a slow-out curve do the rest. */
@keyframes sa-ceq-in { from { opacity: 0.5; transform: translateY(7px) scale(0.994); } to { opacity: 1; transform: translateY(0) scale(1); } }
/* …and ONE quiet brand pulse on the card edge so it's unmistakable that the question
   CHANGED without a flash: a gold ring blooms and dissolves in under half a second. */
@keyframes sa-ceq-edge {
  0%   { box-shadow: 0 8px 26px -10px rgba(0,0,0,0.6), 0 0 0 2.5px rgba(252,163,17,0.55), 0 0 18px rgba(252,163,17,0.35); }
  100% { box-shadow: 0 8px 26px -10px rgba(0,0,0,0.6), 0 0 0 0 rgba(252,163,17,0), 0 0 0 rgba(252,163,17,0); }
}
/* HARD PUSH (Lee, #4) — PageDown / PageUp are a DISTINCT, faster deal than the Space walk:
   a pure vertical push, NO fade / blur / scale. PageDown (next) enters from BELOW, PageUp
   (prev) from ABOVE, 180ms sharp ease-out. Held, it rips a whole set in ~1s for the tease. */
@keyframes sa-ceq-push-down { from { transform: translateY(64px); } to { transform: translateY(0); } }
@keyframes sa-ceq-push-up { from { transform: translateY(-64px); } to { transform: translateY(0); } }
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
.sa-memo-pop, .sa-memo-in { transform-origin: 0 0; }
/* The CEQ card settles about its OWN CENTRE. With origin 0 0 it grew out of its
   top-left corner, so the arrival read as a sideways shift on top of the fade —
   the second half of the "flashy" feel. Sub-pixel drift at scale 0.994. */
.sa-ceq-in { transform-origin: 50% 50%; }
/* On-memo cluster: slight grow on hover (legibility), authoring-only by gating. */
.sa-memo-cluster { transition: transform 120ms; }
.sa-memo-cluster:hover { scale: 1.15; }
/* Selection ring in film: present but quiet — the shot shows intent, not UI. */
.film-mode .sa-msel { outline: none; }
@media (prefers-reduced-motion: reduce) { .sa-ceq-in, .sa-ceq-edge, .sa-memo-pop, .sa-memo-in, .sa-ceq-correct, .sa-strike-draw { animation: none !important; } }
/* SPOTLIGHT GUARDRAILS (Lee) — cap the FLAME super-scale inside the previewer so a
   flamed choice/memo can't blow outside the CEQ box / frame on a take (beats
   FLAME_CSS's scale(1.4) !important by specificity; origin stays left-center). */
.sa-ceq-choice[data-flame="on"] { transform: scale(1.25) !important; border-radius: 10px; }
.sa-pv-node[data-flame="on"] { transform: scale(1.6) !important; border-radius: 12px; }
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
function containSpot(state: "spot" | null, big = false): React.CSSProperties {
  const s = spotStyle(state);
  if (state !== "spot") return s;
  // ENLARGE MUCH MORE (Lee) — the spotlight has to make an impact. A MEMO (the teaching
  // surface, free-floating) grows big with a thick amber rail + strong glow + lift and
  // rides above its neighbours; a CHOICE (inside the paper card, clipped) grows moderately
  // so it still reads without spilling into the frame. Radius matches the memo/choice box.
  return big
    // grow from the CENTRE (not spotStyle's left-center) so a big memo expands evenly and
    // is far less likely to spill off a frame edge on a take.
    ? { ...s, transform: "scale(1.4)", transformOrigin: "center center", borderRadius: 12, zIndex: 30, boxShadow: "inset 5px 0 0 #FCA311, 0 0 36px rgba(252,163,17,0.8), 0 18px 36px -8px rgba(0,0,0,0.62)" }
    : { ...s, transform: "scale(1.18)", borderRadius: 10 };
}
const LETTER = (i: number) => String.fromCharCode(65 + (i % 26));

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

// getNodes joins the set for STAGED ELEMENTS (Add menu): the previewer has to scan
// the canvas for cards staged onto the open question. The Studio already passes the
// full instance — only this type was narrower than reality.
type MainRf = Pick<ReactFlowInstance, "getNode" | "getNodes" | "setNodes" | "setEdges">;
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
/** Practice state for INERT stand-ins (film stack, A2): always the base state. */
const INERT_PRACTICE: { emph: number | null; resolved: Set<number>; select?: (i: number) => void; boss?: boolean; toggleBoss?: () => void } = { emph: null, resolved: new Set() };
function CeqPreviewNode({ id, data }: NodeProps) {
  // INERT (film stack, A2): this card is a fully-rendered stand-in for a NON-ACTIVE
  // frame — practice/emphasis state belongs to the active question only, so an
  // inert card always shows its clean base state. Same id + type as the live card,
  // so activation is a DATA FLIP (no remount → nothing can flash on camera).
  const inert = !!(data as { inert?: boolean }).inert;
  const prLive = useContext(PracticeContext);
  const pr = inert ? INERT_PRACTICE : prLive;
  const vc = useContext(ViewChoiceContext);
  const viewChoice = vc?.view ?? null;
  const onViewChoice = vc?.set;
  const spot = useContext(PreviewSpotContext);
  const film = useContext(FilmContext);
  const attachMemo = useContext(AttachMemoContext);
  const choiceMenu = useContext(ChoiceMenuContext);
  const [dropChoice, setDropChoice] = useState<string | null>(null); // choice a memo is hovering (drag-to-chain)
  const d = data as unknown as { stem: string; choices: { id: string; text: string; correct?: boolean; chain?: unknown[] }[]; scale?: number; layoutBadge?: boolean; brandBolt?: false | string; progress?: { x: number; y: number } | null; topic?: string | null; callout?: CalloutSettings; calloutMemos?: { label: string; category?: string }[] };
  const s = d.scale ?? 1;
  // BRANDING — the bolt sits top-left of the CEQ box, filmed with the card. Floated
  // so the stem wraps around it. `brandBolt` false hides it; a string picks a colour
  // (preset/SEC id); default = house red/blue. Not on the Q0 layout stage.
  const boltCol = d.brandBolt === false ? null : d.layoutBadge ? null : typeof d.brandBolt === "string" ? boltColorById(d.brandBolt) : BOLT_PRESETS[0];
  // STEM: film highlight-to-bold (same live teaching gesture as memos) + authoring inline
  // edit (double-click → textarea → commits the question prompt everywhere).
  const editStem = useContext(StemEditContext);
  const stemRef = useRef<HTMLDivElement>(null);
  const [stemSel, setStemSel] = useState<{ a: number; b: number } | null>(null);
  const stemPlain = stripInlineMarks(d.stem || "Question");
  const readStemSelection = () => {
    if (!film) return;
    const el = stemRef.current; const win = el?.ownerDocument.defaultView; const sel = win?.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.commonAncestorContainer)) return;
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    const a = pre.toString().length, b = a + r.toString().length;
    if (b > a) setStemSel({ a, b });
  };
  const canEditStem = !film && !!editStem && !d.layoutBadge;
  const [stemEditing, setStemEditing] = useState(false);
  const [stemDraft, setStemDraft] = useState("");
  const startStemEdit = () => { if (!canEditStem) return; setStemDraft(d.stem || ""); setStemEditing(true); };
  const commitStemEdit = () => { editStem?.(id, stemDraft); setStemEditing(false); };
  // ---- CALLOUT (P1): a zero-choice (note) frame renders as the standardized
  // reading card. Affordances are AUTHORING-ONLY (film shows the finished face);
  // writes go through the main store like any other card edit (undoable).
  const isCallout = !d.layoutBadge && (d.choices?.length ?? 0) === 0;
  const rflW = useContext(CardWriteCtx);
  const patchCallout = (patch: Partial<CalloutSettings>) => {
    if (!rflW) return;
    const cmd = patchDataCmd(rflW, id, { callout: { ...(d.callout ?? {}), ...patch } } as never, "edit callout");
    if (cmd) bus.dispatch(cmd);
  };
  const [bulletEdit, setBulletEdit] = useState<{ i: number; draft: string } | null>(null);
  const commitBullet = () => {
    if (!bulletEdit) return;
    const xs = [...(d.callout?.extraStems ?? [])];
    const t = bulletEdit.draft.trim();
    if (t) xs[bulletEdit.i] = t; else xs.splice(bulletEdit.i, 1); // empty text removes the bullet
    patchCallout({ extraStems: xs });
    setBulletEdit(null);
  };
  return (
    <div data-ceq-card="" onClickCapture={film && !inert ? (e) => { if (e.altKey && e.ctrlKey) { e.preventDefault(); e.stopPropagation(); prLive.toggleBoss?.(); } } : undefined} className={`sa-pv-node ${(d as { enterAnimName?: string }).enterAnimName ?? "sa-ceq-in"}${!inert && pr.boss ? " sa-boss-card" : ""}`} onAnimationEnd={(ev) => { if (ev.animationName === ((d as { enterAnimName?: string }).enterAnimName ?? "sa-ceq-in")) (ev.currentTarget as HTMLElement).style.willChange = "auto"; }} onDragOver={film || !isCallout ? undefined : (e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }} onDrop={film || !isCallout ? undefined : (e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); patchCallout({ memoIds: [...(d.callout?.memoIds ?? []), mid] }); } }} style={{ position: "relative", width: isCallout ? "fit-content" : CARD_W * s, minWidth: isCallout ? 320 * s : undefined, maxWidth: isCallout ? CARD_W * s : undefined, borderRadius: 14 * s, background: PAPER.card, border: d.layoutBadge && !film ? `2px dashed ${NEON.yellow}` : `1px solid ${PAPER.cardEdge}`, boxShadow: "0 8px 26px -10px rgba(0,0,0,0.6)", willChange: "transform, opacity", animation: (d as { enterAnim?: string }).enterAnim ?? "sa-ceq-in 300ms cubic-bezier(0.22,1,0.36,1) both, sa-ceq-edge 460ms ease-out both" }}>
      {/* BOSS (P3): the boiling bolt sweeps in with the charge — no text, no sound. */}
      {!inert && pr.boss && <div className="sa-boss-bolt" style={{ position: "absolute", top: -18 * s, right: 16 * s, zIndex: 22 }}><BoltBoil height={40 * s} /></div>}
      {/* QUESTION 0 ribbon — unmistakably the LAYOUT stage, never content. */}
      {d.layoutBadge && !film && <span style={{ position: "absolute", top: -12, left: 12, borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0B0F1E", background: NEON.yellow, zIndex: 21 }}>Layout</span>}
      {/* STUDENT PROGRESS — "X of Y" top-right + a slim fill bar along the top edge;
          filmed with the card. Momentum cue: "you're 3 of 22, keep going". */}
      {d.progress && (<>
        <div style={{ position: "absolute", top: 0, left: 0, height: 4 * s, width: `${Math.round((d.progress.x / d.progress.y) * 100)}%`, background: `linear-gradient(90deg, ${PAPER.green}, #3BF5A0)`, borderTopLeftRadius: 14 * s, borderBottomRightRadius: 3 * s, zIndex: 8 }} />
        <span style={{ position: "absolute", top: 12 * s, right: 14 * s, fontSize: 15 * s, fontWeight: 800, letterSpacing: "0.02em", color: PAPER.inkMuted, zIndex: 8 }}>{d.progress.x} <span style={{ opacity: 0.6 }}>of</span> {d.progress.y}</span>
      </>)}
      {/* CALLOUT controls (P1) — small, unobtrusive, authoring-only (sa-chrome
          + card-actions ⇒ film CSS kills them even if the gate ever slips). */}
      {isCallout && !film && (
        <div className="sa-chrome nodrag card-actions" style={{ position: "absolute", top: -26, right: 0, zIndex: 21, display: "flex", gap: 4, alignItems: "center", borderRadius: 8, padding: "2px 4px", background: NEON.panelSolid, border: `1px solid ${NEON.borderSoft}` }} onPointerDown={(e) => e.stopPropagation()}>
          <button className="rounded px-1 text-[9px] font-black" style={{ color: d.callout?.showTopic === false ? NEON.muted : NEON.cyan }} title="Topic label on/off" onClick={() => patchCallout({ showTopic: d.callout?.showTopic === false })}>TOPIC</button>
          <button className="rounded px-1 text-[9px] font-black" style={{ color: d.callout?.bolt ? NEON.yellow : NEON.muted }} title="Boiling bolt on the left (off by default)" onClick={() => patchCallout({ bolt: !d.callout?.bolt })}>⚡</button>
          <button className="rounded px-1 text-[9px] font-black" style={{ color: d.callout?.kind ? CALLOUT_KINDS[d.callout.kind].accent : NEON.muted }} title="Callout type — click to cycle (or drop a memo from the library to convert)" onClick={() => patchCallout({ kind: nextCalloutKind(d.callout?.kind) })}>{d.callout?.kind ? CALLOUT_KINDS[d.callout.kind].label : "TYPE"}</button>
          <button className="rounded px-1 text-[9px] font-black" style={{ color: NEON.muted }} title="Add a secondary stem (indented gray bullet; double-click one to edit)" onClick={() => patchCallout({ extraStems: [...(d.callout?.extraStems ?? []), "New point"] })}>+ STEM</button>
          {(d.callout?.memoIds?.length ?? 0) > 0 && <button className="rounded px-1 text-[9px] font-black" style={{ color: "#FF8B9E" }} title="Clear the dropped memos (back to the stem)" onClick={() => patchCallout({ memoIds: [] })}>✕ MEMOS</button>}
        </div>
      )}
      {/* CLIP — a spotlit choice's scale + glow stays INSIDE the CEQ box (never spills
          into the frame on a take). The ScaleGrip lives OUTSIDE this clip. */}
      <div style={{ overflow: "hidden", borderRadius: 13 * s, padding: 16 * s }}>
      {/* TOPIC kicker — name only (no Ch#), small uppercase above the stem so a
          viewer landing mid-clip knows the topic. */}
      {!isCallout && d.topic && <div style={{ fontSize: 12 * s, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: PAPER.inkMuted, marginBottom: 6 * s, maxWidth: "58%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.topic}</div>}
      {isCallout && !stemEditing && (
        <div onDoubleClick={canEditStem ? (e) => { e.stopPropagation(); startStemEdit(); } : undefined} title={canEditStem ? "Double-click to edit the text" : undefined}>
          <CalloutBody
            scale={s}
            topic={d.callout?.showTopic === false ? null : d.topic}
            stem={d.stem}
            extraStems={d.callout?.extraStems}
            kind={d.callout?.kind ?? (d.calloutMemos?.length ? calloutKindForCategory(d.calloutMemos[0].category) : undefined)}
            highlights={(d.calloutMemos ?? []).map((m) => m.label)}
            bolt={d.callout?.bolt}
            onEditBullet={film ? undefined : (i) => setBulletEdit({ i, draft: d.callout?.extraStems?.[i] ?? "" })}
          />
        </div>
      )}
      {isCallout && bulletEdit && (
        <textarea autoFocus className="nodrag" value={bulletEdit.draft}
          onChange={(e) => setBulletEdit({ i: bulletEdit.i, draft: e.target.value })}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commitBullet}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitBullet(); } else if (e.key === "Escape") { e.preventDefault(); setBulletEdit(null); } }}
          rows={Math.max(1, bulletEdit.draft.split("\n").length)}
          style={{ width: "100%", boxSizing: "border-box", resize: "none", fontFamily: "inherit", fontSize: 15.5 * s, fontWeight: 600, color: PAPER.inkMuted, marginTop: 8 * s, background: "rgba(0,0,0,0.05)", border: `1px solid ${NEON.cyan}`, borderRadius: 6 * s, padding: `${4 * s}px ${6 * s}px`, outline: "none" }} />
      )}
      {stemEditing ? (
        <textarea
          autoFocus
          className="nodrag"
          value={stemDraft}
          onChange={(e) => setStemDraft(e.target.value)}
          onPointerDown={(e) => e.stopPropagation()}
          onBlur={commitStemEdit}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitStemEdit(); } else if (e.key === "Escape") { e.preventDefault(); setStemEditing(false); } }}
          rows={Math.max(2, stemDraft.split("\n").length)}
          style={{ width: "100%", boxSizing: "border-box", resize: "none", fontFamily: "inherit", fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 * s, background: "rgba(0,0,0,0.05)", border: `1px solid ${NEON.cyan}`, borderRadius: 8 * s, padding: `${6 * s}px ${8 * s}px`, outline: "none" }}
        />
      ) : isCallout ? null : (
        <div
          onDragOver={film ? undefined : (e) => { if (e.dataTransfer.types.includes(MEMO_DND)) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } }}
          onDrop={film ? undefined : (e) => { const mid = e.dataTransfer.getData(MEMO_DND); if (mid) { e.preventDefault(); attachMemo("__stem__", mid); } }}
          ref={stemRef}
          onClick={film ? (e) => { if (e.altKey || inert) return; const sel = (e.currentTarget.ownerDocument.defaultView ?? window).getSelection(); if (sel && !sel.isCollapsed) return; prLive.select?.(-1); } : undefined}
          onMouseDown={film ? () => setStemSel(null) : undefined}
          onMouseUp={film ? readStemSelection : undefined}
          onDoubleClick={canEditStem ? (e) => { e.stopPropagation(); startStemEdit(); } : undefined}
          title={canEditStem ? "Double-click to edit the question" : undefined}
          style={{ fontSize: 24 * s, fontWeight: 800, lineHeight: 1.25, color: PAPER.ink, marginBottom: 12 * s, whiteSpace: "pre-wrap", ...(film ? { userSelect: "text", WebkitUserSelect: "text", cursor: "text" } : canEditStem ? { cursor: "text" } : {}) }}
        >
          {stemSel && stemSel.a < stemPlain.length ? (<>{stemPlain.slice(0, stemSel.a)}<span className="sa-sel-emph">{stemPlain.slice(stemSel.a, stemSel.b)}</span>{stemPlain.slice(stemSel.b)}</>) : renderInline(d.stem || "Question")}
        </div>
      )}
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
              data-spot-lit={spState === "spot" ? "on" : undefined}
              onPointerDownCapture={(e) => spot.onClick(key, e)}
              onClick={film ? (e) => { if (e.altKey || inert) return; e.stopPropagation(); prLive.select?.(i); } : (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) return; onViewChoice?.(i); }}
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
function MemoPreviewNode({ id, data, selected, dragging }: NodeProps) {
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
  // TWO-FACED DRAG (Lee) — while DRAGGING a memo across the CEQ card's edge, the part OVER
  // the card stays opaque (pops out) and the OVERHANG fades to transparent with a soft
  // blurred seam, so the memo "melts into" the card. On drop it clears (fully opaque =
  // "persist as the background version"). A cross-window `[data-ceq-card]` rect drives it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [twoFace, setTwoFace] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!dragging || slotOff) { setTwoFace(undefined); return; }
    let raf = 0, alive = true;
    const F = 7; // feather (%) → the blurred seam
    const measure = () => {
      const el = wrapRef.current; const card = el?.ownerDocument.querySelector("[data-ceq-card]") as HTMLElement | null;
      if (!el || !card) { setTwoFace((m) => (m ? undefined : m)); return; }
      const m = el.getBoundingClientRect(), c = card.getBoundingClientRect();
      if (!(m.left < c.right && m.right > c.left && m.top < c.bottom && m.bottom > c.top)) { setTwoFace((x) => (x ? undefined : x)); return; }
      const oR = m.right - c.right, oL = c.left - m.left, oB = m.bottom - c.bottom, oT = c.top - m.top, mx = Math.max(oR, oL, oB, oT);
      if (mx <= 1 || m.width < 1 || m.height < 1) { setTwoFace((x) => (x ? undefined : x)); return; } // fully inside → fully opaque
      let g: string;
      if (mx === oR) { const p = ((c.right - m.left) / m.width) * 100; g = `linear-gradient(to right, #000 0%, #000 ${(p - F).toFixed(1)}%, transparent ${(p + F).toFixed(1)}%, transparent 100%)`; }
      else if (mx === oL) { const p = ((c.left - m.left) / m.width) * 100; g = `linear-gradient(to right, transparent 0%, transparent ${(p - F).toFixed(1)}%, #000 ${(p + F).toFixed(1)}%, #000 100%)`; }
      else if (mx === oB) { const p = ((c.bottom - m.top) / m.height) * 100; g = `linear-gradient(to bottom, #000 0%, #000 ${(p - F).toFixed(1)}%, transparent ${(p + F).toFixed(1)}%, transparent 100%)`; }
      else { const p = ((c.top - m.top) / m.height) * 100; g = `linear-gradient(to bottom, transparent 0%, transparent ${(p - F).toFixed(1)}%, #000 ${(p + F).toFixed(1)}%, #000 100%)`; }
      setTwoFace((x) => (x === g ? x : g));
    };
    const loop = () => { if (!alive) return; measure(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => { alive = false; if (raf) cancelAnimationFrame(raf); setTwoFace(undefined); };
  }, [dragging, slotOff]);
  // TEXT-SELECTION EMPHASIS (Lee) — highlight text in a memo → it goes BOLD + amber (and
  // BIGGER when the memo is spotlit), and STAYS lit after you release ("click-hold to keep
  // it spotlighted"). React-safe: we capture the selection's char range and re-render the
  // label as [before][<b>selected</b>][after] — no manual DOM mutation of the teaching text.
  const labelRef = useRef<HTMLDivElement>(null);
  const [selEmph, setSelEmph] = useState<{ a: number; b: number } | null>(null);
  // The highlight-to-bold tool is a FILM-ONLY teaching gesture. In authoring, drag-
  // selecting text on a memo must NOT emphasise it (Lee is trying to edit) — so this is
  // gated to film. Authoring gets inline editing instead (double-click, below).
  const readSelection = () => {
    if (!film) return;
    const el = labelRef.current; const win = el?.ownerDocument.defaultView; const sel = win?.getSelection();
    if (!el || !sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    if (!el.contains(r.commonAncestorContainer)) return; // selection isn't in this memo
    const pre = r.cloneRange(); pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
    const a = pre.toString().length, b = a + r.toString().length;
    if (b > a) setSelEmph({ a, b });
  };
  // INLINE MEMO EDIT (authoring) — double-click the text to edit it; the commit ripples
  // to the library + every CEQ that chains this memo (MemoEditContext → renameMemoEverywhere).
  // Shift+Enter inserts a line break; plain Enter commits; Escape cancels.
  const editMemo = useContext(MemoEditContext);
  const canEdit = !film && !slotOff && !!editMemo;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const startEdit = () => { if (!canEdit) return; setDraft(d.label ?? ""); setEditing(true); };
  const commitEdit = () => { editMemo?.(id, draft); setEditing(false); };
  const lbl = d.label ?? "";
  return (
    <div
      className={`sa-pv-node${film && walked ? " sa-memo-in" : ""}${selected ? " sa-msel" : ""}`}
      onAnimationEnd={(ev) => { if (ev.animationName === "sa-memo-in") (ev.currentTarget as HTMLElement).style.willChange = "auto"; }}
      data-flame={flamed ? "on" : undefined}
      data-flame-tone={flamed ? spot.tone(key) : undefined}
      data-spot-lit={spState === "spot" ? "on" : undefined}
      ref={wrapRef}
      onPointerDownCapture={(e) => { if (!editing) spot.onClick(key, e); }}
      // SPOTLIT MEMO POPS IN ITS OWN NAVY (Lee) — spotStyle paints a spotlit target with
      // var(--spot-bg): a choice inherits the card's PAPER so it pops in the card material,
      // but a memo isn't inside a card, so it fell back to a translucent gold wash and read
      // see-through over the CEQ card. Give the memo its own lifted navy here so a spotlit
      // memo stays OPAQUE and pops out above the paper card (gold rail + glow + lift do the rest).
      style={{ ["--spot-bg" as string]: "#382B0C", boxShadow: selected ? (film ? "0 0 0 1.5px rgba(79,163,227,0.35)" : "0 0 0 2px rgba(79,163,227,0.8)") : undefined, position: "relative", width: 210 * s, borderRadius: 12 * s, background: slotOff ? "transparent" : NEON.panelSolid, border: `${1.5 * s}px ${slotOff ? "dashed" : "solid"} ${slotOff ? NEON.borderSoft : walked ? NEON.yellow : NEON.borderSoft}`, opacity: (slotOff ? 0.3 : walked ? 1 : film ? 0 : 0.4) * (spot.any() && !spState ? 0.5 : 1), filter: slotOff || walked || film ? undefined : "grayscale(1)", transition: "opacity 200ms, filter 200ms, border-color 200ms", cursor: "default", maskImage: twoFace, WebkitMaskImage: twoFace, ...containSpot(spState, true) }}
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
        {editing ? (
          <textarea
            autoFocus
            className="nodrag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              e.stopPropagation(); // never let memo-edit keys reach the canvas hotkeys
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitEdit(); }
              else if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
              // Shift+Enter falls through → the textarea inserts a newline.
            }}
            rows={Math.max(2, draft.split("\n").length)}
            style={{ width: "100%", boxSizing: "border-box", resize: "none", fontFamily: BRAND_DISPLAY, fontWeight: 500, fontSize: 14 * s, color: NEON.text, lineHeight: 1.28, background: "rgba(0,0,0,0.35)", border: `1px solid ${NEON.cyan}`, borderRadius: 6 * s, padding: `${4 * s}px ${6 * s}px`, outline: "none" }}
          />
        ) : (
          <div ref={labelRef} onMouseDown={film ? () => setSelEmph(null) : undefined} onMouseUp={film ? readSelection : undefined} onDoubleClick={canEdit ? (e) => { e.stopPropagation(); startEdit(); } : undefined} title={canEdit ? "Double-click to edit — updates this memo everywhere it's used (Shift+Enter for a line break)" : undefined} style={{ fontFamily: BRAND_DISPLAY, fontWeight: 500, fontSize: 14 * s, color: NEON.text, lineHeight: 1.28, whiteSpace: "pre-wrap" }}>
            {selEmph && selEmph.a < lbl.length ? (<>{lbl.slice(0, selEmph.a)}<span className={`sa-sel-emph${spState ? " sa-sel-emph-spot" : ""}`}>{lbl.slice(selEmph.a, selEmph.b)}</span>{lbl.slice(selEmph.b)}</>) : lbl}
          </div>
        )}
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
  const HEAD = 30, HALF = 14;                               // long + broad = thick but pointy (meatier, Lee)
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
// STAGED ELEMENTS (Add menu): the REAL card components join the previewer's own node
// types, so an element laid over a question renders through the exact same code path
// as on canvas — and therefore films identically. Their edits are routed to the main
// canvas by the CardWriteCtx bridge below (without it they'd patch the previewer's
// throwaway nodes and vanish on the next re-seed).
const nodeTypes = { frameBg: FrameBgNode, ceqPreview: CeqPreviewNode, memoPreview: MemoPreviewNode, ovCeq: OverviewCeqNode, ovMemo: OvMemoNode, arrowEnd: ArrowEndNode, ...STAGE_NODE_TYPES };
const EMPTY_SPOTS: SpotSets = { regular: new Set(), superKey: null, superTone: "focus" };

/** PERFORMANCE ARROWS (Lee) — a freehand pointer layer OVER the pane, for live use on
 *  camera (never authored/persisted to the scene). ALT+drag pulls a meaty arrow from the
 *  press point to the cursor and vanishes on release; SHIFT+ALT+drag PERSISTS it. A
 *  persisted arrow is click-to-select + Delete, and ` clears them all. Coords are stored
 *  as FRACTIONS of the pane, so the same arrow renders in both the inline + film panes.
 *  It's a plain SVG driven by explicit state — clearing the state leaves ZERO remnants
 *  (no lingering React Flow nodes). The layer only intercepts pointers while ALT (no Ctrl,
 *  so it never fights the Ctrl-spotlight) is held; otherwise it's click-through. */
type PerfArrow = { id: string; x1: number; y1: number; x2: number; y2: number };
function PerfArrowLayer({ arrows, add, sel, setSel }: { arrows: PerfArrow[]; add: (a: Omit<PerfArrow, "id">) => void; sel: string | null; setSel: (id: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [armed, setArmed] = useState(false);
  const [draw, setDraw] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  // TAP-TAP MODE (Lee): first Alt+click anchors, the preview follows the cursor
  // while Alt stays down, the second Alt+click sets the arrow. Releasing Alt
  // cancels the pending anchor.
  const pendingRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); };
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const doc = ref.current?.ownerDocument ?? document;
    const win = doc.defaultView ?? window;
    const kd = (e: KeyboardEvent) => setArmed(e.altKey && !e.ctrlKey && !e.metaKey);
    const ku = (e: KeyboardEvent) => { if (!e.altKey) { setArmed(false); pendingRef.current = null; setDraw(null); } }; // Alt up = disarm + cancel any pending anchor
    const blur = () => setArmed(false);
    doc.addEventListener("keydown", kd); doc.addEventListener("keyup", ku); win.addEventListener("blur", blur);
    return () => { doc.removeEventListener("keydown", kd); doc.removeEventListener("keyup", ku); win.removeEventListener("blur", blur); };
  }, []);
  const frac = (cx: number, cy: number) => { const r = ref.current?.getBoundingClientRect(); return r ? { x: (cx - r.left) / (r.width || 1), y: (cy - r.top) / (r.height || 1) } : { x: 0, y: 0 }; };
  // TWO WAYS, ONE RESULT (Lee, arrow rework): (1) Alt+DRAG — the arrow extends
  // from the press point in real time and PERSISTS on release. (2) Alt+CLICK a
  // point, keep Alt held, Alt+CLICK another — the arrow sets between them. Every
  // set arrow persists; select+Delete removes one, ` clears all. (Shift no
  // longer means anything here — persistence is the default, not a mode.)
  const CLICK_EPS = 0.012; // under this movement a press counts as a click
  const onDown = (e: React.PointerEvent) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopPropagation();
    const p = frac(e.clientX, e.clientY);
    const pending = pendingRef.current;
    if (pending) {
      // second tap of tap-tap mode: set the arrow between the two points
      if (Math.hypot(p.x - pending.x, p.y - pending.y) > CLICK_EPS) add({ x1: pending.x, y1: pending.y, x2: p.x, y2: p.y });
      pendingRef.current = null; setDraw(null);
      return;
    }
    setDraw({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    const move = (ev: PointerEvent) => { const q = frac(ev.clientX, ev.clientY); setDraw((d) => (d ? { ...d, x2: q.x, y2: q.y } : d)); };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      const q = frac(ev.clientX, ev.clientY);
      const moved = Math.hypot(q.x - p.x, q.y - p.y) > CLICK_EPS;
      if (moved) { add({ x1: p.x, y1: p.y, x2: q.x, y2: q.y }); setDraw(null); }
      else { pendingRef.current = p; setDraw({ x1: p.x, y1: p.y, x2: p.x, y2: p.y }); } // enter tap-tap mode
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  // while a tap-tap anchor is pending, the preview tracks the cursor
  const onHover = (e: React.PointerEvent) => {
    const pending = pendingRef.current; if (!pending) return;
    const q = frac(e.clientX, e.clientY);
    setDraw({ x1: pending.x, y1: pending.y, x2: q.x, y2: q.y });
  };
  const { w, h } = size;
  const geom = (a: { x1: number; y1: number; x2: number; y2: number }) => {
    const x1 = a.x1 * w, y1 = a.y1 * h, x2 = a.x2 * w, y2 = a.y2 * h;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
    const HEAD = 30, HALF = 15, bx = x2 - ux * HEAD, by = y2 - uy * HEAD, px = -uy, py = ux;
    return { line: `M ${x1} ${y1} L ${bx} ${by}`, head: `M ${x2} ${y2} L ${bx + px * HALF} ${by + py * HALF} L ${bx - px * HALF} ${by - py * HALF} Z`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
  };
  const COL = "#FCA311";
  return (
    <div ref={ref} onPointerDown={onDown} onPointerMove={onHover} style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: armed ? "auto" : "none", cursor: armed ? "crosshair" : "default" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {arrows.map((a) => { const g = geom(a); const on = sel === a.id; return (
          <g key={a.id}>
            <path d={g.line} stroke={COL} strokeWidth={on ? 10 : 8} strokeLinecap="round" fill="none" style={{ pointerEvents: armed ? "none" : "stroke", cursor: "pointer", filter: on ? "drop-shadow(0 0 6px rgba(252,163,17,0.8))" : undefined }} onPointerDown={(ev) => { if (armed) return; ev.stopPropagation(); setSel(on ? null : a.id); }} />
            <path d={g.head} fill={COL} stroke={COL} strokeWidth={2} strokeLinejoin="round" style={{ pointerEvents: "none" }} />
            {on && <circle cx={g.mx} cy={g.my} r={5} fill="#fff" stroke={COL} strokeWidth={2} style={{ pointerEvents: "none" }} />}
          </g>
        ); })}
        {draw && (() => { const g = geom(draw); return (<g><path d={g.line} stroke={COL} strokeWidth={8} strokeLinecap="round" fill="none" opacity={0.92} /><path d={g.head} fill={COL} /></g>); })()}
      </svg>
    </div>
  );
}


function Inner({ transportLeft, transportRight, ceqId, mainRf, mainSig, frameW, frameH, chainEdges, baseline, world, worldIntensity, worldMotion, deckCeqIds, counterIds, stageSig, layoutMode, onSaveBaseline, onSaveInstance, onReorderChainMemo, layoutOn, onSetLayoutMode, onApplyLayoutToAll, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onRenameMemo, onEditStem, onDuplicateMemo, onSetMemoCategory, onDeleteMemo, onSetMisconception, misconceptionSlugs, onNextQuestion, onPrevQuestion, showProgress, onSetShowProgress, onOpenMemoLib, topicName, recording, bossAutoArm, onEditLayout, onSelectStageEl, onExitRecording }: { transportLeft?: ReactNode; transportRight?: ReactNode; ceqId: string; mainRf: MainRf; mainSig: string; frameW: number; frameH: number; chainEdges: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; counterIds?: string[]; stageSig?: string; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSaveInstance?: (g: CeqInstanceGeom) => void; onReorderChainMemo?: (memoNodeId: string, dir: -1 | 1) => void; layoutOn?: boolean; onSetLayoutMode?: (on: boolean) => void; onApplyLayoutToAll?: () => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onRenameMemo?: (memoNodeId: string, label: string) => void; onEditStem?: (ceqId: string, text: string) => void; onDuplicateMemo?: (memoNodeId: string) => void; onSetMemoCategory?: (memoNodeIds: string[], category: string) => void; onSetMisconception?: (memoNodeIds: string[], slug: string | null) => void; misconceptionSlugs?: string[]; onDeleteMemo?: (memoNodeIds: string[]) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void; showProgress?: boolean; onSetShowProgress?: (b: boolean) => void; onOpenMemoLib?: (id: string) => void; topicName?: string; recording?: boolean; bossAutoArm?: boolean; onEditLayout?: () => void; onSelectStageEl?: (id: string | null) => void; onExitRecording?: () => void }) {
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
    // STEM CHAIN (P2) — question-level memos come FIRST in the walk, always
    // earlier than any choice chain. choiceIdx -1 = the stem pseudo-choice:
    // never "resolved" (there's nothing to answer), revealed purely by shown(-1).
    (cd?.stemChain ?? []).forEach((it, p) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: "Q", choiceIdx: -1, choiceId: "__stem__", chainPos: p, num: list.length + 1, hideChoiceLabel: it.hideChoiceLabel, hideArrow: it.hideArrow, sound: it.sound, arrow: it.arrow }));
    (cd?.choices ?? []).forEach((ch, ci) => (ch.chain ?? []).forEach((it, p) => list.push({ memoNodeId: it.memoNodeId, label: it.label, choice: LETTER(ci), choiceIdx: ci, choiceId: ch.id ?? "", chainPos: p, num: list.length + 1, hideChoiceLabel: it.hideChoiceLabel, hideArrow: it.hideArrow, sound: it.sound, arrow: it.arrow })));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainSig, layoutMode, rack]);

  // ---- PRACTICE (local; never touches the real CEQ) ------------------------
  // BOSS MOMENT (P3): film-local presentation state — NEVER saved. Alt+Click
  // toggles; a BOSS-flagged CEQ auto-arms when the per-set setting is on.
  const [bossOn, setBossOn] = useState(false);
  useEffect(() => { setBossOn(!!(bossAutoArm && (cd as { boss?: boolean } | undefined)?.boss)); // eslint-disable-line react-hooks/exhaustive-deps
  }, [ceqId, bossAutoArm]);
  const [emph, setEmph] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Set<number>>(new Set());
  const [shown, setShown] = useState<Map<number, number>>(new Map());
  // ---- REHEARSAL SPOTLIGHT (local; never touches the real global spotlight) --
  const [spots, setSpots] = useState<SpotSets>(EMPTY_SPOTS);
  // PERFORMANCE ARROWS (Lee) — freehand live-pointer arrows, session-only (never saved).
  const [perfArrows, setPerfArrows] = useState<PerfArrow[]>([]);
  const [selPerf, setSelPerf] = useState<string | null>(null);
  const addPerfArrow = (a: Omit<PerfArrow, "id">) => setPerfArrows((p) => [...p, { ...a, id: `pa${p.length}_${Math.round(a.x2 * 99991)}_${Math.round(a.y2 * 9973)}` }]);
  const [selEdgeIds, setSelEdgeIds] = useState<Set<string>>(new Set());
  // VERTICAL OVERVIEW (Lee) — render every question as its own frame stacked vertically
  // so you can zoom out to see them all + click to navigate. The ACTIVE question keeps
  // the full live rig; the others are static clickable cards. Off ⇒ the focused single
  // frame (unchanged). Needs the deck's ordered ceq ids (deckCeqIds).
  // VIEW MENU (frames rename §4) — one dropdown replaces the STUDENT / GUIDES /
  // LAYOUT ON / OVERVIEW button pile + the world select. View choices persist PER
  // USER (localStorage), not per set; the world stays per-set (it's set content).
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [viewStudent, setViewStudentRaw] = useState<boolean>(() => { try { return localStorage.getItem("sa-view-student") !== "0"; } catch { return true; } });
  const setViewStudent = (v: boolean) => { setViewStudentRaw(v); try { localStorage.setItem("sa-view-student", v ? "1" : "0"); } catch { /* ignore */ } };
  const [overview, setOverviewRaw] = useState<boolean>(() => { try { return localStorage.getItem("sa-view-overview") === "1"; } catch { return false; } });
  const setOverview = (fn: boolean | ((v: boolean) => boolean)) => setOverviewRaw((v) => { const nv = typeof fn === "function" ? fn(v) : fn; try { localStorage.setItem("sa-view-overview", nv ? "1" : "0"); } catch { /* ignore */ } return nv; });
  // Where the ACTIVE id sits in the deck order. -1 = it isn't one of the deck's
  // questions at all (Question 0's layout stage), so it has no slot in the vertical
  // stack — and a stack built around it would draw the deck's questions straight
  // through it. Whenever the active id isn't a member, overview is simply off and
  // the single-frame render stands alone.
  /** CALLOUT (P1): resolve dropped-memo ids to display labels once, main-store side. */
  const calloutMemosOf = (c: CeqCard | undefined) => (c?.callout?.memoIds ?? []).map((mid) => {
    const md = mainRf.getNode(mid)?.data as { label?: string; title?: string; category?: string } | undefined;
    return { label: md?.label ?? md?.title ?? "Memo", category: md?.category };
  });
  const activeIdx = deckCeqIds ? deckCeqIds.indexOf(ceqId) : -1;
  // `!recording`: on the recording surface the FILM STACK (A2) owns the vertical
  // stack — overview's ov: stand-ins would double-render under the real ones.
  const overviewOn = overview && !recording && !!deckCeqIds && deckCeqIds.length > 1 && activeIdx >= 0;
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
  // (Declared here, used by the film block far below: activeYOff needs to know
  //  whether the film popout is open.)
  const [filmWin, setFilmWin] = useState<Window | null>(null);
  // FILM STACK (A2, spacewalk-preload): on a filming surface (the "\" popout, or
  // the recording surface Rehearse mounts) the WHOLE set is mounted — every frame
  // full-fidelity at its own slot in the vertical stack — and the space-walk is a
  // pan + data-flip instead of a node re-seed. The re-seed was the on-camera
  // flash: the old card unmounted instantly while the new one faded in from
  // opacity 0, so the frame read EMPTY for the first beats of every transition,
  // and heavy frames (images, fonts in the popout's own document) fetched at
  // transition time. Now everything mounts ONCE, behind the preparing gate.
  const filmStack = (!!filmWin || recording) && !!deckCeqIds && deckCeqIds.length > 1 && activeIdx >= 0;
  // The active frame's vertical offset in the stack (0 outside overview/film). Node
  // positions carry it; the baseline is FRAME-LOCAL, so persistence subtracts it back off.
  const activeYOff = useMemo(() => (overviewOn || filmStack ? activeIdx * (frameH + Math.round(frameH * 0.16)) : 0), [overviewOn, filmStack, activeIdx, frameH]);
  // BOSS test cue (Lee): hear the cram-launch when you ADVANCE to a boss-flagged CEQ
  // in the previewer (not on the first open). Read the flag fresh from the main store.
  // HARD PUSH (#4) — PageDown/PageUp deal with a DISTINCT fast vertical push (vs the Space
  // walk's slide-fade) and support hold-to-repeat. `dealAnim` picks the card entrance;
  // `repeatFiringRef` silences per-card sounds during a HELD repeat (single presses still
  // sound); `holdRef` owns the timers; `navRef` keeps the deal callbacks fresh so a held
  // interval always advances from the CURRENT question (the key effect re-binds every render).
  const [dealAnim, setDealAnim] = useState<"in" | "pushDown" | "pushUp">("in");
  const repeatFiringRef = useRef(false);
  const holdRef = useRef<{ delay?: number; interval?: number; win: Window } | null>(null);
  const navRef = useRef<{ next?: () => void; prev?: () => void }>({ next: onNextQuestion, prev: onPrevQuestion });
  navRef.current.next = onNextQuestion; navRef.current.prev = onPrevQuestion;
  const pushDeal = (dir: 1 | -1, silent: boolean) => {
    setDealAnim(dir === 1 ? "pushDown" : "pushUp");
    repeatFiringRef.current = silent; // silent = a held auto-repeat fire → no per-card sound
    if (dir === 1) navRef.current.next?.(); else navRef.current.prev?.();
  };
  const clearHold = () => {
    const h = holdRef.current; if (!h) return;
    if (h.delay) h.win.clearTimeout(h.delay);
    if (h.interval) h.win.clearInterval(h.interval);
    holdRef.current = null;
    repeatFiringRef.current = false;
  };
  // First press deals once WITH sound; hold 400ms, then repeat every 90ms (SILENT) so a held
  // Page key rips the set in ~1s for the tease shot. gotoQuestion clamps at both ends (no
  // wrap), so at a boundary the repeats simply no-op — it stops, never loops.
  const startHold = (dir: 1 | -1, win: Window) => {
    clearHold();
    pushDeal(dir, false);
    holdRef.current = { win };
    holdRef.current.delay = win.setTimeout(() => {
      if (!holdRef.current) return;
      holdRef.current.interval = win.setInterval(() => pushDeal(dir, true), 90);
    }, 400);
  };
  const bossArmed = useRef(false);
  useEffect(() => {
    setEmph(null); setResolved(new Set()); setShown(new Map()); setSpots(EMPTY_SPOTS); // BLANK on open / question change
    // Suppress the boss cram-launch cue during a HELD repeat (single discrete deals still sound).
    if (bossArmed.current && !repeatFiringRef.current && !!(mainRf.getNode(ceqId)?.data as { boss?: boolean } | undefined)?.boss) playSfx("cramLaunch");
    bossArmed.current = true;
  }, [ceqId, mainRf]);
  // Stop any hold-to-repeat on UNMOUNT only — the main key effect re-runs every render, so it
  // must NOT clear these timers; only a true unmount and keyup do.
  useEffect(() => () => clearHold(), []); // eslint-disable-line react-hooks/exhaustive-deps
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
  // ELEMENT NAVIGATION (P3): arrows (and clicks) move the SELECTION across the
  // CEQ's elements — the stem (-1) first, then the choices, wrapping. Tab is the
  // walk now (Lee's sheets muscle memory), so navigation belongs to arrows/clicks;
  // neither is required — they're equals.
  const elemNav = (dir: 1 | -1) => setEmph((e) => {
    if (nChoices === 0) return (cd?.stemChain?.length ?? 0) > 0 ? -1 : e;
    const lo = -1, hi = nChoices - 1;
    if (e == null) return dir > 0 ? lo : hi;
    const next = e + dir;
    return next < lo ? hi : next > hi ? lo : next;
  });
  const advance = () => { // Enter — resolve the emphasised choice, then walk its chain
    // STEM CHAIN (P2): question-level memos drain FIRST — Lee can spacewalk on
    // the question itself (setup / context / distractor tease) before choices.
    const stemLen = cd?.stemChain?.length ?? 0;
    const stemShown = shown.get(-1) ?? 0;
    if ((emph == null || emph === -1) && stemLen > 0 && stemShown < stemLen) {
      setShown((s) => new Map(s).set(-1, stemShown + 1));
      const sit = cd?.stemChain?.[stemShown]; if (sit?.sound && sit.sound !== "vinylScratch") { const snd = sit.sound; window.setTimeout(() => playSfx(snd), 200); }
      return;
    }
    if (emph === -1) return; // stem selected + drained: Tab has nothing left here
    const e = emph == null ? 0 : emph;
    if (emph == null) setEmph(0);
    if (!resolved.has(e)) {
      setResolved((r) => new Set(r).add(e)); setShown((s) => new Map(s).set(e, 0));
      // RESOLVE SFX (Lee): correct → chaching; WRONG → a record scratch, fired on this
      // same resolve so it lands WITH the strikethrough (st="wrong" renders now). playSfx
      // respects the global mute. The vinyl is no longer a memo-reveal sound.
      if (cd?.choices[e]?.correct) { if (cd?.confirmSfx !== false) playSfx("chaching"); }
      else if (cd?.choices[e]) playSfx("vinylScratch");
    } else {
      const cur = shown.get(e) ?? 0;
      if (cur < chainLenOf(e)) {
        setShown((s) => new Map(s).set(e, cur + 1));
        const it = cd?.choices[e]?.chain?.[cur]; if (it?.sound && it.sound !== "vinylScratch") { const snd = it.sound; window.setTimeout(() => playSfx(snd), 200); } // per-chain-item reveal sound — fire at SETTLE (~200ms) as the memo arrives. Vinyl is EXCLUDED (Lee): it's now the wrong-answer cue, not a memo-reveal sound.
      }
    }
  };
  const retreat = () => { // Shift+Enter
    if (emph == null || emph === -1) { const ss = shown.get(-1) ?? 0; if (ss > 0) setShown((s) => new Map(s).set(-1, ss - 1)); return; }
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
  const walkRevealedIds = useMemo(() => { const set = new Set<string>(); for (const w of walk) if ((w.choiceIdx === -1 || resolved.has(w.choiceIdx)) && w.chainPos < (shown.get(w.choiceIdx) ?? 0)) set.add(w.memoNodeId); return set; }, [walk, resolved, shown]);
  // AUTHORING view — the Arrows toggle (and Q0) light everything so Lee can check
  // alignment without walking. Deliberately NOT given to the film subtree: an
  // authoring aid must never change what a take records.
  const revealedMemoIds = useMemo(() => {
    // Exclusive view wins in AUTHORING only — it is a way of looking at one chain, not
    // a change to the walk. Film reads walkRevealedIds and is unaffected.
    if (viewChoice != null) return new Set<string>(walk.filter((w) => w.choiceIdx === viewChoice).map((w) => w.memoNodeId));
    return showAll || layoutMode ? new Set<string>(walk.map((w) => w.memoNodeId)) : walkRevealedIds;
  }, [walk, showAll, layoutMode, walkRevealedIds, viewChoice]);

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
    const cs = resolveCardSpot(layoutMode ? undefined : cd?.geom, layoutMode ? baseline : templateFor(cd?.ignoreLayout, baseline), frameW, frameH);
    // qNum = this question's DECK position (what the Studio rows and take filenames
    // use). Q0/layout is not in deckCeqIds → 0 → the overlay doesn't render.
    const qNum = layoutMode ? 0 : Math.max(0, (deckCeqIds?.indexOf(ceqId) ?? -1) + 1);
    const frameNode = { id: "__frame__", type: "frameBg", position: { x: 0, y: yOff }, data: { w: frameW, h: frameH, world, worldIntensity, worldMotion, qNum, guides: recording ? false : guidesOn }, draggable: false, selectable: false, zIndex: -10 };
    // STUDENT OVERLAY (Lee) — filmed on the card, one toggle (showProgress):
    //   "X of Y" over the deck order + a fill bar, and the TOPIC name kicker
    //   (name only, no chapter number — Lee's call). Never on the Q0 stage.
    // Student chrome is a PER-USER view choice now (View menu) — deck.showProgress
    // stays in the data but no longer drives this surface.
    const student = viewStudent && !layoutMode;
    // NOTE FRAMES (frames rename §3): the counter counts CEQ frames ONLY — counterIds
    // is the deck order minus notes, so "Q 14/29" skips them; a note frame itself gets
    // the topic kicker but no count (it's breath, not a question).
    const cIds = counterIds ?? deckCeqIds;
    const pIdx = cIds?.indexOf(ceqId) ?? -1;
    const pTot = cIds?.length ?? 0;
    const progress = student && pIdx >= 0 && pTot > 1 ? { x: pIdx + 1, y: pTot } : null;
    const topic = student && topicName ? topicName : null;
    // Card entrance: Space walk = slide-fade (sa-ceq-in); PageDown/PageUp = the HARD PUSH.
    // Reduced-motion → instant (no animation) EXCEPT while recording — a filming surface must
    // always move (#3), so the reduced-motion check is skipped when recording.
    const reduceMotion = !recording && typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const enterAnimName = dealAnim === "pushDown" ? "sa-ceq-push-down" : dealAnim === "pushUp" ? "sa-ceq-push-up" : "sa-ceq-in";
    const enterAnim = reduceMotion ? "none"
      : dealAnim === "pushDown" || dealAnim === "pushUp" ? `${enterAnimName} 180ms cubic-bezier(0.16,1,0.3,1) both`
      : "sa-ceq-in 300ms cubic-bezier(0.22,1,0.36,1) both, sa-ceq-edge 460ms ease-out both";
    const ceqNode = { id: ceqId, type: "ceqPreview", position: { x: cs.x, y: yOff + cs.y }, data: { stem: cd.prompt, choices: cd.choices, scale: cs.scale, layoutBadge: layoutMode, progress, topic, enterAnim, enterAnimName, callout: cd.callout, calloutMemos: calloutMemosOf(cd) }, draggable: true, zIndex: 1 };
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
        : resolveMemoSpot(cd?.geom, templateFor(cd?.ignoreLayout, baseline), slotIdx, frameW, frameH);
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
    // STAGED ELEMENTS (Add menu) — every card whose data.stage points at THIS question,
    // rendered by its real component at its frame-local spot. `hidden` elements are
    // authored-but-not-on-camera: ghosted here, absent in film so a take never shows
    // one Lee hasn't revealed. zIndex 8 puts them above memos (they're the backdrop
    // Lee talks over) but below the arrow heads.
    const stageNodes = (mainRf.getNodes() as { id: string; data?: unknown }[])
      .filter((n) => {
        const st = (n.data as { stage?: { ceqId?: string } } | undefined)?.stage;
        return !!st && st.ceqId === ceqId;
      })
      .map((n) => {
        const dd = n.data as unknown as { kind: string; stage: { x: number; y: number; scale: number; hidden?: boolean } };
        return {
          id: n.id,
          type: stageNodeType(dd.kind),
          position: { x: dd.stage.x, y: yOff + dd.stage.y },
          data: n.data,
          draggable: true,
          zIndex: 8,
          style: dd.stage.hidden ? { opacity: 0.28, filter: "saturate(0.35)" } : undefined,
        };
      });
    const active = [frameNode, ceqNode, ...memoNodes, ...arrowNodes, ...stageNodes];
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
      const ocs = resolveCardSpot(od?.geom, templateFor(od?.ignoreLayout, baseline), frameW, frameH);
      others.push({ id: `ov:${qid}`, type: "ovCeq", position: { x: ocs.x, y: y + ocs.y }, data: { qid, num: k + 1, stem: od?.prompt ?? "", choices: od?.choices ?? [], scale: ocs.scale }, draggable: false, selectable: false, zIndex: 1 });
      // ALL-CHAINS: the other questions' chained memos, at their resolved instance
      // spots — static, non-interactive, ovm:-prefixed (excluded from film + save).
      let mi = 0;
      for (const ch of (od?.choices ?? [])) for (const it of (ch.chain ?? [])) {
        const sp = resolveMemoSpot(od?.geom, templateFor(od?.ignoreLayout, baseline), mi, frameW, frameH);
        others.push({ id: `ovm:${qid}:${mi}`, type: "ovMemo", position: { x: sp.x, y: y + sp.y }, data: { label: it.label, scale: sp.scale }, draggable: false, selectable: false, zIndex: 5 });
        mi++;
      }
    });
    return [...active, ...others] as typeof active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ceqId, mainSig, frameW, frameH, baseline, world, worldIntensity, worldMotion, overviewOn, deckCeqIds, counterIds, stageSig, activeYOff, layoutMode, walk, viewChoice, guidesOn, viewStudent, topicName, recording, dealAnim]);

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

  // STAGED ELEMENTS refresh on their OWN effect rather than the seed above. That seed
  // is skippable — skipSeedRef protects an in-flight drag/resize from being reset —
  // and the guard was eating the 👁 show/hide: the flag flipped on the canvas node but
  // the previewer kept its stale copy, so the ghost never appeared. This re-reads the
  // live card data + hidden flag for STAGED nodes only, so it can't disturb the CEQ
  // card, its memos or the arrows, and is therefore safe to run unconditionally.
  useEffect(() => {
    setNodes((nds) => nds.flatMap((n) => {
      if (!(n.data as { stage?: unknown } | undefined)?.stage) return [n];
      const live = mainRf.getNode(n.id)?.data as { stage?: { ceqId?: string; hidden?: boolean } } | undefined;
      // DROP a staged node that no longer belongs on this frame — deleted on the
      // canvas, or (the real bug) staged on a DIFFERENT question and left behind when
      // the seed was skipped on the frame switch. Unremoved it bleeds one question's
      // element onto the next, and would eventually leak into a take.
      if (!live?.stage || live.stage.ceqId !== ceqId) return [];
      return [{ ...n, data: live as never, style: live.stage.hidden ? { opacity: 0.28, filter: "saturate(0.35)" } : undefined }];
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageSig, ceqId, setNodes]);

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
  // (filmWin state is declared up beside activeYOff — the film stack needs it.)
  const filmFitRef = useRef<ReactFlowInstance | null>(null);
  // PREPARING GATE (A2): the popout is its OWN document — its fonts and images
  // load on first use, which used to happen at TRANSITION time. Hold a cover over
  // the pane until the whole mounted set is warm (fonts.ready + every image
  // complete + two RAFs so ReactFlow has painted), capped at 4s so a broken asset
  // can never lock the surface out.
  const [filmReady, setFilmReady] = useState(false);
  useEffect(() => {
    if (!filmWin) { setFilmReady(false); return; }
    let dead = false;
    const done = () => { if (!dead) setFilmReady(true); };
    const cap = window.setTimeout(done, 4000);
    (async () => {
      try {
        // Two RAFs first: the portal renders after open, so snapshot images late.
        await new Promise((r) => filmWin.requestAnimationFrame(() => filmWin.requestAnimationFrame(r)));
        const doc = filmWin.document;
        await (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
        const imgs = Array.from(doc.images ?? []).filter((im) => !im.complete);
        await Promise.all(imgs.map((im) => new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); })));
        await new Promise((r) => filmWin.requestAnimationFrame(() => filmWin.requestAnimationFrame(r)));
      } catch { /* the cap still lifts the gate */ }
      done();
    })();
    return () => { dead = true; window.clearTimeout(cap); };
  }, [filmWin]);
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
    // Refit the 16:9 cover on EVERY way the popout can change size. Going FULLSCREEN
    // (F11 / OS maximize) animates its layout and doesn't reliably emit a well-timed
    // `resize` — so without a fullscreenchange hook the viewport stays stale and the
    // window paints near-black (the frame is off-screen). Multi-fire over ~1s to ride
    // out the animation, plus a ResizeObserver as the reliable catch-all.
    const settle = () => { [0, 40, 240, 500, 900].forEach((ms) => window.setTimeout(fitFilm, ms)); };
    settle();
    filmWin.addEventListener("resize", settle);
    filmWin.addEventListener("focus", settle);
    const doc = filmWin.document;
    doc.addEventListener("fullscreenchange", settle);
    let ro: ResizeObserver | undefined;
    try {
      const RO = (filmWin as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
      const target = doc.documentElement ?? doc.body;
      if (RO && target) { ro = new RO(() => fitFilm()); ro.observe(target); }
    } catch { /* ResizeObserver unavailable in the popout — the listeners above still cover it */ }
    return () => {
      filmWin.removeEventListener("resize", settle);
      filmWin.removeEventListener("focus", settle);
      doc.removeEventListener("fullscreenchange", settle);
      ro?.disconnect();
    };
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
    // STAGED ELEMENTS persist on the ELEMENT itself (data.stage), not in the CEQ's
    // instance geometry — they belong to the element, can be moved in Q0 as well as
    // in a real question, and must survive a re-seed. Written straight to the main
    // canvas node so the pool autosave picks it up like any other card edit.
    for (const n of nodes) {
      const st = (n.data as { stage?: { x: number; y: number; scale: number; hidden?: boolean } } | undefined)?.stage;
      if (!st) continue;
      const nx = Math.round(n.position.x);
      const ny = Math.round(n.position.y - activeYOff);
      if (nx === Math.round(st.x) && ny === Math.round(st.y)) continue;
      const c = patchDataCmd(mainRf as unknown as RfLike, n.id, { stage: { ...st, x: nx, y: ny } }, "move element");
      if (c) bus.dispatch(c);
    }
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
    if (!guidesOn || overviewOn || recording) return null;
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
    if (w.hideArrow || !w.choiceId || w.choiceId === "__stem__" || !revealSet.has(w.memoNodeId)) return [];
    return [{
      id: `arr:${w.memoNodeId}`,
      source: `ah:${w.memoNodeId}`, sourceHandle: "s",
      target: ceqId, targetHandle: memoAnchorId(w.choiceId),
      type: "freeArrow",
      zIndex: EDGE_Z,
      data: { headAtSource: true },
      style: { stroke: "#E0284A", strokeWidth: 8.5 },
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
  // HIDDEN STAGED ELEMENTS never reach the camera: authoring ghosts them at 28% so
  // Lee can place + arrange them, film drops them entirely. That IS the show/hide.
  // FILM STAND-INS (A2): full-fidelity renders of every NON-ACTIVE frame, each at
  // its slot in the stack. The CEQ card keeps the question's REAL id, so walking
  // onto a frame flips its data (inert → live) IN PLACE — no unmount, no flash;
  // the deal-in animation still plays because enterAnim flips "none" → the walk
  // anim on the same element. Staged elements keep their real ids for the same
  // reason. Memos/arrows stay active-only (they appear on Enter anyway — an
  // undealt frame IS the base state). Deliberately NOT keyed on `walk`/practice
  // state, so a Space step never rebuilds the stack.
  const stackSlotH = frameH + Math.round(frameH * 0.16);
  const filmStandins = useMemo<Node[]>(() => {
    if (!filmStack || !deckCeqIds) return [];
    const out: Node[] = [];
    const cIds = counterIds ?? deckCeqIds;
    const allNodes = mainRf.getNodes() as { id: string; data?: unknown }[];
    deckCeqIds.forEach((qid, k) => {
      if (qid === ceqId) return; // the live render owns the active slot
      const od = mainRf.getNode(qid)?.data as unknown as CeqCard | undefined;
      if (!od) return;
      const y = k * stackSlotH;
      out.push({ id: `fbg:${qid}`, type: "frameBg", position: { x: 0, y }, data: { w: frameW, h: frameH, world, worldIntensity, worldMotion, qNum: k + 1, guides: false }, draggable: false, selectable: false, zIndex: -10 } as Node);
      // Mirror the live ceqNode's data EXACTLY (same spot resolution, same student
      // overlay) so the activation flip changes practice/animation state only —
      // identical pixels means an invisible handover.
      const ocs = resolveCardSpot(od.geom, templateFor(od.ignoreLayout, baseline), frameW, frameH);
      const pIdx = cIds.indexOf(qid);
      const progress = viewStudent && pIdx >= 0 && cIds.length > 1 ? { x: pIdx + 1, y: cIds.length } : null;
      out.push({ id: qid, type: "ceqPreview", position: { x: ocs.x, y: y + ocs.y }, data: { stem: od.prompt, choices: od.choices, scale: ocs.scale, progress, topic: viewStudent && topicName ? topicName : null, enterAnim: "none", enterAnimName: "none", inert: true, callout: od.callout, calloutMemos: calloutMemosOf(od) }, draggable: false, selectable: false, zIndex: 1 } as Node);
      for (const n of allNodes) {
        const st = (n.data as { stage?: { ceqId?: string; x: number; y: number; hidden?: boolean } } | undefined)?.stage;
        if (!st || st.ceqId !== qid || st.hidden) continue;
        out.push({ id: n.id, type: stageNodeType((n.data as { kind: string }).kind), position: { x: st.x, y: y + st.y }, data: n.data as Record<string, unknown>, draggable: false, selectable: false, zIndex: 8 } as Node);
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmStack, deckCeqIds, ceqId, mainSig, stageSig, baseline, frameW, frameH, stackSlotH, world, worldIntensity, worldMotion, viewStudent, topicName, counterIds]);
  // FILM LOCK (A1): on camera, geometry is read-only — every node is frozen except
  // arrow heads (a performance tool) and explicit data.filmMovable opt-ins. The
  // per-node flag beats the pane-level nodesDraggable, so the pane prop can stay
  // true for the nodes that ARE allowed to move.
  const filmNodes = useMemo(() => nodes
    .filter((n) => !n.id.startsWith("ov:") && !n.id.startsWith("ovf:") && !n.id.startsWith("ovm:") && !(n.data as { stage?: { hidden?: boolean } } | undefined)?.stage?.hidden)
    .map((n): Node => ({ ...n, draggable: filmDragAllowed(n) }))
    .concat(filmStandins), [nodes, filmStandins]);
  // The recording surface's merged set (rehearse): live nodes + the same stand-ins.
  const recNodes = useMemo(() => nodes.concat(filmStandins), [nodes, filmStandins]);
  const filmEdges = useMemo(() => buildEdges(walkRevealedIds), [walk, walkRevealedIds, ceqId]);
  const onConnect = (c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const id = `chn-arrow-${c.source}-${c.target}`;
    mainRf.setEdges((eds) => (eds.some((e) => e.id === id) ? eds : [...eds, { id, source: c.source!, target: c.target!, sourceHandle: c.sourceHandle ?? "l", targetHandle: c.targetHandle ?? undefined, type: "smoothstep", zIndex: EDGE_Z, style: { ...EDGE_STYLE }, markerEnd: { ...EDGE_MARKER } } as Edge]));
  };

  // PRACTICE TIMER — removed with the transport diet (§2.4). It measured a rehearsal
  // nobody timed; Rehearse mode owns run timing now. ` still resets the CEQ (below).
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
    // `filmWindow` = this event fired in the FILM POPOUT (always engaged, and —
    // FILM LOCK, A1 — the authoring branches below must never run there: Delete
    // removed real memos from film, and an arrow-key nudge went through
    // commitGeom → onSaveInstance, i.e. film sessions were WRITING geometry).
    const handle = (e: KeyboardEvent, win: Window, filmWindow: boolean) => {
      const typing = isTypingTarget(win.document) || isTypingTarget();
      // RECORDING MODE (#3) — the film-safe filming surface. While recording, the ONLY live
      // keys are the deal / walk / sweep allowlist + the exit key (R); EVERYTHING else is
      // swallowed so a stray press can never alter state mid-take. This branch runs before
      // every other one (incl. the engage gate and "\"), so it fully owns the keyboard.
      // NOTE: prefers-reduced-motion is deliberately IGNORED here — this is a filming
      // surface, not a reading surface, so transitions always play.
      if (recording) {
        if (typing) return;
        e.preventDefault(); e.stopImmediatePropagation();
        const isSpace = e.key === " " || e.code === "Space";
        if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey) { onExitRecording?.(); return; }
        if (isSpace) { setDealAnim("in"); repeatFiringRef.current = false; if (e.shiftKey) onPrevQuestion?.(); else onNextQuestion?.(); return; }
        if (e.key === "PageDown" || e.key === "PageUp") { if (!e.repeat) startHold(e.key === "PageDown" ? 1 : -1, win); return; } // hard push + hold-to-repeat (tease shot)
        if (e.key === "Enter" || e.key === "Tab") { if (e.shiftKey) retreat(); else advance(); return; } // Tab = the walk (P3)
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { elemNav(1); return; }
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { elemNav(-1); return; }
        if (e.shiftKey && (e.code === "Backquote" || e.key === "~" || e.key === "`")) { sweepMemos(); return; }
        // ` on the recording surface: the SAME full reset as every other surface
        // (backtick sweep) — practice, spotlights, arrows, perf arrows, highlights.
        // Temporary state only; nothing saved is touched.
        if (e.code === "Backquote" || e.key === "`") { resetPractice(); setSpots(EMPTY_SPOTS); resetArrows(); setPerfArrows([]); setSelPerf(null); clearExhibitHighlights(); return; }
        return; // any other key: swallowed, no-op — protects the take
      }
      // RECORDING MODE = the FILM POP-OUT. "\" toggles it open/closed — a real 2nd-monitor
      // window you can fullscreen (F11) for OBS while the Studio stays on the other screen.
      // Works with NO mouse (before the hover gate); ignored only while typing in a field.
      if (!typing && (e.key === "\\" || e.code === "Backslash")) { e.preventDefault(); e.stopImmediatePropagation(); toggleFilm(); return; }
      // (Recording Mode's R hotkey is DEPRECATED (Lee, 08-14) — the film popout "\"
      // is the one filming surface. The recording SURFACE itself survives: Rehearse
      // still mounts it via startRehearse, and exits with Esc.)
      if (!filmWindow && !engagedRef.current) return;
      if (typing) return;
      // MEMO SELECTION keys (authoring): Delete removes (in-app confirm upstream),
      // Esc clears, arrows nudge the INSTANCE geometry only (never the template).
      // Perf-arrow delete stays live in film — perf arrows are a performance tool.
      if ((e.key === "Delete" || e.key === "Backspace") && selPerf) { e.preventDefault(); e.stopImmediatePropagation(); setPerfArrows((p) => p.filter((x) => x.id !== selPerf)); setSelPerf(null); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && !filmWindow && selMemoIds.size > 0 && !layoutMode) { e.preventDefault(); e.stopImmediatePropagation(); onDeleteMemo?.([...selMemoIds]); return; }
      if (e.key === "Escape" && selMemoIds.size > 0) { e.stopImmediatePropagation(); setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n))); setSelMemoIds(new Set()); return; }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") && !filmWindow && selMemoIds.size > 0 && !layoutMode) {
        e.preventDefault(); e.stopImmediatePropagation();
        const step = e.shiftKey ? 16 : 4;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        setNodes((nds) => nds.map((n) => (selMemoIds.has(n.id) ? { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } } : n)));
        // commit on the NEXT frame so the moved positions are what commitGeom reads
        window.setTimeout(() => commitGeom(), 0);
        return;
      }
      if (e.key === "Tab") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; } // Tab = the walk (P3)
      if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
        // ELEMENT NAV (P3) — arrows select stem/choices. The authoring memo-nudge
        // (selMemoIds, gated !filmWindow) matched above; reaching here means the
        // arrows are free to navigate.
        e.preventDefault(); e.stopImmediatePropagation();
        elemNav(e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) retreat(); else advance(); return; }
      // DEAL-ADVANCE between CEQs — Space / Shift+Space, plus Page Down / Page Up as a
      // presenter-remote-friendly pair (SAME handlers, no new walk logic). Page Down = deal
      // next (like Space), Page Up = reverse (like Shift+Space); Space still respects Shift.
      if (e.key === " " || e.code === "Space") {
        e.preventDefault(); e.stopImmediatePropagation();
        setDealAnim("in"); repeatFiringRef.current = false; // Space = the slide-fade walk (unchanged)
        if (e.shiftKey) onPrevQuestion?.(); else onNextQuestion?.();
        return;
      }
      // PAGE DOWN / PAGE UP (#4) — the HARD PUSH: a distinct, faster vertical deal + hold-to-
      // repeat. Ignore the OS auto-repeat (e.repeat); startHold runs our own 400ms→90ms cadence.
      if (e.key === "PageDown" || e.key === "PageUp") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (!e.repeat) startHold(e.key === "PageDown" ? 1 : -1, win);
        return;
      }
      // ` = full reset (choices + memos). SHIFT+` = MEMO SWEEP: clear the memos off
      // the board but KEEP every choice's resolution, so a wrong answer stays struck
      // and the correct one stays green. Nothing re-resolves, so no sound re-fires.
      if (e.key === "`" || e.code === "Backquote" || (e.shiftKey && e.key === "~")) { e.preventDefault(); e.stopImmediatePropagation(); if (e.shiftKey) sweepMemos(); else { resetPractice(); setSpots(EMPTY_SPOTS); resetArrows(); setPerfArrows([]); setSelPerf(null); clearExhibitHighlights(); } return; }
    };
    const onOwnerKey = (e: KeyboardEvent) => handle(e, ownerWin, false);
    // Releasing Page Down / Page Up ends the hold-to-repeat (#4). clearHold is intentionally
    // NOT called in this effect's cleanup — the effect re-binds every render; only keyup and
    // the dedicated unmount effect stop the timers.
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === "PageDown" || e.key === "PageUp") clearHold(); };
    ownerWin.addEventListener("keydown", onOwnerKey, true);
    ownerWin.addEventListener("keyup", onKeyUp, true);
    let filmCleanup: (() => void) | undefined;
    if (filmWin && filmWin !== ownerWin) {
      const onFilmKey = (e: KeyboardEvent) => handle(e, filmWin, true);
      filmWin.addEventListener("keydown", onFilmKey, true);
      filmWin.addEventListener("keyup", onKeyUp, true);
      filmCleanup = () => { filmWin.removeEventListener("keydown", onFilmKey, true); filmWin.removeEventListener("keyup", onKeyUp, true); };
    }
    return () => { ownerWin.removeEventListener("keydown", onOwnerKey, true); ownerWin.removeEventListener("keyup", onKeyUp, true); filmCleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emph, resolved, shown, cd, onNextQuestion, onPrevQuestion, filmWin, selPerf, recording]);

  if ((!layoutMode && !ceq) || !cd) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;

  return (
    // CARD WRITE BRIDGE — staged elements are REAL card components, and their
    // useCardActions() would otherwise resolve to this previewer's throwaway RF.
    // Pointing it at the main canvas makes their edits land on the actual node
    // (and therefore autosave), in both this pane and the film popout below.
    <CardWriteCtx.Provider value={mainRf as unknown as RfLike}>
    <PracticeContext.Provider value={{ emph, resolved, select: (i) => setEmph(i), boss: bossOn, toggleBoss: () => setBossOn((v) => !v) }}>
      <RevealContext.Provider value={revealedMemoIds}>
        <ScaleContext.Provider value={setScale}>
         <ScaleCommitContext.Provider value={commitGeom}>
          <PreviewSpotContext.Provider value={spotApi}>
           <ChainToggleContext.Provider value={onPatchChainItem ?? (() => {})}>
           <MemoEditContext.Provider value={layoutMode ? null : (onRenameMemo ?? null)}>
           <StemEditContext.Provider value={layoutMode ? null : (onEditStem ?? null)}>
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
              <div className="min-h-0 flex-1" style={{ background: "rgba(4,7,14,0.6)", position: "relative" }}>
                <ReactFlow
                  // RECORDING/REHEARSE (A2): same preload treatment as the film popout —
                  // the whole set stays mounted so the walk is a pan, never a re-seed.
                  nodes={recording && filmStack ? recNodes : nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onNodeDrag={onNodeDrag}
                  onNodeDragStop={onNodeDragStop}
                  onConnect={onConnect}
                  onEdgeClick={onEdgeClick}
                  onSelectionChange={({ nodes: sel, edges: selE }) => {
                    onSelectMemo?.((sel.find((n) => n.type === "memoPreview")?.id) ?? null);
                    // COMPONENT CLIPBOARD: report the selected STAGED element (note
                    // card, T-account, any Add-menu card) so Ctrl+C copies IT, not
                    // the frame.
                    onSelectStageEl?.((sel.find((nd) => !!(nd.data as { stage?: unknown } | undefined)?.stage)?.id) ?? null);
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
                  fitViewOptions={{ padding: recording ? 0.03 : 0.14 }}
                  minZoom={0.04}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  connectionMode={ConnectionMode.Loose}
                  selectionKeyCode="Control"
                  nodesConnectable={!recording}
                  elementsSelectable={!recording}
                  nodesDraggable={!recording}
                  panOnDrag={!recording}
                  zoomOnScroll={!recording}
                  panOnScroll={false}
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
              {/* PRACTICE BAR — hover the preview, then Tab/Enter/Space/` (mouse-free;
                  Page Down / Page Up also deal next / previous — presenter-remote friendly).
                  Ctrl+click a choice/memo/arrow = spotlight · +Shift = 🔥 · +Alt+Shift = 🚨. */}
              <div className="flex shrink-0 items-center gap-1.5 border-t px-2 py-1.5" style={{ borderColor: NEON.borderSoft, background: "rgba(11,19,34,0.9)", display: recording ? "none" : undefined }}>
                {/* TRANSPORT DIET (film-run fixes §2.4) — the play/pause + reset buttons, the
                    practice timer and the "N/M shown" counter are GONE: none of them survived a
                    real film run (` still resets, Shift+` still sweeps). What's left is the row's
                    actual job — FILM, VIEW, this set's clip stack, and the per-CEQ flags. */}
                <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: filmWin ? "#0B0F1E" : "#FF8B9E", background: filmWin ? "#FF8B9E" : "transparent", border: `1px solid ${filmWin ? "#FF8B9E" : "rgba(255,139,158,0.5)"}` }} onClick={toggleFilm} title={filmWin ? "Close the film window" : "FILM MODE — pops a clean 16:9 canvas frame (world background + watermark) onto your 2nd monitor. TWO-WAY: drag / resize / spotlight / Space-Tab-Enter (Page Down / Page Up deal between CEQs) work in EITHER window and stay in sync. Maximize it for OBS."}><Clapperboard className="h-3.5 w-3.5" /> {filmWin ? "Filming" : "Film"}</button>
                {/* COMPOSITION GUIDES — thirds grid + safe zones (title-safe, camera,
                    watermark, end-screen) for laying out the CEQ; drag a slot/card and
                    it snaps to the lines (hold Alt to place freely). Persists. */}
                {/* VIEW MENU (frames rename §4) — Student chrome · Guides · Layout overlay ·
                    Overview · World picker, one dropdown (opens UP; the bar is at the bottom).
                    The old STUDENT / GUIDES / LAYOUT ON / OVERVIEW buttons + the world select
                    lived here as five separate controls. FILM stays top-level (a mode, not a
                    view); play/reset stay. */}
                <div className="relative">
                  <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: viewMenuOpen ? "#0B0F1E" : NEON.text, background: viewMenuOpen ? NEON.yellow : "transparent", border: `1px solid ${viewMenuOpen ? NEON.yellow : NEON.borderSoft}` }} onClick={() => setViewMenuOpen((v) => !v)} title="View — student chrome, guides, layout overlay, overview, world backdrop. Choices persist per user (the world is per set).">
                    <Eye className="h-3.5 w-3.5" /> View <ChevronDown className="h-3 w-3" style={{ transform: "rotate(180deg)" }} />
                  </button>
                  {viewMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-[68]" onClick={() => setViewMenuOpen(false)} />
                      <div className="absolute bottom-8 left-0 z-[69] flex w-56 flex-col gap-0.5 rounded-lg p-1.5" style={{ background: NEON.panelSolid, border: `1px solid ${NEON.border}`, boxShadow: "0 -12px 32px -12px rgba(0,0,0,0.7)" }}>
                        <button className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: viewStudent ? "#3BF5A0" : NEON.muted }} onClick={() => setViewStudent(!viewStudent)} title='Topic label + "N of M" counter filmed on the CEQ box. The counter counts CEQ frames only — notes never count.'>
                          <span className="w-3 text-center">{viewStudent ? "✓" : ""}</span> Student chrome
                        </button>
                        <button className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: guidesOn ? "#7EF3C0" : NEON.muted }} onClick={toggleGuides} title="Rule-of-thirds + safe zones, with drag-to-snap (Alt = free placement)">
                          <span className="w-3 text-center">{guidesOn ? "✓" : ""}</span> Guides
                        </button>
                        {onEditLayout && !layoutMode && (
                          <button className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: NEON.yellow }} onClick={onEditLayout} title="Open the set's BASE FRAME — the master layout every frame deals from. You'll get the apply choice when you're done.">
                            <span className="w-3 text-center">▦</span> Edit set layout…
                          </button>
                        )}
                        {onSetLayoutMode && !layoutMode && (
                          <button className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: layoutOn === false ? NEON.muted : NEON.cyan }} onClick={() => onSetLayoutMode(layoutOn === false)} title="Deals conform to the Q0 layout; new memos snap to the next active slot. Off = fully freeform. (Per set — it drives filmed geometry.)">
                            <span className="w-3 text-center">{layoutOn === false ? "" : "✓"}</span> Layout overlay
                          </button>
                        )}
                        {deckCeqIds && deckCeqIds.length > 1 && activeIdx >= 0 && (
                          <button className="flex items-center gap-2 rounded px-1.5 py-1 text-left text-[10.5px] font-bold hover:bg-white/5" style={{ color: overview ? NEON.cyan : NEON.muted }} onClick={() => setOverview((v) => !v)} title="Stack every frame vertically — zoom out to see the whole set, click one to glide to it">
                            <span className="w-3 text-center">{overview ? "✓" : ""}</span> Overview
                          </button>
                        )}
                        {onSetWorld && (
                          <div className="mt-0.5 flex items-center gap-1.5 border-t px-1.5 pt-1.5" style={{ borderColor: NEON.borderSoft }}>
                            <span className="text-[9px] font-bold uppercase" style={{ color: NEON.muted }}>World</span>
                            <select className="h-6 min-w-0 flex-1 rounded px-1 text-[9.5px] font-bold uppercase" style={{ color: world ? NEON.yellow : NEON.muted, background: "transparent", border: `1px solid ${NEON.borderSoft}` }} value={world ?? ""} onChange={(e) => onSetWorld(e.target.value || undefined)} title="Per-set backdrop behind the CEQ in the previewer + film mode">
                              <option value="">No world</option>
                              {WORLDS.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                {/* CLIPS (film-run fixes §2.3) — hoisted out of the editor toolbar: the clip
                    stack belongs beside FILM, not beside the authoring controls. Supplied by
                    the Studio, which owns the per-question take data. */}
                {transportLeft}
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
                {/* STUDENT + LAYOUT ON/OFF → the View menu (frames rename §4). */}
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
                {/* OVERVIEW toggle + WORLD select → the View menu; the fit-all icon stays
                    (only meaningful while overview is on). */}
                {overviewOn && <button className="grid h-6 w-6 place-items-center rounded" style={{ color: NEON.cyan, border: `1px solid ${NEON.borderSoft}` }} onClick={fitAll} title="Fit all questions in view (zoom out)"><Maximize2 className="h-3.5 w-3.5" /></button>}
                {walk.length > 0 && !layoutMode && <button className="flex h-6 items-center gap-1 rounded px-1.5 text-[9.5px] font-bold uppercase" style={{ color: showAll ? "#0B0F1E" : "#E0284A", background: showAll ? "#E0284A" : "transparent", border: `1px solid ${showAll ? "#E0284A" : "rgba(224,40,74,0.5)"}` }} onClick={() => setShowAll((v) => !v)} title="Show arrows — AUTHORING AID: reveal every memo here so you can check the arrows land on the right choices (Ctrl/Shift-click one to test its spotlight). Arrows DO appear on camera, but this toggle does not — the film window keeps showing the real Enter-walk. Toggle off to walk normally."><Spline className="h-3.5 w-3.5" /> Arrows</button>}
                {/* PER-CEQ FLAGS (film-run fixes §2.6) — star / boss / cha-ching / short, as
                    icons, where the ‹ › question arrows used to sit. The arrows went because
                    frames are navigated from the left rail (and Space / PageDown still deal). */}
                <span className="sa-chrome ml-2 shrink-0 text-[8.5px] font-bold uppercase tracking-wide" style={{ color: NEON.muted }} title="` wipes the temporary state — practice, spotlights, arrows, highlights, selection. Touches nothing saved. In a text field it just types a backtick.">` resets</span>
                <div className="ml-auto flex items-center gap-1">{transportRight}</div>
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
                  {/* FILM_LOCK_CSS (A1): this window never had FILM_MODE_CSS, so staged
                      cards showed hover chrome + live resize handles ON CAMERA. */}
                  <style>{FLAME_CSS}{PV_CSS}{FILM_LOCK_CSS}</style>
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
                        // NEVER cull in the FILM popout. onlyRenderVisibleElements drops
                        // nodes outside ReactFlow's MEASURED viewport — and that measurement
                        // lags a programmatic setViewport. Going fullscreen (F11 resizes the
                        // window) then Space (re-seeds nodes + pans by activeYOff) lands the
                        // camera on a frame ReactFlow hasn't re-measured yet, so it culls the
                        // whole frame → black take. A deck is a handful of frames; render them
                        // all so the recording surface can never blank out. (Authoring keeps
                        // culling for big overview stacks — it's not fullscreened.)
                        onlyRenderVisibleElements={false}
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
                    {/* No in-app film watermark for now (Lee) — the brand watermark will be
                        added later in the actual HTML player, not baked into the take. */}
                    <PerfArrowLayer arrows={perfArrows} add={addPerfArrow} sel={selPerf} setSel={setSelPerf} />
                    {/* PREPARING GATE (A2) — covers the pane until the mounted set is warm.
                        Opaque brand navy: whatever loads underneath can never flash on camera. */}
                    {!filmReady && (
                      <div style={{ position: "absolute", inset: 0, zIndex: 60, display: "grid", placeItems: "center", background: "#05070d" }}>
                        <div style={{ color: "rgba(230,236,255,0.5)", fontSize: 12, fontWeight: 800, letterSpacing: "0.28em", textTransform: "uppercase" }}>Preparing set…</div>
                      </div>
                    )}
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
           </StemEditContext.Provider>
           </MemoEditContext.Provider>
           </ChainToggleContext.Provider>
          </PreviewSpotContext.Provider>
         </ScaleCommitContext.Provider>
        </ScaleContext.Provider>
      </RevealContext.Provider>
    </PracticeContext.Provider>
    </CardWriteCtx.Provider>
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

export function CeqPreviewer({ transportLeft, transportRight, ceqId, mainRf, mainSig, frameW = 1600, frameH = 900, chainEdges = [], baseline, world, worldIntensity, worldMotion, deckCeqIds, counterIds, stageSig, layoutMode, onSaveBaseline, onSaveInstance, onReorderChainMemo, layoutOn, onSetLayoutMode, onApplyLayoutToAll, onSetWorld, onPatchChainItem, onAttachMemo, onSelectMemo, onSelectQuestion, onCopyItems, onPasteItems, hasItemsClip, onSendToStarred, onCopyStyleToSet, starredCount, onAddMemoAtChoice, onAddMemoAt, onRenameMemo, onEditStem, onDuplicateMemo, onSetMemoCategory, onDeleteMemo, onSetMisconception, misconceptionSlugs, onNextQuestion, onPrevQuestion, showProgress, onSetShowProgress, onOpenMemoLib, topicName, recording, bossAutoArm, onEditLayout, onSelectStageEl, onExitRecording }: { transportLeft?: ReactNode; transportRight?: ReactNode; ceqId: string | null; mainRf: MainRf; mainSig: string; frameW?: number; frameH?: number; chainEdges?: PreviewEdge[]; baseline?: DeckLayout; world?: string; worldIntensity?: number; worldMotion?: number; deckCeqIds?: string[]; counterIds?: string[]; stageSig?: string; layoutMode?: boolean; onSaveBaseline?: (l: DeckLayout) => void; onSaveInstance?: (g: CeqInstanceGeom) => void; onReorderChainMemo?: (memoNodeId: string, dir: -1 | 1) => void; layoutOn?: boolean; onSetLayoutMode?: (on: boolean) => void; onApplyLayoutToAll?: () => void; onSetWorld?: (w: string | undefined) => void; onPatchChainItem?: (memoNodeId: string, patch: Partial<CeqChainItem>) => void; onAttachMemo?: (choiceId: string, memoId: string) => void; onSelectMemo?: (id: string | null) => void; onSelectQuestion?: (id: string) => void; onCopyItems?: (memoNodeIds: string[]) => void; onPasteItems?: (mode: "new" | "exact") => void; hasItemsClip?: number; onSendToStarred?: (memoNodeIds: string[]) => void; onCopyStyleToSet?: (styles: { idx: number; x: number; y: number; scale: number; hideChoiceLabel?: boolean; hideArrow?: boolean; sound?: CeqChainItem["sound"] }[]) => void; starredCount?: number; onAddMemoAtChoice?: (choiceId: string, text: string, category: string) => void; onAddMemoAt?: (pos: { x: number; y: number }, text: string, category: string) => void; onRenameMemo?: (memoNodeId: string, label: string) => void; onEditStem?: (ceqId: string, text: string) => void; onDuplicateMemo?: (memoNodeId: string) => void; onSetMemoCategory?: (memoNodeIds: string[], category: string) => void; onSetMisconception?: (memoNodeIds: string[], slug: string | null) => void; misconceptionSlugs?: string[]; onDeleteMemo?: (memoNodeIds: string[]) => void; onNextQuestion?: () => void; onPrevQuestion?: () => void; showProgress?: boolean; onSetShowProgress?: (b: boolean) => void; onOpenMemoLib?: (id: string) => void; topicName?: string; recording?: boolean; bossAutoArm?: boolean; onEditLayout?: () => void; onSelectStageEl?: (id: string | null) => void; onExitRecording?: () => void }) {
  if (!ceqId) return <div className="grid h-full place-items-center text-[11px]" style={{ color: NEON.muted }}>Select a question to preview.</div>;
  return (
    <PreviewErrorBoundary resetKey={ceqId}>
      <ReactFlowProvider>
        <Inner transportLeft={transportLeft} transportRight={transportRight} ceqId={ceqId} mainRf={mainRf} mainSig={mainSig} frameW={frameW} frameH={frameH} chainEdges={chainEdges} baseline={baseline} world={world} worldIntensity={worldIntensity} worldMotion={worldMotion} deckCeqIds={deckCeqIds} counterIds={counterIds} stageSig={stageSig} layoutMode={layoutMode} onSaveBaseline={onSaveBaseline} onSaveInstance={onSaveInstance} onReorderChainMemo={onReorderChainMemo} layoutOn={layoutOn} onSetLayoutMode={onSetLayoutMode} onApplyLayoutToAll={onApplyLayoutToAll} onSetWorld={onSetWorld} onPatchChainItem={onPatchChainItem} onAttachMemo={onAttachMemo} onSelectMemo={onSelectMemo} onSelectQuestion={onSelectQuestion} onCopyItems={onCopyItems} onPasteItems={onPasteItems} hasItemsClip={hasItemsClip} onSendToStarred={onSendToStarred} onCopyStyleToSet={onCopyStyleToSet} starredCount={starredCount} onAddMemoAtChoice={onAddMemoAtChoice} onAddMemoAt={onAddMemoAt} onRenameMemo={onRenameMemo} onEditStem={onEditStem} onDuplicateMemo={onDuplicateMemo} onSetMemoCategory={onSetMemoCategory} onDeleteMemo={onDeleteMemo} onSetMisconception={onSetMisconception} misconceptionSlugs={misconceptionSlugs} onNextQuestion={onNextQuestion} onPrevQuestion={onPrevQuestion} showProgress={showProgress} onSetShowProgress={onSetShowProgress} onOpenMemoLib={onOpenMemoLib} topicName={topicName} recording={recording} bossAutoArm={bossAutoArm} onEditLayout={onEditLayout} onSelectStageEl={onSelectStageEl} onExitRecording={onExitRecording} />
      </ReactFlowProvider>
    </PreviewErrorBoundary>
  );
}
