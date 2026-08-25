// Campus Market Intelligence — compute pipeline.
// Reads matched campuses + parsed IPEDS + live Greek/council/club/demand data,
// computes raw metrics, growth, percentile-normalized scores, and explainable drivers.
// Writes data/results.json (idempotent full recompute).
import fs from 'node:fs';
import path from 'node:path';
import { selectAll } from './_db.mjs';
import { percentiler, growthRatio, cagr, shrink, weightedScore, round } from './lib.mjs';

const DATA = path.resolve('scripts/market-intel/data');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const ipeds = new Map(JSON.parse(fs.readFileSync(path.join(DATA, 'ipeds.json'), 'utf8')).map((r) => [String(r.unitid), r]));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));
const RUN_AT = process.env.RUN_AT || new Date().toISOString();
const RUN_MS = new Date(RUN_AT).getTime();
const YEARS = CFG.data_sources.years_available;
const LATEST = CFG.data_sources.latest_completions_year;

console.log('Loading live distribution/demand data...');
const [campusMeta, cgc, councilStatus, councilContacts, clubs, pubContacts, landing, orders, waitlist] = await Promise.all([
  selectAll('campuses', { select: 'id,name,state,outreach_status,ready_for_outreach,last_outreach_at,greek_eligibility,greek_pct_fraternity,greek_pct_sorority,undergrad_enrollment,is_sec,has_bap_chapter,parent_system_id' }),
  selectAll('campus_greek_chapters', { select: 'campus_id,status,council' }),
  selectAll('campus_council_status', { select: 'campus_id,council_type,status,contacts_found,role_inbox_found' }),
  selectAll('campus_council_contacts', { select: 'campus_id,council_type,is_current' }),
  selectAll('growth_business_clubs', { select: 'campus_id,category' }),
  selectAll('growth_public_contacts', { select: 'campus_id,category' }),
  selectAll('landing_page_events', { select: 'campus_id' }),
  selectAll('orders', { select: 'campus_id' }),
  selectAll('campus_waitlist', { select: 'campus_id' }),
]);
const metaById = new Map(campusMeta.map((c) => [c.id, c]));

// Greek chapter counts (non-archived) + council presence per campus
const greekCount = {}, councilsPresent = {};
for (const r of cgc) {
  if (r.status === 'archived') continue;
  greekCount[r.campus_id] = (greekCount[r.campus_id] || 0) + 1;
  const co = String(r.council || '').toLowerCase();
  if (['ifc', 'panhellenic', 'nphc', 'mgc'].includes(co)) (councilsPresent[r.campus_id] ||= new Set()).add(co);
}
// Council contact coverage: councils with contacts_found>0 / with role_inbox_found
const councilKnown = new Set(), councilsWithContacts = {}, councilsWithInbox = {};
for (const r of councilStatus) {
  councilKnown.add(r.campus_id);
  if (r.contacts_found > 0) (councilsWithContacts[r.campus_id] ||= new Set()).add(r.council_type);
  if (r.role_inbox_found) (councilsWithInbox[r.campus_id] ||= new Set()).add(r.council_type);
}
// Clubs
const clubKnown = new Set(), hasWIB = new Set(), hasFin = new Set();
for (const r of [...clubs, ...pubContacts]) {
  clubKnown.add(r.campus_id);
  if (r.category === 'women_in_business') hasWIB.add(r.campus_id);
  if (r.category === 'investment_finance') hasFin.add(r.campus_id);
}
// First-party demand (raw signal counts, transparency only)
const demand = {};
for (const t of [landing, orders, waitlist]) for (const r of t) if (r.campus_id) demand[r.campus_id] = (demand[r.campus_id] || 0) + 1;

// ---- Build per-campus records (matched universe) ----
const matched = matches.filter((m) => m.status === 'MATCHED' && m.unitid && ipeds.has(String(m.unitid)));
console.log(`Computing metrics for ${matched.length} matched campuses...`);

const MULT = CFG.intro1_estimate.multiplier;
const MINBASE = CFG.growth.min_base_business;

const recs = [];
for (const m of matched) {
  const ip = ipeds.get(String(m.unitid));
  const comp = ip.comp || {};
  const meta = metaById.get(m.campus_id) || {};
  const yr = (y) => comp[y] || null;

  // institution level from IPEDS sector (1-3 = 4yr, 4-6 = 2yr)
  const institutionLevel = [1, 2, 3].includes(ip.sector) ? 'four_year' : [4, 5, 6].includes(ip.sector) ? 'two_year' : 'other';

  // latest values — coerce absent bachelor's counts to 0 (a real "no bachelor's market",
  // e.g. community colleges) rather than null, so the 40%-weight business anchor pins them low.
  const latest = yr(LATEST) || yr(LATEST - 1) || null;
  const latestYear = comp[LATEST] ? LATEST : (comp[LATEST - 1] ? LATEST - 1 : null);
  const business = latest?.business ?? 0;
  const accounting = latest?.accounting ?? 0;
  const total = latest?.total ?? 0;
  const hasBachelors = total > 0;
  const businessShare = total > 0 ? round(business / total, 4) : null;
  const acctShareBiz = business > 0 ? round(accounting / business, 4) : null;
  const undergrad = ip.ug_fall_2023 || meta.undergrad_enrollment || null;
  const estIntro1 = Math.round(business * MULT);

  // business time series
  const bAt = (y) => comp[y]?.business ?? null;
  const shareAt = (y) => (comp[y]?.total > 0 ? comp[y].business / comp[y].total : null);
  const yearsWithData = YEARS.filter((y) => comp[y] && comp[y].total > 0);

  const g1 = growthRatio(bAt(LATEST), bAt(LATEST - 1));
  const g3 = growthRatio(bAt(LATEST), bAt(LATEST - 3));
  const g5 = growthRatio(bAt(LATEST), bAt(LATEST - 5));
  const cagr5 = cagr(bAt(LATEST), bAt(LATEST - 5), 5);
  const baseBiz5 = bAt(LATEST - 5);
  const baseBiz3 = bAt(LATEST - 3);
  // Hard minimum-denominator gate: a rate only counts if its baseline >= min_base_business.
  const gate = (rate, base) => (rate != null && base != null && base >= MINBASE ? rate : null);
  const g3g = gate(g3, baseBiz3);
  const g5g = gate(g5, baseBiz5);
  const cagr5g = gate(cagr5, baseBiz5);
  const acct5 = growthRatio(comp[LATEST]?.accounting, comp[LATEST - 5]?.accounting);
  const acct5g = gate(acct5, comp[LATEST - 5]?.accounting);
  // Share change + enrollment trend damped by small-market size factor.
  const sizeFactor = Math.min(1, business / MINBASE);
  const shareChg5raw = (shareAt(LATEST) != null && shareAt(LATEST - 5) != null) ? shareAt(LATEST) - shareAt(LATEST - 5) : null;
  const shareChg5 = shareChg5raw != null ? round(shareChg5raw, 4) : null;
  const shareChg5d = shareChg5raw != null ? shareChg5raw * sizeFactor : null;
  const shareChg3 = (shareAt(LATEST) != null && shareAt(LATEST - 3) != null) ? round(shareAt(LATEST) - shareAt(LATEST - 3), 4) : null;
  // enrollment 5y trend uses 12-month undergrad EFFY (LATEST-5 -> LATEST): 2019 -> 2024
  const ug12base = ip[`ug12_${LATEST - 5}`] ?? ip.ug12_2019 ?? ip.ug12_2018;
  const ug12latest = ip[`ug12_${LATEST}`] ?? ip.ug12_2024 ?? ip.ug12_2023;
  const ugTrend5 = growthRatio(ug12latest, ug12base);
  const ugTrend5d = ugTrend5 != null ? ugTrend5 * sizeFactor : null;

  const meaningfulMarket = business >= CFG.growth.meaningful_market_min_business;
  const newProgram = (baseBiz5 === 0 || baseBiz5 == null) && business > 0;
  const growthStatus = yearsWithData.length < CFG.growth.insufficient_if_years_lt || bAt(LATEST) == null
    ? 'INSUFFICIENT_DATA' : 'OK';

  // distribution availability + values
  const gc = greekCount[m.campus_id];
  const greekAvailable = gc != null || meta.greek_eligibility === 'no_social_greek';
  const greekChapters = gc != null ? gc : (meta.greek_eligibility === 'no_social_greek' ? 0 : null);
  const councilAvail = councilKnown.has(m.campus_id);
  const councilsContactN = councilsWithContacts[m.campus_id]?.size ?? (councilAvail ? 0 : null);
  const inboxN = councilsWithInbox[m.campus_id]?.size ?? (councilAvail ? 0 : null);
  const clubAvail = clubKnown.has(m.campus_id);

  recs.push({
    campus_id: m.campus_id, campus: m.campus, state: m.state_abbr, unitid: String(m.unitid),
    ipeds_name: m.ipeds_name, match_method: m.match_method, match_confidence: m.match_confidence,
    parent_system_id: meta.parent_system_id || null,
    institution_level: institutionLevel, segment: institutionLevel === 'four_year' ? 'primary' : institutionLevel === 'two_year' ? 'two_year' : 'other',
    has_bachelors_program: hasBachelors,
    // raw IPEDS
    latest_data_year: latestYear,
    business_bachelors: business, accounting_bachelors: accounting, total_bachelors: total,
    business_share_of_bachelors: businessShare, accounting_share_of_business: acctShareBiz,
    undergrad_enrollment: undergrad, undergrad_enrollment_year: ip.ug_fall_2023 ? (CFG.data_sources.enrollment_fall_year || 2023) : (meta.undergrad_enrollment ? 'campus_db' : null),
    estimated_intro1_annual: estIntro1,
    // growth raw
    business_growth_1y: round(g1, 4), business_growth_3y: round(g3, 4), business_growth_5y: round(g5, 4),
    business_5y_cagr: round(cagr5, 4), undergrad_growth_5y: round(ugTrend5, 4),
    business_share_change_3y: shareChg3, business_share_change_5y: shareChg5,
    accounting_growth_5y: round(acct5, 4),
    growth_status: growthStatus,
    meaningful_market: meaningfulMarket, new_program: newProgram,
    years_with_data: yearsWithData.length,
    business_series: Object.fromEntries(YEARS.map((y) => [y, comp[y]?.business ?? null])),
    _g: { g3g, g5g, cagr5g, acct5g, shareChg5d, ugTrend5d, baseBiz5, baseBiz3 },
    // distribution raw + availability
    greek_chapters: greekChapters, greek_available: greekAvailable,
    councils_present: [...(councilsPresent[m.campus_id] || [])].sort(),
    council_contacts_councils: councilsContactN, role_inbox_councils: inboxN, council_available: councilAvail,
    has_women_in_business: hasWIB.has(m.campus_id), has_finance_club: hasFin.has(m.campus_id), club_available: clubAvail,
    // demand + meta
    first_party_signal_count: demand[m.campus_id] || 0,
    outreach_status: meta.outreach_status || null, ready_for_outreach: meta.ready_for_outreach,
    last_outreach_at: meta.last_outreach_at || null, is_sec: meta.is_sec || false,
  });
}

// ---- Percentile populations (built over the 4-year PRIMARY segment; 2-year schools are
// scored against the same distribution and naturally land low on the bachelor's metrics) ----
const prim = recs.filter((r) => r.segment === 'primary');
const primOK = prim.filter((r) => r.growth_status === 'OK');
const P = {
  estIntro1: percentiler(prim.map((r) => r.estimated_intro1_annual)),
  undergrad: percentiler(prim.map((r) => r.undergrad_enrollment)),
  bizShare: percentiler(prim.map((r) => r.business_share_of_bachelors)),
  accounting: percentiler(prim.map((r) => r.accounting_bachelors)),
  greek: percentiler(prim.filter((r) => r.greek_available).map((r) => r.greek_chapters)),
  cagr5g: percentiler(primOK.map((r) => r._g.cagr5g)),
  g3g: percentiler(primOK.map((r) => r._g.g3g)),
  g5g: percentiler(primOK.map((r) => r._g.g5g)),
  shareChg5d: percentiler(primOK.map((r) => r._g.shareChg5d)),
  acct5g: percentiler(primOK.map((r) => r._g.acct5g)),
  ugTrend: percentiler(primOK.map((r) => r._g.ugTrend5d)),
};

const MO = CFG.market_opportunity_v1.components;
const GM = CFG.growth_momentum_v1.components;
const DS = CFG.distribution_strength_v1.components;
const OP = CFG.outreach_priority_v1.components;
const EPW = CFG.enrichment_priority_v1.structural_component_weights;
const labelPct = CFG.growth.momentum_label_percentiles;

for (const r of recs) {
  // Market Opportunity
  const mo = weightedScore([
    { key: 'business_opportunity', weight: MO.business_opportunity.weight, value: P.estIntro1(r.estimated_intro1_annual), available: r.estimated_intro1_annual != null },
    { key: 'undergrad_enrollment', weight: MO.undergrad_enrollment.weight, value: P.undergrad(r.undergrad_enrollment), available: r.undergrad_enrollment != null },
    { key: 'business_concentration', weight: MO.business_concentration.weight, value: P.bizShare(r.business_share_of_bachelors), available: r.business_share_of_bachelors != null },
    { key: 'greek_opportunity', weight: MO.greek_opportunity.weight, value: P.greek(r.greek_chapters), available: r.greek_available },
    { key: 'accounting_relevance', weight: MO.accounting_relevance.weight, value: P.accounting(r.accounting_bachelors), available: r.accounting_bachelors != null },
  ]);
  r.market_opportunity_score = mo.score;
  r.market_opportunity_parts = mo.parts;
  r.market_data_completeness = mo.completeness;

  // Growth Momentum
  if (r.growth_status === 'INSUFFICIENT_DATA') {
    r.growth_momentum_score = null; r.growth_label = 'INSUFFICIENT_DATA'; r.growth_momentum_parts = null;
  } else {
    const gm = weightedScore([
      { key: 'business_5y_cagr', weight: GM.business_5y_cagr.weight, value: P.cagr5g(r._g.cagr5g), available: r._g.cagr5g != null },
      { key: 'business_3y_growth', weight: GM.business_3y_growth.weight, value: P.g3g(r._g.g3g), available: r._g.g3g != null },
      { key: 'business_share_change', weight: GM.business_share_change.weight, value: P.shareChg5d(r._g.shareChg5d), available: r._g.shareChg5d != null },
      { key: 'undergrad_trend', weight: GM.undergrad_trend.weight, value: P.ugTrend(r._g.ugTrend5d), available: r._g.ugTrend5d != null },
      { key: 'accounting_trend', weight: GM.accounting_trend.weight, value: P.acct5g(r._g.acct5g), available: r._g.acct5g != null },
    ]);
    r.growth_momentum_score = gm.score;
    r.growth_momentum_parts = gm.parts;
  }
}
// momentum labels via percentile of the momentum score itself
const momP = percentiler(recs.filter((r) => r.growth_momentum_score != null).map((r) => r.growth_momentum_score));
for (const r of recs) {
  if (r.growth_label === 'INSUFFICIENT_DATA') continue;
  const p = momP(r.growth_momentum_score);
  if (p == null) { r.growth_label = 'INSUFFICIENT_DATA'; continue; }
  // RAPID_GROWTH reserved for meaningful, established markets (new 0-baseline programs have an
  // undefined headline rate, so they cap at GROWING and never headline the growth charts).
  r.growth_label = (p >= labelPct.RAPID_GROWTH && r.meaningful_market && !r.new_program) ? 'RAPID_GROWTH'
    : p >= labelPct.GROWING ? 'GROWING' : p >= labelPct.STABLE ? 'STABLE' : 'DECLINING';
}

// Distribution Strength (renormalized over available components)
for (const r of recs) {
  const ds = weightedScore([
    { key: 'greek_opportunity', weight: DS.greek_opportunity.weight, value: P.greek(r.greek_chapters), available: r.greek_available },
    { key: 'council_contact_coverage', weight: DS.council_contact_coverage.weight, value: r.council_available ? (r.council_contacts_councils / 4) * 100 : null, available: r.council_available },
    { key: 'role_inbox_coverage', weight: DS.role_inbox_coverage.weight, value: r.council_available ? (r.role_inbox_councils / 4) * 100 : null, available: r.council_available },
    { key: 'chapter_contact_coverage', weight: DS.chapter_contact_coverage.weight, value: null, available: false }, // NOT_RUN (no campus-scale data)
    { key: 'women_in_business', weight: DS.women_in_business.weight, value: r.has_women_in_business ? 100 : 0, available: r.club_available },
    { key: 'finance_club', weight: DS.finance_club.weight, value: r.has_finance_club ? 100 : 0, available: r.club_available },
  ]);
  r.distribution_strength_score = ds.score;
  r.distribution_strength_parts = ds.parts;
  r.distribution_data_completeness = ds.completeness;
}

// Live demand + course readiness placeholders
for (const r of recs) {
  r.live_demand_status = CFG.live_demand_v1.status;
  r.live_demand_score = null;
  r.course_readiness_status = CFG.course_readiness_v1.status;
  r.course_readiness_score = null;
}

// Outreach Priority (renormalized: live demand null -> excluded; course readiness zero weight)
for (const r of recs) {
  const op = weightedScore([
    { key: 'market_opportunity', weight: OP.market_opportunity.weight, value: r.market_opportunity_score, available: r.market_opportunity_score != null },
    { key: 'distribution_strength', weight: OP.distribution_strength.weight, value: r.distribution_strength_score, available: r.distribution_strength_score != null },
    { key: 'growth_momentum', weight: OP.growth_momentum.weight, value: r.growth_momentum_score, available: r.growth_momentum_score != null },
    { key: 'live_demand', weight: OP.live_demand.weight, value: r.live_demand_score, available: false },
  ]);
  r.outreach_priority_score = op.score;
  r.outreach_priority_parts = op.parts;
  r.outreach_priority_version = CFG.outreach_priority_v1.score_version;

  // Enrichment priority = market opportunity * (1 - structural completeness)
  const structDone =
    EPW.greek_chapters * (r.greek_available ? 1 : 0) +
    EPW.council_contacts * (r.council_available && r.council_contacts_councils > 0 ? 1 : 0) +
    EPW.role_inboxes * (r.council_available && r.role_inbox_councils > 0 ? 1 : 0) +
    EPW.business_clubs * (r.club_available ? 1 : 0);
  r.structural_completeness = +structDone.toFixed(3);
  r.enrichment_priority_score = r.market_opportunity_score != null ? round(r.market_opportunity_score * (1 - structDone), 1) : null;

  // Action guardrails (separate from market score)
  const g = CFG.action_guardrails_v1;
  // NOTE: ready_for_outreach=false means "not yet activated in the pipeline" (the normal state
  // for a scoring target), NOT opted-out — so it is deliberately NOT a suppression here.
  const recent = r.last_outreach_at && (RUN_MS - new Date(r.last_outreach_at).getTime()) / 86400000 < g.recent_outreach_days;
  const suppressed = r.outreach_status === 'opted_out' || r.outreach_status === 'unsubscribed' || recent;
  r.action_suppressed = !!suppressed;
  r.action_suppress_reason = (r.outreach_status === 'opted_out' || r.outreach_status === 'unsubscribed') ? r.outreach_status
    : recent ? 'recently_contacted' : null;
  r.current_action_priority = suppressed ? 0 : r.outreach_priority_score;
}

// ---- Drivers + recommended next action ----
const fmtPct = (x) => (x == null ? null : `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`);
for (const r of recs) {
  const d = [];
  if (r.business_bachelors > 0) d.push(`${r.business_bachelors.toLocaleString()} business grads/year (${r.latest_data_year})`);
  if (r.growth_status === 'OK' && r.business_growth_5y != null && r._g.baseBiz5 >= 15)
    d.push(`Business completions ${fmtPct(r.business_growth_5y)} over 5Y`);
  if (r.greek_available && r.greek_chapters > 0) d.push(`${r.greek_chapters} social Greek chapters`);
  if (r.council_available && r.council_contacts_councils > 0) d.push(`${r.councils_present.map((c) => c.toUpperCase()).join(' + ') || 'Council'} contacts verified`);
  if (r.undergrad_enrollment != null && P.undergrad(r.undergrad_enrollment) >= 75) d.push(`Large undergrad population (${r.undergrad_enrollment.toLocaleString()})`);
  if (r.accounting_bachelors != null && P.accounting(r.accounting_bachelors) >= 80) d.push(`${r.accounting_bachelors} accounting grads/year`);
  if (r.business_share_of_bachelors != null && P.bizShare(r.business_share_of_bachelors) >= 80) d.push(`Business-heavy (${Math.round(r.business_share_of_bachelors * 100)}% of bachelor's)`);
  if (r.is_sec) d.push('SEC school (priority Greek/football market)');
  r.top_drivers = d.slice(0, 5);

  r.recommended_next_action = r.action_suppressed ? `Hold (${r.action_suppress_reason})`
    : (r.council_available && r.council_contacts_councils > 0) ? 'Council outreach'
    : (r.greek_available && r.greek_chapters >= 20 && !r.council_available) ? 'Greek council enrichment'
    : (r.enrichment_priority_score != null && r.enrichment_priority_score >= 55) ? 'Enrich structural data'
    : (r.market_opportunity_score >= 60) ? 'Research + intro outreach'
    : 'Backlog';
}

// Flag duplicate campus records sharing one UNITID (pre-existing data-quality issue; not merged).
// Mark ONE record per group as duplicate_primary (the most complete/specific) so top lists and
// the brief can dedupe by UNITID without showing a school twice; the master CSV keeps every row.
const byUnit = {};
for (const r of recs) (byUnit[r.unitid] ||= []).push(r);
for (const list of Object.values(byUnit)) {
  if (list.length <= 1) { list[0].duplicate_primary = true; continue; }
  const best = [...list].sort((a, b) =>
    (b.greek_available - a.greek_available) ||
    ((b.structural_completeness || 0) - (a.structural_completeness || 0)) ||
    ((b.market_data_completeness || 0) - (a.market_data_completeness || 0)) ||
    ((b.campus || '').length - (a.campus || '').length))[0];
  for (const r of list) { r.duplicate_unitid = true; r.duplicate_group = list.map((x) => x.campus).join(' | '); r.duplicate_primary = r === best; }
}
const dupCount = recs.filter((r) => r.duplicate_unitid).length;
if (dupCount) console.log(`\n⚠ ${dupCount} campus records share a UNITID with another (duplicate DB rows, flagged not merged)`);

// strip internal
for (const r of recs) delete r._g;

const out = {
  generated_at: RUN_AT,
  config_version: CFG.config_version,
  latest_data_year: LATEST,
  intro1_multiplier: MULT,
  universe_matched: recs.length,
  records: recs.sort((a, b) => (b.outreach_priority_score || 0) - (a.outreach_priority_score || 0)),
};
fs.writeFileSync(path.join(DATA, 'results.json'), JSON.stringify(out));
console.log(`\nWrote ${recs.length} scored campuses to data/results.json`);
console.log('Top 12 by Outreach Priority:');
for (const r of out.records.slice(0, 12))
  console.log(`  ${String(r.outreach_priority_score).padStart(5)} | MO ${String(r.market_opportunity_score).padStart(4)} GM ${String(r.growth_momentum_score).padStart(4)} DS ${String(r.distribution_strength_score).padStart(4)} | ${r.campus} [${r.state}] — ${r.business_bachelors} biz, ${r.greek_chapters ?? '?'} greek`);
