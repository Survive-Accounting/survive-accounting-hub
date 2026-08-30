// "WHEN IT COUNTS" — CASH VS. ACCRUAL EXHIBIT CONFIG. One economic event seen
// through two lenses; the timing difference is the whole lesson. ALL content
// lives here (Bible law 8) — accuracy fixes are config edits.
//
// ACCURACY (audited): under ACCRUAL an expense belongs to the month the cost
// was INCURRED — the usage month — NOT the month the bill arrives or is paid.
// The source deck wobbled here and stamped January; that is the regression this
// config exists to prevent, and a test pins it.
//
// PLACEMENT: head of Adjusting Entries & Trial Balance — this exhibit is the
// bridge that explains WHY adjusting entries exist (see the gap strip below).
import type { CueLevel } from "./users-exhibit-config";

export type BasisId = "accrual" | "cash";

export interface BasisDef {
  id: BasisId;
  label: string;
  /** The five-word rule under the label. */
  rule: string;
  /** The recognition principle this basis is applying, reused verbatim from the
   *  Principles exhibit's vocabulary when that exhibit lands (see PRINCIPLES
   *  TODO below). Shown on spotlight. */
  principle: { revenue: string; expense: string };
  cue?: CueLevel;
}

// TODO(principles-exhibit): when the Principles exhibit ships, import its
// Revenue Recognition / Expense Recognition lines instead of these copies and
// delete this block. Reference, don't redefine — the wording must not drift.
export const BASES: readonly BasisDef[] = [
  {
    id: "accrual",
    label: "ACCRUAL",
    rule: "record when EARNED / INCURRED",
    principle: {
      revenue: "Revenue Recognition — recognized when EARNED, not when cash is received.",
      expense: "Expense Recognition (AKA Matching) — recognized when the cost is INCURRED, not when cash is paid.",
    },
    cue: "must",
  },
  {
    id: "cash",
    label: "CASH",
    rule: "record when the CASH MOVES",
    principle: {
      revenue: "Cash basis — revenue lands in the month the customer actually pays.",
      expense: "Cash basis — the expense lands in the month the bill is actually paid.",
    },
    cue: "must",
  },
] as const;

export interface BasisExample {
  id: string;
  /** Mode-chip label. */
  label: string;
  /** The two months of the event strip, in order. */
  months: [string, string];
  /** The ⚡ ACTION pin — what happened in the business. */
  action: { month: string; text: string };
  /** The 💵 CASH pin — when money moved. */
  cash: { month: string; text: string };
  /** Which month each basis stamps. THE ANSWER — pinned by tests. */
  stamps: Record<BasisId, string>;
  /** Which principle line applies (picks the field off BasisDef.principle). */
  kind: "revenue" | "expense";
}

// SHARED SCENARIO — DO NOT EDIT ONE SIDE ALONE (2026-08-30).
// The EXPENSE example below is the SAME scenario as the live CEQ
// deck-e1s-1-4 "A company uses electricity in December but pays the bill in
// January. Under accrual accounting, when is the expense normally
// recognized?" → "December, when the cost is incurred" (its feedback calls
// itself "the bridge to adjusting entries", i.e. this exhibit). The CEQ is
// the source of truth: it is the graded artifact and it tees this exhibit up.
// The exhibit cannot import it — CEQs live in canvas_scenes.nodes_json and
// load async, this is a static module — so the two are kept word-aligned by
// hand. Change the CEQ and you must change these three strings, and vice
// versa. (Making the exhibit read the CEQ needs the CEQ→exhibit data link
// that does not exist yet; see the 2026-08-30 component audit.)
//
// The REVENUE example is deliberately NOT that CEQ. It is a SECOND, DIFFERENT
// illustration (a service in a mid-year month), not a drifted copy of
// deck-e1s-1-4's December product sale — different months on purpose, so
// switching examples visibly moves the columns and accrual doesn't read as a
// year-end-only rule. Same rule, different instance: leave the months alone.
export const BASIS_EXAMPLES: readonly BasisExample[] = [
  {
    id: "expense",
    label: "Expense",
    months: ["DECEMBER", "JANUARY"],
    // Wording tracks the CEQ's "uses electricity ... pays the bill".
    action: { month: "DECEMBER", text: "Electricity used — cost incurred" },
    cash: { month: "JANUARY", text: "Bill paid" },
    // ACCRUAL stamps DECEMBER: the month the cost was INCURRED. Never January.
    stamps: { accrual: "DECEMBER", cash: "JANUARY" },
    kind: "expense",
  },
  {
    id: "revenue",
    label: "Revenue",
    months: ["MAY", "JUNE"],
    action: { month: "MAY", text: "Service performed — revenue earned" },
    cash: { month: "JUNE", text: "Customer pays" },
    stamps: { accrual: "MAY", cash: "JUNE" },
    kind: "revenue",
  },
] as const;

/** The thesis. Reveals last, banner treatment. */
export const PUNCHLINE = "WHEN CASH MOVES ≠ WHEN IT COUNTS";

/** THE FOUR TIMING GAPS — the depth layer, and the on-ramp to adjusting
 *  entries. Each gap is one line: the timing mismatch, then what it creates. */
export interface TimingGap { id: string; gap: string; becomes: string }
export const TIMING_GAPS: readonly TimingGap[] = [
  { id: "prepaid", gap: "Paid before using it", becomes: "Prepaid (asset)" },
  { id: "accrued-exp", gap: "Used it before paying", becomes: "Accrued expense" },
  { id: "unearned", gap: "Collected before earning it", becomes: "Unearned revenue (liability)" },
  { id: "accrued-rev", gap: "Earned it before collecting", becomes: "Accrued revenue (A/R)" },
] as const;

export const GAPS_FOOTER = "Every adjusting entry exists to close one of these gaps.";

/** Small A+ note under the gap strip. */
export const BASIS_APLUS_NOTE =
  "Cash basis: simpler for taxes and tiny businesses. Accrual: GAAP — the truer picture of financial health.";

/** REVEAL SEQUENCE (film only): pins → ACCRUAL row + stamp → CASH row +
 *  stamp → punchline banner. The gap strip is a manual toggle, never here. */
export const BASIS_REVEAL_STEPS = ["pins", "accrual", "cash", "punchline"] as const;
export const BASIS_REVEAL_MAX = BASIS_REVEAL_STEPS.length - 1;
export type BasisBand = (typeof BASIS_REVEAL_STEPS)[number];
export const basisBandVisible = (band: BasisBand, tick: number): boolean =>
  BASIS_REVEAL_STEPS.indexOf(band) <= tick;

export const basisExample = (id: string): BasisExample | undefined =>
  BASIS_EXAMPLES.find((e) => e.id === id);
export const basisDef = (id: BasisId): BasisDef => BASES.find((b) => b.id === id)!;

/** The principle line for a basis in a given example. */
export const principleFor = (basis: BasisId, ex: BasisExample): string =>
  basisDef(basis).principle[ex.kind];

/** Node ids the exhibit declares to the shared highlight layer. */
export const basisNodeIds = (): string[] => [
  ...BASES.map((b) => b.id),
  ...BASES.map((b) => `stamp-${b.id}`),
  "pin-action",
  "pin-cash",
];

/** THE POINT, as a computed fact: in every example the two bases stamp
 *  DIFFERENT months. Exported so a test can assert the exhibit never ships an
 *  example where the lesson silently collapses. */
export const stampsDiffer = (ex: BasisExample): boolean => ex.stamps.accrual !== ex.stamps.cash;
