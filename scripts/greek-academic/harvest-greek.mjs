/**
 * Greek Academic Intelligence — per-campus executor.
 * discovery → fetch → AI extract → chapter match → persist → status.
 * Precision-first, public-only, failure-isolated: any error is caught and the
 * campus finishes with a status row rather than crashing the batch.
 */
import { serpSearch, firecrawlMarkdown, firecrawlWithLinks, aiExtractReport, UNIT_COST } from "./providers.mjs";
import * as db from "./db.mjs";
import { campusDomain, parentDomain } from "./universe.mjs";
import {
  buildQueries, keepDoc, canon, hostOf, fileTypeOf, reportLinksFromArchive, guessTermYear, semesterKey, resolveDomainViaSerp,
} from "./discovery.mjs";
import { matchChapter, chapterKeys, normCouncil } from "./match.mjs";
import { cleanChapter, flagDuplicates } from "./quality.mjs";

const MAX_REPORT_CANDIDATES = 6;   // non-archive candidates to consider from SERP
const MAX_ARCHIVES = 2;            // archive pages to expand
const MAX_PARSE_PER_CAMPUS = 8;    // fetch+AI ceiling per campus (cost guard)
function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
const rankConf = { low: 1, medium: 2, high: 3 };

export async function harvestCampus(campus, ctx, keys) {
  let domain = parentDomain(campusDomain(campus));
  const name = campus.name || campus.canonical_name || "";
  const startedAt = new Date().toISOString();
  const roster = ctx.chapters || [];
  const prebuilt = roster.map(chapterKeys);

  const c = { serp: 0, firecrawl: 0, ai: 0, restricted: 0, filtered: 0, rateLimited: false, lastError: null };
  const candidates = []; const seen = new Set();
  let archiveUrl = null; let highestConf = null;
  const bump = (lvl) => { if (lvl && (!highestConf || rankConf[lvl] > rankConf[highestConf])) highestConf = lvl; };

  const addCandidate = (obj) => {
    const u = canon(obj.url); if (!u || seen.has(u)) return; seen.add(u);
    candidates.push({ ...obj, url: u });
  };

  // Resolve a missing domain via ONE un-scoped SERP lookup (conservative: only a
  // .edu appearing in ≥2 top results is accepted, so we never attribute the wrong
  // school). SERP is not the scarce resource; a resolvable domain unlocks the big
  // publishers that lack stored domain data.
  if (!domain && !ctx.shouldStop()) {
    const rd = await resolveDomainViaSerp((q, n) => serpSearch(keys.serp, q, n), name);
    c.serp++;
    if (rd?.domain) domain = rd.domain;
  }
  if (!domain) {
    return finish(campus, name, startedAt, c, [], null, "no_public_data", "resolve_campus_domain", highestConf);
  }

  // ── 0. Seed URL from campus_context.fsl_grade_report_url (free, no SERP) ─────
  if (ctx.seedUrl) {
    const ty = guessTermYear(ctx.seedUrl);
    addCandidate({ url: ctx.seedUrl, title: "FSL grade report (seed)", fileType: fileTypeOf(ctx.seedUrl), reportType: "grade_report", confidence: "high", isArchive: fileTypeOf(ctx.seedUrl) === "html", discovered_by: "seed_campus_context", ...ty });
  }

  // ── 1. SERP discovery (bounded, stop early) ─────────────────────────────────
  const queries = buildQueries(domain);
  const archives = [];
  for (const q of queries) {
    if (ctx.shouldStop()) break;
    const { ok, results, status, error } = await serpSearch(keys.serp, q, 10);
    c.serp++;
    if (!ok) { if (status === 429) c.rateLimited = true; if (error) c.lastError = error; continue; }
    for (const r of results) {
      const d = keepDoc({ title: r.title, url: r.link, snippet: r.snippet, domain });
      if (!d.keep) { if (d.reason === "restricted" || d.reason === "private_surface") c.restricted++; continue; }
      const ty = guessTermYear(`${r.title} ${r.link}`);
      const cand = { url: r.link, title: r.title, snippet: r.snippet, fileType: d.fileType, reportType: d.reportType, confidence: d.confidence, isArchive: d.isArchive, discovered_by: "serp", ...ty };
      if (d.isArchive) { if (!archives.find((a) => canon(a.url) === canon(r.link))) archives.push(cand); }
      addCandidate(cand);
    }
    // Only stop early on a genuinely STRONG signal (≥2 high-confidence report-title
    // matches). Weak greek-life-page matches must NOT halt discovery — SERP is not
    // the scarce resource, so exhaust the query set to maximize report recall.
    const strong = candidates.filter((x) => !x.isArchive && x.confidence === "high");
    if (strong.length >= 2) break;
  }

  // ── 2. Archive-first expansion: fetch archive pages ONCE, follow report links ─
  for (const a of archives.slice(0, MAX_ARCHIVES)) {
    if (ctx.shouldStop()) break;
    const res = await firecrawlWithLinks(keys.firecrawl, a.url);
    c.firecrawl++;
    if (!res) continue;
    archiveUrl = archiveUrl || a.url;
    a._markdown = res.markdown; // the archive page itself may hold a table
    for (const l of reportLinksFromArchive(res.links, domain)) {
      const ty = guessTermYear(l.url);
      addCandidate({ url: l.url, title: "(from archive)", fileType: l.fileType, reportType: "grade_report", confidence: "medium", isArchive: false, discovered_by: "archive", ...ty });
    }
  }

  // ── 3. Rank: latest year first, prefer docs & known report types (spec priority) ─
  const parseList = candidates
    .filter((x) => !x.isArchive || x._markdown)
    .sort((x, y) => (y.year || 0) - (x.year || 0)
      || (rankConf[y.confidence] - rankConf[x.confidence])
      || (docRank(y.fileType) - docRank(x.fileType)))
    .slice(0, MAX_PARSE_PER_CAMPUS);

  // ── 4. Fetch + AI-extract + match + persist ─────────────────────────────────
  let reportsFound = 0, chaptersMatched = 0, chaptersUnmatched = 0, chaptersReview = 0;
  let memberRecords = 0, businessRecords = 0; const semesters = new Set();
  let latestTerm = null, latestYear = null;

  for (const cand of parseList) {
    if (ctx.shouldStop()) break;
    if (c.firecrawl + c.serp > 40) break; // hard per-campus request ceiling
    let md = cand._markdown;
    if (!md) {
      if (cand.fileType === "csv") md = await fetchText(cand.url);
      else { md = await firecrawlMarkdown(keys.firecrawl, cand.url); c.firecrawl++; }
    }
    if (!md || md.length < 80) continue;
    const h = hash(md);
    const ai = await aiExtractReport(keys.ai, md, { term: cand.term, year: cand.year });
    c.ai++;
    if (!ai || ai.not_a_report || (!Array.isArray(ai.chapters) || ai.chapters.length === 0)) {
      // record a discovered-but-empty report so we don't re-fetch endlessly
      continue;
    }

    const term = normTerm(ai.term) || cand.term;
    const year = intOr(ai.year, cand.year);
    const skey = semesterKey(term, year);
    const scale = numOr(ai.gpa_scale, 4.0);
    const scope = ai.council_scope || "unknown";

    // upsert the report row
    let report;
    try {
      report = await db.upsertReport({
        campus_id: campus.id, report_title: (ai.report_title || cand.title || "").slice(0, 300),
        report_type: cand.reportType || "other", council_scope: scope,
        term, year, semester_key: skey,
        source_url: cand.url, canonical_url: canon(cand.url), source_domain: hostOf(cand.url),
        source_type: sourceType(cand.url, domain), file_type: cand.fileType, discovered_by: cand.discovered_by,
        retrieved_at: new Date().toISOString(), last_checked: new Date().toISOString(), last_changed: new Date().toISOString(),
        content_hash: h, parse_status: "parsed", confidence: cand.confidence,
        business_students_count: intOrNull(ai.business_students_count),
        business_students_percent: numOrNull(ai.business_students_percent),
        accounting_students_count: intOrNull(ai.accounting_students_count),
        major_breakdown: ai.council_averages ? { council_averages: ai.council_averages } : null,
      });
    } catch (e) { c.lastError = String(e.message || e); continue; }
    if (!report?.id) continue;
    reportsFound++; bump(cand.confidence); if (skey) semesters.add(skey);
    if (ai.business_students_count != null) businessRecords++;
    if (year && (!latestYear || year > latestYear)) { latestYear = year; latestTerm = term; }

    // per-council averages from the report header (for baselines)
    const councilAvg = {};
    for (const ca of ai.council_averages || []) { const k = normCouncil(ca.council); if (k) councilAvg[k] = numOrNull(ca.gpa); }

    // build + match chapter rows
    const rows = [];
    for (const ch of ai.chapters) {
      const reportedName = String(ch.name || "").trim();
      if (!reportedName) continue;
      const { clean, flags } = cleanChapter(ch, scale);
      const m = matchChapter(reportedName, ch.council, roster, prebuilt);
      if (m.matchStatus === "MATCHED") chaptersMatched++;
      else if (m.matchStatus === "NEEDS_REVIEW") chaptersReview++;
      else chaptersUnmatched++;
      if (clean.member_count != null) memberRecords++;
      if (clean.business_students_count != null) businessRecords++;
      rows.push({
        campus_id: campus.id, campus_greek_chapter_id: m.chapterId, greek_org_id: m.orgId,
        source_report_id: report.id,
        council: ch.council || null, council_normalized: m.council_normalized,
        chapter_name_as_reported: reportedName.slice(0, 200), canonical_chapter_name: m.canonicalName,
        term, year, semester_key: skey,
        ...clean,
        all_greek_average_gpa: numOrNull(ai.all_greek_gpa),
        all_men_gpa: numOrNull(ai.all_men_gpa), all_women_gpa: numOrNull(ai.all_women_gpa),
        all_undergraduate_gpa: numOrNull(ai.all_undergraduate_gpa),
        council_average_gpa: clean.council_average_gpa ?? councilAvg[m.council_normalized] ?? null,
        number_of_chapters_in_council: null,
        gpa_scale: scale, source_url: cand.url,
        parse_confidence: cand.confidence, match_status: m.matchStatus, match_confidence: m.matchConfidence,
        quality_flags: flags,
      });
    }
    flagDuplicates(rows);
    try { await db.replaceChapterAcademics(report.id, rows); }
    catch (e) { c.lastError = String(e.message || e); }
  }

  // ── 5. Status ────────────────────────────────────────────────────────────────
  let status, action;
  if (reportsFound > 0) {
    const onlyReview = chaptersMatched === 0 && (chaptersReview > 0 || chaptersUnmatched > 0);
    status = onlyReview ? "needs_review" : "complete";
    action = onlyReview ? "review_chapter_matches" : "ready_for_market_integration";
  } else if (c.lastError && candidates.length === 0) {
    status = "failed"; action = "retry_error";
  } else if (c.rateLimited) {
    status = "needs_review"; action = "retry_later_rate_limited";
  } else {
    status = "no_public_data"; action = "no_public_report_found";
  }

  return finish(campus, name, startedAt, c, [], archiveUrl, status, action, highestConf, {
    reportsFound, chaptersMatched, chaptersUnmatched: chaptersUnmatched + chaptersReview,
    memberRecords, businessRecords, semesters: semesters.size, latestTerm, latestYear,
  });
}

// ── helpers ────────────────────────────────────────────────────────────────
function finish(campus, name, startedAt, c, _u, archiveUrl, status, action, highestConf, extra = {}) {
  const costUsd = c.serp * UNIT_COST.serp + c.firecrawl * UNIT_COST.firecrawl + c.ai * UNIT_COST.ai;
  const statusRow = {
    campus_id: campus.id, campus_name: name, state: campus.state || null,
    status, last_attempted_at: startedAt, last_success_at: status === "failed" ? null : new Date().toISOString(),
    reports_found: extra.reportsFound || 0, semesters_found: extra.semesters || 0,
    chapters_matched: extra.chaptersMatched || 0, chapters_unmatched: extra.chaptersUnmatched || 0,
    member_records: extra.memberRecords || 0, business_records: extra.businessRecords || 0,
    latest_report_term: extra.latestTerm || null, latest_report_year: extra.latestYear || null, archive_url: archiveUrl,
    serp_searches: c.serp, firecrawl_fetches: c.firecrawl, ai_parses: c.ai,
    est_cost_usd: +costUsd.toFixed(4), highest_source_confidence: highestConf,
    last_error: c.lastError ? String(c.lastError).slice(0, 400) : null, recommended_next_action: action,
    started_at: startedAt, finished_at: new Date().toISOString(),
  };
  return {
    statusRow, costUsd, serp: c.serp, firecrawl: c.firecrawl, ai: c.ai, rateLimited: c.rateLimited,
    status, reportsFound: extra.reportsFound || 0, chaptersMatched: extra.chaptersMatched || 0,
    chaptersUnmatched: extra.chaptersUnmatched || 0, memberRecords: extra.memberRecords || 0,
    businessRecords: extra.businessRecords || 0, semesters: extra.semesters || 0, archiveUrl,
    error: (status === "failed" && c.lastError) ? c.lastError : undefined,
  };
}
const docRank = (ft) => (ft === "pdf" ? 3 : ft === "xlsx" || ft === "csv" ? 2 : 1);
function sourceType(url, domain) {
  const h = hostOf(url);
  if (h === domain || h.endsWith(`.${domain}`)) {
    if (/greek|fsl|fraternity|sororit|student|orgs?/i.test(url)) return "official_university_fsl";
    return "official_hosted_report";
  }
  return "third_party";
}
const numOr = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const numOrNull = (v) => { if (v == null) return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const intOr = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const intOrNull = (v) => { if (v == null) return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
function normTerm(t) {
  if (!t) return null;
  const s = String(t).toLowerCase();
  if (s.includes("fall")) return "fall";
  if (s.includes("spring")) return "spring";
  if (s.includes("summer")) return "summer";
  if (s.includes("winter")) return "winter";
  return null;
}
async function fetchText(url) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(30000) }); if (!r.ok) return null; return await r.text(); } catch { return null; }
}
