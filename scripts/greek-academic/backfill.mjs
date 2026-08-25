#!/usr/bin/env node
/**
 * Greek Academic Intelligence — roster backfill + in-place re-match.
 *
 * The UNMATCHED-with-GPA rows are chapters whose national org EXISTS in greek_orgs
 * but is absent from that campus's roster. Resolve each against the national
 * catalog, create the missing campus_greek_chapters rows (confidently-resolved
 * only — noise/local names go to review), then re-match every academic row in
 * place. Pure DB operation: NO SERP/Firecrawl/AI cost.
 *
 *   node backfill.mjs --dry-run   # size it, write nothing
 *   node backfill.mjs             # create roster rows + re-match
 *
 * Safety: new rows use on_conflict(campus_id,greek_org_id) DO NOTHING (never
 * clobbers existing roster or a concurrent session's writes); marked
 * verified=false, discovery_source='greek_academic_backfill', with source_url.
 */
import { loadGreekOrgs, loadCampusChapters, rest } from "./db.mjs";
import { matchChapter, chapterKeys } from "./match.mjs";

const DRY = process.argv.includes("--dry-run");
const enc = encodeURIComponent;
const today = new Date().toISOString().slice(0, 10);

async function pageAll(table, select, filter = "") {
  const out = []; let off = 0;
  for (;;) {
    const rows = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=1000&offset=${off}`);
    out.push(...rows); if (rows.length < 1000) break; off += 1000;
  }
  return out;
}
const nk = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function main() {
  const orgMap = await loadGreekOrgs();
  const orgs = [...orgMap.values()];
  const pseudo = orgs.map((o) => ({ id: o.id, greek_org_id: o.id, chapter_designation: o.name, council: o.council, nickname: o.nickname, letters: o.letters, greek_orgs: o }));
  const orgKeys = pseudo.map(chapterKeys);

  const acad = await pageAll("greek_chapter_academics", "id,campus_id,chapter_name_as_reported,council,council_normalized,match_status,chapter_gpa,source_url");
  const unmatched = acad.filter((a) => a.match_status === "UNMATCHED" && a.chapter_gpa != null);

  // distinct (campus, normalized name) → resolve to national org
  const distinct = new Map();
  for (const a of unmatched) { const k = `${a.campus_id}|${nk(a.chapter_name_as_reported)}`; if (!distinct.has(k)) distinct.set(k, a); }

  // existing roster (campus_id, greek_org_id) to skip
  const existing = new Set((await pageAll("campus_greek_chapters", "campus_id,greek_org_id", "&greek_org_id=not.is.null")).map((r) => `${r.campus_id}|${r.greek_org_id}`));

  const toCreate = new Map(); // `${campus}|${org}` → row
  let review = 0, unresolved = 0;
  for (const a of distinct.values()) {
    const m = matchChapter(a.chapter_name_as_reported, a.council, pseudo, orgKeys);
    if (m.matchStatus !== "MATCHED" || !m.orgId) { if (m.matchStatus === "NEEDS_REVIEW") review++; else unresolved++; continue; }
    const key = `${a.campus_id}|${m.orgId}`;
    if (existing.has(key) || toCreate.has(key)) continue;
    const org = orgMap.get(m.orgId);
    toCreate.set(key, {
      campus_id: a.campus_id, greek_org_id: m.orgId,
      chapter_designation: null,               // report gives org, not the chapter-letter designation
      council: a.council || null,
      letters: org?.letters || null, nickname: org?.nickname || null,
      status: "unknown", enrichment_status: "pending",
      discovery_source: "greek_academic_backfill", is_national_org: true,
      verified: false, source_url: a.source_url || null, as_of: today,
      notes: `Backfilled from public FSL academic report (${a.chapter_name_as_reported}).`,
    });
  }

  console.log(`[backfill] distinct unmatched (campus,name): ${distinct.size}`);
  console.log(`[backfill] resolved→national org & NEW: ${toCreate.size} | review: ${review} | unresolved(noise/local): ${unresolved}`);
  const affectedCampuses = new Set([...toCreate.values()].map((r) => r.campus_id));
  console.log(`[backfill] affected campuses: ${affectedCampuses.size}`);

  if (DRY) {
    console.log("[dry-run] sample new roster rows:");
    [...toCreate.values()].slice(0, 10).forEach((r) => console.log(`   campus=${r.campus_id.slice(0, 8)} org=${orgMap.get(r.greek_org_id)?.name} council=${r.council}`));
    return;
  }

  // ── Phase 1: create roster rows (on_conflict do nothing) ────────────────────
  const rows = [...toCreate.values()];
  let created = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const res = await rest("POST", "campus_greek_chapters?on_conflict=campus_id,greek_org_id",
      { body: batch, prefer: "resolution=ignore-duplicates,return=representation" });
    created += Array.isArray(res) ? res.length : 0;
  }
  console.log(`[backfill] created ${created} campus_greek_chapters rows.`);

  // ── Phase 2: re-match academic rows for affected campuses (DB-only) ──────────
  let updated = 0, nowMatched = 0;
  for (const campusId of affectedCampuses) {
    const roster = await loadCampusChapters(campusId);
    const keys = roster.map(chapterKeys);
    const campusRows = acad.filter((a) => a.campus_id === campusId);
    const patches = [];
    for (const a of campusRows) {
      if (a.match_status === "MATCHED") continue; // don't disturb existing good matches
      const m = matchChapter(a.chapter_name_as_reported, a.council, roster, keys);
      if (m.matchStatus !== a.match_status || m.chapterId) {
        if (m.matchStatus === "MATCHED") nowMatched++;
        patches.push({ id: a.id, campus_greek_chapter_id: m.chapterId, greek_org_id: m.orgId, canonical_chapter_name: m.canonicalName, council_normalized: m.council_normalized || a.council_normalized, match_status: m.matchStatus, match_confidence: m.matchConfidence, updated_at: new Date().toISOString() });
      }
    }
    for (const p of patches) {
      const { id, ...body } = p;
      await rest("PATCH", `greek_chapter_academics?id=eq.${id}`, { body, prefer: "return=minimal" });
      updated++;
    }
  }
  console.log(`[backfill] re-matched: ${updated} academic rows updated; ${nowMatched} newly MATCHED.`);
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
