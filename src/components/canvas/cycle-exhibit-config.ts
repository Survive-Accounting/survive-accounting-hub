// CYCLE EXHIBIT CONFIG (cycle-modes) — the AUTHORABLE per-step content behind
// the Accounting Cycle card's mode switcher. Lee edits THIS file:
//
//   · SOURCE DOCS mode — which source document(s) feed each step ({docName, icon}).
//   · DEFINITIONS mode — the cram-version one-liner per step (text diet: this is
//     the definition Lee reads on camera, not the textbook's).
//   · ORDER mode — which step starts END OF PERIOD (the trial-balance handoff),
//     derived from the same matcher.
//
// The canvas card's steps are author-edited free text with generated ids, so
// entries match by KEYWORD ROWS against the normalized label (same trick as the
// Lab's cycle-model keys): a row matches when all its words appear. ROWS ARE
// ORDERED AND FIRST-MATCH-WINS — the order below is deliberate (post-closing
// before closing before the generic trial balance, unadjusted before adjusted)
// so overlapping labels land on the right entry. Add new rows anywhere sensible;
// keep the collision-prone ones in their audited order.
//
// Pure data + pure functions; tested in exhibit-modes.test.ts. No data model
// changes — nothing here is persisted with the scene.

/** Icon ids the card maps to its inline (lucide) line icons. */
export type CycleDocIcon = "invoice" | "receipt" | "check" | "bank" | "journal" | "ledger" | "trial-balance";

export interface CycleDoc { docName: string; icon: CycleDocIcon }

export interface CycleStepInfo {
  id: string;
  /** Keyword rows — the step label matches when ANY row's words ALL appear. */
  keys: string[][];
  /** Source documents that FEED this step (SOURCE DOCS mode). */
  docs: CycleDoc[];
  /** 1–2 sentences max (DEFINITIONS mode). */
  definition: string;
}

export const CYCLE_STEP_INFO: readonly CycleStepInfo[] = [
  {
    id: "analyze",
    keys: [["analyz"], ["identify", "transact"]],
    docs: [
      { docName: "Invoice", icon: "invoice" },
      { docName: "Receipt", icon: "receipt" },
      { docName: "Bank statement", icon: "bank" },
    ],
    definition: "Read each source document and decide which accounts it touches, and by how much.",
  },
  {
    id: "journalize",
    keys: [["journal"], ["je"]],
    docs: [{ docName: "The journal", icon: "journal" }],
    definition: "Write each transaction as a journal entry — debits first, credits indented, debits = credits.",
  },
  {
    // BEFORE "post" and "closing" — its label contains both.
    id: "post-closing-tb",
    keys: [["post closing"], ["postclosing"]],
    docs: [{ docName: "The ledger", icon: "ledger" }],
    definition: "One last trial balance, only permanent accounts left — proof the books are ready for a new period.",
  },
  {
    id: "post",
    keys: [["post"]],
    docs: [{ docName: "The journal", icon: "journal" }],
    definition: "Copy every journal line into its T-account so each account shows a running balance.",
  },
  {
    // BEFORE "adjusted" — "unadjusted" contains it.
    id: "unadjusted-tb",
    keys: [["unadjusted"]],
    docs: [{ docName: "The ledger", icon: "ledger" }],
    definition: "List every account balance — total debits must equal total credits, before adjustments.",
  },
  {
    id: "adjusted-tb",
    keys: [["adjusted"]],
    docs: [{ docName: "The ledger", icon: "ledger" }],
    definition: "The trial balance re-run with adjustments in — the statements are built from these numbers.",
  },
  {
    id: "adjusting",
    keys: [["adjust"], ["adj"]],
    docs: [
      { docName: "Adjustment schedules", icon: "ledger" },
      { docName: "Bank statement", icon: "bank" },
    ],
    definition: "Year-end accruals and deferrals — record revenue earned and expenses incurred that cash hasn't caught up with.",
  },
  {
    id: "statements",
    keys: [["statement"], ["stmt"], ["financial"]],
    docs: [{ docName: "Adjusted trial balance", icon: "trial-balance" }],
    definition: "Income statement → retained earnings → balance sheet, in that order — each one feeds the next.",
  },
  {
    id: "closing",
    keys: [["clos"], ["year end"]],
    docs: [{ docName: "Adjusted trial balance", icon: "trial-balance" }],
    definition: "Zero out the temporary accounts — revenues, expenses, dividends — into Retained Earnings so next period starts clean.",
  },
  {
    // LAST: the plain "Trial Balance" step (the 7-step template) — the meet
    // point of the two period arcs when no explicit "unadjusted" step exists.
    id: "trial-balance",
    keys: [["trial balance"], ["trial"], ["tb"]],
    docs: [{ docName: "The ledger", icon: "ledger" }],
    definition: "List every account balance — total debits must equal total credits.",
  },
] as const;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** First-match-wins lookup for an authored step label. */
export function cycleStepInfo(label: string): CycleStepInfo | undefined {
  const t = norm(label);
  if (!t) return undefined;
  return CYCLE_STEP_INFO.find((row) => row.keys.some((ks) => ks.every((k) => t.includes(norm(k)))));
}

/** ORDER mode's period framing: END OF PERIOD begins at the first trial-balance
 *  step (the unadjusted TB — where the DURING arc hands off). −1 ⇒ no TB step
 *  authored, so the card skips the arcs rather than guessing. */
const TB_START = new Set(["unadjusted-tb", "trial-balance"]);
export function endOfPeriodStart(stepLabels: readonly string[]): number {
  return stepLabels.findIndex((l) => { const id = cycleStepInfo(l)?.id; return !!id && TB_START.has(id); });
}
