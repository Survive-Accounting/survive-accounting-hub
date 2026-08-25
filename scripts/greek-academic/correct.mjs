#!/usr/bin/env node
/**
 * Greek Academic Intelligence — targeted data-quality correction pass (no re-scrape).
 *   1. Flag implausible member counts (council/community totals) — preserve the value
 *      + provenance, add quality_flag 'member_count_implausible'.
 *   2. Re-match all academic rows with the fixed matcher (acronym-collision guard +
 *      chapter_designation guard), updating only rows whose match changed.
 *
 *   node correct.mjs --dry-run   # report, write nothing
 *   node correct.mjs
 */
import { loadGreekOrgs, loadCampusChapters, rest } from "./db.mjs";
import { matchChapter, chapterKeys, buildAmbiguousAcronyms, buildValidOrgNames } from "./match.mjs";

const DRY = process.argv.includes("--dry-run");
const enc = encodeURIComponent;
const MEMBER_CEILING = 700; // clean gap: legit chapters ≤531, council/aggregate mis-reads ≥1550

async function pageAll(table, select, filter = "") {
  const out = []; let off = 0;
  for (;;) { const rows = await rest("GET", `${table}?select=${enc(select)}${filter}&order=id.asc&limit=1000&offset=${off}`); out.push(...rows); if (rows.length < 1000) break; off += 1000; }
  return out;
}

async function main() {
  const orgMap = await loadGreekOrgs();
  const orgList = [...orgMap.values()];
  const mopts = { ambiguousAcr: buildAmbiguousAcronyms(orgList), validOrgNames: buildValidOrgNames(orgList) };
  console.log(`[correct] ambiguous acronyms: ${mopts.ambiguousAcr.size} | valid org names: ${mopts.validOrgNames.size}`);

  const acad = await pageAll("greek_chapter_academics",
    "id,campus_id,campus_greek_chapter_id,greek_org_id,chapter_name_as_reported,canonical_chapter_name,council,council_normalized,match_status,match_confidence,member_count,quality_flags");

  // ── 1. Member-count plausibility guard ──────────────────────────────────────
  const implausible = acad.filter((a) => a.member_count != null && a.member_count > MEMBER_CEILING && !(a.quality_flags || []).includes("member_count_implausible"));
  console.log(`[correct] member_count > ${MEMBER_CEILING}: ${implausible.length} rows to flag (value + provenance PRESERVED).`);
  if (!DRY) {
    for (const a of implausible) {
      const flags = [...(a.quality_flags || []), "member_count_implausible"];
      await rest("PATCH", `greek_chapter_academics?id=eq.${a.id}`, { body: { quality_flags: flags, updated_at: new Date().toISOString() }, prefer: "return=minimal" });
      a.quality_flags = flags;
    }
  }

  // ── 2. Re-match with fixed matcher ──────────────────────────────────────────
  const byCampus = new Map();
  for (const a of acad) { const arr = byCampus.get(a.campus_id) || []; arr.push(a); byCampus.set(a.campus_id, arr); }
  let changed = 0, falsePosCleared = 0, newlyMatched = 0, lostMatch = 0;
  const changes = [];
  for (const [campusId, rows] of byCampus) {
    const roster = await loadCampusChapters(campusId);
    const keys = roster.map(chapterKeys);
    for (const a of rows) {
      const m = matchChapter(a.chapter_name_as_reported, a.council, roster, keys, mopts);
      const chChanged = (m.chapterId || null) !== (a.campus_greek_chapter_id || null) || m.matchStatus !== a.match_status;
      if (!chChanged) continue;
      changed++;
      if (a.match_status === "MATCHED" && m.matchStatus !== "MATCHED") { lostMatch++; if (a.canonical_chapter_name !== m.canonicalName) falsePosCleared++; changes.push(`FP-CLEARED "${a.chapter_name_as_reported}" ✗→ was "${a.canonical_chapter_name}" now ${m.matchStatus}`); }
      else if (a.match_status !== "MATCHED" && m.matchStatus === "MATCHED") { newlyMatched++; }
      if (!DRY) {
        await rest("PATCH", `greek_chapter_academics?id=eq.${a.id}`, { body: {
          campus_greek_chapter_id: m.chapterId, greek_org_id: m.orgId, canonical_chapter_name: m.canonicalName,
          council_normalized: m.council_normalized || a.council_normalized, match_status: m.matchStatus, match_confidence: m.matchConfidence,
          updated_at: new Date().toISOString(),
        }, prefer: "return=minimal" });
      }
    }
  }
  console.log(`[correct] re-match: ${changed} rows changed | ${lostMatch} lost match (${falsePosCleared} false-positives cleared) | ${newlyMatched} newly matched`);
  changes.slice(0, 25).forEach((c) => console.log("   " + c));
  if (DRY) console.log("[dry-run] nothing written.");
}
main().catch((e) => { console.error("[fatal]", e); process.exit(1); });
