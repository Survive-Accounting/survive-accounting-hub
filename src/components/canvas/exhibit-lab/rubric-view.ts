// RUBRIC VIEW MODEL (Rubric v2) — the pure half of the navigable exhibit:
// T-account geometry, the one-word definitions, the COA account NODES, the
// authored reveal sequence, and the zoom/breadcrumb order.
//
// NO React, NO film imports, NO probe imports. The rubric ships to students
// one day, so its model stays dependency-light and its component stays
// controlled; the filming keys live in a wrapper (RubricExhibit), never here.
import { ACCOUNTS, ACCT_TYPES, acctType, type AcctType } from "./rubric-model";

/** The one-word definition under each element (§2a). Small caps, muted. */
export const DEFS: Record<AcctType, string> = { A: "OWN", L: "OWE", E: "VALUE", R: "EARNED", X: "COSTS" };

/** How the rubric prints each element, and its zoomed-in header. */
export const ELEMENT_LABEL: Record<AcctType, string> = { A: "A", L: "L", E: "E", R: "Revs", X: "Exps" };
export const ELEMENT_FULL: Record<AcctType, string> = { A: "ASSETS", L: "LIABILITIES", E: "EQUITY", R: "REVENUES", X: "EXPENSES" };

/** Left → right across the rubric. Also the breadcrumb + number-key order. */
export const ELEMENT_ORDER: readonly AcctType[] = ["A", "L", "E", "R", "X"] as const;

// --------------------------------------------------------- the T-account

/** THE MINI T (§2b). Left column is DEBIT, right is CREDIT — always, for every
 *  element; what changes is which side carries the "+".
 *
 *  Derived from the ONE source of truth (acctType().increase) so the signs can
 *  never drift from the model the probes grade against. An accounting tool with
 *  a backwards normal balance is dead on arrival, so the table is asserted
 *  verbatim in the tests:
 *      Assets      + left · − right      Liabilities  − left · + right
 *      Equity      − left · + right      Revenues     − left · + right
 *      Expenses    + left · − right
 *
 *  `normal` is the NORMAL-BALANCE side — the "+" side, the one that renders
 *  emphasized (bolt-orange) while the other is muted. */
export interface TSides { left: "+" | "−"; right: "+" | "−"; normal: "left" | "right" }

export function tSides(type: AcctType): TSides {
  const dr = acctType(type).increase === "Dr";
  return { left: dr ? "+" : "−", right: dr ? "−" : "+", normal: dr ? "left" : "right" };
}

// ------------------------------------------------------------- COA nodes

/** An account chip in a zoomed element view, modeled as a shared-exhibit-layer
 *  NODE: stable id + element + label. Drag-to-journal-entry is PARKED (§6) —
 *  this shape exists so that pass is additive, not a rewrite. */
export interface CoaNode { id: string; element: AcctType; label: string }

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const coaNodeId = (element: AcctType, label: string): string => `coa:${element}:${slug(label)}`;

/** That element's accounts, in COA order, as nodes. */
export function coaNodes(element: AcctType): CoaNode[] {
  return ACCOUNTS[element].map((label) => ({ id: coaNodeId(element, label), element, label }));
}

/** Every account node — the id space the exhibit layer would declare. */
export const ALL_COA_NODES: readonly CoaNode[] = ACCT_TYPES.flatMap((t) => coaNodes(t.id));

// -------------------------------------------------------- statements layer

/** Which statement an element lands on (§4). Text diet: these two strings and
 *  "R/E" are the ONLY words this layer may paint. */
export const STATEMENT_OF: Record<AcctType, "BALANCE SHEET" | "INCOME STATEMENT"> =
  Object.fromEntries(ACCT_TYPES.map((t) => [t.id, t.side === "BS" ? "BALANCE SHEET" : "INCOME STATEMENT"])) as Record<AcctType, "BALANCE SHEET" | "INCOME STATEMENT">;

/** The bridge at the divider: four characters on screen, the concept in the
 *  icon, the full name only in the tooltip. */
export const BRIDGE_LABEL = "R/E";
export const BRIDGE_TITLE = "Statement of Retained Earnings";

// ---------------------------------------------------- progressive reveal

/** THE AUTHORED BUILD ORDER (§5) — the 2022 clicker style. Step 1 is a blank
 *  canvas; each Tab adds exactly one layer. */
export const REVEAL_FIRST = 1;
export const REVEAL_LAST = 7;

export interface RevealState {
  /** A = L + E itself. */
  bsEq: boolean;
  /** OWN · OWE · VALUE. */
  bsDefs: boolean;
  /** The T-accounts under A, L, E. */
  bsTs: boolean;
  /** The divider + Revs & Exps. */
  isEq: boolean;
  /** EARNED · COSTS. */
  isDefs: boolean;
  /** The T-accounts under Revs, Exps. */
  isTs: boolean;
  /** The statements layer may paint (AND-ed with the user's toggle). */
  statements: boolean;
}

/** What is visible at a reveal step. `null` = FREE MODE: the navigable exhibit,
 *  everything on. Pure. */
export function visibleAt(step: number | null): RevealState {
  if (step == null) return { bsEq: true, bsDefs: true, bsTs: true, isEq: true, isDefs: true, isTs: true, statements: true };
  const s = Math.max(REVEAL_FIRST, Math.min(REVEAL_LAST, step));
  return {
    bsEq: s >= 2,
    bsDefs: s >= 3,
    bsTs: s >= 4,
    isEq: s >= 5,
    isDefs: s >= 6,
    isTs: s >= 6,
    statements: s >= 7,
  };
}

export const nextReveal = (s: number): number => Math.min(REVEAL_LAST, s + 1);
export const prevReveal = (s: number): number => Math.max(REVEAL_FIRST, s - 1);

/** Authoring HUD only — NEVER painted in a captured frame. */
export const REVEAL_LABELS: readonly string[] = [
  "blank",
  "A = L + E",
  "defs · OWN OWE VALUE",
  "T-accounts · A L E",
  "divider + Revs & Exps",
  "defs + Ts · EARNED COSTS",
  "statements layer",
] as const;

// ═══════════════════════════════════════════════ v3: the teaching board ═══
// The rubric is not one picture — it is a picture with switches. Every piece
// (signs · defs · account lists · T-accounts · movement arrows · statements)
// turns on and off independently, and a MODE is just a named set of switches
// for the question being taught. Pure; the component only paints what this
// says.

/** ASSET GROUPS — students need to see the two piles, not one long column.
 *  The split is a SEAM INDEX into ACCOUNTS.A, so the flat list stays the one
 *  source of truth (the probes narrow against it). */
export const CURRENT_ASSET_COUNT = 6; // Cash … Inventory

export interface CoaGroup { label?: string; nodes: CoaNode[] }

/** The account list for an element, grouped for display. Only Assets split. */
export function coaGroups(element: AcctType): CoaGroup[] {
  const all = coaNodes(element);
  if (element !== "A") return [{ nodes: all }];
  return [
    { label: "CURRENT", nodes: all.slice(0, CURRENT_ASSET_COUNT) },
    { label: "LONG TERM", nodes: all.slice(CURRENT_ASSET_COUNT) },
  ];
}

/** CONTRA accounts — they sit inside a type but carry the OPPOSITE sign pair.
 *  Called out on the board because they are the classic trap. */
export const CONTRA: Record<string, { of: AcctType; label: string }> = {
  "coa:A:accumulated-depreciation": { of: "A", label: "CONTRA ASSET" },
  "coa:E:dividends": { of: "E", label: "CONTRA EQUITY" },
};
export const isContra = (id: string): boolean => id in CONTRA;

/** The sign pair as the board prints it: left of the slash is the DEBIT side.
 *  A contra account flips its type's pair. */
export function signPair(type: AcctType, contra = false): { left: "+" | "−"; right: "+" | "−" } {
  const t = tSides(type);
  return contra ? { left: t.right, right: t.left } : { left: t.left, right: t.right };
}

// ------------------------------------------------------------- movements

/** ↑ ↓ ↑↓ — the movement Lee clicks through while working a transaction.
 *  Cycles none → up → down → both → none. */
export type Movement = "up" | "down" | "both" | null;
export const nextMovement = (m: Movement): Movement => (m == null ? "up" : m === "up" ? "down" : m === "down" ? "both" : null);
export const MOVEMENT_GLYPH: Record<"up" | "down" | "both", string> = { up: "↑", down: "↓", both: "↑↓" };

// --------------------------------------------------------------- switches

export interface RubricToggles {
  /** The (+/−) pair ABOVE each element — Lee's preferred spot. */
  signs: boolean;
  /** Light the + bolt-orange. OFF = both signs one colour (they are just the
   *  pair); ON = the normal-balance lesson. */
  normal: boolean;
  /** OWN · OWE · VALUE · EARNED · COSTS. */
  defs: boolean;
  /** The individual accounts under each type — the whole COA in one picture. */
  accounts: boolean;
  /** The mini T-account (debit column | credit column). */
  tAccounts: boolean;
  /** The ↑/↓ movement row. */
  arrows: boolean;
  /** BALANCE SHEET · R/E bridge · INCOME STATEMENT. */
  statements: boolean;
}

export const ALL_OFF: RubricToggles = { signs: false, normal: false, defs: false, accounts: false, tAccounts: false, arrows: false, statements: false };

/** TEACHING MODES — a named set of switches for the question being taught.
 *  A mode is a STARTING POINT, never a lock: every switch stays adjustable
 *  after you pick one (that is the playground). */
export type RubricMode = "types" | "drcr" | "normal" | "statements" | "moves" | "all";

export const MODES: { id: RubricMode; name: string; blurb: string; toggles: RubricToggles }[] = [
  { id: "types", name: "Types", blurb: "What TYPE of account is ___?", toggles: { ...ALL_OFF, defs: true, accounts: true } },
  { id: "drcr", name: "Debits / Credits", blurb: "Which side increases it?", toggles: { ...ALL_OFF, signs: true, tAccounts: true, defs: true } },
  { id: "normal", name: "Normal balances", blurb: "What is the normal balance of ___?", toggles: { ...ALL_OFF, signs: true, normal: true, accounts: true } },
  { id: "statements", name: "Statements", blurb: "Which statement does it land on?", toggles: { ...ALL_OFF, statements: true, defs: true } },
  { id: "moves", name: "Movements", blurb: "A = L + E — what moves, and which way?", toggles: { ...ALL_OFF, arrows: true, signs: true } },
  { id: "all", name: "All", blurb: "Everything open — the playground.", toggles: { signs: true, normal: true, defs: true, accounts: true, tAccounts: true, arrows: true, statements: true } },
];

export const modeById = (id: RubricMode): RubricToggles => MODES.find((m) => m.id === id)!.toggles;
export const MODE_IDS: readonly RubricMode[] = MODES.map((m) => m.id);

/** The mode whose switches match exactly, or null once Lee has tweaked one. */
export function matchMode(t: RubricToggles): RubricMode | null {
  const m = MODES.find((x) => (Object.keys(ALL_OFF) as (keyof RubricToggles)[]).every((k) => x.toggles[k] === t[k]));
  return m ? m.id : null;
}
