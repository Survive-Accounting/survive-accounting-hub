# Greek 990 / Legal-Entity Intelligence — SEC Pilot Report

_Generated 2026-08-25 · branch `overnight/greek-990-sec-pilot` · live project `unvxagsledbsdoremqeb`._
_Intelligence layer only — no outreach sent, no deploy._

## Universe attempted
- **SEC campuses:** 16
- **Social Greek chapters:** 858
  - IFC: 385
  - NPHC: 137
  - MGC: 107
  - PANHELLENIC: 229

## Entity discovery (precision-first, brief §10/§27)
- Chapters with ≥1 legal entity linked: **702** (82%)
- Chapters with a HIGH-confidence **chapter-level** entity (local / house corp / foundation / alumni): **383** (45%)
- Chapters linked ONLY to their national parent (real but generic): **319**
- Review-worthy MEDIUM candidates (house corp / foundation / designation / GEN hits): **584**
- Chapters with no entity found: **156** (a valid outcome, brief §23)
_HIGH auto-links require a real disambiguator — campus city OR chapter designation — never a bare state match._
- **Unique legal entities:** 638 · **unique EINs:** 638

### Entity types
- LOCAL_CHAPTER_ENTITY: 386
- HOUSE_CORPORATION: 81
- NATIONAL_PARENT: 77
- UNKNOWN: 57
- ALUMNI_CORPORATION: 15
- EDUCATIONAL_FOUNDATION: 11
- PROPERTY_HOLDING_ENTITY: 10
- SCHOLARSHIP_FOUNDATION: 1

All chapter↔entity links stored with typed relationship, match score, explainable
evidence, and provenance. EIN is never stored bare on the chapter (brief §4).

## Filings & financials (ProPublica Nonprofit Explorer API, cached)
- Total filings recorded: **5411**
  - 990: 4245
  - 990EZ: 613
  - 990N: 527
  - 990PF: 26
- Chapters with financial data: **693**
- Median filing revenue: **$544,112** · median assets: **$425,730**
  _(aggregate financials are market/account context only — NOT purchasing authority, brief §18)_

## Officers / directors (IRS 990 XML + reused prior extraction)
- Officer/director person-records: **624**
- Unique people: **624**
- Chapters with a LATEST-990-reported president: **171**
- Chapters with a LATEST-990-reported treasurer: **127**
  _(never labeled "current" — 990s lag, brief §15)_

## Alumni governance strength (internal descriptive, brief §30)
- LIGHT: 613
- UNKNOWN: 156
- MODERATE: 65
- STRONG: 24

## Review queue
- 584 MEDIUM candidates in `GREEK_990_ENTITY_REVIEW_QUEUE.csv` for CONFIRM / REJECT / UNSURE.
  Human effort is exception-based — HIGH links auto-applied, LOW left unlinked.

## Method & cost
- IRS EO BMF: 27 state extracts cached (~238 MB, ~1.37M org rows) — automatic EIN discovery, no manual paste.
- ProPublica API: one cached call per EIN (shared `greek_org_propublica_cache`).
- IRS 990 XML: targeted extraction from cached TEOS zips (no blind full-universe download, brief §12).
- Group-exemption / national-parent linkage from BMF affiliation codes + GEN.

## Outputs
`GREEK_990_SEC_CHAPTER_SUMMARY.csv` · `GREEK_990_LEGAL_ENTITIES.csv` · `GREEK_990_OFFICERS.csv` ·
`GREEK_990_FINANCIALS.csv` · `GREEK_990_ENTITY_REVIEW_QUEUE.csv` · `GREEK_990_UNMATCHED_CHAPTERS.csv` ·
`GREEK_990_SAMPLE_BRIEFS.md`

## Ready for nationwide Greek 990 enrichment?
**PARTIAL → YES for the entity graph + financials; officer coverage scales by downloading more IRS XML zips.**
The discovery/matching/enrichment pipeline is state-agnostic and idempotent — pointing it at
the other ~48 states' BMF + more campuses is a data-volume exercise, not new engineering.
