# Greek 990 / Legal-Entity Intelligence — Nationwide Readiness

_2026-08-25 · branch `overnight/greek-990-sec-pilot` · live project `unvxagsledbsdoremqeb`._
_Intelligence layer only — no outreach, no deploy. Officer harvesting is deliberately NOT a
Growth-V1 blocker. Officer data is **LATEST 990-REPORTED (TYxxxx)**, never "current."_

## What shipped since the SEC pilot

Three nationwide-readiness improvements, then a resumable nationwide run.

### 1. GEN subordinate enumeration (the biggest lever)
Once a national org's central entity (BMF affiliation = 6) and its group-exemption number (GEN)
are known, every subordinate in that IRS group ruling carries the same GEN. The pipeline now
**enumerates the whole subordinate roster** and ties each subordinate to a campus by city, instead
of guessing by name. This is IRS-authoritative: a subordinate under GEN g *is* that national's
entity, and a city match to a campus that hosts a chapter of that org is a HIGH, provenance-backed
link. It also catches subordinates whose names don't spell out the full org name.

**Effect:** GEN is now the dominant discovery path — **6,268 of 7,160 links (88%) are
GROUP_EXEMPTION-backed**, only 892 rest on name+city alone. On the SEC set it upgraded ~315
city-only links to authority-backed and added ~8 newly-covered chapters.

### 2. Conservative UNKNOWN typing
Entities whose legal name lacks a classifying keyword now lean on their IRS subsection at LOW
confidence: a bare 501(c)(7) → LOCAL_CHAPTER_ENTITY, a 501(c)(3) → foundation-leaning. Keyword
matches (HOUSE CORP, FOUNDATION, ALUMNI, …) still win first, so nothing is downgraded.

**Effect:** UNKNOWN entities fell from **57 → 0** on SEC and to just **3 of 3,462** nationwide,
with no loss of the "never mislabel a house corp as the undergrad chapter" guarantee.

### 3. Designation / sibling disambiguation
Chapter designations from the canonical roster are matched only when they occur in the legal name
at a span **disjoint** from the org name (so "Gamma Delta" chapter of "Alpha Gamma Delta" can't
self-match). A **sibling guard** caps at review any entity that carries a *different* explicit
chapter designation than the chapter's own — the GEN pass applies the same guard — so one chapter's
house corp is not attributed to its sibling in the same city.

## Nationwide run results

Resumable, batched, failure-isolated. Bulk-upsert batching cut the write time by ~30×, so the full
nationwide match runs in minutes.

| Metric | Value |
|---|---:|
| Campuses with social chapters | 190 |
| Chapters processed | 4,712 |
| Legal entities discovered | 3,462 (3,462 unique EINs) |
| Chapter↔entity links | 7,160 (6,268 GEN-authority, 892 name+city) |
| National parents (with GEN) | 120 |
| Entities carrying a GEN | 2,793 |

### Coverage (link-based, honest)
| Tier | Chapters | Share |
|---|---:|---:|
| **Chapter-specific HIGH entity** (local / house corp / foundation / alumni) | 1,455 | 30.9% |
| **National-parent only** (real but generic — confirms the org, not the chapter) | 2,379 | 50.5% |
| **No entity found** | 878 | 18.6% |
| _Chapters with a review-worthy MEDIUM candidate (separate, in the queue)_ | ~2,035 | — |

### Entity types (nationwide)
| Type | Count |
|---|---:|
| LOCAL_CHAPTER_ENTITY | 2,975 |
| HOUSE_CORPORATION | 180 |
| NATIONAL_PARENT | 120 |
| EDUCATIONAL_FOUNDATION | 80 |
| ALUMNI_CORPORATION | 64 |
| PROPERTY_HOLDING_ENTITY | 34 |
| SCHOLARSHIP_FOUNDATION | 6 |
| UNKNOWN | 3 |

The **~330 house-corporation / foundation / alumni-corporation entities** are the high-value
governing layer — the durable adult decision-makers behind chapters.

## Why nationwide auto-match (31%) is lower than SEC (45%)

Expected and honest: the SEC is the highest-Greek-density region in the country, with strong
per-chapter house-corporation and 501(c)(7) registration culture. Nationwide includes many smaller
campuses and orgs that **register no separate in-state nonprofit** (verified, e.g. Alpha Omicron Pi
and most multicultural/Latino/Asian-interest councils file centrally or not at all). For those,
the national-parent link is the ceiling — a real data floor, not a matcher gap.

## Dashboard aggregate

`GREEK_990_CHAPTER_AGGREGATES.json` — one row per chapter, the **account-context / escalation-reserve**
layer, with exactly the requested fields: `legal_entity_count`, `house_corp_present`,
`foundation_present`, `alumni_corp_present`, `governance_strength`, `primary_latest_990_stakeholder`
(with a `source: "LATEST 990-REPORTED (TYxxxx)"` label, never "current"), `latest_filing_year`, and
`data_confidence`. Nationwide financial enrichment (filing years + revenue/assets) is completing in
the background; the aggregate is regenerated when it finishes and is idempotent/resumable.

## Guardrails (unchanged)

- **Officer harvesting is not a blocker.** The entity graph + governance layer ship without it;
  officers fill in from IRS 990 XML over time (SEC subset done, ~330 rich).
- **Never a first-touch contact list.** Surface read-only as one card per chapter; show one primary
  stakeholder per role, not the whole board; gate outreach behind the demand-first motion (free
  Exam 1 → student usage → academic chair → exec → *then* advisor/alumni). The 990 layer is the
  escalation reserve.
- **Financials are context, not purchasing power** — restricted real estate / endowment; never a
  "they can afford it" score.

## Remaining work (priority order)

1. **Finish nationwide financial enrichment** (in progress) → complete `latest_filing_year` +
   financials for the aggregate.
2. **Chapter-designation backfill** — only ~15% of chapters carry a designation; it is the cleanest
   disambiguator and would sharpen the national-only tier and the same-city sibling cases. Needs an
   external roster source (GreekRank / chapter sites) — a separate ingestion, kept out of canonical writes.
3. **Broader officer coverage** — download the remaining IRS TEOS zips (3 of 12 used) for ~4× officer coverage.
4. **NPHC/MGC handling** — accept alumni-chapter / city-level entities and a lower coverage ceiling.
5. **Duplicate-registration collapse** — a few chapters link several same-name, same-city EINs
   (old + current registrations); dedupe for a cleaner `legal_entity_count`.

## Verdicts

- **READY FOR NATIONWIDE GREEK 990 ENRICHMENT: YES** — the run completed over 190 campuses / 4,712
  chapters; the pipeline is state-agnostic, idempotent, resumable, and precise (GEN-authoritative).
- **WORTH INCLUDING IN THE GROWTH ACCOUNT GRAPH: YES** — a legitimate, previously-missing
  alumni/governance layer with typed relationships, confidence, and full provenance.
- **HOW KING SEES IT WITHOUT SPAMMING:** read-only account-context card; one primary stakeholder per
  role; "LATEST 990-REPORTED (TYxxxx)" labels with lag shown; 990 layer as escalation reserve behind
  demand-first, never a bulk send.
