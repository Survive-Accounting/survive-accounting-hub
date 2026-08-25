/**
 * Greek Academic Intelligence — council normalization + chapter matching.
 *
 * Reports print chapter names in many forms ("Phi Delta Theta", "Phi Delt",
 * "ΦΔΘ", "SAE"). Resolve them against the canonical per-campus roster
 * (campus_greek_chapters joined to greek_orgs) WITHOUT forcing ambiguous matches.
 * Returns MATCHED | NEEDS_REVIEW | UNMATCHED and preserves the reported name.
 */

const GREEK = {
  "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon", "ζ": "zeta",
  "η": "eta", "θ": "theta", "ι": "iota", "κ": "kappa", "λ": "lambda", "μ": "mu",
  "ν": "nu", "ξ": "xi", "ο": "omicron", "π": "pi", "ρ": "rho", "σ": "sigma", "ς": "sigma",
  "τ": "tau", "υ": "upsilon", "φ": "phi", "χ": "chi", "ψ": "psi", "ω": "omega",
};
function expandGreek(s) {
  let out = "";
  for (const ch of String(s || "")) {
    const low = ch.toLowerCase();
    out += GREEK[low] ? ` ${GREEK[low]} ` : ch;
  }
  return out;
}
const STOP = /\b(fraternity|sorority|chapter|the|inc|incorporated|colony|interest group)\b/g;

/** Canonical normalized token string for a chapter/org name. */
export function normName(s) {
  return expandGreek(s)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(STOP, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Council normalization → ifc|panhellenic|nphc|mgc|other (mirrors councilMatches). */
export function normCouncil(s) {
  const n = String(s || "").toLowerCase().replace(/[^a-z]/g, "");
  if (!n) return null;
  if (/ifc|interfraternity|interfrat/.test(n)) return "ifc";
  if (/panhel|npc|cpc|collegepanhellenic/.test(n)) return "panhellenic";
  if (/nphc|nationalpanhellenic|divinenine|d9/.test(n)) return "nphc";
  if (/mgc|multicultural|nalfo|napa|nmgc/.test(n)) return "mgc";
  return "other";
}

/** Acronym of a normalized name: "sigma alpha epsilon" → "sae". */
function acronym(norm) {
  const parts = norm.split(" ").filter(Boolean);
  if (parts.length < 2) return "";
  return parts.map((p) => p[0]).join("");
}

/** Build a comparable identity bundle for one roster chapter. */
function chapterKeys(ch) {
  const org = ch.greek_orgs || {};
  const names = new Set();       // all identity strings, eligible for EXACT match
  const subsetNames = new Set(); // org-authoritative names, eligible for the PREFIX/subset rule
  const add = (v, subset) => { const n = normName(v); if (n) { names.add(n); if (subset) subsetNames.add(n); } };
  add(org.name, true);
  // chapter_designation is the LOCAL greek-letter chapter name (e.g. "Delta Kappa").
  // Allow it as an EXACT identity, but NEVER for the prefix rule — as a prefix it
  // collides with other orgs' names (ATO chapter "Delta Kappa" ⊂ "Delta Kappa Epsilon").
  add(ch.chapter_designation, false);
  const nicks = new Set();
  const addNick = (v) => { const n = normName(v); if (n) nicks.add(n); };
  addNick(org.nickname); addNick(ch.nickname);
  const acr = new Set();
  for (const n of subsetNames) { const a = acronym(n); if (a.length >= 2) acr.add(a); }
  // letters column may hold greek unicode or spelled letters — org-authoritative
  for (const L of [org.letters, ch.letters]) add(L, true);
  return {
    id: ch.id,
    orgId: ch.greek_org_id || null,
    canonical: org.name || ch.chapter_designation || null,
    council: normCouncil(ch.council || ch.council_raw || org.council),
    names, subsetNames, nicks, acr,
  };
}

/**
 * Match a reported chapter name (+ optional reported council) against the roster.
 * @returns {chapterId, orgId, canonicalName, council_normalized, matchStatus, matchConfidence, candidates}
 */
const EMPTY_SET = new Set();
/** Normalized string similarity (1 - Levenshtein/maxLen), for typo-vs-collision. */
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
function bestSim(target, nameSet) {
  let best = 0;
  for (const n of nameSet) { const d = lev(target, n); const s = 1 - d / Math.max(target.length, n.length, 1); if (s > best) best = s; }
  return best;
}

/** Acronyms shared by ≥2 national orgs (e.g. "pkp" = Pi Kappa Phi AND Phi Kappa Psi).
 *  Pass this to matchChapter so those never match via the acronym tier. */
export function buildAmbiguousAcronyms(orgs) {
  const counts = new Map();
  for (const o of orgs) { const a = acronym(normName(o.name)); if (a.length >= 2) counts.set(a, (counts.get(a) || 0) + 1); }
  return new Set([...counts].filter(([, n]) => n >= 2).map(([a]) => a));
}
/** Set of normalized valid national-org names — a reported name IN this set is a
 *  real distinct org, so it must never be acronym-matched to a DIFFERENT org. */
export function buildValidOrgNames(orgs) {
  return new Set(orgs.map((o) => normName(o.name)).filter(Boolean));
}

export function matchChapter(reportedName, reportedCouncil, rosterChapters, prebuilt, opts = {}) {
  const ambiguousAcr = opts.ambiguousAcr || EMPTY_SET;
  const validOrgNames = opts.validOrgNames || EMPTY_SET;
  const target = normName(reportedName);
  const tcouncil = normCouncil(reportedCouncil);
  const tacr = acronym(target) || target.replace(/\s/g, "");
  if (!target) return { chapterId: null, orgId: null, canonicalName: null, council_normalized: tcouncil, matchStatus: "UNMATCHED", matchConfidence: "low", candidates: 0 };

  const keys = prebuilt || rosterChapters.map(chapterKeys);
  // council gate: if the report says a council and the roster has council data,
  // prefer candidates in the same council; but don't discard if roster council is missing.
  const pool = keys;

  // A reported name that is itself a KNOWN distinct national org must only resolve to
  // its own exact entry — never fall through to subset/nick/acronym/fuzzy tiers against
  // a DIFFERENT org. This is what separates real collisions ("Pi Kappa Phi" ≠ "Phi
  // Kappa Psi", "Delta Sigma Pi" ≠ "Delta Sigma Phi") from OCR typos, which are not
  // valid org names and so may still be rescued fuzzily.
  const targetIsKnownOrg = validOrgNames.has(target);

  const exact = [], letter = [], nick = [], acr = [], fuzzy = [];
  for (const k of pool) {
    const councilOk = !tcouncil || !k.council || k.council === "other" || k.council === tcouncil;
    if (k.names.has(target)) { (councilOk ? exact : fuzzy).push(k); continue; }
    if (targetIsKnownOrg && !k.subsetNames.has(target)) continue; // known org ≠ this org → no fuzzy crossover
    // letter/name subset either direction (handles "phi delt" vs "phi delta theta")
    let subset = false;
    for (const n of k.subsetNames) {
      if (n === target) { subset = true; break; }
      if (n.length >= 6 && target.length >= 6 && (n.startsWith(target + " ") || target.startsWith(n + " "))) { subset = true; break; }
    }
    if (subset) { (councilOk ? letter : fuzzy).push(k); continue; }
    if (k.nicks.has(target)) { (councilOk ? nick : fuzzy).push(k); continue; }
    // Acronym tier. For acronyms shared by ≥2 national orgs (e.g. "pkp" = Pi Kappa
    // Phi AND Phi Kappa Psi), only accept when the reported name is a near-typo of
    // THIS candidate's name (high similarity) — a genuine different-org collision is
    // far in edit distance and rejected; an OCR typo ("KAPPE ALPHA PSI") is close and
    // rescued. Unambiguous acronyms are always safe.
    if (tacr.length >= 2 && (k.acr.has(tacr) || k.nicks.has(tacr))) {
      // Ambiguous acronym → only accept when the reported name is NOT itself a real
      // (different) org AND is a near-typo of this candidate. That rescues OCR typos
      // ("KAPPE ALPHA PSI") while rejecting genuine collisions ("Pi Kappa Phi" is a
      // real org, distinct from "Phi Kappa Psi", even though both = PKP and are ~2 edits apart).
      const targetIsRealOtherOrg = validOrgNames.has(target) && !k.subsetNames.has(target);
      const acrOk = !ambiguousAcr.has(tacr) || (!targetIsRealOtherOrg && bestSim(target, k.subsetNames) >= 0.82);
      if (acrOk) { (councilOk ? acr : fuzzy).push(k); continue; }
    }
    // token-overlap fuzzy (all target tokens present in a candidate name)
    const ttok = target.split(" ").filter((w) => w.length > 2);
    if (ttok.length >= 2) {
      for (const n of k.names) {
        const ntok = new Set(n.split(" "));
        if (ttok.every((w) => ntok.has(w))) { fuzzy.push(k); break; }
      }
    }
  }

  const pick = (arr, status, conf) => {
    const uniq = dedupeById(arr);
    if (uniq.length === 1) return decide(uniq[0], status, conf, uniq.length);
    if (uniq.length > 1) {
      // multiple candidates: if council disambiguates to one, take it; else NEEDS_REVIEW
      const inC = tcouncil ? uniq.filter((k) => k.council === tcouncil) : [];
      if (inC.length === 1) return decide(inC[0], status, "medium", uniq.length);
      return decide(uniq[0], "NEEDS_REVIEW", "low", uniq.length);
    }
    return null;
  };
  const decide = (k, status, conf, n) => ({
    chapterId: k.id, orgId: k.orgId, canonicalName: k.canonical,
    council_normalized: tcouncil || k.council || null, matchStatus: status, matchConfidence: conf, candidates: n,
  });

  return (
    pick(exact, "MATCHED", "high") ||
    pick(letter, "MATCHED", "high") ||
    pick(nick, "MATCHED", "medium") ||
    pick(acr, "MATCHED", "medium") ||
    pick(fuzzy, "NEEDS_REVIEW", "low") ||
    { chapterId: null, orgId: null, canonicalName: null, council_normalized: tcouncil, matchStatus: "UNMATCHED", matchConfidence: "low", candidates: 0 }
  );
}

function dedupeById(arr) {
  const seen = new Set(); const out = [];
  for (const k of arr) { if (seen.has(k.id)) continue; seen.add(k.id); out.push(k); }
  return out;
}

export { chapterKeys };
