#!/usr/bin/env node
/**
 * Step 1a — Textbook edition worklist (ZERO API credits).
 * Reads campuses.course_family_textbooks_json (read-only), normalizes each
 * intro_1 textbook to a stable edition identity, and collapses the ~170
 * campuses onto the distinct editions we actually need TOCs for.
 *
 * Env: reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from an env file
 *      (path via argv[2], default ".env"). Read-only PostgREST; no writes.
 * Out: writes edition_worklist.json next to this script's --out (argv[3]).
 */
import fs from "node:fs";
import { normalizeTextbook } from "./lib.mjs";

const envPath = process.argv[2] || ".env";
const outPath = process.argv[3] || "edition_worklist.json";
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in", envPath); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function pullAll(sel, extra = "") {
  const rows = []; let from = 0; const page = 1000;
  for (;;) {
    const r = await fetch(`${URL}/rest/v1/campuses?select=${sel}${extra}`, { headers: { ...H, Range: `${from}-${from + page - 1}` } });
    if (!r.ok) { console.error("pull error", r.status, (await r.text()).slice(0, 200)); break; }
    const b = await r.json(); rows.push(...b); if (b.length < page) break; from += page;
  }
  return rows;
}

const FAMILIES = ["intro_1", "intro_2", "intermediate_1", "intermediate_2"];
const campuses = await pullAll("id,name,state,course_family_textbooks_json", "&country=in.(United States,US,USA)");

const editions = new Map(); // editionKey -> {…, campuses:[], families:Set}
let campusWithBook = 0;
for (const c of campuses) {
  let j = c.course_family_textbooks_json;
  if (typeof j === "string") { try { j = JSON.parse(j); } catch { j = null; } }
  if (!j || typeof j !== "object") continue;
  let any = false;
  for (const fam of FAMILIES) {
    const b = j[fam];
    if (!b || !b.title) continue;
    any = true;
    const norm = normalizeTextbook({ title: b.title, authors: b.authors, isbn: b.isbn13 || b.isbn, publisher: b.publisher });
    const key = `${fam}::${norm.editionKey}`;
    if (!editions.has(key)) {
      editions.set(key, {
        family: fam, editionKey: norm.editionKey, canonicalTitle: norm.canonicalTitle,
        authorKey: norm.authorKey, edition: norm.edition, editionConfirmed: norm.editionConfirmed,
        publisher: norm.publisher, isbns: new Set(), rawTitles: new Set(), campuses: [],
      });
    }
    const e = editions.get(key);
    if (norm.isbn13) e.isbns.add(norm.isbn13);
    e.rawTitles.add(b.title);
    e.campuses.push({ id: c.id, name: c.name, state: c.state });
  }
  if (any) campusWithBook++;
}

const list = [...editions.values()]
  .map(e => ({ ...e, isbns: [...e.isbns], rawTitles: [...e.rawTitles], campusCount: e.campuses.length }))
  .sort((a, b) => b.campusCount - a.campusCount);

const intro1 = list.filter(e => e.family === "intro_1");
fs.writeFileSync(outPath, JSON.stringify({
  generatedFrom: `${campuses.length} US campuses; ${campusWithBook} have textbook data`,
  totalDistinctEditions: list.length,
  intro1DistinctEditions: intro1.length,
  editions: list,
}, null, 1));

console.log(`US campuses: ${campuses.length}; with textbook data: ${campusWithBook}`);
console.log(`Distinct editions (all families): ${list.length}; intro_1: ${intro1.length}`);
const cov = (n) => { const s = intro1.slice(0, n).reduce((a, e) => a + e.campusCount, 0); const t = intro1.reduce((a, e) => a + e.campusCount, 0); return `${s}/${t} (${Math.round(100 * s / t)}%)`; };
console.log(`intro_1 coverage — top 5 editions: ${cov(5)}; top 10: ${cov(10)}; top 20: ${cov(20)}`);
console.log(`\nTOP 15 intro_1 editions to harvest TOCs for:`);
for (const e of intro1.slice(0, 15))
  console.log(`  ${String(e.campusCount).padStart(3)} campuses  ${(e.canonicalTitle).slice(0, 34).padEnd(35)} [${e.authorKey}] ed=${e.edition ?? "?"} isbns=${e.isbns.length}`);
console.log(`\nEditions with UNKNOWN edition number (need confirmation): ${intro1.filter(e => !e.editionConfirmed).length}/${intro1.length}`);
console.log(`Wrote ${outPath}`);
