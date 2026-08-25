// Build the ranked target-campus universe for competitive discovery.
// Source of truth for Market Opportunity = the market-intel CSV (fully computed).
// Enriched with DB campus attributes (domain, Intro-1 course code, aliases, SEC).
import fs from 'node:fs';
import path from 'node:path';
import { selectAll } from './_db.mjs';
import { parseCsv, introCode, DATA } from './lib.mjs';

const MI_CSV = 'C:/Users/lee/Documents/sa-market-intel/market-intel-output/CAMPUS_MARKET_INTELLIGENCE.csv';

const num = (v) => (v === '' || v == null ? null : Number(v));

async function main() {
  // 1. Market Opportunity per campus (from CSV).
  let mi = [];
  if (fs.existsSync(MI_CSV)) {
    mi = parseCsv(fs.readFileSync(MI_CSV, 'utf8'));
    console.log(`Loaded ${mi.length} scored campuses from market-intel CSV.`);
  } else {
    console.warn('market-intel CSV not found; falling back to DB order only.');
  }
  const miById = new Map(mi.map((r) => [r.campus_id, r]));

  // 2. DB campus attributes.
  const campuses = await selectAll('campuses', {
    select: [
      'id', 'name', 'short_name', 'display_name', 'aliases', 'state', 'domains', 'email_domain',
      'website_url', 'course_family_codes_json', 'course_family_titles_json', 'is_sec',
      'is_active', 'is_research_only', 'ready_for_outreach', 'undergrad_enrollment', 'slug',
    ].join(','),
  });
  const byId = new Map(campuses.map((c) => [c.id, c]));
  console.log(`Loaded ${campuses.length} campuses from DB.`);

  // 3. Build universe: prefer campuses that have a MO score; enrich with DB.
  const universe = [];
  const seen = new Set();
  const domainOf = (c) => {
    if (Array.isArray(c.domains) && c.domains.length) return String(c.domains[0]).replace(/^www\./, '').toLowerCase();
    if (c.email_domain) return String(c.email_domain).replace(/^@/, '').replace(/^www\./, '').toLowerCase();
    if (c.website_url) { try { return new URL(c.website_url.startsWith('http') ? c.website_url : 'https://' + c.website_url).hostname.replace(/^www\./, '').toLowerCase(); } catch { /**/ } }
    return null;
  };

  for (const r of mi) {
    const c = byId.get(r.campus_id);
    if (!c) continue;
    seen.add(r.campus_id);
    universe.push({
      campus_id: r.campus_id,
      name: c.name,
      short_name: c.short_name || null,
      display_name: c.display_name || null,
      aliases: c.aliases || null,
      state: c.state || r.state || null,
      domain: domainOf(c),
      intro1_code: introCode(c),
      is_sec: !!c.is_sec,
      undergrad_enrollment: num(r.undergrad_enrollment) || c.undergrad_enrollment || null,
      market_opportunity: num(r.market_opportunity_score),
      outreach_priority: num(r.outreach_priority_score),
      business_bachelors: num(r.business_bachelors),
      estimated_intro1_annual: num(r.estimated_intro1_annual),
      course_family_codes_json: c.course_family_codes_json || null,
      course_family_titles_json: c.course_family_titles_json || null,
    });
  }

  // Rank by Market Opportunity desc (nulls last), then undergrad enrollment.
  universe.sort((a, b) => {
    const ao = a.market_opportunity ?? -1, bo = b.market_opportunity ?? -1;
    if (bo !== ao) return bo - ao;
    return (b.undergrad_enrollment ?? 0) - (a.undergrad_enrollment ?? 0);
  });

  // Assign tiers by rank for discovery depth.
  universe.forEach((u, i) => {
    u.rank = i + 1;
    u.tier = i < 150 ? 1 : i < 500 ? 2 : 3;
  });

  fs.writeFileSync(path.join(DATA, 'universe.json'), JSON.stringify(universe, null, 2));
  const withIntro = universe.filter((u) => u.intro1_code).length;
  const withDomain = universe.filter((u) => u.domain).length;
  console.log(`Universe: ${universe.length} campuses | intro1_code: ${withIntro} | domain: ${withDomain} | SEC: ${universe.filter((u) => u.is_sec).length}`);
  console.log(`Tiers: T1=${universe.filter((u) => u.tier === 1).length} T2=${universe.filter((u) => u.tier === 2).length} T3=${universe.filter((u) => u.tier === 3).length}`);
  console.log('Top 10 by Market Opportunity:');
  for (const u of universe.slice(0, 10)) console.log(`  ${u.rank}. ${u.name} (${u.state}) MO=${u.market_opportunity} intro1=${u.intro1_code || '-'} domain=${u.domain || '-'}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
