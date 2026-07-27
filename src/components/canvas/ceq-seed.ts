// CEQ SEED (Lee — content only) — pre-seeds the Ch 1-5 CEQ sets as first-class
// SETS (one card deck each, idempotent by a stable deck id). Every question is a
// STANDARD ceq card (existing kind / interaction model UNCHANGED): a single-answer
// MC (T/F = a two-choice MC). Stems + choices are mechanical; ALL chains + memos
// are EMPTY — Lee records his voice later. Sources: Foundations 30-account COA,
// 19 core + 4 adjusting + 4 closing scenarios, and the misconception map
// (FLIP, CASH_ONLY, MISS_EQUITY, BOTH_SIDES, SINGLE_SIDE, EXPENSE_TOO_EARLY).
import { addDeck, newDeckDef, updateDeck } from "./deck-defs";
import { addNodesCmd, bus, compositeCmd, removeNodesCmd, type RfLike } from "./commands";
import { cardId, type DeckDef } from "./types";
import type { ReactFlowInstance } from "@xyflow/react";

type SC = { text: string; correct?: boolean };
type SQ = { stem: string; choices: SC[] };
type SSet = { key: string; name: string; questions: SQ[] };

/** MC helper — correct first (rotated to a varied slot at seed time). */
const q = (stem: string, correct: string, ...d: string[]): SQ => ({ stem, choices: [{ text: correct, correct: true }, ...d.map((t) => ({ text: t }))] });
/** True/False as a two-choice MC. */
const tf = (stem: string, ans: boolean): SQ => ({ stem, choices: ans ? [{ text: "True", correct: true }, { text: "False" }] : [{ text: "True" }, { text: "False", correct: true }] });

// ---- Foundations 30-account COA (name → classification) ---------------------
type AType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
const COA: { name: string; type: AType }[] = [
  { name: "Cash", type: "Asset" }, { name: "Accounts Receivable", type: "Asset" }, { name: "Supplies", type: "Asset" },
  { name: "Prepaid Insurance", type: "Asset" }, { name: "Prepaid Rent", type: "Asset" }, { name: "Inventory", type: "Asset" },
  { name: "Equipment", type: "Asset" }, { name: "Land", type: "Asset" }, { name: "Building", type: "Asset" },
  { name: "Accumulated Depreciation", type: "Asset" }, // contra-asset (classified under Assets) — trap
  { name: "Accounts Payable", type: "Liability" }, { name: "Notes Payable", type: "Liability" }, { name: "Unearned Revenue", type: "Liability" },
  { name: "Salaries Payable", type: "Liability" }, { name: "Interest Payable", type: "Liability" }, { name: "Taxes Payable", type: "Liability" },
  { name: "Dividends Payable", type: "Liability" },
  { name: "Common Stock", type: "Equity" }, { name: "Retained Earnings", type: "Equity" },
  { name: "Dividends", type: "Equity" }, // contra-equity — trap
  { name: "Service Revenue", type: "Revenue" }, { name: "Sales Revenue", type: "Revenue" }, { name: "Interest Revenue", type: "Revenue" },
  { name: "Rent Expense", type: "Expense" }, { name: "Salaries Expense", type: "Expense" }, { name: "Utilities Expense", type: "Expense" },
  { name: "Supplies Expense", type: "Expense" }, { name: "Insurance Expense", type: "Expense" }, { name: "Depreciation Expense", type: "Expense" },
  { name: "Cost of Goods Sold", type: "Expense" },
];
const TYPES: AType[] = ["Asset", "Liability", "Equity", "Revenue", "Expense"];
const acc = (name: string) => COA.find((a) => a.name === name)!;
const ch1Q = (name: string): SQ => { const a = acc(name); return q(`What type of account is ${a.name}?`, a.type, ...TYPES.filter((t) => t !== a.type)); };

// ---- CH1 · Types of Accounts ------------------------------------------------
const CH1_FULL_NAMES = ["Cash", "Accounts Receivable", "Supplies", "Prepaid Insurance", "Inventory", "Equipment", "Land", "Accumulated Depreciation", "Accounts Payable", "Notes Payable", "Unearned Revenue", "Salaries Payable", "Common Stock", "Retained Earnings", "Dividends", "Service Revenue", "Sales Revenue", "Rent Expense", "Salaries Expense", "Utilities Expense", "Supplies Expense", "Depreciation Expense"]; // 22
const CH1_FREE_NAMES = ["Cash", "Accounts Payable", "Common Stock", "Service Revenue", "Rent Expense", "Accumulated Depreciation", "Unearned Revenue"]; // 7 (traps: Accum Deprec, Unearned; holds Dividends/Retained Earnings back)

// ---- CH2 · A = L + E effects ------------------------------------------------
const AE_UP = "Assets ↑ and Equity ↑", AL_UP = "Assets ↑ and Liabilities ↑", A_SWAP = "One asset ↑, another asset ↓ (total assets unchanged)", AL_DN = "Assets ↓ and Liabilities ↓", AE_DN = "Assets ↓ and Equity ↓";
const A_ONLY_UP = "Assets ↑ only (nothing else moves)", A_ONLY_DN = "Assets ↓ only (nothing else moves)";
const CH2_FULL: SQ[] = [
  q("Owner invests $10,000 cash in exchange for common stock. Which sides move?", AE_UP, AL_UP, A_ONLY_UP, "Assets ↑ and Equity ↓"),
  q("The company borrows $5,000 cash from the bank on a note. Which sides move?", AL_UP, AE_UP, A_ONLY_UP, "Liabilities ↑ and Equity ↑"),
  q("Pay $3,000 cash for equipment. Which sides move?", A_SWAP, "Assets ↑ and Liabilities ↑", A_ONLY_UP, "Assets ↓ and Equity ↓"),
  q("Pay $100 cash for supplies. Which choice shows the effect?", "Assets −$100 (Cash) and +$100 (Supplies) — net $0", "Assets −$100 and Equity −$100", "Assets −$100 only", "Assets +$100 only"),
  q("Buy $200 of supplies on account. Which sides move?", AL_UP, A_SWAP, A_ONLY_UP, AE_UP),
  q("Provide services for $1,000 cash. Which sides move?", AE_UP, AL_UP, A_ONLY_UP, "Assets ↑ and Equity ↓"),
  q("Provide services for $1,500 on account. Which sides move?", AE_UP, A_SWAP, A_ONLY_UP, AL_UP),
  q("Collect $1,500 cash from a customer on account. Which choice shows the effect?", "Assets +$1,500 (Cash) and −$1,500 (A/R) — net $0", "Assets +$1,500 and Equity +$1,500", "Assets +$1,500 only", "Assets +$1,500 and Liabilities −$1,500"),
  q("Pay $200 cash on account (to a supplier). Which sides move?", AL_DN, AE_DN, A_ONLY_DN, "Assets ↓ and Liabilities ↑"),
  q("Pay $800 cash for this month's rent. Which sides move?", AE_DN, AL_DN, A_ONLY_DN, "Assets ↓ and Equity ↑"),
  q("Pay $1,200 cash for salaries. Which sides move?", AE_DN, AL_DN, A_ONLY_DN, "Liabilities ↓ and Equity ↓"),
  q("Pay $150 cash for utilities. Which sides move?", AE_DN, AL_DN, A_ONLY_DN, "Assets ↓ and Equity ↑"),
  q("Receive $600 cash in advance from a customer. Which sides move?", AL_UP, AE_UP, A_ONLY_UP, "Assets ↑ and Equity ↓"),
  q("Pay $500 cash dividends to owners. Which sides move?", AE_DN, AL_DN, A_ONLY_DN, "Assets ↓ and Equity ↑"),
  q("Pay $1,200 cash for a one-year insurance policy in advance. Which choice shows the effect?", "Assets −$1,200 (Cash) and +$1,200 (Prepaid Insurance) — net $0", "Assets −$1,200 and Equity −$1,200", "Assets −$1,200 only", "Assets −$1,200 and Liabilities −$1,200"),
  q("Buy $2,000 of inventory on account. Which sides move?", AL_UP, A_SWAP, A_ONLY_UP, AE_UP),
  q("Pay $1,000 cash on the principal of a note payable. Which sides move?", AL_DN, AE_DN, A_ONLY_DN, "Assets ↓ and Liabilities ↑"),
  q("Pay $8,000 cash for land. Which choice shows the effect?", "Assets +$8,000 (Land) and −$8,000 (Cash) — net $0", "Assets −$8,000 and Equity −$8,000", "Assets +$8,000 only", "Assets +$8,000 and Liabilities +$8,000"),
  q("Owner contributes $4,000 of equipment in exchange for common stock. Which sides move?", AE_UP, AL_UP, A_ONLY_UP, "Assets ↑ and Equity ↓"),
];
const CH2_FREE: SQ[] = [CH2_FULL[0], CH2_FULL[1], CH2_FULL[3], CH2_FULL[5], CH2_FULL[8], CH2_FULL[9]]; // 6 (traps: on-account/expense; holds asset-swap-with-amounts complexity mostly back)

// ---- CH3 · Accounting Cycle order -------------------------------------------
const S_ANALYZE = "Analyze transactions", S_JOURNAL = "Journalize", S_POST = "Post to the ledger", S_UTB = "Prepare the unadjusted trial balance", S_ADJ = "Record adjusting entries", S_ATB = "Prepare the adjusted trial balance", S_FS = "Prepare the financial statements", S_CLOSE = "Record closing entries", S_PCTB = "Prepare the post-closing trial balance";
const CH3_FULL: SQ[] = [
  q("Which step comes FIRST in the accounting cycle?", S_ANALYZE, S_JOURNAL, S_POST, S_FS),
  q("Which step comes LAST in the accounting cycle?", S_PCTB, S_CLOSE, S_FS, S_ATB),
  q("Which step immediately follows journalizing?", S_POST, S_UTB, S_ANALYZE, S_ADJ),
  q("Which step immediately precedes the adjusted trial balance?", S_ADJ, S_UTB, S_FS, S_CLOSE),
  q("Which step immediately follows the unadjusted trial balance?", S_ADJ, S_ATB, S_FS, S_POST),
  q("Which step immediately precedes the financial statements?", S_ATB, S_ADJ, S_CLOSE, S_UTB),
  q("Which step immediately follows posting to the ledger?", S_UTB, S_ADJ, S_FS, S_CLOSE),
  q("Which step comes immediately before closing entries?", S_FS, S_ATB, S_ADJ, S_PCTB),
  q("Which comes first: journalizing or posting?", S_JOURNAL, S_POST),
  q("Which step immediately follows closing entries?", S_PCTB, S_FS, S_ATB, S_ANALYZE),
  tf("Adjusting entries are recorded BEFORE the unadjusted trial balance.", false),
  tf("Financial statements are prepared BEFORE closing entries.", true),
];
const CH3_FREE: SQ[] = [CH3_FULL[0], CH3_FULL[1], CH3_FULL[2], CH3_FULL[10]]; // 4 (incl 1 T/F trap)

// ---- CH4 · Debits & Credits (increase or decrease) --------------------------
const INC = "Increase", DEC = "Decrease";
const drcr = (side: "debit" | "credit", account: string, effect: "Increase" | "Decrease"): SQ => q(`Does a ${side} increase or decrease ${account}?`, effect, effect === INC ? DEC : INC);
const CH4_FULL: SQ[] = [
  drcr("debit", "Cash", INC),
  drcr("debit", "Accounts Payable", DEC),
  drcr("credit", "Service Revenue", INC),
  drcr("debit", "Rent Expense", INC),
  drcr("debit", "Accumulated Depreciation", DEC), // trap (contra-asset)
  drcr("debit", "Dividends", INC), // trap (contra-equity, debit-balance)
  drcr("credit", "Common Stock", INC), // trap
  drcr("debit", "Retained Earnings", DEC), // trap
  drcr("credit", "Unearned Revenue", INC), // trap (liability)
  drcr("credit", "Accounts Receivable", DEC),
  drcr("debit", "Equipment", INC),
  drcr("credit", "Notes Payable", INC),
  drcr("debit", "Salaries Expense", INC),
  drcr("credit", "Sales Revenue", INC),
  drcr("debit", "Prepaid Insurance", INC),
  tf("A debit INCREASES Accumulated Depreciation.", false), // trap
  tf("A debit INCREASES Dividends.", true), // trap
  tf("A credit INCREASES Retained Earnings.", true),
];
const CH4_FREE: SQ[] = [CH4_FULL[0], CH4_FULL[1], CH4_FULL[2], CH4_FULL[4], CH4_FULL[5], CH4_FULL[8]]; // 6 (traps 4,5,8; holds the Retained-Earnings debit + T/F traps back)

// ---- CH5 · Journal Entries (two flavors in the Full set) --------------------
// (a) "What is the JE for [scenario]?" — candidate DR/CR pairs (wrong from FLIP / CASH_ONLY / EXPENSE_TOO_EARLY)
const CH5_A: SQ[] = [
  q("What is the journal entry for: owner invests $10,000 cash for common stock?", "DR Cash / CR Common Stock", "DR Common Stock / CR Cash", "DR Cash / CR Service Revenue", "DR Cash / CR Retained Earnings"),
  q("What is the journal entry for: provide services for $1,000 cash?", "DR Cash / CR Service Revenue", "DR Service Revenue / CR Cash", "DR Cash / CR Unearned Revenue", "DR Accounts Receivable / CR Service Revenue"),
  q("What is the journal entry for: provide services for $1,500 on account?", "DR Accounts Receivable / CR Service Revenue", "DR Cash / CR Service Revenue", "DR Service Revenue / CR Accounts Receivable", "DR Accounts Receivable / CR Cash"),
  q("What is the journal entry for: buy $200 of supplies on account?", "DR Supplies / CR Accounts Payable", "DR Supplies / CR Cash", "DR Supplies Expense / CR Accounts Payable", "DR Accounts Payable / CR Supplies"),
  q("What is the journal entry for: pay $800 cash for this month's rent?", "DR Rent Expense / CR Cash", "DR Cash / CR Rent Expense", "DR Prepaid Rent / CR Cash", "DR Rent Expense / CR Accounts Payable"),
  q("What is the journal entry for: pay $3,000 cash for equipment?", "DR Equipment / CR Cash", "DR Depreciation Expense / CR Cash", "DR Cash / CR Equipment", "DR Equipment / CR Accounts Payable"),
  q("What is the journal entry for: receive $600 cash in advance from a customer?", "DR Cash / CR Unearned Revenue", "DR Cash / CR Service Revenue", "DR Unearned Revenue / CR Cash", "DR Accounts Receivable / CR Unearned Revenue"),
  q("What is the journal entry for: pay $200 cash on account to a supplier?", "DR Accounts Payable / CR Cash", "DR Cash / CR Accounts Payable", "DR Supplies / CR Cash", "DR Accounts Payable / CR Supplies"),
  q("What is the journal entry for: collect $1,500 cash from a customer on account?", "DR Cash / CR Accounts Receivable", "DR Cash / CR Service Revenue", "DR Accounts Receivable / CR Cash", "DR Service Revenue / CR Cash"),
  q("What is the journal entry for: pay $500 cash dividends?", "DR Dividends / CR Cash", "DR Cash / CR Dividends", "DR Salaries Expense / CR Cash", "DR Retained Earnings / CR Cash"),
  q("What is the journal entry for: pay $1,200 cash for a one-year insurance policy in advance?", "DR Prepaid Insurance / CR Cash", "DR Insurance Expense / CR Cash", "DR Cash / CR Prepaid Insurance", "DR Prepaid Insurance / CR Accounts Payable"),
  q("What is the journal entry for: borrow $5,000 cash from the bank on a note?", "DR Cash / CR Notes Payable", "DR Notes Payable / CR Cash", "DR Cash / CR Interest Revenue", "DR Cash / CR Accounts Payable"),
  q("ADJUSTING: $60 of supplies were used this month. What is the entry?", "DR Supplies Expense / CR Supplies", "DR Supplies / CR Supplies Expense", "DR Supplies Expense / CR Cash", "DR Supplies / CR Accounts Payable"),
  q("ADJUSTING: record $250 of depreciation on equipment. What is the entry?", "DR Depreciation Expense / CR Accumulated Depreciation", "DR Accumulated Depreciation / CR Depreciation Expense", "DR Depreciation Expense / CR Equipment", "DR Depreciation Expense / CR Cash"),
  q("ADJUSTING: $200 of previously unearned revenue is now earned. What is the entry?", "DR Unearned Revenue / CR Service Revenue", "DR Service Revenue / CR Unearned Revenue", "DR Cash / CR Service Revenue", "DR Unearned Revenue / CR Cash"),
];
// (b) "When do you debit [account]?" — which transaction (distractors are other scenarios)
const CH5_B: SQ[] = [
  q("When do you DEBIT Cash?", "When the company receives cash", "When the company pays cash", "When the company bills a customer on account", "When the company owes a supplier"),
  q("When do you DEBIT Accounts Receivable?", "When you provide services to a customer on account", "When you collect cash from a customer", "When you pay a supplier", "When you receive cash in advance"),
  q("When do you DEBIT Rent Expense?", "When you incur/pay rent for the current period", "When you prepay rent for future months", "When you receive rent from a tenant", "When you owe rent but haven't paid"),
  q("When do you DEBIT Unearned Revenue?", "When you deliver the service you were paid for in advance", "When you receive cash in advance", "When you provide services for cash", "When you bill a customer on account"),
  q("When do you DEBIT Dividends?", "When you distribute cash dividends to owners", "When owners invest cash", "When the company earns revenue", "When the company pays an expense"),
  q("When do you DEBIT Supplies?", "When you purchase supplies", "When you use up supplies", "When you sell supplies to a customer", "When you count supplies at period-end"),
  q("When do you DEBIT Accounts Payable?", "When you pay off what you owe a supplier", "When you buy on account", "When you receive a supplier's bill", "When you borrow from a bank"),
  q("When do you DEBIT Prepaid Insurance?", "When you pay for insurance coverage in advance", "When insurance coverage expires", "When you receive an insurance bill", "When the period's coverage is used up"),
  q("When do you DEBIT Salaries Expense?", "When employees earn wages for the current period", "When you hire an employee", "When you pay a dividend", "When you collect cash from a customer"),
];
const CH5_FULL: SQ[] = [...CH5_A, ...CH5_B]; // 24
const CH5_FREE: SQ[] = [CH5_A[1], CH5_A[2], CH5_A[4], CH5_A[6], CH5_B[0], CH5_B[4]]; // 6 (holds the adjusting JEs back)

// ---- the 10 sets ------------------------------------------------------------
export const SEED_SETS: SSet[] = [
  { key: "ch1-free", name: "Ch 1 · Types of Accounts — Free", questions: CH1_FREE_NAMES.map(ch1Q) },
  { key: "ch1-full", name: "Ch 1 · Types of Accounts — Full", questions: CH1_FULL_NAMES.map(ch1Q) },
  { key: "ch2-free", name: "Ch 2 · A=L+E Effects — Free", questions: CH2_FREE },
  { key: "ch2-full", name: "Ch 2 · A=L+E Effects — Full", questions: CH2_FULL },
  { key: "ch3-free", name: "Ch 3 · Accounting Cycle Order — Free", questions: CH3_FREE },
  { key: "ch3-full", name: "Ch 3 · Accounting Cycle Order — Full", questions: CH3_FULL },
  { key: "ch4-free", name: "Ch 4 · Debits & Credits — Free", questions: CH4_FREE },
  { key: "ch4-full", name: "Ch 4 · Debits & Credits — Full", questions: CH4_FULL },
  { key: "ch5-free", name: "Ch 5 · Journal Entries — Free", questions: CH5_FREE },
  { key: "ch5-full", name: "Ch 5 · Journal Entries — Full", questions: CH5_FULL },
];

/** Rotate choices so the correct answer isn't always in slot A. Deterministic. */
const rotate = <T,>(arr: T[], by: number): T[] => arr.map((_, i) => arr[(i + by) % arr.length]);

/** Stamp all seed sets into the scene, idempotently (stable deck id per set —
 *  re-seeding REPLACES that set's cards, never duplicates the deck). Returns a
 *  per-set report. Chains/memos are always empty. */
export function seedCeqSets(rf: ReactFlowInstance, setDecks: (fn: (prev: DeckDef[]) => DeckDef[]) => void): { name: string; count: number; replaced: boolean }[] {
  const rfl = rf as unknown as RfLike;
  const report: { name: string; count: number; replaced: boolean }[] = [];
  for (const set of SEED_SETS) {
    const deckId = `deck-${set.key}`;
    const existing = rf.getNodes().filter((n) => (n.data as { deckId?: string }).deckId === deckId);
    const nodes = set.questions.map((qq, i) => {
      const pos = { x: 80 + (i % 6) * 300, y: 80 + Math.floor(i / 6) * 260 };
      return {
        id: cardId("ceq"), type: "ceq", position: pos, selected: false,
        data: {
          kind: "ceq", title: set.name, prompt: qq.stem,
          choices: rotate(qq.choices, i).map((ch) => ({ id: cardId("ch"), text: ch.text, correct: !!ch.correct })),
          deckId, deckMember: true, tucked: true, stageOrder: i, slotIndex: i, deckCategory: "ceq:studio", deckPos: pos,
        },
      };
    });
    const cmds = [];
    if (existing.length) { const rm = removeNodesCmd(rfl, existing.map((n) => n.id), `clear ${set.name}`); if (rm) cmds.push(rm); }
    const add = addNodesCmd(rfl, nodes as never, `seed ${set.name}`); if (add) cmds.push(add);
    const cmd = compositeCmd(cmds, `seed ${set.name}`); if (cmd) bus.dispatch(cmd);
    setDecks((prev) => (prev.some((d) => d.id === deckId) ? updateDeck(prev, deckId, { name: set.name }) : addDeck(prev, { ...newDeckDef(set.name, "cards"), id: deckId })));
    report.push({ name: set.name, count: set.questions.length, replaced: existing.length > 0 });
  }
  return report;
}
