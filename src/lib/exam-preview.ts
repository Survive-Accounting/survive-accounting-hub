// EXAM PREVIEW DATA — the one source for "what an intro-accounting exam covers", client-safe.
//
// WHY THIS EXISTS. landing.tsx has always carried STATIC_EXAM1..FINAL as the fallback outline the
// real player shows before live sets are published ("the menu IS the marketing"). The partner
// pages now show that same outline in a lightweight preview — "What your chapters get" — and two
// copies of the topic list would drift the day someone reorders one. So the arrays live here and
// landing imports them, which also means a partner preview can never claim a different syllabus
// than the product it is previewing.
//
// The estimated runtime is the same deterministic estimate the player's TopicRow uses for an
// unbuilt topic: there is no real duration source yet, so this is an honest 11–22 min band, keyed
// on the topic name so it never flickers between renders. Replace the body when durations land.

/** Exam 1 — the free exam, and the only one a preview needs to show in full. */
export const STATIC_EXAM1 = ["Types of Accounts", "A = L + E", "Debits & Credits", "Journal Entries", "Adjusting Entries", "Closing Entries"];
export const STATIC_EXAM2 = ["Merchandising", "Inventory (FIFO / LIFO)", "Multi-step Income Statement", "Internal Controls", "Receivables"];
export const STATIC_EXAM3 = ["Long-Term Assets", "Current Liabilities", "Long-Term Liabilities", "Equity", "Statement of Cash Flows"];
export const STATIC_FINAL = ["Full Accounting Cycle", "Financial Statements", "Ratios & Analysis", "Comprehensive Problems"];

/** The four exam tabs a student (and a partner previewing the product) sees, with the same labels
 *  and free/locked split the real ExamTabs renders. `topics` is the outline shown under each. */
export const EXAM_PREVIEW_TABS = [
  { num: 1, label: "Exam 1", free: true, topics: STATIC_EXAM1 },
  { num: 2, label: "Exam 2", free: false, topics: STATIC_EXAM2 },
  { num: 3, label: "Exam 3", free: false, topics: STATIC_EXAM3 },
  { num: 99, label: "Final", free: false, topics: STATIC_FINAL },
] as const;

/** Deterministic per-name minute estimate in the 11–22 band real sets run — identical rule to the
 *  player's estTopicMin, so a previewed topic and the same topic in the live player agree. */
export function estTopicMin(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return 11 + (h % 12);
}

/** A representative Exam 1 practice question, shown ANSWERED so the preview demonstrates the
 *  payoff (the worked reason), not just a quiz prompt. This is illustrative content for the
 *  marketing preview — it is not pulled from the live question bank, and it names no campus, so it
 *  is true for every school. Journal entries because that is the topic Exam 1 lives and dies on. */
export const PREVIEW_QUESTION = {
  topic: "Journal Entries",
  stem: "On March 1, Harper Co. buys $4,200 of supplies on account. Which entry records it?",
  choices: [
    { label: "Dr Supplies 4,200 · Cr Cash 4,200", correct: false },
    { label: "Dr Supplies 4,200 · Cr Accounts Payable 4,200", correct: true },
    { label: "Dr Accounts Payable 4,200 · Cr Supplies 4,200", correct: false },
    { label: "Dr Supplies Expense 4,200 · Cr Accounts Payable 4,200", correct: false },
  ],
  memo: "“On account” means it isn't paid yet — so the credit is Accounts Payable, not Cash. Supplies is an asset you now own, so it's debited.",
} as const;
