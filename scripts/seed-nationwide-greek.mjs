// Import nationwide Greek chapters from a seed CSV.
// Headers: campus_name, state, national_org, chapter_designation, letters.
// Matches campuses by NAME; MISSING campuses are created research-only
// (is_research_only=true, active_roster null → excluded from student pickers /
// ProfIntel / orders). Resolves/creates national orgs; upserts chapter rows.
// Usage: PROF_INTEL_PAT=… bun scripts/seed-nationwide-greek.mjs [csv-path]
import { readFileSync } from "fs";

const ref = process.env.SUPABASE_PROJECT_ID ?? "unvxagsledbsdoremqeb";
const pat = process.env.PROF_INTEL_PAT;
if (!pat) {
  console.error("Set PROF_INTEL_PAT.");
  process.exit(1);
}
const CSV = process.argv[2] || "data/kkg_ato_nationwide_seed.csv";

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
const esc = (s) => (s == null || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function parseCsv(text) {
  const rows = [];
  let f = "",
    row = [],
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(f);
      f = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(f);
      f = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else f += c;
  }
  if (f !== "" || row.length) {
    row.push(f);
    if (row.some((x) => x.trim())) rows.push(row);
  }
  const h = rows[0].map((x) => x.replace(/^﻿/, "").trim().toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const rows = parseCsv(readFileSync(CSV, "utf8"));
console.log(`Parsed ${rows.length} rows.`);

// Existing campuses by name + used slugs.
const camps = await sql(`select id, name, slug from public.campuses;`);
const byName = new Map(camps.map((c) => [c.name, c.id]));
const usedSlugs = new Set(camps.map((c) => c.slug).filter(Boolean));

// Create missing campuses (research-only).
const missing = [...new Set(rows.map((r) => r.campus_name))].filter((n) => !byName.has(n));
let created = 0;
for (const name of missing) {
  const state = rows.find((r) => r.campus_name === name)?.state || null;
  let slug = slugify(name);
  while (usedSlugs.has(slug)) slug = slug + "-r";
  usedSlugs.add(slug);
  const res = await sql(
    `insert into public.campuses (name, state, slug, is_research_only) values (${esc(name)}, ${esc(state)}, ${esc(slug)}, true) returning id;`,
  );
  byName.set(name, res[0].id);
  created++;
}
console.log(`Created ${created} research-only campuses (of ${missing.length} missing).`);

// Ensure national orgs exist.
const orgs = [...new Set(rows.map((r) => r.national_org).filter(Boolean))];
const values = orgs.map((o) => `(${esc(o)})`).join(",");
await sql(
  `insert into public.greek_orgs (name) select v.name from (values ${values}) v(name) where not exists (select 1 from public.greek_orgs g where lower(g.name)=lower(v.name));`,
);

// Council by national org (KKG sorority = Panhellenic; ATO / Phi Kappa Psi /
// Phi Kappa Tau fraternities = IFC).
const councilFor = (org) =>
  /kappa kappa gamma/i.test(org)
    ? "panhellenic"
    : /alpha tau omega|phi kappa psi|phi kappa tau/i.test(org)
      ? "ifc"
      : null;

// Upsert chapters.
let up = 0;
for (const batch of Array.from({ length: Math.ceil(rows.length / 150) }, (_, i) =>
  rows.slice(i * 150, i * 150 + 150),
)) {
  const vals = batch
    .map(
      (r) =>
        `(${esc(byName.get(r.campus_name))}, ${esc(r.national_org)}, ${esc(r.chapter_designation)}, ${esc(r.letters)}, ${esc(councilFor(r.national_org))})`,
    )
    .join(",");
  await sql(`
    with seed(campus_id, org, designation, letters, council) as (values ${vals}),
    resolved as (
      select s.campus_id::uuid, g.id as greek_org_id, nullif(s.designation,'') d, nullif(s.letters,'') l, s.council
      from seed s join public.greek_orgs g on lower(g.name)=lower(s.org)
      where s.campus_id is not null
    )
    insert into public.campus_greek_chapters (campus_id, greek_org_id, chapter_designation, letters, council, status)
    select campus_id, greek_org_id, d, l, council, 'identified' from resolved
    on conflict (campus_id, greek_org_id) do update set chapter_designation=excluded.chapter_designation, letters=excluded.letters;`);
  up += batch.length;
}
console.log(`Upserted ${up} chapter rows.`);
console.log(
  "research-only campus count:",
  JSON.stringify(await sql(`select count(*) from public.campuses where is_research_only;`)),
);
