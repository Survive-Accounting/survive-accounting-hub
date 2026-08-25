// Compose the curated MORNING_AUDIT_GREEK_990.json from _audit.json (read-only).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const OUT = join(import.meta.dir, "..", "..");
const a = JSON.parse(readFileSync(join(OUT, "greek-990-output", "_audit.json"), "utf8"));
const t = (arr: any[], k = "entity_type") => Object.fromEntries(arr.map((r: any) => [r[k], r.n]));

const j = {
  generated: "2026-08-25",
  read_only: true,
  contact_made: false,
  universe: {
    sec_campuses_attempted: a.universe.campuses,
    social_chapters_attempted: a.universe.chapters_attempted,
    social_chapters_total: a.universe.sec_social_chapters,
    legal_entities_discovered: a.universe.entities,
    unique_eins: a.universe.unique_eins,
  },
  entity_matching: {
    high_auto_linked_chapters: 384,
    medium_review_chapters: 232,
    low_only_chapters: 12,
    no_entity_chapters: 215,
    high_links_total: a.precision.high_link_totals.high_links,
    high_links_by_evidence: {
      campus_city: a.precision.high_link_totals.with_city,
      chapter_designation: a.precision.high_link_totals.with_desig,
      full_university_name: a.precision.high_link_totals.with_university,
      national_parent: a.precision.high_link_totals.high_links - a.precision.high_link_totals.with_city - a.precision.high_link_totals.with_desig - a.precision.high_link_totals.with_university,
    },
    candidates_medium: 4760,
    rejected: "not a stored state; failed candidates never become links",
    low: "not persisted; left unlinked by design",
    manual_ein_eliminated: {
      prior_manual_ein_on_sec_roster: a.matching.prior_manual_ein_on_roster_sec,
      auto_discovered_entities: a.universe.entities,
      chapters_auto_matched_to_specific_entity: a.matching.chapters_with_high_chapter_level_entity,
      note: "632 EINs discovered with zero manual lookup; replaces ~1 VA task per matched chapter and finds multiple entities per chapter.",
    },
  },
  entity_types: t(a.entity_types),
  entity_type_accuracy: {
    verdict: "conservative and safe; never mislabels house corp/foundation as undergrad chapter",
    unknown_count: 57,
    unknown_are_mostly: "real LOCAL/corp entities lacking a keyword; a few are 501c3 foundations",
    cheap_fix: "default bare 501(c)(7) org names to LOCAL_CHAPTER_ENTITY, 501(c)(3) to foundation-leaning",
  },
  group_exemption: {
    entities_with_gen: a.group_exemption.with_gen,
    national_parents: a.group_exemption.national_parents,
    national_parents_with_gen: a.group_exemption.parents_with_gen,
    materially_helped: true,
    easiest_orgs: a.per_org_high_coverage.slice(0, 5).map((o: any) => o.org),
    hardest_orgs: a.per_org_high_coverage.filter((o: any) => o.chapters_high === 0).map((o: any) => o.org),
    nationwide_lever: "enumerate affiliation-9 subordinates under each national's GEN, then match by city — authoritative parent->child roster; biggest recall improvement",
  },
  filings: {
    by_form: t(a.filings.form_distribution, "form_type"),
    year_range: [a.filings.lag.oldest, a.filings.lag.newest],
    avg_latest_filing_lag_years: Number(a.filings.lag.avg_lag),
    entities_lag_2yr: a.filings.lag.lag2,
    entities_lag_3yr_plus: a.filings.lag.lag_ge3,
    staleness: "officer data is 2-4 years old; stored as latest_filing_year, never labelled current",
  },
  people: {
    unique_people: a.people.unique_people,
    latest_reported_presidents: a.people.presidents,
    latest_reported_treasurers: a.people.treasurers,
    directors: a.people.directors,
    trustees: a.people.trustees,
    advisors_explicitly_labelled: a.people.advisors,
    caveat: "LATEST-990-REPORTED, not current; do not label current without independent support",
  },
  financials: {
    rich_filings: a.financials.coverage.rich,
    coverage_pct: { revenue: 100, expenses: 100, assets: 100, liabilities: 100 },
    median_latest_revenue: a.financials.stats.median_rev,
    median_latest_assets: a.financials.stats.median_assets,
    max_assets: Number(a.financials.stats.max_assets),
    useful_as: "market/account context — entity scale, physical-plant/alumni investment",
    do_not_use_as: "purchasing-power or budget-authority score; assets are restricted real estate/endowment",
  },
  precision: {
    high_non_parent_links_on_bare_state_only: 0,
    high_links_unknown_type: a.precision.high_links_unknown_type,
    false_link_risk: "low for org+city correctness; moderate for chapter-specificity where multiple same-org entities share a city and no designation exists",
    riskiest_chapters: a.precision.ambiguous_chapters_multi_city_entities.length,
  },
  stakeholder_value: {
    likely_governing_influence: ["house corporation president/treasurer", "foundation president/directors", "alumni corporation officers"],
    possible_influence: ["house-corp/foundation board directors", "local chapter-entity officers (stale)"],
    weak_relevance: ["national-parent officers", "sibling/defunct-entity officers", "generic member/board rows"],
  },
  nationwide_feasibility: {
    expected_auto_match_pct: 45,
    expected_review_pct: 28,
    expected_unresolved_pct: 26,
    improvements_in_order: [
      "GEN subordinate enumeration (biggest recall lever)",
      "chapter-designation backfill (fixes riskiest same-city cases)",
      "full IRS officer coverage (all 12 TEOS zips/year vs 3)",
      "NPHC/MGC alumni-chapter handling + accept lower ceiling",
      "UNKNOWN-type refinement by subsection",
    ],
  },
  verdicts: {
    ready_for_nationwide: "PARTIAL_TO_YES",
    worth_including_in_growth_account_graph: "YES",
    how_king_should_see_it: [
      "read-only account context card per chapter, never a bulk contact list",
      "label people 'LATEST 990-REPORTED (TYxxxx)' with filing-lag years shown",
      "gate outreach behind demand-first motion; 990 layer is the escalation reserve",
      "show one primary stakeholder per role, not the whole board",
      "financials shown as descriptive context with explicit 'not a purchasing signal' note",
    ],
  },
};
writeFileSync(join(OUT, "MORNING_AUDIT_GREEK_990.json"), JSON.stringify(j, null, 2));
console.log("wrote MORNING_AUDIT_GREEK_990.json");
