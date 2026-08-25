import { columns, count, selectAll } from './_db.mjs';

console.log('=== campus_market_intelligence ===', await count('campus_market_intelligence'));
console.log((await columns('campus_market_intelligence'))?.join(', '));

// Sample campuses with intro course codes + domains
const rows = await selectAll('campuses', {
  select: 'id,name,state,domains,email_domain,website_url,short_name,display_name,aliases,course_family_codes_json,course_family_titles_json,is_sec,ready_for_outreach,market_priority,is_active,is_research_only',
  filter: 'is_active=eq.true',
});
console.log('\nactive campuses:', rows.length);
let withIntro = 0, withDomain = 0, withSec = 0, ready = 0, researchOnly = 0;
for (const r of rows) {
  const cf = r.course_family_codes_json || {};
  const intro = cf.intro_1 || cf.intro1 || cf['intro-1'];
  if (intro) withIntro++;
  if ((Array.isArray(r.domains) && r.domains.length) || r.email_domain || r.website_url) withDomain++;
  if (r.is_sec) withSec++;
  if (r.ready_for_outreach) ready++;
  if (r.is_research_only) researchOnly++;
}
console.log({ withIntro, withDomain, withSec, ready, researchOnly });

// show 5 examples of intro codes
console.log('\n=== sample intro_1 codes ===');
let shown = 0;
for (const r of rows) {
  const cf = r.course_family_codes_json || {};
  const intro = cf.intro_1 || cf.intro1;
  if (intro && shown < 8) {
    console.log(`${r.name} (${r.state}) domains=${JSON.stringify(r.domains)} email=${r.email_domain} intro_1=${JSON.stringify(intro)}`);
    shown++;
  }
}
console.log('\n=== sample course_family_codes_json shape ===');
const ex = rows.find((r) => r.course_family_codes_json && Object.keys(r.course_family_codes_json).length);
console.log(JSON.stringify(ex?.course_family_codes_json, null, 2));
