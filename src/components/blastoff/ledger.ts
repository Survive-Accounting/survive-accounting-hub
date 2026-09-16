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

// ── THE RUBRIC-SHAPED RULE (Lee, 2026-09-16) ──────────────────────────────────────────────────────────────
// "I don't really like showing students that ADE and LER thing. I prefer just showing the progression: show
// assets — debits increase, credits decrease — then an arrow hops over the equal sign to both liabilities and
// equity … after that Revenue appears with an arrow connected to equity ('they work the same'), and revenues and
// expenses are always opposite … then highlight that assets and expenses work together, blur the others; then
// liabilities, equity and revenues all work together … then show how contra accounts are opposite: a bigger view
// of just assets and accumulated depreciation, then equity and dividends … Keep it minimal, don't show the text
// at the top, just show the rubric, in the same backwards-L format the A = L + E rubric is in."
//
// So a dcrule slide is the rubric's L — A = L + E across, Rev and Exp under E — and nothing else unless asked.
// `dcMode` picks the walk it does on space:
//   walk     A · L · E · Rev · Exp come in one per space, then the debit family lights, then the credit family
//   contraA  Assets big, then Accumulated Depreciation beside it, opposite
//   contraE  Equity big, then Dividends beside it, opposite, then "starts with D → increases with a Debit"
//   blank    the L with blank T's ("write this on your exam"), then the signs fill in
// `dcFocus` (an older field) lights one type and dims the rest — the slide that opens a type's video.
export const DC_MODES = ["walk", "contraA", "contraE", "blank"] as const;
export type DcMode = (typeof DC_MODES)[number];
export const isDcMode = (v: unknown): v is DcMode => typeof v === "string" && (DC_MODES as readonly string[]).includes(v);
export const DC_MODE_LABEL: Record<DcMode, string> = { walk: "Walk A → L → E → Rev → Exp", contraA: "Contra: assets", contraE: "Contra: equity", blank: "Blank — write it on your exam" };

/** The L's order on the walk: the top row, then the pair under equity. */
export const DC_WALK_ORDER: readonly DcKey[] = ["A", "L", "E", "Rev", "Exp"];
/** The two families the walk lights at its end: the debit side (assets and expenses), the credit side. */
export const DC_FAMILY_DEBIT: readonly DcKey[] = ["A", "Exp"];
export const DC_FAMILY_CREDIT: readonly DcKey[] = ["L", "E", "Rev"];

/** How many space steps a dcrule slide walks. 0 = it just sits there. */
export function dcRuleSteps(f: { dcMode?: string }): number {
  switch (f.dcMode) {
    case "walk": return 1 + DC_WALK_ORDER.length + 2; // bare, five reveals, two families
    case "contraA": return 2;
    case "contraE": return 3;
    case "blank": return 2;
    default: return 0;
  }
}
/** At step `s` of the walk (null = at rest): which boxes are in, and which family is lit (null = none). */
export function dcWalkView(s: number | null | undefined): { shown: DcKey[]; lit: DcKey[] | null } {
  if (s == null) return { shown: [...DC_WALK_ORDER], lit: null };
  const n = Math.max(0, Math.min(DC_WALK_ORDER.length, s));
  const lit = s === DC_WALK_ORDER.length + 1 ? [...DC_FAMILY_DEBIT] : s >= DC_WALK_ORDER.length + 2 ? [...DC_FAMILY_CREDIT] : null;
  return { shown: DC_WALK_ORDER.slice(0, n), lit };
}

/** THE RUBRIC PICK (a ceq frame's `dcpick`, the type it lights): "How do you increase Equipment?" → the account,
 *  the direction, and the answer side from the correct choice (Debit → L, Credit → R). Null when the card
 *  isn't that shape. Steps: the bare question, the type's box lights, the answer lights. */
export const DC_PICK_STEPS = 3;
/** THE FAMILY OF AN ACCOUNT NAME: which box of the L lights for "How do you increase Cash?". Liabilities are
 *  tested before revenues (Unearned Revenue), expenses before assets (Depreciation Expense vs. Accumulated
 *  Depreciation). Null when the name says nothing the L knows. */
export function dcTypeOf(account: string): DcKey | null {
  const a = account.toLowerCase();
  if (/dividend|drawing/.test(a)) return "Div";
  if (/expense|cost of goods|cogs|\bloss\b/.test(a)) return "Exp";
  if (/payable|unearned|deferred|liabilit|\bloan|\bdebt|accrued|owed/.test(a)) return "L";
  if (/revenue|earned|\bsales\b|\bfees\b|income\b|\bgain\b/.test(a)) return "Rev";
  if (/stock|retained|equity|capital|owner/.test(a)) return "E";
  if (/cash|receivable|supplies|prepaid|inventory|equipment|land|building|asset|accumulated|allowance|vehicle|furniture|investment|patent|\bnote|goodwill|truck|computer/.test(a)) return "A";
  return null;
}
/** THE CONTRA: an account that flips its family's signs, with the short label its T wears (Lee: "Acc Depr"). */
export function dcContraOf(account: string): { of: "A" | "E"; name: string } | null {
  const a = account.toLowerCase();
  if (/accumulated depreciation|accum\.? dep|acc depr/.test(a)) return { of: "A", name: "Acc Depr" };
  if (/allowance/.test(a)) return { of: "A", name: "Allowance" };
  if (/dividend|drawing/.test(a)) return { of: "E", name: "Dividends" };
  if (/treasury/.test(a)) return { of: "E", name: "Treasury Stock" };
  return null;
}
export function dcPickOf(stem: string, choices: readonly { text: string; correct: boolean }[]): { account: string; direction: "increase" | "decrease" | null; side: "L" | "R" | null } | null {
  const s = stem.replace(/\s+/g, " ").trim();
  const m = /\b(increase|decrease)s?\s+(?:an?\s+|the\s+)?(.+?)\??\s*$/i.exec(s);
  if (!m) return null;
  const right = choices.find((c) => c.correct)?.text.trim().toLowerCase() ?? "";
  const side = right.startsWith("debit") ? "L" : right.startsWith("credit") ? "R" : null;
  if (!side) return null;
  return { account: m[2].trim(), direction: m[1].toLowerCase() as "increase" | "decrease", side };
}
