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
  const names = new Set();
  const add = (v) => { const n = normName(v); if (n) names.add(n); };
  add(org.name); add(ch.chapter_designation);
  const nicks = new Set();
  const addNick = (v) => { const n = normName(v); if (n) nicks.add(n); };
  addNick(org.nickname); addNick(ch.nickname);
  const acr = new Set();
  for (const n of names) { const a = acronym(n); if (a.length >= 2) acr.add(a); }
  // letters column may hold greek unicode or spelled letters
  for (const L of [org.letters, ch.letters]) { const n = normName(L); if (n) names.add(n); }
  return {
    id: ch.id,
    orgId: ch.greek_org_id || null,
    canonical: org.name || ch.chapter_designation || null,
    council: normCouncil(ch.council || ch.council_raw || org.council),
    names, nicks, acr,
  };
}

/**
 * Match a reported chapter name (+ optional reported council) against the roster.
 * @returns {chapterId, orgId, canonicalName, council_normalized, matchStatus, matchConfidence, candidates}
 */
export function matchChapter(reportedName, reportedCouncil, rosterChapters, prebuilt) {
  const target = normName(reportedName);
  const tcouncil = normCouncil(reportedCouncil);
  const tacr = acronym(target) || target.replace(/\s/g, "");
  if (!target) return { chapterId: null, orgId: null, canonicalName: null, council_normalized: tcouncil, matchStatus: "UNMATCHED", matchConfidence: "low", candidates: 0 };

  const keys = prebuilt || rosterChapters.map(chapterKeys);
  // council gate: if the report says a council and the roster has council data,
  // prefer candidates in the same council; but don't discard if roster council is missing.
  const pool = keys;

  const exact = [], letter = [], nick = [], acr = [], fuzzy = [];
  for (const k of pool) {
    const councilOk = !tcouncil || !k.council || k.council === "other" || k.council === tcouncil;
    if (k.names.has(target)) { (councilOk ? exact : fuzzy).push(k); continue; }
    // letter/name subset either direction (handles "phi delt" vs "phi delta theta")
    let subset = false;
    for (const n of k.names) {
      if (n === target) { subset = true; break; }
      if (n.length >= 6 && target.length >= 6 && (n.startsWith(target + " ") || target.startsWith(n + " "))) { subset = true; break; }
    }
    if (subset) { (councilOk ? letter : fuzzy).push(k); continue; }
    if (k.nicks.has(target)) { (councilOk ? nick : fuzzy).push(k); continue; }
    if (tacr.length >= 2 && (k.acr.has(tacr) || k.nicks.has(tacr))) { (councilOk ? acr : fuzzy).push(k); continue; }
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
