// Build GREEK_990_CHAPTER_AGGREGATES.json — one dashboard-ready row per chapter.
// ACCOUNT CONTEXT / ESCALATION RESERVE. Officer data is LATEST-990-REPORTED, never "current".
//   bun run scripts/greek-990/aggregates.ts
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataQuery } from "./_db";

const OUT = join(import.meta.dir, "..", "..");
const CUR_YEAR = 2026;

console.log("loading…");
const statuses = await dataQuery<any>(`greek_chapter_990_status?select=chapter_id,campus_id,status`);
const chapterIds = statuses.map((s: any) => s.chapter_id);
const chapters = await dataQuery<any>(`campus_greek_chapters?select=id,campus_id,greek_org_id,council,chapter_designation`);
const chapterById = new Map(chapters.map((c: any) => [c.id, c]));
const campuses = await dataQuery<any>(`campuses?select=id,name,canonical_name,display_name,state`);
const campusById = new Map(campuses.map((c: any) => [c.id, c.canonical_name || c.name || c.display_name || ""]));
const campusStateById = new Map(campuses.map((c: any) => [c.id, c.state || ""]));
const orgs = await dataQuery<any>(`greek_orgs?select=id,name`);
const orgById = new Map(orgs.map((o: any) => [o.id, o.name]));

const links = await dataQuery<any>(`greek_chapter_legal_entity?select=chapter_id,legal_entity_id,match_confidence`);
const entities = await dataQuery<any>(`greek_legal_entity?select=id,entity_type,legal_name`);
const entById = new Map(entities.map((e: any) => [e.id, e]));
const filings = await dataQuery<any>(`greek_990_filing?select=legal_entity_id,tax_year,total_revenue,total_assets,rich_filing_available`);
const officers = await dataQuery<any>(`greek_990_officer?select=legal_entity_id,person_name,normalized_title,stakeholder_class,latest_filing_year,is_officer,is_director`);

const filingsByEntity = new Map<string, any[]>();
for (const f of filings) (filingsByEntity.get(f.legal_entity_id) || filingsByEntity.set(f.legal_entity_id, []).get(f.legal_entity_id))!.push(f);
const officersByEntity = new Map<string, any[]>();
for (const o of officers) (officersByEntity.get(o.legal_entity_id) || officersByEntity.set(o.legal_entity_id, []).get(o.legal_entity_id))!.push(o);
const linksByChapter = new Map<string, any[]>();
for (const l of links) (linksByChapter.get(l.chapter_id) || linksByChapter.set(l.chapter_id, []).get(l.chapter_id))!.push(l);

function aggregate(st: any) {
  const ch = chapterById.get(st.chapter_id) || {};
  const chLinks = linksByChapter.get(st.chapter_id) || [];
  const linked = chLinks.map((l: any) => ({ conf: l.match_confidence, e: entById.get(l.legal_entity_id) })).filter((x: any) => x.e);
  const nonParent = linked.filter((x: any) => x.e.entity_type !== "NATIONAL_PARENT");
  const types = new Set(nonParent.map((x: any) => x.e.entity_type));
  const house = types.has("HOUSE_CORPORATION") || types.has("PROPERTY_HOLDING_ENTITY");
  const foundation = types.has("EDUCATIONAL_FOUNDATION") || types.has("SCHOLARSHIP_FOUNDATION");
  const alumni = types.has("ALUMNI_CORPORATION");

  // latest filing across linked entities + primary stakeholder
  let latestYear = 0;
  let primary: any = null;
  for (const { e } of linked) {
    for (const f of filingsByEntity.get(e.id) || []) if ((f.tax_year || 0) > latestYear) latestYear = f.tax_year;
  }
  // prefer a president/treasurer from a governing entity (house corp/foundation/alumni), latest filing year
  const rank = (o: any) => (/President/.test(o.normalized_title) ? 3 : /Treasurer/.test(o.normalized_title) ? 2 : /Director|Chair/.test(o.normalized_title) ? 1 : 0);
  const govFirst = (et: string) => ["HOUSE_CORPORATION", "EDUCATIONAL_FOUNDATION", "SCHOLARSHIP_FOUNDATION", "ALUMNI_CORPORATION", "PROPERTY_HOLDING_ENTITY"].includes(et) ? 1 : 0;
  for (const { e } of linked) {
    for (const o of officersByEntity.get(e.id) || []) {
      const cand = { name: o.person_name, role: o.normalized_title, entity_type: e.entity_type, stakeholder_class: o.stakeholder_class, latest_filing_year: o.latest_filing_year };
      if (!primary) { primary = cand; continue; }
      const better = govFirst(e.entity_type) - govFirst(primary.entity_type) || rank(o) - rank({ normalized_title: primary.role }) || (o.latest_filing_year || 0) - (primary.latest_filing_year || 0);
      if (better > 0) primary = cand;
    }
  }

  const recent = latestYear >= CUR_YEAR - 3;
  let gov = "UNKNOWN";
  if (nonParent.length) {
    if ((house && foundation) || (house && recent)) gov = "STRONG";
    else if ((house || foundation) && (recent || nonParent.length >= 2)) gov = "MODERATE";
    else gov = "LIGHT";
  }
  const confs = chLinks.map((l: any) => l.match_confidence);
  const localHigh = nonParent.some((x: any) => x.conf === "HIGH_CONFIDENCE");
  const anyHigh = confs.includes("HIGH_CONFIDENCE");
  const dataConfidence = localHigh ? "HIGH" : anyHigh ? "NATIONAL_ONLY" : confs.length ? "MEDIUM" : "NONE";

  return {
    chapter_id: st.chapter_id,
    campus_id: st.campus_id,
    campus: campusById.get(st.campus_id) || "",
    state: campusStateById.get(st.campus_id) || "",
    chapter: orgById.get(ch.greek_org_id) || "",
    council: ch.council || null,
    legal_entity_count: linked.length,
    house_corp_present: house,
    foundation_present: foundation,
    alumni_corp_present: alumni,
    national_parent_present: linked.some((x: any) => x.e.entity_type === "NATIONAL_PARENT"),
    governance_strength: gov,
    primary_latest_990_stakeholder: primary
      ? { name: primary.name, role: primary.role, entity_type: primary.entity_type, source: `LATEST 990-REPORTED (TY${primary.latest_filing_year || latestYear || "unknown"})` }
      : null,
    latest_filing_year: latestYear || null,
    data_confidence: dataConfidence,
  };
}

const rows = statuses.map(aggregate);
const summary = {
  generated: "2026-08-25",
  purpose: "ACCOUNT CONTEXT / ESCALATION RESERVE — not a contact list. Officer data is LATEST-990-REPORTED, never current.",
  chapters: rows.length,
  campuses: new Set(rows.map((r: any) => r.campus_id)).size,
  with_local_entity: rows.filter((r: any) => r.data_confidence === "HIGH").length,
  national_only: rows.filter((r: any) => r.data_confidence === "NATIONAL_ONLY").length,
  review: rows.filter((r: any) => r.data_confidence === "MEDIUM").length,
  none: rows.filter((r: any) => r.data_confidence === "NONE").length,
  house_corp_present: rows.filter((r: any) => r.house_corp_present).length,
  foundation_present: rows.filter((r: any) => r.foundation_present).length,
  alumni_corp_present: rows.filter((r: any) => r.alumni_corp_present).length,
  governance: { STRONG: 0, MODERATE: 0, LIGHT: 0, UNKNOWN: 0 } as Record<string, number>,
  with_primary_stakeholder: rows.filter((r: any) => r.primary_latest_990_stakeholder).length,
  with_filing_year: rows.filter((r: any) => r.latest_filing_year).length,
};
for (const r of rows) summary.governance[r.governance_strength] = (summary.governance[r.governance_strength] || 0) + 1;

writeFileSync(join(OUT, "GREEK_990_CHAPTER_AGGREGATES.json"), JSON.stringify({ summary, chapters: rows }, null, 2));
console.log("wrote GREEK_990_CHAPTER_AGGREGATES.json");
console.log(JSON.stringify(summary, null, 1));
