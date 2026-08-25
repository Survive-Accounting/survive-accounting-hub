# Greek 990 / Legal-Entity Intelligence — Architecture

Automatic discovery of the nonprofit legal entities behind each Greek chapter
(undergraduate chapter, house corporation, foundation, alumni corporation,
national parent) with officers/directors and Form 990 financials — the alumni /
legal-entity layer of the chapter **stakeholder graph**. SEC pilot (16 campuses).

_Intelligence layer only. No outreach. Not deployed. Branch `overnight/greek-990-sec-pilot`._

## Data sources (preference order, brief §2)

1. **IRS EO Business Master File (EO BMF)** — `www.irs.gov/pub/irs-soi/eo_<st>.csv`.
   Authoritative EIN + name + city + state + group-exemption number (GEN) +
   subsection + affiliation + NTEE + amounts. Primary **discovery** source: no
   manual EIN paste. 27 state extracts cached (~238 MB, ~1.37M orgs).
2. **ProPublica Nonprofit Explorer API v2** — `/organizations/{ein}.json`.
   Validation + parsed **financials** + filing history. One call per EIN, cached
   in the shared `greek_org_propublica_cache` table. (`formtype` 0/1/2 = 990/990-EZ/990-PF.)
3. **IRS machine-readable 990 XML** (TEOS year ZIPs) — the only source of
   **officers/directors**. Targeted extraction from cached zips (brief §12).

Deliberately NOT used: ProPublica `download-xml` (now bot/CAPTCHA-gated — never
bypassed); the deprecated `s3://irs-form-990` bucket (404). Individual IRS XML is
not addressable (no object_id→zip map; `XML_BATCH_ID` in the index is empty), so
officer coverage scales by downloading more of the year's zips.

## Pipeline (`scripts/greek-990/`)

```
download-bmf.ts     → cache IRS EO BMF state CSVs (data/greek-990/cache/bmf/)
run.ts              → the orchestrator (idempotent, resumable, failure-isolated)
   lib/roster.ts       load canonical campus + social chapters + org identities
   lib/bmf.ts          load Greek-relevant BMF rows per state (in-memory pool)
   lib/normalize.ts    name/city normalization, entity-type classification
   lib/match.ts        candidate discovery + explainable scoring
   lib/propublica.ts   cached API client → filings/financials
   lib/persist.ts      idempotent upserts (all natural-key on-conflict)
officers.ts         → lib/xml-index.ts (extract from cached zips) + lib/xml990.ts
                      (parse officers/financials); also migrates legacy officers
export.ts           → 6 CSVs + SEC report + sample briefs (greek-990-output/)
```

Run order:
```
bun run scripts/greek-990/download-bmf.ts
bun run scripts/greek-990/run.ts --preflight              # read-only sanity sample
bun run scripts/greek-990/run.ts --all --write --parents --enrich
bun run scripts/greek-990/officers.ts
bun run scripts/greek-990/export.ts
```

## Matching (precision over coverage, brief §10/§27)

For each chapter: build the org's Greek-letter phrase (from `greek_orgs.name`),
search the campus-state BMF pool, and score explainably:

- **name anchor** (+40) — the org phrase must appear, and must be a **maximal**
  Greek-letter run (not preceded/followed by another Greek word). This rejects
  fragments of a *different* org's name: `ALPHA PHI` inside Lambda Chi's
  `ALPHA PHI ZETA HOUSE CORP OF LAMBDA CHI ALPHA`; `SIGMA KAPPA` inside
  `PHI SIGMA KAPPA`; `CHI OMEGA` inside `ALPHA CHI OMEGA`.
- **"… OF `<other org>`" guard** — a leading phrase before `OF <different org>` is a
  chapter designation of the other org (`THETA TAU CHAPTER OF OMEGA PSI PHI`).
- **campus city match** (+25) · **full university name in title** (+25, branch-campus-guarded) ·
  **chapter designation present** (+20, must occupy a span **disjoint** from the org
  name so `Gamma Delta` chapter of `Alpha Gamma Delta` doesn't self-match) ·
  **GEN match** (+15) · type/subsection bonuses.
- **HIGH** requires a real disambiguator (city OR disjoint designation) **and** score ≥ 65 —
  never a bare state match. **MEDIUM** → review queue. **LOW** → left unlinked.

**Entity-type classification** from the legal name + subsection/affiliation:
HOUSE_CORPORATION, EDUCATIONAL/SCHOLARSHIP_FOUNDATION, ALUMNI_CORPORATION,
PROPERTY_HOLDING_ENTITY (501c2 title-holding), NATIONAL_PARENT (affiliation=6),
LOCAL_CHAPTER_ENTITY, UNKNOWN. A house corp is never mislabeled the undergrad chapter.

**National-parent pass:** each org's BMF central entity (affiliation=6) is linked as
NATIONAL_PARENT to all its SEC chapters, carrying the real GEN + HQ.

## Schema (migration `20260825_0100_greek_990_legal_entity.sql`, RLS deny-by-default)

- `greek_legal_entity` — one row per EIN, with entity_type + BMF identity + provenance.
- `greek_chapter_legal_entity` — **M:N** chapter↔entity, typed relationship, match
  score/method/evidence, confidence, verification, provenance. **EIN never stored bare on the chapter.**
- `greek_990_filing` — filings by legal_entity_id (990/990EZ/990N/990PF, rich flag).
- `greek_990_officer` — officers/directors, **historical** (years[]), stakeholder class,
  `latest_filing_year` (never labeled "current" — 990s lag, brief §15).
- `greek_990_entity_candidate` — scored candidates backing the review queue.
- `greek_chapter_990_status` — per-chapter research status (NOT_RUN…COMPLETE/FAILED).

Reuses `greek_org_propublica_cache`; does not alter the prior `greek_org_*` tables
or the manual UI; links only to the canonical `campus_greek_chapters` roster.

## Scaling to nationwide

State-agnostic and idempotent. Nationwide = download the other states' BMF +
process all campuses (data volume, not new engineering). Officer coverage grows by
downloading more IRS TEOS zips (same parser, same index). Financials + entity graph
are already complete for whatever chapters are matched.
