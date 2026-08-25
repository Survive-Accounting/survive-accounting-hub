// Enrichment pass: scrape the strongest LOCAL / COURSE-SPECIFIC competitor sites to
// extract public pricing, free-trial mechanism, and offerings. Public pages only;
// pricing is verbatim from the page. Writes data/enrichment.json keyed by domain,
// which emit.mjs merges into competitor rows. Bounded + cached (never re-scrapes).
//
//   node enrich.mjs               # default cap 90 domains
//   node enrich.mjs --cap=150
import fs from 'node:fs';
import path from 'node:path';
import { scrape, aiJson, extractPrices, hasFreeTrial, hasSubscription, detectOfferings, newCounters, estCost, now, sleep, DATA } from './lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=?(.*)$/); return [m[1], m[2] === '' ? true : m[2]]; }));
const CAP = args.cap ? Number(args.cap) : 90;
const c = newCounters();
const ENR = path.join(DATA, 'enrichment.json');
const enrichment = fs.existsSync(ENR) ? JSON.parse(fs.readFileSync(ENR, 'utf8')) : {};
const competitors = JSON.parse(fs.readFileSync(path.join(DATA, 'competitors.json'), 'utf8'));

// Build global domain registry of enrichable competitors (local / course-specific /
// campus-specific exam-prep). Skip giant nationals (pricing well-known / irrelevant).
const ENRICH_TYPES = new Set(['COURSE_SPECIFIC_SITE', 'LOCAL_CAMPUS_TUTORING', 'MULTI_CAMPUS_TUTORING', 'EXAM_PREP_PLATFORM']);
const reg = new Map();
for (const r of Object.values(competitors)) {
  for (const x of r.competitors || []) {
    if (!ENRICH_TYPES.has(x.competitor_type)) continue;
    const g = reg.get(x.domain) ?? { domain: x.domain, brand: x.brand, url: x.source_url, campuses: 0, courseSpecific: false, offerings: new Set() };
    g.campuses++; g.courseSpecific = g.courseSpecific || x.course_specific_site;
    for (const o of x.offerings || []) g.offerings.add(o);
    if (!g.url) g.url = x.source_url;
    reg.set(x.domain, g);
  }
}
// Priority: course-specific first, then broad footprint.
const targets = [...reg.values()]
  .sort((a, b) => (b.courseSpecific ? 1 : 0) - (a.courseSpecific ? 1 : 0) || b.campuses - a.campuses)
  .filter((g) => !enrichment[g.domain])
  .slice(0, CAP);

console.log(`Enrichment: ${targets.length} competitor domains to scrape (cap ${CAP}); ${Object.keys(enrichment).length} already enriched.`);

const PROMPT = (brand, md) => `PUBLIC marketing page for the paid academic-support site "${brand}". Extract ONLY facts on the page. Return ONLY JSON:
{"pricing_model":"subscription|per-exam|per-course|one-time|free|unknown","prices":["$X/mo",...],"free_trial":"describe free trial/free content or empty","offerings":{"video_reviews":T/F,"practice_exams":T/F,"exam_reviews":T/F,"live_reviews":T/F,"one_on_one":T/F,"study_guides":T/F},"accounting_supported":"YES|NO|UNKNOWN","professor_specific":"YES|NO|UNKNOWN","campuses":["..."]}
RULES: only page-present values; never invent prices. TEXT:\n\n${md.slice(0, 20000)}`;

async function main() {
  let done = 0;
  for (const g of targets) {
    const url = g.url && /^https?:\/\//.test(g.url) ? g.url : `https://${g.domain}`;
    let md = await scrape(url, c);
    // try a pricing page if homepage thin
    if ((!md || md.length < 400)) { const alt = await scrape(`https://${g.domain}/pricing`, c); if (alt && alt.length > (md?.length || 0)) md = alt; }
    if (!md || md.length < 200) { enrichment[g.domain] = { domain: g.domain, scraped: false, retrieved_at: now() }; done++; continue; }
    const prices = extractPrices(md);
    const ai = await aiJson(PROMPT(g.brand || g.domain, md), c);
    const off = ai?.offerings || detectOfferings(md);
    enrichment[g.domain] = {
      domain: g.domain, brand: g.brand || null, scraped: true, url,
      pricing_model: ai?.pricing_model || (hasSubscription(md) ? 'subscription' : 'unknown'),
      price: (ai?.prices?.length ? ai.prices : prices).slice(0, 8).join('; '),
      free_trial: ai?.free_trial || (hasFreeTrial(md) ? 'free content/preview present' : ''),
      free_content: hasFreeTrial(md) ? 'YES' : '',
      offerings: Object.entries(off).filter(([, v]) => v).map(([k]) => k.replace('video_reviews', 'video_content')),
      accounting_supported: ai?.accounting_supported || 'UNKNOWN',
      professor_specific: ai?.professor_specific || 'UNKNOWN',
      campuses_named: (ai?.campuses || []).slice(0, 10),
      retrieved_at: now(),
    };
    done++;
    if (done % 10 === 0) { fs.writeFileSync(ENR, JSON.stringify(enrichment, null, 2)); console.log(`  [${done}/${targets.length}] scrapes=${c.firecrawl} ai=${c.ai} $${estCost(c)}`); }
    await sleep(120);
  }
  fs.writeFileSync(ENR, JSON.stringify(enrichment, null, 2));
  const withPrice = Object.values(enrichment).filter((e) => e.price).length;
  console.log(`\nEnrichment done. domains=${Object.keys(enrichment).length} withPrice=${withPrice} scrapes=${c.firecrawl}(+${c.fcCached} cached) ai=${c.ai} cost=$${estCost(c)}`);
}
main().catch((e) => { console.error(e); fs.writeFileSync(ENR, JSON.stringify(enrichment, null, 2)); process.exit(1); });
