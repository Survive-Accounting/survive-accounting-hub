# GROWTH PRIORITY ANALYSIS — Fall 2026 initial order
_2026-08-25 · computed over the integrated live dataset (677 ranked primary institutions) ·
model `growth_priority_v1` · machine twin: `GROWTH_PRIORITY_ANALYSIS.json`_

## 0. What the data actually says (before any formula)

Integrated universe after duplicate suppression: **675 primary institutions** (+2 rows whose
market rows lack a duplicate flag), of which:

| Signal | Coverage |
|---|--:|
| Confirmed Intro-1 course code | 289 (43%) |
| Any Intro-1 professor evidence (CONFIRMED/LIKELY) | 148 campuses |
| CONFIRMED_INTRO1 professor rows | 212 (68 campuses) |
| Exam-1 chapter-range evidence | 45 campuses |
| Textbook evidence | 103 campuses |
| Validated paid market (any subject) | 445 (66%) |
| **Course-specific paid competitor** | **284 (42%)** |
| Any Greek chapters on file | 216 campuses |
| ≥1 outreach-eligible email | 166 campuses (1,154 emails — 1,053 council, 75 chapter) |
| Instagram contacts | 3,063 handles (240 campuses) |
| **First-party demand** | **8 campuses** (119 attempts total, 1 identified user, 0 paid) |

Three structural facts dominate everything:

1. **First-party demand is pre-launch scale.** 119 practice attempts, 68 of them at Ole Miss.
   Any model that "ranks by results" today is ranking noise. Observed demand must be a
   *surfacing boost*, not a base signal — it lifts a campus the moment real usage appears
   (the "Kentucky explodes" requirement) without letting an n=3 sample reorder the country.
2. **Outreach reach is council-email-first.** 91% of eligible emails are campus-council role
   inboxes/officers; only 75 chapter-level emails exist. Chapters are reached via Instagram
   (2,300+ chapter handles) or *through* councils. The Fall-2026 play the data supports:
   council email → chapter Instagram follow-up.
3. **Generic "paid market validated" is not a differentiator** (66% of campuses — Wyzant and
   Course Hero exist everywhere). The sharp signal is a **course-specific competitor** (42%,
   e.g. ac210ua.com at Alabama): someone already built a paid business on this exact course.

## 1. Signal-class findings

**A. Market opportunity.** `business_bachelors` (IPEDS 2024) is the anchor; `estimated_intro1_annual`
is just ×2.4 of it (perfectly collinear — use one, display the other). Correlation with Greek
chapter count is only r≈0.39 — Greek reach is genuinely independent information, worth its own
component (but ONCE — see redundancy).

**B. Execution/readiness.** Splitting **research readiness** (do we know the course?) from
**product readiness** (is the map approved / content sellable?) is real: 289 campuses have a
course code but only 45 have Exam-1 range evidence and only 3 campus maps are approved
anywhere. The readiness score below covers research readiness; product readiness (approved
maps, per-exam sellability) is shown as the exam-status ladder in the drawer and will grow
into the score as approvals happen.

**C. Observed demand.** Kept additive (max +15) with weights that make one paid user ≈ 10
points of boost. At today's volumes this correctly surfaces UF / Ole Miss / Arkansas /
Alabama / Clemson without swamping the modeled order.

**D. Exploratory/context.** GPA, 990 financials, competitor counts, university free support:
all confirmed context-only. None enters the ranking (guardrails below).

## 2. Redundancies and corrections found

- **Greek double-count (inherited from market-intel v1) — corrected.** The old
  `outreach_priority_score` counted Greek in both Market Opportunity (15%) and Distribution
  (35%) ≈ 16.25% total. `growth_priority_v1` counts market size as business completions only;
  Greek lives solely in the `reach` component. The old versioned score is untouched in
  `campus_market_intelligence`.
- **`estimated_intro1_annual` is redundant** with `business_bachelors` (deterministic ×2.4).
  Display-only.
- **Raw professor count**: confirmed over-collection (UVA 259 "professors"); excluded globally,
  7 campuses quarantined. Intro-1 *evidence* counts used instead.
- **Wrong-campus Greek bleed — new find.** UH-Downtown (commuter school) carried 36 Greek
  chapters — more than UH main campus (34) — plus 12 council emails while UH main has 0.
  Quarantined (`growth_scoring_exclusions`, needs_review) by this analysis. The five previously
  known outliers (Parkland, Austin CC, IU Northwest, Cornell College, F&M) were already seeded.
- **`validated_paid_market` too broad** for chips/baskets (66% hit rate) — basket now keys on
  `course_specific_competitors > 0`.
- **Low-incremental-value datasets (for ranking):** Greek *academics* (GPA) and 990 financials
  add nothing to prioritization — by design. Their value is in the chapter drawer as account
  context (membership size from academics IS used for chapter sizing) and the 990 layer as
  escalation reserve. Business-club data (62 rows) is too sparse to rank on; display-only.

## 3. The model — `growth_priority_v1`

`score = renormalized( 0.40·market + 0.20·reach + 0.15·paid + 0.15·readiness + 0.10·growth ) + demand_boost`

| Component | Definition | Nulls |
|---|---|---|
| market | percentile of `business_bachelors` (IPEDS) | excluded+renormalized |
| reach | percentile of `3·council_emails + 2·chapter_emails + 0.2·IG(≤40) + 0.5·social_chapters(≤60, quarantine-gated)` | 0 when nothing |
| paid | 55·validated + 30·STRONG/15·MODERATE intro + 15·course-specific + 10·ads (cap 100) | null w/o competitive row |
| readiness | 25 code + 25 confirmed-prof (12 likely) + 20 exam-1 range + 15 textbook + 10 syllabi(≤3) + 5 approved map | never null |
| growth | market-intel `growth_momentum_score` v1 | excluded+renormalized |
| demand_boost | min(15, 3·identified + 10·paid + 5·claims + 2·orders + 1·waitlist + 0.05·attempts) | additive |

Deterministic (stable tiebreak: business_bachelors ↓, name, id). Versioned. Stored in
`growth_campus_priority` with per-campus `why` chips and full component transparency.
Pins/manual overrides live in `growth_campus_pins` and never touch the computed row.

**Resulting top 12 (Fall 2026 initial order):** UF · Georgia · Arkansas · UNLV · Ole Miss ·
FAU · FGCU · UH-Downtown⚠ (quarantined-data residue; review) · Kentucky · North Texas ·
Tennessee · Alabama. SEC-heavy, Florida-heavy — consistent with the founding thesis and with
where live demand already appeared.

## 4. Campus baskets (recommended UI chips: first 5 + More)

| Basket | Rule | Count |
|---|---|--:|
| **Top Markets** | market ≥ 80 | 136 |
| **Course Ready** | readiness ≥ 60 | 45 |
| **Greek Powerhouses** | reach ≥ 70 | 67 |
| **Needs Enrichment** | market ≥ 70 & readiness < 40 | 169 |
| **Live Demand** | demand_boost > 0 | 8 |
| Proven Paid (More) | course-specific competitor present | 284 |
| White Space (More) | WHITE_SPACE status & market ≥ 60 | 35 |

Rejected as baskets: "lowest GPA chapters" (guardrail), "high 990 assets" (guardrail),
"most professors" (over-collection), "most competitors" (validated≠penalty, but count is noise).

## 5. Chapter archetypes

6,890 social chapters; 2,084 with academic aggregates; 1,668 with member counts (median 53);
**550 chapters ≥100 members**, of which **162 are directly reachable** (eligible email or IG on
an eligibility row) — that's the first-semester chapter target list ("Large + Reachable").
1,455 chapters have a chapter-specific 990 legal entity (alumni infrastructure context).
Recommended working baskets: **Largest Chapters** (members ≥ 100) · **Large + Reachable** ·
**Top-Campus Chapters** (chapter's campus in top-50 priority) · **Already Showing Demand**
(claims/requests > 0 — currently 1) · **Established Alumni Infrastructure** (house corp or
foundation present — context, not priority). GPA cohorts: TESTING ONLY, never a leaderboard.

## 6. Professor cohorts

Evidence states are `CONFIRMED_INTRO1` (212 rows / 68 campuses) · `LIKELY_INTRO1` (459/112) ·
`POSSIBLE_INTRO1` (61/31). Only 20 CONFIRMED rows link to a `campus_lead_suggestions` row —
professor evidence is mostly name-text, so UI joins fall back to name matching within campus.
Useful cohorts: **Confirmed Intro-1** · **Has Syllabus/Docs** · **Has Exam Evidence** ·
**Map Ready for Approval** (campus has exam-range + textbook TOC) · **Needs Evidence**
(candidates exist, zero evidence). `teaches_intro_1` boolean is unpopulated — never trusted.

## 7. What to TEST empirically this fall

1. **Council-email-first vs chapter-IG-first** — same campus tier, compare reply→access rates.
2. **Course-specific-competitor campuses vs white space** — does "proven paid" actually convert
   better? (This decides whether `paid` deserves its 15%.)
3. **Course-code landing pages** where `course_code_network_present` (SEO conquest trigger).
4. **Does readiness gate conversion?** Compare demand at course-ready vs starter-map campuses
   once traffic exists — decides how hard to push map approvals ahead of outreach.
5. **Greek % of student body** (`greek_pct_*`, unused in v1) as a conversion moderator.
6. GPA-context messaging A/B (context line vs none) — the ONLY sanctioned GPA use.

## 8. Guardrails enforced in code

- GPA / `academic_need_score` / `difference_from_council`: not even inputs to the model.
- 990 financials: not inputs; 990 people never outreach-eligible (context/escalation only).
- Competitor presence: additive-only component; no subtraction anywhere; UNKNOWN ≠ absent.
- Raw professor directory count: not an input; quarantine list honoured for Greek counts.
- Exam timing: historical dates (239 of 285) never render as live countdowns; only term ≥ 2026
  evidence may show a date. Otherwise "Estimated · term week 5–6" labeled ESTIMATED.
- Duplicate campuses: non-primary duplicate rows excluded from ranking.
