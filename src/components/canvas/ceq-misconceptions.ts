// MISCONCEPTION LAYER (Lee) — built ON MEMOS, not a parallel CEQ tag system. A memo
// optionally names the trap it exists to kill (`misconceptionId`, a short slug on the
// memo node — scene JSON, additive, nullable). Everything else is DERIVED, read-only:
// a question's exposure is the union of slugs across its chained memos, the Tools
// registry counts usage, and the export summarises. Nothing here writes anything.
export interface MisconceptionDef { slug: string; description: string }

/** The seed traps. Lee adds more inline (slug + one-liner) — custom DESCRIPTIONS ride
 *  panel prefs (display metadata); the slugs themselves live on memo nodes in the
 *  scene, so the tagging is never lost even if a description is. */
export const MISCONCEPTION_SEEDS: MisconceptionDef[] = [
  { slug: "FLIP", description: "Debit/credit (or account-type) flipped — the mirror-image answer." },
  { slug: "CASH_ONLY", description: "Only counts it when cash moves — misses accrual timing." },
  { slug: "MISS_EQUITY", description: "Forgets equity absorbs the effect — A=L+E left unbalanced." },
  { slug: "BOTH_SIDES", description: "Puts the effect on both sides when it belongs on one." },
  { slug: "SINGLE_SIDE", description: "Records one side of the entry and stops." },
  { slug: "EXPENSE_TOO_EARLY", description: "Expenses a cost that should sit on the balance sheet first." },
];

const SLUG_RE = /^[A-Z0-9_]{2,32}$/;
/** Normalize free text to a slug; empty string when it can't be one. */
export function toSlug(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/[^A-Z0-9_]/g, "");
  return SLUG_RE.test(s) ? s : "";
}

/** A question's DERIVED exposure: the union of misconceptionIds across its chained
 *  memos, in first-seen chain order. Pure; no per-CEQ field exists or is written. */
export function questionMisconceptions(
  choices: { chain?: { memoNodeId: string }[] }[] | undefined,
  slugOfMemo: (memoNodeId: string) => string | undefined,
): string[] {
  const out: string[] = [];
  for (const c of choices ?? []) for (const it of c.chain ?? []) {
    const s = slugOfMemo(it.memoNodeId);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}
