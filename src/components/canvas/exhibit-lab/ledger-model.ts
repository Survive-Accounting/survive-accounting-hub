// THE LEDGER MODEL — one transaction bank drives THREE exhibits.
//
// The insight that keeps these connected instead of parallel: a rubric
// Scenario's `entry` (Chip[]) already IS a journal entry. So the same bank the
// Rubric teaches types with becomes the JE exhibit's entry, posts itself into
// the T-account exhibit, and rolls up into the statements exhibit:
//
//      RUBRIC  →  JOURNAL ENTRY  →  T-ACCOUNTS  →  STATEMENTS
//      (type)      (dr / cr)        (balances)     (where it lands)
//
// Every account carries its rubric AcctType, so signs, normal balances and
// statement placement are never re-derived — they come from rubric-view, the
// one source of truth the probes already grade against.
//
// PURE. No React, no film imports: this file is what makes the three exhibits
// testable and what a student build can reuse untouched.
import { ACCT_TYPES, acctType, SCENARIOS, type AcctType, type Chip, type Scenario } from "./rubric-model";
import { tSides } from "./rubric-view";

// ───────────────────────────────────────────────────────── journal entry

/** One line of a journal entry, in the shape the card prints it. */
export interface JeLine {
  account: string;
  type: AcctType;
  /** true = debit line (prints flush left, amount in the debit column). */
  dr: boolean;
  amount: number;
}

/** DEBITS FIRST, credits after — the classic silhouette. Credits are printed
 *  indented by the component; the order is the model's job. */
export function jeLines(sc: Scenario): JeLine[] {
  const of = (c: Chip): JeLine => ({ account: c.account, type: c.type, dr: c.dr, amount: c.amount ?? 0 });
  return [...sc.entry.filter((c) => c.dr).map(of), ...sc.entry.filter((c) => !c.dr).map(of)];
}

export const jeTotals = (lines: JeLine[]): { dr: number; cr: number; balanced: boolean } => {
  const dr = lines.filter((l) => l.dr).reduce((s, l) => s + l.amount, 0);
  const cr = lines.filter((l) => !l.dr).reduce((s, l) => s + l.amount, 0);
  return { dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
};

/** THE REVEAL PIECES (Lee's "one piece at a time"). A JE reveals as:
 *  the description, then for each line its ACCOUNT, then its AMOUNT. Anything
 *  not yet revealed prints as ??? — present, unreadable, obviously pending. */
export type JePieceKind = "desc" | "account" | "amount";
export interface JePiece { kind: JePieceKind; line: number }

export function jePieces(lines: JeLine[]): JePiece[] {
  const out: JePiece[] = [{ kind: "desc", line: -1 }];
  lines.forEach((_, i) => { out.push({ kind: "account", line: i }, { kind: "amount", line: i }); });
  return out;
}

/** Is this piece revealed at step `n` (0 = nothing, pieces.length = all)? */
export function pieceShown(pieces: JePiece[], n: number, kind: JePieceKind, line: number): boolean {
  const i = pieces.findIndex((p) => p.kind === kind && p.line === line);
  return i >= 0 && i < n;
}

export const MASK = "???";

// ─────────────────────────────────────────────────────────── t-accounts

/** One posting into a T — the amount ALWAYS carries a label (Lee: "the amounts
 *  all have a label"): the transaction that put it there. */
export interface TPost { label: string; amount: number; dr: boolean; scenarioId?: string }

export interface TAccount {
  account: string;
  type: AcctType;
  /** Beginning balance, as a signed amount on the account's NORMAL side. */
  opening: number;
  posts: TPost[];
  drTotal: number;
  crTotal: number;
  /** Ending balance, always positive; `side` says which column it sits on. */
  balance: number;
  side: "dr" | "cr";
}

/** POST a set of transactions into T-accounts. Accounts appear in first-touched
 *  order, which is the order they get taught in. `openings` seeds beginning
 *  balances (on the account's normal side). */
export function postToTs(scenarios: readonly Scenario[], openings: Record<string, number> = {}): TAccount[] {
  const map = new Map<string, TAccount>();
  const touch = (account: string, type: AcctType): TAccount => {
    let t = map.get(account);
    if (!t) {
      const opening = openings[account] ?? 0;
      t = { account, type, opening, posts: [], drTotal: 0, crTotal: 0, balance: 0, side: tSides(type).normal === "left" ? "dr" : "cr" };
      map.set(account, t);
    }
    return t;
  };
  // Seed every opening first, so a beginning balance shows even for an account
  // this batch never touches.
  for (const [account, amt] of Object.entries(openings)) {
    const type = typeOfAccount(account);
    if (type) touch(account, type).opening = amt;
  }
  for (const sc of scenarios) {
    for (const c of sc.entry) {
      const t = touch(c.account, c.type);
      t.posts.push({ label: sc.text, amount: c.amount ?? 0, dr: c.dr, scenarioId: sc.id });
    }
  }
  for (const t of map.values()) {
    const normalDr = tSides(t.type).normal === "left";
    t.drTotal = (normalDr ? t.opening : 0) + t.posts.filter((p) => p.dr).reduce((s, p) => s + p.amount, 0);
    t.crTotal = (normalDr ? 0 : t.opening) + t.posts.filter((p) => !p.dr).reduce((s, p) => s + p.amount, 0);
    const net = t.drTotal - t.crTotal;
    t.balance = Math.abs(net);
    t.side = net >= 0 ? "dr" : "cr";
  }
  return [...map.values()];
}

/** Which rubric type owns this account name (the COA is the lookup). */
export function typeOfAccount(account: string): AcctType | null {
  for (const t of ACCT_TYPES) {
    const list = (SCENARIOS.flatMap((s) => s.entry).filter((c) => c.type === t.id).map((c) => c.account));
    if (list.includes(account)) return t.id;
  }
  return null;
}

/** STAGGERED ROWS (Lee's format): debits and credits interleave down the T in
 *  posting order, so the eye reads the story in time, not two stacked columns.
 *  Every row keeps its side, so it still prints in the right column. */
export interface TRow { side: "dr" | "cr"; label: string; amount: number; kind: "opening" | "post" | "balance" }

export function tRows(t: TAccount): TRow[] {
  const rows: TRow[] = [];
  if (t.opening) rows.push({ side: tSides(t.type).normal === "left" ? "dr" : "cr", label: "Beg. balance", amount: t.opening, kind: "opening" });
  for (const p of t.posts) rows.push({ side: p.dr ? "dr" : "cr", label: p.label, amount: p.amount, kind: "post" });
  return rows;
}

/** The ending-balance row — drawn under the rule, on its own side. */
export const tBalanceRow = (t: TAccount): TRow => ({ side: t.side, label: "End. balance", amount: t.balance, kind: "balance" });

/** TRIAL BALANCE — the proof the ledger still balances after posting. */
export function trialBalance(ts: TAccount[]): { dr: number; cr: number; balanced: boolean } {
  const dr = ts.filter((t) => t.side === "dr").reduce((s, t) => s + t.balance, 0);
  const cr = ts.filter((t) => t.side === "cr").reduce((s, t) => s + t.balance, 0);
  return { dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
}

// ────────────────────────────────────────────────────── the statements

export interface StatementRow { label: string; amount: number; indent?: boolean; rule?: boolean }
export interface Statement { title: string; rows: StatementRow[]; totalLabel: string; total: number }

/** A statement row for every account of a type, SIGNED against that account's
 *  NORMAL side. An account can end up on the wrong side (pay rent with no
 *  opening cash and Cash carries a credit balance) — reporting that as a
 *  positive asset silently breaks A = L + E, which the per-scenario test
 *  caught. A contra-side balance is negative, and prints in parentheses. */
const balancesOf = (ts: TAccount[], type: AcctType): StatementRow[] =>
  ts.filter((t) => t.balance > 0.005 && t.type === type).map((t) => ({
    label: t.account,
    amount: t.side === (tSides(t.type).normal === "left" ? "dr" : "cr") ? t.balance : -t.balance,
  }));

const sum = (rows: StatementRow[]): number => rows.reduce((s, r) => s + r.amount, 0);

/** INCOME STATEMENT — revenues less expenses. Net income is the bridge. */
export function incomeStatement(ts: TAccount[]): Statement {
  const rev = balancesOf(ts, "R");
  const exp = balancesOf(ts, "X");
  return {
    title: "Income Statement",
    // Detail first, THEN its total under a rule — a total printed above the
    // lines it sums is backwards, and on camera that reads as an error.
    rows: [...rev, ...exp.map((r) => ({ ...r, indent: true })), { label: "Total expenses", amount: sum(exp), rule: true }],
    totalLabel: "Net income",
    total: sum(rev) - sum(exp),
  };
}

export const netIncome = (ts: TAccount[]): number => sum(balancesOf(ts, "R")) - sum(balancesOf(ts, "X"));

/** RETAINED EARNINGS — THE BRIDGE the rubric names: net income and dividends
 *  are why the income statement changes equity at all. */
export function retainedEarnings(ts: TAccount[]): Statement {
  const beg = ts.find((t) => t.account === "Retained Earnings")?.opening ?? 0;
  const ni = netIncome(ts);
  const div = ts.find((t) => t.account === "Dividends")?.balance ?? 0;
  return {
    title: "Retained Earnings",
    rows: [
      { label: "Beginning retained earnings", amount: beg },
      { label: "Net income", amount: ni },
      { label: "Dividends", amount: div === 0 ? 0 : -div },
    ],
    totalLabel: "Ending retained earnings",
    total: beg + ni - div,
  };
}

/** BALANCE SHEET — A = L + E, with equity carrying the ending R/E. */
export function balanceSheet(ts: TAccount[]): { assets: Statement; claims: Statement; balanced: boolean } {
  const a = balancesOf(ts, "A");
  const l = balancesOf(ts, "L");
  const equityAccounts = ts.filter((t) => t.type === "E" && t.account !== "Retained Earnings" && t.account !== "Dividends" && t.balance > 0.005)
    .map((t) => ({ label: t.account, amount: t.balance }));
  const re = retainedEarnings(ts).total;
  const claimRows: StatementRow[] = [...l, ...equityAccounts, { label: "Retained earnings", amount: re }];
  const assets: Statement = { title: "Assets", rows: a, totalLabel: "Total assets", total: sum(a) };
  const claims: Statement = { title: "Liabilities + Equity", rows: claimRows, totalLabel: "Total L + E", total: sum(claimRows) };
  return { assets, claims, balanced: Math.abs(assets.total - claims.total) < 0.005 };
}

// ───────────────────────────────────────────────────────── the ledger set

/** THE DEMO LEDGER — the transactions the three exhibits walk by default.
 *  A small, exam-shaped story: fund it, buy things, earn, accrue, pay. */
export const LEDGER_SET: readonly string[] = ["owner-invest", "supplies-cash", "services-account", "rent-cash", "wages-accrue"];

export const ledgerScenarios = (ids: readonly string[] = LEDGER_SET): Scenario[] =>
  ids.map((id) => SCENARIOS.find((s) => s.id === id)).filter((s): s is Scenario => !!s);

/** Which side of the pipe an account reports on — the statements exhibit uses
 *  it to place a T-account without re-deriving anything. */
export const reportsOn = (type: AcctType): "BS" | "IS" => acctType(type).side;
