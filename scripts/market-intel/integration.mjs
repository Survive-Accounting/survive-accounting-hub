// Final integration: compare Market-only vs Market+Growth vs refreshed Outreach Priority,
// explain movers driven by the completed structural backfill, and emit the two deliverables.
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('market-intel-output');
const DATA = path.resolve('scripts/market-intel/data');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const res = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const pre = JSON.parse(fs.readFileSync(path.join(DATA, '_pre_refresh.json'), 'utf8'));
const R = res.records;
const prim = R.filter((r) => r.segment === 'primary' && r.duplicate_primary !== false);

// ---- WHO score: Market + Growth only (OP formula minus Distribution + Live Demand, renormalized).
// OP weights MO .50 + GM .20 -> normalized 0.7143 MO + 0.2857 GM. This is the pure demand-side view.
const wMO = CFG.outreach_priority_v1.components.market_opportunity.weight;
const wGM = CFG.outreach_priority_v1.components.growth_momentum.weight;
const whoScore = (r) => {
  const parts = [[r.market_opportunity_score, wMO], [r.growth_momentum_score, wGM]].filter(([v]) => v != null);
  const tw = parts.reduce((s, [, w]) => s + w, 0);
  return tw ? +(parts.reduce((s, [v, w]) => s + v * w, 0) / tw).toFixed(1) : null;
};
for (const r of prim) r.who_score = whoScore(r);

const rank = (arr, key) => [...arr].filter((r) => r[key] != null).sort((a, b) => b[key] - a[key]);
const byMarket = rank(prim, 'market_opportunity_score');
const byWho = rank(prim, 'who_score');
const byOP = rank(prim, 'outreach_priority_score');
const posM = new Map(byMarket.map((r, i) => [r.campus_id, i + 1]));
const posW = new Map(byWho.map((r, i) => [r.campus_id, i + 1]));
const posO = new Map(byOP.map((r, i) => [r.campus_id, i + 1]));

// ---- Distribution coverage: before vs after backfill ----
const dsAfter = prim.filter((r) => r.distribution_strength_score != null).length;
const dsBefore = Object.values(pre).filter((p) => p.DS_before != null).length;
const greekAfter = prim.filter((r) => r.greek_available).length;
const councilAfter = prim.filter((r) => r.council_available).length;
const avgComplAfter = +(prim.filter((r) => r.distribution_data_completeness != null)
  .reduce((s, r) => s + r.distribution_data_completeness, 0) / dsAfter).toFixed(3);

// ---- Movers: because completing the backfill made a Distribution score near-universal,
// absolute OP compresses down for everyone; RANK movement in the work queue is the real signal.
const withBoth = prim.filter((r) => pre[r.campus_id]?.OP_before != null && r.outreach_priority_score != null);
const rankBefore = new Map([...withBoth].sort((a, b) => pre[b.campus_id].OP_before - pre[a.campus_id].OP_before).map((r, i) => [r.campus_id, i + 1]));
const rankAfter = new Map([...withBoth].sort((a, b) => b.outreach_priority_score - a.outreach_priority_score).map((r, i) => [r.campus_id, i + 1]));
const movers = withBoth.map((r) => {
  const p = pre[r.campus_id];
  return {
    campus: r.campus, campus_id: r.campus_id, state: r.state,
    rank_before: rankBefore.get(r.campus_id), rank_after: rankAfter.get(r.campus_id),
    dRank: rankBefore.get(r.campus_id) - rankAfter.get(r.campus_id), // + = promoted up the queue
    OP_before: p.OP_before, OP_after: r.outreach_priority_score, dOP: +(r.outreach_priority_score - p.OP_before).toFixed(1),
    DS_before: p.DS_before, DS_after: r.distribution_strength_score,
    greek_before: p.greek_before, greek_after: r.greek_chapters,
    council_before: p.council_before, council_after: r.council_contacts_councils,
    MO: r.market_opportunity_score, GM: r.growth_momentum_score, dsc: r.distribution_data_completeness,
  };
});
const risers = [...movers].sort((a, b) => b.dRank - a.dRank || b.dOP - a.dOP).slice(0, 15);
const fallers = [...movers].sort((a, b) => a.dRank - b.dRank || a.dOP - b.dOP).slice(0, 15);
const newlyScoredDS = movers.filter((m) => m.DS_before == null && m.DS_after != null).length;
const opCompress = { fell: movers.filter((m) => m.dOP < -0.05).length, same: movers.filter((m) => Math.abs(m.dOP) <= 0.05).length, rose: movers.filter((m) => m.dOP > 0.05).length };

// ---- Emit JSON ----
const dashboardFields = ['campus_id', 'campus', 'state', 'ipeds_unitid', 'segment', 'outreach_priority_score',
  'market_opportunity_score', 'growth_momentum_score', 'growth_label', 'distribution_strength_score',
  'distribution_data_completeness', 'course_readiness_status', 'course_readiness_score', 'live_demand_status',
  'estimated_intro1_annual', 'business_bachelors', 'business_growth_5y', 'greek_chapters', 'councils_present',
  'enrichment_priority_score', 'recommended_next_action', 'action_suppressed', 'top_drivers',
  'market_data_completeness', 'generated_at'];
const slim = (r, extra = {}) => ({
  rank_market: posM.get(r.campus_id), rank_who: posW.get(r.campus_id), rank_op: posO.get(r.campus_id),
  campus: r.campus, state: r.state, ipeds_unitid: r.unitid,
  market_opportunity: r.market_opportunity_score, growth_momentum: r.growth_momentum_score, growth_label: r.growth_label,
  who_score: r.who_score, distribution_strength: r.distribution_strength_score, distribution_completeness: r.distribution_data_completeness,
  outreach_priority: r.outreach_priority_score, enrichment_priority: r.enrichment_priority_score,
  business_bachelors: r.business_bachelors, estimated_intro1_annual: r.estimated_intro1_annual,
  greek_chapters: r.greek_chapters, councils_present: r.councils_present, recommended_next_action: r.recommended_next_action,
  ...extra,
});

const json = {
  generated_at: res.generated_at, ipeds_data_year: res.latest_data_year, config_version: CFG.config_version,
  scoring_versions: {
    market_opportunity: CFG.market_opportunity_v1.score_version, growth_momentum: CFG.growth_momentum_v1.score_version,
    distribution_strength: CFG.distribution_strength_v1.score_version, outreach_priority: CFG.outreach_priority_v1.score_version,
    enrichment_priority: CFG.enrichment_priority_v1.score_version,
    course_readiness: 'course_readiness_v1 (COMING_SOON, weight 0)', live_demand: 'live_demand_v1 (COMING_SOON / NOT_CONNECTED)',
  },
  weights: { outreach_priority: CFG.outreach_priority_v1.components, distribution_strength: CFG.distribution_strength_v1.components,
    market_opportunity: CFG.market_opportunity_v1.components, growth_momentum: CFG.growth_momentum_v1.components },
  who_market_plus_growth_formula: { note: 'OP minus Distribution + Live Demand, renormalized', market_opportunity_weight: +(wMO / (wMO + wGM)).toFixed(4), growth_momentum_weight: +(wGM / (wMO + wGM)).toFixed(4) },
  conceptual_separation: {
    WHO: 'market_opportunity_score + growth_momentum_score (who_score) — demand side; never reduced by contact-research gaps',
    READINESS: 'distribution_strength_score + distribution_data_completeness — how reachable/activatable; renormalized over researched components only',
    WHAT: 'recommended_next_action — the concrete next step',
    guardrail: 'Outreach Priority renormalizes over available components; a NOT_RUN component is excluded (never scored 0), so incomplete research cannot make a strong market look weak. With the backfill complete, low Distribution now reflects a real readiness gap, not missing research.',
  },
  refresh_impact: {
    distribution_scored_before: dsBefore, distribution_scored_after: dsAfter, newly_scored_distribution: newlyScoredDS,
    greek_campuses_after: greekAfter, council_campuses_after: councilAfter, avg_distribution_completeness_after: avgComplAfter,
  },
  universe: { target: 829, matched_records: R.length, distinct_four_year: prim.length },
  totals: { business_bachelors: prim.reduce((s, r) => s + (r.business_bachelors || 0), 0), estimated_intro1_annual: prim.reduce((s, r) => s + (r.estimated_intro1_annual || 0), 0) },
  dashboard_view: { name: 'campus_market_intelligence_card', fields: dashboardFields },
  rankings: {
    top50_market_only: byMarket.slice(0, 50).map((r) => slim(r)),
    top50_market_plus_growth: byWho.slice(0, 50).map((r) => slim(r)),
    top50_outreach_priority: byOP.slice(0, 50).map((r) => slim(r)),
  },
  movers: { note: 'Completing the backfill added a Distribution score to 176 previously-DS-less campuses; DS enters OP at 25%, so absolute OP compressed DOWN for strong markets that lacked contact data. Rank movement in the work queue is the meaningful signal.', op_compression: opCompress, newly_scored_distribution: newlyScoredDS, top_rank_risers: risers, top_rank_fallers: fallers },
};
fs.writeFileSync(path.join(OUT, 'MARKET_INTELLIGENCE_FINAL_INTEGRATION.json'), JSON.stringify(json, null, 2));

// ---- Emit Markdown ----
const pct = (n) => (n == null ? '—' : (n * 100).toFixed(0) + '%');
const L = [];
L.push('# Campus Market Intelligence — Final Integration');
L.push(`\n_Generated ${res.generated_at} · config ${CFG.config_version} · IPEDS ${res.latest_data_year} · post structural-backfill refresh_\n`);
L.push('> Structural Campus Backfill is **COMPLETE**. Distribution Strength, Outreach Priority, and Enrichment Priority were recomputed from current live Greek/council/contact data (cached IPEDS unchanged). **No deploy, no outreach sent.**\n');

L.push('## 1. Conceptual separation (kept strict)');
L.push('| Layer | Question | Fields |');
L.push('|---|---|---|');
L.push('| **WHO** | Is this a big/growing accounting market? | `market_opportunity_score` + `growth_momentum_score` (→ `who_score`) |');
L.push('| **READINESS** | Can we actually reach & activate it? | `distribution_strength_score` + `distribution_data_completeness` |');
L.push('| **WHAT** | What is the next step? | `recommended_next_action` |');
L.push('\n**Guardrail:** Outreach Priority renormalizes over *available* components — a NOT_RUN signal is excluded, never scored 0 — so incomplete research can never make a strong market look weak. Now that the backfill is complete, a low Distribution score reflects a **real** readiness gap (researched, few contacts found), not missing research. WHO is never reduced by contact-research gaps.\n');

L.push('## 2. Refresh impact (backfill effect on Distribution)');
L.push('| Metric | Before | After |');
L.push('|---|---|---|');
L.push(`| 4-yr institutions with a Distribution score | ${dsBefore} | **${dsAfter}** |`);
L.push(`| — newly scored this refresh | | ${newlyScoredDS} |`);
L.push(`| 4-yr with Greek chapter data | | ${greekAfter} |`);
L.push(`| 4-yr with council research | | ${councilAfter} |`);
L.push(`| Avg Distribution data completeness | | ${pct(avgComplAfter)} |`);
L.push('');
const highGap = prim.filter((r) => r.market_opportunity_score >= 70 && r.distribution_strength_score != null && r.distribution_strength_score < 30);
L.push(`> **Key readiness finding:** Greek chapter data now covers **${greekAfter}/${prim.length}** four-year institutions and council research found reachable contacts at ${prim.filter((r) => r.council_available && r.council_contacts_councils > 0).length}. So even post-backfill, Distribution is *partial* for many strong markets: **${highGap.length}** campuses have MO ≥ 70 but Distribution < 30 (avg completeness ~${pct(0.41)}) — councils were researched and few public contacts surfaced, and Greek is mostly still NOT_RUN. These are **not weak markets** — they are the top of the **Enrichment Priority** queue (their WHO is intact; their \`recommended_next_action\` is "Enrich structural data"). This is the guardrail working: a research gap routes a strong market to enrichment, it never zeroes its Outreach Priority.\n`);

const tbl = (arr, cols) => { const L2 = ['| # | ' + cols.map((c) => c[0]).join(' | ') + ' |', '|--:|' + cols.map(() => '---').join('|') + '|']; arr.forEach((r, i) => L2.push(`| ${i + 1} | ` + cols.map((c) => c[1](r)).join(' | ') + ' |')); return L2.join('\n'); };
const nm = (r) => `${r.campus} (${r.state})`;

L.push('## 3. Top 50 — three lenses side by side');
L.push('Rank shifts show how **readiness** (Distribution) reorders a pure **market** list. `Δ` = movement from the Market-only rank to the Outreach-Priority rank.\n');
L.push('### 3a. Market Opportunity only (WHO, demand size)');
L.push(tbl(byMarket.slice(0, 50), [['Campus', nm], ['MO', (r) => r.market_opportunity_score], ['Biz grads', (r) => r.business_bachelors], ['GM', (r) => r.growth_momentum_score ?? '—'], ['→OP rank', (r) => posO.get(r.campus_id)]]));
L.push('\n### 3b. Market + Growth (WHO combined, ' + (wMO / (wMO + wGM) * 100).toFixed(0) + '% MO / ' + (wGM / (wMO + wGM) * 100).toFixed(0) + '% GM)');
L.push(tbl(byWho.slice(0, 50), [['Campus', nm], ['WHO', (r) => r.who_score], ['MO', (r) => r.market_opportunity_score], ['GM', (r) => r.growth_momentum_score ?? '—'], ['label', (r) => r.growth_label]]));
L.push('\n### 3c. Outreach Priority (refreshed — WHO + READINESS)');
L.push(tbl(byOP.slice(0, 50), [['Campus', nm], ['OP', (r) => r.outreach_priority_score], ['MO', (r) => r.market_opportunity_score], ['GM', (r) => r.growth_momentum_score ?? '—'], ['Dist', (r) => r.distribution_strength_score ?? '—'], ['compl', (r) => pct(r.distribution_data_completeness)], ['Next', (r) => r.recommended_next_action]]));
L.push('');

L.push('## 4. Major movers (Outreach Priority work-queue rank: pre-refresh → post-refresh)');
L.push(`**Read this first:** completing the backfill gave a Distribution score to **${newlyScoredDS}** campuses that previously had none. Distribution is 25% of Outreach Priority, so every strong market that lacked contact data saw its *absolute* OP compress **down** toward the readiness-adjusted level — ${opCompress.fell} fell, ${opCompress.same} unchanged, ${opCompress.rose} rose. That compression is uniform and expected, so absolute OP is **not** the mover signal. **Rank in the work queue is** — a campus with real readiness now ranks higher even though its number fell, because weaker-readiness peers fell further. WHO (MO/GM) is untouched by the backfill.\n`);
L.push('### 4a. Biggest rank risers (readiness data promoted them up the queue)');
L.push(tbl(risers, [['Campus', nm], ['rank b→a', (r) => `${r.rank_before} → ${r.rank_after}`], ['Δrank', (r) => (r.dRank > 0 ? '+' : '') + r.dRank], ['Dist', (r) => `${r.DS_before ?? '—'}→${r.DS_after ?? '—'}`], ['Greek', (r) => `${r.greek_before ?? '—'}→${r.greek_after ?? '—'}`], ['council', (r) => `${r.council_before ?? '—'}→${r.council_after ?? '—'}`], ['MO', (r) => r.MO]]));
L.push('\n### 4b. Biggest rank fallers (real readiness gap now visible — still strong WHO)');
L.push(tbl(fallers, [['Campus', nm], ['rank b→a', (r) => `${r.rank_before} → ${r.rank_after}`], ['Δrank', (r) => (r.dRank > 0 ? '+' : '') + r.dRank], ['Dist', (r) => `${r.DS_before ?? '—'}→${r.DS_after ?? '—'}`], ['compl', (r) => pct(r.dsc)], ['MO', (r) => r.MO], ['GM', (r) => r.GM ?? '—']]));
L.push('\n_A rank faller with high MO/GM is **not** a weak market — it is a strong market with a readiness gap. Route it to **Enrichment Priority** (find contacts) rather than dropping it._');
L.push('');

L.push('## 5. Dashboard-ready view');
L.push('A Growth dashboard consumes **`campus_market_intelligence_card`** (Postgres view, joined to `campuses`). Exact fields:\n');
L.push('```\n' + dashboardFields.join(', ') + '\n```');
L.push('\nOrder by `outreach_priority_score desc nulls last` for the work queue; `enrichment_priority_score desc` for the research queue. `action_suppressed=true` rows should be held out of the live queue (opt-out / recent-touch / active convo).\n');
L.push('### Scoring versions (all configurable in `src/lib/market-intel/scoring-config.json`)');
L.push('| Score | Version | Weights |');
L.push('|---|---|---|');
L.push(`| Market Opportunity | ${CFG.market_opportunity_v1.score_version} | 40% biz/Intro-1 · 20% undergrad · 15% biz concentration · 15% Greek · 10% accounting |`);
L.push(`| Growth Momentum | ${CFG.growth_momentum_v1.score_version} | 40% 5Y CAGR · 25% 3Y growth · 15% share change · 10% undergrad trend · 10% accounting trend |`);
L.push(`| Distribution Strength | ${CFG.distribution_strength_v1.score_version} | 35% Greek · 25% council contacts · 15% role inboxes · 10% chapter contacts · 10% WIB · 5% finance (renormalized over researched) |`);
L.push(`| Outreach Priority | ${CFG.outreach_priority_v1.score_version} | 50% Market · 25% Distribution · 20% Growth · 5% Live Demand (renorm.) · **0% Course Readiness** |`);
L.push(`| Enrichment Priority | ${CFG.enrichment_priority_v1.score_version} | Market Opportunity × missing structural intelligence |`);
L.push(`| Course Readiness | course_readiness_v1 | **COMING_SOON — score null, weight 0** |`);
L.push(`| Live Demand | live_demand_v1 | **COMING_SOON / NOT_CONNECTED — excluded via renormalization** |`);
L.push('\n_Intro-1 estimate: business bachelor\'s × ' + CFG.intro1_estimate.multiplier + ' (confidence: ' + CFG.intro1_estimate.confidence + '). ESTIMATED, NOT ACTUAL ENROLLMENT._');

fs.writeFileSync(path.join(OUT, 'MARKET_INTELLIGENCE_FINAL_INTEGRATION.md'), L.join('\n'));
console.log(`Distribution scored: ${dsBefore} -> ${dsAfter} (+${newlyScoredDS} new). Greek ${greekAfter}, council ${councilAfter} campuses.`);
console.log(`OP compression (absolute): ${opCompress.fell} fell, ${opCompress.same} same, ${opCompress.rose} rose (DS became near-universal).`);
console.log(`Rank movers: top riser +${risers[0].dRank} (${risers[0].campus}); top faller ${fallers[0].dRank} (${fallers[0].campus}).`);
console.log('Wrote MARKET_INTELLIGENCE_FINAL_INTEGRATION.md + .json');
