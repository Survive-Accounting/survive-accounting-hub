// Emit CAMPUS_MARKET_INTELLIGENCE_REPORT.md and KING_GROWTH_BRIEF.md
import fs from 'node:fs';
import path from 'node:path';

const DATA = path.resolve('scripts/market-intel/data');
const OUT = path.resolve('market-intel-output');
const CFG = JSON.parse(fs.readFileSync(path.resolve('src/lib/market-intel/scoring-config.json'), 'utf8'));
const { records: R, generated_at, latest_data_year, intro1_multiplier } = JSON.parse(fs.readFileSync(path.join(DATA, 'results.json'), 'utf8'));
const matches = JSON.parse(fs.readFileSync(path.join(DATA, 'matches.json'), 'utf8'));

const prim = R.filter((r) => r.segment === 'primary');
const two = R.filter((r) => r.segment === 'two_year');
const inUniverse = matches.filter((m) => m.in_universe);
const review = matches.filter((m) => m.status === 'NEEDS_IDENTITY_REVIEW');
const n = (x) => (x == null ? '—' : x.toLocaleString());
const pct = (x) => (x == null ? '—' : `${x > 0 ? '+' : ''}${(x * 100).toFixed(1)}%`);
const cjoin = (r) => { const c = (r.councils_present || []).map((x) => x.toUpperCase()).join('+'); return c || '—'; };
const missingOf = (r) => [!r.greek_available && 'Greek', !(r.council_available && r.council_contacts_councils) && 'council contacts', !r.club_available && 'business clubs'].filter(Boolean).join(', ');
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const mean = (a) => { const s = a.filter((x) => x != null); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : null; };

const totalBiz = prim.reduce((s, r) => s + (r.business_bachelors || 0), 0);
const totalAcct = prim.reduce((s, r) => s + (r.accounting_bachelors || 0), 0);
const totalIntro1 = prim.reduce((s, r) => s + (r.estimated_intro1_annual || 0), 0);
const growthVals = prim.filter((r) => r.growth_status === 'OK' && r.meaningful_market).map((r) => r.business_growth_5y);
const rapid = prim.filter((r) => r.growth_label === 'RAPID_GROWTH').length;
const growing = prim.filter((r) => r.growth_label === 'GROWING').length;
const declining = prim.filter((r) => r.growth_label === 'DECLINING').length;
const dsScored = prim.filter((r) => r.distribution_strength_score != null).length;
const dups = R.filter((r) => r.duplicate_unitid);
const dupPairs = new Set(dups.map((r) => r.duplicate_group)).size;

const moBuckets = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, '50-59': 0, '<50': 0 };
for (const r of prim) { const s = r.market_opportunity_score; const k = s >= 90 ? '90-100' : s >= 80 ? '80-89' : s >= 70 ? '70-79' : s >= 60 ? '60-69' : s >= 50 ? '50-59' : '<50'; moBuckets[k]++; }

const byOP = [...prim].filter((r) => r.outreach_priority_score != null).sort((a, b) => b.outreach_priority_score - a.outreach_priority_score);
const byMO = [...prim].sort((a, b) => b.market_opportunity_score - a.market_opportunity_score);
const byGrowth = [...prim].filter((r) => r.meaningful_market && r.growth_momentum_score != null).sort((a, b) => b.growth_momentum_score - a.growth_momentum_score);
const bySize = [...prim].sort((a, b) => (b.business_bachelors || 0) - (a.business_bachelors || 0));
const byDist = [...prim].filter((r) => r.distribution_strength_score != null).sort((a, b) => b.distribution_strength_score - a.distribution_strength_score);
const byEnrich = [...prim].filter((r) => r.enrichment_priority_score != null && r.market_opportunity_score >= 55 && r.structural_completeness < 1).sort((a, b) => b.enrichment_priority_score - a.enrichment_priority_score);

const reviewReasons = review.reduce((a, m) => { a[m.review_reason] = (a[m.review_reason] || 0) + 1; return a; }, {});

// ---------- MAIN REPORT ----------
const rep = [];
rep.push(`# Campus Market Intelligence — Report`);
rep.push(`\n_Generated ${generated_at} · scoring config ${CFG.config_version} · IPEDS data year ${latest_data_year}_\n`);
rep.push(`> Independent, standardized market-intelligence layer built on public IPEDS/NCES data. **No deploy, no outreach sent.** Course Readiness is **COMING_SOON** (zero weight in current priority). Distribution Strength / Outreach Priority / Enrichment Priority are computed on **current** Greek/council data and are designed to be cheaply **refreshed** after the structural Campus Backfill settles.\n`);

rep.push(`## 1. Coverage & identity`);
rep.push(`| Metric | Value |`);
rep.push(`|---|---|`);
rep.push(`| Target universe (US, 4-yr + 2-yr, non-research-only) | **${inUniverse.length}** campuses |`);
rep.push(`| Matched to IPEDS UNITID | **${R.length}** (${(R.length / inUniverse.length * 100).toFixed(0)}%) |`);
rep.push(`| — 4-year institutions (primary market) | **${prim.length}** |`);
rep.push(`| — 2-year institutions (community colleges, separate segment) | ${two.length} |`);
rep.push(`| Identity failures → review queue | **${review.length}** |`);
rep.push(`| Duplicate campus rows sharing a UNITID (flagged, not merged) | ${dups.length} rows / ${dupPairs} groups |`);
rep.push(`\nMatch methods: ${Object.entries(matches.filter((m) => m.unitid).reduce((a, m) => { a[m.match_method] = (a[m.match_method] || 0) + 1; return a; }, {})).map(([k, v]) => `${k}=${v}`).join(', ')}.`);
rep.push(`\nReview-queue reasons: ${Object.entries(reviewReasons).map(([k, v]) => `${k}=${v}`).join(', ')}. Systems/districts are intentionally **not** auto-matched to a single campus (per the "do not merge system campuses" rule).\n`);

rep.push(`## 2. The market (4-year primary segment, IPEDS ${latest_data_year})`);
rep.push(`| Metric | Value |`);
rep.push(`|---|---|`);
rep.push(`| Total annual business bachelor's completions represented | **${n(totalBiz)}** |`);
rep.push(`| Total annual accounting bachelor's completions | ${n(totalAcct)} |`);
rep.push(`| **Estimated annual Intro-1 opportunity** (business × ${intro1_multiplier}) | **~${n(totalIntro1)} students/yr** |`);
rep.push(`| | _ESTIMATED, NOT ACTUAL ENROLLMENT — ${CFG.intro1_estimate.confidence} confidence_ |`);
rep.push(`\n## 3. Growth (5-year business completions, meaningful markets)`);
rep.push(`| Metric | Value |`);
rep.push(`|---|---|`);
rep.push(`| Median 5-yr business growth | ${pct(median(growthVals))} |`);
rep.push(`| Mean 5-yr business growth | ${pct(mean(growthVals))} |`);
rep.push(`| RAPID_GROWTH campuses | **${rapid}** |`);
rep.push(`| GROWING campuses | ${growing} |`);
rep.push(`| DECLINING campuses | ${declining} |`);

rep.push(`\n## 4. Score distributions`);
rep.push(`**Market Opportunity (4-yr):** ` + Object.entries(moBuckets).map(([k, v]) => `${k}: ${v}`).join(' · '));
rep.push(`\n**Distribution Strength coverage:** ${dsScored} of ${prim.length} four-year campuses have a Distribution Strength score today (Greek and/or council data present). The remaining ${prim.length - dsScored} are **PENDING_BACKFILL** — their Outreach Priority currently renormalizes over Market Opportunity + Growth Momentum and will gain Distribution Strength on refresh.`);

const row = (r, i) => `| ${i + 1} | ${r.campus} | ${r.state} | ${r.outreach_priority_score ?? '—'} | ${r.market_opportunity_score} | ${r.growth_momentum_score ?? '—'} | ${r.distribution_strength_score ?? 'pending'} | ${n(r.business_bachelors)} | ${pct(r.business_growth_5y)} | ${r.greek_chapters ?? 'n/r'} |`;
rep.push(`\n## 5. Top 25 by Market Opportunity`);
rep.push(`| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |`);
rep.push(`|--|--|--|--|--|--|--|--|--|--|`);
byMO.slice(0, 25).forEach((r, i) => rep.push(row(r, i)));

rep.push(`\n## 6. Top 25 growing meaningful markets`);
rep.push(`| # | Campus | ST | OP | MO | GM | DS | Biz grads | Biz 5Y | Greek |`);
rep.push(`|--|--|--|--|--|--|--|--|--|--|`);
byGrowth.slice(0, 25).forEach((r, i) => rep.push(row(r, i)));

rep.push(`\n## 7. Data sources & cost`);
rep.push(`- **IPEDS / NCES** complete data files (public, free): Completions \`C${latest_data_year - 8}–C${latest_data_year}_A\` (9 years), enrollment \`DRVEF${latest_data_year}\` + \`EFFY\`, directory \`HD${latest_data_year}\`. Bulk download, no per-campus scraping.`);
rep.push(`- **Live DB** (read-only): campus identity, Greek chapters, council status/contacts, business clubs, first-party demand events.`);
rep.push(`- **API / data cost: $0** (all IPEDS data is public bulk; no paid APIs used).`);

rep.push(`\n## 8. Known limitations`);
rep.push(`- **Intro-1 is an estimate**, not measured course enrollment (business bachelor's × ${intro1_multiplier}). Recalibrate against real samples.`);
rep.push(`- **IPEDS business/accounting is first-major bachelor's completions** (CIP 52 / 52.03, AWLEVEL 5). Some schools (e.g. Indiana–Bloomington) report all undergrad business under the general CIP 52.0101 and break out **no** accounting sub-code, so their accounting_bachelors reads 0 — faithful to IPEDS, not a defect.`);
rep.push(`- **${latest_data_year} completions are the latest IPEDS release** (provisional/revised where \`_RV\` available); the year is preserved on every row, never relabeled "current".`);
rep.push(`- **Distribution Strength is partial** (${dsScored}/${prim.length}) and reflects the in-progress structural backfill; it is renormalized over available components with completeness stamped. Business-club components cover only ~9 campuses (NOT_AVAILABLE_YET) and are excluded, not zeroed.`);
rep.push(`- **Live Demand = COMING_SOON**: first-party events are too sparse / partially unattributed (practice_attempts has free-text campus) to score reliably; raw signal counts are exposed instead. Zero weight.`);
rep.push(`- **Course Readiness = COMING_SOON** (null, zero weight) — reserved for Course Intel.`);
rep.push(`- **${dupPairs} duplicate campus groups** share a UNITID (pre-existing DB dups); flagged in \`CAMPUS_IDENTITY_REVIEW.csv\`, not merged.`);

const readiness = 'PARTIAL';
rep.push(`\n## 9. Verdict`);
rep.push(`The standardized market layer (IPEDS identity, enrollment, business/accounting completions, concentration, growth trends, estimated Intro-1, **Market Opportunity**, **Growth Momentum**) is complete and reliable across ${prim.length} four-year campuses. Distribution Strength / Outreach Priority / Enrichment Priority are live on current data and will sharpen after the structural backfill via the refresh path.`);
rep.push(`\n### MARKET INTELLIGENCE READY FOR GROWTH DASHBOARD: **${readiness}**`);
rep.push(`_(Market + Growth layers YES; Distribution/Outreach/Enrichment computed on current data, refresh after backfill; Course Readiness + Live Demand intentionally COMING_SOON.)_`);
rep.push(`\n**No deploy. No outreach sent. No campuses activated.**\n`);
fs.writeFileSync(path.join(OUT, 'CAMPUS_MARKET_INTELLIGENCE_REPORT.md'), rep.join('\n'));

// ---------- KING BRIEF ----------
const k = [];
k.push(`# King's Growth Brief — where to work first`);
k.push(`\n_${generated_at.slice(0, 10)} · ${prim.length} four-year target campuses · IPEDS ${latest_data_year} · scores 0–100_\n`);
k.push(`**The one-line story:** ~${n(totalBiz)} business grads/year across our 4-year target universe → an estimated **~${n(totalIntro1)} Intro Financial Accounting students per year** (business × ${intro1_multiplier}, rough). Here's where to point outreach first.\n`);
k.push(`> Scores rank the **market**. They don't send anything or activate any campus. "Distribution" tells you how ready we are to reach students there (Greek councils, contacts). "Pending" = we haven't researched Greek/council there yet — a research task, not a low score.\n`);

k.push(`## 🎯 Top 20 campuses to work first (Outreach Priority)`);
byOP.slice(0, 20).forEach((r, i) => {
  k.push(`\n**${i + 1}. ${r.campus}** (${r.state}) — Priority ${r.outreach_priority_score}`);
  k.push(`   Opportunity ${r.market_opportunity_score} · Growth ${r.growth_momentum_score ?? '—'} (${r.growth_label}) · Distribution ${r.distribution_strength_score ?? 'pending research'}`);
  k.push(`   Why: ${r.top_drivers.join('; ')}`);
  k.push(`   Next: **${r.recommended_next_action}**`);
});

k.push(`\n## 📈 Fastest-growing meaningful markets`);
byGrowth.slice(0, 12).forEach((r, i) => k.push(`${i + 1}. **${r.campus}** (${r.state}) — business ${n(r.business_series?.[latest_data_year - 5])}→${n(r.business_bachelors)} over 5Y (${pct(r.business_growth_5y)}), ${r.growth_label}`));

k.push(`\n## 🏛️ Largest markets (raw business grads/yr)`);
bySize.slice(0, 12).forEach((r, i) => k.push(`${i + 1}. **${r.campus}** (${r.state}) — ${n(r.business_bachelors)} business grads, ~${n(r.estimated_intro1_annual)} est. Intro-1/yr`));

k.push(`\n## 🤝 Best-distributed right now (ready to reach students)`);
byDist.slice(0, 12).forEach((r, i) => k.push(`${i + 1}. **${r.campus}** (${r.state}) — Distribution ${r.distribution_strength_score} (${(r.distribution_data_completeness * 100).toFixed(0)}% data), ${r.greek_chapters ?? '?'} Greek chapters, councils ${cjoin(r)}`));

k.push(`\n## 🔎 Biggest enrichment gaps (high-value, missing structural data)`);
k.push(`_Valuable campuses where we should research Greek/council/contacts next — top ENRICHMENT targets, not yet the best outreach targets._`);
byEnrich.slice(0, 12).forEach((r, i) => k.push(`${i + 1}. **${r.campus}** (${r.state}) — Opportunity ${r.market_opportunity_score}, ${(r.structural_completeness * 100).toFixed(0)}% structural data. Missing: ${missingOf(r)}`));

k.push(`\n## ⚠️ Data gaps to know`);
k.push(`- Distribution Strength is live for **${dsScored} of ${prim.length}** campuses — the rest need Greek/council research (structural backfill in progress). Their priority will rise once distribution data lands.`);
k.push(`- **Course Readiness** and **Live Demand** are **coming soon** and count for nothing yet.`);
k.push(`- Intro-1 numbers are **estimates** from business-grad counts, not real class rosters.`);
k.push(`- ${review.length} campuses need an identity check before scoring (see \`CAMPUS_IDENTITY_REVIEW.csv\`).`);
k.push(`\n_Full data: \`CAMPUS_MARKET_INTELLIGENCE.csv\`. Top lists: \`TOP_100_*.csv\`. Details: \`CAMPUS_MARKET_INTELLIGENCE_REPORT.md\`._\n`);
fs.writeFileSync(path.join(OUT, 'KING_GROWTH_BRIEF.md'), k.join('\n'));

console.log('Wrote CAMPUS_MARKET_INTELLIGENCE_REPORT.md and KING_GROWTH_BRIEF.md');
console.log(`Universe ${inUniverse.length} | matched ${R.length} (4yr ${prim.length}) | review ${review.length} | totalBiz ${n(totalBiz)} | estIntro1 ${n(totalIntro1)}`);
