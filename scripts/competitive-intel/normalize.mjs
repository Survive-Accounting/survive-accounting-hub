// Normalization + freeze pass (READ-ONLY over captured data; no SERP, no ads).
// Produces canonical per-campus aggregates + a deduped competitor registry +
// a STRICT faculty-ally scan, and freezes the nationwide dataset.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, toCsv, DATA } from './lib.mjs';

const OUT = path.resolve('competitive-intel-output');
const competitors = JSON.parse(fs.readFileSync(path.join(DATA, 'competitors.json'), 'utf8'));
const universe = JSON.parse(fs.readFileSync(path.join(DATA, 'universe.json'), 'utf8'));
const uById = new Map(universe.map((u) => [u.campus_id, u]));
const enrichment = JSON.parse(fs.readFileSync(path.join(DATA, 'enrichment.json'), 'utf8'));
const scrapeCache = JSON.parse(fs.readFileSync(path.join(DATA, 'scrape-cache.json'), 'utf8'));
const se = JSON.parse(fs.readFileSync(path.join(DATA, 'study-edge.json'), 'utf8'));

const campuses = Object.values(competitors).filter((r) => r.done);
const acctYes = (c) => c.intro_accounting_supported === 'YES' || c.intro_accounting_supported === 'LIKELY';
const acctExplicit = (c) => c.intro_accounting_supported === 'YES';
const LOCAL_STRONG = new Set(['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING']);
const CAMPUS_PLATFORM = new Set(['MULTI_CAMPUS_TUTORING', 'EXAM_PREP_PLATFORM']);
const LOCAL_ANY = new Set(['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING', 'MULTI_CAMPUS_TUTORING']);
const NATIONAL = new Set(['NOTES_MARKETPLACE', 'TUTOR_MARKETPLACE', 'NATIONAL_COURSEWARE']);
const NETWORK_RX = /^(ac|acc|acct|acg|acctg|busa?|bus|ba|econ|fin)\d{2,4}[a-z]*$/i;
const isNetworkDomain = (d) => NETWORK_RX.test((d || '').split('.')[0]);

// ── Deduped competitor registry (one row per domain across all campuses) ──────
const reg = new Map();
for (const r of campuses) {
  for (const c of r.competitors) {
    const g = reg.get(c.domain) ?? {
      domain: c.domain, brand: c.brand || null, types: {}, campuses: new Set(),
      acct: false, campusSpecific: false, courseSpecific: false, professor: false, sponsored: false,
      offerings: new Set(), topCampuses: [],
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
    g.topCampuses.push({ campus: r.campus, mo: r.market_opportunity ?? 0 });
    reg.set(c.domain, g);
  }
}
const priceCtxFor = (domain) => {
  const e = enrichment[domain];
  if (e?.price) return `${e.price}${e.pricing_model && e.pricing_model !== 'unknown' ? ' (' + e.pricing_model + ')' : ''}`;
  if (domain === 'studyedge.com') return '$50–90/mo subscription; 7-day free trial';
  if (isNetworkDomain(domain)) return 'freemium: first chapter free, paid tier gated';
  return '';
};
const registry = [...reg.values()].map((g) => {
  const type = Object.entries(g.types).sort((a, b) => b[1] - a[1])[0][0];
  const n = g.campuses.size;
  let strength = 'LOW';
  if (g.courseSpecific && (g.offerings.has('video_content') || g.offerings.has('practice_exams'))) strength = 'HIGH';
  else if (n >= 15 || (CAMPUS_PLATFORM.has(type) && n >= 3)) strength = 'HIGH';
  else if (n >= 4 || LOCAL_STRONG.has(type)) strength = 'MEDIUM';
  return {
    domain: g.domain, brand: g.brand || g.domain, competitor_type: type,
    campuses_served: n, accounting_supported: g.acct ? 'YES' : 'UNKNOWN',
    campus_specific: g.campusSpecific ? 'YES' : 'NO', course_specific_site: g.courseSpecific ? 'YES' : 'NO',
    course_code_network: isNetworkDomain(g.domain) ? 'YES' : 'NO',
    offerings: [...g.offerings], estimated_market_strength: strength,
    price_context: priceCtxFor(g.domain),
    top_campuses: [...g.topCampuses].sort((a, b) => b.mo - a.mo).slice(0, 6).map((x) => x.campus),
  };
}).sort((a, b) => b.campuses_served - a.campuses_served);

// ── Course-code network summary (step 3) ──────────────────────────────────────
const networkDomains = registry.filter((r) => r.course_code_network === 'YES');
const network = {
  confirmed_operator: 'Aaron Francis (CPA, ex-Ernst & Young) — verified via identical footer "© Aaron Francis 2015–2026" and operator bio on acct2301.com AND acc201uky.com',
  shared_infrastructure: 'Self-built site (creator states "I designed and coded this site, recorded all these videos"); video assets served from Amazon S3 bucket s3.amazonaws.com/acct-videos/ (shared across sites)',
  shared_template_evidence: 'Verbatim free-preview line across sites: "The first video of Chapter 1: The Accounting Equation is available for free preview" (Topic-1 variant on ACC 201 sites); identical structure (video lessons + practice problems + study guides; no live/1-on-1); identical <coursecode>.com naming',
  seo_content_model: 'One domain per course code (acct2301.com, acc201uky.com, acg2021fiu.com…), each exact-matching a school\'s intro course code for organic search. Freemium: first chapter/topic free, rest paid. Content = pre-recorded chapter videos (~13 chapters, ~90–100 videos, ~16 hrs) + practice problems + study guides, mapped to the specific course. Scales by cloning the template per new course code.',
  domains_detected: networkDomains.length,
  total_campus_appearances: networkDomains.reduce((s, r) => s + r.campuses_served, 0),
  domains: networkDomains.map((r) => ({ domain: r.domain, campuses_served: r.campuses_served, top_campuses: r.top_campuses.slice(0, 4) })),
};

// ── Canonical per-campus aggregates (step 4) ──────────────────────────────────
function priceContext(comps) {
  const ctx = [];
  if (comps.some((c) => isNetworkDomain(c.domain))) ctx.push('course-code video site: freemium (first chapter free)');
  if (comps.some((c) => c.domain === 'studyedge.com')) ctx.push('Study Edge: $50–90/mo, 7-day free trial');
  if (comps.some((c) => c.brand === 'Wize Prep')) ctx.push('Wize Prep: subscription (gated)');
  if (comps.some((c) => ['Wyzant', 'Varsity Tutors', 'Superprof', 'Preply', 'FrogTutoring', 'Knack', 'UniversityTutor'].includes(c.brand))) ctx.push('marketplace 1:1 ~$15–100/hr');
  if (comps.some((c) => c.competitor_type === 'NOTES_MARKETPLACE')) ctx.push('notes/Q&A marketplace ~$15–40/mo');
  // include any explicit enrichment price for a present competitor
  for (const c of comps) { const e = enrichment[c.domain]; if (e?.price) { ctx.push(`${c.brand || c.domain}: ${e.price}`); break; } }
  return ctx.slice(0, 4).join(' · ') || 'no public pricing observed';
}

const canonical = campuses.map((r) => {
  const u = uById.get(r.campus_id) || {};
  const comps = r.competitors;
  const distinct = new Set(comps.map((c) => c.domain)).size;
  const strongLocalYes = comps.filter((c) => LOCAL_STRONG.has(c.competitor_type) && acctExplicit(c));
  const strongLocal = comps.filter((c) => LOCAL_STRONG.has(c.competitor_type) && acctYes(c));
  const campusPlatform = comps.filter((c) => CAMPUS_PLATFORM.has(c.competitor_type) && c.campus_specific === 'YES' && acctYes(c));
  const acctComps = comps.filter(acctYes);
  const localAny = comps.filter((c) => LOCAL_ANY.has(c.competitor_type));
  const courseSpecific = comps.filter((c) => c.course_specific_site);
  const adsAny = (r.ads || []).length > 0;
  const acctAds = (r.ads || []).some((a) => (a.kind === 'candidate' || a.kind === 'brand') && /ad_probe|course_|tutoring|review|prep/.test(a.family));
  const mo = r.market_opportunity ?? u.market_opportunity ?? null;

  // paid academic market (any subject)
  let paid;
  if (strongLocal.length >= 1 || campusPlatform.length >= 1 || localAny.length >= 2) paid = 'STRONG';
  else if (localAny.length === 1 || adsAny) paid = 'MODERATE';
  else if (comps.length >= 1) paid = 'WEAK';
  else paid = 'UNKNOWN';
  // intro accounting paid market
  let intro;
  if (courseSpecific.length >= 1 || strongLocalYes.length >= 1 || campusPlatform.length >= 1) intro = 'STRONG';
  else if (acctComps.length >= 2) intro = 'MODERATE';
  else if (acctComps.length === 1) intro = 'WEAK';
  else intro = 'UNKNOWN';
  // competition intensity (segmentation/context — NOT a penalty)
  const intensity = distinct === 0 ? 'NONE' : distinct <= 2 ? 'LOW' : distinct <= 5 ? 'MEDIUM' : 'HIGH';
  // validation booleans
  const validated = courseSpecific.length >= 1 || strongLocal.length >= 1 || campusPlatform.length >= 1;
  const whiteSpace = !validated && (mo ?? 0) >= 55;
  // strongest competitor
  const rank = (c) => (c.course_specific_site ? 5 : 0) + (LOCAL_STRONG.has(c.competitor_type) ? 4 : 0)
    + (CAMPUS_PLATFORM.has(c.competitor_type) ? 3 : 0) + (c.campus_specific === 'YES' ? 2 : 0)
    + (acctExplicit(c) ? 1 : 0) + (c.sponsored ? 1 : 0);
  const sc = [...comps].sort((a, b) => rank(b) - rank(a))[0] || null;
  // brand-conquest / nonbrand candidates
  const conquest = comps.filter((c) => (LOCAL_STRONG.has(c.competitor_type) || CAMPUS_PLATFORM.has(c.competitor_type)) && c.brand && !/Survive/.test(c.brand));
  const evidence = r.searches >= 8 && comps.length > 0 ? 'high' : (r.searches >= 4 || courseSpecific.length) ? 'medium' : 'low';

  return {
    campus_id: r.campus_id, campus: r.campus, state: r.state, course_code: r.intro1_code || null,
    market_opportunity: mo, tier: r.tier,
    paid_market_status: paid,
    intro_accounting_paid_market_status: intro,
    competition_intensity: intensity,
    strongest_competitor: sc ? { name: sc.brand || sc.domain, domain: sc.domain, type: sc.competitor_type, course_specific: !!sc.course_specific_site } : null,
    competitor_price_context: priceContext(comps),
    validated_paid_market: validated,
    white_space: whiteSpace,
    brand_conquest_candidate: conquest.length > 0,
    nonbrand_search_candidate: r.intro1_code ? true : (u.name ? 'partial' : false),
    evidence_confidence: evidence,
    // supporting counts (context)
    paid_competitors: distinct,
    intro_accounting_competitors: acctComps.length,
    course_specific_competitors: courseSpecific.length,
    course_code_network_present: comps.some((c) => isNetworkDomain(c.domain)),
    university_free_support: !!r.university_free_support,
    ads_observed: adsAny,
    searches_run: r.searches,
    top_competitor_domains: [...new Set(comps.map((c) => c.domain))].slice(0, 8),
  };
}).sort((a, b) => (b.market_opportunity ?? -1) - (a.market_opportunity ?? -1));

// ── FACULTY ALLY scan (step 6 — STRICT; explicit support only, never inferred) ─
// Requires: a professor/instructor word + an approval/recommendation verb + an
// outside/supplemental-resource object, co-occurring in a captured public snippet
// or scraped page. A mere professor MENTION (e.g. Study Edge naming tutors) does NOT qualify.
// Professor must be the SUBJECT endorsing (not a brand token like "TutoringProf").
const PROF_SUBJECT = /\b(my|our|the|a|their|his|her|your)\s+(professor|instructor|prof|faculty|lecturer)\b|\b(professor|instructor|lecturer)\s+[A-Z][a-z]+\b/i;
const APPROVE = /\b(recommend(s|ed|ing)?|encourage(s|d)?|suggest(s|ed)?|endorse(s|d)?|allow(s|ed)?|permit(s|ted)?|approve(s|d)?|assign(s|ed)?|points? (us|students) to|told (us|students) to use|require(s|d)?)\b/i;
const RESOURCE = /\b(outside|supplemental|third[- ]party|extra|additional|tutoring|review (site|video|service)|study (site|service|resource)|these videos|online resource|study edge)\b/i;
// Brand/self-testimonial noise that fakes a "prof" match.
const BRAND_NOISE = /tutoringprof|prof™|professor™|ratemyprof|tutoring prof\b/i;
const facultyAllies = [];
const scanText = (text, source, campus) => {
  if (!text) return;
  for (const seg of String(text).split(/(?<=[.!?\n])/)) {
    if (seg.length < 20 || seg.length > 400) continue;
    if (BRAND_NOISE.test(seg)) continue;
    // professor must be the subject, an approval verb present, and an outside resource named
    if (PROF_SUBJECT.test(seg) && APPROVE.test(seg) && RESOURCE.test(seg)) {
      facultyAllies.push({ campus: campus || '', source, quote: seg.replace(/\s+/g, ' ').trim().slice(0, 300) });
    }
  }
};
for (const r of campuses) for (const c of r.competitors) { scanText(`${c.title_sample} ${c.snippet_sample}`, c.source_url, r.campus); }
for (const [, md] of Object.entries(scrapeCache)) if (typeof md === 'string') scanText(md, 'scraped-page', '');
// de-dupe identical quotes
const seenQ = new Set();
const facultyAlliesUniq = facultyAllies.filter((f) => { const k = f.quote.toLowerCase(); if (seenQ.has(k)) return false; seenQ.add(k); return true; });

// ── Freeze marker (step 7) ────────────────────────────────────────────────────
const freeze = {
  frozen: true,
  frozen_reason: 'Nationwide competitive dataset frozen after targeted completion + normalization pass.',
  campuses: canonical.length, unique_competitors: registry.length,
  competitor_campus_rows: campuses.reduce((s, r) => s + r.competitors.length, 0),
  course_code_network_domains: network.domains_detected,
  note: 'Re-open only for an explicit refresh; discovery caches remain reusable.',
};
fs.writeFileSync(path.join(DATA, 'FROZEN.json'), JSON.stringify(freeze, null, 2));

// ── Write outputs ─────────────────────────────────────────────────────────────
const aggregates = {
  generated_at: new Date().toISOString(), mode: 'read-only', dataset_status: 'FROZEN',
  interpretation: {
    paid_market_evidence: 'POSITIVE market validation (proven willingness to pay)',
    competition_intensity: 'SEGMENTATION / context only (never a penalty)',
    competitor_price: 'DISPLAY ONLY (partial/gated coverage)',
  },
  totals: {
    campuses: canonical.length, unique_competitors: registry.length,
    validated_paid_market: canonical.filter((c) => c.validated_paid_market).length,
    white_space: canonical.filter((c) => c.white_space === true).length,
    course_code_network: network,
  },
  competitor_registry: registry,
  campuses: canonical,
};
fs.writeFileSync(path.join(OUT, 'COMPETITIVE_CAMPUS_AGGREGATES.json'), JSON.stringify(aggregates, null, 2));

const faHeaders = ['campus', 'quote', 'source', 'criterion'];
fs.writeFileSync(path.join(OUT, 'FACULTY_ALLY_CANDIDATES.csv'), toCsv(
  facultyAlliesUniq.map((f) => ({ ...f, criterion: 'explicit professor support of outside/supplemental resource' })), faHeaders));

console.log(JSON.stringify({
  campuses: canonical.length, unique_competitors: registry.length,
  validated: aggregates.totals.validated_paid_market, white_space: aggregates.totals.white_space,
  network_domains: network.domains_detected, network_appearances: network.total_campus_appearances,
  faculty_ally_candidates: facultyAlliesUniq.length,
}, null, 2));
