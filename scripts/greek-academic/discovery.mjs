/**
 * Greek Academic Intelligence — discovery: query building, keep-filtering,
 * file-type + report/archive classification. Precision-first: on-campus-domain
 * ONLY, so a report can never be attributed to the wrong school. Public docs only.
 */
export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
export const canon = (u) => (u || "").split("#")[0];
export const fileTypeOf = (u) => {
  const m = (u || "").toLowerCase().match(/\.(pdf|docx?|xlsx?|csv|html?)(\?|$)/);
  if (!m) return "html";
  const e = m[1];
  return e === "htm" ? "html" : e === "doc" ? "docx" : e === "xls" ? "xlsx" : e;
};

// Private / access-controlled surfaces — never fetch (spec §6).
const PRIVATE_HOST = /(canvas|blackboard|brightspace|d2l|moodle|login|sso|auth|myportal|portal\.|secure\.|webmail|password)/i;
// Doc mills / third-party copies (spec §5 LOW — excluded for v1 to avoid contamination).
const RESTRICTED_HOSTS = /(coursehero|scribd|chegg|quizlet|studocu|slideshare|yumpu|issuu|studylib|greekrank|niche\.com|reddit)\./i;

// Report-name signals (spec §4 titles).
const REPORT_TITLE = /(greek|community|fraternity|sorority|chapter|scholarship)[\s\S]{0,40}(academic|grade|scholarship|scorecard)[\s\S]{0,20}(report|performance|scorecard)|grade\s+report|academic\s+report|scholarship\s+report|chapter\s+scorecard|community\s+grade/i;
// Weaker signal: greek terms + gpa/grades.
const GREEK_TERM = /(fraternit|sororit|\bgreek\b|\bifc\b|panhellenic|\bnphc\b|\bmgc\b|chapter)/i;
const ACADEMIC_TERM = /(\bgpa\b|grade\s?point|academic\s+(report|performance)|scholarship|grade\s+report|dean'?s\s+list)/i;
// Non-report noise on the same domain.
const NON_REPORT = /(news|apply|admission|tuition|calendar|event|form|newsletter|magazine|athletics|giving|donate|alumni\s+magazine)/i;

/** Query set (bounded). Ordered by expected yield (spec addendum priority). */
export function buildQueries(domain) {
  if (!domain) return [];
  // Unquoted, recall-first phrasings surface the FSL reports/archive LANDING page
  // (e.g. /fscl/resources/reports.php) which keepDoc marks isArchive → crawled for
  // per-semester report links. Exact-title queries catch schools that name reports
  // literally. Ordered by expected yield (spec addendum: latest report first).
  return [
    `site:${domain} fraternity sorority grades report`,
    `site:${domain} fraternity sorority reports`,
    `site:${domain} greek grade report`,
    `site:${domain} "Greek Academic Report"`,
    `site:${domain} "Community Academic Report"`,
    `site:${domain} fraternity sorority GPA report filetype:pdf`,
    `site:${domain} (IFC OR Panhellenic) academic report GPA`,
    `site:${domain} fraternity sorority scholarship report`,
  ];
}

/** Is the URL on the campus's own (parent) domain? */
export function isOnDomain(url, domain) {
  if (!domain) return false;
  const h = hostOf(url);
  return h === domain || h.endsWith(`.${domain}`);
}

/**
 * Keep decision for a discovered result.
 * @returns {keep, reason, reportType, isArchive, fileType, confidence}
 */
export function keepDoc({ title, url, snippet, domain }) {
  const h = hostOf(url);
  if (RESTRICTED_HOSTS.test(h)) return { keep: false, reason: "restricted" };
  if (PRIVATE_HOST.test(h) || PRIVATE_HOST.test(url)) return { keep: false, reason: "private_surface" };
  if (!isOnDomain(url, domain)) return { keep: false, reason: "off_domain" };

  const hay = `${title} ${url} ${snippet}`;
  const ft = fileTypeOf(url);
  const strong = REPORT_TITLE.test(hay);
  const weak = GREEK_TERM.test(hay) && ACADEMIC_TERM.test(hay);
  if (!strong && !weak) return { keep: false, reason: "no_report_signal" };
  // A pure news/admissions page that only coincidentally matched → drop unless strong+doc.
  if (NON_REPORT.test(hay) && !strong && ft === "html") return { keep: false, reason: "non_report_noise" };

  const reportType = classifyReportType(hay);
  // Archive candidate: an HTML page whose title/url implies a list of reports
  // (plural / "archive" / "past" / no single term) — fetch once, follow links.
  const isArchive = ft === "html" && /(reports|archive|past|previous|grades|scholarship|academics?)\b/i.test(`${title} ${url}`) && !/(fall|spring|summer|winter)\s*\d{4}/i.test(hay);
  const confidence = strong ? "high" : "medium";
  return { keep: true, reportType, isArchive, fileType: ft, confidence };
}

function classifyReportType(hay) {
  if (/community\s+(academic|grade)/i.test(hay)) return "community_academic_report";
  if (/greek\s+academic/i.test(hay)) return "greek_academic_report";
  if (/grade\s+report/i.test(hay)) return "grade_report";
  if (/scholarship\s+report/i.test(hay)) return "scholarship_report";
  if (/scorecard/i.test(hay)) return "scorecard";
  if (/academic\s+performance/i.test(hay)) return "academic_performance";
  return "other";
}

/** From an archive page's links, keep those that look like individual reports. */
export function reportLinksFromArchive(links, domain) {
  const out = [];
  const seen = new Set();
  for (const raw of links || []) {
    const u = canon(raw);
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (!isOnDomain(u, domain)) continue;
    if (PRIVATE_HOST.test(u) || RESTRICTED_HOSTS.test(hostOf(u))) continue;
    const ft = fileTypeOf(u);
    const isDoc = ft === "pdf" || ft === "xlsx" || ft === "csv" || ft === "docx";
    const looksReport = /(gpa|grade|academic|scholarship|greek|fraternit|sororit|report|scorecard)/i.test(u);
    // term/year in the URL is a strong report signal
    const hasTerm = /(fall|spring|summer|winter)[-_ ]?\d{2,4}|\b20\d{2}\b/i.test(u);
    if ((isDoc && (looksReport || hasTerm)) || (looksReport && hasTerm)) {
      out.push({ url: u, fileType: ft });
    }
  }
  return out.slice(0, 25); // cap history per archive (spec §18: recent 3-5yr, cheap)
}

const DOMAIN_AGGREGATORS = /(greekrank|niche\.com|wikipedia|facebook|instagram|linkedin|twitter|x\.com|youtube|reddit|collegefactual|usnews|petersons|cappex|unigo|ratemyprofessors|indeed|glassdoor|yelp|.*\.gov$)/i;

/**
 * Resolve a campus's official parent .edu domain via ONE un-scoped SERP query,
 * for campuses with no stored domain. Conservative: only accept a .edu parent
 * domain that appears in ≥2 top results (or is the #1 result's host), so a wrong
 * school can never be attributed. Returns { domain, evidenceCount } or null.
 * @param serpFn async (q,num)=>{ok,results:[{title,link,snippet}]}
 */
export async function resolveDomainViaSerp(serpFn, campusName) {
  const q = `${campusName} fraternity and sorority life`;
  const res = await serpFn(q, 10);
  if (!res?.ok || !res.results?.length) return null;
  const tally = new Map(); let firstEdu = null;
  for (const r of res.results) {
    const h = hostOf(r.link);
    if (!h || DOMAIN_AGGREGATORS.test(h) || !/\.edu$/.test(h)) continue;
    const pd = h.split(".").slice(-2).join(".");
    if (!firstEdu) firstEdu = pd;
    tally.set(pd, (tally.get(pd) || 0) + 1);
  }
  if (!tally.size) return null;
  let best = null, bestN = 0;
  for (const [d, n] of tally) if (n > bestN) { best = d; bestN = n; }
  if (bestN >= 2) return { domain: best, evidenceCount: bestN };
  if (firstEdu && tally.get(firstEdu) === bestN) return { domain: firstEdu, evidenceCount: bestN }; // single strong .edu
  return null;
}

/** Guess term/year from a title/url string. */
export function guessTermYear(s) {
  const t = String(s || "").toLowerCase();
  const ym = t.match(/\b(20\d{2})\b/);
  const tm = t.match(/\b(fall|spring|summer|winter)\b/);
  return { term: tm ? tm[1] : null, year: ym ? parseInt(ym[1], 10) : null };
}
export function semesterKey(term, year) {
  if (!term && !year) return null;
  return `${term || "unknown"}_${year || "unknown"}`;
}
