/**
 * Greek Academic Intelligence — eligible campus universe.
 *
 * Eligible = has verified/meaningful social Greek life:
 *   greek_eligibility != 'no_social_greek'
 *   AND (greek_eligibility='eligible' OR has ≥1 IFC/Panhellenic roster chapter)
 *   AND institution_type != 'system'  AND resolvable domain
 * Prioritized by IFC+Panhellenic chapter count (bigger Greek systems reliably
 * publish community/grade reports).
 */
export function firstDomain(domains) {
  if (!domains) return "";
  if (Array.isArray(domains)) return String(domains[0] ?? "").trim().toLowerCase();
  return String(domains).replace(/[{}"]/g, "").split(",")[0].trim().toLowerCase();
}
const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/** Registrable parent domain: greeklife.utexas.edu → utexas.edu. */
export function parentDomain(domain) {
  if (!domain) return "";
  const parts = String(domain).toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}
export function campusDomain(c) {
  return firstDomain(c.domains)
    || (c.email_domain || "").toLowerCase()
    || hostOf(c.website_url || "")
    || hostOf(c.fsl_url || "")
    || "";
}
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Filter + dedupe raw campus rows into the eligible Greek universe.
 * @param rows campus rows
 * @param councilMap Map<campusId, {ifc,panhel,nphc,mgc,total}>
 */
export function eligibleUniverse(rows, councilMap) {
  const kept = rows.filter((c) => {
    if ((c.institution_type || "") === "system") return false;
    if ((c.greek_eligibility || "") === "no_social_greek") return false;
    const cc = councilMap.get(c.id);
    const hasChapters = cc && cc.total > 0;               // any social Greek roster presence
    const flagged = (c.greek_eligibility || "") === "eligible";
    if (!hasChapters && !flagged) return false;
    // Domain-less campuses are kept: harvest resolves the official .edu via one
    // conservative SERP lookup; if that fails the campus returns resolve_campus_domain.
    return true;
  });
  // dedupe by primary domain (collapse alias rows); keep the richest.
  const score = (c) => {
    const cc = councilMap.get(c.id) || { total: 0 };
    return (cc.total || 0) * 10 + (campusDomain(c) ? 2 : 0) + (norm(c.name).length > 0 ? 1 : 0);
  };
  const byKey = new Map();
  for (const c of kept) {
    const dom = parentDomain(campusDomain(c));
    const key = dom || `${c.state || ""}|${norm(c.canonical_name || c.name)}`;
    const prev = byKey.get(key);
    if (!prev || score(c) > score(prev)) byKey.set(key, c);
  }
  const list = [...byKey.values()];
  // priority: IFC+Panhel chapter count desc, then total chapters
  list.sort((a, b) => {
    const A = councilMap.get(a.id) || { ifc: 0, panhel: 0, total: 0 };
    const B = councilMap.get(b.id) || { ifc: 0, panhel: 0, total: 0 };
    return (B.ifc + B.panhel) - (A.ifc + A.panhel) || (B.total - A.total);
  });
  return list;
}

/** Diverse ~10-campus preflight (spec §25): large SEC publishers, PDF vs HTML,
 *  archive holders, a private, and matching edge cases. Falls back to top-by-size. */
const PREFLIGHT_HINTS = [
  "alabama", "auburn", "tennessee knoxville", "georgia", "florida",
  "arkansas", "missouri", "purdue", "indiana", "vanderbilt",
];
export function pickPreflight(universe) {
  const picked = []; const used = new Set();
  for (const hint of PREFLIGHT_HINTS) {
    const hit = universe.find((c) => !used.has(c.id) && norm(c.name).includes(norm(hint)));
    if (hit) { picked.push(hit); used.add(hit.id); }
  }
  for (const c of universe) { // top up by size
    if (picked.length >= 10) break;
    if (!used.has(c.id)) { picked.push(c); used.add(c.id); }
  }
  return picked.slice(0, 10);
}

export { norm, hostOf };
