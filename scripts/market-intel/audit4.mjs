import { selectAll, columns } from './_db.mjs';

const clubs = await selectAll('growth_business_clubs', { select: 'campus_id,category,name' });
const catC = {}; for (const r of clubs) catC[r.category] = (catC[r.category] || 0) + 1;
console.log('growth_business_clubs categories:', JSON.stringify(catC), 'distinct campuses:', new Set(clubs.map(c => c.campus_id)).size);

const pub = await selectAll('growth_public_contacts', { select: 'campus_id,category,contact_type' });
const pc = {}; for (const r of pub) pc[r.category] = (pc[r.category] || 0) + 1;
console.log('growth_public_contacts categories:', JSON.stringify(pc), 'distinct campuses:', new Set(pub.map(c => c.campus_id)).size);

console.log('\ngreek_chapter_contacts cols:', (await columns('greek_chapter_contacts'))?.join(','));
const gcc = await selectAll('greek_chapter_contacts', { select: 'id,campus_greek_chapter_id,greek_chapter_id' }).catch(e => { console.log('gcc err', e.message.slice(0,80)); return []; });
console.log('greek_chapter_contacts rows:', gcc.length);

console.log('\ngreek_chapter_members cols:', (await columns('greek_chapter_members'))?.join(','));

// demand tables campus linkage
for (const t of ['landing_page_events', 'orders', 'student_entitlements', 'campus_waitlist', 'practice_attempts', 'chapter_purchase', 'chapter_seat_assignments']) {
  try {
    const rows = await selectAll(t, { select: '*' });
    const withCampus = rows.filter(r => r.campus_id).length;
    console.log(`${t}: ${rows.length} rows, with campus_id: ${withCampus}`);
  } catch (e) { console.log(`${t}: ${e.message.slice(0, 50)}`); }
}

// council contacts detail
const cs = await selectAll('campus_council_status', { select: 'campus_id,council_type,status,contacts_found,role_inbox_found' });
const byCampusCouncil = {};
for (const r of cs) { (byCampusCouncil[r.campus_id] ||= []).push(r); }
console.log('\ncouncil_status: campuses=', Object.keys(byCampusCouncil).length);
const withRoleInbox = cs.filter(r => r.role_inbox_found).length;
console.log('council rows with role_inbox_found=true:', withRoleInbox, '/', cs.length);
