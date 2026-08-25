// Emit a single self-contained SQL file: DDL (from the migration) + all data as INSERTs.
// Paste into the Supabase SQL editor to create tables AND load the scored data in one shot.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA = path.resolve('scripts/market-intel/data');
const OUT = path.resolve('market-intel-output');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const ddl = fs.readFileSync(path.resolve('migration/supabase-migrations/20260824_2000_campus_market_intelligence.sql'), 'utf8');
const res = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));
const R = res.records;
const prim = R.filter((r) => r.segment === 'primary');

// deterministic run id (stable across re-runs of the same generated_at)
const runId = crypto.createHash('sha1').update('market_intel_run_' + res.generated_at).digest('hex');
const RUN_UUID = `${runId.slice(0, 8)}-${runId.slice(8, 12)}-${runId.slice(12, 16)}-${runId.slice(16, 20)}-${runId.slice(20, 32)}`;

const q = (v) => {
  if (v == null) return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const jb = (v) => (v == null ? 'NULL' : `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`);
const arr = (a) => (a == null || !a.length ? 'NULL' : `ARRAY[${a.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`);

const L = [];
L.push('-- ============================================================');
L.push('-- Campus Market Intelligence — schema + data (self-contained).');
L.push(`-- Generated ${res.generated_at} · config ${res.config_version} · IPEDS ${res.latest_data_year} (2024 provisional).`);
L.push('-- Paste the WHOLE file into the Supabase SQL editor. Idempotent (re-runnable).');
L.push('-- ============================================================\n');
L.push('begin;\n');
L.push('-- ---- SCHEMA ----');
L.push(ddl.trim());
L.push('\n-- ---- DATA ----');
L.push(`-- purge prior rows for a clean idempotent reload of this run`);
L.push(`delete from public.campus_market_intelligence;`);
L.push(`delete from public.market_intel_identity_review;`);
L.push(`delete from public.market_intel_runs where id = '${RUN_UUID}';\n`);

// run row
L.push(`insert into public.market_intel_runs (id, config_version, generated_at, latest_data_year, intro1_multiplier, universe_matched, four_year_count, review_count, total_business_completions, estimated_intro1_annual, config_json, notes) values (`);
L.push(`  '${RUN_UUID}', ${q(res.config_version)}, ${q(res.generated_at)}, ${res.latest_data_year}, ${res.intro1_multiplier}, ${R.length}, ${prim.length}, ${matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW').length}, ${prim.reduce((s, r) => s + (r.business_bachelors || 0), 0)}, ${prim.reduce((s, r) => s + (r.estimated_intro1_annual || 0), 0)}, ${jb(CFG)}, 'Campus Market Intelligence V1 (IPEDS 2024).');\n`);

// campus rows
const cols = ['campus_id', 'run_id', 'config_version', 'generated_at', 'ipeds_unitid', 'ipeds_name', 'institution_level', 'segment', 'match_method', 'match_confidence', 'duplicate_unitid', 'latest_data_year', 'undergrad_enrollment', 'business_bachelors', 'accounting_bachelors', 'total_bachelors', 'business_share_of_bachelors', 'accounting_share_of_business', 'estimated_intro1_annual', 'intro1_estimate_method', 'intro1_estimate_confidence', 'business_growth_1y', 'business_growth_3y', 'business_growth_5y', 'business_5y_cagr', 'business_share_change_3y', 'business_share_change_5y', 'undergrad_growth_5y', 'accounting_growth_5y', 'growth_status', 'growth_label', 'meaningful_market', 'new_program', 'business_series', 'greek_chapters', 'greek_available', 'councils_present', 'council_contacts_councils', 'role_inbox_councils', 'council_available', 'has_women_in_business', 'has_finance_club', 'club_available', 'market_opportunity_score', 'market_data_completeness', 'growth_momentum_score', 'distribution_strength_score', 'distribution_data_completeness', 'course_readiness_status', 'course_readiness_score', 'live_demand_status', 'live_demand_score', 'first_party_signal_count', 'outreach_priority_score', 'outreach_priority_version', 'enrichment_priority_score', 'structural_completeness', 'action_suppressed', 'action_suppress_reason', 'current_action_priority', 'recommended_next_action', 'top_drivers', 'score_components'];
L.push(`insert into public.campus_market_intelligence (${cols.join(', ')}) values`);
const rows = R.map((r) => {
  const comps = { market_opportunity_parts: r.market_opportunity_parts, growth_momentum_parts: r.growth_momentum_parts, distribution_strength_parts: r.distribution_strength_parts, outreach_priority_parts: r.outreach_priority_parts };
  return '(' + [
    q(r.campus_id), `'${RUN_UUID}'`, q(res.config_version), q(res.generated_at), q(r.unitid), q(r.ipeds_name), q(r.institution_level), q(r.segment), q(r.match_method), q(r.match_confidence), q(!!r.duplicate_unitid),
    q(r.latest_data_year), q(r.undergrad_enrollment), q(r.business_bachelors), q(r.accounting_bachelors), q(r.total_bachelors), q(r.business_share_of_bachelors), q(r.accounting_share_of_business), q(r.estimated_intro1_annual), q('business_bachelors_x_multiplier'), q(CFG.intro1_estimate.confidence),
    q(r.business_growth_1y), q(r.business_growth_3y), q(r.business_growth_5y), q(r.business_5y_cagr), q(r.business_share_change_3y), q(r.business_share_change_5y), q(r.undergrad_growth_5y), q(r.accounting_growth_5y), q(r.growth_status), q(r.growth_label), q(!!r.meaningful_market), q(!!r.new_program), jb(r.business_series),
    q(r.greek_chapters), q(!!r.greek_available), arr(r.councils_present), q(r.council_contacts_councils), q(r.role_inbox_councils), q(!!r.council_available), q(!!r.has_women_in_business), q(!!r.has_finance_club), q(!!r.club_available),
    q(r.market_opportunity_score), q(r.market_data_completeness), q(r.growth_momentum_score), q(r.distribution_strength_score), q(r.distribution_data_completeness), q(r.course_readiness_status), q(r.course_readiness_score), q(r.live_demand_status), q(r.live_demand_score), q(r.first_party_signal_count),
    q(r.outreach_priority_score), q(r.outreach_priority_version), q(r.enrichment_priority_score), q(r.structural_completeness), q(!!r.action_suppressed), q(r.action_suppress_reason), q(r.current_action_priority), q(r.recommended_next_action), jb(r.top_drivers), jb(comps),
  ].join(', ') + ')';
});
L.push(rows.join(',\n') + ';\n');

// identity review rows
const rev = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW').map((m) => `(${q(m.campus_id)}, ${q(m.campus)}, ${q(m.state_abbr)}, ${q(m.city)}, 'NEEDS_IDENTITY_REVIEW', ${q(m.review_reason)}, ${q(m.review_suggestion)})`);
const seen = new Set();
for (const r of R) if (r.duplicate_unitid && !seen.has(r.campus_id)) { seen.add(r.campus_id); rev.push(`(${q(r.campus_id)}, ${q(r.campus)}, ${q(r.state)}, NULL, 'DUPLICATE_UNITID', ${q('shares_unitid_' + r.unitid)}, ${q(r.duplicate_group)})`); }
L.push(`insert into public.market_intel_identity_review (campus_id, campus_name, state, city, status, review_reason, best_ipeds_suggestion) values`);
L.push(rev.join(',\n') + '\non conflict (campus_id) do nothing;\n');

L.push('commit;');
L.push(`\n-- Loaded: ${R.length} campus rows, ${rev.length} identity-review rows. Dashboard view: campus_market_intelligence_card.`);

const outFile = path.join(OUT, 'campus_market_intelligence_load.sql');
fs.writeFileSync(outFile, L.join('\n'));
const kb = (fs.statSync(outFile).size / 1024).toFixed(0);
console.log(`Wrote ${outFile} (${kb} KB): ${R.length} campus rows + ${rev.length} review rows.`);
