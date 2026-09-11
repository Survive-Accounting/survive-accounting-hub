// THE RUBRIC FRAME — the A = L + E block a `rubric` slide draws, through PhoneFrame like every
// other kind: the Editor thumbnails, the Review stage, the film pop-out all mount this.
//
// Lee (2026-09-11, the Editor session brief): "the A = L + E rubric first (he needs it on the
// cram path)." The layout is the "Rubric tool" from end-of-topic-frames.html — an L. The top
// row is A = L + E as three boxes with the operators between; under E hang two smaller dashed
// boxes, Rev then Exp, joined by short amber connectors; the open space left of Rev/Exp holds
// the "Transaction" chip, the transaction text and, at the bottom, the balance line.
//
// GEOMETRY. Everything here is in PHONE UNITS for the Review stage's 306-wide phone, times `k`
// (= the phone's width / 306 — phoneScale hands exactly that in for this kind). The block is
// the full width of the Shorts safe column (.05w–.84w) and sits at its top (layout.cardPlacement
// says "top" for this kind in both templates), so it ends above the caption rail (.61h) and
// clear of the home camera (bottom-left, .28w) — rubric-frame.test.ts pins both.
//
// THE REVEAL. On the film surface the spacebar walks the boxes that have arrows — A, L, E,
// then Rev/Exp together (rubric.ts revealGroups) — the way a map walks its shots: BlastOffCapture
// keeps the step and hands it in through RubricFilmContext; a newly revealed group POPS (scale
// in). Absent the context (the Editor, the thumbnails, the next-slide preview) every arrow is
// shown at rest. prefers-reduced-motion: no pop.
//
// AUTHORING. On the Review stage (SlideEditContext present) each box is a button: click cycles
// blank → ↑ → ↓ → ↑↓ → blank. The Editor panel (ReviewDeck RubricEditor) has the same boxes plus
// the text, the amount, the show toggle, the equity checkbox and the eight presets.
//
// ONLY MODE "ale" DRAWS. "dc" is reserved on the schema and refused here with a red block that
// says so — the convention is fail loud, and a rubric that silently drew the wrong equation on
// camera would be worse than one that stops the take.
import { useContext } from "react";

import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { assertRenderable, balanceLine, equityShown, fmtDollars, revealedKeys, rubricSteps, type RubricArrow, type RubricKey, type RubricSpec } from "./rubric";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

/** What the film knows about a rubric slide: the reveal step being walked (frame-step.ts — the
 *  one step context every self-walking kind shares). Absent → at rest, everything shown. */
export type { FrameStep as RubricFilm } from "./frame-step";
export { FrameStepContext as RubricFilmContext } from "./frame-step";
import { FrameStepContext } from "./frame-step";

const GOLD = "#FCA311";
const SKY = "#7DD3FC";
const CELL_BG = "#0E1830";
const CELL_EDGE = "#2B3D66";
const CELL_ON_BG = "#122042";
const CELL_ON_EDGE = "#6C86BD";
const MUTED = "#8C9BBA";
const OK = "#7FE0A8";
const BAD = "#FF8A80";

/** THE BLOCK, in phone units (306-wide phone). The safe column is 242 wide (.79 × 306). */
export const RUBRIC_GEOM = {
  w: 241, h: 198,
  top: { w: 67, h: 77 },          // A, L, E
  op: 20,                          // the "=" and "+" gaps
  sub: { w: 67, h: 53, gap: 7 },   // Rev, Exp, and the amber connector between rows
  // Where the boxes sit (left edges): A · = · L · + · E — E's right edge is the block's.
  x: { A: 0, eq: 67, L: 87, plus: 154, E: 174 },
  // The transaction column left of Rev/Exp.
  tx: { w: 165 },
} as const;

/** Where the block's bottom lands as a fraction of the phone's height, given the stage's top
 *  margin (PhoneFrame puts a top-aligned stage at SAFE.top + .02). Pure — the test reads it. */
export function rubricBottomFrac(stageTopFrac: number): number {
  return stageTopFrac + RUBRIC_GEOM.h / (306 * 16 / 9);
}

const POP_CSS = `
@keyframes sa-rubric-pop { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.sa-rubric-pop { animation: sa-rubric-pop 420ms cubic-bezier(0.3, 1.6, 0.5, 1) both; }
@media (prefers-reduced-motion: reduce) { .sa-rubric-pop { animation: none; } }`;

export function RubricFrame({ spec, k, live = false, onCycle, popKey }: {
  spec: RubricSpec | undefined;
  /** The phone's width / 306. */
  k: number;
  /** The film surface — the reveal follows RubricFilmContext and a revealed group pops. */
  live?: boolean;
  /** POP EVERYTHING AGAIN when this changes (the Up Next demo's cycle, 2026-09-11) — a block
   *  at rest whose arrows should still arrive with the pop each time the transaction changes. */
  popKey?: string;
  /** The Review stage's click-to-cycle; absent everywhere else. */
  onCycle?: (key: RubricKey) => void;
}) {
  const film = useContext(FrameStepContext);
  const G = RUBRIC_GEOM;
  if (!spec) return <Loud k={k} text="This rubric slide has no data — delete it and add a fresh Rubric." />;
  const refused = assertRenderable(spec);
  if (refused) return <Loud k={k} text={refused} />;

  const step = live && film ? film.step : undefined;
  const shown = revealedKeys(spec, step);
  const eq = equityShown(spec);
  const amounts = spec.show === "amounts" && spec.amount > 0;
  const bal = balanceLine(spec);
  // The balance line belongs to the last reveal: at rest, or once every box is on.
  const balShown = step === undefined || step >= rubricSteps(spec) - 1;

  const cell: CellCtx = { k, spec, shown, step, live, amounts, eq, onCycle, popKey };
  const connX = (G.x.E + G.sub.w / 2 - 1) * k;
  const revTop = G.top.h + G.sub.gap;
  const expTop = revTop + G.sub.h + G.sub.gap + 1;
  return (
    <div data-sa-rubric="" style={{ position: "relative", width: G.w * k, height: G.h * k, fontFamily: BRAND_FONT, color: BRAND_CREAM }}>
      {live && <style>{POP_CSS}</style>}
      <RubricCell ctx={cell} keyName="A" sub={false} left={G.x.A} top={0} />
      <RubricOp k={k} text="=" left={G.x.eq} />
      <RubricCell ctx={cell} keyName="L" sub={false} left={G.x.L} top={0} />
      <RubricOp k={k} text="+" left={G.x.plus} />
      <RubricCell ctx={cell} keyName="E" sub={false} left={G.x.E} top={0} />
      <div style={{ position: "absolute", left: connX, top: G.top.h * k, width: Math.max(1, 2 * k), height: G.sub.gap * k, background: "rgba(252,163,17,0.55)" }} />
      <RubricCell ctx={cell} keyName="Rev" sub left={G.x.E} top={revTop} />
      <div style={{ position: "absolute", left: connX, top: (revTop + G.sub.h) * k, width: Math.max(1, 2 * k), height: (G.sub.gap + 1) * k, background: "rgba(252,163,17,0.55)" }} />
      <RubricCell ctx={cell} keyName="Exp" sub left={G.x.E} top={expTop} />
      {/* The transaction column: chip, the words, the balance line at the bottom. */}
      <div style={{ position: "absolute", left: 0, top: revTop * k, width: G.tx.w * k, height: (G.h - revTop) * k, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ display: "inline-block", fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 9.5 * k, lineHeight: 1, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, border: `1px solid rgba(252,163,17,0.45)`, background: "rgba(252,163,17,0.08)", borderRadius: 5 * k, padding: `${5 * k}px ${7 * k}px` }}>Transaction</span>
        <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 16 * k, lineHeight: 1.22, color: BRAND_CREAM, marginTop: 7 * k, textWrap: "balance" as never }}>{spec.text}</div>
        {bal && balShown && <div style={{ marginTop: "auto", fontFamily: BRAND_FONT, fontWeight: 700, fontSize: 11.5 * k, color: bal.ok ? OK : BAD }}>{bal.text}</div>}
      </div>
    </div>
  );
}

/** What every box needs to draw itself — one object, so the cells stay module-scope components
 *  (a component defined inside the render is a new identity every render, and every PhoneFrame
 *  re-render would remount the arrows and replay the pop). */
interface CellCtx {
  k: number; spec: RubricSpec; shown: Set<RubricKey>; step: number | undefined; live: boolean; amounts: boolean;
  eq: { arrows: RubricArrow[]; ghost: boolean }; onCycle?: (key: RubricKey) => void; popKey?: string;
}

function RubricArrows({ ctx, keyName, sub }: { ctx: CellCtx; keyName: RubricKey; sub: boolean }) {
  const { k, spec, shown, step, live, amounts, eq, popKey } = ctx;
  const { list, ghost } = keyName === "E" ? { list: eq.arrows, ghost: eq.ghost } : { list: spec.arrows[keyName], ghost: false };
  if (!shown.has(keyName) || !list.length) return <div style={{ minHeight: (sub ? 22 : 26) * k }} />;
  const stack = amounts && list.length > 1 && !sub;
  // Re-keyed on the step so the pop plays exactly when this group is revealed on film.
  return (
    <div key={popKey ?? (step === undefined ? "rest" : `s${step}`)} className={live && (step !== undefined || popKey) ? "sa-rubric-pop" : undefined}
      style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: stack ? 0 : 1 * k, alignItems: "center", minHeight: stack ? 0 : (sub ? 22 : 26) * k, opacity: ghost ? 0.42 : 1 }}>
      {list.map((d) => (
        <span key={d} style={{ display: "inline-flex", alignItems: "baseline", gap: 3 * k, fontFamily: DISPLAY_FONT, fontWeight: 700, lineHeight: 1, fontSize: (stack ? 19 : sub ? 22 : 26) * k, color: d === "up" ? GOLD : SKY }}>
          {d === "up" ? "↑" : "↓"}
          {amounts && <em style={{ fontStyle: "normal", fontFamily: BRAND_FONT, fontWeight: 600, fontSize: 11 * k, color: "#E6EAF4" }}>{fmtDollars(spec.amount)}</em>}
        </span>
      ))}
    </div>
  );
}

function RubricCell({ ctx, keyName, sub, left, top }: { ctx: CellCtx; keyName: RubricKey; sub: boolean; left: number; top: number }) {
  const { k, spec, onCycle } = ctx;
  const on = spec.arrows[keyName].length > 0;
  const size = sub ? RUBRIC_GEOM.sub : RUBRIC_GEOM.top;
  const style: React.CSSProperties = {
    position: "absolute", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 * k,
    background: on ? CELL_ON_BG : CELL_BG, border: `${Math.max(1, 1.5 * k)}px ${sub ? "dashed" : "solid"} ${on ? CELL_ON_EDGE : CELL_EDGE}`, borderRadius: 12 * k,
    color: BRAND_CREAM, padding: 0, font: "inherit", cursor: onCycle ? "pointer" : "default", transition: "border-color 200ms, background 200ms",
    left: left * k, top: top * k, width: size.w * k, height: size.h * k,
  };
  const inner = (
    <>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: sub ? 600 : 700, lineHeight: 1, fontSize: (sub ? 17 : 30) * k, color: sub ? "#DFE6F5" : BRAND_CREAM }}>{keyName}</div>
      <RubricArrows ctx={ctx} keyName={keyName} sub={sub} />
    </>
  );
  return onCycle
    ? <button type="button" data-rubric-cell={keyName} title={`${keyName}: click to cycle ↑ · ↓ · ↑↓ · blank`} style={style} onClick={(e) => { e.stopPropagation(); onCycle(keyName); }}>{inner}</button>
    : <div data-rubric-cell={keyName} style={style}>{inner}</div>;
}

function RubricOp({ k, text, left }: { k: number; text: string; left: number }) {
  return <div style={{ position: "absolute", left: left * k, top: 0, width: RUBRIC_GEOM.op * k, height: RUBRIC_GEOM.top.h * k, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 26 * k, color: MUTED }}>{text}</div>;
}

/** The fail-loud block: same footprint as the rubric, red, says what is wrong. */
function Loud({ k, text }: { k: number; text: string }) {
  return (
    <div data-sa-rubric="" style={{ boxSizing: "border-box", width: RUBRIC_GEOM.w * k, height: RUBRIC_GEOM.h * k, border: `${Math.max(1, 2 * k)}px solid ${BAD}`, borderRadius: 12 * k, padding: 14 * k, display: "grid", placeItems: "center", fontFamily: BRAND_FONT, fontWeight: 700, fontSize: 13 * k, lineHeight: 1.3, color: BAD, textAlign: "center", background: "rgba(255,138,128,0.08)" }}>
      {text}
    </div>
  );
}
