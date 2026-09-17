// ACCOUNTING PONG — CONTENT. Every rack is built from the shared account
// registry; nothing new is authored here except the rule wording, the trap
// lists, the one-breath "why" for each account and the cheat-code lines
// (copied from the Easy Points film plans — the source set id sits next to each).
//
// Shape after Lee's playthroughs (2026-09-16):
//   · a SECTION is a mode you pick and replay: its racks ramp 3 → 6 → 6 → 10 → 15
//     cups and then the 15-cup "final boss" keeps repeating, each rack drawing a
//     rule from the section at random (Know your accounts: a random category)
//   · contras (Accumulated Depreciation, Dividends) never appear in Know your
//     accounts; intangibles never appear anywhere
//   · an expenses rack always carries Cost of Goods Sold — the one students miss
//   · revenue cups wear the confusing names: Sales, Fees Earned, Rent Earned,
//     Interest Earned (no "Service Revenue")
//   · explanations are a few words ("Dividends — contra equity"); the cheat code
//     shown after a rack is one that actually applies to the cups that were on it
import { ACCOUNT_REGISTRY, type AccountCategory, type AccountDef } from "@/components/canvas/account-registry";
import { DC_SIDE } from "@/components/blastoff/ledger";

export type DcSide = "debit" | "credit";

const DC_KEY_OF: Record<AccountCategory, keyof typeof DC_SIDE> = {
  asset: "A", liability: "L", equity: "E", revenue: "Rev", expense: "Exp",
};

/** The side that INCREASES the account — which is also its normal balance.
 *  A contra account flips its parent's side (Accumulated Depreciation → credit,
 *  Dividends → debit; the latter matches DC_SIDE.Div). */
export function increaseSide(a: AccountDef): DcSide {
  const base = DC_SIDE[DC_KEY_OF[a.category]];
  if (!a.contra) return base;
  return base === "debit" ? "credit" : "debit";
}

export function isTemporary(a: AccountDef): boolean {
  return a.category === "revenue" || a.category === "expense" || a.id === "dividends";
}

/** Balance sheet = assets, liabilities, equity (Accumulated Depreciation rides
 *  with the assets; Dividends does NOT appear — it lives on the statement of
 *  retained earnings). Income statement = revenues and expenses. */
export type Statement = "balance-sheet" | "income-statement" | "neither";
export function statementOf(a: AccountDef): Statement {
  if (a.id === "dividends") return "neither";
  if (a.category === "revenue" || a.category === "expense") return "income-statement";
  return "balance-sheet";
}

// ---- names on the cups --------------------------------------------------------

/** The game's names where they differ from the registry label. Lee (2026-09-16):
 *  "rent earned, interest earned … keep sales, just put sales by itself, don't
 *  put service revenue, you could say fees earned". All four are registry
 *  aliases, so accountByLabel still resolves them. */
const PONG_LABEL: Record<string, string> = {
  "service-revenue": "Fees Earned",
  "sales-revenue": "Sales",
  "interest-revenue": "Interest Earned",
  "rent-revenue": "Rent Earned",
};
export const pongLabel = (a: AccountDef): string => PONG_LABEL[a.id] ?? a.label;

/** Phone-size cup labels: abbreviate the adjective only, never the noun the
 *  student has to read (Lee: "Accounts Payable" → "A/P" is NOT okay). */
const SHORT_LABEL: Record<string, string> = {
  "accumulated-depreciation": "Accum. Depreciation",
  "notes-payable-long": "LT Notes Payable",
};
export const shortLabel = (a: AccountDef): string => SHORT_LABEL[a.id] ?? pongLabel(a);

// ---- the one-breath why ----------------------------------------------------------

const CATEGORY_WORD: Record<AccountCategory, string> = {
  asset: "an asset", liability: "a liability", equity: "equity", revenue: "a revenue", expense: "an expense",
};

/** "Dividends — contra equity", "Wages Payable — payable = liability". A few words,
 *  never a sentence (Lee: "don't over explain … just say no, Dividends: contra equity"). */
const SHORT_WHY: Record<string, string> = {
  "dividends": "contra equity",
  "accumulated-depreciation": "contra asset",
  "unearned-revenue": "unearned = liability",
  "prepaid-rent": "prepaid = asset",
  "prepaid-insurance": "prepaid = asset",
  "accounts-receivable": "receivable = asset",
  "accounts-payable": "payable = liability",
  "wages-payable": "payable = liability",
  "interest-payable": "payable = liability",
  "notes-payable": "payable = liability",
  "notes-payable-long": "payable = liability",
  "mortgage-payable": "payable = liability",
  "bonds-payable": "payable = liability",
  "cost-of-goods-sold": "inventory sold = expense",
  "retained-earnings": "profits kept = equity",
  "common-stock": "owners put it in = equity",
  "supplies": "you own it until used",
  "cash": "you own it",
  "inventory": "you own it",
  "equipment": "you own it",
  "vehicles": "you own it",
  "buildings": "you own it",
  "land": "you own it",
  "service-revenue": "earned = revenue",
  "sales-revenue": "earned = revenue",
  "interest-revenue": "earned = revenue",
  "rent-revenue": "earned = revenue",
  "rent-expense": "“expense” = expense",
  "wages-expense": "“expense” = expense",
  "salaries-expense": "“expense” = expense",
  "utilities-expense": "“expense” = expense",
  "supplies-expense": "“expense” = expense",
  "insurance-expense": "“expense” = expense",
  "depreciation-expense": "“expense” = expense",
  "interest-expense": "“expense” = expense",
};
export const shortWhy = (a: AccountDef): string => SHORT_WHY[a.id] ?? CATEGORY_WORD[a.category];

/** The contra-aware group word: "asset", "contra asset", "revenue"… */
const groupWord = (a: AccountDef): string =>
  a.id === "dividends" ? "contra equity" : a.contra ? `contra ${a.category}` : a.category;

/** The why FOR THE RULE BEING PLAYED — a debit rack says "asset → debit +", a statements
 *  rack says "revenue → income statement" (Lee: "remind them why it's correct … concise
 *  minimal cheat codes"). Account types keep the name cheats ("payable = liability"). */
export function whyFor(rule: Pick<PongRule, "sectionId">, a: AccountDef): string {
  switch (rule.sectionId) {
    case "increases":
      return `${groupWord(a)} → ${increaseSide(a)} +`;
    case "normal":
      return `${groupWord(a)} → normal ${increaseSide(a)}`;
    case "statements": {
      const s = statementOf(a);
      return `${groupWord(a)} → ${s === "balance-sheet" ? "balance sheet" : s === "income-statement" ? "income statement" : "neither (a payout)"}`;
    }
    case "tempperm":
      return a.id === "retained-earnings" ? "equity → permanent, it stays"
        : `${groupWord(a)} → ${isTemporary(a) ? "temporary, closed" : "permanent"}`;
    default:
      return shortWhy(a);
  }
}

// ---- rules and sections ------------------------------------------------------------

export interface Cheat {
  /** Only shown when one of these accounts was on the rack; no `when` = always fits. */
  when?: readonly string[];
  text: string;
}

export interface PongRule {
  id: string;
  sectionId: string;
  /** "Choose every cup that is an ASSET" — the word in caps is the target. */
  instruction: string;
  shortTitle: string;
  /** Whether contra accounts (Accumulated Depreciation, Dividends) may appear. */
  includeContras: boolean;
  isCorrect: (a: AccountDef) => boolean;
  /** Account ids the rack builder favours; from 6 cups up at least one lands on the rack. */
  traps: readonly string[];
  /** Accounts that must be on every rack of this rule, when the rack is big enough. */
  mustInclude?: readonly string[];
  /** Cheat-code lines, most specific first. */
  cheats: readonly Cheat[];
}

export interface PongSection {
  id: string;
  /** The challenge's name in the lobby. */
  title: string;
  /** The supporting label under the name ("Start here", "Which accounts get closed?"). */
  blurb: string;
  /** The Easy Points set this section drills. */
  sourceSetId: string;
  /** Rack sizes in order; the last one repeats forever — the final boss. */
  ramp: readonly (3 | 6 | 10 | 15)[];
}

export const RAMP: readonly (3 | 6 | 10 | 15)[] = [3, 6, 6, 10, 15];

export const PONG_SECTIONS: readonly PongSection[] = [
  { id: "types", title: "Account types", blurb: "Start here", sourceSetId: "deck-e1s-2-1", ramp: RAMP },
  { id: "increases", title: "Debit & credit effects", blurb: "", sourceSetId: "deck-e1s-3-1", ramp: RAMP },
  { id: "normal", title: "Normal balances", blurb: "", sourceSetId: "deck-e1s-3-3", ramp: RAMP },
  { id: "statements", title: "Financial statements", blurb: "Balance sheet or income statement", sourceSetId: "new-2026-09-16", ramp: RAMP },
  { id: "tempperm", title: "Temporary & permanent", blurb: "Which accounts get closed?", sourceSetId: "deck-e1s-1-1", ramp: RAMP },
];

// Cheat codes, copied from the Easy Points film plans (source set in the name).
// deck-e1s-2-1 — Types of Accounts
const C_RECEIVABLE: Cheat = { when: ["accounts-receivable"], text: "“Receivable” = always an asset." };
const C_PREPAID: Cheat = { when: ["prepaid-rent", "prepaid-insurance"], text: "“Prepaid” = asset until you use it." };
const C_PAYABLE: Cheat = { when: ["accounts-payable", "wages-payable", "interest-payable", "notes-payable", "notes-payable-long", "mortgage-payable", "bonds-payable"], text: "“Payable” = always a liability." };
const C_UNEARNED: Cheat = { when: ["unearned-revenue"], text: "“Unearned” = liability. You still owe the work." };
const C_EARNED: Cheat = { when: ["service-revenue", "sales-revenue", "interest-revenue", "rent-revenue"], text: "Revenue = EARNED. Sales, fees, rent, interest earned." };
const C_EXPENSE: Cheat = { text: "Anything “expense” = expense." };
const C_COGS: Cheat = { when: ["cost-of-goods-sold"], text: "Cost of Goods Sold is an expense — inventory once it sells." };
const C_EQUITY: Cheat = { text: "Equity = Common Stock and Retained Earnings." };
const C_ASSET: Cheat = { text: "Asset = something you OWN." };
const C_LIABILITY: Cheat = { text: "Liability = something you OWE." };
// deck-e1s-3-1 — Debit vs. Credit
const C_DIV_DEBIT: Cheat = { when: ["dividends"], text: "Dividends starts with D → increases with a Debit." };
const C_CONTRA_FLIP: Cheat = { when: ["accumulated-depreciation"], text: "Contra = opposite. Accumulated Depreciation increases with a credit." };
const C_CASH_DEBIT: Cheat = { text: "Cash cheat code: cash received → debit. Assets and expenses grow on the debit side." };
const C_CASH_CREDIT: Cheat = { text: "Cash cheat code: cash paid → credit. Liabilities, equity and revenues grow on the credit side." };
// deck-e1s-3-3 — Normal balances
const C_NORMAL: Cheat = { text: "Normal balance = the + side." };
// deck-e1s-1-1 — The accounting cycle (closing)
const C_RE_STAYS: Cheat = { when: ["retained-earnings"], text: "Retained Earnings is where closing GOES — it stays." };
const C_DIV_TEMP: Cheat = { when: ["dividends"], text: "Dividends is closed every period — temporary." };
const C_TEMP: Cheat = { text: "Temporary = closed. Permanent = not closed." };
// new (Lee, 2026-09-16) — statements
const C_DIV_NEITHER: Cheat = { when: ["dividends"], text: "Dividends is on neither statement — it’s a payout." };
const C_BS: Cheat = { text: "Balance sheet = what you OWN, what you OWE, and the owners’ piece." };
const C_IS: Cheat = { text: "Income statement = what you EARNED minus what it COST." };

const isCat = (c: AccountCategory) => (a: AccountDef) => a.category === c;

export const PONG_RULES: readonly PongRule[] = [
  // ---- Know your accounts (no contras)
  { id: "types-assets", sectionId: "types", includeContras: false,
    instruction: "Sink every cup that is an ASSET", shortTitle: "Assets",
    isCorrect: isCat("asset"),
    traps: ["prepaid-rent", "prepaid-insurance", "accounts-payable", "accounts-receivable", "supplies"],
    cheats: [C_PREPAID, C_RECEIVABLE, C_ASSET] },
  { id: "types-liabilities", sectionId: "types", includeContras: false,
    instruction: "Sink every cup that is a LIABILITY", shortTitle: "Liabilities",
    isCorrect: isCat("liability"),
    traps: ["unearned-revenue", "accounts-receivable", "wages-expense", "interest-expense"],
    cheats: [C_UNEARNED, C_PAYABLE, C_LIABILITY] },
  { id: "types-equity", sectionId: "types", includeContras: false,
    instruction: "Sink every cup that is EQUITY", shortTitle: "Equity",
    isCorrect: isCat("equity"),
    traps: ["retained-earnings", "cash", "service-revenue"],
    cheats: [C_EQUITY] },
  { id: "types-revenues", sectionId: "types", includeContras: false,
    instruction: "Sink every cup that is a REVENUE", shortTitle: "Revenues",
    isCorrect: isCat("revenue"),
    traps: ["unearned-revenue", "accounts-receivable", "rent-revenue", "rent-expense", "interest-revenue"],
    cheats: [C_UNEARNED, C_EARNED] },
  { id: "types-expenses", sectionId: "types", includeContras: false,
    instruction: "Sink every cup that is an EXPENSE", shortTitle: "Expenses",
    isCorrect: isCat("expense"),
    traps: ["prepaid-rent", "prepaid-insurance", "supplies", "cost-of-goods-sold", "unearned-revenue"],
    mustInclude: ["cost-of-goods-sold"],
    cheats: [C_COGS, C_PREPAID, C_EXPENSE] },

  // ---- Debits & credits (contras in)
  { id: "inc-debit", sectionId: "increases", includeContras: true,
    instruction: "Sink every cup that INCREASES with a DEBIT", shortTitle: "Increases with a debit",
    isCorrect: (a) => increaseSide(a) === "debit",
    traps: ["dividends", "accumulated-depreciation", "unearned-revenue", "prepaid-rent"],
    cheats: [C_DIV_DEBIT, C_CONTRA_FLIP, C_CASH_DEBIT] },
  { id: "inc-credit", sectionId: "increases", includeContras: true,
    instruction: "Sink every cup that INCREASES with a CREDIT", shortTitle: "Increases with a credit",
    isCorrect: (a) => increaseSide(a) === "credit",
    traps: ["accumulated-depreciation", "dividends", "unearned-revenue", "accounts-receivable"],
    cheats: [C_CONTRA_FLIP, C_DIV_DEBIT, C_CASH_CREDIT] },

  // ---- Normal balances (same rule — the normal balance IS the increase side)
  { id: "normal-debit", sectionId: "normal", includeContras: true,
    instruction: "Sink every cup with a normal DEBIT balance", shortTitle: "Normal debit balance",
    isCorrect: (a) => increaseSide(a) === "debit",
    traps: ["dividends", "accumulated-depreciation", "unearned-revenue", "prepaid-insurance"],
    cheats: [C_DIV_DEBIT, C_CONTRA_FLIP, C_NORMAL] },
  { id: "normal-credit", sectionId: "normal", includeContras: true,
    instruction: "Sink every cup with a normal CREDIT balance", shortTitle: "Normal credit balance",
    isCorrect: (a) => increaseSide(a) === "credit",
    traps: ["accumulated-depreciation", "dividends", "unearned-revenue", "accounts-receivable"],
    cheats: [C_CONTRA_FLIP, C_DIV_DEBIT, C_NORMAL] },

  // ---- Balance sheet vs. income statement (Dividends is the trap on both: neither)
  { id: "stmt-balance", sectionId: "statements", includeContras: true,
    instruction: "Sink every cup that shows up on the BALANCE SHEET", shortTitle: "Balance sheet",
    isCorrect: (a) => statementOf(a) === "balance-sheet",
    traps: ["dividends", "accumulated-depreciation", "unearned-revenue", "prepaid-rent", "retained-earnings"],
    cheats: [C_DIV_NEITHER, C_BS] },
  { id: "stmt-income", sectionId: "statements", includeContras: true,
    instruction: "Sink every cup that shows up on the INCOME STATEMENT", shortTitle: "Income statement",
    isCorrect: (a) => statementOf(a) === "income-statement",
    traps: ["dividends", "unearned-revenue", "accumulated-depreciation", "depreciation-expense", "prepaid-insurance"],
    cheats: [C_DIV_NEITHER, C_IS] },

  // ---- Temporary vs. permanent (contras in; Retained Earnings is the trap)
  { id: "tp-temporary", sectionId: "tempperm", includeContras: true,
    instruction: "Sink every TEMPORARY account", shortTitle: "Temporary accounts",
    isCorrect: isTemporary,
    traps: ["retained-earnings", "dividends", "unearned-revenue"],
    cheats: [C_RE_STAYS, C_DIV_TEMP, C_TEMP] },
  { id: "tp-permanent", sectionId: "tempperm", includeContras: true,
    instruction: "Sink every PERMANENT account", shortTitle: "Permanent accounts",
    isCorrect: (a) => !isTemporary(a),
    traps: ["retained-earnings", "dividends", "accumulated-depreciation"],
    cheats: [C_RE_STAYS, C_DIV_TEMP, C_TEMP] },
];

export const sectionOf = (id: string): PongSection => {
  const s = PONG_SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error(`pong: unknown section ${id}`);
  return s;
};

export const rulesOf = (sectionId: string): PongRule[] => PONG_RULES.filter((r) => r.sectionId === sectionId);

export const ruleById = (id: string): PongRule => {
  const r = PONG_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`pong: unknown rule ${id}`);
  return r;
};

/** The first cheat that applies to the cups that were actually on the rack. */
export function cheatFor(rule: PongRule, cupIds: readonly string[]): string {
  const hit = rule.cheats.find((c) => !c.when || c.when.some((id) => cupIds.includes(id)));
  return (hit ?? rule.cheats[rule.cheats.length - 1]).text;
}

/** The accounts a rule may draw from. Intangibles (Trademarks, Copyrights, Patents,
 *  Goodwill) never appear — Lee (2026-09-16): "I'm not really teaching intangibles". */
export function poolFor(rule: Pick<PongRule, "includeContras">): AccountDef[] {
  return ACCOUNT_REGISTRY.filter((a) => !a.intangible && (rule.includeContras || !a.contra));
}
