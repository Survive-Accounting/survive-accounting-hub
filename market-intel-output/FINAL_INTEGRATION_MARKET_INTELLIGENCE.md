# Market Intelligence — Final Dashboard Integration Handoff

_Generated 2026-08-25 · config `v1` · IPEDS 2024 · verified against live DB (no recalculation) · commit `0dc13162`_

> Documentation-only handoff. No new research, no model changes, no deploy. All field names, null-rates, and joins below were introspected from the live database on 2026-08-25.

**The dashboard homepage = a ranked list of campuses.** Everything it needs is one row per campus in the view **`campus_market_intelligence_card`**, ordered by `outreach_priority_score DESC`. There is no hidden "AI next-action engine" — the scores are transparent, versioned, and configurable in `src/lib/market-intel/scoring-config.json`.

---

## 1. Campus priority data — the fields and what they mean

Source table `campus_market_intelligence` (832 rows, one per matched `campuses.id`). `segment='primary'` = the 4-year target market (675 distinct institutions after dedupe); `segment='two_year'` = community colleges (104), kept separate.

### The five scores (0–100)
| Score | Field | Meaning | Weights (v1) | Nulls (primary) |
|---|---|---|---|---|
| **Market Opportunity** | `market_opportunity_score` | How big is the accounting market? Demand size. | 40% business/Intro-1 · 20% undergrad · 15% business concentration · 15% Greek · 10% accounting | 0 |
| **Growth Momentum** | `growth_momentum_score` | Is that market growing? Trajectory. | 40% 5Y business CAGR · 25% 3Y growth · 15% share change · 10% undergrad trend · 10% accounting trend | 12 (INSUFFICIENT_DATA) |
| **Distribution Strength** | `distribution_strength_score` | Can we reach/activate it? Reachability. | 35% Greek · 25% council contacts · 15% role inboxes · 10% chapter contacts · 10% WIB · 5% finance | 1 |
| **Outreach Priority** | `outreach_priority_score` | Where should King work first? The queue order. | 50% Market · 25% Distribution · 20% Growth · 5% Live Demand · **0% Course Readiness** | 0 |
| **Enrichment Priority** | `enrichment_priority_score` | Where should we research next? | Market Opportunity × missing structural intelligence | 0 |

All scores are **percentile-normalized within the 4-year segment**, so a giant public and a small private are scored on the same 0–100 scale. Distribution and Outreach **renormalize over available components** — a not-yet-researched signal is excluded, never scored 0.

### The raw market drivers (IPEDS 2024, all preserved beside the scores)
| Field | Meaning | Nullable |
|---|---|---|
| `business_bachelors` | Annual business bachelor's completions (CIP 52.*) — the market-size anchor | 0 nulls |
| `accounting_bachelors` | Annual accounting completions (CIP 52.03*) | rare |
| `total_bachelors` | All bachelor's completions (CIP 99) | rare |
| `business_share_of_bachelors` | Business concentration = business ÷ total bachelor's | rare |
| `accounting_share_of_business` | Accounting ÷ business | rare |
| `undergrad_enrollment` | Fall undergrad headcount (DRVEF2023; `undergrad_enrollment_year` in `raw_json`) | 2 |
| `estimated_intro1_annual` | **Estimated** annual Intro-1 seat pool = `business_bachelors × 2.4` | 0 |
| `business_series` (jsonb) | Full 2015→2024 business completions history for sparklines | 0 |
| `business_growth_1y/3y/5y`, `business_5y_cagr` | Growth rates | some |
| `undergrad_growth_5y`, `accounting_growth_5y` | Enrollment / accounting trends | some |
| `growth_label` | Human bucket: RAPID_GROWTH / GROWING / STABLE / DECLINING / INSUFFICIENT_DATA | 0 |

### Data-completeness fields (how much to trust the above)
| Field | Meaning |
|---|---|
| `market_data_completeness` | Fraction of Market Opportunity inputs present |
| `distribution_data_completeness` | Fraction of Distribution inputs researched — **read this with `distribution_strength_score`** |
| `structural_completeness` | Fraction of structural signals present (Greek, council contacts, inboxes, clubs) — drives Enrichment |

---

## 2. Safe vs unsafe signals

| Class | Fields | Rule |
|---|---|---|
| **RANKING** (sort the homepage) | `outreach_priority_score`, `market_opportunity_score`, `growth_momentum_score`, `enrichment_priority_score`, `estimated_intro1_annual`, `business_bachelors`, `distribution_strength_score`\* | Safe to order by. \*Distribution only alongside its completeness. |
| **DISPLAY ONLY** (show, don't sort) | `growth_label`, `councils_present`, `greek_chapters`, `top_drivers`, `recommended_next_action`, `business_series`, `business_growth_*`, `business_share_of_bachelors`, `accounting_bachelors`, `undergrad_enrollment`, `latest_data_year`, `ipeds_name` | Context/explainability. |
| **DATA QUALITY ONLY** (badges/filters) | `market_data_completeness`, `distribution_data_completeness`, `structural_completeness`, `match_method`, `match_confidence`, `duplicate_unitid`, `greek_available`, `council_available`, `club_available`, `first_party_signal_count` | Confidence & gap detection, not ranking. |
| **DO NOT USE (yet)** | `course_readiness_score` (100% null), `live_demand_score` (100% null), `action_suppressed` (100% false), `council_contacts_councils`/`role_inbox_councils` as standalone ranks | COMING_SOON or not-yet-populated. |

### ⚠️ Greek opportunity IS currently double-counted (documented, not changed)
Greek chapter count feeds **both** Market Opportunity (`greek_opportunity`, 15%) **and** Distribution Strength (`greek_opportunity`, 35%). Because Outreach Priority = 50% MO + 25% DS, Greek enters the outreach queue twice:

```
(0.15 × 0.50) + (0.35 × 0.25) = 0.0750 + 0.0875 ≈ 16.25% of Outreach Priority
```

**Impact:** modestly over-weights Greek-heavy campuses in the *outreach queue only*. Market Opportunity and Growth Momentum as standalone sorts are unaffected. **Recommendation for the final synthesis (do NOT change now):** drop `greek_opportunity` from Market Opportunity (its natural home is Distribution), or lower the MO Greek weight and renormalize.

---

## 3. Exact dashboard view — one row per campus

**Use `campus_market_intelligence_card`** (Postgres view; `campus_market_intelligence` ⋈ `campuses`). Order by `outreach_priority_score DESC NULLS LAST`, filter `segment='primary'`. For one row per *institution* (collapse the 54 duplicate-UNITID pairs) add `raw_json->>'duplicate_primary' <> 'false'` on the base table, or `DISTINCT ON (ipeds_unitid) … ORDER BY market_data_completeness DESC`.

| Field | Source | Meaning | Nullable | Confidence | Freshness | Safe for UI |
|---|---|---|---|---|---|---|
| `campus_id` | campuses.id | canonical key | no | exact | static | join key |
| `campus` | campuses.display_name/name | display name | no | exact | static | ✅ |
| `state` | campuses / IPEDS | state | rare | high | static | ✅ |
| `ipeds_unitid` | IPEDS match | institution identity | ~2% | 0.88–1.0 (`match_confidence`) | IPEDS 2024 | badge |
| `segment` | derived | primary / two_year | no | exact | static | filter |
| `outreach_priority_score` | scored | work-queue order | no | model v1 | refresh-time | ✅ rank |
| `market_opportunity_score` | scored | market size | no | model v1 | IPEDS 2024 | ✅ rank |
| `growth_momentum_score` | scored | trajectory | 12/primary | model v1 | IPEDS 2024 | ✅ rank (+label) |
| `growth_label` | scored | growth bucket | no | model v1 | IPEDS 2024 | ✅ display |
| `distribution_strength_score` | scored (live) | reachability | 1/primary | **partial** | refresh-time | ✅ with completeness |
| `distribution_data_completeness` | derived | how researched | no | exact | refresh-time | ✅ badge |
| `course_readiness_status` | placeholder | 'COMING_SOON' | no | n/a | — | ✅ ("Coming soon") |
| `course_readiness_score` | placeholder | null | 100% | n/a | — | ❌ |
| `live_demand_status` | placeholder | 'COMING_SOON' | no | n/a | — | ✅ label |
| `estimated_intro1_annual` | derived | est. Intro-1/yr | no | **low** (×2.4) | IPEDS 2024 | ✅ display "~est." |
| `business_bachelors` | IPEDS 2024 | business grads/yr | no | high | IPEDS 2024 | ✅ |
| `business_growth_5y` | IPEDS | 5Y growth | some | high | IPEDS 2024 | ✅ display |
| `greek_chapters` | campus_greek_chapters (live) | Greek count | many null | partial | refresh-time | ✅ display |
| `councils_present` | campus_greek_chapters (live) | [ifc,panhellenic,…] | array | partial | refresh-time | ✅ chips |
| `enrichment_priority_score` | scored | research queue | no | model v1 | refresh-time | ✅ rank (enrichment) |
| `recommended_next_action` | derived | short next step | no | heuristic | refresh-time | ✅ display |
| `action_suppressed` | derived | hold flag | no (all false) | n/a | — | ❌ until events exist |
| `top_drivers` (jsonb) | derived | 3–5 "why" bullets | no | model v1 | refresh-time | ✅ display |
| `market_data_completeness` | derived | market confidence | no | exact | IPEDS 2024 | ✅ badge |
| `generated_at` | run | scoring timestamp | no | exact | refresh-time | ✅ "as of" |

---

## 4. Campus priority analysis inputs (for the final synthesis, no new engine)

When the synthesis session builds the initial **Fall 2026** priority order, recommended input signals:

| Signal | Field(s) here | Available now? |
|---|---|---|
| Market size | `business_bachelors`, `estimated_intro1_annual`, `undergrad_enrollment` | ✅ here |
| Business concentration | `business_share_of_bachelors` | ✅ here |
| Growth | `growth_momentum_score`, `business_5y_cagr`, `growth_label` | ✅ here |
| Greek reach | `greek_chapters`, `councils_present`, `greek_available` | ✅ here (partial coverage) |
| Contact availability | `distribution_strength_score`, `council_contacts_councils`, `role_inbox_councils` | ✅ here (partial) |
| Overall priority | `outreach_priority_score` | ✅ here |
| Research gaps | `enrichment_priority_score`, `structural_completeness` | ✅ here |
| **Paid market validation** | textbook adoption / competitor pricing | ⛔ **Course Intel / Competitive sessions** (`campus_course_availability`, `campus_intelligence`) |
| **Course readiness** | which intro courses/professors are ready | ⛔ **Course Intel session** (`course_readiness_*` reserved) |
| **Actual Survive demand** | page visits, Exam-1 opens, orders, waitlist, rep signups | ⛔ **Analytics** (`live_demand_*` reserved; `landing_page_events`, `orders`, `campus_waitlist` exist, not yet scored) |

**Guidance:** market intelligence supplies WHO (market/growth) and READINESS (distribution). The synthesis can start the Fall-2026 order on `outreach_priority_score` today, then layer paid-validation, course-readiness, and first-party demand as those sessions hand off — the null slots already exist.

---

## 5. Enrichment gaps — high market + missing intelligence

Feed the visible ✨ enrichment checklist from `campus_market_intelligence` (not a static top-25). **High value + missing structural/course data:**

```sql
SELECT campus_id, campus, state, market_opportunity_score,
       distribution_strength_score, distribution_data_completeness,
       enrichment_priority_score, greek_available, council_available,
       council_contacts_councils, role_inbox_councils, club_available,
       course_readiness_status, structural_completeness
FROM   campus_market_intelligence
WHERE  segment = 'primary'
  AND  (raw_json->>'duplicate_primary') <> 'false'
  AND  market_opportunity_score >= 70
  AND  (distribution_strength_score IS NULL OR distribution_strength_score < 30)
ORDER  BY enrichment_priority_score DESC;   -- currently 84 campuses
```

**Per-gap flags for the checklist rows:**
| Checklist item | Condition |
|---|---|
| Find Greek chapters | `greek_available = false` (only ~219/675 primary have Greek data) |
| Find council contacts | `council_available = true AND council_contacts_councils = 0` |
| Research councils | `council_available = false` |
| Find role inboxes | `role_inbox_councils = 0` |
| Find business clubs (WIB/finance) | `club_available = false` (only 62 rows have clubs) |
| Add course intelligence | `course_readiness_status = 'COMING_SOON'` (all) |

`structural_completeness` (0–1) is the single roll-up for "how much structural intel exists." Rank the checklist by `enrichment_priority_score` (Market × missingness). Full list also in `TOP_ENRICHMENT_GAPS.csv`.

---

## 6. Joins

**Canonical key = `campuses.id` (uuid).** `ipeds_unitid` (text) is the institution *identity* for dedup/analytics, **not** a join key (54 institutions share a UNITID across two campus rows).

| Target domain | Table(s) | Join |
|---|---|---|
| Campus identity | `campuses` | `campus_market_intelligence.campus_id = campuses.id` (FK, cascade) |
| Course intelligence | `campus_course_availability`, `campus_courses`, `course_intel_campus_status`, `professor_intro1_evidence` | `<t>.campus_id = campus_market_intelligence.campus_id` |
| Structural (Greek/council) | `campus_greek_chapters`, `campus_council_status`, `campus_council_contacts` | `<t>.campus_id = …campus_id` (read live by refresh) |
| Competitive intelligence | `campus_intelligence`, `campus_tam_estimates`\* | `<t>.campus_id = …campus_id` |
| Growth contacts | `growth_business_clubs`, `growth_public_contacts` | `<t>.campus_id = …campus_id` |
| Growth contacts (people) | `growth_contacts` | **no `campus_id`** — reach via `growth_public_contacts.campus_id` or `growth_outreach_events.campus_id` |
| Future analytics (Live Demand) | `landing_page_events`, `orders`, `campus_waitlist`, `student_set_progress`, `practice_attempts` | `<t>.campus_id = …campus_id` |
| Run metadata | `market_intel_runs` | `campus_market_intelligence.run_id = market_intel_runs.id` |
| Identity review | `market_intel_identity_review` | `.campus_id = campuses.id` (exclude/badge these) |

\*`campus_tam_estimates` is legacy / non-authoritative — superseded by this session unless a row is explicitly IPEDS-sourced with a year.

---

## 7. Code / migration status

| Item | Value |
|---|---|
| Branch | `overnight/campus-market-intelligence` |
| Commit | `0dc13162` (not pushed, not deployed) |
| Tables | `campus_market_intelligence` (832), `market_intel_identity_review` (124), `market_intel_runs` (1) |
| View | `campus_market_intelligence_card` (832) |
| Migration | `migration/supabase-migrations/20260824_2000_campus_market_intelligence.sql` |
| Applied? | **Yes** — schema created by you in Postgres; data loaded via `import.mjs` |
| Config | `src/lib/market-intel/scoring-config.json` (all weights/versions live here) |
| Refresh | `node scripts/market-intel/run-all.mjs` → `node scripts/market-intel/import.mjs` |
| Full rebuild | `parse-ipeds.mjs → match.mjs → resolve-review.mjs → run-all.mjs → import.mjs` |
| Must merge | Branch → `main` (scripts/, `src/lib/market-intel/`, migration). Migration already applied live; merge is for source-of-truth + so the dashboard can import `scoring-config.json`. |

**Scoring versions:** `market_opportunity_v1`, `growth_momentum_v1`, `distribution_strength_v1`, `outreach_priority_v1`, `enrichment_priority_v1`; `course_readiness_v1` (COMING_SOON, weight 0); `live_demand_v1` (COMING_SOON / NOT_CONNECTED).

---

## Known caveats (carry into synthesis)
1. **Greek double-count** between Market Opportunity and Distribution Strength (~16.25% of Outreach Priority) — documented, unchanged.
2. IPEDS 2024 completions are **provisional**; source year stored per row.
3. `estimated_intro1_annual` = business × 2.4 — **estimate, not measured enrollment**.
4. Greek data covers only ~219/675 primary institutions → Distribution is **partial**; always pair the score with `distribution_data_completeness`.
5. `live_demand_score`, `course_readiness_score` = 100% null; `action_suppressed` = 100% false — do not rank on them.
6. 54 institution-level duplicate UNITIDs (108 rows) — dedupe via `raw_json->>'duplicate_primary'`; the underlying campus duplication is a separate cleanup.
7. `market_intel_runs` aggregate columns count duplicate records; canonical deduped figures: **675 institutions / 221,024 business grads / 530,461 est. Intro-1**.

---

# MARKET INTELLIGENCE READY FOR DASHBOARD INTEGRATION: **YES**

The dashboard can build the Fall-2026 ranked campus list today from `campus_market_intelligence_card` ordered by `outreach_priority_score`, with `distribution_data_completeness` as the confidence badge and `enrichment_priority_score` driving the ✨ checklist. Course Readiness, Live Demand, paid-validation, and first-party demand plug into reserved null slots as other sessions hand off — no schema changes required for those. The only model decision to flag before a v2 tune is the Greek double-count.
