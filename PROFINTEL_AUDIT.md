# ProfIntel Cost Audit + Safe Batch Plan

**Date:** 2026-08-23 · **Branch:** `overnight/profintel-audit` · **Author:** overnight research run
**Scope:** understand the existing ProfIntel scraper, measure its real cost, assess data
quality, and build a *safe, budget-guarded* batch runner. **No bulk scraping was run.
No production data was written. No production deploy.**

> **Bottom line up front.** ProfIntel is cheap — a fresh single-campus scrape costs a
> *measured* **~$0.018 median / ~$0.023 mean / ~$0.042 p90** in the app's own cost model.
> The entire 946-campus universe can be scraped **once for well under $100** on any
> realistic calibration. **$100 is not the binding constraint — provider plan quotas and
> the ~9-hour wall-clock of a full pass are.** The two real risks are (1) the app's cost
> number **omits SerpAPI discovery entirely** and under-counts Gemini, so true dollars run
> higher than the logged figure, and (2) there is **no spend cap in the app today** — a
> batch "keeps going until done." This audit quantifies (1) and fixes (2) with a bounded
> runner that has a hard budget guard.

---

## 1. Existing architecture (what it is)

There is **no backend orchestrator**. Both the single-campus and batch flows run
**client-side** (React) and call three TanStack `createServerFn` server functions in order.

```
autoDiscoverCampusUrls   (SerpAPI + RMP GraphQL)   src/lib/auto-scrape.functions.ts:81
        ↓  facultyUrls, rmpUrl
scrapeCampusFaculty      (Firecrawl + Gemini)      src/lib/faculty-scrape.functions.ts:2434
        ↓  people → campus_lead_suggestions
scrapeCampusRmp          (RateMyProfessor GraphQL) src/lib/rmp-scrape.functions.ts:250
        ↓  RMP match/enrich → campus_lead_suggestions
[human triage in Lead Finder → importKeptLeads → outreach_leads]
```

The **batch** path (`src/components/outreach/BatchScrapePanel.tsx`) is just a client-side
worker pool that calls that same trio per campus at **concurrency 3**. Faculty must finish
before RMP (RMP reverse-lookup reads the cached directory markdown).

| Concern | Finding | Where |
|---|---|---|
| **Entry points** | UI-driven server fns only; **no CLI/script entry**. A separate Supabase edge fn `research-campus-leads-clean` is an AI-only parallel pipeline, *not* wired into the Firecrawl trio. | `BatchScrapePanel.tsx:128,179`; `AutoScrapeButton.tsx:158` |
| **Inputs (single)** | `scrapeCampusFaculty{campusId, urls[1..10], allowNoContact?}`; discovery takes just `{campusId}`. | `faculty-scrape.functions.ts:93` |
| **Inputs (batch)** | a `Set<campusId>` + vertical + sellPrice; loops the trio. `allowNoContact:true` in batch. | `BatchScrapePanel.tsx:62,145` |
| **Outputs** | `campus_lead_suggestions` (primary), RMP *updates* to it & to `outreach_leads`; `scrape_jobs` (HUD), `scrape_debug_bundles` (cost/metrics), `scrape_improvement_suggestions`, `scrape_batches`. Side-effect updates to `campuses` (rmp/faculty URLs, program flags). | `faculty-scrape.functions.ts:2292`; `rmp-scrape.functions.ts:576` |
| **SerpAPI** | env `SERPAPI_API_KEY`. Faculty discovery: up to **4** `google` queries, breaks early on first accounting-path hit. RMP discovery is a **fallback only** (0–2 calls). **≈1–4 calls/campus, worst case ~6.** | `auto-scrape.functions.ts:84,117,317` |
| **Firecrawl** | env `FIRECRAWL_API_KEY`. `PROFILE_ENRICH_LIMIT = 120` profiles/run, concurrency 4. Per campus: ~1 dir scrape/URL (≤3 URLs) + profile batch-scrape + optional pagination (≤8 pages) + optional **1 map** fallback (fires 16% of runs). | `faculty-scrape.functions.ts:156,159,170,179` |
| **AI extraction** | env `AI_GATEWAY_API_KEY`, model **gemini-2.5-flash** via Vercel AI Gateway. ~1 extract/URL. | `faculty-scrape.functions.ts:1557,1996` |
| **RMP** | `https://www.ratemyprofessors.com/graphql`, hardcoded public `Basic dGVzdDp0ZXN0`. **No key, effectively free.** 1 school search + 1–5 teacher pages/campus. | `rmp-scrape.functions.ts:10,141` |
| **Retry** | **No exponential backoff.** 429s surfaced, not auto-retried. One bounded "empty payload" enrich retry; edge fn retries once. Timeouts (not retries) on every call. | `faculty-scrape.functions.ts:56,892` |
| **Concurrency** | batch campuses **3**; URLs/run **3**; profile enrich **4**. | `BatchScrapePanel.tsx:199`; `faculty-scrape.functions.ts:157,159` |
| **Dedupe** | app-level only (no DB unique constraint): in-memory by email/name+url, then DB existence check vs **active (non-archived)** rows by email per campus. Archived rows don't block re-scrape. RMP dedupes by email + fuzzy name resolver. | `faculty-scrape.functions.ts:2359,2373`; `rmp-scrape.functions.ts:611` |
| **Matching** | name→profile via slug patterns; name→RMP via `firstToken+lastName` key with 3 fallbacks + two-pass (accounting loose, others strict) to survive depts filed under "Business". | `faculty-scrape.functions.ts:672`; `rmp-scrape.functions.ts:373,429` |
| **Cost instrumentation** | `src/lib/scrape-cost.ts` counts ops from `perPage`, stores `credits_estimate_usd` on `scrape_debug_bundles`. | `scrape-debug.server.ts:169` |
| **Existing limits** | `PROFILE_ENRICH_LIMIT=120`, `PER_HOST_FAIL_LIMIT=4`, `MAP_FALLBACK_EMAIL_THRESHOLD=5`, `MAX_PAGINATION_PAGES=8`, faculty URLs capped to 3, per-call timeouts, `ENABLE_EMAIL_INFERENCE=false`. | `faculty-scrape.functions.ts:156–199` |
| **Missing control** | **No global/cumulative spend cap. Nothing aborts a batch when a dollar threshold is crossed.** | — (this is what the runner adds) |

---

## 2. Credit / balance visibility

**Can we query remaining credits programmatically? Yes — but not from this environment.**
The provider keys (`FIRECRAWL_API_KEY`, `SERPAPI_API_KEY`, `AI_GATEWAY_API_KEY`) are
**server-side only** (Vercel / Supabase secrets). The local repo `.env` contains **only
Supabase keys**. So no balance call can be made from this audit box, and none was.

The **safe, free, read-only** balance endpoints (run these where the keys live, e.g. a
Vercel function or your shell with the key exported — never commit the key):

| Provider | Endpoint | Returns | Notes |
|---|---|---|---|
| **SerpAPI** | `GET https://serpapi.com/account.json?api_key=…` | `plan_searches_left`, `total_searches_left`, `this_month_usage`, `plan_name`, renewal date, `account_rate_limit_per_hour` | Free; **does not** count against quota. |
| **Firecrawl** | `GET https://api.firecrawl.dev/v2/team/credit-usage` (`Authorization: Bearer …`) | `remainingCredits`, `planCredits`, billing period | Free. (v1 path also exists.) |
| **Vercel AI Gateway (Gemini)** | *No standard per-key balance endpoint.* | — | Report as **not programmatically queryable**; track via Vercel billing dashboard. |

**Action for Lee:** before any paid batch, run the two balance calls above and confirm the
plan quotas cover the run (see §6 quota math). This audit **does not guess** any balance.

---

## 3. Cost per campus (measured, from 334 real runs)

Pulled live from `scrape_debug_bundles` (334 rows, all `kind=faculty`) — a far bigger
sample than the June snapshot's 39. All figures are the app's **`credits_estimate_usd`**.

| Metric (per single run) | mean | p50 | p75 | p90 | p99 | max |
|---|---|---|---|---|---|---|
| **Est. cost (USD)** | **$0.023** | **$0.018** | $0.026 | **$0.042** | $0.105 | $0.121 |
| Contacts inserted | 18 | 8 | 19 | 44 | 140 | 421 |
| Contacts w/ email | 21 | 11 | 24 | 48 | 143 | 378 |
| Duration (s) | 106 | 83 | 140 | 216 | 360 | 406 |

- **Per-campus fresh scrape ≈ $0.017–0.045** (single run). Re-scraping the same campus
  several times pushes the *cumulative* per-campus figure to a mean $0.047 / p90 $0.096.
- Total est. spend across all 334 logged runs: **$7.66** → **$0.0013 / contact**.
- `map` fallback fired on **55/334 (16%)** of runs; pagination is rare.

### ⚠ Two calibration gaps (why true dollars are higher than the log)

1. **SerpAPI discovery is not counted at all.** `scrape-cost.ts` only prices Firecrawl +
   AI. Discovery runs ~1–4 SerpAPI searches/campus. At a typical **$0.015/search** that is
   **~$0.03/campus of *uncounted* cost** — potentially *larger* than the whole logged
   estimate. (Mitigant: discovery caches `faculty_page_url`; re-scrapes can skip it.)
2. **Gemini is under-priced.** The model bills `aiExtract` at $0.0008; a real
   gemini-2.5-flash extraction over a full directory page is nearer **$0.003–0.005**.

**Calibrated planning bands (what to actually budget against):**

| Band | $/campus | Basis |
|---|---|---|
| Optimistic (app model, Firecrawl+AI only) | **$0.02** | measured p50–mean |
| **Realistic (all-in: + SerpAPI + real Gemini)** | **$0.05** | recommended planning number |
| Conservative ceiling (for hard guards) | **$0.12** | ≈ measured max single run; safe cap |

> **No live sample was run** — the provider keys are not available locally and the task
> caps incremental spend, so making paid calls would have been both impossible and against
> the brief. The 334-run history is a stronger basis than a 3-campus sample anyway.

---

## 4. Data-quality assessment

RMP is **candidate discovery, not truth.** What the pipeline captures today:

**Present:** `email_confidence` enum (`verified|directory|inferred|news`, in `raw_payload`),
`is_cpa`/`is_phd`, title, profile_url, LinkedIn/CV links, `source_url`, `name_only` flag,
pagination provenance, and RMP identity/quality (`rmp_rating`, `rmp_num_ratings`,
`rmp_difficulty`, `rmp_would_take_again`, `rmp_profile_url`, `rmp_checked_at`,
`raw_payload.rmp_department`, `rmp_legacy_id`). Program depth is persisted on `campuses`
(`has_bachelors/masters/phd_accounting` + evidence).

**Missing / weak (relevant to import quality):**

| Risk | Likelihood | Why | Mitigation to add |
|---|---|---|---|
| Import **former** professors | **Medium** | RMP GraphQL query requests **no rating date**; a prof who left years ago still returns. | Capture most-recent-rating year; flag stale. |
| **Wrong-department** professor | Low–Med | Two-pass matcher (accounting loose / others strict) already guards the "filed under Business" case, but cross-dept name collisions remain possible. | Keep `rmp_department`; require dept OR course evidence before promoting. |
| **Miss adjuncts** | Medium | Adjuncts often absent from directories and RMP. | Accept; supplement via course-schedule scraping later. |
| **Duplicate names** | Low | Dedup is by **email**; two profs w/o email + similar names can both land. Archived rows deliberately don't block re-scrape → re-runs can re-create previously-archived people. | Add a soft (campus, lastname, first-initial) uniqueness check on insert. |
| No `department`/numeric `confidence`/`imported_at`/`last_verified` on the Firecrawl path | — | Only the edge fn writes those. | See §7 write-plan. |

**Net:** good enough for a human-triaged review queue (its intended use), **not** safe for
unattended auto-promotion into `outreach_leads`. Keep the human import step.

---

## 5. $25 / $50 / $100 scenarios

Universe today: **946 campuses** (863 US). Campus-scrapes affordable per budget:

| Band | $/campus | $25 | $50 | **$100** |
|---|---|---|---|---|
| Optimistic (Firecrawl+AI only) | $0.02 | 1,250 | 2,500 | **5,000** |
| **Realistic (all-in)** | $0.05 | 500 | 1,000 | **2,000** |
| Conservative ceiling | $0.12 | 208 | 416 | **833** |

**Reading these honestly:**

- **A full one-pass scrape of all 946 campuses costs ~$19 optimistic / ~$47 realistic /
  ~$114 conservative.** So **$100 covers the entire database once** on the realistic and
  optimistic bands, and ~880/946 on the pessimistic band.
- **$25** already covers the entire high-value tier several times over.
- The uncertainty is dominated by the two calibration gaps in §3. Treat **$0.05/campus**
  as the working number and **$0.12** as the guard ceiling.

**The real limits are not dollars:**
- **Runtime:** 946 × ~106 s mean ÷ concurrency 3 ≈ **9 hours** for one full pass. Budget
  overnight windows and use the runner's `--max-runtime-min`.
- **Provider quotas:** a full pass ≈ **~1,900 SerpAPI searches** (Developer plan 5k/mo is
  plenty; free tiers are not) and **~15k–40k Firecrawl credits** (Standard 100k/mo is
  plenty; Hobby 3k is **not**). Confirm via §2 before running.

---

## 6. The bounded batch runner (built + tested)

`scripts/profintel/batch-runner.mjs` — a safe scheduler/guard layer. It does **not**
re-implement the scraper; it calls an injectable `scrapeOne(campus)` executor. The
**default executor is a dry-run simulator that makes zero network calls.**

**Guards (all hard; the runner always stops *before* a campus that would breach one):**

- `--budget-usd` — hard dollar ceiling. Uses **reservation accounting** so concurrency
  can't overshoot: it reserves a conservative per-campus estimate before starting, then
  reconciles with the actual reported cost.
- `--max-requests` — hard provider-request ceiling (the guard that matters when dollars are
  fuzzy).
- `--max-runtime-min`, `--max-campuses` — wall-clock and count ceilings.
- `--concurrency` (default 3, matches the app), `--retry-cap` (default 1).
- `--priority-min P1|P2|P3|P4` — only scrape at/above a tier.
- **Resumable + idempotent:** `--checkpoint` file records each completed campus; a re-run skips
  done campuses (each completed campus is recorded). Dedupe of professor rows is still
  owned by the existing pipeline.
- **Graceful stop:** Ctrl-C finishes in-flight campuses, writes the checkpoint, exits.
- **Detailed cost log:** per-campus JSONL (`--cost-log`) with cost, requests, yield,
  cumulative totals, duration.
- **Refuses to spend by accident:** `--execute` requires a wired `--executor` module;
  without it the runner refuses. The live executor ships as a **throwing stub**.

**Tests:** `scripts/profintel/batch-runner.test.mjs` — 10 tests, all passing:
budget guard never exceeds (incl. concurrency>1), max-campuses/max-requests ceilings,
dry-run makes zero calls, resume idempotency, retry cap terminates, failed campus consumes
no budget, priority filter, arg parsing.

```
node --test scripts/profintel/batch-runner.test.mjs      # 10/10 pass
```

**Proven end-to-end** in dry-run against `PROFINTEL_PRIORITY.csv` with `--budget-usd 2`:
stopped cleanly at $1.75 spent (never exceeded), 26 campuses simulated, checkpoint written.

### Wiring live execution (deliberate future step — not done tonight)

Implement `scrapeOne()` in `scripts/profintel/executors.mjs` per OPTION A (POST the
deployed app's three server fns in order, compute cost via `scrape-cost.ts`). Requires the
server-side provider keys. The pipeline still owns campus→UUID resolution, all Supabase
writes, and dedupe — the runner never writes professor rows itself.

---

## 7. Safe data-write plan (for the future live batch)

When a live batch runs, each row it creates/updates should carry provenance so a later,
higher-confidence source never silently loses to a scraper:

| Field | Value | Purpose |
|---|---|---|
| `source` / `research_label` | `faculty_scrape_v2_firecrawl` / `rmp_*` (already set) | provenance |
| `imported_at` *(add)* | timestamp of the batch run | freshness |
| `last_verified` *(add)* | timestamp when email/title last confirmed on-page | staleness sweeps |
| `confidence` *(numeric, add on Firecrawl path)* | map `email_confidence` → 0.9/0.6/0.3 | ranking / promotion gate |
| `rmp_*` identifiers | already captured | link back to RMP |
| `raw_payload.batch_id` *(add)* | the runner's checkpoint/run id | auditability |

**Rules:**
1. **Never overwrite a manually-verified row with lower-confidence scraper data.** Gate
   updates on `incoming.confidence >= existing.confidence` OR `existing.source = 'manual'` → skip.
2. Keep the **human import step** (`importKeptLeads`); do not auto-promote to `outreach_leads`.
3. Add the soft `(campus_id, lastname, first_initial)` de-dup check (see §4) so archived
   people aren't silently re-created on re-scrape.
4. Write everything to the **review queue** (`campus_lead_suggestions`) first, as today.

---

## 8. Recommended first batch

`PROFINTEL_PRIORITY.csv` ranks all 946 campuses. Scoring favors: market_priority/tier, SEC
(large Greek/athletic), active product campuses, Student-Ready, enrollment, textbook
adoption, grad accounting programs, and **low current professor coverage** (680 campuses
have **0** professors on file). Non-US campuses are deprioritized (the engine is US/RMP-tuned).

- **Buckets:** P1 = 2, P2 = 7, P3 = 52, P4 = 885.
- **Recommended first batch = P1 + P2 + P3 (US) = 61 campuses.**
  - Est. realistic cost **~$4.25** (conservative ceiling ~$7.3). Runtime ~40 min at conc. 3.
  - This is a safe pilot that also **re-calibrates the cost model against a real invoice**
    before any larger run.
- Top of the list (excerpt): Park University, UCLA, Texas A&M, Houston CC, Hawaii Pacific,
  USF, UT Arlington, UT Austin, Lone Star College, Florida Atlantic, UW-Madison, USC.

> Caveat: the priority score leans on `market_priority` (mostly "low" today) and live
> coverage counts. Treat it as a starting sort to review, not a precise market model — the
> DB lacks true market-size inputs for most rows.

---

## 9. Exact command Lee can approve/run later

**Dry-run the recommended first batch (safe, zero spend) — do this first:**

```bash
node scripts/profintel/batch-runner.mjs \
  --input PROFINTEL_PRIORITY.csv \
  --priority-min P3 --max-campuses 61 \
  --budget-usd 10 --max-requests 1200 --max-runtime-min 90 \
  --concurrency 3 --retry-cap 1 \
  --checkpoint .profintel-first-batch.json
```

**Then, only after (a) confirming credit balances (§2) and (b) wiring `scrapeOne` (§6):**

```bash
node scripts/profintel/batch-runner.mjs \
  --input PROFINTEL_PRIORITY.csv \
  --priority-min P3 --max-campuses 61 \
  --budget-usd 10 --max-requests 1200 --max-runtime-min 90 \
  --concurrency 3 --retry-cap 1 \
  --checkpoint .profintel-first-batch.json \
  --execute --executor scripts/profintel/executors.mjs
```

A full-universe pass later: raise `--max-campuses`, `--priority-min P4`, `--budget-usd 100`,
`--max-runtime-min 600`, and re-use the same `--checkpoint` to resume across nights.

---

## 10. What was NOT done (by design)

- ❌ No bulk scraping. ❌ No paid API calls (keys unavailable locally anyway).
- ❌ No production writes. ❌ No production deploy. ❌ No live credit-balance query (keys absent).
- ✅ Read-only pulls from Supabase (campuses, suggestions, debug bundles) for analysis.
- ✅ Batch runner + tests built and verified in dry-run.
- ✅ Deliverables committed on `overnight/profintel-audit` for review.

**Open questions for Lee:** (1) confirm SerpAPI/Firecrawl plan tiers + balances; (2) approve
the first-batch list; (3) approve wiring the live executor. Nothing paid runs until then.
