// Import chapters-66-FINAL.csv — 2,060 pre-cleaned chapters across 66 campuses.
//
// DRY-RUN BY DEFAULT. Writes nothing unless --apply is passed, and --apply additionally refuses
// to run until 20260820_1209_chapter_import_flags.sql has been applied (columns probed live).
//
//   set -a && . ./.env && set +a && bun run migration/supabase-migrations/import_chapters_66.ts
//   ... --apply    # write, after the dry-run counts have been confirmed
//
// THE DATA IS PRE-CLEANED — councils normalized, orgs matched, nicknames filled, flags set.
// This script imports; it does not re-derive any of those fields.
//
// RULES (from chapter-import-66.md):
//   * campuses matched on campus_display_name (campuses.short_name), tie-broken by
//     campus_full_name vs campuses.name — NEVER auto-created; unmatched rows are reported.
//     The full-name tiebreak matters: "Miami" is Miami University (Ohio) here, and University
//     of Miami (FL) is a different, also-present campus.
//   * upsert key is (campus, organization). Organization identity is greekChapterSlug(name) —
//     the same normalizer the /go/ URLs use — so "Kappa Kappa Gamma" and "Kappa Kappa Gamma
//     Fraternity Inc" resolve to ONE chapter, matching how the slug backfill treated them.
//   * existing rows are UPDATED (flags + fill-if-null slug/letters/designation; council is
//     overwritten with the normalized value). claim_status, status, members, designations and
//     existing slugs are never clobbered. Nothing is ever deleted.
//   * new rows are INSERTED with slug = greekChapterSlug(organization), unique per campus;
//     a collision leaves the row unslugged and reported (a duplicate is a duplicate, not a
//     second chapter — same rule as backfill_greek_slugs.ts).
//   * local/regional orgs (is_national_org = FALSE) get a greek_orgs row created when none
//     matches: { name, nickname } only — campus council names (IFC/Panhellenic) are NOT
//     written to greek_orgs.council, which holds national bodies (NIC/NPC).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createClient } from "@supabase/supabase-js";

// The one slug rule (printed on flyers) — imported, never re-implemented.
import { greekChapterSlug } from "../../src/lib/greek-slug";

const APPLY = process.argv.includes("--apply");

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------------------------
// CSV (inlined minimal parser — the src/ copy lives in a module that drags in the browser
// supabase client; this script must run standalone under bun with only .env)
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f.trim() !== "")) rows.push(row); }
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    headers.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}

/** PostgREST caps responses at 1,000 rows; every full read pages explicitly (repo law). */
async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table as never).select(columns).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const bool = (v: string) => /^true$/i.test(v.trim());

type Campus = { id: string; name: string; short_name: string | null; slug: string | null; archived_at: string | null };
type Org = { id: string; name: string; nickname: string | null };
type Chapter = {
  id: string; campus_id: string; greek_org_id: string | null; slug: string | null;
  council: string | null; letters: string | null; chapter_designation: string | null;
  claim_status: string | null; status: string | null;
};

const main = async () => {
  console.log(`=== CHAPTER IMPORT 66 (${APPLY ? "APPLY" : "DRY RUN — nothing will be written"}) ===\n`);

  // THE FILE IS AN ARGUMENT NOW, defaulting to the original import. Same columns, same rules —
  // this script is the one place that knows how a chapter row becomes a database row (campus
  // matching, org identity via greekChapterSlug, the collision rule), so every later batch — a
  // re-imported campus, a hand-researched roster, a brand-new school — should come through here
  // rather than growing a second importer that drifts from the slug rule printed on flyers.
  //
  //   bun run migration/supabase-migrations/import_chapters_66.ts path/to/rows.csv           # dry run
  //   bun run migration/supabase-migrations/import_chapters_66.ts path/to/rows.csv --apply
  const fileArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const csvPath = fileArg ?? join(import.meta.dir, "../../data/chapters-66-FINAL.csv");
  const rows = parseCsv(readFileSync(csvPath, "utf8"));
  console.log(`csv: ${csvPath}`);
  console.log(`csv rows: ${rows.length}`);
  if (!fileArg && rows.length !== 2060) console.log(`  NOTE: expected 2,060 — got ${rows.length}`);

  // --- gate --apply on the flag columns existing -------------------------------------------
  const probe = await db.from("campus_greek_chapters").select("nickname,verified,roster_status,is_national_org,source_url,as_of").limit(1);
  const columnsExist = !probe.error;
  if (APPLY && !columnsExist) {
    console.error("\nABORT: flag columns missing — apply 20260820_1209_chapter_import_flags.sql in the Supabase SQL editor first.");
    console.error(`probe error: ${probe.error!.message}`);
    process.exit(1);
  }
  if (!columnsExist) console.log("flag columns: NOT YET APPLIED (dry run proceeds; --apply will refuse)\n");
  else console.log("flag columns: present\n");

  // --- campuses: match display name, tie-break with full name -------------------------------
  const campuses = await fetchAll<Campus>("campuses", "id,name,short_name,slug,archived_at");
  const liveCampuses = campuses.filter((c) => !c.archived_at);
  const byShort = new Map<string, Campus[]>();
  const byName = new Map<string, Campus[]>();
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[‐-―]/g, "-").trim();
  for (const c of liveCampuses) {
    if (c.short_name) { const k = norm(c.short_name); byShort.set(k, [...(byShort.get(k) ?? []), c]); }
    const k2 = norm(c.name); byName.set(k2, [...(byName.get(k2) ?? []), c]);
  }

  const campusFor = (display: string, full: string): { campus: Campus | null; why?: string } => {
    const shorts = byShort.get(norm(display)) ?? [];
    if (shorts.length === 1) {
      // Tie-break sanity: if the CSV's full name matches a DIFFERENT live campus exactly, flag it.
      const fulls = byName.get(norm(full)) ?? [];
      if (full && fulls.length === 1 && fulls[0].id !== shorts[0].id) {
        return { campus: null, why: `display "${display}" -> ${shorts[0].name} but full "${full}" -> different campus` };
      }
      return { campus: shorts[0] };
    }
    if (shorts.length > 1) {
      const fulls = byName.get(norm(full)) ?? [];
      const hit = shorts.find((c) => fulls.some((f) => f.id === c.id));
      return hit ? { campus: hit } : { campus: null, why: `display "${display}" ambiguous (${shorts.length}) and full name doesn't settle it` };
    }
    const fulls = byName.get(norm(full)) ?? [];
    if (fulls.length === 1) return { campus: fulls[0] };
    return { campus: null, why: `no live campus matches "${display}" / "${full}"` };
  };

  // --- orgs: identity is the slug-normalized name ------------------------------------------
  //
  // MATCHED ON A LOOSER KEY THAN THE URL SLUG. greekChapterSlug strips "Fraternity", "Sorority",
  // "International", "National" and "Inc" — but universities print more than that. Michigan State
  // lists "Lambda Theta Alpha Latin Sorority, Inc." and "alpha Kappa Delta Phi International
  // Sorority, Inc."; the catalog holds "Lambda Theta Alpha" and "Alpha Kappa Delta Phi". Matching
  // on the URL slug alone missed 15 of 58 rows on that one campus and would have created 15 NEW
  // org records — which is precisely how the ten duplicate organizations got there in the first
  // place (see DATA_AUDIT.md §5), splitting the Divine Nine national pages in half.
  //
  // So catalog lookup uses orgMatchKey, which additionally drops the descriptor words a campus
  // directory adds. The URL slug is untouched: it still comes from greekChapterSlug, because it is
  // printed on flyers and must never change.
  const orgMatchKey = (name: string) =>
    (name ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/\b(fraternity|sorority|international|national|latin|latina|latino|inc|incorporated)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const orgs = await fetchAll<Org>("greek_orgs", "id,name,nickname");
  const orgByKey = new Map<string, Org[]>();
  for (const o of orgs) {
    const k = orgMatchKey(o.name ?? "");
    if (!k) continue;
    orgByKey.set(k, [...(orgByKey.get(k) ?? []), o]);
  }
  // Among duplicate org rows (bare + legal-suffix), prefer exact name, then the SHORTEST name
  // (the bare form) — matching how the slug backfill picked winners.
  const resolveOrg = (name: string): Org | null => {
    const list = orgByKey.get(orgMatchKey(name)) ?? [];
    if (!list.length) return null;
    const exact = list.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());
    return exact ?? list.slice().sort((a, b) => a.name.length - b.name.length || a.id.localeCompare(b.id))[0];
  };

  // --- existing chapters, keyed (campus_id, orgKey) -----------------------------------------
  const chapters = await fetchAll<Chapter>(
    "campus_greek_chapters",
    "id,campus_id,greek_org_id,slug,council,letters,chapter_designation,claim_status,status",
  );
  const { count: chapterCount } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true });
  if (chapterCount != null && chapters.length !== chapterCount) {
    console.error(`ABORT: paged chapter read incomplete (${chapters.length}/${chapterCount})`);
    process.exit(1);
  }
  const orgNameById = new Map(orgs.map((o) => [o.id, o.name ?? ""]));
  const chapByKey = new Map<string, Chapter[]>();
  for (const ch of chapters) {
    const name = ch.greek_org_id ? orgNameById.get(ch.greek_org_id) ?? "" : "";
    const k = name ? `${ch.campus_id}::${orgMatchKey(name)}` : "";
    if (k) chapByKey.set(k, [...(chapByKey.get(k) ?? []), ch]);
  }
  // Among duplicate roster rows for one chapter, the row with the SLUG is the live URL and is
  // the one updated; then designation-bearing; then lowest id. Never both.
  const pickTarget = (list: Chapter[]): Chapter =>
    list.slice().sort((a, b) =>
      (a.slug ? 0 : 1) - (b.slug ? 0 : 1)
      || (a.chapter_designation ? 0 : 1) - (b.chapter_designation ? 0 : 1)
      || a.id.localeCompare(b.id),
    )[0];

  // Slugs already taken per campus (for insert planning).
  const takenSlugs = new Map<string, Set<string>>();
  for (const ch of chapters) {
    if (!ch.slug) continue;
    if (!takenSlugs.has(ch.campus_id)) takenSlugs.set(ch.campus_id, new Set());
    takenSlugs.get(ch.campus_id)!.add(ch.slug);
  }

  // --- plan ----------------------------------------------------------------------------------
  type Update = { chapterId: string; campus: string; org: string; patch: Record<string, unknown> };
  type Insert = { campus: Campus; org: string; existingOrgId: string | null; row: Record<string, unknown>; nickname: string | null };
  const updates: Update[] = [];
  const inserts: Insert[] = [];
  const unmatchedCampus = new Map<string, { rows: number; why: string }>();
  const slugCollisions: Array<{ campus: string; org: string; slug: string }> = [];
  const orgCreates = new Map<string, { nickname: string | null; rows: number }>();
  const perCampus = new Map<string, { create: number; update: number; existing: number }>();
  const seenCsvKeys = new Set<string>();
  let csvDupes = 0;

  for (const r of rows) {
    const display = r["campus_display_name"], full = r["campus_full_name"], orgName = r["organization"];
    const { campus, why } = campusFor(display, full);
    if (!campus) {
      const prev = unmatchedCampus.get(display) ?? { rows: 0, why: why ?? "" };
      unmatchedCampus.set(display, { rows: prev.rows + 1, why: why ?? prev.why });
      continue;
    }
    // TWO SEPARATE KEYS. orgKey is the loose MATCH key (find the existing chapter / dedupe the CSV);
    // slugKey is the URL slug printed on flyers. They diverged when org matching moved to orgMatchKey
    // (which joins with spaces, not hyphens) — reusing orgKey as the slug wrote unroutable slugs like
    // "alpha chi omega". The slug must always come from greekChapterSlug.
    const orgKey = orgMatchKey(orgName);
    const slugKey = greekChapterSlug(orgName);
    if (!orgKey || !slugKey) { console.log(`  SKIP row with unslugifiable org "${orgName}" @ ${display}`); continue; }

    // The CSV itself must not carry two rows for one (campus, org) — trust but verify.
    const csvKey = `${campus.id}::${orgKey}`;
    if (seenCsvKeys.has(csvKey)) { csvDupes++; continue; }
    seenCsvKeys.add(csvKey);

    const flags = {
      nickname: r["nickname"] || null,
      council: r["council"] || null,
      verified: bool(r["verified"]),
      roster_status: r["roster_status"] === "incomplete" ? "incomplete" : "complete",
      is_national_org: bool(r["is_national_org"]),
      source_url: r["source_url"] || null,
      as_of: r["as_of"] || null,
    };

    const pc = perCampus.get(campus.short_name ?? campus.name) ?? { create: 0, update: 0, existing: 0 };
    const existing = chapByKey.get(csvKey);
    if (existing?.length) {
      const target = pickTarget(existing);
      const patch: Record<string, unknown> = { ...flags };
      // fill-if-null only — never clobber curated values or live URLs
      if (!target.letters && r["greek_letters"]) patch.letters = r["greek_letters"];
      if (!target.chapter_designation && r["chapter_designation"]) patch.chapter_designation = r["chapter_designation"];
      if (!target.slug) {
        const used = takenSlugs.get(campus.id) ?? new Set<string>();
        if (!used.has(slugKey)) { patch.slug = slugKey; used.add(slugKey); takenSlugs.set(campus.id, used); }
      }
      updates.push({ chapterId: target.id, campus: campus.short_name ?? campus.name, org: orgName, patch });
      pc.update++; pc.existing += existing.length;
    } else {
      const org = resolveOrg(orgName);
      if (!org) {
        const oc = orgCreates.get(orgName) ?? { nickname: flags.nickname, rows: 0 };
        oc.rows++; orgCreates.set(orgName, oc);
      }
      const used = takenSlugs.get(campus.id) ?? new Set<string>();
      let slug: string | null = slugKey;
      if (used.has(slugKey)) { slug = null; slugCollisions.push({ campus: campus.short_name ?? campus.name, org: orgName, slug: slugKey }); }
      else { used.add(slugKey); takenSlugs.set(campus.id, used); }
      inserts.push({
        campus, org: orgName, existingOrgId: org?.id ?? null, nickname: flags.nickname,
        row: {
          campus_id: campus.id,
          slug,
          chapter_designation: r["chapter_designation"] || null,
          letters: r["greek_letters"] || null,
          status: "active",
          claim_status: "unclaimed",
          ...flags,
        },
      });
      pc.create++;
    }
    perCampus.set(campus.short_name ?? campus.name, pc);
  }

  // --- report --------------------------------------------------------------------------------
  console.log(`plan: create ${inserts.length}, update ${updates.length}, csv-internal dupes skipped ${csvDupes}`);
  console.log(`new greek_orgs rows needed: ${orgCreates.size} (local/regional orgs with no catalog row)`);
  console.log(`slug collisions (inserted UNSLUGGED, reported): ${slugCollisions.length}`);
  if (slugCollisions.length) for (const s of slugCollisions.slice(0, 20)) console.log(`   ${s.campus}: ${s.org} -> ${s.slug} already taken`);

  if (unmatchedCampus.size) {
    console.log(`\nUNMATCHED CAMPUSES (rows NOT imported — campuses are never auto-created):`);
    for (const [d, v] of unmatchedCampus) console.log(`   ${d}: ${v.rows} rows — ${v.why}`);
  } else {
    console.log(`\nunmatched campuses: none — all 66 display names resolved`);
  }

  console.log(`\nper-campus plan (create/update):`);
  const sorted = [...perCampus.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, v] of sorted) console.log(`   ${name.padEnd(26)} +${String(v.create).padStart(3)} ~${String(v.update).padStart(3)}`);
  console.log(`   campuses matched: ${perCampus.size}`);

  if (orgCreates.size) {
    console.log(`\norg rows to create (first 20 of ${orgCreates.size}):`);
    for (const [name, v] of [...orgCreates.entries()].slice(0, 20)) console.log(`   ${name}${v.nickname ? ` (${v.nickname})` : ""} — ${v.rows} chapter(s)`);
  }

  if (!APPLY) { console.log(`\nDRY RUN — nothing written. Re-run with --apply after confirming these counts.`); return; }

  // --- write ---------------------------------------------------------------------------------
  console.log(`\nWRITING…`);
  let orgCreated = 0, created = 0, updated = 0, failed = 0;
  const newOrgIds = new Map<string, string>();
  for (const [name, v] of orgCreates) {
    const { data, error } = await db.from("greek_orgs").insert({ name, nickname: v.nickname }).select("id").single();
    if (error) { failed++; console.error(`  ORG FAIL ${name}: ${error.message}`); continue; }
    newOrgIds.set(greekChapterSlug(name), data.id as string);
    orgCreated++;
  }
  for (const u of updates) {
    const { error } = await db.from("campus_greek_chapters").update(u.patch).eq("id", u.chapterId);
    if (error) { failed++; if (failed <= 8) console.error(`  UPDATE FAIL ${u.campus}/${u.org}: ${error.message}`); } else updated++;
  }
  for (const ins of inserts) {
    const orgId = ins.existingOrgId ?? newOrgIds.get(greekChapterSlug(ins.org)) ?? null;
    if (!orgId) { failed++; console.error(`  INSERT FAIL ${ins.campus.short_name}/${ins.org}: no org id`); continue; }
    const { error } = await db.from("campus_greek_chapters").insert({ ...ins.row, greek_org_id: orgId });
    if (error) { failed++; if (failed <= 8) console.error(`  INSERT FAIL ${ins.campus.short_name}/${ins.org}: ${error.message}`); } else created++;
  }
  console.log(`\norgs created ${orgCreated}, chapters created ${created}, updated ${updated}, failed ${failed}`);

  // --- verify --------------------------------------------------------------------------------
  const { count: after } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true });
  const { count: withFlags } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true }).not("as_of", "is", null);
  console.log(`VERIFY: chapter rows now ${after}; rows carrying as_of ${withFlags}`);
};

main().catch((e) => { console.error("IMPORT FAILED:", e); process.exit(1); });
