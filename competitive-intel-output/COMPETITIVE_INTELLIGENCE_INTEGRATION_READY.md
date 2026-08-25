# Competitive Intelligence — Integration-Ready (Frozen)

_Targeted completion + normalization pass. Read-only: no full re-sweep, no ads, no price changes. Public data only._

**Dataset status: 🔒 FROZEN** — `scripts/competitive-intel/data/FROZEN.json`. Discovery caches remain reusable for a future explicit refresh.

---

## What this pass did

1. **Gap-fill (targeted).** Re-ran only the rate-limited/missing queries for high-Market-Opportunity campuses — the shared-account contention was already mostly resolved, leaving just **9 high-MO campuses / 21 missing queries**. Filled them (21 live searches, 0 rate-limited; the growth SERP job was idle). No full re-sweep.
2. **Competitor de-duplication.** Collapsed 4,825 competitor×campus observations into **653 unique competitors** (`competitor_registry` in the JSON), each with campus footprint, model, offerings, strength, and display-only price context.
3. **Course-code network investigation** (see below) — confirmed a single operator.
4. **Canonical per-campus fields** — `COMPETITIVE_CAMPUS_AGGREGATES.json` → `campuses[]`.
5. **Interpretation rules baked in** (positive validation / segmentation / display-only).
6. **Faculty-ally scan** (strict) — `FACULTY_ALLY_CANDIDATES.csv`.
7. **Froze** the nationwide dataset.

---

## Finding: the course-code domain network is ONE operator

**Operator: Aaron Francis** (CPA, ex–Ernst & Young, later a software developer). Confirmed by public evidence on multiple network sites:

- **Identical footer** `© Aaron Francis 2015–2026` on **`acct2301.com` AND `acc201uky.com`**, with the same operator bio ("I designed and coded this site, recorded all these videos, and wrote all the practice problems").
- **Shared infrastructure:** video assets served from the **same Amazon S3 bucket** `s3.amazonaws.com/acct-videos/` across sites.
- **Shared template (verbatim):** *"The first video of Chapter 1: The Accounting Equation is available for free preview"* (a "Topic 1" variant on the ACC 201 sites); identical structure everywhere (pre-recorded chapter videos + practice problems + study guides; **no** live sessions or 1-on-1).

**Scale:** **21 course-code domains**, **149 campus-appearances** across the target universe — `acct2301.com` (22 campuses), `acct201a.com` (20), `acct2001.com` (14), `acc201uky.com` (14), `acg2021fiu.com` (FL/ACG 2021), `acct2300/2100/2110/200ku/229/2101uga …`.

**SEO / content model (what to learn from it):**
- **One domain per course code** (`<coursecode>.com`), each exact-matching a school's intro course number so it ranks organically for `ACCT 2301`, `ACC 201`, `ACG 2021`, etc. — near-zero paid spend, hyper-specific intent capture.
- **Freemium funnel:** first chapter/topic free, remainder paid (pricing gated behind sign-in).
- **Product:** ~13 chapters, ~90–100 videos (~16 hrs) + ~75–100 practice problems, mapped to the exact course.
- **Scales by cloning** the template per new course code — cheap to expand, thin per-site cost.

**Why it matters for Survive:** this is the closest structural analog to what Survive does (course-mapped video + practice), it's **one person** (not a funded competitor), and its **organic course-code-domain play is directly replicable** (e.g. Survive course-code landing pages). It proves paid demand for exactly Survive's product at ~150 course/campus pairs.

---

## Canonical per-campus schema (`campuses[]`)

| Field | Values | Notes |
|---|---|---|
| `paid_market_status` | STRONG / MODERATE / WEAK / UNKNOWN | Any-subject paid academic support present |
| `intro_accounting_paid_market_status` | STRONG / MODERATE / WEAK / UNKNOWN | Intro-accounting-specific |
| `competition_intensity` | NONE / LOW / MEDIUM / HIGH | # distinct competitors (0 / 1–2 / 3–5 / 6+) — **segmentation, not a penalty** |
| `strongest_competitor` | `{name, domain, type, course_specific}` | Ranked: course-specific > local > platform |
| `competitor_price_context` | string | **Display only** — partial/gated coverage |
| `validated_paid_market` | boolean | Course-specific or local/platform accounting competitor present |
| `white_space` | boolean | MO ≥ 55 and no local paid competitor detected |
| `brand_conquest_candidate` | boolean | A named non-national brand competitor exists |
| `nonbrand_search_candidate` | true / "partial" / false | true when a course code exists |
| `evidence_confidence` | high / medium / low | From searches run + course-specific presence |

Plus context counts: `paid_competitors`, `intro_accounting_competitors`, `course_specific_competitors`, `course_code_network_present`, `university_free_support`, `ads_observed`, `searches_run`, `top_competitor_domains`.

**Totals:** 766 campuses · 653 unique competitors · **509 validated paid markets** · **45 strong white-space** · 21 network domains.

---

## Interpretation rules (baked into the JSON `interpretation` block)

| Signal | Use | Rationale |
|---|---|---|
| **Paid-market evidence** | ✅ **Positive market validation** | Presence proves willingness to pay — an asset, never a penalty |
| **Competition intensity** | 🧭 **Segmentation / context** | CROWDED = validated demand; WHITE_SPACE = first-mover — different plays, not good/bad |
| **Competitor price** | 👁 **Display only** | Coverage is partial and often gated; not reliable enough to drive an algorithm yet |

Recommended Growth-V1 wiring: feed `validated_paid_market` + `intro_accounting_paid_market_status` as **positive** market-score inputs; use `competition_intensity` + `white_space` for **segmentation** (validated vs first-mover playbooks); render `competitor_price_context` + `strongest_competitor` on the campus card as **display-only** context. `course_code_network_present` is a strong "exact-product-fit" flag worth an **action trigger** (course-code landing page).

---

## Faculty-ally candidates (strict)

**Result: 0 candidates** (`FACULTY_ALLY_CANDIDATES.csv`, header only).

Criterion (deliberately strict): a captured public snippet/page must show a **professor as the subject explicitly recommending/allowing/assigning an OUTSIDE supplemental resource**. A professor merely being *named* (e.g. Study Edge lists tutor/instructor names) does **not** qualify and was excluded, as were brand tokens like "TutoringProf™". The competitor-marketing + SERP-snippet corpus does not contain genuine professor endorsements — that evidence lives in syllabi and student forums, which were out of scope for this competitor sweep. Reported as zero rather than inferred.

---

## Deliverables

- **`COMPETITIVE_CAMPUS_AGGREGATES.json`** — canonical per-campus fields + deduped `competitor_registry` + course-code-network summary + interpretation block. Frozen.
- **`FACULTY_ALLY_CANDIDATES.csv`** — strict scan (empty; criterion documented).
- **`COMPETITIVE_INTELLIGENCE_INTEGRATION_READY.md`** — this file.
- Prior deliverables unchanged in this folder (report, per-competitor CSV, Study Edge/UF brief, morning audit).

**INTEGRATION-READY FOR GROWTH V1: YES.** Dataset frozen; re-open only for an explicit refresh (`discover.mjs --force` reuses caches).

_Public search results + public marketing pages only. No accounts, paywalls, purchases, or fake identities. No ads created; no prices changed._
