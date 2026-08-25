// Load data/results.json into the DB tables (run AFTER the migration is applied).
// Idempotent: creates a run row, upserts campus_market_intelligence + identity review.
import fs from 'node:fs';
import path from 'node:path';
import { insertOne, upsert, REST, HEADERS, rfetch } from './_db.mjs';

const DATA = path.resolve('scripts/market-intel/data');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const res = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));
const R = res.records;
const prim = R.filter((r) => r.segment === 'primary');

// Idempotent reload: purge prior rows so re-running doesn't accumulate stale runs.
async function purge(table, filter) {
  const res = await rfetch(`${REST}/${table}?${filter}`, { method: 'DELETE', headers: { ...HEADERS, Prefer: 'return=minimal' } });
  return res.ok || res.status === 404;
}
{
  const probe = await rfetch(`${REST}/campus_market_intelligence?select=campus_id&limit=1`, { headers: HEADERS });
  if (probe.ok) {
    await purge('campus_market_intelligence', 'campus_id=not.is.null');
    await purge('market_intel_identity_review', 'campus_id=not.is.null');
    await purge('market_intel_runs', 'id=not.is.null');
    console.log('Purged prior market-intel rows.');
  }
}

const run = await insertOne('market_intel_runs', {
  config_version: res.config_version,
  generated_at: res.generated_at,
  latest_data_year: res.latest_data_year,
  intro1_multiplier: res.intro1_multiplier,
  universe_matched: R.length,
  four_year_count: prim.length,
  review_count: matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW').length,
  total_business_completions: prim.reduce((s, r) => s + (r.business_bachelors || 0), 0),
  estimated_intro1_annual: prim.reduce((s, r) => s + (r.estimated_intro1_annual || 0), 0),
  config_json: CFG,
  notes: 'Overnight Campus Market Intelligence V1 (IPEDS-based).',
});
if (!run.ok) {
  console.error(`\nCould not create run row (status ${run.status}).`);
  if (String(run.error).includes('PGRST205') || run.status === 404)
    console.error('→ Tables do not exist yet. Apply migration/supabase-migrations/20260824_2000_campus_market_intelligence.sql first (Management API PAT or dashboard SQL editor), then re-run this import.');
  else console.error(run.error);
  process.exitCode = 1;
}
const runId = run.ok ? run.row.id : null;
if (runId) {
console.log('Created run', runId);

const cmiRows = R.map((r) => ({
  campus_id: r.campus_id, run_id: runId, config_version: res.config_version, generated_at: res.generated_at,
  ipeds_unitid: r.unitid, ipeds_name: r.ipeds_name, institution_level: r.institution_level, segment: r.segment,
  match_method: r.match_method, match_confidence: r.match_confidence, duplicate_unitid: !!r.duplicate_unitid,
  latest_data_year: r.latest_data_year, undergrad_enrollment: r.undergrad_enrollment,
  business_bachelors: r.business_bachelors, accounting_bachelors: r.accounting_bachelors, total_bachelors: r.total_bachelors,
  business_share_of_bachelors: r.business_share_of_bachelors, accounting_share_of_business: r.accounting_share_of_business,
  estimated_intro1_annual: r.estimated_intro1_annual, intro1_estimate_method: 'business_bachelors_x_multiplier',
  intro1_estimate_confidence: CFG.intro1_estimate.confidence,
  business_growth_1y: r.business_growth_1y, business_growth_3y: r.business_growth_3y, business_growth_5y: r.business_growth_5y,
  business_5y_cagr: r.business_5y_cagr, business_share_change_3y: r.business_share_change_3y, business_share_change_5y: r.business_share_change_5y,
  undergrad_growth_5y: r.undergrad_growth_5y, accounting_growth_5y: r.accounting_growth_5y,
  growth_status: r.growth_status, growth_label: r.growth_label, meaningful_market: r.meaningful_market, new_program: r.new_program,
  business_series: r.business_series,
  greek_chapters: r.greek_chapters, greek_available: r.greek_available, councils_present: r.councils_present,
  council_contacts_councils: r.council_contacts_councils, role_inbox_councils: r.role_inbox_councils, council_available: r.council_available,
  has_women_in_business: r.has_women_in_business, has_finance_club: r.has_finance_club, club_available: r.club_available,
  market_opportunity_score: r.market_opportunity_score, market_data_completeness: r.market_data_completeness,
  growth_momentum_score: r.growth_momentum_score,
  distribution_strength_score: r.distribution_strength_score, distribution_data_completeness: r.distribution_data_completeness,
  course_readiness_status: r.course_readiness_status, course_readiness_score: r.course_readiness_score,
  live_demand_status: r.live_demand_status, live_demand_score: r.live_demand_score, first_party_signal_count: r.first_party_signal_count,
  outreach_priority_score: r.outreach_priority_score, outreach_priority_version: r.outreach_priority_version,
  enrichment_priority_score: r.enrichment_priority_score, structural_completeness: r.structural_completeness,
  action_suppressed: r.action_suppressed, action_suppress_reason: r.action_suppress_reason,
  current_action_priority: r.current_action_priority, recommended_next_action: r.recommended_next_action,
  top_drivers: r.top_drivers,
  score_components: { market_opportunity_parts: r.market_opportunity_parts, growth_momentum_parts: r.growth_momentum_parts, distribution_strength_parts: r.distribution_strength_parts, outreach_priority_parts: r.outreach_priority_parts },
  raw_json: r, updated_at: res.generated_at,
}));

const u1 = await upsert('campus_market_intelligence', cmiRows, { onConflict: 'campus_id' });
console.log(u1.ok ? `Upserted ${cmiRows.length} campus rows` : `FAILED campus rows: ${u1.status} ${u1.error?.slice(0, 200)}`);

const reviewRows = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW').map((m) => ({
  campus_id: m.campus_id, campus_name: m.campus, state: m.state_abbr, city: m.city,
  status: 'NEEDS_IDENTITY_REVIEW', review_reason: m.review_reason, best_ipeds_suggestion: m.review_suggestion, updated_at: res.generated_at,
}));
const seen = new Set();
for (const r of R) if (r.duplicate_unitid && !seen.has(r.campus_id)) { seen.add(r.campus_id); reviewRows.push({ campus_id: r.campus_id, campus_name: r.campus, state: r.state, city: null, status: 'DUPLICATE_UNITID', review_reason: 'shares_unitid_' + r.unitid, best_ipeds_suggestion: r.duplicate_group, updated_at: res.generated_at }); }
const u2 = await upsert('market_intel_identity_review', reviewRows, { onConflict: 'campus_id' });
console.log(u2.ok ? `Upserted ${reviewRows.length} identity-review rows` : `FAILED review rows: ${u2.status} ${u2.error?.slice(0, 200)}`);
console.log('\nImport complete.');
}
