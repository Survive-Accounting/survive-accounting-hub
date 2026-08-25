import { selectAll } from './_db.mjs';

const tam = await selectAll('campus_tam_estimates', {
  select: 'campus_id,business_completions,accounting_completions,undergraduate_enrollment,total_enrollment,source_year,source_type,source_url,confidence_label,tam_score,tam_tier,tam_intro1_base,estimated_at',
});
console.log('== campus_tam_estimates', tam.length);
const yr = {}, st = {}, sy = {};
let withBiz = 0, withAcct = 0, withUnit = 0;
for (const r of tam) {
  yr[r.source_year] = (yr[r.source_year] || 0) + 1;
  st[r.source_type] = (st[r.source_type] || 0) + 1;
  if (r.business_completions != null) withBiz++;
  if (r.accounting_completions != null) withAcct++;
}
console.log('source_year:', JSON.stringify(yr));
console.log('source_type:', JSON.stringify(st));
console.log('with business_completions:', withBiz, ' with accounting_completions:', withAcct);
console.log('sample source_url:', [...new Set(tam.map(r => r.source_url).filter(Boolean))].slice(0, 5));
console.log('sample rows:');
for (const r of tam.slice(0, 4)) console.log('  ', JSON.stringify(r));

// how do these join to campuses & do they carry a UNITID?
const withYear = tam.filter(r => r.source_year);
console.log('\ntam rows with a source_year:', withYear.length);

const ci = await selectAll('campus_intelligence', {
  select: 'campus_id,campus_name,state,greek_presence_score,bap_presence_score,professor_signal_score,existing_signup_count,existing_paid_signup_count,tam_total_base,tam_score,tam_tier,priority_score,priority_tier,is_target_market,is_high_value_market,reddit_mentions',
});
console.log('\n== campus_intelligence', ci.length);
console.log('sample:', JSON.stringify(ci.slice(0, 3), null, 1));
const tgt = ci.filter(c => c.is_target_market).length;
console.log('is_target_market:', tgt, ' is_high_value_market:', ci.filter(c => c.is_high_value_market).length);

// council contacts / status coverage by campus
const cc = await selectAll('campus_council_contacts', { select: 'campus_id,council_type,role_inbox:contact_type,is_current' });
const ccByCampus = new Set(cc.map(r => r.campus_id));
console.log('\ncampus_council_contacts distinct campuses:', ccByCampus.size);
const cs = await selectAll('campus_council_status', { select: 'campus_id,council_type,status,contacts_found,role_inbox_found' });
console.log('campus_council_status distinct campuses:', new Set(cs.map(r => r.campus_id)).size);
console.log('council_status sample:', JSON.stringify(cs.slice(0, 4)));

// greek chapters per campus (counts)
const cgc = await selectAll('campus_greek_chapters', { select: 'campus_id,status,council' });
const byC = {};
for (const r of cgc) { if (r.status === 'archived') continue; byC[r.campus_id] = (byC[r.campus_id]||0)+1; }
const counts = Object.values(byC).sort((a,b)=>b-a);
console.log('\ncampus_greek_chapters (non-archived):', cgc.length, ' distinct campuses:', Object.keys(byC).length);
console.log('top chapter counts:', counts.slice(0,10), ' median:', counts[Math.floor(counts.length/2)]);
const councilVals = {};
for (const r of cgc) councilVals[String(r.council).toLowerCase().slice(0,20)] = (councilVals[String(r.council).toLowerCase().slice(0,20)]||0)+1;
console.log('council raw values (top):', Object.entries(councilVals).sort((a,b)=>b[1]-a[1]).slice(0,15));
