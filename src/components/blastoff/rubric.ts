// THE EQUATION RUBRIC — the A = L + E block a `rubric` slide draws (RubricSlide.tsx, RubricFrame.tsx),
// as pure data and pure rules. No React, no DOM: this file is what the tests pin and what the
// Editor, the film surface and the schema all agree on.
//
// Lee's priority (the Editor session brief, 2026-09-11): "the A = L + E rubric first (he needs
// it on the cram path)." The layout is the "Rubric tool" in end-of-topic-frames.html — an L: A = L + E across the top,
// Rev then Exp hanging under E.
//
// THE RULES
//  · A box holds a LIST: [] · [up] · [down] · [up, down] · [ne]. Clicking cycles them in that
//    order. "up" is amber, "down" is light blue. NE is "No Effect" — Lee, 2026-09-11: "add another
//    after ↑↓ that is NE... since some teachers put 'No Effect' instead of ↓↑. So I will show
//    both." It nets to zero, like ↑↓.
//  · REV / EXP SHOW WHEN ASKED — Lee: "Let revenue/exp be toggleable with maybe the TAB key? Tab
//    again it goes away." `revExp` on the spec says whether the row shows; absent = it shows only
//    when Rev or Exp has something in it. A hidden row neither reveals nor counts in the balance.
//  · EQUITY EFFECT (off by default — "leave that last one off until you've taught it. It's the
//    'expenses up means equity down' moment"): when on and E has nothing of its own, E shows a
//    FADED arrow derived from Rev (Rev↑ → E↑) and Exp (Exp↑ → E↓) — only while Rev/Exp show.
//  · AMOUNTS: with `show: "amounts"` and an amount typed, each arrow carries the amount and the
//    balance line reads the equation A = L + E + Rev − Exp with up = +amount, down = −amount.
//  · REVEAL STEPS (the film surface): spacebar reveals the boxes that have arrows, left to
//    right — A, then L, then E, then Rev/Exp together. Step 0 is the block with no arrows yet.
//  · ONLY mode "ale" renders. "dc" (debit / credit, the normal-balance rubric) is reserved on
//    the schema and refused loudly everywhere it would draw — nothing silently falls back.
//
// Module-scope callables are function declarations (the render-path TDZ rule).

export const RUBRIC_KEYS = ["A", "L", "E", "Rev", "Exp"] as const;
export type RubricKey = (typeof RUBRIC_KEYS)[number];
export type RubricArrow = "up" | "down" | "ne";
export type RubricArrows = Record<RubricKey, RubricArrow[]>;
export type RubricMode = "ale" | "dc";
export type RubricShow = "arrows" | "amounts";

export interface RubricSpec {
  mode: RubricMode;
  /** The transaction, in Lee's words. */
  text: string;
  /** The dollar amount every arrow carries in amounts mode; 0 = none typed. */
  amount: number;
  arrows: RubricArrows;
  show: RubricShow;
  equityEffect: boolean;
  /** Show the Rev / Exp row. Absent = only when Rev or Exp has something in it. */
  revExp?: boolean;
}

/** The heading over the boxes on a rubric slide when the frame has none of its own. */
export const RUBRIC_HEADING = "Effect on A = L + E?";

/** The click cycle on a box: blank → ↑ → ↓ → ↑↓ → NE → blank. */
export const ARROW_CYCLE: readonly (readonly RubricArrow[])[] = [[], ["up"], ["down"], ["up", "down"], ["ne"]];

export const RUBRIC_MODE_LABEL: Record<RubricMode, string> = { ale: "A = L + E", dc: "Debit / credit (later)" };

export function emptyArrows(): RubricArrows {
  return { A: [], L: [], E: [], Rev: [], Exp: [] };
}

/** A fresh rubric slide: A = L + E, arrows only, nothing typed, equity effect off, Rev/Exp on
 *  their automatic rule. A NEW object every call — inserts must never share a nested object. */
export function emptyRubric(): RubricSpec {
  return { mode: "ale", text: "", amount: 0, arrows: emptyArrows(), show: "arrows", equityEffect: false };
}

/** `arrows` is a list, but the states are what they are: ↑↓ and ↓↑ are the same box. */
export function arrowsEqual(a: readonly RubricArrow[], b: readonly RubricArrow[]): boolean {
  return a.length === b.length && a.every((d) => b.includes(d));
}

/** The next state of one box in the click cycle. An unknown list starts over at blank. */
export function cycleArrows(cur: readonly RubricArrow[]): RubricArrow[] {
  const i = ARROW_CYCLE.findIndex((s) => arrowsEqual(s, cur));
  return [...ARROW_CYCLE[(i + 1) % ARROW_CYCLE.length]];
}

/** The arrows with one box cycled — a new object, the others untouched. */
export function cycleKey(arrows: RubricArrows, key: RubricKey): RubricArrows {
  return { ...arrows, [key]: cycleArrows(arrows[key]) };
}

/** Does the Rev / Exp row show? The spec's own say, or — absent — whether either has anything. */
export function revExpShown(spec: Pick<RubricSpec, "arrows" | "revExp">): boolean {
  return spec.revExp ?? (spec.arrows.Rev.length > 0 || spec.arrows.Exp.length > 0);
}

/** E's arrow(s) as Rev and Exp imply them: Rev moves E the same way, Exp the opposite way.
 *  NE implies nothing. Deduplicated, in the order found. */
export function derivedEquity(arrows: RubricArrows): RubricArrow[] {
  const out: RubricArrow[] = [];
  for (const d of arrows.Rev) if (d !== "ne" && !out.includes(d)) out.push(d);
  for (const d of arrows.Exp) {
    if (d === "ne") continue;
    const flipped: RubricArrow = d === "up" ? "down" : "up";
    if (!out.includes(flipped)) out.push(flipped);
  }
  return out;
}

/** What E shows: its own arrows, or — with the equity effect on, E blank and the Rev/Exp row
 *  showing — the derived ones, faded (`ghost`). */
export function equityShown(spec: Pick<RubricSpec, "arrows" | "equityEffect">, revExpVisible = true): { arrows: RubricArrow[]; ghost: boolean } {
  if (spec.arrows.E.length || !spec.equityEffect || !revExpVisible) return { arrows: spec.arrows.E, ghost: false };
  const d = derivedEquity(spec.arrows);
  return { arrows: d, ghost: d.length > 0 };
}

/** One box's net movement in dollars: up = +amount, down = −amount, both or NE = 0. */
export function netOf(arrows: readonly RubricArrow[], amount: number): number {
  return arrows.reduce((t, d) => t + (d === "up" ? amount : d === "down" ? -amount : 0), 0);
}

export function anyArrows(arrows: RubricArrows): boolean {
  return RUBRIC_KEYS.some((k) => arrows[k].length > 0);
}

/** A − (L + E + Rev − Exp), in dollars, using each box's OWN arrows (a derived E is a hint on
 *  the slide, not a posting). A hidden Rev/Exp row does not count. */
export function balanceDiff(spec: Pick<RubricSpec, "arrows" | "amount" | "revExp">, revExpVisible = revExpShown(spec)): number {
  const n = (k: RubricKey): number => netOf(spec.arrows[k], spec.amount);
  const re = revExpVisible ? n("Rev") - n("Exp") : 0;
  return n("A") - (n("L") + n("E") + re);
}

export function fmtDollars(n: number): string {
  return `$${Math.round(Math.abs(n)).toLocaleString("en-US")}`;
}

/** The balance line — null when there is nothing to say (arrows mode, no amount, or no arrows). */
export function balanceLine(spec: Pick<RubricSpec, "arrows" | "amount" | "show" | "revExp">, revExpVisible = revExpShown(spec)): { ok: boolean; text: string } | null {
  if (spec.show !== "amounts" || !(spec.amount > 0) || !anyArrows(spec.arrows)) return null;
  const diff = balanceDiff(spec, revExpVisible);
  return diff === 0 ? { ok: true, text: "⚖ Balanced" } : { ok: false, text: `⚖ Off by ${fmtDollars(diff)}` };
}

/** THE REVEAL ORDER on the film surface: the boxes that have something to show, grouped as the
 *  spacebar walks them — A, then L, then E, then Rev and Exp together (one row of the L). An
 *  empty group is skipped; a hidden Rev/Exp row is never a step. E counts when it has anything of
 *  its own OR the equity effect gives it a derived arrow. */
export function revealGroups(spec: Pick<RubricSpec, "arrows" | "equityEffect" | "revExp">, revExpVisible = revExpShown(spec)): RubricKey[][] {
  const groups: RubricKey[][] = [];
  if (spec.arrows.A.length) groups.push(["A"]);
  if (spec.arrows.L.length) groups.push(["L"]);
  if (equityShown(spec, revExpVisible).arrows.length) groups.push(["E"]);
  if (revExpVisible && (spec.arrows.Rev.length || spec.arrows.Exp.length)) groups.push(["Rev", "Exp"]);
  return groups;
}

/** How many spacebar states the slide has: the bare block, then one per reveal group. */
export function rubricSteps(spec: Pick<RubricSpec, "arrows" | "equityEffect" | "revExp">, revExpVisible = revExpShown(spec)): number {
  return 1 + revealGroups(spec, revExpVisible).length;
}

/** The keys shown at `step` (0 = none). `undefined` = everything — the Editor stage, the
 *  thumbnails, the next-slide preview, anywhere the block is at rest. */
export function revealedKeys(spec: Pick<RubricSpec, "arrows" | "equityEffect" | "revExp">, step: number | undefined, revExpVisible = revExpShown(spec)): Set<RubricKey> {
  if (step === undefined) return new Set(RUBRIC_KEYS);
  const out = new Set<RubricKey>();
  for (const g of revealGroups(spec, revExpVisible).slice(0, Math.max(0, step))) for (const k of g) out.add(k);
  return out;
}

/** Refuse the reserved mode loudly: the caller decides how (the frame draws the message; the
 *  Editor never lets it be picked). */
export function assertRenderable(spec: Pick<RubricSpec, "mode">): string | null {
  if (spec.mode === "ale") return null;
  return `The debit / credit rubric isn't built yet — this slide is in mode "${spec.mode}". Switch it to A = L + E.`;
}

/** THE PRESETS — the eight transactions Lee named for the panel, applied on click. */
export interface RubricPreset { id: string; label: string; text: string; amount: number; arrows: Partial<RubricArrows> }
export const RUBRIC_PRESETS: readonly RubricPreset[] = [
  { id: "invest", label: "Owner invests", text: "Owner invested $10,000 cash in the business", amount: 10000, arrows: { A: ["up"], E: ["up"] } },
  { id: "borrow", label: "Borrow", text: "Borrowed $5,000 from the bank", amount: 5000, arrows: { A: ["up"], L: ["up"] } },
  { id: "supplies", label: "Buy supplies", text: "Bought $800 of supplies with cash", amount: 800, arrows: { A: ["up", "down"] } },
  { id: "services", label: "Services on account", text: "Did $1,200 of services on account", amount: 1200, arrows: { A: ["up"], Rev: ["up"] } },
  { id: "rent", label: "Pay rent", text: "Paid $600 cash for rent", amount: 600, arrows: { A: ["down"], Exp: ["up"] } },
  { id: "advance", label: "Cash in advance", text: "Got $1,000 cash for work due next month", amount: 1000, arrows: { A: ["up"], L: ["up"] } },
  { id: "dividend", label: "Dividend", text: "Paid a $500 cash dividend", amount: 500, arrows: { A: ["down"], E: ["down"] } },
  { id: "repay", label: "Repay loan", text: "Paid $2,000 on the bank loan", amount: 2000, arrows: { A: ["down"], L: ["down"] } },
];

/** A preset applied to a spec: the text, the amount and the arrows change; mode, show and the
 *  equity toggle are Lee's and stay. A preset that needs Rev/Exp turns a hidden row back on. */
export function applyPreset(spec: RubricSpec, p: RubricPreset): RubricSpec {
  const arrows = emptyArrows();
  for (const k of RUBRIC_KEYS) if (p.arrows[k]) arrows[k] = [...p.arrows[k]!];
  const needsRow = arrows.Rev.length > 0 || arrows.Exp.length > 0;
  return { ...spec, text: p.text, amount: p.amount, arrows, ...(needsRow && spec.revExp === false ? { revExp: true } : {}) };
}
