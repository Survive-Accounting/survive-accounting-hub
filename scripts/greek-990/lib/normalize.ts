// Name/geo normalization + Greek-org identity + entity-type classification.
// Grounded in real EO BMF naming seen in the SEC states, e.g.:
//   "ALPHA PHI ZETA HOUSE CORPORATION OF LAMBDA CHI ALPHA FRATERNITY"  (house corp, desig=Alpha Phi Zeta)
//   "DELTA CHI-UNIVERSITY OF ALABAMA CHAPTER HOUSE CORPORATION"        (names the university)
//   "PI KAPPA ALPHA FRATERNITY"                                        (bare subordinate, GEN=0355)
//   "PHI THETA CHAPTER HOUSE CORPORATION OF DELTA DELTA DELTA FRATERNITY"

export const GREEK_WORDS = new Set([
  "ALPHA", "BETA", "GAMMA", "DELTA", "EPSILON", "ZETA", "ETA", "THETA", "IOTA",
  "KAPPA", "LAMBDA", "MU", "NU", "XI", "OMICRON", "PI", "RHO", "SIGMA", "TAU",
  "UPSILON", "PHI", "CHI", "PSI", "OMEGA",
]);

// Suffix noise on org names in BMF.
const ORG_SUFFIX = new Set(["FRATERNITY", "SORORITY", "INC", "INCORPORATED", "INTERNATIONAL", "THE", "OF", "AT", "A"]);

export function normalizeName(s: string): string {
  return (s || "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9 ]+/g, " ") // punctuation → space (hyphens, commas, periods)
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter(Boolean);
}

// City normalization + common USPS-ish abbreviations found in BMF.
const CITY_EXPAND: Record<string, string> = {
  COLL: "COLLEGE", STA: "STATION", STN: "STATION", HLS: "HILLS", HL: "HILL",
  SPGS: "SPRINGS", SPG: "SPRING", MT: "MOUNT", MTN: "MOUNTAIN", FT: "FORT",
  ST: "SAINT", HTS: "HEIGHTS", PT: "POINT", LK: "LAKE", VLG: "VILLAGE",
};
export function normalizeCity(s: string): string {
  return normalizeName(s)
    .split(" ")
    .map((w) => CITY_EXPAND[w] || w)
    .join(" ")
    .trim();
}

/** Loose city equality: exact after normalization, or one contained in the other (handles
 *  "COLLEGE STATION" vs "STATION", "SAINT LOUIS" vs "ST LOUIS"). */
export function cityMatches(a: string, b: string): boolean {
  const na = normalizeCity(a), nb = normalizeCity(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

/** Is `phrase` (array of tokens) a contiguous subsequence of `hay` (array of tokens)?
 *  Returns the end index (exclusive) of the first match, or -1. */
export function phraseAt(hay: string[], phrase: string[]): number {
  if (!phrase.length) return -1;
  for (let i = 0; i + phrase.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < phrase.length; j++) if (hay[i + j] !== phrase[j]) { ok = false; break; }
    if (ok) return i + phrase.length;
  }
  return -1;
}

export interface OrgIdentity {
  name: string;            // "Phi Delta Theta"
  nameTokens: string[];    // ["PHI","DELTA","THETA"]
  nickname?: string;
  council?: string;
  orgType?: string;
}

/** The list of Greek-org name token-phrases, longest first — used to detect when a
 *  candidate name actually belongs to a DIFFERENT, longer-named org (e.g. matching
 *  "ALPHA PHI" inside "ALPHA PHI ALPHA" / "ALPHA PHI OMEGA"). */
export function buildOrgPhraseIndex(orgs: OrgIdentity[]): string[][] {
  const seen = new Set<string>();
  const phrases: string[][] = [];
  for (const o of orgs) {
    const t = o.nameTokens.filter((w) => GREEK_WORDS.has(w)); // greek-letter words only
    if (t.length < 1) continue;
    const key = t.join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(t);
  }
  return phrases.sort((a, b) => b.length - a.length);
}

/** Greek-letter token phrase for an org, e.g. "Phi Delta Theta" → ["PHI","DELTA","THETA"]. */
export function orgGreekTokens(o: OrgIdentity): string[] {
  return o.nameTokens.filter((w) => GREEK_WORDS.has(w));
}

// ── Entity-type classification from the legal name (brief §4). Never assume LOCAL. ──
export type EntityType =
  | "LOCAL_CHAPTER_ENTITY" | "HOUSE_CORPORATION" | "ALUMNI_CORPORATION"
  | "EDUCATIONAL_FOUNDATION" | "SCHOLARSHIP_FOUNDATION" | "PROPERTY_HOLDING_ENTITY"
  | "NATIONAL_PARENT" | "OTHER_RELATED" | "UNKNOWN";

export function classifyEntityType(
  name: string,
  opts: { subsection?: string; affiliation?: string; hasDesignation?: boolean } = {},
): { type: EntityType; confidence: "HIGH" | "MEDIUM" | "LOW"; evidence: string } {
  const n = normalizeName(name);
  const has = (re: RegExp) => re.test(n);

  if (has(/\bSCHOLARSHIP\b/)) return { type: "SCHOLARSHIP_FOUNDATION", confidence: "HIGH", evidence: "name contains SCHOLARSHIP" };
  if (has(/\b(EDUCATIONAL FOUNDATION|EDUCATION FOUNDATION)\b/)) return { type: "EDUCATIONAL_FOUNDATION", confidence: "HIGH", evidence: "name contains EDUCATIONAL FOUNDATION" };
  if (has(/\bFOUNDATION\b/)) return { type: "EDUCATIONAL_FOUNDATION", confidence: "MEDIUM", evidence: "name contains FOUNDATION" };
  if (has(/\b(HOUSE CORP|HOUSE CORPORATION|HOUSING CORP|HOUSING CORPORATION|BUILDING (ASSOCIATION|CORPORATION|CO|FUND)|HOUSE ASSOCIATION|HOUSE ASSN|CHAPTER HOUSE)\b/))
    return { type: "HOUSE_CORPORATION", confidence: "HIGH", evidence: "name contains HOUSE/BUILDING corp" };
  if (has(/\b(TITLE HOLDING|PROPERTIES|PROPERTY|REAL ESTATE|HOLDING (CO|CORP|COMPANY))\b/) || opts.subsection === "02")
    return { type: "PROPERTY_HOLDING_ENTITY", confidence: opts.subsection === "02" ? "HIGH" : "MEDIUM", evidence: opts.subsection === "02" ? "501(c)(2) title-holding" : "name contains property/holding" };
  if (has(/\b(ALUMNI|ALUMNAE)\b/)) return { type: "ALUMNI_CORPORATION", confidence: "HIGH", evidence: "name contains ALUMNI/ALUMNAE" };
  // National parent: a central org (affiliation 6) or a bare national name with no chapter designation.
  if (opts.affiliation === "6") return { type: "NATIONAL_PARENT", confidence: "MEDIUM", evidence: "BMF affiliation=6 (central org)" };
  if (has(/\b(FRATERNITY|SORORITY)\b/) && !opts.hasDesignation && has(/\b(NATIONAL|INTERNATIONAL|GRAND)\b/))
    return { type: "NATIONAL_PARENT", confidence: "MEDIUM", evidence: "national/international, no chapter designation" };
  // A plain "<ORG> FRATERNITY/SORORITY" subordinate in a group is the undergraduate chapter entity.
  if (has(/\b(FRATERNITY|SORORITY)\b/) && (opts.affiliation === "9" || opts.subsection === "07"))
    return { type: "LOCAL_CHAPTER_ENTITY", confidence: "MEDIUM", evidence: "social-club subordinate (aff 9 / 501c7)" };
  if (has(/\bCHAPTER\b/)) return { type: "LOCAL_CHAPTER_ENTITY", confidence: "LOW", evidence: "name contains CHAPTER" };
  return { type: "UNKNOWN", confidence: "LOW", evidence: "no classifying keyword" };
}

/** All maximal consecutive Greek-letter runs in a token list, e.g.
 *  ["HOUSE","BOARD","OF","GAMMA","PI","OF","KAPPA","KAPPA","GAMMA"] → [["GAMMA","PI"],["KAPPA","KAPPA","GAMMA"]]. */
export function maximalGreekRuns(toks: string[]): string[][] {
  const runs: string[][] = [];
  let cur: string[] = [];
  for (const t of toks) {
    if (GREEK_WORDS.has(t)) cur.push(t);
    else { if (cur.length) runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** The entity's OWN chapter designation, if any: the first maximal Greek run that is NOT the
 *  org name itself. "EPSILON PHI HOUSE CORP OF KAPPA KAPPA GAMMA" → ["EPSILON","PHI"]. */
export function entityOwnDesignation(nameTokensHay: string[], orgTokens: string[]): string[] {
  const orgKey = orgTokens.join(" ");
  for (const run of maximalGreekRuns(nameTokensHay)) {
    if (run.join(" ") !== orgKey) return run;
  }
  return [];
}

/** Extract a plausible chapter-designation phrase (leading Greek letters) from a BMF name,
 *  e.g. "ALPHA PHI ZETA HOUSE CORPORATION OF ..." → "ALPHA PHI ZETA". Best-effort. */
export function leadingGreekDesignation(name: string): string {
  const t = tokens(name);
  const lead: string[] = [];
  for (const w of t) { if (GREEK_WORDS.has(w)) lead.push(w); else break; }
  return lead.join(" ");
}
