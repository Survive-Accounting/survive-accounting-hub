// One-off: dump schema + row counts for tables relevant to the Greek 990 audit.
import { sql } from "./_db";

const LIKE = [
  "greek%", "campus%", "%chapter%", "%contact%", "%advisor%", "%officer%",
  "%outreach%", "%growth%", "%source%", "%provenance%", "%research%",
  "%legal%", "%entity%", "%nonprofit%", "%990%", "%ein%", "%council%",
];

const tables = await sql<{ table_name: string }>(`
  select table_name from information_schema.tables
  where table_schema='public' and (${LIKE.map((l) => `table_name ilike '${l}'`).join(" or ")})
  order by table_name`);

console.log(`\n=== ${tables.length} matching tables ===`);
for (const t of tables) {
  const cols = await sql<{ column_name: string; data_type: string; is_nullable: string }>(`
    select column_name, data_type, is_nullable from information_schema.columns
    where table_schema='public' and table_name='${t.table_name}' order by ordinal_position`);
  let count = "?";
  try {
    const c = await sql<{ n: number }>(`select count(*)::int as n from public."${t.table_name}"`);
    count = String(c[0]?.n ?? "?");
  } catch { count = "err"; }
  console.log(`\n## ${t.table_name}  (rows: ${count})`);
  for (const c of cols) console.log(`   ${c.column_name}  ${c.data_type}${c.is_nullable === "NO" ? " NOT NULL" : ""}`);
}
