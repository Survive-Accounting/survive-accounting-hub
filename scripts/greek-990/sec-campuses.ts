// Resolve the 16 SEC campuses to canonical campus ids and report chapter counts.
import { sql } from "./_db";

// Canonical name fragments to match against campuses.name / canonical_name / display_name / aliases.
const SEC = [
  "University of Alabama", "University of Arkansas", "Auburn University",
  "University of Florida", "University of Georgia", "University of Kentucky",
  "Louisiana State University", "Mississippi State University", "University of Missouri",
  "University of Oklahoma", "University of Mississippi", "University of South Carolina",
  "University of Tennessee", "University of Texas at Austin", "Texas A&M University",
  "Vanderbilt University",
];

for (const q of SEC) {
  const rows = await sql<any>(`
    select id, name, display_name, canonical_name, city, state
    from public.campuses
    where name ilike '%${q.replace(/'/g, "''")}%'
       or canonical_name ilike '%${q.replace(/'/g, "''")}%'
       or display_name ilike '%${q.replace(/'/g, "''")}%'
    order by (name = '${q.replace(/'/g, "''")}') desc
    limit 5`);
  console.log(`\n"${q}" → ${rows.length} match(es)`);
  for (const r of rows) {
    const cnt = await sql<{ n: number }>(
      `select count(*)::int n from public.campus_greek_chapters where campus_id='${r.id}' and (archived_at is null)`);
    console.log(`   ${r.id}  ${r.name}  [${r.city}, ${r.state}]  chapters=${cnt[0]?.n ?? 0}`);
  }
}
