import { sql } from "./_db";
const LIKE = [
  "greek%", "campus%", "%chapter%", "%contact%", "%advisor%", "%officer%",
  "%outreach%", "%growth%", "%source%", "%provenance%", "%research%",
  "%legal%", "%entity%", "%nonprofit%", "%990%", "%ein%", "%council%",
];
const rows = await sql<{ table_name: string; n: number }>(`
  select t.table_name,
    (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', t.table_name), false, true, '')))[1]::text::int as n
  from information_schema.tables t
  where t.table_schema='public' and (${LIKE.map((l) => `t.table_name ilike '${l}'`).join(" or ")})
  order by t.table_name`);
for (const r of rows) console.log(`${String(r.n).padStart(7)}  ${r.table_name}`);
console.log(`\n${rows.length} tables`);
