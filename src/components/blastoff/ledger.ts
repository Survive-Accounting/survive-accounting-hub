// THE LEDGER SLIDES — the pure half (LedgerFrames.tsx draws them). Lee, 2026-09-15, planning Exam 1's
// debits & credits, normal balances and T-accounts, from his Chapter 2 deck:
//   · THE ± RULE — "Lee's Memorization Trick": A = L + E with a small T under each word — Assets +|−,
//     Liabilities −|+, Equity −|+; Revenues −|+ with equity, Expenses +|− (and Dividends, contra equity,
//     +|−). His acronym: "Debit ADE / Credit LER". Yellow = debit-normal, orange = credit-normal.
//   · THE T-ACCOUNT — "a simplified ledger account, shaped like a T, with debits on the left and credits on
//     the right"; titled "Cash (+/-)"; entries staggered; the ending balance under a second line on its
//     normal side. On film each line comes in on space. And: "the importance of beginning and ending
//     balances … we're just showing the change to get from point A to point B."
//   · THE T PICK — "What is the normal balance of ____?" as a blank T: "choose the + side!"
// Pure: no React.

export const DC_KEYS = ["A", "L", "E", "Rev", "Exp", "Div"] as const;
export type DcKey = (typeof DC_KEYS)[number];

/** Debit-side (+ on the left) or credit-side (+ on the right). */
export const DC_SIDE: Record<DcKey, "debit" | "credit"> = { A: "debit", L: "credit", E: "credit", Rev: "credit", Exp: "debit", Div: "debit" };
export const DC_NAME: Record<DcKey, string> = { A: "Assets", L: "Liabilities", E: "Equity", Rev: "Revenues", Exp: "Expenses", Div: "Dividends" };
/** His colours: yellow for the debit-normal accounts, orange for the credit-normal ones. */
export const DC_YELLOW = "#FACC15";
export const DC_ORANGE = "#FB923C";
export const dcColor = (k: DcKey): string => (DC_SIDE[k] === "debit" ? DC_YELLOW : DC_ORANGE);
export const isDcKey = (v: unknown): v is DcKey => typeof v === "string" && (DC_KEYS as readonly string[]).includes(v);

export interface TLine { side: "L" | "R"; amount: string; label?: string }
export interface TAccountSpec {
  /** "Cash" — the title reads "Cash (+/-)". */
  name: string;
  /** Which side increases it: "debit" → (+/-), "credit" → (-/+). */
  normal: "debit" | "credit";
  /** Staggered entries, top to bottom; a "Beg." label marks the beginning balance. */
  lines: TLine[];
  /** The ending balance, under the second line on its side. Absent = not shown. */
  ending?: { side: "L" | "R"; amount: string };
}

/** How many space steps a T-account walks: bare T, each line, then the ending. */
export function tAccountSteps(t: TAccountSpec | undefined): number {
  if (!t) return 0;
  return 1 + t.lines.length + (t.ending ? 1 : 0);
}
/** At step `s` (null = at rest, everything shown): how many lines are in, and whether the ending is. */
export function tAccountShown(t: TAccountSpec, s: number | null | undefined): { lines: number; ending: boolean } {
  if (s == null) return { lines: t.lines.length, ending: !!t.ending };
  return { lines: Math.max(0, Math.min(t.lines.length, s)), ending: !!t.ending && s > t.lines.length };
}

/** THE TYPED FORM the Editor uses, one line per entry: "L 1,000 Beg." / "R 200 Pay rent" / "= L 1,300". */
export function parseTLines(text: string): { lines: TLine[]; ending?: { side: "L" | "R"; amount: string } } {
  const lines: TLine[] = [];
  let ending: { side: "L" | "R"; amount: string } | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(=)?\s*([LRlr]|Dr|Cr|dr|cr)\b\s+([^\s]+)\s*(.*)$/.exec(raw);
    if (!m) continue;
    const side = /^(l|dr)$/i.test(m[2]) ? "L" : "R";
    if (m[1]) ending = { side, amount: m[3] };
    else lines.push({ side, amount: m[3], ...(m[4].trim() ? { label: m[4].trim() } : {}) });
  }
  return { lines, ending };
}
export function formatTLines(t: Pick<TAccountSpec, "lines" | "ending">): string {
  return [...t.lines.map((l) => `${l.side} ${l.amount}${l.label ? ` ${l.label}` : ""}`), ...(t.ending ? [`= ${t.ending.side} ${t.ending.amount}`] : [])].join("\n");
}

/** THE T PICK reads its account and answer off the card: "What is the normal balance of Cash?" → Cash;
 *  the correct choice Debit/Credit → the side. Null when the card isn't that shape. */
export function tPickOf(stem: string, choices: readonly { text: string; correct: boolean }[]): { account: string; side: "L" | "R" | null } | null {
  const m = /normal balance (?:of|for)\s+(.+?)\??\s*$/i.exec(stem.replace(/\s+/g, " ").trim());
  if (!m) return null;
  const right = choices.find((c) => c.correct)?.text.trim().toLowerCase() ?? "";
  return { account: m[1].replace(/^the\s+/i, ""), side: right.startsWith("debit") ? "L" : right.startsWith("credit") ? "R" : null };
}
