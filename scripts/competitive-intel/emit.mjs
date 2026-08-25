// Emit all competitive-intelligence deliverables from discovery (+ enrichment) data.
// Pure computation over data/competitors.json — re-runnable anytime (also on partial data).
import fs from 'node:fs';
import path from 'node:path';
import { toCsv, DATA } from './lib.mjs';

const OUT = path.resolve('competitive-intel-output');
fs.mkdirSync(OUT, { recursive: true });

const results = JSON.parse(fs.readFileSync(path.join(DATA, 'competitors.json'), 'utf8'));
const universe = JSON.parse(fs.readFileSync(path.join(DATA, 'universe.json'), 'utf8'));
const enrichment = fs.existsSync(path.join(DATA, 'enrichment.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'enrichment.json'), 'utf8')) : {};
// Merge enrichment (pricing/offerings) into each competitor row, once, up front.
for (const r of Object.values(results)) {
  for (const c of r.competitors || []) {
    const e = enrichment[c.domain];
    if (!e || !e.scraped) continue;
    c.pricing_model = c.pricing_model || e.pricing_model;
    c.price = c.price || e.price;
    c.free_trial = c.free_trial || e.free_trial;
    c.free_content = c.free_content || e.free_content;
    if (e.offerings?.length) c.offerings = [...new Set([...(c.offerings || []), ...e.offerings])];
    if (e.professor_specific === 'YES') c.professor_specific = 'YES';
  }
}
const uById = new Map(universe.map((u) => [u.campus_id, u]));
const yieldStats = fs.existsSync(path.join(DATA, 'serp-yield.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'serp-yield.json'), 'utf8')) : {};
const campuses = Object.values(results).filter((r) => r.done);

// ── Type groupings ────────────────────────────────────────────────────────────
const LOCAL_STRONG = new Set(['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING']);
const CAMPUS_PLATFORM = new Set(['MULTI_CAMPUS_TUTORING', 'EXAM_PREP_PLATFORM']);
const NATIONAL_GROUP = new Set(['NOTES_MARKETPLACE', 'TUTOR_MARKETPLACE', 'EXAM_PREP_PLATFORM', 'NATIONAL_COURSEWARE', 'MULTI_CAMPUS_TUTORING']);
const acctYes = (c) => c.intro_accounting_supported === 'YES' || c.intro_accounting_supported === 'LIKELY';

// §3E conceptual model cluster for a competitor.
function modelCluster(c) {
  const t = c.competitor_type;
  const off = new Set(c.offerings || []);
  const seLike = off.has('video_content') && (off.has('practice_exams') || off.has('exam_reviews'));
  if (t === 'COURSE_SPECIFIC_SITE') return seLike ? 'STUDY_EDGE_MODEL' : 'COURSE_SPECIFIC_TUTORING_PLATFORM';
  if (t === 'EXAM_PREP_PLATFORM') return (c.campus_specific === 'YES' && seLike) ? 'STUDY_EDGE_MODEL' : 'NATIONAL_PLATFORM';
  if (t === 'MULTI_CAMPUS_TUTORING') return 'MULTI_CAMPUS_REGIONAL';
  if (t === 'LOCAL_CAMPUS_TUTORING') return off.has('one_on_one') ? 'INDIVIDUAL_TUTOR_SCALED' : 'LOCAL_REVIEW_CENTER';
  if (t === 'TUTOR_MARKETPLACE' || t === 'NOTES_MARKETPLACE' || t === 'NATIONAL_COURSEWARE') return 'NATIONAL_PLATFORM';
  return 'OTHER';
}

function confidence(c) {
  if (c.course_specific_site && acctYes(c)) return 'high';
  if (c.source_kind === 'brand') return c.campus_specific === 'YES' ? 'high' : 'medium';
  if (c.campus_specific === 'YES' && acctYes(c)) return 'medium';
  return 'low';
}

// ── Per-campus signals ────────────────────────────────────────────────────────
function campusSignal(r) {
  const comps = r.competitors || [];
  const strongLocal = comps.filter((c) => LOCAL_STRONG.has(c.competitor_type) && acctYes(c));
  const strongLocalYes = comps.filter((c) => LOCAL_STRONG.has(c.competitor_type) && c.intro_accounting_supported === 'YES');
  const campusPlatform = comps.filter((c) => CAMPUS_PLATFORM.has(c.competitor_type) && c.campus_specific === 'YES' && acctYes(c));
  const acctComps = comps.filter(acctYes);
  const localAny = comps.filter((c) => ['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING', 'MULTI_CAMPUS_TUTORING'].includes(c.competitor_type));
  const courseSpecific = comps.filter((c) => c.course_specific_site);
  const ads = r.ads || [];
  const adsAny = ads.length > 0;
  const acctAds = ads.filter((a) => /ad_probe|acct|tutoring|review|prep/.test(a.family) && (a.kind === 'candidate' || a.kind === 'brand')).length > 0;
  const mo = r.market_opportunity ?? uById.get(r.campus_id)?.market_opportunity ?? null;

  let proven;
  if (courseSpecific.length >= 1 || strongLocalYes.length >= 1 || campusPlatform.length >= 1 || acctAds) proven = 'HIGH';
  else if (strongLocal.length >= 1 || localAny.length >= 2 || adsAny) proven = 'MEDIUM';
  else if (acctComps.length >= 1) proven = 'LOW';
  else proven = 'UNKNOWN';

  let intro;
  if (strongLocal.length >= 1 || campusPlatform.length >= 1) intro = 'STRONG';
  else if (acctComps.length >= 2) intro = 'MODERATE';
  else if (acctComps.length === 1) intro = 'WEAK';
  else intro = 'UNKNOWN';

  let paidAcademic;
  if (strongLocal.length >= 1 || campusPlatform.length >= 1 || localAny.length >= 2) paidAcademic = 'STRONG';
  else if (localAny.length === 1 || adsAny) paidAcademic = 'MODERATE';
  else if (comps.length >= 1) paidAcademic = 'WEAK';
  else paidAcademic = 'UNKNOWN';

  let validation;
  if (r.searches < 3) validation = 'LOW_EVIDENCE';
  else if (acctComps.length >= 4 && strongLocal.length >= 1) validation = 'CROWDED';
  else if (strongLocal.length >= 1 || campusPlatform.length >= 1) validation = 'VALIDATED_PAID_MARKET';
  else if ((mo ?? 0) >= 55) validation = 'WHITE_SPACE';
  else validation = 'LOW_EVIDENCE';

  // Strongest competitor for the campus (prefer strong local, then campus platform, then any local).
  const rank = (c) => (c.course_specific_site ? 5 : 0) + (LOCAL_STRONG.has(c.competitor_type) ? 4 : 0)
    + (CAMPUS_PLATFORM.has(c.competitor_type) ? 3 : 0) + (c.campus_specific === 'YES' ? 2 : 0)
    + (acctYes(c) ? 1 : 0) + (c.sponsored ? 1 : 0);
  const strongest = [...comps].sort((a, b) => rank(b) - rank(a))[0] || null;

  return { proven, intro, paidAcademic, validation, strongLocal, campusPlatform, acctComps, localAny, courseSpecific, adsAny, acctAds, strongest, mo };
}

// ── 1. COMPETITOR_INTELLIGENCE.csv (competitor × campus) ──────────────────────
const ciHeaders = ['competitor_name', 'domain', 'campus_id', 'campus', 'state', 'course_code', 'competitor_type', 'model_cluster',
  'intro_accounting_supported', 'campus_specific', 'course_specific_site', 'professor_specific', 'sponsored',
  'pricing_model', 'price', 'free_trial', 'free_content', 'practice_exams', 'exam_reviews', 'video_content',
  'live_reviews', 'one_on_one', 'study_guides', 'subscription', 'other_offerings', 'query_families', 'source_url', 'retrieved_at', 'confidence'];
const ciRows = [];
for (const r of campuses) {
  const u = uById.get(r.campus_id) || {};
  for (const c of r.competitors) {
    const off = new Set(c.offerings || []);
    ciRows.push({
      competitor_name: c.brand || c.domain, domain: c.domain, campus_id: r.campus_id, campus: r.campus, state: r.state,
      course_code: r.intro1_code || '', competitor_type: c.competitor_type, model_cluster: modelCluster(c),
      intro_accounting_supported: c.intro_accounting_supported, campus_specific: c.campus_specific,
      course_specific_site: c.course_specific_site ? 'YES' : 'NO', professor_specific: c.professor_specific, sponsored: c.sponsored ? 'YES' : 'NO',
      pricing_model: c.pricing_model || '', price: c.price || '', free_trial: c.free_trial || '', free_content: c.free_content || '',
      practice_exams: off.has('practice_exams') ? 'YES' : '', exam_reviews: off.has('exam_reviews') ? 'YES' : '',
      video_content: off.has('video_content') ? 'YES' : '', live_reviews: off.has('live_reviews') ? 'YES' : '',
      one_on_one: off.has('one_on_one') ? 'YES' : '', study_guides: off.has('study_guides') ? 'YES' : '',
      subscription: off.has('subscription') ? 'YES' : '', other_offerings: (c.other_offerings || []).join('; '),
      query_families: (c.families || []).join('; '), source_url: c.source_url, retrieved_at: r.retrieved_at, confidence: confidence(c),
    });
  }
}
fs.writeFileSync(path.join(OUT, 'COMPETITOR_INTELLIGENCE.csv'), toCsv(ciRows, ciHeaders));

// ── 2. CAMPUS_COMPETITIVE_SUMMARY.csv ─────────────────────────────────────────
const csHeaders = ['campus_id', 'campus', 'state', 'course_code', 'market_opportunity', 'tier',
  'paid_competitors_found', 'intro1_competitors_found', 'local_competitors_found', 'course_specific_competitors',
  'strongest_competitor', 'strongest_competitor_type', 'strongest_competitor_price',
  'proven_paid_market', 'intro_accounting_paid_market_status', 'paid_academic_market_status', 'market_validation',
  'university_free_support', 'competitor_ads_observed', 'general_accounting_ads_observed',
  'brand_conquest_candidate', 'nonbrand_search_candidate',
  'top_competitor_keyword_1', 'top_competitor_keyword_2', 'top_nonbrand_keyword_1', 'top_nonbrand_keyword_2',
  'searches_run', 'sources', 'data_confidence'];
const csRows = [];
for (const r of campuses) {
  const s = campusSignal(r);
  const u = uById.get(r.campus_id) || {};
  const code = r.intro1_code;
  // Brand conquest candidate = a notable non-national brand competitor exists.
  const conquestBrands = r.competitors.filter((c) => (LOCAL_STRONG.has(c.competitor_type) || CAMPUS_PLATFORM.has(c.competitor_type)) && c.brand)
    .map((c) => c.brand).filter((b) => !/Survive/.test(b));
  const conquestDomains = r.competitors.filter((c) => (LOCAL_STRONG.has(c.competitor_type) || CAMPUS_PLATFORM.has(c.competitor_type)))
    .sort((a, b) => (b.course_specific_site ? 1 : 0) - (a.course_specific_site ? 1 : 0)).map((c) => c.brand || c.domain);
  const brandConquest = conquestDomains.length > 0 ? 'YES' : 'NO';
  const nonbrand = code ? 'YES' : (u.name ? 'PARTIAL' : 'NO');
  const kw = (x) => x || '';
  const topBrandKw1 = conquestDomains[0] || '';
  const topBrandKw2 = conquestDomains[0] ? `${conquestDomains[0]} accounting` : (conquestDomains[1] || '');
  const nbk1 = code ? `${code} exam 1` : `${u.short_name || r.campus} financial accounting exam`;
  const nbk2 = code ? `${code} practice exam` : `${u.short_name || r.campus} accounting tutoring`;
  const dataConf = r.searches >= 8 ? 'high' : r.searches >= 4 ? 'medium' : 'low';
  csRows.push({
    campus_id: r.campus_id, campus: r.campus, state: r.state, course_code: code || '', market_opportunity: s.mo, tier: r.tier,
    paid_competitors_found: r.paid_competitors, intro1_competitors_found: r.intro1_competitors,
    local_competitors_found: s.localAny.length, course_specific_competitors: s.courseSpecific.length,
    strongest_competitor: s.strongest ? (s.strongest.brand || s.strongest.domain) : '',
    strongest_competitor_type: s.strongest ? s.strongest.competitor_type : '',
    strongest_competitor_price: s.strongest ? (s.strongest.price || '') : '',
    proven_paid_market: s.proven, intro_accounting_paid_market_status: s.intro,
    paid_academic_market_status: s.paidAcademic, market_validation: s.validation,
    university_free_support: r.university_free_support ? 'YES' : 'NO',
    competitor_ads_observed: s.adsAny ? 'YES' : 'NO', general_accounting_ads_observed: s.acctAds ? 'YES' : 'NO',
    brand_conquest_candidate: brandConquest, nonbrand_search_candidate: nonbrand,
    top_competitor_keyword_1: kw(topBrandKw1), top_competitor_keyword_2: kw(topBrandKw2),
    top_nonbrand_keyword_1: nbk1, top_nonbrand_keyword_2: nbk2,
    searches_run: r.searches, sources: [...new Set(r.competitors.map((c) => c.domain))].slice(0, 8).join('; '), data_confidence: dataConf,
  });
}
csRows.sort((a, b) => (b.market_opportunity ?? -1) - (a.market_opportunity ?? -1));
fs.writeFileSync(path.join(OUT, 'CAMPUS_COMPETITIVE_SUMMARY.csv'), toCsv(csRows, csHeaders));

// ── 3. Global competitor registry (aggregate by domain) ───────────────────────
const registry = new Map();
for (const r of campuses) {
  for (const c of r.competitors) {
    const g = registry.get(c.domain) ?? {
      domain: c.domain, brand: c.brand || null, types: {}, campuses: new Set(), acct: false,
      campusSpecific: false, courseSpecific: false, professor: false, sponsored: false,
      offerings: new Set(), sources: new Set(), topCampuses: [],
    };
    g.brand = g.brand || c.brand;
    g.types[c.competitor_type] = (g.types[c.competitor_type] || 0) + 1;
    g.campuses.add(r.campus_id);
    if (acctYes(c)) g.acct = true;
    if (c.campus_specific === 'YES') g.campusSpecific = true;
    if (c.course_specific_site) g.courseSpecific = true;
    if (c.professor_specific === 'YES') g.professor = true;
    if (c.sponsored) g.sponsored = true;
    for (const o of c.offerings || []) g.offerings.add(o);
    if (c.source_url) g.sources.add(c.source_url);
    g.topCampuses.push({ campus: r.campus, mo: r.market_opportunity ?? 0 });
    registry.set(c.domain, g);
  }
}
const regList = [...registry.values()].map((g) => {
  const type = Object.entries(g.types).sort((a, b) => b[1] - a[1])[0][0];
  const cluster = modelCluster({ competitor_type: type, offerings: [...g.offerings], campus_specific: g.campusSpecific ? 'YES' : 'NO', course_specific_site: g.courseSpecific });
  const nCampus = g.campuses.size;
  // market strength heuristic
  let strength = 'LOW';
  if (g.courseSpecific && (g.offerings.has('video_content') || g.offerings.has('practice_exams'))) strength = 'HIGH';
  else if (nCampus >= 15 || (CAMPUS_PLATFORM.has(type) && nCampus >= 3)) strength = 'HIGH';
  else if (nCampus >= 4 || LOCAL_STRONG.has(type)) strength = 'MEDIUM';
  const top = [...g.topCampuses].sort((a, b) => b.mo - a.mo).slice(0, 5).map((x) => x.campus);
  return {
    domain: g.domain, brand: g.brand || g.domain, competitor_type: type, model_cluster: cluster,
    campuses_served: nCampus, accounting_supported: g.acct ? 'YES' : 'UNKNOWN',
    campus_specific: g.campusSpecific ? 'YES' : 'NO', course_specific_site: g.courseSpecific ? 'YES' : 'NO',
    professor_specific: g.professor ? 'YES' : 'UNKNOWN', sponsored_anywhere: g.sponsored ? 'YES' : 'NO',
    offerings: [...g.offerings].join('; '), estimated_market_strength: strength,
    top_campuses: top.join('; '), sources: [...g.sources].slice(0, 3).join('; '),
  };
});
regList.sort((a, b) => b.campuses_served - a.campuses_served);

// ── 4. STUDY_EDGE_LIKE_COMPETITORS.csv ────────────────────────────────────────
const seLike = regList.filter((g) =>
  ['STUDY_EDGE_MODEL', 'COURSE_SPECIFIC_TUTORING_PLATFORM', 'MULTI_CAMPUS_REGIONAL', 'LOCAL_REVIEW_CENTER'].includes(g.model_cluster)
  || g.course_specific_site === 'YES' || ['EXAM_PREP_PLATFORM', 'MULTI_CAMPUS_TUTORING'].includes(g.competitor_type));
const seHeaders = ['competitor', 'domain', 'model_type', 'competitor_type', 'campuses_served', 'accounting_supported',
  'course_specific_site', 'professor_specific', 'video_reviews', 'practice_exams', 'exam_reviews', 'one_on_one',
  'sponsored_anywhere', 'estimated_market_strength', 'top_campuses', 'sources'];
const seRows = seLike.map((g) => ({
  competitor: g.brand, domain: g.domain, model_type: g.model_cluster, competitor_type: g.competitor_type,
  campuses_served: g.campuses_served, accounting_supported: g.accounting_supported,
  course_specific_site: g.course_specific_site, professor_specific: g.professor_specific,
  video_reviews: /video_content/.test(g.offerings) ? 'YES' : '', practice_exams: /practice_exams/.test(g.offerings) ? 'YES' : '',
  exam_reviews: /exam_reviews/.test(g.offerings) ? 'YES' : '', one_on_one: /one_on_one/.test(g.offerings) ? 'YES' : '',
  sponsored_anywhere: g.sponsored_anywhere, estimated_market_strength: g.estimated_market_strength,
  top_campuses: g.top_campuses, sources: g.sources,
}));
fs.writeFileSync(path.join(OUT, 'STUDY_EDGE_LIKE_COMPETITORS.csv'), toCsv(seRows, seHeaders));

// ── 5. TOP_VALIDATED_PAID_CAMPUSES.csv ────────────────────────────────────────
const validated = campuses.map((r) => {
  const s = campusSignal(r);
  const score = s.strongLocal.length * 5 + s.campusPlatform.length * 3 + s.courseSpecific.length * 4
    + s.localAny.length * 1.5 + (s.acctAds ? 3 : 0) + (s.adsAny ? 1 : 0);
  return { r, s, score };
}).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || (b.s.mo ?? 0) - (a.s.mo ?? 0));
const tvHeaders = ['rank', 'campus', 'state', 'course_code', 'market_opportunity', 'validation_score',
  'proven_paid_market', 'intro_accounting_paid_market_status', 'market_validation',
  'course_specific_competitors', 'local_competitors', 'strongest_competitor', 'ads_observed', 'evidence'];
const tvRows = validated.map((x, i) => {
  const s = x.s, r = x.r;
  const ev = [];
  if (s.courseSpecific.length) ev.push(`${s.courseSpecific.length} course-specific site(s): ${s.courseSpecific.map((c) => c.domain).slice(0, 3).join(', ')}`);
  if (s.strongLocal.length) ev.push(`${s.strongLocal.length} local paid accounting competitor(s)`);
  if (s.campusPlatform.length) ev.push(`${s.campusPlatform.length} campus-specific platform(s)`);
  if (s.acctAds) ev.push('paid accounting search ads observed');
  return {
    rank: i + 1, campus: r.campus, state: r.state, course_code: r.intro1_code || '', market_opportunity: s.mo,
    validation_score: +x.score.toFixed(1), proven_paid_market: s.proven, intro_accounting_paid_market_status: s.intro,
    market_validation: s.validation, course_specific_competitors: s.courseSpecific.length, local_competitors: s.localAny.length,
    strongest_competitor: s.strongest ? (s.strongest.brand || s.strongest.domain) : '', ads_observed: s.adsAny ? 'YES' : 'NO',
    evidence: ev.join(' | '),
  };
});
fs.writeFileSync(path.join(OUT, 'TOP_VALIDATED_PAID_CAMPUSES.csv'), toCsv(tvRows, tvHeaders));

// ── 6. PAID_ACCOUNTING_MARKETS.csv ────────────────────────────────────────────
const paHeaders = ['campus', 'state', 'course_code', 'market_opportunity', 'intro_accounting_paid_market_status',
  'accounting_competitors', 'course_specific_sites', 'strongest_competitor', 'competitor_domains'];
const paRows = campuses.map((r) => ({ r, s: campusSignal(r) }))
  .filter((x) => ['STRONG', 'MODERATE'].includes(x.s.intro))
  .sort((a, b) => (b.s.mo ?? 0) - (a.s.mo ?? 0))
  .map(({ r, s }) => ({
    campus: r.campus, state: r.state, course_code: r.intro1_code || '', market_opportunity: s.mo,
    intro_accounting_paid_market_status: s.intro, accounting_competitors: s.acctComps.length,
    course_specific_sites: s.courseSpecific.map((c) => c.domain).join('; '),
    strongest_competitor: s.strongest ? (s.strongest.brand || s.strongest.domain) : '',
    competitor_domains: s.acctComps.map((c) => c.domain).slice(0, 10).join('; '),
  }));
fs.writeFileSync(path.join(OUT, 'PAID_ACCOUNTING_MARKETS.csv'), toCsv(paRows, paHeaders));

// ── 7. COMPETITOR_BRAND_KEYWORD_CANDIDATES.csv (INTERNAL research only) ───────
const bkHeaders = ['brand', 'domain', 'model_type', 'campuses_served', 'estimated_market_strength',
  'candidate_keyword_1', 'candidate_keyword_2', 'candidate_keyword_3', 'candidate_keyword_4', 'example_campuses', 'note'];
const NOTE = 'INTERNAL keyword research only — do NOT place competitor trademarks in ad copy';
const bkRows = seLike.filter((g) => g.brand && !/Survive/.test(g.brand) && g.estimated_market_strength !== 'LOW')
  .map((g) => {
    const b = g.brand;
    const topC = g.top_campuses.split('; ')[0] || '';
    return {
      brand: b, domain: g.domain, model_type: g.model_cluster, campuses_served: g.campuses_served,
      estimated_market_strength: g.estimated_market_strength,
      candidate_keyword_1: b, candidate_keyword_2: `${b} accounting`,
      candidate_keyword_3: topC ? `${b} ${topC}` : `${b} review`, candidate_keyword_4: `${b} reviews`,
      example_campuses: g.top_campuses, note: NOTE,
    };
  });
fs.writeFileSync(path.join(OUT, 'COMPETITOR_BRAND_KEYWORD_CANDIDATES.csv'), toCsv(bkRows, bkHeaders));

// ── 8. SERP_COMPETITOR_SEARCH_YIELD.csv ───────────────────────────────────────
const syHeaders = ['query_family', 'searches_run', 'useful_results', 'new_competitors', 'new_acct_competitors', 'ads_seen', 'yield_per_search', 'verdict'];
const syRows = Object.entries(yieldStats).map(([fam, y]) => {
  const ypc = y.searches ? +(y.new_competitors / y.searches).toFixed(2) : 0;
  const verdict = ypc >= 1.5 ? 'EXPAND' : ypc >= 0.6 ? 'KEEP' : 'REDUCE';
  return { query_family: fam, searches_run: y.searches, useful_results: y.useful_results || 0,
    new_competitors: y.new_competitors || 0, new_acct_competitors: y.new_acct_competitors || 0,
    ads_seen: y.ads_seen || 0, yield_per_search: ypc, verdict };
}).sort((a, b) => b.new_competitors - a.new_competitors);
fs.writeFileSync(path.join(OUT, 'SERP_COMPETITOR_SEARCH_YIELD.csv'), toCsv(syRows, syHeaders));

// ── Summary to stdout ─────────────────────────────────────────────────────────
const counts = (key, val) => campuses.filter((r) => campusSignal(r)[key] === val).length;
const summary = {
  campuses_processed: campuses.length,
  competitor_campus_rows: ciRows.length,
  unique_competitors: registry.size,
  study_edge_like: seRows.length,
  proven_HIGH: campuses.filter((r) => campusSignal(r).proven === 'HIGH').length,
  proven_MEDIUM: campuses.filter((r) => campusSignal(r).proven === 'MEDIUM').length,
  intro_STRONG: campuses.filter((r) => campusSignal(r).intro === 'STRONG').length,
  intro_MODERATE: campuses.filter((r) => campusSignal(r).intro === 'MODERATE').length,
  validated_paid_campuses: tvRows.length,
  campuses_with_ads: campuses.filter((r) => (r.ads || []).length > 0).length,
};
fs.writeFileSync(path.join(DATA, 'emit-summary.json'), JSON.stringify(summary, null, 2));
console.log('Emitted deliverables to competitive-intel-output/:');
console.log(JSON.stringify(summary, null, 2));
