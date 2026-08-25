// Officer extraction pass (run after the main pipeline; does NOT re-match).
//   bun run scripts/greek-990/officers.ts
// 1. Extracts officers/directors from cached IRS 990 XML zips for all linked EINs.
// 2. Migrates any existing hand-extracted officers (greek_org_people) into the new
//    normalized model where their chapter's EIN maps to a legal entity (reuse, brief §1).
import { dataQuery } from "./_db";
import { extractOfficersForEins } from "./lib/xml-index";
import { upsertOfficers } from "./lib/persist";
import { normalizePersonName, normalizeTitle } from "./lib/xml990";

const entities = await dataQuery<any>(`greek_legal_entity?select=id,ein,entity_type`);
const meta = new Map<string, { id: string; type: string }>();
for (const e of entities) meta.set(e.ein, { id: e.id, type: e.entity_type });
const eins = new Set(entities.map((e: any) => e.ein));
console.log(`Target EINs: ${eins.size}`);

// ── 1. IRS 990 XML zips ───────────────────────────────────────────────────────
console.log("\n── IRS 990 XML extraction ──");
const found = await extractOfficersForEins(eins);
let people = 0, ents = 0;
for (const [ein, filings] of found) {
  const m = meta.get(ein);
  if (!m) continue;
  ents++;
  for (const fil of filings) {
    people += await upsertOfficers(m.id, ein, m.type, fil.taxYear, fil.officers, "IRS_990_XML");
  }
}
console.log(`IRS XML: ${people} officer records across ${ents} entities.`);

// ── 2. Migrate existing hand-extracted officers (greek_org_people) ────────────
console.log("\n── Migrating existing greek_org_people ──");
// chapter_id → ein (from the flat legacy field on the canonical roster)
const chapters = await dataQuery<any>(`campus_greek_chapters?ein=not.is.null&select=id,ein`);
const einByChapter = new Map<string, string>();
for (const c of chapters) if (c.ein) einByChapter.set(c.id, String(c.ein).replace(/\D/g, ""));

const legacy = await dataQuery<any>(`greek_org_people?select=chapter_id,person_name,titles,years,first_year,last_year,is_current,source`);
let migrated = 0, skipped = 0;
for (const p of legacy) {
  const ein = p.chapter_id ? einByChapter.get(p.chapter_id) : null;
  const m = ein ? meta.get(ein) : null;
  if (!m) { skipped++; continue; }
  const title = (p.titles || [])[0] || "";
  const years: number[] = (p.years || []).map((y: any) => Number(y)).filter((y: number) => Number.isFinite(y));
  const off = [{
    name: p.person_name, title,
    isOfficer: /President|Vice President|Treasurer|Secretary/i.test(normalizeTitle(title)),
    isDirector: /Director|Trustee/i.test(normalizeTitle(title)),
    isKeyEmployee: false, hoursPerWeek: null, compensation: null,
  }];
  const yr = years.length ? Math.max(...years) : (p.last_year || 0);
  await upsertOfficers(m.id, ein!, m.type, yr, off, "PROPUBLICA_OFFICERS_MIGRATED");
  void normalizePersonName; // (normalization handled inside upsertOfficers)
  migrated++;
}
console.log(`Migrated ${migrated} legacy officer records (${skipped} had no EIN-mapped entity).`);

const total = await dataQuery<any>(`greek_990_officer?select=id`);
console.log(`\nTotal officers in greek_990_officer: ${total.length}`);
