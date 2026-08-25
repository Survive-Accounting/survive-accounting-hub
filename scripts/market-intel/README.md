# Campus Market Intelligence

Independent, transparent market-intelligence layer over the Survive Accounting campus universe,
built primarily on **public IPEDS/NCES data** (no per-campus scraping). Scores where the biggest
Intro Financial Accounting opportunities are, which business programs are growing, and where our
Greek/contact distribution is strongest — so Growth knows where to work first.

**No deploy. No outreach. No campus activation.** This project scores and prioritizes only.

## What it produces (`market-intel-output/`)
- `CAMPUS_MARKET_INTELLIGENCE.csv` — every matched campus, all raw metrics + scores + drivers.
- `TOP_100_OUTREACH_CAMPUSES.csv`, `TOP_100_GROWTH_CAMPUSES.csv`, `TOP_100_MARKET_OPPORTUNITY.csv`, `TOP_ENRICHMENT_GAPS.csv`.
- `CAMPUS_IDENTITY_REVIEW.csv` — unresolved IPEDS matches + duplicate-UNITID data-quality rows.
- `CAMPUS_MARKET_INTELLIGENCE_REPORT.md` — full methodology + stats + verdict.
- `KING_GROWTH_BRIEF.md` — operational, plain-English "work these first".

## Scores (all 0–100, percentile-normalized over the 4-year segment)
- **Market Opportunity** — business/est-Intro-1 (40%), undergrad enrollment (20%), business concentration (15%), Greek opportunity (15%), accounting (10%).
- **Growth Momentum** — 5y business CAGR (40%), 3y business growth (25%), business-share change (15%), undergrad trend (10%), accounting trend (10%). Small bases gated (baseline ≥ 25) + meaningful-market label gate (latest ≥ 100).
- **Distribution Strength** — Greek (35%), council contacts (25%), role inboxes (15%), chapter contacts (10%), women-in-business (10%), finance club (5%). **Renormalized over available components**; unresearched = excluded, not zero; completeness stamped.
- **Outreach Priority** — Market 50% + Distribution 25% + Growth 20% + Live Demand 5% (renormalized). **Course Readiness = 0 weight.**
- **Enrichment Priority** — Market Opportunity × (1 − structural completeness).
- **Course Readiness** and **Live Demand** = `COMING_SOON` (null, zero weight).

All weights/thresholds live in [`src/lib/market-intel/scoring-config.json`](../../src/lib/market-intel/scoring-config.json) — tune without touching code. Scores are versioned (`config_version`).

## Pipeline
```
parse-ipeds.mjs   # one-time: parse IPEDS zips -> data/ipeds.json  (needs the zips, see below)
match.mjs         # campus universe -> IPEDS UNITID -> data/matches.json
run-all.mjs       # compute + emit-csv + emit-reports   <-- THE REFRESH PATH
import.mjs        # load results into DB (after migration applied)
```
`run-all.mjs` is the cheap **refresh**: it re-reads live Greek/council/club/demand data and
recomputes Distribution / Outreach / Enrichment (and the full market layer) from the cached IPEDS
JSON — no re-download. Run it after the structural Campus Backfill settles.

### IPEDS source files (public, free — `https://nces.ed.gov/ipeds/datacenter/data/<FILE>.zip`)
`HD2023`, `C2015_A`…`C2023_A` (completions, prefer `_RV` revised), `DRVEF2023` (fall undergrad),
`EFFY2018`/`EFFY2023` (12-month undergrad, for trend). Download + unzip into a local dir and point
`parse-ipeds.mjs` `DIR` at it. Completions: AWLEVEL=5 (bachelor's), MAJORNUM=1 (first majors),
CIP `99`=total, `52.*`=business, `52.03*`=accounting.

## DB persistence
`migration/supabase-migrations/20260824_2000_campus_market_intelligence.sql` creates
`market_intel_runs`, `campus_market_intelligence`, `market_intel_identity_review`, and the
`campus_market_intelligence_card` dashboard view (deny-by-default RLS). **Not yet applied** — apply
via Management-API PAT or the dashboard SQL editor, then `node scripts/market-intel/import.mjs`.

## Guardrails
- Systems/districts are **never** auto-merged to a single campus; unresolved matches go to review.
- `ready_for_outreach=false` is **not** a suppression (it means "not yet activated"). Only opt-out /
  unsubscribe / recent-contact suppress the *action* priority — the market score is untouched.
- A high score never activates a campus, publishes a page, or sends anything.
