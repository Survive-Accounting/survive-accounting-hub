import { sql } from "./_db";
const targets = process.argv.slice(2);
for (const t of targets) {
  const cols = await sql<{ column_name: string; data_type: string; is_nullable: string }>(`
    select column_name, data_type, is_nullable from information_schema.columns
    where table_schema='public' and table_name='${t}' order by ordinal_position`);
  if (!cols.length) { console.log(`\n## ${t}  (NOT FOUND)`); continue; }
  console.log(`\n## ${t}`);
  for (const c of cols) console.log(`   ${c.column_name}  ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}`);
}
