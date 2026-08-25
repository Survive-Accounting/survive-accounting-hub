/**
 * Course Intel harvest — eligible campus universe.
 *
 * There is no stored is_target flag; the "~816 structural universe" is a filter:
 *   is_research_only = false                          (loadCampuses already applies)
 *   AND name NOT ILIKE '%test%'                       (loadCampuses already applies)
 *   AND institution_type != 'system'                  (district/system aggregate rows)
 *   AND de-duplicated by primary domain + normalized name (alias rows collapse)
 *
 * Excluded on purpose: research-only (no intro course), test fixtures, system
 * aggregates (docs would contaminate many campuses), and obvious alias duplicates.
 */

export function firstDomain(domains) {
  if (!domains) return "";
  if (Array.isArray(domains)) return String(domains[0] ?? "").trim().toLowerCase();
  return String(domains).replace(/[{}"]/g, "").split(",")[0].trim().toLowerCase();
}
const hostOf = (u) => { try { return new URL(/^https?:/.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/** Registrable parent domain: mccombs.utexas.edu → utexas.edu; southalabama.edu → southalabama.edu.
 *  Lets a business-school-subdomain campus still reach the university's main syllabus/registrar host,
 *  while the unique course code in site+code queries keeps attribution tight. */
export function parentDomain(domain) {
  if (!domain) return "";
  const parts = String(domain).toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

/** Best available .edu host for a campus (many lack `domains`). */
export function campusDomain(c) {
  return firstDomain(c.domains)
    || (c.email_domain || "").toLowerCase()
    || hostOf(c.website_url || "")
    || hostOf(c.accounting_department_url || "")
    || hostOf(c.faculty_page_url || "")
    || "";
}

/** Intro-1 course code — reads the CORRECT column (course_family_codes_json.intro_1,
 *  a plain string). Falls back to the legacy course_codes_json shape if present. */
export function introCode(c) {
  const fam = c.course_family_codes_json;
  if (fam && typeof fam === "object" && !Array.isArray(fam) && fam.intro_1) return String(fam.intro_1).trim();
  let j = c.course_codes_json;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { j = null; } }
  if (j && typeof j === "object") {
    for (const k of ["intro_1", "intro-accounting-1"]) {
      const v = j[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object" && v.local_course_code) return String(v.local_course_code).trim();
    }
  }
  return "";
}

export function introTitle(c) {
  const t = c.course_family_titles_json;
  if (t && typeof t === "object" && t.intro_1) return String(t.intro_1).trim();
  return "";
}

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Filter + dedupe the raw campus rows into the eligible universe. */
export function eligibleUniverse(rows) {
  const kept = rows.filter((c) => (c.institution_type || "") !== "system");
  // Dedupe: collapse rows that share a primary domain, OR share a normalized
  // name within the same state. Keep the "richest" row (has code > has domain > longer name).
  const score = (c) => (introCode(c) ? 4 : 0) + (campusDomain(c) ? 2 : 0) + (norm(c.name).length > 0 ? 1 : 0);
  const byKey = new Map();
  for (const c of kept) {
    const dom = campusDomain(c);
    const key = dom || `${c.state || ""}|${norm(c.canonical_name || c.name)}`;
    const prev = byKey.get(key);
    if (!prev || score(c) > score(prev)) byKey.set(key, c);
  }
  return [...byKey.values()];
}

/** A deliberately diverse 10-campus preflight set (matched by name substring). */
export const PREFLIGHT_HINTS = [
  { hint: "florida", why: "strong public syllabus repo (UF Warrington)" },
  { hint: "texas", why: "HB 2504 public-syllabus mandate" },
  { hint: "alabama", why: "public OIRA repo" },
  { hint: "arkansas", why: "explicit exam-range syllabi found in audit" },
  { hint: "auburn", why: "SEC, catalog-only public footprint (hard case)" },
  { hint: "ucla", why: "large public, intermediate-only codes (code-less intro)" },
  { hint: "duke", why: "private, thin public footprint" },
  { hint: "ole miss", why: "home institution / known course code" },
  { hint: "kansas state", why: "zero-RMP-intro1 case per audit" },
  { hint: "park", why: "predictable-filename public repo" },
];

export function pickPreflight(universe) {
  const picked = [];
  const used = new Set();
  for (const { hint } of PREFLIGHT_HINTS) {
    const hit = universe.find((c) => !used.has(c.id) && norm(c.name).includes(norm(hint)));
    if (hit) { picked.push(hit); used.add(hit.id); }
  }
  // top up to 10 with any campus that has an intro code + domain
  for (const c of universe) {
    if (picked.length >= 10) break;
    if (!used.has(c.id) && introCode(c) && campusDomain(c)) { picked.push(c); used.add(c.id); }
  }
  return picked.slice(0, 10);
}
