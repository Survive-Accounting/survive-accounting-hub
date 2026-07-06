// Journal Entry Scenario Engine — PURE functions, no React, no fetch, no Supabase.
//
// The atom of this system is NOT a journal entry. It is a *Scenario*: a real-world
// event that produces journal entries which vary based on *conditions*. A Scenario
// declares condition axes and holds enumerated variants, each tagged with the
// condition values it represents. A journal entry is what you get when you fix the
// conditions. The ledger (T-accounts), financial statements, the trial balance, and
// the accounting equation are all LIVE PROJECTIONS computed from the entry here —
// never separately authored. "One truth, many views."
//
// This module is intentionally decoupled so its projection outputs can later feed not
// just the student tool but an auto-rendered video pipeline (Remotion / Motion-Canvas).
// Keep it pure: no imports that pull in React, the Supabase client, or any I/O.

// We reuse the existing JeLine field names from the CEQ Resource Bank so the JE shape
// stays unified across the app. `import type` is erased at build time, so this does NOT
// pull the Supabase client (which ceq-api imports) into this pure module.
import type { JeLine } from "@/lib/ceq-api";
// v2 numbers layer — type-only imports from the (equally pure) math core.
import type { BondParams } from "@/lib/je/amortization";
import type { MisconceptionId } from "@/lib/je/misconceptions";

// ============================================================================
// Data model — the canonical ScenarioDoc lives in `je_scenarios.doc` (jsonb).
// We store each scenario as a single jsonb document; we are prototyping and will
// iterate the shape constantly, so we do NOT over-normalize into many tables yet.
// ============================================================================

export interface ScenarioDoc {
  slug: string; // stable, unique, e.g. "sell-equipment-cash"
  title: string; // "Sell equipment for cash"
  event: string; // plain-English narrative of the underlying event
  courseFamilies?: string[]; // ["intro2","ia1"] — for filtering later
  conceptIds?: string[]; // links to existing concepts spine (optional in seeds)
  principleKeys?: string[]; // e.g. ["historical_cost","matching"]
  axes: ConditionAxis[]; // declared condition dimensions (render as toggles)
  variants: Variant[]; // enumerated; each tagged with its condition values

  // ---- v2 UI flags (optional; default off). These gate placeholder sections in /je.
  // They live in the jsonb doc so no schema change is needed to toggle them per scenario.
  // The engine never branches on these — they are presentation hints only, so this stays pure.
  isSequence?: boolean; // lifecycle/multi-entry topic → show the (stubbed) sequence sidebar
  sequenceGroup?: string; // optional group key tying related sequence scenarios together
  hasMemorizationGrid?: boolean; // topic with a memorize-this grid (bonds, merchandising) → show placeholder grid

  // ---- v2 numbers layer (all optional; a doc without them is a valid Phase-1 doc).
  // Slot keys everywhere use the amortization ref scheme:
  //   "param:<name>" | "issuePrice" | "schedule:<period>:<field>"
  // (see src/lib/je/amortization.ts header). amount-resolver.ts turns a doc + selected
  // conditions into concrete amounts by building the schedule and reading these refs.
  params?: ScenarioParamsSpec; // parameter spec + randomizer seed for concrete numbers
  memorize?: MemorizeItem[]; // memorize-this content (renders in the memorization grid)
  questions?: ScenarioQuestion[]; // practice questions with misconception-tagged distractors
  traces?: TraceGroup[]; // named ref groups the UI highlights together (click-through tracing)
  build?: BuildSpec; // "build the entry yourself" mode: account bank (with decoys) + scaffold

  // Per-doc panel-visibility override. When present, `panels` IS the set of visible panels
  // (keys from PANEL_KEYS), overriding the global defaults. Additive — omit for global behavior.
  ui?: { panels?: string[] };
}

// ---- v2 numbers-layer shapes -------------------------------------------------

export interface ScenarioParamsSpec {
  /** Parameter family. Only "bond" exists today; future families extend this union. */
  kind: "bond";
  /** The worked-example defaults (the canonical numbers the doc is authored against). */
  defaults: BondParams;
  /**
   * RESERVED for the randomizer: bounds for generated params (face/term/etc.). The
   * generator currently uses its built-in clean-number rules (see generateParams);
   * ranges tighten them later without a schema change.
   */
  ranges?: {
    faceMin?: number;
    faceMax?: number;
    termYearsMin?: number;
    termYearsMax?: number;
  };
  /** Seed used when the UI wants "fresh numbers" deterministically. */
  defaultSeed?: number;
}

export interface MemorizeItem {
  kind: "formula" | "mnemonic" | "tip" | "watchout";
  body: string;
  /** Slot refs this item explains — the UI lights these when the item is focused. */
  traceRefs?: string[];
}

export interface QuestionDistractor {
  /** Expression in slot-ref terms, e.g. "schedule:1:cashPayment" or "param:face * param:marketRateAnnual / 2". */
  expr: string;
  misconceptionId: MisconceptionId;
  /** Optional override of the misconception's reusable feedback template. */
  feedback?: string;
}

export interface ScenarioQuestion {
  id: string;
  /** Prompt template; may reference params, e.g. "…for the first {periodMonths}-month period?" */
  prompt: string;
  /** The correct answer as a slot-ref expression. */
  answerExpr: string;
  distractors: QuestionDistractor[];
}

export interface TraceGroup {
  id: string;
  label: string;
  /** Slot refs highlighted together (entry cell ↔ schedule cell ↔ formula input). */
  refs: string[];
}

export interface BuildSpec {
  /** The bank the student assembles the entry from; decoys are plausible wrong accounts. */
  accountBank: { account: string; decoy?: boolean }[];
  /** Optional scaffold note shown while building. */
  scaffold?: string;
}

export interface ConditionAxis {
  key: string; // "outcome"
  label: string; // "Sale outcome"
  options: { value: string; label: string }[]; // [{value:"gain",label:"At a gain"}, ...]
}

export interface Variant {
  id: string; // stable within scenario, e.g. "gain" (CEQs/sequences reference this)
  label?: string;
  conditions: Record<string, string>; // { outcome: "gain" } — matches axis keys/values
  // A variant is EITHER an entry scenario (entries non-empty) OR a "computation scenario"
  // (entries absent/empty AND computationPaths non-empty) — e.g. EPS, income taxes, cash
  // flows, which center on a computation with no journal entry. The schema enforces this.
  entries?: EntryTemplate[]; // usually 1; perpetual sale has 2; omitted for computation scenarios
  computationPaths?: ComputationPath[]; // how amounts are derived; the primary content when there are no entries
}

export interface EntryTemplate {
  id: string; // stable within scenario
  caption?: string; // "Entry to record the sale"
  lines: EngineLine[];
}

export interface EngineLine extends JeLine {
  // JeLine = { account, side, label, tooltip }
  id: string; // stable (CEQs will target a specific line/cell later)
  why?: string; // reasoning for THIS line ("why this account/side")
  trap?: string; // why a tempting WRONG account/side is wrong (trap-first pedagogy)
  conceptIds?: string[];
  principleKeys?: string[];
  amount?: number | null; // Phase 1: null/omitted = ??? . Engine accepts it for Phase 2.
  amountSlotKey?: string; // PHASE 2 SEAM: links amount to a computation-path output
}

export interface ComputationPath {
  id: string;
  appliesWhen?: Record<string, string>; // which axis values select this path, e.g. { given: "months_elapsed" }
  narration: string; // "4 of 12 months elapsed, so recognize 4/12 of the contract..."
  // PHASE 2 SEAM: real formula graph. `resultSlotKey` will bind to EngineLine.amountSlotKey.
  steps?: { label: string; formulaText?: string; resultSlotKey?: string }[];
}

// ============================================================================
// Account metadata — sourced from chart_of_accounts. This is what makes
// projections possible: asset/liability/equity → balance sheet; revenue/expense →
// income statement; contra accounts follow their parent.
// ============================================================================

export type AccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense"
  | "contra_asset"
  | "contra_liability"
  | "contra_equity"
  | "contra_revenue"
  | "liability_adjunct"; // present in the seed COA (e.g. Premium on Bonds Payable)

export interface AccountMeta {
  canonical_name: string;
  account_type: AccountType;
  normal_balance: "debit" | "credit";
}

export type Side = "debit" | "credit";
export type Dir = "up" | "down" | "none" | "unknown";

/** Stable pointer back to a specific posting — powers bidirectional highlight. */
export interface PostingRef {
  entryId: string;
  lineId: string;
}

// ============================================================================
// Internal helpers
// ============================================================================

/** Normalize the `entry | entry[]` argument the projection functions accept. */
function asEntries(input: EntryTemplate | EntryTemplate[]): EntryTemplate[] {
  return Array.isArray(input) ? input : [input];
}

function buildCoaMap(coa: AccountMeta[]): Map<string, AccountMeta> {
  return new Map(coa.map((a) => [a.canonical_name, a]));
}

/**
 * Which side of the accounting equation an account sits on. The key insight that
 * makes projections trivial: within a bucket, a *debit* always pushes the asset side
 * up and the liability+equity side down (and vice-versa), regardless of whether the
 * account is "contra" — because the contra's normal balance already encodes its sign.
 */
type EquationBucket = "assets" | "liabilities" | "equity";

function bucketOf(type: AccountType | undefined): EquationBucket | null {
  switch (type) {
    case "asset":
    case "contra_asset":
      return "assets";
    case "liability":
    case "contra_liability":
    case "liability_adjunct":
      return "liabilities";
    case "equity":
    case "contra_equity":
    case "revenue":
    case "contra_revenue":
    case "expense":
      return "equity";
    default:
      return null; // unknown type — can't classify
  }
}

/** Effect of a posting on its equation bucket's TOTAL (not the account's own balance). */
function bucketDirection(bucket: EquationBucket, side: Side): "up" | "down" {
  if (bucket === "assets") return side === "debit" ? "up" : "down";
  // liabilities + equity both increase on a credit, decrease on a debit
  return side === "credit" ? "up" : "down";
}

/** Effect of a posting on the ACCOUNT's own balance (toward/away from normal side). */
function accountBalanceDirection(meta: AccountMeta | undefined, side: Side): Dir {
  if (!meta) return "unknown";
  return side === meta.normal_balance ? "up" : "down";
}

/** Is this an income-statement account? (revenue/expense and their contras + modeled gains/losses) */
function isIncomeAccount(type: AccountType | undefined): boolean {
  return type === "revenue" || type === "contra_revenue" || type === "expense";
}

/** Is this a balance-sheet account? */
function isBalanceSheetAccount(type: AccountType | undefined): boolean {
  return (
    type === "asset" ||
    type === "contra_asset" ||
    type === "liability" ||
    type === "contra_liability" ||
    type === "liability_adjunct" ||
    type === "equity" ||
    type === "contra_equity"
  );
}

function hasAmount(line: EngineLine): boolean {
  return typeof line.amount === "number" && !Number.isNaN(line.amount);
}

// ============================================================================
// resolveVariant — fix the conditions, get the variant. THE centerpiece call.
// ============================================================================

/**
 * Returns the variant whose `conditions` match the selected toggle values. Matches
 * only on the keys the variant specifies (a variant may pin a subset of axes).
 * Returns null when no authored variant matches → the UI shows "not built yet".
 */
export function resolveVariant(
  scenario: ScenarioDoc,
  selectedConditions: Record<string, string>,
): Variant | null {
  for (const variant of scenario.variants) {
    const keys = Object.keys(variant.conditions);
    const matches = keys.every((k) => selectedConditions[k] === variant.conditions[k]);
    if (matches) return variant;
  }
  return null;
}

/**
 * Pick the computation path that applies for the given conditions. A path with no
 * `appliesWhen` is a catch-all. Used to drive the "why/how the amount is derived"
 * narration that changes even when the entry itself does not.
 */
export function resolveComputationPath(
  variant: Variant,
  selectedConditions: Record<string, string>,
): ComputationPath | null {
  const paths = variant.computationPaths ?? [];
  if (paths.length === 0) return null;
  for (const path of paths) {
    if (!path.appliesWhen) continue;
    const keys = Object.keys(path.appliesWhen);
    if (keys.every((k) => selectedConditions[k] === path.appliesWhen![k])) return path;
  }
  // fall back to a catch-all path (no appliesWhen) if present
  return paths.find((p) => !p.appliesWhen) ?? null;
}

// ============================================================================
// Validation & balance
// ============================================================================

/** Structural validation: an entry needs at least one debit and one credit. */
export function validateEntry(entry: EntryTemplate): string[] {
  const problems: string[] = [];
  const lines = entry.lines.filter((l) => l.account.trim());
  if (lines.length < 2) problems.push("An entry needs at least two lines.");
  if (!lines.some((l) => l.side === "debit")) problems.push("An entry needs at least one debit.");
  if (!lines.some((l) => l.side === "credit")) problems.push("An entry needs at least one credit.");
  return problems;
}

/**
 * `"unknown"` when amounts are absent (the common Phase 1 case). When every line has a
 * numeric amount, compares debit and credit totals. Accepts one entry or many — for an
 * array, EVERY entry must individually balance.
 */
export function isBalanced(input: EntryTemplate | EntryTemplate[]): true | false | "unknown" {
  const entries = asEntries(input);
  let sawUnknown = false;
  for (const entry of entries) {
    let dr = 0;
    let cr = 0;
    for (const line of entry.lines) {
      if (!line.account.trim()) continue;
      if (!hasAmount(line)) {
        sawUnknown = true;
        continue;
      }
      if (line.side === "debit") dr += line.amount as number;
      else cr += line.amount as number;
    }
    if (sawUnknown) continue;
    if (Math.abs(dr - cr) > 0.005) return false;
  }
  return sawUnknown ? "unknown" : true;
}

// ============================================================================
// deriveLedger — the ONE ledger implementation. Generalizes deriveTAccounts to
// multiple entries. ResourceBankSection.deriveTAccounts delegates to this.
// ============================================================================

export interface LedgerPosting {
  entryId: string;
  lineId: string;
  label?: string; // line.label, e.g. "proceeds" or "???"
  amount?: number | null;
}

export interface LedgerAccount {
  account: string;
  meta?: AccountMeta;
  normalBalance?: Side; // convenience copy of meta.normal_balance
  debits: LedgerPosting[];
  credits: LedgerPosting[];
  balance: number | null; // net magnitude when amounts exist; null = unknown
  balanceSide: Side | null; // which side the net balance lands on; null = unknown
}

/**
 * Per account: debit postings and credit postings (each tagged with {entryId,lineId}),
 * the account's normal-balance side, and a net balance when amounts exist. `coa` may be
 * empty/partial — accounts missing from it simply have undefined `meta` (fine for
 * Phase 1, where amounts and normal-balance side are not yet needed).
 */
export function deriveLedger(entries: EntryTemplate[], coa: AccountMeta[]): LedgerAccount[] {
  const coaMap = buildCoaMap(coa);
  const map = new Map<string, LedgerAccount>();
  // Preserve first-seen account order for stable rendering.
  const order: string[] = [];

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.account.trim()) continue;
      let acct = map.get(line.account);
      if (!acct) {
        const meta = coaMap.get(line.account);
        acct = {
          account: line.account,
          meta,
          normalBalance: meta?.normal_balance,
          debits: [],
          credits: [],
          balance: null,
          balanceSide: null,
        };
        map.set(line.account, acct);
        order.push(line.account);
      }
      const posting: LedgerPosting = {
        entryId: entry.id,
        lineId: line.id,
        label: line.label,
        amount: line.amount ?? null,
      };
      if (line.side === "debit") acct.debits.push(posting);
      else acct.credits.push(posting);
    }
  }

  // Compute net balances only when every posting on the account has an amount.
  for (const acct of map.values()) {
    const all = [...acct.debits, ...acct.credits];
    const allHaveAmounts = all.every((p) => typeof p.amount === "number" && !Number.isNaN(p.amount));
    if (!allHaveAmounts || all.length === 0) continue;
    const dr = acct.debits.reduce((s, p) => s + (p.amount as number), 0);
    const cr = acct.credits.reduce((s, p) => s + (p.amount as number), 0);
    const net = dr - cr;
    acct.balance = Math.abs(net);
    acct.balanceSide = net === 0 ? null : net > 0 ? "debit" : "credit";
  }

  return order.map((name) => map.get(name)!);
}

// ============================================================================
// deriveStatementEffects — structured (not text) financial-statement movement.
// ============================================================================

export interface StatementLineEffect {
  account: string;
  accountType?: AccountType;
  dir: Dir; // direction of THIS line item's own balance (up/down)
  refs: PostingRef[]; // entry lines that drove it (for highlight)
}

export interface CashFlowEffect {
  touchesCash: boolean;
  dir: Dir; // direction of Cash
  classification?: "operating" | "investing" | "financing" | "unknown";
}

export interface StatementEffects {
  income: StatementLineEffect[]; // revenue / expense / contra-revenue lines that move
  balanceSheet: StatementLineEffect[]; // asset / liability / equity lines that move
  cashFlow: CashFlowEffect;
}

const INVESTING_ACCOUNTS = new Set([
  "Equipment",
  "Buildings",
  "Land",
  "Accumulated Depreciation—Equipment",
  "Accumulated Depreciation—Buildings",
  "Patents",
  "Goodwill",
  "Notes Receivable",
]);

const FINANCING_ACCOUNTS = new Set([
  "Bonds Payable",
  "Notes Payable",
  "Common Stock",
  "Preferred Stock",
  "Paid-in Capital in Excess of Par",
  "Dividends",
  "Dividends Payable",
  "Treasury Stock",
]);

/**
 * Structured statement movement for an entry (or entries): income-statement lines that
 * move with direction, balance-sheet lines with direction, and a cash-flow flag. With
 * unknown amounts we still express *direction* (↑/↓) per line; net category roll-ups are
 * left to the equation projection.
 */
export function deriveStatementEffects(
  input: EntryTemplate | EntryTemplate[],
  coa: AccountMeta[],
): StatementEffects {
  const entries = asEntries(input);
  const coaMap = buildCoaMap(coa);

  // Aggregate per account so the same account hit twice shows as one statement line.
  const income = new Map<string, StatementLineEffect>();
  const balanceSheet = new Map<string, StatementLineEffect>();
  let touchesCash = false;
  let cashDir: Dir = "none";
  let cashClass: CashFlowEffect["classification"] = undefined;

  const allAccounts = new Set<string>();

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.account.trim()) continue;
      allAccounts.add(line.account);
      const meta = coaMap.get(line.account);
      const type = meta?.account_type;
      const dir = accountBalanceDirection(meta, line.side);
      const ref: PostingRef = { entryId: entry.id, lineId: line.id };

      if (isIncomeAccount(type)) {
        upsertEffect(income, line.account, type, dir, ref);
      } else if (isBalanceSheetAccount(type)) {
        upsertEffect(balanceSheet, line.account, type, dir, ref);
      }

      if (line.account === "Cash") {
        touchesCash = true;
        cashDir = line.side === "debit" ? "up" : "down";
      }
    }
  }

  if (touchesCash) {
    // Best-effort classification by the *other* accounts in the entry.
    const others = [...allAccounts].filter((a) => a !== "Cash");
    if (others.some((a) => INVESTING_ACCOUNTS.has(a))) cashClass = "investing";
    else if (others.some((a) => FINANCING_ACCOUNTS.has(a))) cashClass = "financing";
    else if (others.length > 0) cashClass = "operating";
    else cashClass = "unknown";
  }

  return {
    income: [...income.values()],
    balanceSheet: [...balanceSheet.values()],
    cashFlow: { touchesCash, dir: touchesCash ? cashDir : "none", classification: cashClass },
  };
}

function upsertEffect(
  map: Map<string, StatementLineEffect>,
  account: string,
  accountType: AccountType | undefined,
  dir: Dir,
  ref: PostingRef,
): void {
  const existing = map.get(account);
  if (existing) {
    existing.refs.push(ref);
    // If two postings disagree on direction and we can't net them, mark unknown.
    if (existing.dir !== dir) existing.dir = "unknown";
  } else {
    map.set(account, { account, accountType, dir, refs: [ref] });
  }
}

// ============================================================================
// deriveEquationEffect — A = L + E holding.
// ============================================================================

export interface EquationEffect {
  assets: Dir;
  liabilities: Dir;
  equity: Dir;
  balanced: boolean | "unknown";
}

/**
 * Net direction per equation bucket. With unknown amounts, a bucket that receives both
 * an increase and a decrease is reported as "unknown" (we can't net without numbers);
 * a bucket touched in only one direction reports that direction; an untouched bucket is
 * "none". `balanced` mirrors isBalanced (true/false/"unknown").
 */
export function deriveEquationEffect(
  input: EntryTemplate | EntryTemplate[],
  coa: AccountMeta[],
): EquationEffect {
  const entries = asEntries(input);
  const coaMap = buildCoaMap(coa);

  // Track signed contributions per bucket so we can net when amounts exist.
  const seen: Record<EquationBucket, { up: boolean; down: boolean; net: number; known: boolean }> = {
    assets: { up: false, down: false, net: 0, known: true },
    liabilities: { up: false, down: false, net: 0, known: true },
    equity: { up: false, down: false, net: 0, known: true },
  };

  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.account.trim()) continue;
      const meta = coaMap.get(line.account);
      const bucket = bucketOf(meta?.account_type);
      if (!bucket) continue;
      const dir = bucketDirection(bucket, line.side);
      const slot = seen[bucket];
      if (dir === "up") slot.up = true;
      else slot.down = true;
      if (hasAmount(line)) slot.net += (dir === "up" ? 1 : -1) * (line.amount as number);
      else slot.known = false;
    }
  }

  const resolve = (b: EquationBucket): Dir => {
    const slot = seen[b];
    if (!slot.up && !slot.down) return "none";
    if (slot.known) {
      if (Math.abs(slot.net) < 0.005) return "none";
      return slot.net > 0 ? "up" : "down";
    }
    // amounts unknown: agree → that direction; conflict → unknown
    if (slot.up && slot.down) return "unknown";
    return slot.up ? "up" : "down";
  };

  return {
    assets: resolve("assets"),
    liabilities: resolve("liabilities"),
    equity: resolve("equity"),
    balanced: isBalanced(entries),
  };
}

// ============================================================================
// tracePostingsToStatementLine — reverse lookup powering bidirectional highlight:
// tap a statement/ledger line → see the entry lines behind it.
// ============================================================================

export function tracePostingsToStatementLine(
  input: EntryTemplate | EntryTemplate[],
  _coa: AccountMeta[],
  accountName: string,
): PostingRef[] {
  const entries = asEntries(input);
  const refs: PostingRef[] = [];
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.account === accountName) refs.push({ entryId: entry.id, lineId: line.id });
    }
  }
  return refs;
}

// ============================================================================
// PHASE 2 — Parameterized numbers (reserved; not used yet).
// A generator produces fresh numbers per attempt. EngineLine.amountSlotKey +
// ComputationPath.steps[].resultSlotKey are the seams (already in the types above).
// ============================================================================

// PHASE 2 — not yet used. A resolved set of amounts for one attempt, keyed by slot.
export interface AmountBindings {
  [slotKey: string]: number;
}

// PHASE 2 — not yet used. Reserved generator signature.
export type AmountGenerator = (scenario: ScenarioDoc, variant: Variant, seed?: number) => AmountBindings;

// PHASE 2 — not yet used. "Build it backwards": show the statement/ledger effect and
// have the student construct the entry that produces it. Reuses deriveStatementEffects /
// tracePostingsToStatementLine as the answer key — no new engine logic.
export interface BuildBackwardsPrompt {
  scenarioSlug: string;
  variantId: string;
  show: StatementEffects;
}

// ============================================================================
// PHASE 3 — Lifecycle sequences (horizontal view). Reserved so scenarios/variants
// (stable ids) can be referenced. A lifecycle can span multiple periods, so adjusting
// entries, statements, and reversing entries appear BETWEEN transaction steps.
// ============================================================================

// PHASE 3 — not yet used.
export type SequenceStep =
  | { kind: "entry"; scenarioSlug: string; variantId?: string; narration?: string }
  | { kind: "period_end"; label: string; narration?: string } // time passes here
  | { kind: "adjusting"; scenarioSlug?: string; variantId?: string; inlineEntry?: EntryTemplate; narration?: string }
  | { kind: "statements"; show: ("income" | "balance" | "equation")[]; narration?: string } // show financials here
  | { kind: "reversing"; reversesStepId: string; narration?: string }; // defined by the adjusting step it undoes

// PHASE 3 — not yet used.
export interface SequenceDoc {
  slug: string;
  title: string;
  conceptIds?: string[];
  steps: (SequenceStep & { id: string })[];
}

// ============================================================================
// PHASE — CEQ references. CEQs are a SEPARATE layer that reference scenarios. Reserved
// shape so the (stable) ids that scenarios/variants/lines carry can be targeted later.
// Do NOT build CEQ authoring now.
// ============================================================================

// PHASE — not yet used.
export interface CeqScenarioRef {
  scenarioSlug: string;
  variantId?: string;
  targetEntryId?: string;
  targetLineId?: string;
}
