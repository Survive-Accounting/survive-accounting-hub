# Competitive Market Intelligence

Nationwide scan for evidence that students **already pay third parties** for Intro
Financial Accounting help (course-specific tutoring, exam reviews, practice exams,
cram videos, supplemental instruction). A strong existing paid competitor is treated
as **positive** market evidence — proven willingness to pay — not merely a threat.

**Research only.** Nothing here deploys, emails, or creates ads. Public web/search
results and public marketing pages only — no accounts, no paywall bypass, no
purchases, no fake identities. Pricing/offerings are extracted **verbatim** from
public pages.

## Pipeline

```
build-universe.mjs   → data/universe.json     (766 campuses ranked by Market Opportunity,
                                                enriched with domain + Intro-1 course code)
discover.mjs         → data/competitors.json  (SERP-only: organic competitors + sponsored
                        data/serp-yield.json    ads, classified; resumable; yield-tracked)
study-edge.mjs       → data/study-edge.json   (deep Study Edge + analog scrape/extract)
enrich.mjs           → data/enrichment.json   (scrape top local/course-specific sites for
                                                public pricing / free-trial / offerings)
emit.mjs             → competitive-intel-output/*.csv   (merges enrichment)
report.mjs           → competitive-intel-output/*.md
```

### Run (fresh)
```
node scripts/competitive-intel/build-universe.mjs
node scripts/competitive-intel/discover.mjs --serpBudget=6500   # long; resumable
node scripts/competitive-intel/study-edge.mjs --analogs
node scripts/competitive-intel/enrich.mjs --cap=120
node scripts/competitive-intel/emit.mjs
node scripts/competitive-intel/report.mjs
```

### Cheap refresh
`discover.mjs` skips already-done campuses and **caches every SERP + scrape**
(`data/serp-cache.json`, `data/scrape-cache.json`) — re-runs cost ~nothing.
`emit.mjs` + `report.mjs` are pure computation, re-runnable anytime (also mid-run).
`SERP_COMPETITOR_SEARCH_YIELD.csv` says which query families to expand/trim next time.

## Tiers (discovery depth by Market Opportunity rank)
- **T1** (top 150): ~13 queries incl. course-code exam/practice + ad-probe queries
- **T2** (151–500): ~7 queries (school + course tutoring/review/guide)
- **T3** (501+): ~3 queries (school accounting tutoring / exam review / course tutoring)

## Classification
- **university_free** — the campus's own `.edu` (free support; context, not a commercial competitor)
- **NOTES_MARKETPLACE / TUTOR_MARKETPLACE / EXAM_PREP_PLATFORM / NATIONAL_COURSEWARE / MULTI_CAMPUS_TUTORING** — known brands (`lib.mjs` `BRANDS`)
- **COURSE_SPECIFIC_SITE** — domain/URL embeds the intro course code (e.g. `acct2101uga.com`) — the strongest paid-market signal (Study-Edge-like)
- **LOCAL_CAMPUS_TUTORING** — unknown domain, campus name in title/URL
- **INDIVIDUAL_OR_LOCAL** — unknown commercial domain, no campus signal
- skip lists remove directories / rankings / catalogs / scholarship / professional orgs

## Signals (transparent, descriptive)
- `proven_paid_market` HIGH/MEDIUM/LOW/UNKNOWN — established willingness to pay
- `intro_accounting_paid_market_status` STRONG/MODERATE/WEAK/UNKNOWN
- `paid_academic_market_status` STRONG/MODERATE/WEAK/UNKNOWN (any subject)
- `market_validation` VALIDATED_PAID_MARKET / CROWDED / WHITE_SPACE / LOW_EVIDENCE

## Keys (from `.env`, gitignored)
`SERPAPI_API_KEY`, `FIRECRAWL_API_KEY`, `AI_GATEWAY_API_KEY` (Gemini via Vercel gateway),
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (read-only campus attributes).

`data/` (caches + intermediate JSON) is gitignored. Deliverables land in
`competitive-intel-output/`.
