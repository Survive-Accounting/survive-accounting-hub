# STRUCTURAL INTEGRATION READY
**Date:** 2026-08-25 · **Branch:** `course-intel-v1` · **Status:** cleanup + scraper-hardening pass complete (committed, NOT deployed)

This document is the consumption contract + change log for the structural campus
backfill. It follows the morning audit (`MORNING_AUDIT_STRUCTURAL_BACKFILL.md`).
No nationwide re-run was performed and no existing good data was re-fetched.

---

## 1. Canonical tables (source of truth)

| Table | Holds | Notes |
|---|---|---|
| `campuses` | Campus identity | `id`, `name`, `display_name`, `aliases`, `parent_system_id`, `campus_resolution_status`, `institution_type`/`school_type`, `greek_eligibility`, `greek_pct_*` |
| `campus_greek_chapters` | Greek presence + counts | join to `greek_orgs` for `org_type` |
| `greek_orgs` | Org identity + `org_type` | `org_type` now classified by name on new inserts (social vs professional/honor/service) |
| `campus_council_contacts` | Council outreach targets | `contact_type` now correctly tags `role_inbox` |
| `campus_lead_suggestions` | Professors + Intro-1 evidence | `rmp_target_course_counts_json`, `teaches_intro_1`, `active_roster`, `student_visible` |
| `campus_council_status` | Per-council discovery status | `contacts_found`, `role_inbox_found` |

**New supporting tables** (migration `20260825_1200_scraper_hardening.sql`, *not yet applied*):
- `growth_scoring_exclusions` — the quarantine list Growth V1 must respect.
- `scrape_cache` — SERP/Firecrawl response cache (populated as the scraper runs).
- `backfill_lock` — single-orchestrator advisory lock.

---

## 2. Fields SAFE for Growth V1

Consume these directly for scoring / triggers:

| Signal | Source | Use |
|---|---|---|
| Council presence | `campus_council_status` / count of `campus_council_contacts` | SCORE |
| Role inbox present | `campus_council_contacts.contact_type = 'role_inbox'` | ACTION TRIGGER (durable outreach target) |
| Council type coverage (IFC/Panhel/NPHC/MGC) | `campus_council_contacts.council_type` | SCORE |
| Intro-1 qualified present | derived: `rmp_target_course_counts_json.intro_1 >= 1` | ACTION TRIGGER (picker-ready — 101 campuses) |
| Course code present | `campuses.course_family_codes_json.intro_1` | SCORE / readiness gate |
| Greek chapter count | `campus_greek_chapters` **minus** exclusions **minus** non-social orgs | SCORE (see filters below) |
| Greek density % | `campuses.greek_pct_fraternity` / `greek_pct_sorority` | SCORE |
| Social Greek only | join `greek_orgs`, exclude `org_type in (professional, honor, service)` | filter for all Greek metrics |
| Campus readiness composite | code + social-greek + intro1 + council | SCORE |

**Required filters when reading Greek counts:**
1. Exclude `greek_orgs.org_type in ('professional','honor','service')` (non-social).
2. Exclude campuses present in `growth_scoring_exclusions` with `metric = 'greek_chapter_count'`.

---

## 3. Fields QUARANTINED (do NOT score)

| Field / metric | Rule | Why |
|---|---|---|
| **Raw professor count** (`count(campus_lead_suggestions)`) | **DO NOT USE as a Growth signal — global** | Over-collection at large campuses (UVA 259) inflates counts beyond accounting. Use Intro-1 qualified presence instead. |
| Professor count at 7 flagged campuses | in `growth_scoring_exclusions` metric `professor_count`, status `needs_review` | worst over-collection offenders |
| Greek chapter count at 5 flagged campuses | in `growth_scoring_exclusions` metric `greek_chapter_count`, status `needs_review` | suspected wrong-campus (CC/small-college GreekRank bleed) |
| `greek_orgs.org_type = 'unknown'` (439 rows) | treat as unclassified; don't assume social | classification gap, not contamination |

**Quarantine seed (in the migration):**
- professor_count: University of Virginia (259), UIUC (118), UT Austin (114), La Verne (103), Oral Roberts (95), Minnesota (90), UT-RGV (85).
- greek_chapter_count: Parkland College (64), Austin CC (58), Indiana University Northwest (61), Cornell College (61), Franklin & Marshall (57).

Large flagship Greek systems (UIUC 101, Rutgers 79, Purdue 61, etc.) are plausible and intentionally **not** excluded.

---

## 4. Review queue

| Priority | Item | Where | Count |
|---|---|---|---|
| **HIGH value / HIGH risk** | Professor over-collection | `growth_scoring_exclusions` (professor_count) | 7 campuses |
| **HIGH value / HIGH risk** | Suspected wrong-campus Greek | `growth_scoring_exclusions` (greek_chapter_count) | 5 campuses |
| **HIGH value / HIGH risk** | Duplicate campus records | `campuses` (UCLA/UCSB/UW-Madison comma/dash variants) | 3 |
| **HIGH value / LOW risk** | Intro-1 zero-proof but has course code | `campus_lead_suggestions` | ~222 campuses (schedule/syllabi reconciliation) |
| **HIGH value / LOW risk** | Role-inbox reclassification (historic rows) | `campus_council_contacts` | ~313 (new runs auto-fixed) |
| **LOW value** | Unclassified `org_type` | `greek_orgs` | 439 |
| **LOW value** | Shared council emails (likely legit advisor reuse) | `campus_council_contacts` | 208 |

> Historic council rows keep their old `contact_type`; the classifier fix applies to **new** discoveries. A one-time backfill of `contact_type` for existing rows is a safe, optional follow-up (not done here to honor "preserve existing data / don't re-fetch").

---

## 5. Permanent scraper changes (committed this pass)

All changes are additive / gated and preserve existing behavior when the new
tables aren't present (cache + lock **fail open**).

| # | Change | File |
|---|---|---|
| 1 | **SERP query cache** by (kind, query) — 30-day TTL | `scrape-cache.ts` + wired into `program-courses`, `council-contacts`, `greekrank-scrape`, `auto-scrape` |
| 2 | **Firecrawl cache** — 7-day TTL | `scrape-cache.ts` + wired into `council-contacts`, `greekrank-scrape` |
| 3 | **Community-college gate** — skip council + faculty stages by default | `api.backfill.tsx` + `campus-classify.isCommunityCollege` |
| 4 | **High-value override** — force full stages per-request (`forceStages`) or via `HIGH_VALUE_CAMPUS_IDS` env | `api.backfill.tsx` + `campus-classify.highValueCampusIds` |
| 5 | **Cap faculty pagination depth** 8 → 4 pages | `faculty-scrape.functions.ts` (`MAX_PAGINATION_PAGES`) |
| 6 | **Conservative faculty maxPages=3** passed from runner | `api.backfill.tsx` |
| 7 | **Accounting scoping** — verified already present (strict "accounting faculty directory" queries + `ACCOUNTING_URL_RE`, skip when no accounting page); over-collection residue handled by quarantine | `auto-scrape.functions.ts` (existing) |
| 8 | **Single-orchestrator lock** — advisory 2-min lease; 409 on contention | `api.backfill.tsx` + `backfill_lock` table |
| 9 | **GreekRank campus-identity verification** — require result title to match campus name (incl. College vs University) before writing chapters | `greekrank-scrape.functions.ts` |
| 10 | **Org-type classification** by name (professional/honor/service vs social) on new orgs | `campus-classify.classifyOrgType` + `greekrank-scrape` |
| 11 | **Role-inbox classification** — local-part patterns (ifc@, panhellenic@, greeklife@ …) tagged `role_inbox` even with an attached name | `campus-classify.classifyCouncilContact` + `council-contacts` |

**Notes / follow-ups (not done, by design):**
- Faculty single-page Firecrawl fetches are *not* cached (complex actions/batch/map payloads; left to avoid untested changes). The CC gate + pagination cap capture most of the Firecrawl saving.
- True mid-walk "stop after zero-yield page" is infeasible with the current batched actions-scrape; the depth cap + the existing identical-HTML abort approximate it.
- Existing `contact_type` / `org_type` / duplicate-campus rows are **not** mass-rewritten (preserve-data rule) — see review queue.

---

## 6. Deploy / apply checklist (when Lee is ready — NOT done here)

1. Review + merge `course-intel-v1` → main.
2. Apply migration `20260825_1200_scraper_hardening.sql` (creates cache/lock/exclusion tables + seeds the quarantine).
3. (Optional) set `HIGH_VALUE_CAMPUS_IDS` env for any CC with a real accounting program.
4. (Optional) one-time `contact_type` / `org_type` reclassify of historic rows using the new shared helpers.

---

## 7. Verdict

**STRUCTURAL DATA READY FOR GROWTH V1: PARTIAL → YES for the council + Greek + Intro-1 layers** once the quarantine migration is applied. Professor *counts* stay out of scoring (global rule + 7 flagged campuses). The scraper is materially cheaper and safer for the next refresh: community colleges gated, pagination capped, external calls cached, GreekRank identity verified, and concurrent-orchestrator corruption made impossible by the lock.
