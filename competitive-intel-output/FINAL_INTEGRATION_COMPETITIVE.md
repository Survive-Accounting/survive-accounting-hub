# Final Dashboard Integration Handoff — Competitive Intelligence

_Dataset frozen for V1. This is a documentation handoff — no discovery, no ads._

> ⚠️ **Storage reality (read first):** this entire dataset is **file-backed only**. There is **no DB table, no view, and no migration** — nothing is queryable from the live application yet. The single step to integration is a one-time import of `COMPETITIVE_CAMPUS_AGGREGATES.json` into a table keyed on `campus_id`. Details in §5.

---

## 1. Campus-level contract

**Canonical source:** `competitive-intel-output/COMPETITIVE_CAMPUS_AGGREGATES.json` → `campuses[]` (766 rows), keyed by `campus_id` (**= `campuses.id`**, uuid — direct join, no name matching).

The dashboard's high-level context maps to these exact fields:

| Dashboard context | Field | Type / values |
|---|---|---|
| Paid market validated | `validated_paid_market` | bool |
| Paid Intro Accounting market | `intro_accounting_paid_market_status` | STRONG / MODERATE / WEAK / UNKNOWN |
| Paid support market (any subject) | `paid_market_status` | STRONG / MODERATE / WEAK / UNKNOWN |
| Competition intensity | `competition_intensity` | NONE / LOW / MEDIUM / HIGH |
| Strongest competitor | `strongest_competitor` | `{name, domain, type, course_specific}` |
| Course-specific competitor present | `course_specific_competitors` | int (>0 = present) |
| Study Edge presence | `study_edge_present` | bool (sourced from Study Edge deep-dive; **UF confirmed**, see note) |
| Sponsored ads observed | `ads_observed` | bool |
| White-space / crowded status | `market_status` | VALIDATED_PAID_MARKET / CROWDED / WHITE_SPACE / LOW_EVIDENCE |
| (also) `white_space` | bool | convenience boolean |

**Join (after import):**
```sql
SELECT c.id, c.name, ci.paid_market_status, ci.intro_accounting_paid_market_status,
       ci.competition_intensity, ci.market_status, ci.strongest_competitor_name,
       ci.course_specific_competitors, ci.study_edge_present, ci.ads_observed
FROM campuses c
JOIN campus_competitive_intel ci ON ci.campus_id = c.id;   -- table does not exist yet (see §5)
```
**Until imported:** read the JSON directly, `campuses[]` indexed by `campus_id`.

> **`study_edge_present` note:** Study Edge gates its content, so it rarely appears in per-campus *organic* discovery. This flag is populated from the Study Edge deep-dive for the campus it explicitly names — **University of Florida (ACG2021)**. `false` elsewhere means "not confirmed here," not "absent" — Study Edge's broader FL footprint (FSU/UCF) is discussed in `UF_STUDY_EDGE_COMPETITIVE_BRIEF.md` but was not per-campus-confirmed in this dataset.

---

## 2. Priority-analysis use (field classification)

**Governing rule: competitor presence is POSITIVE market validation and must NEVER reduce campus attractiveness.** A CROWDED market = proven willingness to pay (good). WHITE_SPACE at high Market Opportunity = first-mover lane (also good, different playbook). `competition_intensity` is **segmentation**, not a penalty.

| Field | Classification |
|---|---|
| `paid_market_status` | **POSITIVE MARKET VALIDATION** |
| `intro_accounting_paid_market_status` | **POSITIVE MARKET VALIDATION** |
| `validated_paid_market` | **POSITIVE MARKET VALIDATION** |
| `course_specific_competitors` (>0) | **POSITIVE MARKET VALIDATION** |
| `course_code_network_present` | **POSITIVE MARKET VALIDATION** (exact product-fit signal) |
| `study_edge_present` | **POSITIVE MARKET VALIDATION** |
| `ads_observed` | **POSITIVE MARKET VALIDATION** (demand signal) |
| `competition_intensity` | **COMPETITION / CONTEXT** (segmentation only) |
| `market_status` | **COMPETITION / CONTEXT** |
| `white_space` | **COMPETITION / CONTEXT** |
| `paid_competitors` (count) | **COMPETITION / CONTEXT** |
| `strongest_competitor` | **DISPLAY ONLY** (`type` may inform context) |
| `competitor_price_context` | **DISPLAY ONLY** (partial/gated coverage) |
| `top_competitor_domains` | **DISPLAY ONLY** |
| `market_opportunity` | **DISPLAY ONLY** (owned by market-intel, not this session) |
| `evidence_confidence` | **DO NOT USE** as a score (meta — gate weight only) |
| `searches_run` | **DO NOT USE** (data-collection meta) |
| `university_free_support` | **DO NOT USE** for priority (context only) |

**Recommended wiring:** feed the POSITIVE fields as additive market-validation inputs; use CONTEXT fields to pick the playbook (validated vs first-mover); render DISPLAY-ONLY on the card. `course_code_network_present` is worth an **action trigger** (spin a course-code landing page). Gate weight by `evidence_confidence` (low → count for less), never subtract for competition.

---

## 3. UI — keep it small

One concise **MARKET** section in the existing campus drawer (no standalone competitor dashboard):

```
MARKET
  Paid support market          Strong          ← paid_market_status
  Intro Accounting paid        Yes             ← intro_accounting_paid_market_status (STRONG/MODERATE → "Yes")
  Course-specific competitors  5               ← course_specific_competitors
  Study Edge                   Active          ← study_edge_present (UF)
  Market                       Crowded         ← market_status (chip)
```

Price context + strongest competitor are optional hover/detail (display-only). That's the whole footprint — ~5 rows.

---

## 4. Join contract

- **Canonical campus key:** `campus_id` (uuid) **= `campuses.id`**. No name matching required.
- **Aggregate source (canonical):** `COMPETITIVE_CAMPUS_AGGREGATES.json → campuses[]` → (after import) `campus_competitive_intel` (PK `campus_id`, FK → `campuses.id`).
- **Deduped competitor identifier:** `domain` — the dedup key across all campuses. Registry: `COMPETITIVE_CAMPUS_AGGREGATES.json → competitor_registry[]` (653 rows) → optional `competitive_competitor_registry` (PK `domain`).
- **Retrieve detailed competitors only when needed:** the drawer uses `campuses[].top_competitor_domains` (short list) + counts. For a full per-campus drill-down, filter `COMPETITOR_INTELLIGENCE.csv` (or optional `competitive_competitor_campus`, PK `(campus_id, domain)`) `WHERE campus_id = <id>`. **Do not eager-load competitor detail into the drawer.**

---

## 5. Code status ⚠️

| Item | Value |
|---|---|
| **Branch** | `overnight/competitive-market-intelligence` (pushed) |
| **Commit** | see the commit that adds this file (HEAD of the branch) |
| **Merged / deployed** | **No / No** |
| **Canonical output** | `competitive-intel-output/COMPETITIVE_CAMPUS_AGGREGATES.json` (frozen) |
| **DB state** | **NONE** — no table, no view, no migration |
| **Live queryability** | **None** — dashboard cannot query this yet |

### Data that exists ONLY in files (not in the live DB)
**All of it.** Every competitive field — `paid_market_status`, `intro_accounting_paid_market_status`, `competition_intensity`, `market_status`, `strongest_competitor`, `competitor_price_context`, `validated_paid_market`, `white_space`, `study_edge_present`, `brand_conquest_candidate`, `nonbrand_search_candidate`, `evidence_confidence`, the counts, and the 653-competitor registry — lives **only** in `competitive-intel-output/*.json/*.csv`. None is queryable from the application database.

### The one thing that must happen before integration
A **one-time import**:
1. Create `campus_competitive_intel` (PK `campus_id` → `campuses.id`) with the fields in §1 (flatten `strongest_competitor.*`). Optionally `competitive_competitor_registry` (PK `domain`).
2. Load rows from `COMPETITIVE_CAMPUS_AGGREGATES.json`.
3. (Optional) refresh job re-loads the JSON after any future explicit refresh — but the dataset is **frozen for V1**, so a single load is sufficient.

No migration was written and none was applied, deliberately — this pass was research/handoff only, per instruction.

---

## 6. Machine-readable summary

See `FINAL_INTEGRATION_COMPETITIVE.json` (same folder). Shape:

```json
{
  "session": "competitive",
  "tables": [],                       // none live
  "proposed_tables_not_applied": [ "campus_competitive_intel", "competitive_competitor_registry", "competitive_competitor_campus" ],
  "file_only_sources": [ "COMPETITIVE_CAMPUS_AGGREGATES.json (canonical)", "…" ],
  "campus_fields": [ 26 fields ],
  "market_validation_fields": [ "paid_market_status", "intro_accounting_paid_market_status", "validated_paid_market", "course_specific_competitors", "course_code_network_present", "study_edge_present", "ads_observed" ],
  "display_only_fields": [ "competitor_price_context", "strongest_competitor.*", "top_competitor_domains", "market_opportunity", "evidence_confidence", "searches_run" ],
  "join_contracts": [ "campus_id = campuses.id", "competitor dedup key = domain", "detail on-demand from COMPETITOR_INTELLIGENCE.csv" ],
  "integration_readiness": "PARTIAL"
}
```

---

## COMPETITIVE INTELLIGENCE READY FOR DASHBOARD INTEGRATION: **PARTIAL**

The data contract is **final, frozen, and fully specified**, and the campus key is a clean `campus_id = campuses.id` join. It is **PARTIAL** (not YES) for one reason only: the data lives **exclusively in `competitive-intel-output/` files** and must be **imported into the app DB once** (DDL + load the canonical JSON) before the dashboard can query it. After that single import, it is YES.
