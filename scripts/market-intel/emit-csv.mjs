// Emit deliverable CSVs from data/results.json + data/matches.json.
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('scripts/market-intel/data');
const OUT = path.resolve('market-intel-output');
fs.mkdirSync(OUT, { recursive: true });
const { records: R, generated_at, latest_data_year, intro1_multiplier } = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));

const csvCell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.join('; ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (file, cols, rows) => {
  const lines = [cols.map((c) => c.h).join(',')];
  for (const r of rows) lines.push(cols.map((c) => csvCell(typeof c.f === 'function' ? c.f(r) : r[c.f])).join(','));
  fs.writeFileSync(path.join(OUT, file), lines.join('\n'));
  console.log(`  ${file}: ${rows.length} rows`);
};

const pct = (x) => (x == null ? '' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const councils = (r) => (r.councils_present || []).map((c) => c.toUpperCase()).join('+');

// ---- Master file ----
const master = [
  { h: 'campus_id', f: 'campus_id' }, { h: 'campus', f: 'campus' }, { h: 'state', f: 'state' },
  { h: 'IPEDS_UNITID', f: 'unitid' }, { h: 'ipeds_name', f: 'ipeds_name' },
  { h: 'institution_level', f: 'institution_level' }, { h: 'segment', f: 'segment' },
  { h: 'match_method', f: 'match_method' }, { h: 'match_confidence', f: 'match_confidence' },
  { h: 'duplicate_unitid', f: (r) => (r.duplicate_unitid ? 'YES' : '') },
  { h: 'undergrad_enrollment', f: 'undergrad_enrollment' }, { h: 'latest_data_year', f: 'latest_data_year' },
  { h: 'business_bachelors', f: 'business_bachelors' }, { h: 'accounting_bachelors', f: 'accounting_bachelors' },
  { h: 'total_bachelors', f: 'total_bachelors' },
  { h: 'business_share', f: (r) => (r.business_share_of_bachelors == null ? '' : (r.business_share_of_bachelors * 100).toFixed(1) + '%') },
  { h: 'accounting_share_of_business', f: (r) => (r.accounting_share_of_business == null ? '' : (r.accounting_share_of_business * 100).toFixed(1) + '%') },
  { h: 'business_growth_1y', f: (r) => pct(r.business_growth_1y) }, { h: 'business_growth_3y', f: (r) => pct(r.business_growth_3y) },
  { h: 'business_growth_5y', f: (r) => pct(r.business_growth_5y) }, { h: 'business_5y_cagr', f: (r) => pct(r.business_5y_cagr) },
  { h: 'undergrad_growth_5y', f: (r) => pct(r.undergrad_growth_5y) },
  { h: 'business_share_change_5y', f: (r) => (r.business_share_change_5y == null ? '' : (r.business_share_change_5y * 100).toFixed(1) + 'pp') },
  { h: 'estimated_intro1_annual', f: 'estimated_intro1_annual' },
  { h: 'intro1_estimate_method', f: () => `business_bachelors x${intro1_multiplier} (ESTIMATED, NOT ACTUAL)` },
  { h: 'greek_chapters', f: (r) => (r.greek_chapters == null ? 'NOT_RUN' : r.greek_chapters) },
  { h: 'councils_present', f: councils },
  { h: 'council_contacts', f: (r) => (r.council_available ? r.council_contacts_councils : 'NOT_RUN') },
  { h: 'role_inboxes', f: (r) => (r.council_available ? r.role_inbox_councils : 'NOT_RUN') },
  { h: 'market_opportunity_score', f: 'market_opportunity_score' },
  { h: 'growth_momentum_score', f: 'growth_momentum_score' }, { h: 'growth_label', f: 'growth_label' },
  { h: 'distribution_strength_score', f: (r) => (r.distribution_strength_score == null ? 'PENDING_BACKFILL' : r.distribution_strength_score) },
  { h: 'distribution_data_completeness', f: (r) => (r.distribution_strength_score == null ? '' : (r.distribution_data_completeness * 100).toFixed(0) + '%') },
  { h: 'course_readiness_status', f: 'course_readiness_status' }, { h: 'course_readiness_score', f: 'course_readiness_score' },
  { h: 'live_demand_status', f: 'live_demand_status' }, { h: 'live_demand_score', f: 'live_demand_score' },
  { h: 'first_party_signal_count', f: 'first_party_signal_count' },
  { h: 'outreach_priority_score', f: 'outreach_priority_score' },
  { h: 'enrichment_priority_score', f: 'enrichment_priority_score' },
  { h: 'market_data_completeness', f: (r) => (r.market_data_completeness * 100).toFixed(0) + '%' },
  { h: 'action_suppressed', f: (r) => (r.action_suppressed ? r.action_suppress_reason : '') },
  { h: 'top_driver_1', f: (r) => r.top_drivers[0] || '' }, { h: 'top_driver_2', f: (r) => r.top_drivers[1] || '' },
  { h: 'top_driver_3', f: (r) => r.top_drivers[2] || '' }, { h: 'top_driver_4', f: (r) => r.top_drivers[3] || '' },
  { h: 'top_driver_5', f: (r) => r.top_drivers[4] || '' },
  { h: 'recommended_next_action', f: 'recommended_next_action' },
];
console.log(`Emitting CSVs to market-intel-output/ (generated ${generated_at}, IPEDS ${latest_data_year})`);
writeCsv('CAMPUS_MARKET_INTELLIGENCE.csv', master, R);

// ---- Top lists (4-year primary segment) ----
const prim = R.filter((r) => r.segment === 'primary');
const topCols = [
  { h: 'rank', f: (r) => r._rank }, { h: 'campus', f: 'campus' }, { h: 'state', f: 'state' }, { h: 'IPEDS_UNITID', f: 'unitid' },
  { h: 'outreach_priority', f: 'outreach_priority_score' }, { h: 'market_opportunity', f: 'market_opportunity_score' },
  { h: 'growth_momentum', f: 'growth_momentum_score' }, { h: 'growth_label', f: 'growth_label' },
  { h: 'distribution_strength', f: (r) => (r.distribution_strength_score == null ? 'PENDING' : r.distribution_strength_score) },
  { h: 'business_bachelors', f: 'business_bachelors' }, { h: 'business_growth_5y', f: (r) => pct(r.business_growth_5y) },
  { h: 'accounting_bachelors', f: 'accounting_bachelors' }, { h: 'undergrad_enrollment', f: 'undergrad_enrollment' },
  { h: 'greek_chapters', f: (r) => (r.greek_chapters == null ? 'NOT_RUN' : r.greek_chapters) }, { h: 'councils', f: councils },
  { h: 'estimated_intro1_annual', f: 'estimated_intro1_annual' },
  { h: 'why', f: (r) => r.top_drivers.join(' • ') }, { h: 'next_action', f: 'recommended_next_action' },
];
const rank = (arr) => arr.map((r, i) => ({ ...r, _rank: i + 1 }));

writeCsv('TOP_100_OUTREACH_CAMPUSES.csv', topCols,
  rank([...prim].filter((r) => r.outreach_priority_score != null).sort((a, b) => b.outreach_priority_score - a.outreach_priority_score).slice(0, 100)));

writeCsv('TOP_100_MARKET_OPPORTUNITY.csv', topCols,
  rank([...prim].sort((a, b) => b.market_opportunity_score - a.market_opportunity_score).slice(0, 100)));

// Growth: meaningful markets only, non-null momentum
writeCsv('TOP_100_GROWTH_CAMPUSES.csv', topCols,
  rank([...prim].filter((r) => r.meaningful_market && r.growth_momentum_score != null)
    .sort((a, b) => b.growth_momentum_score - a.growth_momentum_score).slice(0, 100)));

// Enrichment gaps: high market opportunity, incomplete structural data
const enrichCols = [
  { h: 'rank', f: (r) => r._rank }, { h: 'campus', f: 'campus' }, { h: 'state', f: 'state' }, { h: 'IPEDS_UNITID', f: 'unitid' },
  { h: 'enrichment_priority', f: 'enrichment_priority_score' }, { h: 'market_opportunity', f: 'market_opportunity_score' },
  { h: 'structural_completeness', f: (r) => (r.structural_completeness * 100).toFixed(0) + '%' },
  { h: 'business_bachelors', f: 'business_bachelors' },
  { h: 'greek_status', f: (r) => (r.greek_available ? `${r.greek_chapters} chapters` : 'NOT_RUN') },
  { h: 'council_status', f: (r) => (r.council_available ? `${r.council_contacts_councils}/4 councils w/ contacts` : 'NOT_RUN') },
  { h: 'clubs_status', f: (r) => (r.club_available ? 'known' : 'NOT_RUN') },
  { h: 'missing', f: (r) => [!r.greek_available && 'greek', !(r.council_available && r.council_contacts_councils) && 'council_contacts', !(r.council_available && r.role_inbox_councils) && 'role_inboxes', !r.club_available && 'business_clubs'].filter(Boolean).join(', ') },
  { h: 'next_action', f: 'recommended_next_action' },
];
writeCsv('TOP_ENRICHMENT_GAPS.csv', enrichCols,
  rank([...prim].filter((r) => r.enrichment_priority_score != null && r.market_opportunity_score >= 55 && r.structural_completeness < 1)
    .sort((a, b) => b.enrichment_priority_score - a.enrichment_priority_score).slice(0, 100)));

// ---- Identity review queue ----
const reviewCols = [
  { h: 'campus_id', f: 'campus_id' }, { h: 'campus', f: 'campus' }, { h: 'state', f: 'state_abbr' }, { h: 'city', f: 'city' },
  { h: 'status', f: 'status' }, { h: 'review_reason', f: 'review_reason' }, { h: 'best_ipeds_suggestion', f: 'review_suggestion' },
];
const review = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW')
  .sort((a, b) => (a.review_reason || '').localeCompare(b.review_reason || ''));
// also append duplicate-unitid data-quality rows
const dupRows = [];
const seenDup = new Set();
for (const r of R) if (r.duplicate_unitid && !seenDup.has(r.duplicate_group)) { seenDup.add(r.duplicate_group); dupRows.push({ campus_id: r.campus_id, campus: r.campus, state_abbr: r.state, city: '', status: 'DUPLICATE_UNITID', review_reason: 'multiple_campus_rows_share_unitid_' + r.unitid, review_suggestion: r.duplicate_group }); }
writeCsv('CAMPUS_IDENTITY_REVIEW.csv', reviewCols, [...review, ...dupRows]);

console.log('Done.');
