// THE RUBRIC — model (Exhibit Lab v2, §4). Pure; tested.
//
//   A = L + E  |  Revs & Exps
//
// Left of the pipe: the balance-sheet universe. Right: the income statement.
// Signs: (+/−) left of the equals sign; (−/+) on L + E — the flip is the point.
// Revenue lives with Equity (earning increases equity); expenses are Equity's
// opposite (they reduce NI → R/E → Equity). The chip tray IS a journal entry
// being assembled — when it balances it becomes one (the payoff on camera).
//
// Content is GENERIC to any campus: no school, professor, or date lives here.
import type { RunStepDef } from "./probe-run";
import type { ProbeId } from "./probes";

export type AcctType = "A" | "L" | "E" | "R" | "X";

export interface AcctTypeDef {
  id: AcctType;
  label: string;
  /** Which side of the pipe. */
  side: "BS" | "IS";
  /** The sign pair as the rubric prints it. */
  sign: "+/−" | "−/+";
  /** Which side INCREASES this type. */
  increase: "Dr" | "Cr";
  /** Why the sign is what it is — the step-3 reveal. */
  why: string;
}

export const ACCT_TYPES: readonly AcctTypeDef[] = [
  { id: "A", label: "Asset", side: "BS", sign: "+/−", increase: "Dr", why: "Left of the equals sign: assets go up with a debit (+/−)." },
  { id: "L", label: "Liability", side: "BS", sign: "−/+", increase: "Cr", why: "Right of the equals sign: the signs flip — liabilities go up with a credit (−/+)." },
  { id: "E", label: "Equity", side: "BS", sign: "−/+", increase: "Cr", why: "Equity sits with L on the right: up with a credit (−/+)." },
  { id: "R", label: "Revenue", side: "IS", sign: "−/+", increase: "Cr", why: "Revenue LIVES WITH EQUITY — earning increases equity, so revenue goes up with a credit." },
  { id: "X", label: "Expense", side: "IS", sign: "+/−", increase: "Dr", why: "Expenses are equity's OPPOSITE — they reduce NI → R/E → Equity, so they go up with a debit." },
] as const;

export const acctType = (id: AcctType): AcctTypeDef => ACCT_TYPES.find((t) => t.id === id)!;

/** Generic account lists per type — the narrowed universe at zoom step 2. */
export const ACCOUNTS: Record<AcctType, string[]> = {
  A: ["Cash", "Accounts Receivable", "Supplies", "Prepaid Insurance", "Prepaid Rent", "Inventory", "Equipment", "Accumulated Depreciation"],
  L: ["Accounts Payable", "Wages Payable", "Interest Payable", "Unearned Revenue", "Notes Payable"],
  E: ["Common Stock", "Retained Earnings", "Dividends"],
  R: ["Service Revenue", "Sales Revenue", "Interest Revenue"],
  X: ["Rent Expense", "Wages Expense", "Supplies Expense", "Insurance Expense", "Depreciation Expense", "Interest Expense"],
};

/** Dr/Cr for a type given whether the account goes UP or DOWN. */
export function signFor(type: AcctType, increase: boolean): "Dr" | "Cr" {
  const inc = acctType(type).increase;
  return increase ? inc : inc === "Dr" ? "Cr" : "Dr";
}

export interface Chip {
  account: string;
  type: AcctType;
  /** true = debit line */
  dr: boolean;
  amount?: number;
}

/** The tray resolves into a journal entry when it BALANCES: at least one debit
 *  and one credit, and — when every chip carries an amount — equal totals. */
export function entryBalanced(chips: Chip[]): boolean {
  const d = chips.filter((c) => c.dr), c = chips.filter((c) => !c.dr);
  if (!d.length || !c.length) return false;
  if (chips.every((x) => x.amount != null)) {
    const sum = (xs: Chip[]) => xs.reduce((s, x) => s + (x.amount ?? 0), 0);
    return Math.abs(sum(d) - sum(c)) < 0.005;
  }
  return true;
}

/** Journal-entry lines: debits first, credits indented — the payoff shape. */
export function journalLines(chips: Chip[]): { account: string; dr?: number; cr?: number; indent: boolean }[] {
  return [...chips.filter((c) => c.dr), ...chips.filter((c) => !c.dr)].map((c) => ({ account: c.account, ...(c.dr ? { dr: c.amount } : { cr: c.amount }), indent: !c.dr }));
}

// ------------------------------------------------------------- scenarios

export interface Scenario {
  id: string;
  text: string;
  entry: Chip[];
  /** For ACCRUAL OR DEFERRAL: when cash moves relative to the recognition. */
  cash?: "before" | "after" | "same";
}

/** Generic, exam-shaped transactions — the seed bank for the Lab. */
export const SCENARIOS: readonly Scenario[] = [
  { id: "supplies-cash", text: "Bought $500 of supplies, paid cash.", entry: [{ account: "Supplies", type: "A", dr: true, amount: 500 }, { account: "Cash", type: "A", dr: false, amount: 500 }], cash: "same" },
  { id: "services-account", text: "Performed $1,200 of services on account.", entry: [{ account: "Accounts Receivable", type: "A", dr: true, amount: 1200 }, { account: "Service Revenue", type: "R", dr: false, amount: 1200 }], cash: "after" },
  { id: "rent-cash", text: "Paid $900 rent for the month.", entry: [{ account: "Rent Expense", type: "X", dr: true, amount: 900 }, { account: "Cash", type: "A", dr: false, amount: 900 }], cash: "same" },
  { id: "bank-loan", text: "Borrowed $10,000 from the bank on a note.", entry: [{ account: "Cash", type: "A", dr: true, amount: 10000 }, { account: "Notes Payable", type: "L", dr: false, amount: 10000 }], cash: "same" },
  { id: "owner-invest", text: "Owners invested $5,000 cash for stock.", entry: [{ account: "Cash", type: "A", dr: true, amount: 5000 }, { account: "Common Stock", type: "E", dr: false, amount: 5000 }], cash: "same" },
  { id: "unearned", text: "Received $2,000 cash in advance for services next month.", entry: [{ account: "Cash", type: "A", dr: true, amount: 2000 }, { account: "Unearned Revenue", type: "L", dr: false, amount: 2000 }], cash: "before" },
  { id: "prepaid-ins", text: "Paid $1,200 for a 12-month insurance policy.", entry: [{ account: "Prepaid Insurance", type: "A", dr: true, amount: 1200 }, { account: "Cash", type: "A", dr: false, amount: 1200 }], cash: "before" },
  { id: "wages-accrue", text: "Employees earned $800 of wages by year-end, unpaid.", entry: [{ account: "Wages Expense", type: "X", dr: true, amount: 800 }, { account: "Wages Payable", type: "L", dr: false, amount: 800 }], cash: "after" },
] as const;

export const scenarioById = (id: string): Scenario => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

// ------------------------------------------------------- what if we don't?

export interface OmissionEffect { item: string; effect: "overstated" | "understated" }

/** Trace an OMITTED entry through A = L + E: each unrecorded line leaves its
 *  account off by its direction, and an unrecorded revenue/expense carries
 *  through NI → R/E → Equity. */
export function whatIfWeDont(entry: Chip[]): OmissionEffect[] {
  const out: OmissionEffect[] = [];
  const seen = new Set<string>();
  const push = (item: string, effect: OmissionEffect["effect"]) => { const k = item + effect; if (!seen.has(k)) { seen.add(k); out.push({ item, effect }); } };
  for (const c of entry) {
    const t = acctType(c.type);
    const increased = (t.increase === "Dr") === c.dr; // this line moved the account UP
    const label = t.id === "X" ? "Expenses" : t.id === "R" ? "Revenue" : t.id === "A" ? "Assets" : t.id === "L" ? "Liabilities" : "Equity";
    // Skipping the entry leaves an increase unrecorded (understated) or a
    // decrease unrecorded (overstated).
    push(`${label} (${c.account})`, increased ? "understated" : "overstated");
    if (t.id === "R") { push("Net income", increased ? "understated" : "overstated"); push("Equity (via R/E)", increased ? "understated" : "overstated"); }
    if (t.id === "X") { push("Net income", increased ? "overstated" : "understated"); push("Equity (via R/E)", increased ? "overstated" : "understated"); }
  }
  return out;
}

// -------------------------------------------------------------- flip it

/** Mirror the entry: same accounts, opposite sides. */
export const flipIt = (entry: Chip[]): Chip[] => entry.map((c) => ({ ...c, dr: !c.dr }));

// ---------------------------------------------------- accrual or deferral

export type AccrualOrDeferral = "accrual" | "deferral" | "neither";

/** Cash BEFORE the revenue/expense = deferral; cash AFTER = accrual; same time
 *  = neither (a plain cash transaction). */
export function classifyTiming(cash: Scenario["cash"]): AccrualOrDeferral {
  return cash === "before" ? "deferral" : cash === "after" ? "accrual" : "neither";
}

export const TIMING_WHY: Record<AccrualOrDeferral, string> = {
  deferral: "Cash moved FIRST; the revenue/expense is recognized later — a deferral (prepaid / unearned).",
  accrual: "The revenue/expense is recognized FIRST; cash moves later — an accrual (receivable / payable).",
  neither: "Cash and the recognition happen together — a plain cash transaction, not an adjusting entry.",
};

// ----------------------------------------------- probes → rubric steps

const TYPE_OPTIONS = ACCT_TYPES.map((t) => t.label);
const typeByLabel = (label: string): AcctType | undefined => ACCT_TYPES.find((t) => t.label === label)?.id;

/** ONE ROUND of the Four Questions, for the chip the student is about to
 *  place. The Rubric appends a round each time "anything else?" is answered
 *  yes. Step 3 (the sign) is OPTIONAL — togglable off per run (§4). */
export function fourQuestionRound(round: number): RunStepDef[] {
  const r = `r${round}`;
  return [
    { id: `${r}.type`, prompt: "What TYPE of account is affected?", kind: "choice", options: TYPE_OPTIONS, explain: "Pick the region of the rubric — everything else dims.", data: { q: "type", round } },
    { id: `${r}.account`, prompt: "Which SPECIFIC account?", kind: "choice", options: [], explain: "Only that type's accounts remain — choose the one.", data: { q: "account", round } },
    { id: `${r}.sign`, prompt: "Increase or decrease — so debit or credit?", kind: "sign", options: ["Debit", "Credit"], explain: "", data: { q: "sign", round }, optional: true },
    { id: `${r}.else`, prompt: "Anything ELSE affected?", kind: "confirm", options: ["Yes", "No — it balances"], explain: "Zoom back out: every entry has at least two sides.", data: { q: "else", round } },
  ];
}

/** Check a Four-Questions answer against the scenario's expected entry.
 *  `placed` = chips already in the tray; returns correctness + the chip the
 *  answer resolves to (when it does). */
export function checkFourQuestions(sc: Scenario, placed: Chip[], stepQ: string, pending: Partial<Chip>, response: string): { correct: boolean; chip?: Partial<Chip>; explain: string } {
  const remaining = sc.entry.filter((e) => !placed.some((p) => p.account === e.account && p.dr === e.dr));
  if (stepQ === "type") {
    const t = typeByLabel(response);
    const ok = !!t && remaining.some((e) => e.type === t);
    return { correct: ok, chip: t ? { type: t } : undefined, explain: ok ? `${response} — ${acctType(t!).why}` : `Not ${response}. Still open in this entry: ${remaining.map((e) => `${acctType(e.type).label} (${e.account})`).join(", ")}.` };
  }
  if (stepQ === "account") {
    const hit = remaining.find((e) => e.account === response && e.type === pending.type);
    return { correct: !!hit, chip: { account: response }, explain: hit ? `${response} — pinned to the tray.` : `The account this entry needs here is ${remaining.filter((e) => e.type === pending.type).map((e) => e.account).join(" / ") || "a different type"}.` };
  }
  if (stepQ === "sign") {
    const hit = remaining.find((e) => e.account === pending.account);
    const want = hit ? (hit.dr ? "Debit" : "Credit") : null;
    const ok = want != null && response === want;
    const t = pending.type ? acctType(pending.type) : null;
    return { correct: ok, chip: { dr: response === "Debit" }, explain: `${want ?? "?"}: ${hit ? (hit.dr === (t?.increase === "Dr") ? `${pending.account} goes UP` : `${pending.account} goes DOWN`) : ""} — ${t?.why ?? ""}` };
  }
  // else
  const more = remaining.length > 0;
  const saidYes = response.startsWith("Yes");
  return { correct: saidYes === more, explain: more ? `Yes — ${remaining.length} more side${remaining.length === 1 ? "" : "s"} to place before it balances.` : "No — the entry balances: debits = credits." };
}

/** WHAT IF WE DON'T? — one step per effect the omission causes. */
export function whatIfSteps(sc: Scenario): RunStepDef[] {
  return whatIfWeDont(sc.entry).map((fx, i) => ({
    id: `wi${i}`,
    prompt: `If this entry is skipped: ${fx.item} is…`,
    kind: "choice",
    options: ["Overstated", "Understated", "Unaffected"],
    explain: `${fx.item} is ${fx.effect.toUpperCase()} — the skipped line would have moved it the other way.`,
    data: { expect: fx.effect === "overstated" ? "Overstated" : "Understated" },
  }));
}

/** FLIP IT — mirror each line; the student names the new side. */
export function flipSteps(sc: Scenario): RunStepDef[] {
  return flipIt(sc.entry).map((c, i) => ({
    id: `fl${i}`,
    prompt: `Flip it — same transaction, opposite side. ${c.account} becomes a…`,
    kind: "sign",
    options: ["Debit", "Credit"],
    explain: `${c.account} flips to a ${c.dr ? "debit" : "credit"} — the mirror entry ${c.dr === (acctType(c.type).increase === "Dr") ? "increases" : "decreases"} it.`,
    data: { expect: c.dr ? "Debit" : "Credit" },
  }));
}

/** ACCRUAL OR DEFERRAL? — one step: which, then the why is the reveal. */
export function timingSteps(sc: Scenario): RunStepDef[] {
  const answer = classifyTiming(sc.cash);
  const label = answer === "accrual" ? "Accrual" : answer === "deferral" ? "Deferral" : "Neither";
  return [{ id: "ad0", prompt: "Accrual or deferral — which is it?", kind: "choice", options: ["Accrual", "Deferral", "Neither"], explain: `${label}. ${TIMING_WHY[answer]}`, data: { expect: label } }];
}

/** Which probes this exhibit can run (§4 probe compatibility). */
export const RUBRIC_PROBES: readonly ProbeId[] = ["four_questions", "what_if_we_dont", "flip_it", "accrual_or_deferral"] as const;

export { checkExpect } from "./probe-run";
