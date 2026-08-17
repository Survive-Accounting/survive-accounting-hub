// READ-ONLY post-migration verification for Greek Phase 1. Writes nothing.
//
//   bun run migration/supabase-migrations/verify_greek_phase1.ts
//
// Run AFTER 0115 and AFTER the slug backfill. Checks the things Lee asked to have proven rather
// than asserted: that 0115 actually landed, that every roster chapter can produce a reachable /go/
// URL, and that the membership invariant holds — one account per student, chapter membership as an
// attribute, zero duplicated or orphaned member rows.
//
// Exits non-zero if any invariant fails, so it can gate a merge.
import { createClient } from "@supabase/supabase-js";

// Imported so this file can distinguish a chapter the backfill deliberately skipped (a duplicate
// roster row) from one it missed. Without that, the 14 known duplicates read as a permanent
// failure, and a verifier that always fails is a verifier nobody reads.
import { greekChapterSlug } from "../../src/lib/greek-slug";

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

/** PostgREST caps a response at 1,000 rows regardless of `.limit()`. In a VERIFIER that is worse
 *  than a slow query: a truncated read makes every "no duplicates / no orphans" check pass by
 *  simply not looking at the rest of the table. Every full-table read here pages explicitly and is
 *  cross-checked against the server's own exact count. */
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

let failures = 0;
const check = (ok: boolean, label: string, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const main = async () => {
  console.log("=== GREEK PHASE 1 VERIFICATION (read-only) ===\n");

  // ── 1. did 0115 land? ──────────────────────────────────────────────────────────────────────
  const { error: colErr } = await db.from("campus_greek_chapters").select("slug,claim_status,claimed_at").limit(1);
  check(!colErr, "0115 applied (campus_greek_chapters.slug / claim_status exist)", colErr?.message ?? "");
  const { error: memErr } = await db.from("greek_chapter_members").select("user_id,source,tagged_at,seat_assigned_at").limit(1);
  check(!memErr, "0115 applied (greek_chapter_members.user_id / source exist)", memErr?.message ?? "");
  const { error: claimErr } = await db.from("greek_chapter_claims").select("id").limit(1);
  check(!claimErr, "0115 applied (greek_chapter_claims table exists)", claimErr?.message ?? "");
  if (colErr || memErr) { console.log("\nStopping — 0115 is not applied."); process.exit(1); }

  // ── 2. slugs ───────────────────────────────────────────────────────────────────────────────
  const { count: total } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true });
  const { count: slugged } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true }).not("slug", "is", null);
  console.log(`\ncampus_greek_chapters: ${slugged} / ${total} have a slug`);
  check((slugged ?? 0) > 0, "backfill has run");

  const { data: sec } = await db.from("campuses").select("id,slug,name").eq("is_sec", true);
  const secIds = (sec ?? []).map((c) => (c as { id: string }).id);
  const { count: secTotal } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true }).in("campus_id", secIds);
  const { count: secSlugged } = await db.from("campus_greek_chapters").select("*", { count: "exact", head: true }).in("campus_id", secIds).not("slug", "is", null);
  console.log(`SEC campuses:          ${secSlugged} / ${secTotal} have a slug`);
  // An unslugged SEC row is EXPECTED when another row at the same campus already owns the slug
  // its org name produces — that is the duplicate-roster-row case (greek_orgs holds ten orgs
  // twice; at 14 campuses both records are referenced). Anything else is a real miss.
  const secSet = new Set(secIds);
  const rosterAll = await fetchAll<{ id: string; campus_id: string; slug: string | null; greek_org_id: string | null }>("campus_greek_chapters", "id,campus_id,slug,greek_org_id");
  const orgRows = await fetchAll<{ id: string; name: string | null }>("greek_orgs", "id,name");
  const orgNames = new Map<string, string>(orgRows.map((o) => [o.id, (o.name ?? "").trim()]));
  const slugTaken = new Set(rosterAll.filter((r) => r.slug).map((r) => `${r.campus_id}/${r.slug}`));
  const secMissing = rosterAll.filter((r) => secSet.has(r.campus_id) && !r.slug);
  const expectedDupes = secMissing.filter((r) => {
    const n = r.greek_org_id ? (orgNames.get(r.greek_org_id) ?? "") : "";
    return !!n && slugTaken.has(`${r.campus_id}/${greekChapterSlug(n)}`);
  });
  const realMisses = secMissing.length - expectedDupes.length;
  console.log(`  of the ${secMissing.length} unslugged SEC row(s): ${expectedDupes.length} are known duplicates, ${realMisses} unexplained`);
  check(realMisses === 0, "every SEC chapter has a slug (duplicates excluded by design)", realMisses ? `${realMisses} unexplained` : "");

  // A slug on a campus with no campuses.slug produces a URL nothing can route to.
  const noCampusSlug = (sec ?? []).filter((c) => !(c as { slug: string | null }).slug);
  check(noCampusSlug.length === 0, "every SEC campus has its own slug", noCampusSlug.map((c) => (c as { name: string }).name).join(", "));

  // Per-campus uniqueness — the partial unique index should make this impossible, so a hit here
  // means the index did not get created.
  const allSlugs = await fetchAll<{ campus_id: string; slug: string | null }>("campus_greek_chapters", "campus_id,slug");
  check(allSlugs.length === (total ?? -1), "slug check saw EVERY row (no 1000-row truncation)", `read ${allSlugs.length} of ${total}`);
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const r of allSlugs.filter((x) => x.slug) as Array<{ campus_id: string; slug: string }>) {
    const k = `${r.campus_id}/${r.slug}`;
    if (seen.has(k)) dupes.push(k); else seen.add(k);
  }
  check(dupes.length === 0, "no duplicate (campus, slug) pairs", dupes.slice(0, 5).join(", "));

  // ── 3. THE INVARIANT ───────────────────────────────────────────────────────────────────────
  const mem = await fetchAll<{ id: string; chapter_id: string | null; user_id: string | null; phone: string | null; source: string | null }>("greek_chapter_members", "id,chapter_id,user_id,phone,source");
  const { count: memCount } = await db.from("greek_chapter_members").select("*", { count: "exact", head: true });
  console.log(`\ngreek_chapter_members: ${mem.length} rows`);
  check(mem.length === (memCount ?? -1), "membership checks saw EVERY row (no 1000-row truncation)", `read ${mem.length} of ${memCount}`);

  // one account, one membership per chapter
  const pairs = new Set<string>();
  const dupPairs: string[] = [];
  for (const m of mem) {
    if (!m.user_id) continue;
    const k = `${m.chapter_id}/${m.user_id}`;
    if (pairs.has(k)) dupPairs.push(k); else pairs.add(k);
  }
  check(dupPairs.length === 0, "no account is a member of the same chapter twice", dupPairs.slice(0, 5).join(", "));

  // no orphans: every member points at a chapter that exists
  const chs = await fetchAll<{ id: string; campus_greek_chapter_id: string | null; claim_status: string | null; slug: string | null }>("greek_chapters", "id,campus_greek_chapter_id,claim_status,slug");
  const chapterIds = new Set(chs.map((c) => c.id));
  const orphans = mem.filter((m) => !m.chapter_id || !chapterIds.has(m.chapter_id));
  check(orphans.length === 0, "no orphaned member rows", `${orphans.length} orphan(s)`);

  // every chapter record binds to exactly one roster row
  const chList = chs;
  const bound = new Set<string>();
  const dupBind: string[] = [];
  for (const c of chList) {
    if (!c.campus_greek_chapter_id) continue;
    if (bound.has(c.campus_greek_chapter_id)) dupBind.push(c.campus_greek_chapter_id); else bound.add(c.campus_greek_chapter_id);
  }
  check(dupBind.length === 0, "no roster chapter has two greek_chapters rows", dupBind.slice(0, 5).join(", "));
  console.log(`greek_chapters:        ${chList.length} rows (${chList.filter((c) => c.claim_status === "claimed").length} claimed, ${chList.filter((c) => !c.campus_greek_chapter_id).length} with no roster row)`);

  // attribution split, reported as-is
  const bySource = mem.reduce<Record<string, number>>((a, m) => { const k = m.source ?? "(null)"; a[k] = (a[k] ?? 0) + 1; return a; }, {});
  console.log(`attribution:           ${Object.entries(bySource).map(([k, v]) => `${k}=${v}`).join("  ") || "(no members yet)"}`);

  // ── 4. a real /go/ URL to open by hand ─────────────────────────────────────────────────────
  const om = (sec ?? []).find((c) => /Mississippi$/i.test((c as { name: string }).name));
  if (om) {
    const { data: sample } = await db.from("campus_greek_chapters").select("slug").eq("campus_id", (om as { id: string }).id).not("slug", "is", null).limit(3);
    console.log("\nsample URLs to open:");
    for (const s of (sample ?? []) as Array<{ slug: string }>) console.log(`  https://surviveaccounting.com/go/${(om as { slug: string }).slug}/${s.slug}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((e) => { console.error("VERIFY FAILED:", e); process.exit(1); });
