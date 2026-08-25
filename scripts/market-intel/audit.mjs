import { listTables, columns, count } from './_db.mjs';

const tables = await listTables();
console.log('=== ALL TABLES/VIEWS (' + tables.length + ') ===');
console.log(tables.sort().join('\n'));

const focus = [
  'campuses', 'campus_systems', 'greek_chapters', 'campus_greek_chapters',
  'greek_orgs', 'greek_councils', 'growth_contacts', 'growth_roles',
  'growth_outreach_events', 'campus_waitlist', 'landing_events',
  'runs', 'student_entitlements', 'orders',
];
for (const t of focus) {
  if (!tables.includes(t)) { console.log(`\n## ${t}: (not present)`); continue; }
  const cols = await columns(t);
  let c = '?';
  try { c = await count(t); } catch (e) { c = 'err:' + e.message.slice(0, 40); }
  console.log(`\n## ${t}  (rows=${c})`);
  console.log('   cols: ' + (cols ? cols.join(', ') : 'n/a'));
}
