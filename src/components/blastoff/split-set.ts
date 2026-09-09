// SPLIT A SET — the knife, as pure data.
//
// Lee, 2026-09-09: "there may be a practice exam for types of accounts that has thirty nine
// questions… it needs to be split up if it's gonna be… that survive accounting is all shorts,
// vertical shorts that are three minutes or less. The splitting has to be ruthless." And, on
// the size: "my gut says it's around ten to fifteen." The arithmetic agrees — a 3-minute Short
// minus the cold open and the sign-off is ~155 s, a card is 10–15 s, a callout 4–8 — so 12 is
// the target and 15 the ceiling, and a set over that gets CUT, not trimmed.
//
// THE GESTURE IS A CUT, NOT A SORT. A set is already in teaching order (assets 0–10,
// liabilities 11–14, equity 15–17 …), so the fast way to split it is to drop a knife between
// two cards: every run between cuts becomes a piece, and each piece gets a name. Four cuts →
// five Shorts. No dragging cards into buckets. This module turns "cuts after these indexes"
// into named pieces and says whether the result is legal; the server fn
// (lib/split-set.functions.ts) does the moving.
//
// NOTE-ONLY AND DRAFT CARDS ARE NOT ON THE KNIFE. The set's own intro/outro notes stay with the
// parent (they are its bookends), and a draft is unfinished work that must never ship inside a
// Short. Only the cards that would actually be filmed are laid out for cutting.

export interface SplitCard { id: string; stem: string; noteOnly?: boolean; draft?: boolean }

export interface SplitPiece { name: string; ceqIds: string[] }

/** Above this many cards a piece is over the ceiling and the panel says so. Lee: "ten to
 *  fifteen… some of those slides are very quick one sentence slide" — the callouts come on top
 *  of the cards, so the CARD ceiling sits under the slide ceiling. */
export const PIECE_CARD_CEILING = 12;

/** The cards that can be cut: filmable ones, in the order they were handed in (stage order). */
export function cuttable(cards: readonly SplitCard[]): SplitCard[] {
  return cards.filter((c) => !c.noteOnly && !c.draft);
}

/** Runs between cuts. `cutsAfter` holds indexes into `cards` (0-based) — a cut after index i
 *  ends a piece at card i. Names are applied in order; a missing name becomes "Part n". Empty
 *  runs cannot happen (a cut is between two cards), but a cut beyond the end is ignored. */
export function piecesFromCuts(cards: readonly SplitCard[], cutsAfter: ReadonlySet<number>, names: readonly string[] = []): SplitPiece[] {
  const pieces: SplitPiece[] = [];
  let run: string[] = [];
  cards.forEach((c, i) => {
    run.push(c.id);
    if (cutsAfter.has(i) && i < cards.length - 1) { pieces.push({ name: "", ceqIds: run }); run = []; }
  });
  if (run.length) pieces.push({ name: "", ceqIds: run });
  return pieces.map((p, i) => ({ ...p, name: (names[i] ?? "").trim() || `Part ${i + 1}` }));
}

/** THE COUNTS a piece shows beside its name: how many cards, and whether that is over the
 *  ceiling. Pure, so the panel and the tests agree on what "too many" is. */
export function pieceStatus(p: SplitPiece): { n: number; over: boolean } {
  return { n: p.ceqIds.length, over: p.ceqIds.length > PIECE_CARD_CEILING };
}

/** Why this split cannot happen, or null. The server checks the same things again against the
 *  live scene; this is what the panel disables the button on. */
export function splitProblem(parentIds: readonly string[], pieces: readonly SplitPiece[]): string | null {
  if (pieces.length < 2) return "A split needs at least two pieces — drop a knife between two cards.";
  const parent = new Set(parentIds);
  const seen = new Set<string>();
  for (const p of pieces) {
    if (!p.name.trim()) return "Every piece needs a name.";
    if (!p.ceqIds.length) return `"${p.name}" has no cards.`;
    for (const id of p.ceqIds) {
      if (!parent.has(id)) return `Card ${id} is not in this set.`;
      if (seen.has(id)) return `Card ${id} is in two pieces.`;
      seen.add(id);
    }
  }
  const names = pieces.map((p) => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two pieces have the same name.";
  return null;
}

/** A NAME FOR A RUN, guessed from what its cards ask. The account-type set is the case this was
 *  built for: "What type of account is Cash?" … "Land?" is Assets. It reads the correct answer
 *  when the caller hands one in (the family), else the first stem's tail. Only a suggestion —
 *  the field is editable and Lee's word wins. */
export function suggestPieceName(stems: readonly string[], answers: readonly (string | null | undefined)[] = []): string {
  // "Equity — a contra account that reduces it" and "Equity" are the same family: the dash tail
  // is the card's explanation, not the answer, so it comes off BEFORE the answers are compared.
  const a = answers.map((x) => (x ?? "").replace(/\s*[—–-].*$/, "").trim()).filter(Boolean);
  if (a.length && a.every((x) => x.toLowerCase() === a[0].toLowerCase())) {
    const one = a[0];
    // Lee's own five, as he says them: "one for assets, one for liabilities, one for equity, one
    // for revenue, one for expense." Only the first two pluralise.
    const plural: Record<string, string> = { asset: "Assets", liability: "Liabilities" };
    return plural[one.toLowerCase()] ?? one;
  }
  const first = (stems[0] ?? "").replace(/\?+$/, "").trim();
  const tail = first.split(/\s+is\s+/i).pop() ?? first;
  return tail.slice(0, 40) || "Part";
}
