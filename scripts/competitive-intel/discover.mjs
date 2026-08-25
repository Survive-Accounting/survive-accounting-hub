// Competitive discovery — SERP-only pass (fast, resumable, yield-tracked).
// For each campus: run tiered discovery queries, capture organic competitors AND
// sponsored ads, classify, and checkpoint. Public search results only.
//
// Usage:
//   node discover.mjs                 # all campuses, ranked by Market Opportunity
//   node discover.mjs --max=20        # first 20 (smoke test)
//   node discover.mjs --tier=1        # only tier-1 campuses
//   node discover.mjs --from=1 --to=150
//   node discover.mjs --serpBudget=4000   # stop after N live searches this run
import fs from 'node:fs';
import path from 'node:path';
import {
  serp, classifyHost, campusSignals, mentionsCampus, mentionsCourse,
  mentionsAccounting, detectOfferings, hostOf, registrable, isCourseSpecificSite,
  hasHelpIntent, newCounters, estCost, SERP_STATE, flushCaches, now, sleep, DATA,
} from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2] === '' ? true : m[2]];
}));

const COMP_FILE = path.join(DATA, 'competitors.json');
const YIELD_FILE = path.join(DATA, 'serp-yield.json');
const PROG_FILE = path.join(DATA, 'discover-progress.json');

if (args.cacheOnly) SERP_STATE.cacheOnly = true;
const universe = JSON.parse(fs.readFileSync(path.join(DATA, 'universe.json'), 'utf8'));
const results = fs.existsSync(COMP_FILE) ? JSON.parse(fs.readFileSync(COMP_FILE, 'utf8')) : {};
const yieldStats = fs.existsSync(YIELD_FILE) ? JSON.parse(fs.readFileSync(YIELD_FILE, 'utf8')) : {};
const counters = newCounters();

function saveAll() {
  fs.writeFileSync(COMP_FILE + '.tmp', JSON.stringify(results));
  fs.renameSync(COMP_FILE + '.tmp', COMP_FILE);
  fs.writeFileSync(YIELD_FILE, JSON.stringify(yieldStats, null, 2));
  flushCaches(true);
}
const bumpYield = (fam, patch) => {
  const y = (yieldStats[fam] ??= { searches: 0, useful_results: 0, new_competitors: 0, new_acct_competitors: 0, ads_seen: 0 });
  for (const [k, v] of Object.entries(patch)) y[k] = (y[k] || 0) + v;
};

// ── Query families per tier ───────────────────────────────────────────────────
function queriesFor(u) {
  const school = `"${u.name}"`;
  const code = u.intro1_code;
  const alpha = code && /[a-zA-Z]{2,}/.test(code);
  const cq = (suffix) => (!code ? null : alpha ? `"${code}" ${suffix}` : `${school} "${code}" ${suffix}`);
  const list = [];
  const add = (family, q) => { if (q) list.push({ family, q }); };

  // Light (all tiers)
  add('school_acct_tutoring', `${school} accounting tutoring`);
  add('school_exam_review', `${school} accounting exam review`);
  add('course_tutoring', cq('tutoring'));

  if (u.tier <= 2) {
    add('fin_acct_tutoring', `${school} financial accounting tutoring`);
    add('school_study_guide', `${school} accounting study guide`);
    add('course_exam_review', cq('exam review'));
    add('paid_tutoring', `paid tutoring ${school} accounting`);
  }
  if (u.tier === 1) {
    add('school_exam_prep', `${school} accounting exam prep`);
    add('school_review_videos', `${school} accounting review videos`);
    add('school_practice_exam', `${school} accounting practice exam`);
    add('course_practice_exam', cq('practice exam'));
    // Commercial-intent ad-probe queries (organic + sponsored capture)
    if (code) { add('ad_probe_course_acct', `${code} accounting`); add('ad_probe_course_tutoring', `${code} tutoring`); }
  }
  return list;
}

// Lazily learn this campus's own .edu domain from organic results (free).
function learnDomain(u, organic) {
  if (u.domain) return u.domain;
  const sig = campusSignals(u);
  for (const r of organic) {
    const h = hostOf(r.link);
    if (h.endsWith('.edu') && mentionsCampus(h.replace(/\.edu$/, '').replace(/[.-]/g, ' '), sig)) {
      u.domain = registrable(h); return u.domain;
    }
  }
  return null;
}

const NAME_RX = /\b(prof(?:essor)?\.?\s+[A-Z][a-z]+|dr\.?\s+[A-Z][a-z]+|with\s+[A-Z][a-z]+\s+[A-Z][a-z]+'s)\b/;
const LOCAL_TYPES = new Set(['LOCAL_CAMPUS_TUTORING', 'COURSE_SPECIFIC_SITE', 'INDIVIDUAL_OR_LOCAL', 'MULTI_CAMPUS_TUTORING']);

async function discoverCampus(u) {
  const sig = campusSignals(u);
  const queries = queriesFor(u);
  const competitors = {}; // regDomain -> row
  const ads = [];
  let universityFree = false, foreignEduSeen = 0;
  const signalDomains = new Set();
  let searches = 0;
  const familiesRun = {};

  const acctFamily = (fam) => /course_|fin_acct|acct|review|prep|guide|tutoring|practice/.test(fam) && !/^ad_probe/.test(fam);

  const upsert = (reg, cls, url, { sponsored = false } = {}) => (competitors[reg] ??= {
    domain: reg, brand: cls.brand || null, kind: cls.kind, type: cls.type || null,
    first_url: url, titles: [], snippets: [],
    accounting: false, acct_via_query: false, campus_specific: false, professor_specific: false,
    course_specific_site: false, offerings: {}, families: new Set(), positions: [], sponsored,
  });

  for (const { family, q } of queries) {
    if (SERP_STATE.dead) break;
    const liveBefore = counters.serp;
    const res = await serp(q, counters, { num: 8 });
    const wasCached = counters.serp === liveBefore;
    if (res.dead) break;
    searches++;
    familiesRun[family] = (familiesRun[family] || 0) + 1;
    const wasLive = !res.error && res.retrieved_at;
    bumpYield(family, { searches: 1 });
    learnDomain(u, res.organic);

    let useful = 0;
    // Organic competitors
    for (const r of res.organic) {
      const host = hostOf(r.link);
      const reg = registrable(host);
      const cls = classifyHost(host, u.domain);
      if (cls.kind === 'university_free') { if (!cls.foreign) universityFree = true; else foreignEduSeen++; continue; }
      if (cls.kind === 'skip' || cls.kind === 'self') continue;
      if (cls.kind === 'signal') { signalDomains.add(reg); continue; }
      // brand or candidate = competitor
      const titleUrl = `${r.title} ${r.displayed_link} ${r.link}`;
      const blob = `${r.title} ${r.snippet}`;
      // Intent gate: unknown candidate must show academic-help intent or be course-specific.
      if (cls.kind === 'candidate' && !isCourseSpecificSite(host, r.link, u.intro1_code) && !hasHelpIntent(blob)) continue;
      const campusHit = mentionsCampus(r.title, sig) || mentionsCampus(r.link, sig) || mentionsCourse(titleUrl, u.intro1_code);
      const off = detectOfferings(blob);
      const row = upsert(reg, cls, r.link);
      if (row.titles.length < 4 && r.title) row.titles.push(r.title);
      if (row.snippets.length < 4 && r.snippet) row.snippets.push(r.snippet);
      if (mentionsAccounting(blob)) row.accounting = true;
      else if (acctFamily(family)) row.acct_via_query = true;
      row.campus_specific = row.campus_specific || campusHit;
      row.course_specific_site = row.course_specific_site || isCourseSpecificSite(host, r.link, u.intro1_code);
      row.professor_specific = row.professor_specific || NAME_RX.test(blob);
      for (const [k, v] of Object.entries(off)) if (v) row.offerings[k] = true;
      row.families.add(family);
      if (r.position) row.positions.push(r.position);
      useful++;
    }
    // Sponsored ads (record ALL; classify advertiser)
    for (const a of res.ads) {
      const host = hostOf(a.link) || hostOf(a.displayed_link) || (a.displayed_link || '').toLowerCase();
      const reg = host.includes('.') ? registrable(host) : host;
      const cls = classifyHost(host, u.domain);
      ads.push({
        query: q, family, advertiser: cls.brand || reg || a.displayed_link || 'unknown',
        display_domain: a.displayed_link || reg, headline: a.title, description: a.description,
        link: a.link, block: a.block, kind: cls.kind, type: cls.type || null, retrieved_at: res.retrieved_at,
      });
      bumpYield(family, { ads_seen: 1 });
      if (cls.kind === 'candidate' && !isCourseSpecificSite(host, a.link, u.intro1_code) && !hasHelpIntent(`${a.title} ${a.description}`)) { /* non-help advertiser: recorded as ad only */ }
      else if (cls.kind === 'candidate' || cls.kind === 'brand') {
        const row = upsert(reg, cls, a.link, { sponsored: true });
        row.sponsored = true;
        const blob = `${a.title} ${a.description}`;
        if (mentionsAccounting(blob)) row.accounting = true;
        row.campus_specific = row.campus_specific || mentionsCampus(a.title, sig) || mentionsCourse(a.title, u.intro1_code);
        row.course_specific_site = row.course_specific_site || isCourseSpecificSite(host, a.link, u.intro1_code);
        row.families.add(family + '(ad)');
      }
    }
    if (wasLive) bumpYield(family, { useful_results: useful });
    if (!wasCached) await sleep(150);
  }

  // Finalize competitor rows.
  const compList = Object.values(competitors).map((r) => {
    const acctVal = r.accounting ? 'YES' : r.acct_via_query ? 'LIKELY' : 'UNKNOWN';
    let type;
    if (r.type) type = r.type;                                       // known brand's type wins
    else if (r.course_specific_site) type = 'COURSE_SPECIFIC_SITE';  // unknown course-code site
    else if (r.campus_specific) type = 'LOCAL_CAMPUS_TUTORING';
    else type = 'INDIVIDUAL_OR_LOCAL';
    return {
      domain: r.domain, brand: r.brand, competitor_type: type, source_kind: r.kind,
      intro_accounting_supported: acctVal,
      campus_specific: (r.campus_specific || r.course_specific_site) ? 'YES' : 'UNKNOWN',
      professor_specific: r.professor_specific ? 'YES' : 'UNKNOWN',
      course_specific_site: r.course_specific_site,
      sponsored: r.sponsored,
      offerings: Object.keys(r.offerings),
      families: [...r.families],
      title_sample: r.titles[0] || '',
      snippet_sample: r.snippets[0] || '',
      source_url: r.first_url,
    };
  });
  // Yield: new competitors / acct competitors discovered per family (first-seen family).
  for (const c of compList) {
    const fam = c.families[0] || 'unknown';
    bumpYield(fam.replace(/\(ad\)$/, ''), { new_competitors: 1, new_acct_competitors: (c.intro_accounting_supported === 'YES' ? 1 : 0) });
  }

  return {
    campus_id: u.campus_id, campus: u.name, state: u.state, tier: u.tier,
    market_opportunity: u.market_opportunity, intro1_code: u.intro1_code || null,
    domain: u.domain || null, searches, families_run: familiesRun,
    university_free_support: universityFree, foreign_edu_seen: foreignEduSeen,
    signal_domains: [...signalDomains],
    competitors: compList, ads,
    paid_competitors: compList.length,
    intro1_competitors: compList.filter((c) => c.intro_accounting_supported === 'YES').length,
    local_competitors: compList.filter((c) => LOCAL_TYPES.has(c.competitor_type)).length,
    course_specific_competitors: compList.filter((c) => c.competitor_type === 'COURSE_SPECIFIC_SITE').length,
    done: true, retrieved_at: now(),
  };
}

async function main() {
  let list = universe;
  if (args.tier) list = list.filter((u) => String(u.tier) === String(args.tier));
  if (args.from) list = list.filter((u) => u.rank >= Number(args.from));
  if (args.to) list = list.filter((u) => u.rank <= Number(args.to));
  if (args.max) list = list.slice(0, Number(args.max));
  const force = !!args.force;
  const serpBudget = args.serpBudget ? Number(args.serpBudget) : Infinity;

  const todo = list.filter((u) => force || !results[u.campus_id]?.done);
  const CONC = args.concurrency ? Number(args.concurrency) : 4;
  console.log(`Discovery: ${todo.length}/${list.length} campuses to process (${Object.keys(results).length} already done). concurrency=${CONC} SERP budget=${serpBudget === Infinity ? '∞' : serpBudget}`);

  let processed = 0, idx = 0;
  async function worker() {
    while (idx < todo.length) {
      if (SERP_STATE.dead) return;
      if (counters.serp >= serpBudget) return;
      const u = todo[idx++];
      const r = await discoverCampus(u);
      results[u.campus_id] = r;
      processed++;
      if (processed % 5 === 0 || processed === todo.length) {
        saveAll();
        console.log(`[${processed}/${todo.length}] rank ${u.rank} ${u.name} (${u.state}) T${u.tier} MO=${u.market_opportunity} → ${r.paid_competitors} comp (${r.intro1_competitors} acct, ${r.local_competitors} local), ${r.ads.length} ads | live serp=${counters.serp} cached=${counters.serpCached} rl=${SERP_STATE.rateLimited} $${estCost(counters)}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, () => worker()));
  if (SERP_STATE.dead) console.log(`\n⚠ SERP credits exhausted: ${SERP_STATE.lastError}. Stopped gracefully.`);
  saveAll();
  fs.writeFileSync(PROG_FILE, JSON.stringify({
    processedThisRun: processed, totalDone: Object.values(results).filter((r) => r.done).length,
    serpLive: counters.serp, serpCached: counters.serpCached, cost: estCost(counters),
    serpDead: SERP_STATE.dead, serpError: SERP_STATE.lastError, at: now(),
  }, null, 2));
  console.log(`\nDone. processed=${processed} totalDone=${Object.values(results).filter((r) => r.done).length} liveSerp=${counters.serp} cachedSerp=${counters.serpCached} cost=$${estCost(counters)} serpDead=${SERP_STATE.dead}`);
}
main().catch((e) => { console.error(e); saveAll(); process.exit(1); });
