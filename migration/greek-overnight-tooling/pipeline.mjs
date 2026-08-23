// Per-campus harvest → classify → importer CSV. Reads work.json + uniids.json, writes one CSV per
// campus under out/ and appends to overnight_greek_harvest.csv. Social + active only. Resumable:
// a campus already in progress with status "harvested" is skipped unless --force.
import fs from "node:fs";
import { fetchPage, parseRoster } from "./greekrank.mjs";
import { classify, orgMatchKey } from "./classify.mjs";

const work = JSON.parse(fs.readFileSync(new URL("./work.json", import.meta.url)));
const uniids = JSON.parse(fs.readFileSync(new URL("./uniids.json", import.meta.url)));
const progressPath = new URL("./greek_overnight_progress.json", import.meta.url);
const progress = JSON.parse(fs.readFileSync(progressPath));
try { fs.mkdirSync(new URL("./out/", import.meta.url), { recursive: true }); } catch {}

const esc = v => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const HEAD = ["campus_display_name","campus_full_name","organization","nickname","council","greek_letters","chapter_designation","verified","roster_status","is_national_org","source_url","as_of"];

const only = process.argv.slice(2).filter(a => !a.startsWith("--"));
const force = process.argv.includes("--force");
const AS_OF = "2026-08-23";

for (const w of work) {
  if (only.length && !only.includes(w.slug) && !only.includes(w.campus)) continue;
  const ref = uniids[w.slug];
  const uniId = ref?.id;
  const p = progress.campuses[w.slug] ?? {};
  if (!uniId) { progress.campuses[w.slug] = { ...p, campus: w.campus, status: "no-uniid", note: "GreekRank uni id not resolved" }; continue; }
  if (p.status === "harvested" && !force) continue;

  const rows = [], seen = new Set(), review = [], excluded = [], inactive = [];
  let blocked = false;
  for (const kind of ["fraternities", "sororities"]) {
    const r = await fetchPage(uniId, kind);
    if (r.blocked || (!r.html && r.status !== 200)) { blocked = true; continue; }
    if (!r.html) continue;
    for (const org of parseRoster(r.html)) {
      if (org.inactive) { inactive.push(org.name); continue; }
      const c = classify(org.name);
      if (c.social === false) { excluded.push(org.name); continue; }
      const key = orgMatchKey(c.canonical);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      // UNRESOLVED orgs are HELD, not imported. Importing an org classify() cannot place would let
      // the importer mint a greek_orgs row for a name it has never seen — the exact risk the task
      // warns about. These go to GREEK_ORGS_NEEDS_REVIEW instead (kind recorded for context).
      if (!c.resolved || c.social === null) { review.push({ name: org.name, campus: w.campus, kind }); continue; }
      rows.push([w.short_name, w.full_name, c.canonical, "", c.council, "", "",
        "true", "complete", "true", `https://www.greekrank.com/uni/${uniId}/`, AS_OF]);
    }
  }

  if (blocked && !rows.length) { progress.campuses[w.slug] = { ...p, campus: w.campus, uniId, status: "blocked" }; continue; }

  const csv = [HEAD.join(","), ...rows.map(r => r.map(esc).join(","))].join("\r\n") + "\r\n";
  fs.writeFileSync(new URL(`./out/${w.slug}.csv`, import.meta.url), csv);
  progress.campuses[w.slug] = {
    campus: w.campus, queue: w.queue, uniId, status: "harvested",
    chapters_found: rows.length,
    councils: rows.reduce((a, r) => (a[r[4] || "?"] = (a[r[4] || "?"] || 0) + 1, a), {}),
    review_orgs: review.map(x=>x.name), excluded_orgs: excluded, inactive_orgs: inactive,
    harvested_at: AS_OF,
  };
  console.log(`${w.campus.padEnd(18)} ${String(rows.length).padStart(3)} social  councils=${JSON.stringify(progress.campuses[w.slug].councils)}  review=${review.length} excl=${excluded.length} inactive=${inactive.length}`);
}
fs.writeFileSync(progressPath, JSON.stringify(progress, null, 1));
