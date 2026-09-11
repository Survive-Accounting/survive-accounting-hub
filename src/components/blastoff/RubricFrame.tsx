// THE RUBRIC FRAME — the A = L + E block. Two variants:
//
//   "slide"  the rubric slide (RubricSlide.tsx): the boxes and the balance line only — the
//            transaction sits in the set-card skin above (Lee, 2026-09-11: "Same skin/UI we see
//            for MCQ, but only the transaction"). The Rev/Exp row shows only when asked.
//   "tease"  Up Next (EndOfTopicFrames.tsx): the mockup's L, the "Transaction" chip and the words
//            in the open space left of Rev/Exp, the balance line under them.
//
// GEOMETRY. Everything is in PHONE UNITS for the Review stage's 306-wide phone, times `k` (the
// phone's width / 306). The block is the Shorts safe column's width, drawn full size both ways
// since 2026-09-11 — the rubric slide has no caption rail (layout.ts COLUMN_KINDS). With Rev/Exp
// in, the camera's home circle sits in the L's crook, so only the TOP ROW is marked for the camera
// to keep off (data-sa-rubric), and the balance line moves to the top of the crook.
//
// THE BOXES ARE CLICKABLE wherever a caller hands in `onCycle` — the Review stage (the saved
// arrows) and the film surface (the take only) — and SAY SO: a lift, an amber edge and a glow on
// hover (Lee: "Make it clear by hover animation that these are clickable"). They are divs, not
// buttons: a focused button would take the film's spacebar as a click.
//
// ONLY MODE "ale" DRAWS. "dc" is reserved on the schema and refused here with a red block that
// says so — the convention is fail loud.
import { BRAND_CREAM } from "@/components/brand-cards/bolt-boil";

import { assertRenderable, balanceLine, equityShown, fmtDollars, revExpShown, type RubricArrow, type RubricKey, type RubricSpec } from "./rubric";
import { BRAND_FONT, DISPLAY_FONT } from "./stage";

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
  // The column left of Rev/Exp (the tease's transaction; the slide's balance line).
  tx: { w: 165 },
  /** The slide variant with the Rev/Exp row hidden: the row, then a line for the balance. */
  balanceH: 22,
} as const;

/** The slide variant's height in phone units: the L with Rev/Exp, else the row and a balance line. */
export function rubricBlockH(revExp: boolean): number {
  return revExp ? RUBRIC_GEOM.h : RUBRIC_GEOM.top.h + RUBRIC_GEOM.balanceH;
}

/** Where the full L's bottom lands as a fraction of the phone's height, given the stage's top
 *  margin (PhoneFrame puts a top-aligned stage at SAFE.top + .02). */
export function rubricBottomFrac(stageTopFrac: number): number {
  return stageTopFrac + RUBRIC_GEOM.h / (306 * 16 / 9);
}

const RUBRIC_CSS = `
@keyframes sa-rubric-pop { 0% { transform: scale(0.3); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.sa-rubric-pop { animation: sa-rubric-pop 420ms cubic-bezier(0.3, 1.6, 0.5, 1) both; }
.sa-rubric-cell.sa-click { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 200ms ease; }
.sa-rubric-cell.sa-click:hover { transform: translateY(-2px) scale(1.045); border-color: ${GOLD} !important; box-shadow: 0 0 0 2px rgba(252,163,17,0.35), 0 6px 18px rgba(252,163,17,0.22); }
.sa-rubric-cell.sa-click:active { transform: scale(0.97); }
@media (prefers-reduced-motion: reduce) { .sa-rubric-pop { animation: none; } .sa-rubric-cell.sa-click:hover, .sa-rubric-cell.sa-click:active { transform: none; } }`;

export function RubricFrame({ spec, k, live = false, onCycle, popKey, popKeys, variant = "tease", revExp, showBalance = true }: {
  spec: RubricSpec | undefined;
  /** The phone's width / 306 (times any scale-down the caller wants). */
  k: number;
  /** The film surface — a changed box pops. */
  live?: boolean;
  /** A box click; absent = the boxes are inert. */
  onCycle?: (key: RubricKey) => void;
  /** POP EVERYTHING AGAIN when this changes (the Up Next demo's cycle). */
  popKey?: string;
  /** POP ONE BOX when its own key changes (the rubric slide on film: a reveal or a click). */
  popKeys?: Partial<Record<RubricKey, string>>;
  variant?: "slide" | "tease";
  /** The slide variant: show the Rev/Exp row. Absent = the spec's own rule. The tease always does. */
  revExp?: boolean;
  /** Draw the balance line (the slide holds it back until every box is in). */
  showBalance?: boolean;
}) {
  const G = RUBRIC_GEOM;
  if (!spec) return <Loud k={k} text="This rubric slide has no data — delete it and add a fresh Rubric." />;
  const refused = assertRenderable(spec);
  if (refused) return <Loud k={k} text={refused} />;

  const tease = variant === "tease";
  const rx = tease ? true : (revExp ?? revExpShown(spec));
  const eq = equityShown(spec, rx);
  const amounts = spec.show === "amounts" && spec.amount > 0;
  const bal = showBalance ? balanceLine(spec, rx) : null;
  const cell: CellCtx = { k, spec, live, amounts, eq, onCycle, popKey, popKeys };
  const connX = (G.x.E + G.sub.w / 2 - 1) * k;
  const revTop = G.top.h + G.sub.gap;
  const expTop = revTop + G.sub.h + G.sub.gap + 1;
  const H = tease ? G.h : rubricBlockH(rx);
  const balEl = bal ? <div style={{ fontFamily: BRAND_FONT, fontWeight: 700, fontSize: 11.5 * k, color: bal.ok ? OK : BAD }}>{bal.text}</div> : null;
  // THE CROOK (2026-09-11): the slide's L — the camera may sit in it, so only the top row is measured.
  const crook = !tease && rx;
  const mark = crook ? { "data-sa-rubric-l": "" } : { "data-sa-rubric": "" };
  return (
    <div {...mark} style={{ position: "relative", width: G.w * k, height: H * k, fontFamily: BRAND_FONT, color: BRAND_CREAM }}>
      <style>{RUBRIC_CSS}</style>
      {crook && <div data-sa-rubric="" aria-hidden style={{ position: "absolute", left: 0, top: 0, width: G.w * k, height: G.top.h * k, pointerEvents: "none" }} />}
      <RubricCell ctx={cell} keyName="A" sub={false} left={G.x.A} top={0} />
      <RubricOp k={k} text="=" left={G.x.eq} />
      <RubricCell ctx={cell} keyName="L" sub={false} left={G.x.L} top={0} />
      <RubricOp k={k} text="+" left={G.x.plus} />
      <RubricCell ctx={cell} keyName="E" sub={false} left={G.x.E} top={0} />
      {rx && (
        <>
          <div style={{ position: "absolute", left: connX, top: G.top.h * k, width: Math.max(1, 2 * k), height: G.sub.gap * k, background: "rgba(252,163,17,0.55)" }} />
          <RubricCell ctx={cell} keyName="Rev" sub left={G.x.E} top={revTop} />
          <div style={{ position: "absolute", left: connX, top: (revTop + G.sub.h) * k, width: Math.max(1, 2 * k), height: (G.sub.gap + 1) * k, background: "rgba(252,163,17,0.55)" }} />
          <RubricCell ctx={cell} keyName="Exp" sub left={G.x.E} top={expTop} />
        </>
      )}
      {tease ? (
        // THE TEASE: the transaction column — chip, words, the balance line at the bottom.
        <div style={{ position: "absolute", left: 0, top: revTop * k, width: G.tx.w * k, height: (G.h - revTop) * k, display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ display: "inline-block", fontFamily: BRAND_FONT, fontWeight: 800, fontSize: 9.5 * k, lineHeight: 1, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, border: `1px solid rgba(252,163,17,0.45)`, background: "rgba(252,163,17,0.08)", borderRadius: 5 * k, padding: `${5 * k}px ${7 * k}px` }}>Transaction</span>
          <div style={{ fontFamily: DISPLAY_FONT, fontWeight: 600, fontSize: 16 * k, lineHeight: 1.22, color: BRAND_CREAM, marginTop: 7 * k, textWrap: "balance" as never }}>{spec.text}</div>
          {balEl && <div style={{ marginTop: "auto" }}>{balEl}</div>}
        </div>
      ) : rx ? (
        // THE SLIDE WITH REV/EXP: the balance line in the open space left of them, at the TOP of it
        // (2026-09-11) — the camera's home circle sits in the bottom of that crook now.
        balEl && <div style={{ position: "absolute", left: 0, top: (G.top.h + 8) * k, width: G.tx.w * k }}>{balEl}</div>
      ) : (
        // THE SLIDE WITHOUT: the balance line under the row.
        balEl && <div style={{ position: "absolute", left: 0, top: (G.top.h + 6) * k }}>{balEl}</div>
      )}
    </div>
  );
}

/** What every box needs to draw itself — one object, so the cells stay module-scope components
 *  (a component defined inside the render is a new identity every render, and every PhoneFrame
 *  re-render would remount the arrows and replay the pop). */
interface CellCtx {
  k: number; spec: RubricSpec; live: boolean; amounts: boolean;
  eq: { arrows: RubricArrow[]; ghost: boolean };
  onCycle?: (key: RubricKey) => void; popKey?: string; popKeys?: Partial<Record<RubricKey, string>>;
}

function RubricArrows({ ctx, keyName, sub }: { ctx: CellCtx; keyName: RubricKey; sub: boolean }) {
  const { k, spec, live, amounts, eq, popKey, popKeys } = ctx;
  const { list, ghost } = keyName === "E" ? { list: eq.arrows, ghost: eq.ghost } : { list: spec.arrows[keyName], ghost: false };
  if (!list.length) return <div style={{ minHeight: (sub ? 22 : 26) * k }} />;
  const stack = amounts && list.length > 1 && !sub;
  const key = popKeys?.[keyName] ?? popKey ?? "rest";
  return (
    <div key={key} className={live && (popKeys || popKey) ? "sa-rubric-pop" : undefined}
      style={{ display: "flex", flexDirection: stack ? "column" : "row", gap: stack ? 0 : 1 * k, alignItems: "center", minHeight: stack ? 0 : (sub ? 22 : 26) * k, opacity: ghost ? 0.42 : 1 }}>
      {list.map((d) => d === "ne" ? (
        // NO EFFECT, spelled the way some teachers mark it.
        <span key="ne" style={{ fontFamily: BRAND_FONT, fontWeight: 900, fontSize: (sub ? 12 : 15) * k, letterSpacing: "0.06em", lineHeight: 1, color: "#E6EAF4" }}>NE</span>
      ) : (
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
    color: BRAND_CREAM, userSelect: "none", WebkitUserSelect: "none",
    left: left * k, top: top * k, width: size.w * k, height: size.h * k,
  };
  return (
    <div data-rubric-cell={keyName} role={onCycle ? "button" : undefined} className={onCycle ? "sa-rubric-cell sa-click" : "sa-rubric-cell"}
      title={onCycle ? `${keyName}: click to cycle ↑ · ↓ · ↑↓ · NE · blank` : undefined} style={style}
      onClick={onCycle ? (e) => { e.stopPropagation(); onCycle(keyName); } : undefined}>
      <div style={{ fontFamily: DISPLAY_FONT, fontWeight: sub ? 600 : 700, lineHeight: 1, fontSize: (sub ? 17 : 30) * k, color: sub ? "#DFE6F5" : BRAND_CREAM }}>{keyName}</div>
      <RubricArrows ctx={ctx} keyName={keyName} sub={sub} />
    </div>
  );
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
