#!/usr/bin/env node
/**
 * Seed textbook editions + TOCs + chapter→topic mappings from
 * toc-and-mappings.json into the DB tables from the 20260823_1730 migration.
 *
 * DRY-RUN BY DEFAULT: reads live data read-only (to resolve Survive topic
 * labels → chapters rows), prints the full plan, and writes NOTHING. Pass
 * --apply to actually upsert (idempotent on edition_key / chapter_key /
 * (chapter,topic)). All mapping rows are written state='proposed'.
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from an env file
 *      (argv env path via --env, default ../../.env relative to cwd).
 *
 * Usage:
 *   node seed-textbook-mappings.mjs --env <path/.env>            # dry-run
 *   node seed-textbook-mappings.mjs --env <path/.env> --apply    # writes
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const envPath = (() => { const i = args.indexOf("--env"); return i >= 0 ? args[i + 1] : ".env"; })();
const here = path.dirname(fileURLToPath(import.meta.url));

const env = {};
for (const l of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const URL = env.SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in", envPath); process.exit(1); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const data = JSON.parse(fs.readFileSync(path.join(here, "toc-and-mappings.json"), "utf8"));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// ---- read-only: resolve Survive intro_1 Units (chapters) for topic linking ----
async function get(q) { const r = await fetch(`${URL}/rest/v1/${q}`, { headers: H }); return r.ok ? r.json() : []; }
const courses = await get("courses?select=id,course_family");
const intro1 = courses.find(c => c.course_family === "intro_1");
let units = [];
if (intro1) units = await get(`chapters?select=id,chapter_name,chapter_number&course_id=eq.${intro1.id}`);
const unitByNorm = new Map(units.map(u => [norm(u.chapter_name || ""), u]));
function resolveTopic(label) {
  const n = norm(label);
  if (unitByNorm.has(n)) return unitByNorm.get(n);
  // loose contains match either direction
  for (const [k, u] of unitByNorm) if (k && (k.includes(n) || n.includes(k))) return u;
  return null;
}

// ---- build plan ----
let nTextbooks = 0, nChapters = 0, nMappings = 0, resolved = 0, unresolved = 0;
const plan = [];
for (const ed of data.editions) {
  nTextbooks++;
  const tb = { title: ed.title, edition: ed.edition_label, authors: ed.authors, publisher: ed.publisher,
    edition_key: ed.edition_key, edition_confirmed: false, toc_source_url: null };
  const chapters = [], mappings = [];
  for (const ch of ed.chapters) {
    nChapters++;
    const chapter_key = slug(ch.title);
    chapters.push({ chapter_key, number: ch.number, title: ch.title, position: ch.number });
    for (const t of ch.topics) {
      nMappings++;
      const u = resolveTopic(t.t);
      if (u) resolved++; else unresolved++;
      mappings.push({ chapter_key, survive_topic_label: t.t, survive_topic_id: u?.id || null,
        resolved_to: u?.chapter_name || null, confidence: t.c, state: "proposed",
        source: `${ed.authors} — ${ed.title} ${ed.edition_label}`, reason: "TOC chapter→canonical topic" });
    }
  }
  plan.push({ tb, chapters, mappings });
}

// ---- report ----
console.log(`Mode: ${APPLY ? "APPLY (writing)" : "DRY-RUN (no writes)"}`);
console.log(`Survive intro_1 Units loaded: ${units.length}${intro1 ? "" : " (WARN: no intro_1 course found)"}`);
console.log(`Plan: ${nTextbooks} textbook editions, ${nChapters} chapters, ${nMappings} topic-mappings`);
console.log(`Topic resolution to Survive Units: ${resolved} resolved / ${unresolved} label-only (${Math.round(100 * resolved / (resolved + unresolved))}%)`);
for (const p of plan) {
  console.log(`\n  • ${p.tb.authors} — ${p.tb.title} [${p.tb.edition}]  key=${p.tb.edition_key}`);
  console.log(`    ${p.chapters.length} chapters, ${p.mappings.length} mappings; sample: Ch1 "${p.chapters[0].title}" → ${p.mappings.filter(m=>m.chapter_key===p.chapters[0].chapter_key).map(m=>m.survive_topic_label+(m.resolved_to?`✓`:`·`)).join(", ")}`);
}

if (!APPLY) { console.log(`\nDRY-RUN complete. No rows written. Re-run with --apply to write (idempotent).`); process.exit(0); }

// ---- apply (idempotent upserts) ----
async function upsert(table, rows, onConflict) {
  const r = await fetch(`${URL}/rest/v1/${table}?on_conflict=${onConflict}`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(rows) });
  if (!r.ok) throw new Error(`${table} upsert ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
for (const p of plan) {
  const [tb] = await upsert("textbooks", [p.tb], "edition_key");
  const chRows = p.chapters.map(c => ({ ...c, textbook_id: tb.id }));
  const chOut = await upsert("textbook_chapters", chRows, "textbook_id,chapter_key");
  const chId = new Map(chOut.map(c => [c.chapter_key, c.id]));
  const mapRows = p.mappings.map(m => ({ textbook_id: tb.id, textbook_chapter_id: chId.get(m.chapter_key),
    survive_topic_id: m.survive_topic_id, survive_topic_label: m.survive_topic_label,
    confidence: m.confidence, state: m.state, source: m.source, reason: m.reason }));
  await upsert("textbook_chapter_topic_mapping", mapRows, "textbook_chapter_id,survive_topic_label");
  console.log(`  applied: ${p.tb.edition_key} (${chRows.length} ch, ${mapRows.length} maps)`);
}
console.log("APPLY complete.");
