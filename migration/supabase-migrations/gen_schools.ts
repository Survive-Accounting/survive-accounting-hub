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

/** CONFERENCE grouping for the picker. SEC is derived from is_sec (colours come from brand.tsx);
 *  the non-SEC Power Four is a hand-verified slug→conference map (the list is fixed for the 2026
 *  season). Anything not listed and not is_sec falls to "Other" (alphabetical in the picker).
 *  Slugs are the CANONICAL campus rows — validated to exist; see SCHOOL_PICKER_STRATEGY.md.
 *  Add a school to a conference by adding its slug here and regenerating. */
const CONFERENCE_BY_SLUG: Record<string, string> = {
  // Big Ten
  "university-of-southern-california": "Big Ten", "university-of-illinois-urbana-champaign": "Big Ten",
  "university-of-iowa": "Big Ten", "university-of-maryland": "Big Ten", "university-of-michigan": "Big Ten",
  "michigan-state-university": "Big Ten", "university-of-minnesota": "Big Ten", "university-of-nebraska-lincoln": "Big Ten",
  "northwestern-university": "Big Ten", "ohio-state-university": "Big Ten", "university-of-oregon": "Big Ten",
  "pennsylvania-state-university": "Big Ten", "purdue-university": "Big Ten", "rutgers-university": "Big Ten",
  "university-of-california-los-angeles-r": "Big Ten", "university-of-washington": "Big Ten", "university-of-wisconsin-madison": "Big Ten",
  // Big 12
  "university-of-cincinnati": "Big 12", "university-of-central-florida": "Big 12", "university-of-arizona": "Big 12",
  "university-of-colorado-boulder": "Big 12", "arizona-state-university": "Big 12", "baylor-university": "Big 12",
  "university-of-houston": "Big 12", "iowa-state-university": "Big 12", "university-of-kansas": "Big 12",
  "kansas-state-university": "Big 12", "oklahoma-state-university": "Big 12", "texas-christian-university": "Big 12",
  "texas-tech-university": "Big 12", "university-of-utah": "Big 12", "west-virginia-university": "Big 12",
  // ACC
  "clemson-university": "ACC", "north-carolina-state-university": "ACC", "university-of-north-carolina-at-chapel-hill": "ACC",
  "university-of-california-berkeley": "ACC", "duke-university": "ACC", "florida-state-university": "ACC",
  "georgia-institute-of-technology": "ACC", "university-of-louisville": "ACC", "university-of-miami": "ACC",
  "university-of-pittsburgh": "ACC", "southern-methodist-university": "ACC", "stanford-university": "ACC",
  "syracuse-university": "ACC", "university-of-virginia": "ACC", "virginia-tech": "ACC", "wake-forest-university": "ACC",
};

const hasAliases = !(await db.from("campuses").select("search_aliases").limit(1)).error;
const cols = `id,name,slug,short_name,state,color_primary,color_secondary,course_family_codes_json,is_sec,campus_status${hasAliases ? ",search_aliases" : ""}`;

const code = (c: any) => { const r = c.course_family_codes_json; const j = typeof r === "string" ? JSON.parse(r || "{}") : (r ?? {}); return ((j?.intro_1 ?? "") as string).trim() || null; };

// THE PICKER IS THE DISPLAY-READY SET — every campus we can render BRANDED, not only the
// content-ready ('live') set. campus_status is the single source of truth for HIDING: an
// 'excluded' row never appears. A campus qualifies when it is not excluded, has a slug, and
// EITHER is SEC (colours from brand.tsx) OR has an intro-1 course code + a stored colour + >=1
// Greek chapter. That is the ~200 curated set (see SCHOOL_PICKER_STRATEGY.md) — decoupled from
// exam-content readiness on purpose, so a branded campus can be picked before its exams exist.
// FAIL-SOFT: if the read comes back empty/unreadable, keep the last-good committed file.
const { data: allRows, error: allErr } = await db.from("campuses").select(cols)
  .neq("campus_status", "excluded").not("slug", "is", null);
if (allErr || !allRows?.length) {
  console.warn("gen_schools: campus read empty/unreadable -- keeping committed schools.generated.ts (no blank picker).");
  process.exit(0);
}
// Greek chapter counts — >=1 is required for non-SEC display-readiness (personalised branding).
const chapCount = new Map<string, number>();
{ let from = 0; for (;;) { const { data } = await db.from("campus_greek_chapters").select("campus_id").range(from, from + 999); (data ?? []).forEach((r: any) => chapCount.set(r.campus_id, (chapCount.get(r.campus_id) ?? 0) + 1)); if (!data || data.length < 1000) break; from += 1000; } }
// REVIEWED HIDE LIST (idea-vault: "Hide non-viable campuses from the student picker"). slug ->
// reason. These campuses stay fully in the DB, the growth dashboard and batches — they are only
// kept OUT OF THE STUDENT PICKER. Reversible by deleting a line. This is a HAND-REVIEWED list, NOT
// an automatic chapter-count rule: HBCUs (low NPHC chapter counts, high engagement) are deliberately
// NOT here. Add a school only after review. (A DB `hidden_from_picker` flag + dashboard toggle is
// the planned upgrade so this can be curated without a deploy.)
const HIDDEN_FROM_PICKER: Record<string, string> = {
  // Community colleges — two-year schools, different course sequences and culture.
  "community-college-of-baltimore-county": "community college",
  "oakland-community-college": "community college",
  "suffolk-county-community-college": "community college",
  "tulsa-community-college": "community college",
  // Minimal Greek presence (<=3 chapters) — not a Greek system for the chapter channel.
  "canisius-college": "minimal greek presence",
  "champlain-college": "minimal greek presence",
  "university-of-st-thomas": "minimal greek presence",
  "angelo-state-university": "minimal greek presence",
  "delaware-valley-university": "minimal greek presence",
  "wilmington-college": "minimal greek presence",
  "woodbury-university": "minimal greek presence",
  "liberty-university": "minimal greek presence",
  "spalding-university": "minimal greek presence",
  "suffolk-university": "minimal greek presence",
  "university-of-mary-washington": "minimal greek presence",
};
const displayReady = (c: any) => !!c.slug && !HIDDEN_FROM_PICKER[c.slug] && (c.is_sec || (!!code(c) && !!c.color_primary && (chapCount.get(c.id) ?? 0) >= 1));
const seen = new Set<string>();
let rows: any[] = (allRows as any[]).filter((c) => { if (seen.has(c.id) || !displayReady(c)) return false; seen.add(c.id); return true; });

// DEDUPE rows for the SAME school (merge artifacts like '...-merged' / '...-r'). Keep the most
// complete row, drop the rest LOUDLY — one row per school. Belt-and-suspenders with the dedupe
// SQL in the strategy; the picker can never show two of the same school even if that SQL lags.
const dkey = (slug: string) => (slug || "").replace(/-(merged|r|\d+)$/g, "").replace(/[^a-z0-9]/g, "");
const dscore = (c: any) => (c.is_sec ? 1000 : 0) + (c.campus_status === "live" ? 100 : c.campus_status === "ready" ? 50 : 20) + (code(c) ? 10 : 0) + (c.color_primary ? 10 : 0) + Math.min(chapCount.get(c.id) ?? 0, 80) - (/-(merged|r)$/.test(c.slug) ? 500 : 0);
{
  const best = new Map<string, any>();
  for (const c of rows) { const k = dkey(c.slug); const b = best.get(k); if (!b || dscore(c) > dscore(b)) best.set(k, c); }
  const kept = new Set([...best.values()].map((c) => c.id));
  for (const c of rows) if (!kept.has(c.id)) console.warn(`gen_schools: dedupe drop '${c.slug}' (kept '${best.get(dkey(c.slug)).slug}' for the same school)`);
  rows = rows.filter((c) => kept.has(c.id));
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
// Curated schools (SEC + the original seed set) keep their marketing short form ("Bama", "Mizzou").
// Ready-added campuses use the FULL institution name -- a raw DB short_name is often a terse, ambiguous
// abbreviation ("AU", "A-State", "SSU") that reads badly as a homepage tile.
const isCurated = (c: any) => c.is_sec || csvBySlug.has(c.slug) || csvByName.has(norm(c.name));
const nameFor = (c: any) => (isCurated(c)
  ? (c.short_name || csvBySlug.get(c.slug)?.short_display_name || csvByName.get(norm(c.name))?.short_display_name || c.name)
  : (c.name || c.short_name)) as string;
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
    id, campusId: c.id, slug: c.slug, name: nameFor(c), state: (c.state ?? "") as string, isSec: !!c.is_sec,
    conference: c.is_sec ? "SEC" : (CONFERENCE_BY_SLUG[c.slug] ?? "Other"), courseCode: code(c),
    // SEC keeps brand.tsx; everyone else reads from the database.
    c1: brand?.c1 ?? c.color_primary ?? null, c2: brand?.c2 ?? c.color_secondary ?? null,
    aliases: [...al].filter((a) => norm(a) !== norm(nameFor(c))),
  };
}).sort((a, b) => a.name.localeCompare(b.name));

// Disambiguate collisions instead of throwing. Two "Miami" (FL vs OH) is normal once the picker is
// data-driven, and a throw here would break the *build* (this runs at deploy). Append the state to a
// colliding display name and re-derive the id; a leftover id clash gets a numeric suffix. The search
// alias keeps the bare name findable. Last resort still throws -- but only if disambiguation failed.
const nameCount = new Map<string, number>();
for (const t of table) nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
const toId = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const usedIds = new Set<string>();
for (const t of table) {
  if ((nameCount.get(t.name) ?? 0) > 1 && t.state) { t.aliases = [...new Set([t.name, ...t.aliases])]; t.name = `${t.name} (${t.state})`; }
  let id = toId(t.name); let n = 2;
  while (usedIds.has(id)) id = `${toId(t.name)}-${n++}`;
  usedIds.add(id); t.id = id;
}
const dup = (xs: string[]) => [...new Set(xs.filter((v, i, a) => a.indexOf(v) !== i))];
const dupIds = dup(table.map((t) => t.id)), dupNames = dup(table.map((t) => t.name));
if (dupIds.length) throw new Error(`duplicate picker ids after disambiguation: ${dupIds.join(", ")}`);
if (dupNames.length) throw new Error(`duplicate display names after disambiguation: ${dupNames.join(", ")}`);

// SANITY: never publish a suspiciously small list -- if a partial DB read shrank it, keep committed.
// The picker is the curated LIVE launch set — intentionally small (~20–40 recognizable
// schools), so the old <60 floor no longer applies. Keep a low floor only to guard against
// a genuinely broken (near-empty) result; the empty/error case already exited above.
if (table.length < 8) { console.warn(`gen_schools: only ${table.length} schools resolved (<8) -- keeping committed file.`); process.exit(0); }

await Bun.write("src/lib/schools.generated.ts", `// GENERATED by migration/supabase-migrations/gen_schools.ts -- DO NOT EDIT BY HAND.
// The database is the source of truth. Regenerate after any campus seed change.
// ${table.length} campuses. By conference: ${["SEC", "Big Ten", "Big 12", "ACC", "Other"].map((k) => `${k} ${table.filter((t) => t.conference === k).length}`).join(", ")}. SEC colours come from brand.tsx by design -- see the generator header.
// Aliases source: ${hasAliases ? "database (search_aliases)" : "seed CSV (search_aliases column not yet applied)"}.

export type GeneratedSchool = {
  id: string; campusId: string; slug: string; name: string;
  isSec: boolean;
  /** "SEC" | "Big Ten" | "Big 12" | "ACC" | "Other" — the picker's grouping. */
  conference: string;
  courseCode: string | null;
  c1: string | null; c2: string | null;
  /** Matched in search, NEVER displayed. */
  aliases: string[];
};

export const GENERATED_SCHOOLS: GeneratedSchool[] = ${JSON.stringify(table.map(({ state, ...t }) => t), null, 2)};
`);
console.log(`wrote ${table.length} schools — ${["SEC", "Big Ten", "Big 12", "ACC", "Other"].map((k) => `${k}:${table.filter((t) => t.conference === k).length}`).join("  ")}`);
console.log(`  missing course code: ${table.filter((t) => !t.courseCode).length}   missing colours: ${table.filter((t) => !t.c1).length}`);
console.log(`  total aliases: ${table.reduce((s, t) => s + t.aliases.length, 0)}   aliases from: ${hasAliases ? "DB" : "CSV fallback"}`);
console.log(`  no id or display-name collisions`);
