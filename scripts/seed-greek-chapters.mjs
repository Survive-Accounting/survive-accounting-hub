// Seed SEC Greek chapters from data/sec_greek_chapters_all_sec_seed.csv.
// - utf-8-sig (BOM) tolerant, quote-aware CSV parse
// - match campuses by NAME (CSV header 'campus'); resolve/create national orgs
// - council map: IFC→ifc, Panhellenic/CPH→panhellenic, NPHC→nphc,
//   MGC/UGC/CGC/IGC→mgc, else→other (raw value kept in council_raw)
// - idempotent upsert on (campus_id, greek_org_id); never overwrites status
// Usage: bun scripts/seed-greek-chapters.mjs   (uses PROF_INTEL_PAT or inline PAT)
import { readFileSync } from "fs";

const ref = process.env.SUPABASE_PROJECT_ID ?? "unvxagsledbsdoremqeb";
const pat = process.env.PROF_INTEL_PAT;
if (!pat) {
  console.error("Set PROF_INTEL_PAT (Supabase Management API token) in the environment.");
  process.exit(1);
}
const CSV = "data/sec_greek_chapters_all_sec_seed.csv";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

function parseCsv(text) {
  const rows = [];
  let field = "",
    row = [],
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  const headers = rows[0].map((h) => h.replace(/^﻿/, "").trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

function mapCouncil(raw) {
  const v = (raw || "").trim().toUpperCase();
  if (v === "IFC") return "ifc";
  if (v === "PANHELLENIC" || v === "CPH") return "panhellenic";
  if (v === "NPHC") return "nphc";
  if (["MGC", "UGC", "CGC", "IGC"].includes(v)) return "mgc";
  return "other";
}

const esc = (s) => `'${String(s ?? "").replace(/'/g, "''")}'`;
const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const raw = readFileSync(CSV, "utf8").replace(/^﻿/, "");
const rows = parseCsv(raw);
console.log(`Parsed ${rows.length} rows from ${CSV}`);

// 1) Ensure every national_org exists in the catalog.
const orgs = [...new Set(rows.map((r) => r.national_org).filter(Boolean))];
for (const batch of chunk(orgs, 200)) {
  const values = batch.map((o) => `(${esc(o)})`).join(",");
  await sql(
    `insert into public.greek_orgs (name) select v.name from (values ${values}) v(name)
     where not exists (select 1 from public.greek_orgs g where lower(g.name)=lower(v.name));`,
  );
}
console.log(`Ensured ${orgs.length} national orgs in catalog.`);

// 2) Upsert chapters in batches.
let upserted = 0;
for (const batch of chunk(rows, 200)) {
  const values = batch
    .map(
      (r) =>
        `(${esc(r.campus)},${esc(r.national_org)},${esc(r.chapter_designation)},${esc(mapCouncil(r.council))},${esc(r.council)},${esc(r.letters)})`,
    )
    .join(",");
  await sql(`
    with seed(campus, org, designation, council, council_raw, letters) as (values ${values}),
    resolved as (
      select c.id as campus_id, g.id as greek_org_id,
             nullif(s.designation,'') as designation, s.council,
             nullif(s.council_raw,'') as council_raw, nullif(s.letters,'') as letters
      from seed s
      join public.campuses c on c.name = s.campus
      join public.greek_orgs g on lower(g.name) = lower(s.org)
    )
    insert into public.campus_greek_chapters
      (campus_id, greek_org_id, chapter_designation, council, council_raw, letters, status)
    select campus_id, greek_org_id, designation, council, council_raw, letters, 'identified'
    from resolved
    on conflict (campus_id, greek_org_id) do update set
      chapter_designation = excluded.chapter_designation,
      council = excluded.council,
      council_raw = excluded.council_raw,
      letters = excluded.letters;`);
  upserted += batch.length;
}
console.log(`Upserted ${upserted} chapter rows.`);

// 3) Report per-campus counts.
const counts = await sql(`
  select c.name, count(*) as chapters
  from public.campus_greek_chapters ch join public.campuses c on c.id=ch.campus_id
  group by c.name order by c.name;`);
console.log("\nPer-campus counts:");
let total = 0;
for (const r of counts) {
  console.log(`  ${r.name.padEnd(40)} ${r.chapters}`);
  total += Number(r.chapters);
}
console.log(`  ${"TOTAL".padEnd(40)} ${total}`);
