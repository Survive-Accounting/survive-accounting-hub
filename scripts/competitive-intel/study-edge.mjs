// Deep Study Edge (+ campus-specific analog) research. Public pages only.
// Captures publicly observable offerings, pricing, free-trial mechanism, campuses,
// courses, and accounting coverage for the UF competitive brief and the nationwide
// "Study-Edge-like" analysis.
import fs from 'node:fs';
import path from 'node:path';
import { serp, scrape, aiJson, hostOf, registrable, extractPrices, hasFreeTrial, hasSubscription, detectOfferings, newCounters, estCost, SERP_STATE, now, sleep, DATA } from './lib.mjs';

const c = newCounters();
const OUT = path.join(DATA, 'study-edge.json');
const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

// Brands to research deeply: Study Edge + strongest campus-specific analogs seen in discovery.
const SEEDS = [
  { key: 'studyedge', name: 'Study Edge', queries: [
    'Study Edge accounting', 'Study Edge financial accounting', 'Study Edge University of Florida accounting',
    'Study Edge ACG2021', 'Study Edge pricing cost', 'Study Edge exam review', 'Study Edge free trial',
    'Study Edge practice exam', 'site:studyedge.com accounting', 'Study Edge UF classes', 'Study Edge FSU',
    'Study Edge UCF', 'Study Edge subscription monthly', 'studyedge.com',
  ], homepages: ['https://studyedge.com', 'https://www.studyedge.com', 'https://studyedge.com/accounting', 'https://studyedge.com/classes', 'https://studyedge.com/pricing'] },
];

// Pull course-specific analog domains discovered in the main run (ac210ua.com, acct2101uga.com…).
function discoveredAnalogs() {
  const comp = fs.existsSync(path.join(DATA, 'competitors.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'competitors.json'), 'utf8')) : {};
  const seen = new Map();
  for (const r of Object.values(comp)) {
    for (const x of r.competitors || []) {
      if (x.course_specific_site && x.competitor_type === 'COURSE_SPECIFIC_SITE') {
        const g = seen.get(x.domain) ?? { domain: x.domain, campuses: [], url: x.source_url, offerings: new Set() };
        g.campuses.push(r.campus); for (const o of x.offerings || []) g.offerings.add(o);
        seen.set(x.domain, g);
      }
    }
  }
  return [...seen.values()].sort((a, b) => b.campuses.length - a.campuses.length).slice(0, 8);
}

const EXTRACT_PROMPT = (brand, md) => `You are analyzing the PUBLIC marketing page of "${brand}", a paid academic-support company. From the page text below, extract ONLY facts stated on the page. Return ONLY a JSON object:
{
 "one_line": "what the company sells, one sentence",
 "courses_supported": ["..."],
 "accounting_supported": "YES|NO|UNKNOWN",
 "accounting_courses": ["financial accounting","ACG2021", ...],
 "campuses": ["University of Florida", ...],
 "professors_named": ["..."],
 "pricing": ["$X/month","$Y per semester", ...],
 "pricing_model": "subscription|per-exam|per-course|one-time|unknown",
 "free_trial": "describe any free trial / free first content / free preview, or empty",
 "offerings": {"video_reviews":true/false,"practice_exams":true/false,"exam_reviews":true/false,"live_reviews":true/false,"one_on_one":true/false,"study_guides":true/false,"chapter_reviews":true/false},
 "campus_specific_pages": "YES|NO|UNKNOWN",
 "student_positioning": "how they pitch to students, one sentence"
}
RULES: Only include values present in the text. Use empty/UNKNOWN when unstated. Never invent pricing.
PAGE TEXT:\n\n${md.slice(0, 24000)}`;

async function researchBrand(seed) {
  console.log(`\n=== ${seed.name} ===`);
  const pages = new Map();
  for (const h of seed.homepages || []) pages.set(h, 'homepage');
  for (const q of seed.queries || []) {
    if (SERP_STATE.dead) break;
    const res = await serp(q, c, { num: 8 });
    for (const r of res.organic.slice(0, 5)) {
      const host = hostOf(r.link);
      if (registrable(host).includes(seed.key) || host.includes(seed.key)) pages.set(r.link, 'serp');
    }
    // capture any ads for the brand terms too
    await sleep(150);
  }
  const scraped = [];
  let count = 0;
  for (const [url] of pages) {
    if (count >= 8) break;
    const md = await scrape(url, c);
    if (md && md.length > 200) { scraped.push({ url, md }); count++; }
    await sleep(150);
  }
  // AI-extract from the richest pages (homepage + accounting/pricing).
  const facts = [];
  const pick = scraped.sort((a, b) => b.md.length - a.md.length).slice(0, 4);
  for (const p of pick) {
    const f = await aiJson(EXTRACT_PROMPT(seed.name, p.md), c);
    if (f) facts.push({ url: p.url, ...f });
  }
  // Merge naive heuristics from raw text as backstop.
  const allText = scraped.map((s) => s.md).join('\n').slice(0, 60000);
  return {
    name: seed.name, key: seed.key, pages_scraped: scraped.map((s) => s.url),
    facts, heuristic_prices: extractPrices(allText).slice(0, 15),
    heuristic_free_trial: hasFreeTrial(allText), heuristic_subscription: hasSubscription(allText),
    heuristic_offerings: detectOfferings(allText), retrieved_at: now(),
  };
}

async function main() {
  const analogArg = process.argv.includes('--analogs');
  const out = existing;
  for (const seed of SEEDS) out[seed.key] = await researchBrand(seed);

  if (analogArg) {
    const analogs = discoveredAnalogs();
    out._analogs = [];
    for (const a of analogs.slice(0, 5)) {
      if (SERP_STATE.dead) break;
      const seed = { key: a.domain.split('.')[0], name: a.domain, queries: [], homepages: [`https://${a.domain}`, `https://www.${a.domain}`] };
      const res = await researchBrand(seed);
      out._analogs.push({ ...res, campuses: a.campuses, offerings_seen: [...a.offerings] });
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`\nStudy Edge research done. liveSerp=${c.serp} cachedSerp=${c.serpCached} scrapes=${c.firecrawl} ai=${c.ai} cost=$${estCost(c)} serpDead=${SERP_STATE.dead}`);
  const se = out.studyedge;
  console.log(`Study Edge: ${se.pages_scraped.length} pages scraped, ${se.facts.length} extractions, prices=${JSON.stringify(se.heuristic_prices.slice(0, 6))}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
