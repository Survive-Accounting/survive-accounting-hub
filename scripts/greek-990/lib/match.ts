// Candidate discovery + explainable scoring for chapter ↔ legal-entity matching.
// Precision over coverage (brief §10/§27): a match is HIGH only with a real
// disambiguator (campus city, university-in-name, or chapter designation) — a bare
// national name in the right state is LOW and stays unlinked.
import {
  type BmfRow,
} from "./bmf";
import {
  GREEK_WORDS, classifyEntityType, cityMatches, entityOwnDesignation,
  normalizeName, phraseAt, tokens, type EntityType,
} from "./normalize";

export interface CampusRef {
  id: string;
  name: string;
  city: string;
  state: string;
  aliases?: string[];
  nameTokens: string[];       // normalized tokens of canonical name
  coreTokens: string[];       // distinctive tokens (drop stopwords) e.g. ["ALABAMA"]
}

export interface ChapterMatchInput {
  chapterId: string;
  orgName: string;
  orgGreekTokens: string[];   // e.g. ["PHI","DELTA","THETA"]
  designation?: string;       // e.g. "Alabama Alpha"
  council?: string;
  campus: CampusRef;
  nationalGen?: string;       // group exemption number of the national org, if known
}

export type Confidence = "HIGH_CONFIDENCE" | "MEDIUM_CONFIDENCE" | "LOW_CONFIDENCE" | "REJECTED";

export interface Candidate {
  ein: string;
  legalName: string;
  city: string;
  state: string;
  zip: string;
  entityType: EntityType;
  entityTypeConfidence: "HIGH" | "MEDIUM" | "LOW";
  entityTypeEvidence: string;
  score: number;
  confidence: Confidence;
  nameEvidence: string;
  locationEvidence: string;
  genEvidence: string;
  designationEvidence: string;
  subsection: string;
  affiliation: string;
  gen: string;
  ntee: string;
  ruling: string;
  assetAmt: number;
  incomeAmt: number;
  revenueAmt: number;
  bmf: BmfRow;
}

const STOP = new Set(["UNIVERSITY", "OF", "THE", "AT", "COLLEGE", "STATE", "A", "AND"]);

/** Distinctive campus tokens for "university-in-name" checks (e.g. "ALABAMA", "AUBURN"). */
export function campusCoreTokens(name: string): string[] {
  return tokens(name).filter((t) => !STOP.has(t) && t.length > 2);
}

/** True only if the candidate name contains the FULL campus name (canonical phrase or a
 *  ≥2-token alias) — and is NOT a branch campus ("University of Alabama IN Huntsville",
 *  "... AT <place>"). A bare state token ("TEXAS") is deliberately NOT enough: it would
 *  match Texas Tech / Texas A&M for a UT-Austin chapter. City match carries that weight. */
function universityInName(hay: string[], campus: CampusRef): { hit: boolean; how: string } {
  const tryPhrase = (label: string, phrase: string[]): { hit: boolean; how: string } | null => {
    if (phrase.length < 2) return null;
    const end = phraseAt(hay, phrase);
    if (end < 0) return null;
    // Branch-campus guard: reject if the campus phrase is followed by IN/AT (+ a place word).
    if (end < hay.length && (hay[end] === "IN" || hay[end] === "AT")) return { hit: false, how: "" };
    return { hit: true, how: `names "${label}"` };
  };
  const canon = tryPhrase(campus.name, tokens(campus.name).filter((t) => t !== "THE"));
  if (canon?.hit) return canon;
  for (const a of campus.aliases || []) {
    const r = tryPhrase(a, tokens(a).filter((t) => t !== "THE"));
    if (r?.hit) return r;
  }
  return { hit: false, how: "" };
}

/**
 * Find scored candidate entities for one chapter within a pool of BMF rows
 * (already filtered to the relevant states).
 */
export function matchChapter(
  input: ChapterMatchInput,
  pool: BmfRow[],
  orgPhraseIndex: string[][],
): Candidate[] {
  const org = input.orgGreekTokens;
  if (org.length < 1) return [];
  const orgKey = org.join(" ");
  // Full designation tokens (keep non-Greek words like "Alabama" — more specific than letters alone).
  const desigFull = input.designation ? tokens(input.designation) : [];
  const hasDesig = desigFull.length > 0;

  const out: Candidate[] = [];
  for (const row of pool) {
    if (row.status && row.status !== "01") continue; // 01 = active exemption; skip revoked/other
    const hay = tokens(row.name);
    const at = phraseAt(hay, org);
    if (at < 0) continue; // name anchor required
    const startIdx = at - org.length;

    // The org name must be a MAXIMAL Greek-letter run: not preceded or followed by
    // another Greek-letter word. This rejects fragments of a *different* org's name —
    //   "ALPHA PHI ZETA HOUSE CORP OF LAMBDA CHI ALPHA" (ALPHA PHI is Lambda Chi's designation),
    //   "PHI SIGMA KAPPA" matched for Sigma Kappa, "ALPHA CHI OMEGA" matched for Chi Omega —
    // while keeping real names bounded by non-Greek words ("... OF PHI MU FRATERNITY").
    if (startIdx > 0 && GREEK_WORDS.has(hay[startIdx - 1])) continue;
    if (at < hay.length && GREEK_WORDS.has(hay[at])) continue;

    // "... OF <different org>" guard: if a DIFFERENT known org appears just after an "OF"
    // and our phrase sits before that "OF", our phrase is the chapter designation of the
    // other org ("THETA TAU CHAPTER OF OMEGA PSI PHI" → Omega Psi Phi, not Theta Tau).
    let ofConflict = false;
    for (let k = 0; k < hay.length; k++) {
      if (hay[k] !== "OF" || startIdx >= k) continue;
      for (const p of orgPhraseIndex) {
        if (p.join(" ") === orgKey) continue; // our own org is fine
        if (phraseAt(hay.slice(k + 1, k + 1 + p.length), p) === p.length) { ofConflict = true; break; }
      }
      if (ofConflict) break;
    }
    if (ofConflict) continue;

    // ── scoring ──
    let score = 40; // name anchor
    const nameEvidence = `org name "${input.orgName}" present as a phrase`;

    // location
    let locationEvidence = "same state only";
    const cityHit = cityMatches(row.city, input.campus.city);
    const uni = universityInName(hay, input.campus);
    if (uni.hit) { score += 25; locationEvidence = uni.how; }
    if (cityHit) { score += 25; locationEvidence = uni.hit ? `${uni.how}; city=${row.city}` : `campus city match (${row.city})`; }

    // Chapter designation — count ONLY when it occurs in the name at a span DISJOINT from the
    // org-name occurrence. Otherwise a designation that overlaps the org letters ("Gamma Delta"
    // chapter of "Alpha Gamma Delta") would just re-match the org name and fake a strong signal.
    let designationEvidence = "";
    if (hasDesig) {
      const dEnd = phraseAt(hay, desigFull);
      if (dEnd >= 0) {
        const dStart = dEnd - desigFull.length;
        const disjoint = dEnd <= startIdx || dStart >= at; // org occupies [startIdx, at)
        if (disjoint) {
          score += 20;
          designationEvidence = `designation "${input.designation}" present`;
        }
      }
    }

    // group exemption
    let genEvidence = "";
    if (input.nationalGen && row.group && row.group !== "0000" && row.group === input.nationalGen) {
      score += 15;
      genEvidence = `GEN ${row.group} matches national org`;
    } else if (row.group && row.group !== "0000") {
      genEvidence = `in group ${row.group} (unverified)`;
    }

    const cls = classifyEntityType(row.name, {
      subsection: row.subsection, affiliation: row.affiliation, hasDesignation: hasDesig,
    });
    if (cls.type !== "UNKNOWN") score += 5;
    if (["07", "03", "02"].includes(row.subsection)) score += 3;

    // Sibling-chapter guard: when THIS chapter's designation is known, an entity that carries a
    // DIFFERENT explicit chapter designation (and did not match ours) is another chapter's entity
    // that merely shares our campus city — e.g. "EPSILON PHI HOUSE CORP OF KAPPA KAPPA GAMMA"
    // linked to the "Gamma Pi" (Alabama) chapter. Cap such matches at review, never auto-link.
    let siblingConflict = false;
    if (hasDesig && !designationEvidence) {
      const own = entityOwnDesignation(hay, org);
      if (own.length) {
        const desigSet = new Set(desigFull);
        const overlap = own.some((t) => desigSet.has(t));
        if (!overlap) siblingConflict = true;
      }
    }

    // ── confidence tiers ──
    const strongDisambiguator = uni.hit || cityHit || (!!designationEvidence && designationEvidence.includes("present"));
    let confidence: Confidence;
    if (siblingConflict) confidence = score >= 48 ? "MEDIUM_CONFIDENCE" : "LOW_CONFIDENCE";
    else if (strongDisambiguator && score >= 65) confidence = "HIGH_CONFIDENCE";
    else if (score >= 48) confidence = "MEDIUM_CONFIDENCE";
    else confidence = "LOW_CONFIDENCE";

    out.push({
      ein: row.ein,
      legalName: row.name,
      city: row.city,
      state: row.state,
      zip: row.zip,
      entityType: cls.type,
      entityTypeConfidence: cls.confidence,
      entityTypeEvidence: cls.evidence,
      score,
      confidence,
      nameEvidence,
      locationEvidence,
      genEvidence,
      designationEvidence,
      subsection: row.subsection,
      affiliation: row.affiliation,
      gen: row.group,
      ntee: row.ntee,
      ruling: row.ruling,
      assetAmt: row.asset_amt,
      incomeAmt: row.income_amt,
      revenueAmt: row.revenue_amt,
      bmf: row,
    });
  }

  // De-dup by EIN keeping best score; sort best-first.
  const byEin = new Map<string, Candidate>();
  for (const c of out) {
    const prev = byEin.get(c.ein);
    if (!prev || c.score > prev.score) byEin.set(c.ein, c);
  }
  return [...byEin.values()].sort((a, b) => b.score - a.score);
}

export function recommendedAction(c: Candidate): "AUTO_LINK" | "REVIEW" | "SKIP" {
  if (c.confidence === "HIGH_CONFIDENCE") return "AUTO_LINK";
  if (c.confidence === "MEDIUM_CONFIDENCE") return "REVIEW";
  return "SKIP";
}
