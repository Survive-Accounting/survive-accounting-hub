// FOUND ON YOUR EXAM — the promise card. Takes the set's real CEQ stems and
// picks the handful of DISTINCT phrasings a professor actually uses, so the
// viewer sees "this one question wears five costumes" rather than a list of
// near-identical sentences.
//
// Pure and deterministic: same stems in, same card out. The component renders
// what this returns and lets Lee edit it afterwards — generation is a starting
// point, never the final word.

/** Words that carry no distinguishing signal between two exam phrasings. */
const STOP = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "of", "in", "on", "at", "to",
  "for", "and", "or", "but", "if", "it", "its", "this", "that", "these", "those", "we", "you",
  "your", "which", "what", "when", "how", "does", "do", "did", "will", "would", "should",
  "following", "best", "most", "correct", "true", "false", "statement", "about", "with",
]);

const words = (s: string): string[] =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

/** Jaccard distance on content words — 0 identical, 1 nothing in common. */
export function distance(a: string, b: string): number {
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size && !B.size) return 0;
  let shared = 0;
  for (const w of A) if (B.has(w)) shared++;
  const union = A.size + B.size - shared;
  return union === 0 ? 0 : 1 - shared / union;
}

/** Collapse the parts that vary question-to-question but not phrasing-to-
 *  phrasing, so "Which step follows posting?" and "Which step follows
 *  journalizing?" are recognised as ONE phrasing rather than two. */
const shape = (s: string): string =>
  s.toLowerCase()
    .replace(/[^a-z0-9\s?]/g, " ")
    .replace(/\b\d+\b/g, "#")
    .split(/\s+/).filter(Boolean).slice(0, 6).join(" ");

export interface FoundOnExam {
  canonical: string;
  variations: string[];
}

/** MAX_VARIATIONS — five fits the card and is as many costumes as a viewer will
 *  hold. Lee can trim after generation; he cannot read a sixth on a phone. */
export const MAX_VARIATIONS = 5;

/** Build the card from a set's stems.
 *  · canonical — the phrasing that best represents the set (the one closest to
 *    every other, i.e. the middle of the cluster), unless one is given.
 *  · variations — the most DISTINCT remaining phrasings, greedily farthest-first
 *    so the five on screen are five genuinely different costumes. */
export function foundOnYourExam(stems: readonly string[], canonicalIn?: string): FoundOnExam {
  const clean = [...new Set(stems.map((s) => s.trim()).filter(Boolean))];
  if (!clean.length) return { canonical: canonicalIn?.trim() ?? "", variations: [] };

  // One representative per phrasing-shape, keeping the shortest (tightest read).
  const byShape = new Map<string, string>();
  for (const s of clean) {
    const k = shape(s);
    const cur = byShape.get(k);
    if (!cur || s.length < cur.length) byShape.set(k, s);
  }
  const forms = [...byShape.values()];

  // The canonical is the question in its most GENERIC form — Lee's own example
  // is the set's tersest, "What is the correct order?". Genericness is fewest
  // specific content words, NOT centrality: a terse stem shares little
  // vocabulary with anything, so a distance-based pick would rank it last
  // precisely because it is the best headline. Centrality breaks ties.
  const generic = (s: string) => words(s).length;
  const central = (s: string) => forms.reduce((n, o) => n + distance(s, o), 0);
  const canonical = canonicalIn?.trim()
    || forms.reduce((best, s) => {
      const d = generic(s) - generic(best);
      return d < 0 || (d === 0 && central(s) < central(best)) ? s : best;
    }, forms[0]);

  // Farthest-first: each pick maximises its distance to everything already shown.
  const pool = forms.filter((s) => s !== canonical);
  const picked: string[] = [];
  while (picked.length < MAX_VARIATIONS && pool.length) {
    let bestI = 0, bestScore = -1;
    for (let i = 0; i < pool.length; i++) {
      const score = Math.min(...[canonical, ...picked].map((p) => distance(pool[i], p)));
      if (score > bestScore) { bestScore = score; bestI = i; }
    }
    picked.push(pool.splice(bestI, 1)[0]);
  }
  return { canonical, variations: picked };
}
