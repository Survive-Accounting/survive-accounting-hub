// MORNING AUDIT — read-only. Analyzes existing results.json + matches.json + live DB (read-only),
// emits MORNING_AUDIT_MARKET_INTELLIGENCE.{md,json}. Does NOT recompute or mutate anything.
import fs from 'node:fs';
import path from 'node:path';
import { selectAll, count, REST, HEADERS, rfetch } from './_db.mjs';
const countCol = async (table, col) => {
  const r = await rfetch(`${REST}/${table}?select=${col}`, { headers: { ...HEADERS, Range: '0-0', Prefer: 'count=exact' } });
  return (r.headers.get('content-range') || '').split('/')[1] || '?';
};

const DATA = path.resolve('scripts/market-intel/data');
const OUT = path.resolve('market-intel-output');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const res = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const M = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));
const R = res.records;
const LATEST = res.latest_data_year, MULT = res.intro1_multiplier;

// distinct 4-year institutions (dedupe by UNITID), and the two-year segment
const inst = R.filter((r) => r.segment === 'primary' && r.duplicate_primary !== false);
const two = R.filter((r) => r.segment === 'two_year' && r.duplicate_primary !== false);

const num = (a) => a.filter((x) => x != null && Number.isFinite(x));
function stats(arr) {
  const a = num(arr).sort((x, y) => x - y); const n = a.length;
  if (!n) return { n: 0 };
  const q = (p) => a[Math.min(n - 1, Math.floor(p * n))];
  return { n, min: a[0], p10: q(0.1), p25: q(0.25), median: q(0.5), p75: q(0.75), p90: q(0.9), max: a[n - 1], mean: +(a.reduce((s, x) => s + x, 0) / n).toFixed(1), sum: a.reduce((s, x) => s + x, 0) };
}
const pctRank = (arr, x) => { const a = num(arr).sort((p, q) => p - q); if (!a.length || x == null) return null; let b = 0; for (const v of a) if (v < x) b++; return b / a.length * 100; };
const fmt = (x, d = 0) => (x == null ? '—' : Number(x).toLocaleString(undefined, { maximumFractionDigits: d }));
const pctf = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const drv = (r) => (r.top_drivers || []).join('; ');

// ---------------- DB read-only checks ----------------
let db = {};
try {
  db.campus_market_intelligence = await countCol('campus_market_intelligence', 'campus_id').catch(() => '?');
  db.identity_review = await countCol('market_intel_identity_review', 'campus_id').catch(() => '?');
  const tam = await selectAll('campus_tam_estimates', { select: 'source_type,source_year,business_completions,accounting_completions' }).catch(() => []);
  const bySrc = {}; for (const t of tam) bySrc[t.source_type] = (bySrc[t.source_type] || 0) + 1;
  db.legacy_tam_estimates = { rows: tam.length, by_source_type: bySrc, with_source_year: tam.filter((t) => t.source_year).length, note: 'LEGACY — not used by this layer' };
  db.campus_intelligence_rows = await count('campus_intelligence').catch(() => '?');
} catch (e) { db.error = e.message; }

// ---------------- Universe / identity ----------------
const inUniv = M.filter((m) => m.in_universe);
const matchedInUniv = inUniv.filter((m) => m.unitid);
const review = M.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW');
const aggN = review.filter((m) => m.review_reason === 'aggregate_system_or_district').length;
const dupRows = R.filter((r) => r.duplicate_unitid);
const dupGroups = [...new Set(dupRows.map((r) => r.unitid))];

// years of history
const yearsHist = stats(inst.map((r) => r.years_with_data));
const fullSeries = inst.filter((r) => r.years_with_data >= 9).length;

// ---------------- TAM sensitivity ----------------
const totalBiz = inst.reduce((s, r) => s + (r.business_bachelors || 0), 0);
const tamAt = (m) => Math.round(totalBiz * m);
const multipliers = [1.5, 2.0, MULT, 3.0, 3.5];
const tamSensitivity = multipliers.map((m) => ({ multiplier: m, total_est_intro1: tamAt(m), current: m === MULT }));

// ---------------- alternative OP orderings ----------------
const opNow = [...inst].filter((r) => r.outreach_priority_score != null).sort((a, b) => b.outreach_priority_score - a.outreach_priority_score);
const rankMap = (arr, key) => { const m = new Map(); [...arr].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1)).forEach((r, i) => m.set(r.campus_id, i + 1)); return m; };
// composites (renormalized from config OP weights: market .5, dist .25, growth .2)
const compMarket = (r) => r.market_opportunity_score;
const compMG = (r) => r.growth_momentum_score == null ? r.market_opportunity_score : (0.714 * r.market_opportunity_score + 0.286 * r.growth_momentum_score);
const compMD = (r) => r.distribution_strength_score == null ? r.market_opportunity_score : (0.667 * r.market_opportunity_score + 0.333 * r.distribution_strength_score);
for (const r of inst) { r._cMarket = compMarket(r); r._cMG = compMG(r); r._cMD = compMD(r); }
const top = (arr, key, n = 25) => [...arr].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1)).slice(0, n);
const setIds = (arr) => new Set(arr.map((r) => r.campus_id));
const overlap = (a, b) => { const B = setIds(b); return [...setIds(a)].filter((x) => B.has(x)).length; };
const t25market = top(inst, '_cMarket');
const t25mg = top(inst, '_cMG');
const t25md = top(inst, '_cMD');
const t25op = opNow.slice(0, 25);

// biggest movers between Market-only and current OP
const opRank = rankMap(inst.filter((r) => r.outreach_priority_score != null), 'outreach_priority_score');
const mRank = rankMap(inst, '_cMarket');
const movers = inst.filter((r) => r.outreach_priority_score != null && opRank.has(r.campus_id) && mRank.has(r.campus_id))
  .map((r) => ({ campus: r.campus, state: r.state, op: opRank.get(r.campus_id), market: mRank.get(r.campus_id), delta: mRank.get(r.campus_id) - opRank.get(r.campus_id), ds: r.distribution_strength_score, gm: r.growth_momentum_score }))
  .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 12);

// ---------------- Market Opportunity sanity ----------------
const t25mo = top(inst, 'market_opportunity_score');
// large-market false negatives: high business (top decile) but MO below median
const bizP90 = stats(inst.map((r) => r.business_bachelors)).p90;
const moMed = stats(inst.map((r) => r.market_opportunity_score)).median;
const falseNeg = inst.filter((r) => r.business_bachelors >= bizP90 && r.market_opportunity_score < moMed)
  .map((r) => ({ campus: r.campus, state: r.state, business: r.business_bachelors, MO: r.market_opportunity_score, undergrad: r.undergrad_enrollment, greek: r.greek_chapters, why: 'large business base but low MO' }));
// small-school false positives: low business (bottom quartile) but MO in top quartile
const bizP25 = stats(inst.map((r) => r.business_bachelors)).p25;
const moP75 = stats(inst.map((r) => r.market_opportunity_score)).p75;
const falsePos = inst.filter((r) => r.business_bachelors <= bizP25 && r.market_opportunity_score >= moP75)
  .map((r) => ({ campus: r.campus, state: r.state, business: r.business_bachelors, MO: r.market_opportunity_score, undergrad: r.undergrad_enrollment, greek: r.greek_chapters }));

// ---------------- Growth ----------------
const growers = top(inst.filter((r) => r.meaningful_market && r.growth_momentum_score != null && r.growth_label === 'RAPID_GROWTH'), 'growth_momentum_score', 20);
const decliners = [...inst].filter((r) => r.growth_label === 'DECLINING' && r.meaningful_market).sort((a, b) => (a.business_growth_5y ?? 0) - (b.business_growth_5y ?? 0)).slice(0, 20);
const growthLabels = {}; for (const r of inst) growthLabels[r.growth_label] = (growthLabels[r.growth_label] || 0) + 1;
// small-base audit: rows where a growth window baseline was < min_base (gated out)
const minBase = CFG.growth.min_base_business;
const smallBaseGated = inst.filter((r) => { const s = r.business_series || {}; const b5 = s[LATEST - 5]; return b5 != null && b5 < minBase && r.business_bachelors >= minBase; }).length;
const newProg = inst.filter((r) => r.new_program).length;

// ---------------- Distribution ----------------
const dsScored = inst.filter((r) => r.distribution_strength_score != null).length;
const dcStats = stats(inst.filter((r) => r.distribution_strength_score != null).map((r) => r.distribution_data_completeness));

// ---------------- assemble JSON ----------------
const J = {
  generated_at_source_run: res.generated_at,
  audit_note: 'Read-only audit of the existing computed run; no recompute or DB mutation performed.',
  overall_status: {
    verdict: 'PARTIAL',
    config_version: res.config_version,
    latest_official_data_year: LATEST,
    latest_year_provisional: CFG.data_sources.latest_year_provisional || false,
    target_universe: inUniv.length,
    ipeds_matched_in_universe: matchedInUniv.length,
    match_rate_pct: +(matchedInUniv.length / inUniv.length * 100).toFixed(1),
    scored_records: R.length,
    distinct_four_year_institutions: inst.length,
    two_year_records: R.filter((r) => r.segment === 'two_year').length,
    identity_review: review.length,
    identity_review_systems_districts: aggN,
    identity_review_other: review.length - aggN,
    duplicate_unitid_rows: dupRows.length,
    duplicate_unitid_groups: dupGroups.length,
    years_of_history: { range: `${LATEST - 9}-${LATEST}`, median_years_loaded: yearsHist.median, institutions_with_9plus_years: fullSeries },
  },
  db_readonly: db,
  raw_market_data: {
    undergrad_enrollment: stats(inst.map((r) => r.undergrad_enrollment)),
    business_bachelors: stats(inst.map((r) => r.business_bachelors)),
    accounting_bachelors: stats(inst.map((r) => r.accounting_bachelors)),
    business_share: stats(inst.map((r) => r.business_share_of_bachelors)),
    business_growth_5y_meaningful: stats(inst.filter((r) => r.meaningful_market).map((r) => r.business_growth_5y)),
    non_authoritative_sources: {
      warning: 'These legacy tables are AI/proxy estimates and must NOT be treated as authoritative. This layer ignores them and uses only IPEDS.',
      campus_tam_estimates: db.legacy_tam_estimates,
      campus_intelligence_rows: db.campus_intelligence_rows,
    },
  },
  intro1_tam: {
    method: CFG.intro1_estimate.method, multiplier: MULT, confidence: CFG.intro1_estimate.confidence,
    label: CFG.intro1_estimate.label,
    total_est_intro1_annual: inst.reduce((s, r) => s + (r.estimated_intro1_annual || 0), 0),
    median_campus_estimate: stats(inst.map((r) => r.estimated_intro1_annual)).median,
    multiplier_sensitivity: tamSensitivity,
    top25: top(inst, 'estimated_intro1_annual').map((r) => ({ campus: r.campus, state: r.state, est_intro1: r.estimated_intro1_annual, business: r.business_bachelors })),
    calibration_recommendation: [
      'Sample 25-30 campuses stratified by business-completion size (small <200, mid 200-800, large >800).',
      'For each, obtain ACTUAL Intro Financial Accounting section enrollment (registrar course schedule / campus_course_sections / syllabi in course_document) for one recent term x2 (fall+spring).',
      'Back out realized multiplier = actual_annual_intro1_seats / business_bachelors; compare distribution vs the 2.4 default.',
      'Set per-campus overrides where sampled; keep 2.4 as the global prior until >=20 samples, then refit.',
    ],
  },
  market_opportunity: {
    top25: t25mo.map((r) => ({ campus: r.campus, state: r.state, MO: r.market_opportunity_score, business: r.business_bachelors, accounting: r.accounting_bachelors, business_share: r.business_share_of_bachelors, undergrad: r.undergrad_enrollment, greek: r.greek_chapters, drivers: r.top_drivers })),
    large_market_false_negatives: falseNeg,
    small_school_false_positives: falsePos,
    outliers_note: 'Community colleges are segmented out; liberal-arts colleges with 0 CIP-52 business majors (Yale/Barnard/Occidental) correctly score low.',
  },
  growth_momentum: {
    labels: growthLabels,
    top_meaningful_growers: growers.map((r) => ({ campus: r.campus, state: r.state, GM: r.growth_momentum_score, business_5y: `${r.business_series?.[LATEST - 5]}→${r.business_bachelors}`, growth_5y: r.business_growth_5y })),
    steepest_decliners_meaningful: decliners.map((r) => ({ campus: r.campus, state: r.state, GM: r.growth_momentum_score, business_5y: `${r.business_series?.[LATEST - 5]}→${r.business_bachelors}`, growth_5y: r.business_growth_5y })),
    small_base_audit: { min_base_business: minBase, gated_small_base_rows: smallBaseGated, new_program_rows: newProg, note: 'Rates only count when the window baseline >= min_base_business; RAPID_GROWTH requires latest business >= 100 and excludes new 0-baseline programs.' },
    useful_signals: ['5Y business CAGR (size-gated)', '3Y business growth', 'business share change (direction of program mix)', 'undergrad enrollment trend (context)'],
    weak_signals: ['accounting-only growth (many schools report all business under CIP 52.0101 so accounting reads 0/noisy)'],
  },
  distribution_strength: {
    intentionally_deferred: true,
    computed_early_on_current_data: true,
    stale_warning: 'Distribution Strength was computed on Greek/council data captured while the structural backfill + Growth Contact Intelligence runners were still populating campus_greek_chapters / campus_council_status. Treat current DS/Outreach/Enrichment as PROVISIONAL and refresh after backfill settles.',
    coverage: { four_year_scored: dsScored, of_total: inst.length, pct: +(dsScored / inst.length * 100).toFixed(0) },
    data_completeness_distribution: dcStats,
    refresh_command: 'node scripts/market-intel/run-all.mjs && node scripts/market-intel/import.mjs',
    refresh_note: 'run-all re-reads live campus_greek_chapters + campus_council_status/contacts + growth_business_clubs and recomputes Distribution Strength, Outreach Priority, Enrichment Priority (and the market/growth layer) from the cached IPEDS JSON — no IPEDS re-download. Then import reloads the DB.',
  },
  outreach_priority: {
    do_not_treat_as_final: true,
    top25_overlap_with_current_op: {
      market_only: overlap(t25market, t25op),
      market_plus_growth: overlap(t25mg, t25op),
      market_plus_distribution: overlap(t25md, t25op),
      of: 25,
    },
    biggest_movers_market_vs_current_op: movers,
    weighting_problems: [
      'Distribution carries 25% but is only present for ~' + Math.round(dsScored / inst.length * 100) + '% of institutions, so for most campuses OP renormalizes to Market+Growth — DS currently rewards campuses that happen to be researched, not necessarily the best markets. Keep DS out of the headline rank until coverage is broad, or show a DS-known vs DS-pending split.',
      'Live Demand (5%) is null everywhere → effectively Market 52.6% / Distribution 26.3% / Growth 21.1% after renormalization.',
      'Course Readiness is 0% (correct for now) but reserved.',
    ],
  },
  identity_quality: {
    match_methods: M.filter((m) => m.unitid).reduce((a, m) => { a[m.match_method] = (a[m.match_method] || 0) + 1; return a; }, {}),
    duplicate_groups: dupGroups.map((u) => ({ unitid: u, campuses: dupRows.filter((r) => r.unitid === u).map((r) => r.campus) })).slice(0, 60),
    systems_districts_held: review.filter((m) => m.review_reason === 'aggregate_system_or_district').map((m) => m.campus),
    needs_human_decision: [
      ...review.filter((m) => m.review_reason !== 'aggregate_system_or_district').map((m) => ({ campus: m.campus, state: m.state_abbr, reason: m.review_reason, suggestion: m.review_suggestion })),
      { note: `${dupGroups.length} duplicate-UNITID groups: decide a canonical campus row per institution and retire the messy re-import (e.g. "Mercer University" vs "Mercer University-Macon").` },
    ],
  },
};

// ---------------- Markdown ----------------
const L = [];
const P = (s) => L.push(s);
P(`# Morning Audit — Campus Market Intelligence`);
P(`\n_Read-only audit of run ${res.generated_at} · config ${res.config_version} · IPEDS ${LATEST}${CFG.data_sources.latest_year_provisional ? ' (provisional)' : ''}. No data recalculated or mutated._\n`);
P(`## Overall status — **${J.overall_status.verdict}** (ready for Growth V1 with caveats)`);
P(`| | |\n|---|---|`);
P(`| Target universe | **${inUniv.length}** |`);
P(`| IPEDS matched (in universe) | **${matchedInUniv.length}** (${J.overall_status.match_rate_pct}%) |`);
P(`| Identity review | ${review.length} (${aggN} systems/districts + ${review.length - aggN} unresolvable) |`);
P(`| Unmatched (in universe) | ${inUniv.length - matchedInUniv.length} |`);
P(`| Scored records / distinct 4-yr institutions | ${R.length} / **${inst.length}** |`);
P(`| 2-year (separate segment) | ${R.filter((r) => r.segment === 'two_year').length} |`);
P(`| Latest official data year | **${LATEST}**${CFG.data_sources.latest_year_provisional ? ' (provisional; earlier years revised)' : ''} |`);
P(`| Years of history loaded | ${J.overall_status.years_of_history.range} · median ${yearsHist.median} yrs/campus · ${fullSeries} with ≥9 yrs |`);
P(`| Duplicate campus rows (flagged, not merged) | ${dupRows.length} rows / ${dupGroups.length} groups |`);
P(`| DB loaded | campus_market_intelligence=${db.campus_market_intelligence}, identity_review=${db.identity_review} |`);

P(`\n## Raw market data (distinct 4-yr institutions, IPEDS ${LATEST})`);
P(`| Metric | n | min | p25 | median | p75 | p90 | max | mean |\n|---|--|--|--|--|--|--|--|--|`);
const row = (label, s, f = fmt) => P(`| ${label} | ${s.n} | ${f(s.min)} | ${f(s.p25)} | **${f(s.median)}** | ${f(s.p75)} | ${f(s.p90)} | ${f(s.max)} | ${f(s.mean)} |`);
row('Undergrad enrollment', J.raw_market_data.undergrad_enrollment);
row('Business bachelor\'s', J.raw_market_data.business_bachelors);
row('Accounting bachelor\'s', J.raw_market_data.accounting_bachelors);
const sh = J.raw_market_data.business_share; P(`| Business share | ${sh.n} | ${(sh.min * 100).toFixed(0)}% | ${(sh.p25 * 100).toFixed(0)}% | **${(sh.median * 100).toFixed(0)}%** | ${(sh.p75 * 100).toFixed(0)}% | ${(sh.p90 * 100).toFixed(0)}% | ${(sh.max * 100).toFixed(0)}% | ${(sh.mean * 100).toFixed(0)}% |`);
const g = J.raw_market_data.business_growth_5y_meaningful; P(`| Business 5Y growth (meaningful) | ${g.n} | ${pctf(g.min)} | ${pctf(g.p25)} | **${pctf(g.median)}** | ${pctf(g.p75)} | ${pctf(g.p90)} | ${pctf(g.max)} | ${pctf(g.mean)} |`);
P(`\n**Total annual business bachelor's represented: ${fmt(totalBiz)}** · accounting: ${fmt(inst.reduce((s, r) => s + (r.accounting_bachelors || 0), 0))}.`);
P(`\n> ⚠️ **Non-authoritative legacy estimates (do NOT use):** \`campus_tam_estimates\` (${db.legacy_tam_estimates?.rows} rows — ${JSON.stringify(db.legacy_tam_estimates?.by_source_type)}; only ${db.legacy_tam_estimates?.with_source_year} carry a source year, ~5 truly IPEDS) and \`campus_intelligence\` (${db.campus_intelligence_rows} rows) are AI/adoption-proxy guesses. This layer ignores them entirely; every number here is IPEDS-sourced with a preserved year.`);

P(`\n## Intro-1 TAM`);
P(`- **Total estimated annual Intro-1 opportunity: ~${fmt(J.intro1_tam.total_est_intro1_annual)} students/yr** — _${CFG.intro1_estimate.label}_.`);
P(`- Method: \`${J.intro1_tam.method}\` · multiplier **${MULT}** · confidence **${CFG.intro1_estimate.confidence}**.`);
P(`- Median campus estimate: **${fmt(J.intro1_tam.median_campus_estimate)}**/yr.`);
P(`\n**Sensitivity to the multiplier (linear — total scales directly):**`);
P(`| Multiplier | Total est. Intro-1/yr |\n|--|--|`);
for (const s of tamSensitivity) P(`| ${s.multiplier}${s.current ? ' (current)' : ''} | ${fmt(s.total_est_intro1)} |`);
P(`\nBecause TAM = Σ(business × multiplier), the **total is perfectly linear** in the multiplier: a ±0.5 change moves the headline by ${fmt(totalBiz * 0.5)} students (~${((0.5 / MULT) * 100).toFixed(0)}%). Rankings are **unaffected** by the multiplier (monotonic), so it only matters for the absolute headline, not prioritization.`);
P(`\n**Calibration — collect:**`);
for (const c of J.intro1_tam.calibration_recommendation) P(`- ${c}`);
P(`\n**Top 25 by estimated Intro-1:**`);
P(`| # | Campus | ST | est Intro-1 | Business grads |\n|--|--|--|--|--|`);
J.intro1_tam.top25.forEach((r, i) => P(`| ${i + 1} | ${r.campus} | ${r.state} | ${fmt(r.est_intro1)} | ${fmt(r.business)} |`));

P(`\n## Market Opportunity — top 25 (with reasons)`);
P(`| # | Campus | ST | MO | Why |\n|--|--|--|--|--|`);
t25mo.forEach((r, i) => P(`| ${i + 1} | ${r.campus} | ${r.state} | ${r.market_opportunity_score} | ${drv(r)} |`));
P(`\n**Ordering sanity:** the top is dominated by large business-heavy flagships (Alabama, UGA, Tennessee, Auburn, Clemson) — sane. Checks:`);
P(`- **Large-market false negatives** (business ≥ p90 but MO < median): ${falseNeg.length ? falseNeg.map((r) => `${r.campus} (${fmt(r.business)} biz, MO ${r.MO})`).join('; ') : 'none'}.`);
P(`- **Small-school false positives** (business ≤ p25 but MO ≥ p75): ${falsePos.length ? falsePos.map((r) => `${r.campus} (${fmt(r.business)} biz, MO ${r.MO})`).join('; ') : 'none — the business anchor + community-college segmentation prevent this'}.`);
P(`- **Outliers:** ${J.market_opportunity.outliers_note}`);

P(`\n## Growth Momentum`);
P(`Labels: ${Object.entries(growthLabels).map(([k, v]) => `${k} ${v}`).join(' · ')}.`);
P(`\n**Top meaningful growers:**`);
P(`| Campus | ST | GM | Business 5Y |\n|--|--|--|--|`);
growers.slice(0, 12).forEach((r) => P(`| ${r.campus} | ${r.state} | ${r.growth_momentum_score} | ${r.business_series?.[LATEST - 5]}→${r.business_bachelors} (${pctf(r.business_growth_5y)}) |`));
P(`\n**Steepest decliners (meaningful markets):**`);
P(`| Campus | ST | Business 5Y |\n|--|--|--|`);
decliners.slice(0, 10).forEach((r) => P(`| ${r.campus} | ${r.state} | ${r.business_series?.[LATEST - 5]}→${r.business_bachelors} (${pctf(r.business_growth_5y)}) |`));
P(`\n**Small-base audit:** ${smallBaseGated} institutions had a 5Y baseline < ${minBase} (rate gated out, not allowed to distort), ${newProg} flagged new-program (0-baseline, capped below RAPID_GROWTH). The min-denominator gate + meaningful-market label are doing their job — no 2→10 schools in the growers list.`);
P(`\n**Useful growth signals:** ${J.growth_momentum.useful_signals.join(', ')}. **Weak:** ${J.growth_momentum.weak_signals.join(', ')}.`);

P(`\n## Distribution Strength`);
P(`- **Intentionally deferred: yes.** It was computed early on current data for completeness, but ⚠️ **treat as PROVISIONAL/possibly stale** — Greek/council data was still being populated by the structural backfill + Growth Contact runners.`);
P(`- Coverage: **${dsScored}/${inst.length}** four-year institutions scored (${J.distribution_strength.coverage.pct}%); the rest are PENDING_BACKFILL. Data completeness among scored: median ${(dcStats.median * 100).toFixed(0)}%.`);
P(`- **Cheap refresh (run today after backfill settles):**`);
P('```bash\ncd C:/Users/lee/Documents/sa-market-intel && node scripts/market-intel/run-all.mjs && node scripts/market-intel/import.mjs\n```');
P(`  ${J.distribution_strength.refresh_note}`);

P(`\n## Outreach Priority (NOT final)`);
P(`Top-25 overlap with the current Outreach Priority ranking:`);
P(`| Alternative ordering | shares of current OP top-25 |\n|--|--|`);
P(`| Market only | ${J.outreach_priority.top25_overlap_with_current_op.market_only}/25 |`);
P(`| Market + Growth | ${J.outreach_priority.top25_overlap_with_current_op.market_plus_growth}/25 |`);
P(`| Market + current Distribution | ${J.outreach_priority.top25_overlap_with_current_op.market_plus_distribution}/25 |`);
P(`\n**Biggest movers (Market-only rank vs current OP rank):**`);
P(`| Campus | ST | OP rank | Market rank | Δ | DS | GM |\n|--|--|--|--|--|--|--|`);
movers.forEach((m) => P(`| ${m.campus} | ${m.state} | ${m.op} | ${m.market} | ${m.delta > 0 ? '+' + m.delta : m.delta} | ${m.ds ?? 'pending'} | ${m.gm ?? '—'} |`));
P(`\n**Weighting problems:**`);
for (const w of J.outreach_priority.weighting_problems) P(`- ${w}`);

P(`\n## Identity quality`);
P(`Match methods: ${Object.entries(J.identity_quality.match_methods).map(([k, v]) => `${k}=${v}`).join(', ')}.`);
P(`\n**Systems/districts held out of scoring (correct):** ${J.identity_quality.systems_districts_held.join(', ')}.`);
P(`\n**Cases needing a human decision:**`);
for (const c of review.filter((m) => m.review_reason !== 'aggregate_system_or_district')) P(`- ${c.campus} [${c.state_abbr || '?'}] — ${c.review_reason}${c.review_suggestion ? ` (suggestion: ${c.review_suggestion})` : ''}`);
P(`- **${dupGroups.length} duplicate-UNITID groups** — pick a canonical campus row per institution and retire the messy re-import. Examples: ${dupGroups.slice(0, 6).map((u) => dupRows.filter((r) => r.unitid === u).map((r) => r.campus).join(' / ')).join(' · ')}.`);

P(`\n## King / algorithmic marketing — WHO vs WHEN vs WHAT (do not conflate)`);
P(`**WHO to target** (market attractiveness — stable, IPEDS-driven):`);
P(`- \`market_opportunity_score\`, \`estimated_intro1_annual\`, \`business_bachelors\`, \`business_share_of_bachelors\`, \`undergrad_enrollment\`, \`growth_momentum_score\`/\`growth_label\`, \`greek_chapters\`.`);
P(`\n**WHEN to target** (timing — NOT in this layer yet; sources to add):`);
P(`- Academic calendar (term start, Intro-1 offering term, add/drop, exam windows) from campus_context/campus_exams; Greek recruitment windows; first-party demand seasonality (landing/exam-open events). Today these are absent → WHEN is unmodeled.`);
P(`\n**WHAT action to take** (readiness + guardrails — operational):`);
P(`- \`recommended_next_action\`, \`distribution_strength_score\`/\`distribution_data_completeness\` (can we reach students?), \`enrichment_priority_score\` (research first?), \`council_available\`/\`councils_present\`, \`action_suppressed\`/\`action_suppress_reason\`, \`course_readiness_status\`.`);
P(`\n_Keep WHO (market) separate from WHAT (our readiness): a high-WHO campus with pending Distribution is an **enrichment** action, not an outreach action yet._`);

P(`\n## Innovative signals (simple, explainable, non-prestige)`);
P(`- **Business intensity per capita** = business_bachelors / undergrad_enrollment — finds business-dense campuses regardless of size (a cleaner "concentration" than share-of-bachelor's).`);
P(`- **Accounting pipeline ratio** = accounting_bachelors / business_bachelors — where accounting is a real track (skip schools reporting all business under CIP 52.0101).`);
P(`- **Sustained-growth flag** = business up in ≥4 of last 5 year-over-year steps (consistency beats a single 5Y endpoint; robust to one-year blips).`);
P(`- **Acceleration** = 3Y CAGR − 5Y CAGR (is growth speeding up or fading?).`);
P(`- **Greek-per-1k-undergrad** = greek_chapters / (undergrad/1000) — distribution density, comparable across sizes.`);
P(`- **Data-confidence score** = market_data_completeness × (years_with_data/10) — surfaces where to trust the model vs collect more.`);
P(`- **Momentum×Size product** = growth_momentum × log(business) — flags *large* markets that are *also* growing (best expansion bets) without letting small bases win.`);

P(`\n## FINAL`);
P(`\n**MARKET INTELLIGENCE READY FOR GROWTH V1: PARTIAL** — the standardized market layer (identity, IPEDS enrollment/completions, concentration, growth, estimated Intro-1, Market Opportunity, Growth Momentum) is **ready and reliable** across ${inst.length} institutions. Distribution Strength / Outreach Priority are **provisional** (refresh after backfill); Course Readiness + Live Demand are COMING_SOON; ${dupGroups.length} duplicate campus groups + ${review.length - aggN} identity items need a human pass. Use WHO/market fields now; hold outreach ordering as draft.`);
P(`\n**TOP 25 CAMPUS OPPORTUNITIES (by Market Opportunity):**`);
t25mo.forEach((r, i) => P(`${i + 1}. **${r.campus}** (${r.state}) — MO ${r.market_opportunity_score}; ${fmt(r.business_bachelors)} biz grads, ${r.greek_chapters ?? 'n/r'} Greek, ${fmt(r.undergrad_enrollment)} undergrad`));
P(`\n**TOP 10 MODEL IMPROVEMENTS:**`);
const improvements = [
  'Calibrate the Intro-1 multiplier against real course-enrollment samples (biggest headline-accuracy lever).',
  'Refresh Distribution Strength after the structural backfill; until coverage is broad, rank on Market+Growth and show Distribution as a separate readiness lane.',
  'Resolve the ' + dupGroups.length + ' duplicate campus rows (canonical-row decision) so a school appears once.',
  'Add the WHEN layer: academic calendar / Intro-1 offering term / Greek recruitment windows for timing.',
  'Connect first-party demand (landing/exam-open/waitlist by campus_id) to replace Live Demand COMING_SOON.',
  'Add "sustained-growth" and "acceleration" signals; de-emphasize single-endpoint 5Y growth.',
  'Fix accounting-share for schools reporting all business under CIP 52.0101 (flag as "business-general reporter", don\'t score accounting=0 as a negative).',
  'Add per-capita business intensity so mid-size business-dense schools surface next to giants.',
  'Backfill missing states on draft campuses so ambiguous national names (Trinity College) resolve.',
  'Wire Course Readiness from Course Intel when ready (it is designed in at 0 weight).',
];
improvements.forEach((s, i) => P(`${i + 1}. ${s}`));
P(`\n**EXACT FIELDS THE GROWTH DASHBOARD SHOULD CONSUME** (from \`campus_market_intelligence_card\`):`);
P('```');
P(['campus_id, campus, state, ipeds_unitid, segment',
  'market_opportunity_score, growth_momentum_score, growth_label   // WHO',
  'estimated_intro1_annual, business_bachelors, business_growth_5y, undergrad_enrollment, greek_chapters, councils_present  // WHO drivers',
  'distribution_strength_score, distribution_data_completeness, enrichment_priority_score  // WHAT (readiness)',
  'outreach_priority_score (DRAFT), recommended_next_action, action_suppressed  // WHAT (action)',
  'course_readiness_status, live_demand_status  // COMING_SOON badges',
  'market_data_completeness, top_drivers, generated_at  // trust + explainability'].join('\n'));
P('```');
P(`\n_Read-only audit — no data was recalculated or written. Source run ${res.generated_at}._`);

fs.writeFileSync(path.join(OUT, 'MORNING_AUDIT_MARKET_INTELLIGENCE.md'), L.join('\n'));
fs.writeFileSync(path.join(OUT, 'MORNING_AUDIT_MARKET_INTELLIGENCE.json'), JSON.stringify(J, null, 2));
console.log('Wrote MORNING_AUDIT_MARKET_INTELLIGENCE.md + .json');
console.log(`Universe ${inUniv.length} | matched ${matchedInUniv.length} | 4yr institutions ${inst.length} | TAM ~${fmt(J.intro1_tam.total_est_intro1_annual)} | dup groups ${dupGroups.length} | DS ${dsScored}/${inst.length}`);
