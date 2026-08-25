// READ-ONLY morning audit of the Greek 990 SEC pilot. Queries live DB, emits JSON.
//   bun run scripts/greek-990/audit.ts   > (writes greek-990-output/_audit.json)
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "./_db";
import { SEC_CAMPUSES } from "./run";

const CUR_YEAR = 2026; // pilot run date 2026-08-25 (Date.now unavailable in some contexts; fixed)
const OUT = join(import.meta.dir, "..", "..", "greek-990-output");
const secIds = SEC_CAMPUSES.map((c) => `'${c.id}'`).join(",");

const one = async (q: string) => (await sql(q))[0];
const many = (q: string) => sql(q);

// ── universe ─────────────────────────────────────────────────────────────────
const universe = await one(`select
  (select count(distinct campus_id) from greek_chapter_990_status)::int campuses,
  (select count(*) from greek_chapter_990_status)::int chapters_attempted,
  (select count(*) from greek_legal_entity)::int entities,
  (select count(distinct ein) from greek_legal_entity)::int unique_eins`);

// social chapters in SEC (denominator)
const socialTotal = await one(`select count(*)::int n from campus_greek_chapters where campus_id in (${secIds}) and archived_at is null and upper(coalesce(council,'')) in ('IFC','PANHELLENIC','NPHC','MGC')`);

// ── matching tiers (chapter-level) ───────────────────────────────────────────
const statusDist = await many(`select status, count(*)::int n from greek_chapter_990_status group by 1 order by 2 desc`);
const chaptersWithHighLocal = (await one(`
  select count(distinct l.chapter_id)::int n from greek_chapter_legal_entity l
  join greek_legal_entity le on le.id=l.legal_entity_id
  where l.match_confidence='HIGH_CONFIDENCE' and le.entity_type<>'NATIONAL_PARENT'`)).n;
const chaptersWithAnyHigh = (await one(`select count(distinct chapter_id)::int n from greek_chapter_legal_entity where match_confidence='HIGH_CONFIDENCE'`)).n;
const candByConf = await many(`select match_confidence, count(*)::int n from greek_990_entity_candidate group by 1 order by 2 desc`);
const chaptersMediumOnly = (await one(`
  select count(*)::int n from greek_chapter_990_status where status='NEEDS_REVIEW'`)).n;
const chaptersNone = (await one(`select count(*)::int n from greek_chapter_990_status where status='NO_ENTITY_FOUND'`)).n;
// prior manual EIN coverage (flat field on canonical roster, SEC only)
const priorManual = (await one(`select count(*)::int n from campus_greek_chapters where campus_id in (${secIds}) and ein is not null and ein<>''`)).n;

// ── entity types ─────────────────────────────────────────────────────────────
const entityTypes = await many(`select entity_type, count(*)::int n from greek_legal_entity group by 1 order by 2 desc`);
// accuracy probe: subsection vs type
const typeSubsection = await many(`select entity_type, irs_subsection, count(*)::int n from greek_legal_entity group by 1,2 order by 1,3 desc`);
const unknownSample = await many(`select legal_name, city, irs_subsection from greek_legal_entity where entity_type='UNKNOWN' order by random() limit 15`);

// ── group exemption ──────────────────────────────────────────────────────────
const gen = await one(`select
  count(*) filter (where group_exemption_number is not null)::int with_gen,
  count(*) filter (where entity_type='NATIONAL_PARENT')::int national_parents,
  count(*) filter (where entity_type='NATIONAL_PARENT' and group_exemption_number is not null)::int parents_with_gen
  from greek_legal_entity`);
const parentsList = await many(`select legal_name, city, state, group_exemption_number gen from greek_legal_entity where entity_type='NATIONAL_PARENT' order by legal_name`);
// per-org HIGH coverage (easiest/hardest)
const perOrg = await many(`
  select o.name org,
    count(distinct cgc.id)::int chapters,
    count(distinct case when l.match_confidence='HIGH_CONFIDENCE' and le.entity_type<>'NATIONAL_PARENT' then cgc.id end)::int chapters_high
  from campus_greek_chapters cgc
  join greek_orgs o on o.id=cgc.greek_org_id
  left join greek_chapter_legal_entity l on l.chapter_id=cgc.id
  left join greek_legal_entity le on le.id=l.legal_entity_id
  where cgc.campus_id in (${secIds}) and cgc.archived_at is null and upper(coalesce(cgc.council,'')) in ('IFC','PANHELLENIC','NPHC','MGC')
  group by 1 having count(distinct cgc.id) >= 4 order by (count(distinct case when l.match_confidence='HIGH_CONFIDENCE' and le.entity_type<>'NATIONAL_PARENT' then cgc.id end)::numeric / nullif(count(distinct cgc.id),0)) desc`);

// ── filings ──────────────────────────────────────────────────────────────────
const formDist = await many(`select form_type, count(*)::int n from greek_990_filing group by 1 order by 2 desc`);
const yearDist = await many(`select tax_year, count(*)::int n from greek_990_filing where tax_year is not null group by 1 order by 1 desc limit 12`);
const lag = await one(`
  with latest as (select legal_entity_id, max(tax_year) ty from greek_990_filing where rich_filing_available group by 1)
  select count(*)::int entities_with_rich, round(avg(${CUR_YEAR}-ty),2) avg_lag, min(ty) oldest, max(ty) newest,
    count(*) filter (where ${CUR_YEAR}-ty<=1)::int lag_le1, count(*) filter (where ${CUR_YEAR}-ty=2)::int lag2, count(*) filter (where ${CUR_YEAR}-ty>=3)::int lag_ge3
  from latest`);

// ── people ───────────────────────────────────────────────────────────────────
const people = await one(`select
  count(*)::int total,
  count(distinct person_name_normalized)::int unique_people,
  count(distinct case when normalized_title='President' then person_name_normalized end)::int presidents,
  count(distinct case when normalized_title='Treasurer' then person_name_normalized end)::int treasurers,
  count(distinct case when normalized_title='Director' then person_name_normalized end)::int directors,
  count(distinct case when normalized_title='Trustee' then person_name_normalized end)::int trustees,
  count(distinct case when normalized_title in ('Chapter Advisor','Alumni Advisor','Advisor','House Director') then person_name_normalized end)::int advisors,
  min(latest_filing_year)::int oldest_filing, max(latest_filing_year)::int newest_filing
  from greek_990_officer`);
const titleDist = await many(`select normalized_title, count(*)::int n from greek_990_officer group by 1 order by 2 desc limit 15`);

// ── financials coverage (rich filings) ───────────────────────────────────────
const fin = await one(`select
  count(*)::int rich,
  count(total_revenue)::int rev, count(total_expenses)::int exp,
  count(total_assets)::int assets, count(total_liabilities)::int liab
  from greek_990_filing where rich_filing_available`);
const finStats = await one(`
  with latest as (
    select distinct on (legal_entity_id) legal_entity_id, total_revenue, total_assets
    from greek_990_filing where rich_filing_available order by legal_entity_id, tax_year desc)
  select
    percentile_cont(0.5) within group (order by total_revenue) filter (where total_revenue is not null) median_rev,
    percentile_cont(0.5) within group (order by total_assets) filter (where total_assets is not null) median_assets,
    max(total_assets) max_assets
  from latest`);

// ── precision: riskiest HIGH links ───────────────────────────────────────────
// Risk heuristic: HIGH, non-parent, city-only evidence (no designation/university), AND the org has
// multiple HIGH non-parent entities in the same campus city (ambiguous which chapter it belongs to).
const riskyAmbiguous = await many(`
  with hi as (
    select l.chapter_id, l.legal_entity_id, le.legal_name, le.city, le.entity_type, cgc.campus_id, cgc.greek_org_id,
           (l.match_evidence->>'designation') de, (l.match_evidence->>'location') loc
    from greek_chapter_legal_entity l
    join greek_legal_entity le on le.id=l.legal_entity_id
    join campus_greek_chapters cgc on cgc.id=l.chapter_id
    where l.match_confidence='HIGH_CONFIDENCE' and le.entity_type<>'NATIONAL_PARENT')
  select chapter_id, count(*)::int same_chapter_entities from hi
  where (de is null or de='') group by chapter_id having count(*)>=4 order by 2 desc limit 15`);
const riskyUnknownType = (await one(`
  select count(*)::int n from greek_chapter_legal_entity l join greek_legal_entity le on le.id=l.legal_entity_id
  where l.match_confidence='HIGH_CONFIDENCE' and le.entity_type='UNKNOWN'`)).n;
const highLinkTotals = await one(`select
  count(*)::int high_links,
  count(*) filter (where (match_evidence->>'designation')<>'')::int with_desig,
  count(*) filter (where (match_evidence->>'location') like 'campus city%')::int with_city,
  count(*) filter (where (match_evidence->>'location') like 'names%')::int with_university
  from greek_chapter_legal_entity where match_confidence='HIGH_CONFIDENCE'`);
const sampleHigh = await many(`
  select c.name campus, o.name org, le.legal_name, le.city, le.entity_type, l.match_score,
    (l.match_evidence->>'location') loc, (l.match_evidence->>'designation') de
  from greek_chapter_legal_entity l
  join greek_legal_entity le on le.id=l.legal_entity_id
  join campus_greek_chapters cgc on cgc.id=l.chapter_id
  join campuses c on c.id=cgc.campus_id join greek_orgs o on o.id=cgc.greek_org_id
  where l.match_confidence='HIGH_CONFIDENCE' order by random() limit 30`);

const out = {
  generated: "2026-08-25", read_only: true,
  universe: { ...universe, sec_social_chapters: socialTotal.n },
  matching: {
    status_distribution: statusDist,
    chapters_with_high_chapter_level_entity: chaptersWithHighLocal,
    chapters_with_any_high_incl_national: chaptersWithAnyHigh,
    chapters_review_only: chaptersMediumOnly,
    chapters_no_entity: chaptersNone,
    candidates_by_confidence: candByConf,
    prior_manual_ein_on_roster_sec: priorManual,
    note: "LOW candidates are not persisted (left unlinked by design); 'rejected' is not a stored state — a rejected candidate simply never becomes a link.",
  },
  entity_types: entityTypes,
  entity_type_by_subsection: typeSubsection,
  unknown_type_sample: unknownSample,
  group_exemption: { ...gen, national_parents: parentsList },
  per_org_high_coverage: perOrg,
  filings: { form_distribution: formDist, year_distribution: yearDist, lag },
  people: { ...people, title_distribution: titleDist },
  financials: { coverage: fin, stats: finStats },
  precision: {
    high_link_totals: highLinkTotals,
    high_links_unknown_type: riskyUnknownType,
    ambiguous_chapters_multi_city_entities: riskyAmbiguous,
    sample_high_links: sampleHigh,
  },
};
writeFileSync(join(OUT, "_audit.json"), JSON.stringify(out, null, 2));
console.log("wrote _audit.json");
console.log(JSON.stringify({ universe: out.universe, matching_status: statusDist, entity_types: entityTypes, gen, lag, people: { unique: people.unique_people, pres: people.presidents, treas: people.treasurers }, fin: out.financials }, null, 1));
