# Growth Contact Intelligence — V1 Audit

**Date:** 2026-08-24 · **Scope:** §18 test on 10 diverse campuses · **Status:** built, live-tested, not launched nationwide
**Discovery only — nothing in this system sends email, DMs, texts, or follows anyone.**

---

## 1. What was built

A **separate but connected** contact-discovery layer for the growth funnel
*Campus → Council → Individual Greek chapter → Business-club rep recruitment*.

- **Connected to Campus Backfill, not overlapping it.** Campus Backfill (the running job) already owns
  **council** contact discovery (`campus_council_contacts` / `campus_council_status`) and the
  `campuses.greek_eligibility` gate. This system **reads** those tables (never writes them) and adds the
  two surfaces Backfill does not cover: **individual Greek chapter contacts** and **business clubs**.
- **New schema** (migration `20260824_1500_growth_contact_intel.sql`, applied + verified live):
  `growth_business_clubs`, `growth_public_contacts` (polymorphic chapter/club, UNION-compatible with
  `campus_council_contacts`), `growth_contact_evidence` (multi-source provenance → safe dedupe),
  `growth_discovery_status` (per-`(campus,category)` lifecycle, `NO_RESULT` ≠ `NOT_RUN`),
  `growth_discovery_runs` (cost/progress). `growth_outreach_events` reused as the outreach spine.
- **Pipeline** (`src/lib/growth-intel-core.ts`) mirrors the Backfill council pipeline: SerpAPI →
  Firecrawl → Gemini-flash extraction, with a **verbatim hallucination guard** (every stored
  email/handle must appear on the fetched page), `site:<domain>` source-priority scoping, a
  cross-campus `.edu` guard, a chapter-IG **campus-signal** precision filter, and a **one-hop** follow that
  fetches each club's own page for president email + inbox + IG. Club categories are selectable
  (`--categories=wib`).
- **Admin UI:** `/admin/growth/intelligence` (8th tab) — per-campus status, contacts, clubs, and the
  Instagram priority queue, with a "manual human sending only" banner.
- **Runner:** `scripts/growth-intel/run.ts` — dry-run by default, hard USD budget, low concurrency
  (to not contend with Campus Backfill on shared keys), resumable checkpoint, graceful SIGINT.
- **Tests:** 29 unit tests on the extraction/classification/dedupe/precision helpers.

## 2. Test set (§18)

| Campus | Profile | Roster chapters |
|---|---|---|
| University of Alabama | large SEC | 71 |
| University of Georgia | large SEC (has domain) | 67 |
| Auburn University | large SEC | 55 |
| Vanderbilt University | private (SEC) | 39 |
| Ohio State University | large public | 45 |
| University of Texas at Austin | large public | 64 |
| Spelman College | HBCU / private / weak-Greek | 0 |
| Howard University | HBCU / private | 6 |
| Middle Tennessee State University | weak org web presence | 1 |
| Florida Atlantic University | large public | 27 |

Chapter discovery was capped at **5 chapters/campus** for the test. No public HBCU exists in the
campus table, so the HBCU dimension is carried by the two private HBCUs (Spelman, Howard).

## 3. Results (measured, post-precision-cleanup)

| Surface | Yield | Notes |
|---|---|---|
| **Council** (read from Campus Backfill) | **19 contacts** — 19 email, 10 IG | Present for 3/10 campuses (Alabama, UGA, Vanderbilt). The other 7 are `NOT_RUN` on Backfill — it is still mid-flight. |
| **Chapter contacts** | **58** — 44 IG handles, 12 emails | From ~40 chapters (5/campus cap). IG is the dominant public asset. |
| **Business clubs** | **32 orgs** — 11 Women-in-Business, 21 Investment/Finance | 12 club emails, 7 IG handles, 3 president contacts — after the one-hop enrichment (§5). |
| Discovery-status rows | 61 | `chapter:complete 41`, `WIB:complete 8 / no_result 2`, `InvFin:complete 8 / no_result 2`. |

Per-campus (council / chapter / WIB / Inv-Fin): Alabama 6/9/2/6 · UGA 5/3/3/3 · Auburn 0/6/1/4 ·
Vanderbilt 7/13/1/2 · Ohio State 1/9/1/1 · UT Austin 0/6/1/2 · Spelman 0/0/0/0 · Howard 0/5/0/2 ·
MTSU 0/1/1/2 · FAU 0/9/1/0.

`NO_RESULT` fired correctly (Spelman WIB+InvFin, Howard WIB, FAU InvFin) — a real "ran, found nothing",
distinct from "never ran".

## 4. Precision

| Category | Precision | Basis |
|---|---|---|
| **Business clubs** | **~100%** (33/33) | Every org is real, correctly categorized, correct campus, on an official business-school / university host (culverhouse, harbert, mccombs, terry, business.howard, business.fau…). Beta Alpha Psi & off-target orgs correctly excluded (§4). |
| **Chapter emails** | **~100%** (12/12) | All real `.edu` addresses, correctly classed student-officer / staff-advisor. Free-mail personal-email noise filtered out. |
| **Chapter IG — campus** | **~100%** (43/43) | After the campus-signal filter, every kept handle is the right *school*. |
| **Chapter IG — exact chapter** | **~86%** (≈37/43) | Residual: ~6 handles are the right campus but the wrong fraternity (e.g. `@auburn_sae` attached to the SigEp row). Harder intra-campus match — see §6. |
| **Council** | inherited from Campus Backfill | Role inboxes (`ifc@ua.edu`), FSL advisors, official council IG — from official FSL/council pages. |

Two contamination classes were found **and fixed** during the test:
1. **Cross-campus `.edu`** — a UGA club query returned a `georgiasouthern.edu` org. Fixed: reject any
   `.edu` host that is not the campus's own domain.
2. **Instagram SERP noise** — naive `"<school> <chapter> instagram"` returns the *national* org account
   (`@phikappatau`), sometimes another school's chapter (`@aepigsu`), and occasional garbage
   (`@popular`). Raw exact-chapter precision was ~55–60%; the campus-signal filter dropped 32/75 such
   handles and lifted campus precision to ~100%.

## 5. Coverage & the two real limitations

- **Academic / scholarship-chair contacts at the individual-chapter level: not publicly available.**
  0 were found. Individual fraternity/sorority chapters do not publish exec-board emails on findable
  public pages. **These roles are gettable at the COUNCIL level** (VP Academics / Scholarship Chair via
  FSL pages) — which is Campus Backfill's domain, and it already captures them. Recommendation: source
  academic/scholarship outreach targets from council contacts, not per-chapter.
- **Business-club depth — addressed.** A **one-hop follow** now fetches each kept club's own page for
  president email + club inbox + IG. This lifted coverage from 1 IG / 5 emails to **7 IG / 12 emails / 3
  president contacts across 32 orgs**, and — because it let us cut SERP queries 4→2 per category — it
  made clubs *cheaper*, not dearer (§6). Club inboxes are frequently gmail (e.g. `auburnwib@gmail.com`),
  which is the org's real address and is kept; only *personal* free-mail is filtered for officer/president
  rows. Remaining gap: clubs without an own-page link stay list-page-only.

## 6. Cost

Unit model (conservative): SerpAPI **$0.008**/search, Firecrawl **$0.005**/scrape, Gemini-flash
**$0.002**/extract. (SerpAPI/Firecrawl real rates depend on plan.)

| Run | Calls (serp / firecrawl / ai) | Cost | Per unit |
|---|---|---|---|
| Business clubs, 2 categories **+ one-hop, trimmed SERP** | 47 / 107 / 100 | **$1.11** | **$0.111 / campus** |
| Chapter contacts, 10 campuses × 5 | 89 / 51 / 32 | **$1.03** | **$0.103 / campus** ≈ **$0.021 / chapter** |
| Both surfaces combined | — | **≈ $2.14** | **≈ $0.214 / campus** (at 5 chapters/campus) |

Note the one-hop made clubs **cheaper**, not dearer: dropping the two weakest SERP queries per category
(4→2) cut SERP — the priciest unit — from 94 calls to 47, which more than paid for the extra page fetch.

### Cost levers — pick a config per campus (councils are free to this system — Campus Backfill owns them)

| Config | $/campus | Nationwide (~946) | Trade-off |
|---|---|---|---|
| Clubs (both) + chapters ×5 | ~$0.214 | ~$200 | fullest |
| Clubs (both) + one-hop, **no chapters** | ~$0.111 | ~$105 | Greek via councils; lose per-chapter IG |
| WIB-only + one-hop, no chapters | ~$0.06 | ~$57 | drops the higher-yield Inv/Finance half |
| **WIB + IFC/Panhel chapter execs (validated)** | **~$0.06 + $0.023/chapter** | **~$123** (WIB $52 + 3,101 chapters $71) | the preferred config; yield campus-dependent (§6a) |
| Chapters only ×5 | ~$0.103 | ~$97 | Greek IG, no clubs |

**The two levers you asked about:**
1. *"Only IFC/Panhellenic exec search"* — councils are **already Campus Backfill's job and cost this
   system $0**. The equivalent lever here is **turning off per-chapter discovery** (`--only=clubs`): Greek
   outreach then runs at the council level and the whole chapter cost disappears. That is the single
   biggest saving.
2. *"Only Women in Business"* — yes, it roughly halves club cost (**~$0.111 → ~$0.06 /campus**), because
   the two categories split evenly. But Investment/Finance was the higher-yield half (21 orgs vs 11), so
   this trades yield for cost. Selectable via `--categories=wib`.

**Recommended cheapest sensible config for rep recruitment:** clubs (both) + one-hop, chapters off →
**~$0.11/campus, ~$105 nationwide**. Add the full chapter sweep only where campus-chapter IG is worth it.

Full-roster chapter sweep (~4,260 chapters) if ever wanted: ≈ $90. Councils: Campus Backfill's cost, not
this system's. Semester refresh ≈ same order — inside the prior ProfIntel $100–300 band.

## 6a. Validation — "WIB + IFC/Panhellenic chapter execs" config (the preferred config)

Run at **full IFC/Panhellenic depth** (no chapter cap) on two large SEC campuses, `--categories=wib
--chapters=all --councils=ifc,panhel`:

| Campus | IFC/Panhel chapters | Chapters with a contact | Contacts | IG | Emails | **Student-officer emails** |
|---|---|---|---|---|---|---|
| **Alabama** | 52 | 34 (65%) | 76 | 37 | 38 | **17** |
| **UGA** | 48 | 5 (10%) | 7 | 3 | 0 | 0 |

**Cost: $0.023/chapter confirmed** (UGA re-run alone: 48 chapters = $1.07). ~**$1.2 per large-SEC campus**.

Two findings that matter for this config:

1. **Chapter-exec EMAILS *are* obtainable at scale — where the campus publishes them.** Alabama's FSL
   office lists rosters, so we got **17 student-officer emails + 21 more** across 52 chapters. This is
   *better* than the earlier 5-cap sample suggested — exec emails are not universally sparse, they are
   **campus-dependent**.
2. **Yield varies enormously for the same spend.** UGA — a big SEC school — yielded 7 contacts from 48
   chapters because it does not expose chapter contacts publicly (confirmed: adding the "uga" nickname to
   the IG filter barely moved it, so this is genuine sparsity, not a recall bug). You **pay per chapter
   regardless of yield**; rich campuses (Alabama) and thin campuses (UGA) cost the same.

**Implication:** the full IFC/Panhel sweep (~$68 nationwide) is cheap enough that paying for thin campuses
is acceptable — and the per-chapter `no_result` status means refreshes never re-pay for the empties.
A per-campus **signals** field (nicknames like bama/uga/vandy) is now supported to keep IG recall high
where handles use nicknames.

## 7. Problem source types

- `instagram.com` SERP → national-org and wrong-school accounts (fixed via campus-signal filter; residual
  intra-campus wrong-fraternity ~14%).
- Foreign `.edu` pages → cross-campus club contamination (fixed via `foreignEdu` guard).
- Student-org **list** pages → names without per-org contact (depth limit; needs a one-hop follow).
- Free-mail personal emails on national chapter sites → noise (fixed via free-mail filter).
- Individual-chapter pages → rarely expose exec emails at all (structural; use council level instead).

## 8. Recommended nationwide run strategy

1. **Business clubs first, all campuses (~$105 with the one-hop).** Rep recruitment is the near-term goal
   and precision is ~100%. The president/inbox/IG one-hop is now built and made this *cheaper*, not
   dearer. Run WIB-only (`--categories=wib`, ~$57) if budget is tighter than yield.
2. **Chapter IG for eligible campuses**, prioritized by the §15 Instagram queue (campus opportunity /
   exam timing / prior outreach). Add a **chapter-letters match** to the IG filter to lift exact-chapter
   precision from ~86% toward ~95%.
3. **Seed a per-campus signals list** (`short_name` + nicknames/mascots: bama, uga, vandy…). Auto-derived
   signals miss common abbreviations, which costs chapter-IG recall at scale.
4. **Academic/scholarship targets come from councils** (Campus Backfill), not per-chapter.
5. **Operational:** run staged + campus-batched via `scripts/growth-intel/run.ts` (budget-capped,
   resumable). Keep concurrency **low while Campus Backfill is running** — shared provider keys. Refresh
   per semester; historical contacts are preserved (`superseded_by`, `first_seen`/`last_seen`), never
   overwritten.

## 9. Deliverables

- `COUNCIL_CONTACT_SAMPLE.csv` — 19 rows (read from Campus Backfill).
- `GREEK_CHAPTER_CONTACT_SAMPLE.csv` — 58 rows.
- `BUSINESS_CLUB_SAMPLE.csv` — 32 orgs + 3 president contacts (with one-hop email/IG enrichment).
- Migration `migration/supabase-migrations/20260824_1500_growth_contact_intel.sql` (live).
- Code: `src/lib/growth-intel-{core,extract,extract.test}.ts`, `src/lib/growth-intel.functions.ts`,
  `src/routes/admin.growth.intelligence.tsx`, `scripts/growth-intel/*`, `docs/GROWTH_CONTACT_INTEL.md`.

**No outbound campaigns were launched. No messages were sent.**
