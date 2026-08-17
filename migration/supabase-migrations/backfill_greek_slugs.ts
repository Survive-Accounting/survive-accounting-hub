// Backfill campus_greek_chapters.slug — the chapter half of /go/<campus.slug>/<chapter.slug>.
//
// DRY-RUN BY DEFAULT. Writes nothing unless --apply is passed.
//   bun run migration/supabase-migrations/backfill_greek_slugs.ts            # dry run + report
//   bun run migration/supabase-migrations/backfill_greek_slugs.ts --apply    # write
//
// Requires 0115 (the slug column). Idempotent: rows that already have a slug are never rewritten,
// so re-running after adding campuses only fills the new ones. Never deletes, never renames.
//
// SLUG SOURCE — audited before writing (see /tmp probe in the Phase 1 session):
//   * every one of the 1,107 rows has a greek_org_id (0 missing globally), so the org name is
//     always reachable;
//   * greek_orgs.letters is empty across the board — unusable;
//   * greek_orgs.nickname is present for maybe half ("Phi Psi", "KD", "AOII") and absent for the
//     NPHC orgs, so using it would give a URL scheme that changes shape depending on which council
//     a chapter belongs to.
//   => the full org NAME is the only consistent source. "Alpha Kappa Alpha Sorority, Inc." becomes
//      alpha-kappa-alpha: predictable, readable, and the same shape for every council.
import { createClient } from "@supabase/supabase-js";

// The rule itself lives in src/ and is unit-tested (greek-slug.test.ts). It is imported rather than
// re-implemented here so a printed URL can never disagree with the code that generated it.
import { greekChapterSlug as orgSlug } from "../../src/lib/greek-slug";

const APPLY = process.argv.includes("--apply");

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** PostgREST caps a response at 1,000 rows regardless of `.limit()`. A plain `.limit(5000)` on a
 *  1,107-row table returns 1,000 and reports no error — so 107 chapters would silently get no slug
 *  and no /go/ page, and the run would print a confident "written 1000". This repo has hit that cap
 *  before (623d2a9 "fix 1000-row cap"); every full-table read here pages explicitly. */
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

type Row = { id: string; campus_id: string; greek_org_id: string | null; slug: string | null; chapter_designation: string | null };

const main = async () => {
  console.log(`=== GREEK SLUG BACKFILL (${APPLY ? "APPLY" : "DRY RUN — nothing will be written"}) ===\n`);

  let all: Row[];
  try {
    all = await fetchAll<Row>("campus_greek_chapters", "id,campus_id,greek_org_id,slug,chapter_designation");
  } catch (e) { console.error("read failed — is 0115 applied?", (e as Error).message); process.exit(1); }

  // Cross-check the paged read against the server's own count. If these ever disagree the run is
  // working from a partial picture and must not write.
  const { count: exact } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true });
  console.log(`rows fetched ${all.length} / server count ${exact}`);
  if (exact != null && all.length !== exact) { console.error("ABORT: paged read is incomplete — refusing to write a partial backfill."); process.exit(1); }

  const orgs = await fetchAll<{ id: string; name: string | null }>("greek_orgs", "id,name");
  const orgName = new Map<string, string>(orgs.map((o) => [o.id, (o.name ?? "").trim()]));
  const camps = await fetchAll<{ id: string; slug: string | null; name: string }>("campuses", "id,slug,name");
  const campusSlug = new Map<string, string>(camps.map((c) => [c.id, c.slug ?? ""]));

  // Slugs already in use, per campus — so a re-run cannot collide with a previous run's writes.
  const taken = new Map<string, Set<string>>();
  for (const r of all) {
    if (!r.slug) continue;
    if (!taken.has(r.campus_id)) taken.set(r.campus_id, new Set());
    taken.get(r.campus_id)!.add(r.slug);
  }

  const plan: Array<{ id: string; campus: string; slug: string; from: string }> = [];
  const skipped: Array<{ id: string; why: string }> = [];
  let already = 0;

  for (const r of all) {
    if (r.slug) { already++; continue; }
    const name = r.greek_org_id ? (orgName.get(r.greek_org_id) ?? "") : "";
    if (!name) { skipped.push({ id: r.id, why: "no greek_org_id / no org name" }); continue; }
    const base = orgSlug(name);
    if (!base) { skipped.push({ id: r.id, why: `org name "${name}" slugified to empty` }); continue; }

    if (!taken.has(r.campus_id)) taken.set(r.campus_id, new Set());
    const used = taken.get(r.campus_id)!;
    // Two chapters of the same org at one campus is rare but real (colonies, re-charters). The
    // designation disambiguates when it exists; a counter is the last resort. Never a random id —
    // these URLs go on printed flyers.
    let slug = base;
    if (used.has(slug) && r.chapter_designation) {
      const d = orgSlug(r.chapter_designation);
      if (d) slug = `${base}-${d}`;
    }
    for (let i = 2; used.has(slug) && i < 50; i++) slug = `${base}-${i}`;
    used.add(slug);
    plan.push({ id: r.id, campus: campusSlug.get(r.campus_id) ?? "(no campus slug)", slug, from: name });
  }

  console.log(`rows total            ${all.length}`);
  console.log(`already had a slug    ${already}`);
  console.log(`to write              ${plan.length}`);
  console.log(`skipped               ${skipped.length}`);

  // Campuses with no slug of their own can't produce a reachable /go/ URL — worth naming rather
  // than silently writing chapter slugs that nothing can route to.
  const noCampusSlug = plan.filter((p) => p.campus === "(no campus slug)").length;
  if (noCampusSlug) console.log(`\nWARNING: ${noCampusSlug} chapter(s) sit on a campus with no campuses.slug — their /go/ URL will not resolve until that campus gets a slug.`);

  console.log("\nfirst 25 of the plan:");
  for (const p of plan.slice(0, 25)) console.log(`  /go/${p.campus}/${p.slug}   <- ${p.from}`);

  if (skipped.length) {
    console.log("\nskipped (first 15):");
    for (const s of skipped.slice(0, 15)) console.log(`  ${s.id}  ${s.why}`);
  }

  // Collision self-check: the whole point of the per-campus unique index is that this can't happen.
  const seen = new Set<string>();
  const dupes = plan.filter((p) => { const k = `${p.campus}/${p.slug}`; if (seen.has(k)) return true; seen.add(k); return false; });
  console.log(`\ncollisions in plan: ${dupes.length}${dupes.length ? "  <- BUG, not writing" : ""}`);
  if (dupes.length) { for (const d of dupes.slice(0, 10)) console.log(`  ${d.campus}/${d.slug}`); process.exit(1); }

  if (!APPLY) { console.log("\nDRY RUN — nothing written. Re-run with --apply to write."); return; }

  let written = 0, failed = 0;
  for (const p of plan) {
    const { error: e } = await db.from("campus_greek_chapters").update({ slug: p.slug }).eq("id", p.id);
    if (e) { failed++; if (failed <= 5) console.error(`  FAIL ${p.id}: ${e.message}`); } else written++;
  }
  console.log(`\nwritten ${written}, failed ${failed}`);

  const { count: withSlug } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true }).not("slug", "is", null);
  console.log(`VERIFY: rows with a slug now = ${withSlug} / ${all.length}`);
};

main().catch((e) => { console.error("BACKFILL FAILED:", e); process.exit(1); });
