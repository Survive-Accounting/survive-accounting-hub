// READ-ONLY morning audit. Aggregates already-generated data into
// MORNING_AUDIT_COMPETITIVE_INTELLIGENCE.json (+ digest to stdout). No SERP, no ads.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, DATA } from './lib.mjs';

const OUT = path.resolve('competitive-intel-output');
const rd = (f) => parseCsv(fs.readFileSync(path.join(OUT, f), 'utf8'));
const j = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

const summary = rd('CAMPUS_COMPETITIVE_SUMMARY.csv');
const seLike = rd('STUDY_EDGE_LIKE_COMPETITORS.csv');
const validated = rd('TOP_VALIDATED_PAID_CAMPUSES.csv');
const yieldRows = rd('SERP_COMPETITOR_SEARCH_YIELD.csv');
const ci = rd('COMPETITOR_INTELLIGENCE.csv');
const competitors = j(path.join(DATA, 'competitors.json'));
const enrichment = j(path.join(DATA, 'enrichment.json'));
const se = j(path.join(DATA, 'study-edge.json'));
const prog = j(path.join(DATA, 'discover-progress.json'));
const yieldStats = j(path.join(DATA, 'serp-yield.json'));

const num = (v) => (v === '' || v == null ? null : Number(v));
const countBy = (rows, k) => rows.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});

// ── Coverage ──────────────────────────────────────────────────────────────────
const nCampus = summary.length;
const coverage = {
  campuses_researched: nCampus,
  live_serp_searches_discovery: 3629, // from the main discovery run (prog.json since overwritten by cache-only reclassify passes)
  unique_successful_searches_cached: Object.keys(j(path.join(DATA, 'serp-cache.json'))).length,
  study_edge_live_searches: 14,
  est_discovery_cost_usd: 29.03,
  note_rate_limited: 'approx 500-1000 additional query attempts were rate-limited (empty) by the concurrently-running growth SERP job sharing the account; not counted as successful',
  competitor_campus_observations: ci.length,
  unique_competitors: new Set(ci.map((r) => r.domain)).size,
  campuses_with_paid_support_business: summary.filter((r) => num(r.paid_competitors_found) > 0).length,
  campuses_with_intro_accounting_competitor: summary.filter((r) => num(r.intro1_competitors_found) > 0).length,
  campuses_with_course_specific_site: summary.filter((r) => num(r.course_specific_competitors) > 0).length,
  campuses_with_sponsored_ads: summary.filter((r) => r.competitor_ads_observed === 'YES').length,
};

// ── Study-Edge-like ─────────────────────────────────────────────────────────────
const SE_MODELS = ['STUDY_EDGE_MODEL', 'COURSE_SPECIFIC_TUTORING_PLATFORM', 'MULTI_CAMPUS_REGIONAL'];
const trueSeLike = seLike.filter((r) => SE_MODELS.includes(r.model_type) || r.course_specific_site === 'YES');
const seModelCounts = countBy(trueSeLike, 'model_type');
// Enrich footprints from study-edge.json analogs (explicit campus lists).
const analogFootprint = {};
for (const a of (se._analogs || [])) analogFootprint[a.name] = a.campuses || [];
const topSeLike = trueSeLike
  .sort((a, b) => num(b.campuses_served) - num(a.campuses_served))
  .slice(0, 20)
  .map((r) => ({
    competitor: r.competitor, domain: r.domain, model_type: r.model_type,
    campus_footprint: num(r.campuses_served),
    footprint_examples: (analogFootprint[r.domain] || (r.top_campuses || '').split('; ')).slice(0, 6),
    accounting_supported: r.accounting_supported, course_specific: r.course_specific_site,
    video: r.video_reviews || 'NO', practice_exams: r.practice_exams || 'NO', exam_reviews: r.exam_reviews || 'NO', one_on_one: r.one_on_one || 'NO',
    pricing: enrichment[r.domain]?.price || '', pricing_model: enrichment[r.domain]?.pricing_model || '',
    strength: r.estimated_market_strength,
  }));

// ── Market validation ───────────────────────────────────────────────────────────
const validationDist = countBy(summary, 'market_validation');
const provenDist = countBy(summary, 'proven_paid_market');
const introDist = countBy(summary, 'intro_accounting_paid_market_status');
const top25Validated = validated.slice(0, 25).map((r) => ({
  rank: num(r.rank), campus: r.campus, state: r.state, course: r.course_code, market_opportunity: num(r.market_opportunity),
  validation_score: num(r.validation_score), proven: r.proven_paid_market, strongest: r.strongest_competitor, evidence: r.evidence,
}));
const top25WhiteSpace = summary.filter((r) => r.market_validation === 'WHITE_SPACE')
  .sort((a, b) => num(b.market_opportunity) - num(a.market_opportunity)).slice(0, 25)
  .map((r) => ({ campus: r.campus, state: r.state, course: r.course_code, market_opportunity: num(r.market_opportunity),
    intro_paid_status: r.intro_accounting_paid_market_status, national_competitors: num(r.paid_competitors_found) }));

// ── Pricing ─────────────────────────────────────────────────────────────────────
const priceBuckets = { monthly: [], per_exam: [], semester: [], hourly_or_1on1: [], one_time_or_other: [] };
const priceVal = (s) => { const m = s.match(/\$\s?(\d{1,4})/); return m ? Number(m[1]) : null; };
for (const e of Object.values(enrichment)) {
  if (!e.price) continue;
  for (const tok of e.price.split(';').map((x) => x.trim())) {
    const v = priceVal(tok); if (v == null || v > 500) continue; // drop outliers/page-noise
    if (/\/?\s?(mo|month|monthly)/i.test(tok)) priceBuckets.monthly.push(v);
    else if (/exam/i.test(tok)) priceBuckets.per_exam.push(v);
    else if (/semester|term/i.test(tok)) priceBuckets.semester.push(v);
    else if (/hr|hour|session|one-on-one|1-on-1/i.test(tok)) priceBuckets.hourly_or_1on1.push(v);
    else priceBuckets.one_time_or_other.push(v);
  }
}
const stat = (arr) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return { n: s.length, min: s[0], median: s[Math.floor(s.length / 2)], max: s[s.length - 1] }; };
const pricing = Object.fromEntries(Object.entries(priceBuckets).map(([k, v]) => [k, stat(v)]));
const seStudyEdgePrices = se.studyedge?.heuristic_prices || [];

// ── UF / Study Edge ─────────────────────────────────────────────────────────────
const uf = summary.find((r) => /^university of florida/i.test(r.campus)) || summary.find((r) => /florida/i.test(r.campus) && !/state|international|atlantic|gulf|south|central|north|west/i.test(r.campus));
const seFacts = se.studyedge?.facts?.[0] || {};
const ufAudit = {
  study_edge_offer: seFacts.one_line, accounting_courses: seFacts.accounting_courses, free_trial: seFacts.free_trial,
  offerings: seFacts.offerings, campus_specific_pages: seFacts.campus_specific_pages,
  professors_named_count: (seFacts.professors_named || []).length, prices_observed: seStudyEdgePrices,
  uf_market_opportunity: uf ? num(uf.market_opportunity) : null, uf_course: uf?.course_code,
  uf_paid_competitors: uf ? num(uf.paid_competitors_found) : null, uf_proven: uf?.proven_paid_market, uf_validation: uf?.market_validation,
};

// ── Paid search (ads) ───────────────────────────────────────────────────────────
const allAds = [];
for (const r of Object.values(competitors)) for (const a of (r.ads || [])) allAds.push({ ...a, campus: r.campus, course: r.intro1_code });
const adByFamilyType = { course_code: 0, generic_accounting: 0, brand: 0 };
const advertiserCounts = {};
for (const a of allAds) {
  advertiserCounts[a.advertiser] = (advertiserCounts[a.advertiser] || 0) + 1;
  if (/course_|ad_probe_course_tutoring/.test(a.family)) adByFamilyType.course_code++;
  else if (/ad_probe_course_acct/.test(a.family)) adByFamilyType.generic_accounting++;
  else adByFamilyType.generic_accounting++;
}
const topAdvertisers = Object.entries(advertiserCounts).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([a, n]) => ({ advertiser: a, ads: n }));

// ── Search yield ────────────────────────────────────────────────────────────────
const yieldSorted = yieldRows.map((r) => ({ family: r.query_family, searches: num(r.searches_run), new_competitors: num(r.new_competitors),
  new_acct: num(r.new_acct_competitors), ads: num(r.ads_seen), yield_per_search: num(r.yield_per_search), verdict: r.verdict }))
  .sort((a, b) => b.yield_per_search - a.yield_per_search);

// ── Future ad experiments (top 10) ───────────────────────────────────────────────
const experiments = [];
// Non-brand high-intent on top validated + strong markets with a course code
for (const r of validated.filter((x) => x.course_code).slice(0, 6)) {
  experiments.push({ type: 'NON_BRAND_HIGH_INTENT', campus: r.campus, course: r.course_code,
    keywords: [`${r.course_code} exam 1`, `${r.course_code} practice exam`, `${r.course_code} exam review`] });
}
// Brand-conquest: understand strongest branded competitors (research only)
const brandFocus = ['Study Edge', 'Wize Prep', 'Course Hero', 'FrogTutoring'];
experiments.push({ type: 'BRAND_CONQUEST_RESEARCH', note: 'Understand SERP structure/demand; do NOT use trademarks in ad copy', brands: brandFocus });
const audit = {
  generated_at: new Date().toISOString(), mode: 'read-only', coverage,
  study_edge_like: { model_counts: seModelCounts, total: trueSeLike.length, top_examples: topSeLike },
  market_validation: { distribution: validationDist, proven_distribution: provenDist, intro_distribution: introDist,
    top_25_validated: top25Validated, top_25_white_space: top25WhiteSpace },
  pricing: { competitor_buckets: pricing, study_edge_prices: seStudyEdgePrices,
    survive_intended: { model: 'chapter seat pack (group)', per_seat_usd: 100, best_value_per_seat_usd: 90, minimum_seats: 10,
      covers: 'full exam series (Exam 1/2/3/Final) for the term + free Exam-1/starter map', recurring: false } },
  uf_study_edge: ufAudit,
  paid_search: { total_ads_observed: allAds.length, campuses_with_ads: coverage.campuses_with_sponsored_ads,
    by_query_type: adByFamilyType, top_advertisers: topAdvertisers,
    sample: allAds.slice(0, 25).map((a) => ({ campus: a.campus, course: a.course, advertiser: a.advertiser, family: a.family, headline: a.headline })) },
  search_yield: { best: yieldSorted.slice(0, 4), worst: yieldSorted.slice(-3), all: yieldSorted },
  future_ad_experiments: experiments,
  readiness: 'YES',
};
fs.writeFileSync(path.join(OUT, 'MORNING_AUDIT_COMPETITIVE_INTELLIGENCE.json'), JSON.stringify(audit, null, 2));

// digest
console.log(JSON.stringify({ coverage, validationDist, provenDist, seModelCounts, pricing, seStudyEdgePrices, adByFamilyType, topAdvertisers: topAdvertisers.slice(0, 8), bestYield: yieldSorted.slice(0, 4).map((y) => y.family + ':' + y.yield_per_search), worstYield: yieldSorted.slice(-3).map((y) => y.family + ':' + y.yield_per_search) }, null, 2));
