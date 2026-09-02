// THE CHAPTER-LETTER CYCLE — what the chapter door wears when we do not yet know your house.
//
// It used to rotate invented trios (ΦΔΣ, ΘΛΞ…) chosen only for shape contrast. They read as
// decoration, because that is what they were: no house on any campus has those letters. REAL
// chapter letters do the opposite — a student scanning the page sees their own house go by, or
// their roommate's, and the card stops being a graphic and starts being about them.
//
// TWO RULES the sequence has to hold:
//
//   • ALTERNATE sorority and fraternity. Six sororities in a row reads as a Panhellenic product.
//   • Include NPHC. An IFC/Panhellenic-only rotation quietly says who this is for, so one NPHC
//     chapter (Alpha Kappa Alpha, where a campus has it) is seeded into the run rather than left
//     to the end where a short cycle would never reach it.
//
// The letters themselves are never invented: everything here is a real chapter that exists on the
// campus in question, and any chapter whose roster row carries no letters is simply skipped.

/** One chapter, reduced to what the icon needs. */
export type GreekCycleItem = { letters: string | null; council: string | null };

const norm = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();
export const isSorority = (council: string | null | undefined) => norm(council).includes("panhellenic");
export const isFraternity = (council: string | null | undefined) => norm(council) === "ifc" || norm(council).includes("interfraternity");
const isNphc = (council: string | null | undefined) => norm(council).includes("nphc") || norm(council).includes("pan-hellenic");

/** THE DEFAULT RUN — Ole Miss, the flagship campus, hand-ordered.
 *
 *  This is what a visitor sees before they have told us a school, and the fallback for any campus
 *  whose roster we do not have yet. Hand-ordered rather than generated because the first few are
 *  the ones nearly everyone actually sees: the biggest, most recognisable houses first, strictly
 *  alternating, with Alpha Kappa Alpha in the seventh slot — early enough that a short visit still
 *  reaches it, and placed so the alternation never breaks. */
export const OLE_MISS_GREEK_CYCLE: string[] = [
  "ΚΚΓ", // Kappa Kappa Gamma · Panhellenic
  "ΑΤΩ", // Alpha Tau Omega · IFC
  "ΔΔΔ", // Delta Delta Delta · Panhellenic
  "ΚΑ",  // Kappa Alpha Order · IFC
  "ΔΓ",  // Delta Gamma · Panhellenic
  "ΣΧ",  // Sigma Chi · IFC
  "ΑΚΑ", // Alpha Kappa Alpha · NPHC
  "ΧΩ",  // Chi Omega · Panhellenic
  "ΣΑΕ", // Sigma Alpha Epsilon · IFC
  "ΦΜ",  // Phi Mu · Panhellenic
  "ΚΣ",  // Kappa Sigma · IFC
  "ΠΒΦ", // Pi Beta Phi · Panhellenic
  "ΠΚΑ", // Pi Kappa Alpha · IFC
  "ΚΔ",  // Kappa Delta · Panhellenic
  "ΣΝ",  // Sigma Nu · IFC
];

/** THE HOUSES A STUDENT RECOGNISES FIRST. A roster comes back alphabetical, which means every
 *  campus outside the flagship would open on "Alpha …" three times running — accurate, but it
 *  buries the nationals most people can name, and the first two or three letters are all a visitor
 *  actually sees. These are bubbled to the front of their own side of the alternation; everything
 *  else keeps roster order behind them. Presence only — nothing is invented, and a campus without
 *  one of these simply starts with whatever it does have. */
const WELL_KNOWN_SOR = ["ΚΚΓ", "ΔΔΔ", "ΧΩ", "ΔΓ", "ΚΔ", "ΦΜ", "ΠΒΦ", "ΑΧΩ", "ΑΔΠ", "ΖΤΑ"];
const WELL_KNOWN_FRAT = ["ΑΤΩ", "ΚΑ", "ΣΧ", "ΣΑΕ", "ΚΣ", "ΠΚΑ", "ΣΝ", "ΦΔΘ", "ΒΘΠ", "ΛΧΑ"];

/** Stable sort: known houses first in the order above, everything else after, roster order kept. */
function preferred(list: string[], known: string[]): string[] {
  const rank = (l: string) => { const i = known.indexOf(l); return i < 0 ? known.length : i; };
  return list.map((l, i) => ({ l, i })).sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i).map((x) => x.l);
}

/** How many houses one visit could plausibly see. Past this the rotation is just a longer loop
 *  nobody reaches, and every extra entry is another render the icon has to hold. */
const MAX = 15;
/** Where the NPHC chapter goes — after the six best-known houses, before the run gets long. */
const NPHC_SLOT = 6;

/** Build a campus's own alternating run. Returns [] when the roster cannot support one, and the
 *  caller falls back to the Ole Miss default rather than showing a thin or one-sided cycle. */
export function buildGreekCycle(chapters: GreekCycleItem[]): string[] {
  const withLetters = chapters
    .map((c) => ({ letters: (c.letters ?? "").trim(), council: c.council }))
    .filter((c) => c.letters.length > 0);
  const sor = preferred(withLetters.filter((c) => isSorority(c.council)).map((c) => c.letters), WELL_KNOWN_SOR);
  const frat = preferred(withLetters.filter((c) => isFraternity(c.council)).map((c) => c.letters), WELL_KNOWN_FRAT);
  // A run needs both sides to alternate at all; one-sided is worse than the flagship default.
  if (sor.length < 2 || frat.length < 2) return [];

  const out: string[] = [];
  for (let i = 0; i < Math.max(sor.length, frat.length) && out.length < MAX; i++) {
    if (sor[i]) out.push(sor[i]);
    if (frat[i] && out.length < MAX) out.push(frat[i]);
  }

  // Seed one NPHC chapter into the run — Alpha Kappa Alpha when the campus has it, else whichever
  // NPHC chapter comes first. Skipped silently on a campus with no NPHC roster.
  const nphc = withLetters.filter((c) => isNphc(c.council)).map((c) => c.letters);
  const pick = nphc.find((l) => l === "ΑΚΑ") ?? nphc[0];
  if (pick && !out.includes(pick)) out.splice(Math.min(NPHC_SLOT, out.length), 0, pick);

  return out.slice(0, MAX);
}
