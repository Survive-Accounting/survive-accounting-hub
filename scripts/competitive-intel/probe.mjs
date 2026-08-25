// One-off DB schema probe for competitive-intel. Read-only.
import { listTables, columns, selectAll, count } from './_db.mjs';

const tables = await listTables();
const interesting = tables.filter((t) =>
  /campus|course|competitor|market|domain|professor|prof|intro|greek_org|council|demand|section|program|textbook/i.test(t),
);
console.log('=== Tables of interest ===');
console.log(interesting.join('\n'));

console.log('\n=== campuses columns ===');
console.log((await columns('campuses'))?.join(', '));

for (const t of ['campus_courses', 'courses', 'course_sections', 'campus_intro_courses', 'program_courses', 'campus_programs']) {
  const cols = await columns(t);
  if (cols) console.log(`\n=== ${t} columns ===\n${cols.join(', ')}`);
}

// Any competitor table already?
console.log('\n=== competitor-ish tables ===');
console.log(tables.filter((t) => /competit|tutor|paid_market|serp/i.test(t)).join('\n') || '(none)');

console.log('\n=== campuses count ===', await count('campuses'));
