// "THE 5 TYPES OF ACCOUNTS" (account classification) EXHIBIT CONFIG — the
// CLASSIFIER family. This opens Analyzing Transactions and is one of the most
// reused tools in the course, so its ACCOUNT DATA does not live here: it lives
// in `account-registry.ts`, shared. This file holds only what is specific to
// THIS exhibit — which tiles exist, which accounts make the small cram set,
// the traps row, and the reveal grouping.
//
// NO COPY IS DUPLICATED FROM THE REGISTRY. A trap chip that IS a single account
// (Unearned Revenue, Dividends, …) carries only that account's id and pulls its
// note, tag and destination from the registry, so the two can never drift. Only
// the two PATTERN chips — Anything "Payable", Prepaid ___ — which are rules
// rather than accounts, carry their own copy.
//
// ACCURACY (audited against 05_Account_Classification_Source.pdf):
//   · The anchors are Lee's: OWN · OWE · VALUE · EARN · COST.
//   · Balance sheet (A, L, E) left of the divider; income statement (R, X)
//     right — the same geography as the Rubric board.
//   · Unearned Revenue is a CURRENT liability, and it is the money moment:
//     "revenue" in the name, liability in reality.
//   · Dividends are CONTRA-EQUITY, not an expense. Accumulated Depreciation is
//     a CONTRA-ASSET. Both keep their parent category and set `contra`.
//   · Payables are ALWAYS liabilities; receivables and prepaids are ALWAYS
//     assets — stated as rules, because that is how they are examined.
import { type AccountCategory, type AccountDef, account, accountsByTerm } from "./account-registry";
import type { CueLevel } from "./users-exhibit-config";

export interface ClassTileDef {
  id: AccountCategory;
  label: string;
  /** The one-word anchor (Bible law 6). */
  anchor: string;
  /** Which statement it belongs to — drives the divider. */
  side: "BS" | "IS";
  cue: CueLevel;
  /** The SMALL cram set: registry ids. The full registry shows in the depth
   *  layer, never by default. */
  cram: readonly string[];
}

export const CLASS_TILES: readonly ClassTileDef[] = [
  { id: "asset", label: "ASSETS", anchor: "OWN", side: "BS", cue: "must",
    cram: ["cash", "accounts-receivable", "supplies", "inventory", "prepaid-rent", "equipment"] },
  { id: "liability", label: "LIABILITIES", anchor: "OWE", side: "BS", cue: "must",
    cram: ["accounts-payable", "wages-payable", "unearned-revenue", "notes-payable"] },
  { id: "equity", label: "EQUITY", anchor: "VALUE", side: "BS", cue: "must",
    cram: ["common-stock", "retained-earnings", "dividends"] },
  { id: "revenue", label: "REVENUES", anchor: "EARN", side: "IS", cue: "must",
    cram: ["service-revenue", "sales-revenue", "interest-revenue"] },
  { id: "expense", label: "EXPENSES", anchor: "COST", side: "IS", cue: "must",
    cram: ["rent-expense", "salaries-expense", "utilities-expense", "cost-of-goods-sold"] },
] as const;

/** THE TRAPS BAND (Bible law 3 — the wrong answers in plain sight).
 *  `accountId` ⇒ note/tag/destination come from the registry. A pattern chip
 *  is a RULE, not an account, so it states its own. */
export interface TrapChipDef {
  id: string;
  label: string;
  accountId?: string;
  /** Pattern chips only. */
  category?: AccountCategory;
  contra?: boolean;
  note?: string;
  tag?: CueLevel;
}

export const CLASS_TRAPS: readonly TrapChipDef[] = [
  { id: "trap-ar", label: "Accounts Receivable", accountId: "accounts-receivable" },
  { id: "trap-payable", label: "Anything “Payable”", category: "liability", tag: "easy",
    note: "Payables are ALWAYS liabilities — cash we expect to PAY." },
  { id: "trap-prepaid", label: "Prepaid ___", category: "asset", tag: "easy",
    note: "Prepaids are ALWAYS assets — bought upfront, used later." },
  { id: "trap-unearned", label: "Unearned Revenue", accountId: "unearned-revenue" },
  { id: "trap-dividends", label: "Dividends", accountId: "dividends" },
  { id: "trap-accumdep", label: "Accumulated Depreciation", accountId: "accumulated-depreciation" },
  { id: "trap-cogs", label: "Cost of Goods Sold", accountId: "cost-of-goods-sold" },
] as const;

/** The category a trap chip resolves to — the tile that spotlights on click. */
export const trapCategory = (t: TrapChipDef): AccountCategory =>
  t.accountId ? account(t.accountId)!.category : t.category!;

const trapContra = (t: TrapChipDef): boolean =>
  t.accountId ? !!account(t.accountId)!.contra : !!t.contra;

/** The destination as the band prints it: ASSET · LIABILITY · CONTRA-EQUITY … */
export const trapDestination = (t: TrapChipDef): string => {
  const base = trapCategory(t).toUpperCase();
  return trapContra(t) ? `CONTRA-${base}` : base;
};

export const trapNote = (t: TrapChipDef): string =>
  t.accountId ? account(t.accountId)!.trap!.note : t.note!;

export const trapTag = (t: TrapChipDef): CueLevel =>
  t.accountId ? account(t.accountId)!.trap!.tag : t.tag!;

/** THE DEPTH LAYER — Current / Long-term, ASSETS and LIABILITIES only, off by
 *  default. On, those two tiles regroup the FULL registry under thin
 *  subdividers; intangibles surface here and nowhere else. The cram state
 *  never shows any of this. */
export const CLASS_TERM_TILES: readonly AccountCategory[] = ["asset", "liability"] as const;
export const CLASS_TERM_LABELS = {
  current: { label: "CURRENT", note: "used / owed within 1 year" },
  longterm: { label: "LONG-TERM", note: "used / owed over 1+ years" },
} as const;

export const termGroups = (category: AccountCategory): { key: "current" | "longterm"; accounts: AccountDef[] }[] =>
  (["current", "longterm"] as const).map((key) => ({ key, accounts: accountsByTerm(category, key) }));

/** REVEAL SEQUENCE (film): five tiles → anchors → example chips → traps band.
 *  The Current/Long-term toggle stays MANUAL — never a reveal step. */
export const CLASS_REVEAL_STEPS = ["tiles", "anchors", "chips", "traps"] as const;
export const CLASS_REVEAL_MAX = CLASS_REVEAL_STEPS.length - 1;
export type ClassBand = (typeof CLASS_REVEAL_STEPS)[number];
export const classBandVisible = (band: ClassBand, tick: number): boolean =>
  CLASS_REVEAL_STEPS.indexOf(band) <= tick;

// ---- node ids ------------------------------------------------------------
// Namespaced so a tile, an account chip and a trap chip can never collide.

export const acctNodeId = (accountId: string): string => `acct-${accountId}`;

export const classTile = (id: string): ClassTileDef | undefined => CLASS_TILES.find((t) => t.id === id);

/** Every account id this exhibit can paint: the cram sets plus everything the
 *  depth layer adds for assets and liabilities. */
export const classAccountIds = (): string[] => {
  const ids = CLASS_TILES.flatMap((t) => [...t.cram]);
  for (const cat of CLASS_TERM_TILES) {
    for (const g of termGroups(cat)) for (const a of g.accounts) if (!ids.includes(a.id)) ids.push(a.id);
  }
  return ids;
};

export const classNodeIds = (): string[] => [
  ...CLASS_TILES.map((t) => t.id),
  ...classAccountIds().map(acctNodeId),
  ...CLASS_TRAPS.map((t) => t.id),
];
