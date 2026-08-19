/* GENERATE src/lib/schools.generated.ts FROM THE DATABASE.
 *
 * The database is the source of truth; this file is a build artifact. It exists because the school
 * picker needs the whole list synchronously on the first render, in SSR and on a phone with a bad
 * connection -- a fetch there means a spinner where a list should be. Regenerate after any campus
 * seed change:
 *
 *     set -a && . ./.env && set +a && bun run migration/supabase-migrations/gen_schools.ts
 *
 * TWO DELIBERATE OVERRIDES OF THE DATABASE:
 *
 * 1. SEC COLOURS come from brand.tsx, not from campuses.color_primary. The DB disagrees with
 *    brand.tsx on three SEC schools and has Ole Miss's two colours REVERSED, so reading colours
 *    from data for the SEC 16 would silently restyle every existing bolt. New campuses read from
 *    the database, which is what the brief asked for.
 *
 * 2. ALIASES fall back to the seed CSV until 20260819_1615 adds search_aliases, so alias search is
 *    not dark while that migration waits.
 */
import { createClient } from "@supabase/supabase-js";

import { SEC_SCHOOLS as BRAND_SEC } from "../../src/components/canvas/brand";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const parse = (t: string) => { const [h, ...r] = t.trim().split(/\r?\n/); const c = h.split(",");
  return r.filter(Boolean).map((l) => { const v = l.split(","); return Object.fromEntries(c.map((k, i) => [k, (v[i] ?? "").trim()])); }); };
const seedCsv = parse(await Bun.file("migration/seeds/campus-seed-FINAL.csv").text());
const norm = (s: string) => (s || "").toLowerCase().normalize("NFKD").replace(/[\u2010-\u2015]/g, "-").replace(/[^a-z0-9]/g, "");
const csvBySlug = new Map(seedCsv.map((r) => [r.slug, r]));
const csvByName = new Map(seedCsv.map((r) => [norm(r.campus_name), r]));

/** Short forms the DB used to display, plus common nicknames. Search-only, never rendered. */
const EXTRA_ALIASES: Record<string, string[]> = {
  "university-of-alabama": ["Bama", "Roll Tide", "Crimson Tide", "UA"],
  "university-of-georgia": ["UGA", "Bulldogs"], "university-of-kentucky": ["UK", "Wildcats"],
  "university-of-oklahoma": ["OU", "Sooners"], "university-of-florida": ["UF", "Gators"],
  "university-of-texas-at-austin": ["UT Austin", "UT", "Longhorns"],
  "university-of-tennessee-knoxville": ["UT Knoxville", "Vols", "Volunteers"],
  "vanderbilt-university": ["Vandy", "Commodores"], "university-of-missouri": ["Missouri", "MU", "Tigers"],
  "university-of-mississippi": ["University of Mississippi", "UM", "OM", "Rebels", "Oxford"],
  "university-of-south-carolina": ["USC", "South Carolina Gamecocks", "Gamecocks"],
  "louisiana-state-university": ["LSU", "Louisiana State", "Tigers", "Baton Rouge"],
  "texas-aandm-university": ["A&M", "TAMU", "Aggies", "College Station"],
  "auburn-university": ["AU", "War Eagle", "Tigers"], "university-of-arkansas": ["Razorbacks", "Fayetteville"],
  "mississippi-state-university": ["MSU", "Miss State", "Bulldogs", "Starkville"],
};

const hasAliases = !(await db.from("campuses").select("search_aliases").limit(1)).error;
const cols = `id,name,slug,short_name,color_primary,color_secondary,course_family_codes_json,is_sec${hasAliases ? ",search_aliases" : ""}`;

const { data: bySlug } = await db.from("campuses").select(cols).in("slug", seedCsv.map((r) => r.slug)).is("archived_at", null);
const { data: sec } = await db.from("campuses").select(cols).eq("is_sec", true).is("archived_at", null);
const seen = new Set<string>();
const rows: any[] = [...(sec ?? []), ...(bySlug ?? [])].filter((c: any) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
// Seed rows whose DB slug we deliberately kept are not found by seed slug -- pick them up by name.
for (const r of seedCsv) {
  if (rows.some((c) => c.slug === r.slug)) continue;
  const { data } = await db.from("campuses").select(cols).ilike("name", r.campus_name).is("archived_at", null).limit(1);
  const hit: any = data?.[0];
  if (hit && !seen.has(hit.id)) { seen.add(hit.id); rows.push(hit); }
}

/** slug -> brand.tsx id. Explicit, because the DISPLAY name is not the brand id: Missouri
 *  displays as "Mizzou" but its brand entry is keyed "missouri", and deriving the key from the
 *  name silently dropped its colours. */
const BRAND_ID_BY_SLUG: Record<string, string> = {
  "university-of-mississippi": "ole-miss", "louisiana-state-university": "lsu",
  "university-of-alabama": "alabama", "university-of-tennessee-knoxville": "tennessee",
  "university-of-arkansas": "arkansas", "university-of-south-carolina": "south-carolina",
  "university-of-georgia": "georgia", "university-of-kentucky": "kentucky",
  "auburn-university": "auburn", "mississippi-state-university": "mississippi-state",
  "university-of-missouri": "missouri", "university-of-oklahoma": "oklahoma",
  "texas-aandm-university": "texas-am", "university-of-florida": "florida",
  "university-of-texas-at-austin": "texas", "vanderbilt-university": "vanderbilt",
};
const brandById = new Map((BRAND_SEC as any[]).map((b) => [b.id, b]));
const code = (c: any) => { const r = c.course_family_codes_json; const j = typeof r === "string" ? JSON.parse(r || "{}") : (r ?? {}); return ((j?.intro_1 ?? "") as string).trim() || null; };
const nameFor = (c: any) => (c.short_name || csvBySlug.get(c.slug)?.short_display_name || csvByName.get(norm(c.name))?.short_display_name || c.name) as string;
const idFor = (c: any) => nameFor(c).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const table = rows.map((c: any) => {
  const id = idFor(c);
  const brand = c.is_sec ? brandById.get(BRAND_ID_BY_SLUG[c.slug] ?? id) : undefined;
  if (c.is_sec && !brand) throw new Error(`SEC school ${c.slug} has no brand.tsx colours -- it would silently restyle`);
  const csv = csvBySlug.get(c.slug) ?? csvByName.get(norm(c.name));
  const al = new Set<string>(hasAliases && Array.isArray(c.search_aliases) ? c.search_aliases : []);
  for (const a of (csv?.aliases || "").split(";").map((x: string) => x.trim()).filter(Boolean)) al.add(a);
  for (const a of EXTRA_ALIASES[c.slug] ?? []) al.add(a);
  if (csv && csv.slug !== c.slug) al.add(csv.slug.replace(/-/g, " "));
  if (norm(c.name) !== norm(nameFor(c))) al.add(c.name);
  return {
    id, campusId: c.id, slug: c.slug, name: nameFor(c), isSec: !!c.is_sec, courseCode: code(c),
    // SEC keeps brand.tsx; everyone else reads from the database.
    c1: brand?.c1 ?? c.color_primary ?? null, c2: brand?.c2 ?? c.color_secondary ?? null,
    aliases: [...al].filter((a) => norm(a) !== norm(nameFor(c))),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

const dup = (xs: string[]) => [...new Set(xs.filter((v, i, a) => a.indexOf(v) !== i))];
const dupIds = dup(table.map((t) => t.id)), dupNames = dup(table.map((t) => t.name));
if (dupIds.length) throw new Error(`duplicate picker ids: ${dupIds.join(", ")}`);
if (dupNames.length) throw new Error(`duplicate display names: ${dupNames.join(", ")}`);

await Bun.write("src/lib/schools.generated.ts", `// GENERATED by migration/supabase-migrations/gen_schools.ts -- DO NOT EDIT BY HAND.
// The database is the source of truth. Regenerate after any campus seed change.
// ${table.length} campuses (${table.filter((t) => t.isSec).length} SEC). SEC colours come from brand.tsx by design -- see the generator header.
// Aliases source: ${hasAliases ? "database (search_aliases)" : "seed CSV (search_aliases column not yet applied)"}.

export type GeneratedSchool = {
  id: string; campusId: string; slug: string; name: string;
  isSec: boolean; courseCode: string | null;
  c1: string | null; c2: string | null;
  /** Matched in search, NEVER displayed. */
  aliases: string[];
};

export const GENERATED_SCHOOLS: GeneratedSchool[] = ${JSON.stringify(table, null, 2)};
`);
console.log(`wrote ${table.length} schools (${table.filter((t) => t.isSec).length} SEC, ${table.filter((t) => !t.isSec).length} other)`);
console.log(`  missing course code: ${table.filter((t) => !t.courseCode).length}   missing colours: ${table.filter((t) => !t.c1).length}`);
console.log(`  total aliases: ${table.reduce((s, t) => s + t.aliases.length, 0)}   aliases from: ${hasAliases ? "DB" : "CSV fallback"}`);
console.log(`  no id or display-name collisions`);
