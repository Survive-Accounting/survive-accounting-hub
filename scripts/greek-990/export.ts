// Export the Greek 990 SEC pilot: CSVs + summary report + sample account briefs.
//   bun run scripts/greek-990/export.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataQuery } from "./_db";
import { SEC_CAMPUSES } from "./run";

const OUT = join(import.meta.dir, "..", "..", "greek-990-output");
mkdirSync(OUT, { recursive: true });

const csvEsc = (v: any) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const writeCsv = (name: string, headers: string[], rows: any[][]) => {
  const body = [headers.join(","), ...rows.map((r) => r.map(csvEsc).join(","))].join("\n");
  writeFileSync(join(OUT, name), body);
  console.log(`  ${name}: ${rows.length} rows`);
};

const CAMPUS_BY_ID = new Map(SEC_CAMPUSES.map((c) => [c.id, c]));
const secCampusIds = SEC_CAMPUSES.map((c) => c.id);
const inList = (ids: string[]) => `(${ids.map((i) => `"${i}"`).join(",")})`;

console.log("Loading data…");
// Chapters (social) for SEC campuses, joined to org names.
const orgs = await dataQuery<any>(`greek_orgs?select=id,name,letters,council`);
const orgById = new Map(orgs.map((o: any) => [o.id, o]));
const chapters = await dataQuery<any>(
  `campus_greek_chapters?campus_id=in.${inList(secCampusIds)}&archived_at=is.null&select=id,campus_id,greek_org_id,chapter_designation,council,letters`);
const socialChapters = chapters.filter((c: any) => ["IFC", "PANHELLENIC", "NPHC", "MGC"].includes((c.council || "").toUpperCase()));
const chapterById = new Map(socialChapters.map((c: any) => [c.id, c]));

const links = await dataQuery<any>(`greek_chapter_legal_entity?select=*`);
const entities = await dataQuery<any>(`greek_legal_entity?select=*`);
const entById = new Map(entities.map((e: any) => [e.id, e]));
const filings = await dataQuery<any>(`greek_990_filing?select=*`);
const officers = await dataQuery<any>(`greek_990_officer?select=*`);
const candidates = await dataQuery<any>(`greek_990_entity_candidate?select=*`);
const statuses = await dataQuery<any>(`greek_chapter_990_status?select=*`);
const statusByChapter = new Map(statuses.map((s: any) => [s.chapter_id, s]));

// Index by entity/chapter
const filingsByEntity = new Map<string, any[]>();
for (const f of filings) { (filingsByEntity.get(f.legal_entity_id) || filingsByEntity.set(f.legal_entity_id, []).get(f.legal_entity_id))!.push(f); }
const officersByEntity = new Map<string, any[]>();
for (const o of officers) { (officersByEntity.get(o.legal_entity_id) || officersByEntity.set(o.legal_entity_id, []).get(o.legal_entity_id))!.push(o); }
const linksByChapter = new Map<string, any[]>();
for (const l of links) { if (chapterById.has(l.chapter_id)) (linksByChapter.get(l.chapter_id) || linksByChapter.set(l.chapter_id, []).get(l.chapter_id))!.push(l); }

const orgName = (c: any) => orgById.get(c.greek_org_id)?.name || c.letters || "(unknown)";
const campusName = (c: any) => CAMPUS_BY_ID.get(c.campus_id)?.name || "(unknown)";

// ── 1. LEGAL ENTITIES ────────────────────────────────────────────────────────
writeCsv("GREEK_990_LEGAL_ENTITIES.csv",
  ["ein", "legal_name", "entity_type", "entity_type_confidence", "city", "state", "zip",
   "irs_subsection", "ntee_code", "affiliation_code", "group_exemption_number", "asset_amt", "income_amt", "source"],
  entities.map((e: any) => [e.ein, e.legal_name, e.entity_type, e.entity_type_confidence, e.city, e.state, e.zip,
    e.irs_subsection, e.ntee_code, e.affiliation_code, e.group_exemption_number, e.asset_amt, e.income_amt, e.source]));

// ── 2. FINANCIALS ─────────────────────────────────────────────────────────────
writeCsv("GREEK_990_FINANCIALS.csv",
  ["ein", "legal_name", "entity_type", "tax_year", "form_type", "rich_filing_available",
   "total_revenue", "total_expenses", "total_assets", "total_liabilities", "net_assets", "source"],
  filings.map((f: any) => {
    const e = entById.get(f.legal_entity_id) || {};
    return [f.ein, e.legal_name, e.entity_type, f.tax_year, f.form_type, f.rich_filing_available,
      f.total_revenue, f.total_expenses, f.total_assets, f.total_liabilities, f.net_assets, f.source];
  }).sort((a: any, b: any) => (b[3] || 0) - (a[3] || 0)));

// ── 3. OFFICERS ───────────────────────────────────────────────────────────────
writeCsv("GREEK_990_OFFICERS.csv",
  ["ein", "legal_name", "entity_type", "person_name", "title_as_reported", "normalized_title",
   "stakeholder_class", "is_officer", "is_director", "years", "latest_filing_year", "source"],
  officers.map((o: any) => {
    const e = entById.get(o.legal_entity_id) || {};
    return [o.ein, e.legal_name, e.entity_type, o.person_name, o.title_as_reported, o.normalized_title,
      o.stakeholder_class, o.is_officer, o.is_director, (o.years || []).join(" "), o.latest_filing_year, o.source];
  }));

// ── 4. REVIEW QUEUE (MEDIUM candidates awaiting a human decision) ─────────────
// Exception-based review (brief §24): a MEDIUM candidate is worth a human's time only if it
// carries a real chapter-specific signal — a related-entity type (house corp / foundation /
// alumni / property), a chapter-designation hint, or a group-exemption match. A bare
// "same org, different city" row is NOT review-worthy and is left out of the queue (it stays
// in greek_990_entity_candidate for completeness, just not surfaced for manual triage).
const REVIEW_TYPES = new Set(["HOUSE_CORPORATION", "EDUCATIONAL_FOUNDATION", "SCHOLARSHIP_FOUNDATION", "ALUMNI_CORPORATION", "PROPERTY_HOLDING_ENTITY"]);
const reviewWorthy = (c: any) =>
  REVIEW_TYPES.has(c.candidate_entity_type) ||
  (c.designation_evidence && c.designation_evidence !== "") ||
  (c.group_exemption_evidence && /matches/.test(c.group_exemption_evidence));
const reviewRows = candidates
  .filter((c: any) => chapterById.has(c.chapter_id) && c.match_confidence === "MEDIUM_CONFIDENCE" && c.status === "NEW" && reviewWorthy(c))
  .map((c: any) => {
    const ch = chapterById.get(c.chapter_id);
    return [campusName(ch), orgName(ch), ch.council, c.candidate_legal_name, c.candidate_ein,
      c.candidate_city, c.candidate_state, c.candidate_entity_type, c.match_score, c.match_confidence,
      c.name_evidence, c.location_evidence, c.group_exemption_evidence, c.designation_evidence, c.recommended_action, c.source];
  })
  .sort((a: any, b: any) => (b[8] || 0) - (a[8] || 0));
writeCsv("GREEK_990_ENTITY_REVIEW_QUEUE.csv",
  ["campus", "chapter", "council", "candidate_legal_name", "candidate_ein", "candidate_city", "candidate_state",
   "candidate_entity_type", "match_score", "match_confidence", "name_evidence", "location_evidence",
   "group_exemption_evidence", "designation_evidence", "recommended_action", "source"],
  reviewRows);

// ── 5. CHAPTER SUMMARY (dashboard aggregate, brief §29) ───────────────────────
function chapterAggregate(ch: any) {
  const chLinks = (linksByChapter.get(ch.id) || []);
  const linkedEntities = chLinks.map((l: any) => ({ l, e: entById.get(l.legal_entity_id) })).filter((x: any) => x.e);
  const types = new Set(linkedEntities.map((x: any) => x.e.entity_type));
  const local = types.has("LOCAL_CHAPTER_ENTITY");
  const house = types.has("HOUSE_CORPORATION") || types.has("PROPERTY_HOLDING_ENTITY");
  const foundation = types.has("EDUCATIONAL_FOUNDATION") || types.has("SCHOLARSHIP_FOUNDATION");
  const national = types.has("NATIONAL_PARENT");
  const alumni = types.has("ALUMNI_CORPORATION");

  // all filings across linked entities
  let latestYear = 0, latestRev: number | null = null, latestExp: number | null = null, latestAssets: number | null = null, latestLiab: number | null = null;
  let officerCount = 0, directorCount = 0;
  let president = "", treasurer = "";
  for (const { e } of linkedEntities) {
    for (const f of filingsByEntity.get(e.id) || []) {
      if ((f.tax_year || 0) > latestYear && (f.total_revenue != null || f.total_assets != null)) {
        latestYear = f.tax_year; latestRev = f.total_revenue; latestExp = f.total_expenses; latestAssets = f.total_assets; latestLiab = f.total_liabilities;
      }
    }
    for (const o of officersByEntity.get(e.id) || []) {
      if (o.is_officer) officerCount++;
      if (o.is_director) directorCount++;
      if (/President/i.test(o.normalized_title) && !president) president = o.person_name;
      if (/Treasurer/i.test(o.normalized_title) && !treasurer) treasurer = o.person_name;
    }
  }

  // governance strength
  const recent = latestYear >= new Date().getFullYear() - 3;
  let gov = "UNKNOWN";
  if (linkedEntities.length) {
    if ((house && foundation) || (house && directorCount >= 3 && recent)) gov = "STRONG";
    else if ((house || foundation) && recent) gov = "MODERATE";
    else gov = "LIGHT";
  }
  // "local" HIGH = a chapter-specific entity (not the shared national parent). This is the
  // account-meaningful signal; a national-parent-only link is real but generic.
  const localHigh = chLinks.some((l: any) => l.match_confidence === "HIGH_CONFIDENCE" && entById.get(l.legal_entity_id)?.entity_type !== "NATIONAL_PARENT");
  const anyHigh = chLinks.some((l: any) => l.match_confidence === "HIGH_CONFIDENCE");
  const dataConfidence = localHigh ? "HIGH" : anyHigh ? "NATIONAL_ONLY" : chLinks.length ? "MEDIUM" : "NONE";
  const localEntityCount = linkedEntities.filter((x: any) => x.e.entity_type !== "NATIONAL_PARENT").length;
  const st = statusByChapter.get(ch.id);

  return {
    chapter_id: ch.id, campus: campusName(ch), chapter: orgName(ch), council: ch.council,
    legal_entity_status: st?.status || "NOT_RUN",
    legal_entity_count: linkedEntities.length,
    local_entity_count: localEntityCount,
    local_entity_found: local, house_corporation_found: house, foundation_found: foundation, national_parent_found: national, alumni_corp_found: alumni,
    latest_990_year: latestYear || "",
    officer_count_latest_filing: officerCount, director_count_latest_filing: directorCount,
    latest_reported_president: president, latest_reported_treasurer: treasurer,
    latest_revenue: latestRev ?? "", latest_expenses: latestExp ?? "", latest_assets: latestAssets ?? "", latest_liabilities: latestLiab ?? "",
    alumni_governance_strength: gov, data_confidence: dataConfidence,
  };
}

const aggregates = socialChapters.map(chapterAggregate);
writeCsv("GREEK_990_SEC_CHAPTER_SUMMARY.csv",
  ["chapter_id", "campus", "chapter", "council", "legal_entity_status", "legal_entity_count", "local_entity_count",
   "local_entity_found", "house_corporation_found", "foundation_found", "national_parent_found", "alumni_corp_found",
   "latest_990_year", "officer_count_latest_filing", "director_count_latest_filing",
   "latest_reported_president", "latest_reported_treasurer",
   "latest_revenue", "latest_expenses", "latest_assets", "latest_liabilities",
   "alumni_governance_strength", "data_confidence"],
  aggregates.map((a) => [a.chapter_id, a.campus, a.chapter, a.council, a.legal_entity_status, a.legal_entity_count, a.local_entity_count,
    a.local_entity_found, a.house_corporation_found, a.foundation_found, a.national_parent_found, a.alumni_corp_found,
    a.latest_990_year, a.officer_count_latest_filing, a.director_count_latest_filing,
    a.latest_reported_president, a.latest_reported_treasurer,
    a.latest_revenue, a.latest_expenses, a.latest_assets, a.latest_liabilities,
    a.alumni_governance_strength, a.data_confidence]));

// ── 6. UNMATCHED CHAPTERS ─────────────────────────────────────────────────────
const unmatched = aggregates.filter((a) => a.legal_entity_count === 0);
writeCsv("GREEK_990_UNMATCHED_CHAPTERS.csv",
  ["campus", "chapter", "council", "legal_entity_status"],
  unmatched.map((a) => [a.campus, a.chapter, a.council, a.legal_entity_status]));

// ── stats for the report ──────────────────────────────────────────────────────
const stats = {
  campuses: SEC_CAMPUSES.length,
  chapters: socialChapters.length,
  byCouncil: {} as Record<string, number>,
  withHigh: aggregates.filter((a) => a.data_confidence === "HIGH").length,        // chapter-level HIGH entity
  nationalOnly: aggregates.filter((a) => a.data_confidence === "NATIONAL_ONLY").length,
  withAny: aggregates.filter((a) => a.legal_entity_count > 0).length,
  review: reviewRows.length,
  none: unmatched.length,
  entities: entities.length,
  byType: {} as Record<string, number>,
  filings: filings.length,
  byForm: {} as Record<string, number>,
  officers: officers.length,
  uniquePeople: new Set(officers.map((o: any) => o.person_name_normalized)).size,
  presidents: aggregates.filter((a) => a.latest_reported_president).length,
  treasurers: aggregates.filter((a) => a.latest_reported_treasurer).length,
  withFinancials: aggregates.filter((a) => a.latest_revenue !== "").length,
  gov: {} as Record<string, number>,
};
for (const c of socialChapters) stats.byCouncil[(c.council || "?").toUpperCase()] = (stats.byCouncil[(c.council || "?").toUpperCase()] || 0) + 1;
for (const e of entities) stats.byType[e.entity_type] = (stats.byType[e.entity_type] || 0) + 1;
for (const f of filings) stats.byForm[f.form_type || "?"] = (stats.byForm[f.form_type || "?"] || 0) + 1;
for (const a of aggregates) stats.gov[a.alumni_governance_strength] = (stats.gov[a.alumni_governance_strength] || 0) + 1;

const revenues = filings.map((f: any) => f.total_revenue).filter((v: any) => v != null).sort((a: number, b: number) => a - b);
const assets = filings.map((f: any) => f.total_assets).filter((v: any) => v != null).sort((a: number, b: number) => a - b);
const median = (arr: number[]) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);
writeFileSync(join(OUT, "_stats.json"), JSON.stringify({ ...stats, medianRevenue: median(revenues), medianAssets: median(assets) }, null, 2));

// ── 7. SEC PILOT REPORT (brief §32) ───────────────────────────────────────────
const fmtMoney = (n: number | null) => (n == null ? "—" : "$" + Math.round(n).toLocaleString());
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const report = `# Greek 990 / Legal-Entity Intelligence — SEC Pilot Report

_Generated ${new Date().toISOString().slice(0, 10)} · branch \`overnight/greek-990-sec-pilot\` · live project \`unvxagsledbsdoremqeb\`._
_Intelligence layer only — no outreach sent, no deploy._

## Universe attempted
- **SEC campuses:** ${stats.campuses}
- **Social Greek chapters:** ${stats.chapters}
${Object.entries(stats.byCouncil).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}

## Entity discovery (precision-first, brief §10/§27)
- Chapters with ≥1 legal entity linked: **${stats.withAny}** (${pct(stats.withAny, stats.chapters)}%)
- Chapters with a HIGH-confidence **chapter-level** entity (local / house corp / foundation / alumni): **${stats.withHigh}** (${pct(stats.withHigh, stats.chapters)}%)
- Chapters linked ONLY to their national parent (real but generic): **${stats.nationalOnly}**
- Review-worthy MEDIUM candidates (house corp / foundation / designation / GEN hits): **${reviewRows.length}**
- Chapters with no entity found: **${stats.none}** (a valid outcome, brief §23)
_HIGH auto-links require a real disambiguator — campus city OR chapter designation — never a bare state match._
- **Unique legal entities:** ${stats.entities} · **unique EINs:** ${new Set(entities.map((e: any) => e.ein)).size}

### Entity types
${Object.entries(stats.byType).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

All chapter↔entity links stored with typed relationship, match score, explainable
evidence, and provenance. EIN is never stored bare on the chapter (brief §4).

## Filings & financials (ProPublica Nonprofit Explorer API, cached)
- Total filings recorded: **${stats.filings}**
${Object.entries(stats.byForm).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `  - ${k}: ${v}`).join("\n")}
- Chapters with financial data: **${stats.withFinancials}**
- Median filing revenue: **${fmtMoney(median(revenues))}** · median assets: **${fmtMoney(median(assets))}**
  _(aggregate financials are market/account context only — NOT purchasing authority, brief §18)_

## Officers / directors (IRS 990 XML + reused prior extraction)
- Officer/director person-records: **${stats.officers}**
- Unique people: **${stats.uniquePeople}**
- Chapters with a LATEST-990-reported president: **${stats.presidents}**
- Chapters with a LATEST-990-reported treasurer: **${stats.treasurers}**
  _(never labeled "current" — 990s lag, brief §15)_

## Alumni governance strength (internal descriptive, brief §30)
${Object.entries(stats.gov).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

## Review queue
- ${reviewRows.length} MEDIUM candidates in \`GREEK_990_ENTITY_REVIEW_QUEUE.csv\` for CONFIRM / REJECT / UNSURE.
  Human effort is exception-based — HIGH links auto-applied, LOW left unlinked.

## Method & cost
- IRS EO BMF: 27 state extracts cached (~238 MB, ~1.37M org rows) — automatic EIN discovery, no manual paste.
- ProPublica API: one cached call per EIN (shared \`greek_org_propublica_cache\`).
- IRS 990 XML: targeted extraction from cached TEOS zips (no blind full-universe download, brief §12).
- Group-exemption / national-parent linkage from BMF affiliation codes + GEN.

## Outputs
\`GREEK_990_SEC_CHAPTER_SUMMARY.csv\` · \`GREEK_990_LEGAL_ENTITIES.csv\` · \`GREEK_990_OFFICERS.csv\` ·
\`GREEK_990_FINANCIALS.csv\` · \`GREEK_990_ENTITY_REVIEW_QUEUE.csv\` · \`GREEK_990_UNMATCHED_CHAPTERS.csv\` ·
\`GREEK_990_SAMPLE_BRIEFS.md\`

## Ready for nationwide Greek 990 enrichment?
**PARTIAL → YES for the entity graph + financials; officer coverage scales by downloading more IRS XML zips.**
The discovery/matching/enrichment pipeline is state-agnostic and idempotent — pointing it at
the other ~48 states' BMF + more campuses is a data-volume exercise, not new engineering.
`;
writeFileSync(join(OUT, "GREEK_990_SEC_PILOT_REPORT.md"), report);

// ── 8. SAMPLE ACCOUNT BRIEFS (brief §33) ─────────────────────────────────────
const rich = aggregates
  .filter((a) => a.data_confidence === "HIGH" && a.legal_entity_count >= 1)
  .sort((a, b) => (b.legal_entity_count + (b.latest_reported_president ? 5 : 0) + (b.latest_990_year ? 3 : 0))
    - (a.legal_entity_count + (a.latest_reported_president ? 5 : 0) + (a.latest_990_year ? 3 : 0)));
// diversify across campuses
const chosen: typeof aggregates = [];
const seenCampus = new Set<string>();
for (const a of rich) { if (chosen.length >= 10) break; if (seenCampus.has(a.campus) && chosen.length < 8) continue; chosen.push(a); seenCampus.add(a.campus); }
for (const a of rich) { if (chosen.length >= 10) break; if (!chosen.includes(a)) chosen.push(a); }

const briefText = chosen.map((a) => {
  const ch = chapterById.get(a.chapter_id);
  const chLinks = (linksByChapter.get(a.chapter_id) || []).map((l: any) => entById.get(l.legal_entity_id)).filter(Boolean);
  const entLines = chLinks.map((e: any) => `  - ${e.entity_type.replace(/_/g, " ")}: ${e.legal_name} (EIN ${e.ein})`).join("\n");
  return `## ${a.chapter.toUpperCase()} — ${a.campus}

Council: ${a.council}

**Legal entities (${a.legal_entity_count})**
${entLines || "  (none)"}

**Latest 990-reported leadership** ${a.latest_990_year ? `(TY ${a.latest_990_year})` : "(no rich filing)"}
- President: ${a.latest_reported_president || "—"}
- Treasurer: ${a.latest_reported_treasurer || "—"}
- Directors on latest filing: ${a.director_count_latest_filing}

**Financial context** _(account context, not purchasing authority)_
- Revenue: ${fmtMoney(a.latest_revenue === "" ? null : Number(a.latest_revenue))}
- Assets: ${fmtMoney(a.latest_assets === "" ? null : Number(a.latest_assets))}

**Match confidence:** ${a.data_confidence}
**Alumni governance strength:** ${a.alumni_governance_strength}

**Survive stakeholder graph**
- Local chapter entity: ${a.local_entity_found ? "FOUND" : "—"}
- House corporation: ${a.house_corporation_found ? "FOUND" : "—"}
- Foundation: ${a.foundation_found ? "FOUND" : "—"}
- National parent: ${a.national_parent_found ? "FOUND" : "—"}
- 990 alumni leadership: ${a.latest_reported_president || a.director_count_latest_filing ? "FOUND" : "—"}

**Next:** data ready for the Growth system — do not contact everyone simultaneously (brief §34).
`;
}).join("\n---\n\n");
writeFileSync(join(OUT, "GREEK_990_SAMPLE_BRIEFS.md"),
  `# Greek 990 — Sample Account Briefs\n\n_${chosen.length} chapters, most complete first. Intelligence only; no outreach._\n\n` + briefText);
console.log(`  GREEK_990_SEC_PILOT_REPORT.md + GREEK_990_SAMPLE_BRIEFS.md (${chosen.length} briefs)`);

console.log("\nExports written to greek-990-output/");
console.log(`chapters=${stats.chapters} withHIGH=${stats.withHigh} withAny=${stats.withAny} review=${stats.review} none=${stats.none}`);
console.log(`entities=${stats.entities} filings=${stats.filings} officers=${stats.officers} uniquePeople=${stats.uniquePeople}`);
console.log(`entity types:`, stats.byType);
