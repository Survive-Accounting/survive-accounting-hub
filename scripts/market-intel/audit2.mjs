import { selectAll, columns, count } from './_db.mjs';

// --- Campus universe profile ---
const campuses = await selectAll('campuses', {
  select: 'id,name,state,country,status,approval_status,is_active,ready_for_outreach,outreach_status,ipeds_unitid,undergrad_enrollment,total_enrollment,enrollment_source_year,greek_eligibility,is_research_only,campus_resolution_status,parent_system_id',
});
console.log('TOTAL campuses:', campuses.length);
const tally = (f) => {
  const m = {};
  for (const c of campuses) { const k = String(f(c)); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
console.log('\nstatus:', JSON.stringify(tally((c) => c.status)));
console.log('approval_status:', JSON.stringify(tally((c) => c.approval_status)));
console.log('is_active:', JSON.stringify(tally((c) => c.is_active)));
console.log('ready_for_outreach:', JSON.stringify(tally((c) => c.ready_for_outreach)));
console.log('country:', JSON.stringify(tally((c) => c.country).slice(0, 5)));
console.log('is_research_only:', JSON.stringify(tally((c) => c.is_research_only)));
console.log('campus_resolution_status:', JSON.stringify(tally((c) => c.campus_resolution_status)));

const hasIpeds = campuses.filter((c) => c.ipeds_unitid != null && String(c.ipeds_unitid).trim() !== '');
const hasEnroll = campuses.filter((c) => c.undergrad_enrollment != null);
console.log('\nWITH ipeds_unitid:', hasIpeds.length, '/', campuses.length);
console.log('WITH undergrad_enrollment:', hasEnroll.length);
console.log('enrollment_source_year:', JSON.stringify(tally((c) => c.enrollment_source_year).slice(0, 12)));
console.log('greek_eligibility:', JSON.stringify(tally((c) => c.greek_eligibility)));

// US, active-ish universe candidates
const usActive = campuses.filter((c) => (c.country === 'United States' || c.country === 'USA' || !c.country) && c.is_active !== false);
console.log('\nUS & is_active!=false:', usActive.length);
console.log('US & is_active!=false & !research_only:', usActive.filter((c) => !c.is_research_only).length);

// --- Related intelligence/demand tables ---
for (const t of ['campus_tam_estimates', 'campus_intelligence', 'campus_council_contacts', 'campus_council_status', 'campus_phone_numbers', 'growth_business_clubs', 'growth_public_contacts', 'school_demand_log', 'landing_page_events', 'landing_page_leads', 'expand_events', 'practice_attempts', 'student_set_progress', 'chapter_share_events', 'campus_landing_pages', 'campus_context']) {
  try {
    const cols = await columns(t);
    const c = await count(t);
    console.log(`\n## ${t} (rows=${c})\n   ${cols ? cols.join(', ') : 'n/a'}`);
  } catch (e) { console.log(`\n## ${t}: ERR ${e.message.slice(0, 60)}`); }
}
