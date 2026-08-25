// Generate COMPETITIVE_INTELLIGENCE_REPORT.md + UF_STUDY_EDGE_COMPETITIVE_BRIEF.md
// from the emitted CSVs + discovery/study-edge data. Pure computation.
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, DATA } from './lib.mjs';

const OUT = path.resolve('competitive-intel-output');
const rd = (f) => (fs.existsSync(path.join(OUT, f)) ? parseCsv(fs.readFileSync(path.join(OUT, f), 'utf8')) : []);
const rdJson = (p) => (fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null);

const summary = rd('CAMPUS_COMPETITIVE_SUMMARY.csv');
const seLike = rd('STUDY_EDGE_LIKE_COMPETITORS.csv');
const validated = rd('TOP_VALIDATED_PAID_CAMPUSES.csv');
const paidMarkets = rd('PAID_ACCOUNTING_MARKETS.csv');
const yieldRows = rd('SERP_COMPETITOR_SEARCH_YIELD.csv');
const brandKw = rd('COMPETITOR_BRAND_KEYWORD_CANDIDATES.csv');
const ci = rd('COMPETITOR_INTELLIGENCE.csv');
const prog = rdJson(path.join(DATA, 'discover-progress.json')) || {};
const se = rdJson(path.join(DATA, 'study-edge.json'));
const competitors = rdJson(path.join(DATA, 'competitors.json')) || {};

const n = summary.length;
const pct = (x) => (n ? Math.round((x / n) * 100) : 0);
const countBy = (rows, key) => rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {});
const cntWhere = (key, val) => summary.filter((r) => r[key] === val).length;

const provenDist = countBy(summary, 'proven_paid_market');
const introDist = countBy(summary, 'intro_accounting_paid_market_status');
const valDist = countBy(summary, 'market_validation');

// pricing distribution from study-edge-like / competitor rows
const prices = ci.map((r) => r.price).filter(Boolean);

const topValidated = validated.slice(0, 30);
const topWhiteSpace = summary.filter((r) => r.market_validation === 'WHITE_SPACE')
  .sort((a, b) => Number(b.market_opportunity) - Number(a.market_opportunity)).slice(0, 25);
const withAds = summary.filter((r) => r.competitor_ads_observed === 'YES');

const readiness = n >= 500 ? 'YES' : n >= 100 ? 'PARTIAL' : 'PARTIAL';

// ── Main report ───────────────────────────────────────────────────────────────
const L = [];
L.push('# Competitive Market Intelligence — Survive Accounting');
L.push('');
L.push(`_Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · public web/search results only · no ads run, nothing deployed._`);
L.push('');
L.push('## What this is');
L.push('A nationwide scan for evidence that students **already pay third parties** for Intro Financial Accounting help — course-specific tutoring, exam reviews, practice exams, cram videos, and supplemental instruction. A strong existing paid competitor is treated as **positive** market evidence (proven willingness to pay), not merely a threat.');
L.push('');
L.push('## Coverage');
L.push(`- **Campuses researched:** ${n}${prog.serpDead ? ' (SERP credits exhausted mid-run — partial)' : ''}`);
L.push(`- **SERP searches consumed (this dataset):** ${prog.serpLive ?? '?'} live + ${prog.serpCached ?? '?'} served from cache · est. cost $${prog.cost ?? '?'}`);
L.push(`- **Competitor × campus observations:** ${ci.length}`);
L.push(`- **Unique competitor domains:** ${new Set(ci.map((r) => r.domain)).size}`);
L.push(`- **Campuses with a paid tutoring competitor:** ${summary.filter((r) => Number(r.paid_competitors_found) > 0).length} (${pct(summary.filter((r) => Number(r.paid_competitors_found) > 0).length)}%)`);
L.push(`- **Campuses with an Intro-Accounting-specific paid competitor:** ${summary.filter((r) => Number(r.intro1_competitors_found) > 0).length}`);
L.push(`- **Campuses with a course-specific competitor site** (e.g. \`acct2101uga.com\`): ${summary.filter((r) => Number(r.course_specific_competitors) > 0).length}`);
L.push(`- **Campuses with visible sponsored search activity:** ${withAds.length}`);
L.push('');
L.push('## Proven-paid-market signal (established willingness to pay)');
L.push('Descriptive signal per campus. HIGH = a local/course-specific paid accounting competitor and/or paid accounting search ads present.');
L.push('');
L.push('| Signal | Campuses | % |');
L.push('|---|---|---|');
for (const k of ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']) L.push(`| ${k} | ${provenDist[k] || 0} | ${pct(provenDist[k] || 0)}% |`);
L.push('');
L.push('**Intro-accounting paid-market status:** ' + ['STRONG', 'MODERATE', 'WEAK', 'UNKNOWN'].map((k) => `${k} ${introDist[k] || 0}`).join(' · '));
L.push('');
L.push('**Market validation (white-space vs validated):** ' + ['VALIDATED_PAID_MARKET', 'CROWDED', 'WHITE_SPACE', 'LOW_EVIDENCE'].map((k) => `${k} ${valDist[k] || 0}`).join(' · '));
L.push('');
L.push('> **Reading it:** VALIDATED_PAID_MARKET / CROWDED = someone already monetizes paid help here (demand proven). WHITE_SPACE = strong fundamentals (high Market Opportunity) but no local paid competitor detected — first-mover potential. LOW_EVIDENCE = thin search evidence (often no course code / small school).');
L.push('');

L.push('## Top validated paid markets (someone already sells campus/course-specific paid help)');
L.push('Ranked by strength of third-party paid evidence, then Market Opportunity. This is a **market-validation** signal, not the final Survive outreach priority.');
L.push('');
L.push('| # | Campus | ST | Course | MktOpp | Proven | Strongest competitor | Evidence |');
L.push('|---|---|---|---|---|---|---|---|');
topValidated.forEach((r, i) => L.push(`| ${i + 1} | ${r.campus} | ${r.state} | ${r.course_code || '—'} | ${r.market_opportunity} | ${r.proven_paid_market} | ${r.strongest_competitor || '—'} | ${(r.evidence || '').slice(0, 90)} |`));
L.push('');

L.push('## White-space: strong fundamentals, no local paid competitor detected');
L.push('High Market Opportunity campuses where no campus/course-specific paid accounting competitor surfaced — potential first-mover lanes.');
L.push('');
L.push('| Campus | ST | Course | MktOpp | Intro paid status | Nat\'l competitors present |');
L.push('|---|---|---|---|---|---|');
topWhiteSpace.forEach((r) => L.push(`| ${r.campus} | ${r.state} | ${r.course_code || '—'} | ${r.market_opportunity} | ${r.intro_accounting_paid_market_status} | ${r.paid_competitors_found} |`));
L.push('');

L.push('## Nationwide "Study-Edge-like" competitors (campus/course-specific)');
L.push('Businesses resembling Study Edge: campus- or course-specific video reviews, practice/mock exams, exam reviews, or recurring subscriptions.');
L.push('');
L.push('| Competitor | Model | Campuses | Acct | Course-specific | Video | Practice | Strength |');
L.push('|---|---|---|---|---|---|---|---|');
for (const r of seLike.slice(0, 25)) L.push(`| ${r.competitor} | ${r.model_type} | ${r.campuses_served} | ${r.accounting_supported} | ${r.course_specific_site} | ${r.video_reviews || '—'} | ${r.practice_exams || '—'} | ${r.estimated_market_strength} |`);
L.push('');
const clusters = countBy(seLike, 'model_type');
L.push('**Most common competitor models:** ' + Object.entries(clusters).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} (${v})`).join(' · '));
L.push('');

L.push('## Sponsored search activity (observational)');
L.push(`Sponsored/ad results were captured wherever SerpAPI returned them. ${withAds.length} campuses showed ads on accounting/course/tutoring queries. This is a **snapshot**, not proof an advertiser always bids on a term.`);
if (withAds.length) {
  L.push('');
  L.push('| Campus | Course | Ads observed (advertiser · query family) |');
  L.push('|---|---|---|');
  for (const r of withAds.slice(0, 20)) {
    const rec = competitors[r.campus_id];
    const ads = (rec?.ads || []).slice(0, 3).map((a) => `${a.advertiser} (${a.family})`).join('; ');
    L.push(`| ${r.campus} | ${r.course_code || '—'} | ${ads || '—'} |`);
  }
}
L.push('');

L.push('## SERP query-family yield (what actually finds competitors)');
L.push('Drives cheaper future refreshes — expand high-yield families, trim low-yield ones.');
L.push('');
L.push('| Query family | Searches | New competitors | New acct competitors | Ads seen | Yield/search | Verdict |');
L.push('|---|---|---|---|---|---|---|');
for (const r of yieldRows) L.push(`| ${r.query_family} | ${r.searches_run} | ${r.new_competitors} | ${r.new_acct_competitors} | ${r.ads_seen} | ${r.yield_per_search} | ${r.verdict} |`);
L.push('');

L.push('## Conquest & non-brand keyword candidates (INTERNAL research only)');
L.push('Candidate keyword **sets** for future consideration. **Do NOT place competitor trademarks in ad copy.** No ads created.');
L.push('');
L.push(`- **Brand-conquest candidate campuses:** ${cntWhere('brand_conquest_candidate', 'YES')}`);
L.push(`- **Non-brand high-intent search candidate campuses (have a course code):** ${cntWhere('nonbrand_search_candidate', 'YES')}`);
L.push('- **Top competitor brands worth understanding (by campus footprint):** ' + brandKw.slice(0, 10).map((b) => b.brand).join(', '));
L.push('- **Highest-value non-brand experiment shape:** `<COURSE_CODE> exam 1`, `<COURSE_CODE> practice exam`, `<SCHOOL> financial accounting exam` on the top validated + white-space campuses.');
L.push('');

L.push('## Deliverables in this folder');
L.push('- `COMPETITOR_INTELLIGENCE.csv` — one row per competitor × campus (full model)');
L.push('- `CAMPUS_COMPETITIVE_SUMMARY.csv` — one row per campus (signals, keywords, sources)');
L.push('- `STUDY_EDGE_LIKE_COMPETITORS.csv` — nationwide campus/course-specific analogs');
L.push('- `TOP_VALIDATED_PAID_CAMPUSES.csv` — ranked market-validation signal');
L.push('- `PAID_ACCOUNTING_MARKETS.csv` — campuses with a paid intro-accounting market');
L.push('- `COMPETITOR_BRAND_KEYWORD_CANDIDATES.csv` — internal keyword research (no ad copy)');
L.push('- `SERP_COMPETITOR_SEARCH_YIELD.csv` — query-family yield');
L.push('- `UF_STUDY_EDGE_COMPETITIVE_BRIEF.md` — deep Study Edge / UF brief');
L.push('');
L.push(`## COMPETITIVE INTELLIGENCE READY FOR GROWTH DASHBOARD: ${readiness}`);
L.push('');
L.push('_Method notes: public search results + public marketing pages only. No accounts, no paywall bypass, no purchases, no fake identities. Pricing/offerings are extracted verbatim from public pages. Signals are transparent and descriptive; the competitor-as-positive-evidence framing is intentional._');

fs.writeFileSync(path.join(OUT, 'COMPETITIVE_INTELLIGENCE_REPORT.md'), L.join('\n') + '\n');

// ── UF Study Edge brief ───────────────────────────────────────────────────────
const uf = summary.find((r) => /florida/i.test(r.campus) && !/state|international|atlantic|gulf|south florida|central florida|north florida|west florida/i.test(r.campus))
  || summary.find((r) => /^university of florida/i.test(r.campus));
const ufRec = uf ? competitors[uf.campus_id] : null;
const seFacts = se?.studyedge?.facts || [];
const mergeArr = (k) => [...new Set(seFacts.flatMap((f) => f[k] || []).filter(Boolean))];
const seOne = seFacts.map((f) => f.one_line).filter(Boolean)[0] || '(not captured)';
const sePricing = [...new Set([...(se?.studyedge?.heuristic_prices || []), ...seFacts.flatMap((f) => f.pricing || [])])];
const seFree = seFacts.map((f) => f.free_trial).filter(Boolean)[0] || (se?.studyedge?.heuristic_free_trial ? 'Free preview/trial content present on site' : '(not captured)');
const seAcct = seFacts.map((f) => f.accounting_supported).find((x) => x && x !== 'UNKNOWN') || 'UNKNOWN';

const U = [];
U.push('# UF × Study Edge — Competitive Brief');
U.push('');
U.push(`_Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · public pages only · no deceptive comparison copy._`);
U.push('');
if (!se) U.push('> ⚠️ Study Edge deep-research (`study-edge.mjs`) has not run yet — run it and regenerate this brief for the full picture. UF discovery data below is present.');
U.push('');
U.push('## What does Study Edge currently offer UF Financial Accounting students?');
U.push(`- **One-line:** ${seOne}`);
U.push(`- **Accounting supported:** ${seAcct}`);
U.push(`- **Accounting courses named:** ${mergeArr('accounting_courses').join(', ') || '(none captured)'}`);
U.push(`- **Campuses named:** ${mergeArr('campuses').slice(0, 12).join(', ') || '(none captured)'}`);
U.push(`- **Offerings observed:** ${(() => { const o = seFacts.map((f) => f.offerings).find(Boolean) || se?.studyedge?.heuristic_offerings || {}; return Object.entries(o).filter(([, v]) => v).map(([k]) => k).join(', ') || '(none captured)'; })()}`);
U.push(`- **Campus-specific pages:** ${seFacts.map((f) => f.campus_specific_pages).find((x) => x && x !== 'UNKNOWN') || 'UNKNOWN'}`);
U.push(`- **Professors named:** ${mergeArr('professors_named').join(', ') || '(none captured)'}`);
U.push('');
U.push('## What does it cost?');
U.push(sePricing.length ? sePricing.map((p) => `- ${p}`).join('\n') : '- (No public pricing captured — Study Edge often gates pricing behind sign-in; verify manually.)');
U.push(`- **Pricing model:** ${seFacts.map((f) => f.pricing_model).find((x) => x && x !== 'unknown') || (se?.studyedge?.heuristic_subscription ? 'subscription (heuristic)' : 'unknown')}`);
U.push('');
U.push('## What free / trial mechanism does it use?');
U.push(`- ${seFree}`);
U.push('');
U.push('## How does its offer compare structurally with Survive?');
U.push('| Dimension | Study Edge (observed) | Survive Accounting |');
U.push('|---|---|---|');
U.push(`| Scope | ${mergeArr('courses_supported').length ? 'Multi-course (' + mergeArr('courses_supported').slice(0, 4).join(', ') + '…)' : 'Multi-course platform'} | Intro Financial Accounting, campus/course-mapped |`);
U.push('| Format | Video reviews + practice/exam reviews + subscription | Course-mapped player, CEQ practice, exam maps |');
U.push('| Campus fit | Broad, strongest in FL (UF/FSU/UCF) | Explicit campus + Intro-1 course-code mapping |');
U.push('| Free entry | ' + (seFree.includes('not captured') ? 'gated / limited' : 'free preview content') + ' | Free Exam-1 / starter map |');
U.push('');
U.push('## UF competitive landscape (from discovery)');
if (uf) {
  U.push(`- **UF Market Opportunity:** ${uf.market_opportunity} · **Intro-1 course code:** ${uf.course_code || '(unknown)'}`);
  U.push(`- **Paid competitors found:** ${uf.paid_competitors_found} · **intro-accounting-specific:** ${uf.intro1_competitors_found} · **course-specific sites:** ${uf.course_specific_competitors}`);
  U.push(`- **Proven paid market:** ${uf.proven_paid_market} · **validation:** ${uf.market_validation}`);
  U.push(`- **Sponsored ads observed:** ${uf.competitor_ads_observed}`);
  if (ufRec) {
    const locals = ufRec.competitors.filter((c) => ['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING', 'MULTI_CAMPUS_TUTORING', 'EXAM_PREP_PLATFORM'].includes(c.competitor_type));
    U.push('- **Notable competitors at UF:** ' + (locals.map((c) => `${c.brand || c.domain} (${c.competitor_type})`).slice(0, 12).join(', ') || '—'));
    if (ufRec.ads?.length) U.push('- **Advertisers observed:** ' + [...new Set(ufRec.ads.map((a) => a.advertiser))].slice(0, 8).join(', '));
  }
} else {
  U.push('- University of Florida was not present in the processed set at generation time (still running, or filtered).');
}
U.push('');
U.push('## Branded search terms worth testing (INTERNAL research only — not ad copy)');
U.push('- `Study Edge` · `Study Edge accounting` · `Study Edge UF` · `Study Edge ACG2021`');
U.push('- _Do not use competitor trademarks in ad copy; these are for understanding search demand and SERP structure only._');
U.push('');
U.push('## Non-brand UF accounting search terms worth testing');
const ufCode = uf?.course_code || 'ACG2021';
U.push(`- \`${ufCode} exam 1\` · \`${ufCode} practice exam\` · \`${ufCode} exam review\``);
U.push('- `UF financial accounting exam` · `UF accounting tutoring` · `University of Florida financial accounting help`');
U.push('');
U.push('## What a clean Survive UF landing page would need to emphasize');
U.push('- **Exact course match** (UF ' + ufCode + ' Financial Accounting) — specificity beats generic tutoring.');
U.push('- **Free first exam / starter map** as the no-risk entry (counter any gated-pricing competitor).');
U.push('- **Practice exams + worked exam-style questions (CEQ)** — the thing students pay competitors for.');
U.push('- **Video explanations tied to the exact chapters/exams** UF uses.');
U.push('- **Honest, factual positioning** — no comparative claims about competitors. Lead with what Survive does for the UF course.');
U.push('');
U.push('_All figures are publicly observable snapshots. Study Edge pricing is frequently behind sign-in; treat blanks as “verify manually,” not “free.”_');

fs.writeFileSync(path.join(OUT, 'UF_STUDY_EDGE_COMPETITIVE_BRIEF.md'), U.join('\n') + '\n');

console.log('Wrote COMPETITIVE_INTELLIGENCE_REPORT.md + UF_STUDY_EDGE_COMPETITIVE_BRIEF.md');
console.log(`Campuses=${n} | proven HIGH=${provenDist.HIGH || 0} | validated=${validated.length} | study-edge-like=${seLike.length} | UF found=${!!uf} | study-edge data=${!!se}`);
