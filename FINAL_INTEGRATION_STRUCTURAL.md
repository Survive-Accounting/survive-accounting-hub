# FINAL INTEGRATION HANDOFF — Structural Campus Data
**Date:** 2026-08-25 · **Branch:** `course-intel-v1` @ `5591430d` · **Phase:** intelligence-building → Growth dashboard build

Precise engineering handoff. No re-run, no broad scrape, no deploy performed.
**Canonical join key everywhere: `campus_id` (uuid).** No name-based joins are required.

---

## 1. Canonical tables

> `course codes`, `IFC`, `Panhellenic`, `NPHC`, `MGC`, and `Intro-1 qualification` are **not** their own tables — see the notes.

### `campuses` — campus identity + course codes
- **PK** `id` (uuid) · **grain** 1/campus · **join** `id`
- **FK** `parent_system_id → campus_systems.id`
- **Course code** lives here: `course_family_codes_json ->> 'intro_1'`
- **Safe UI:** `name`, `display_name`, `aliases`, `state`, `parent_system_id`, `campus_resolution_status`, `institution_type`/`school_type`, `greek_eligibility`, `greek_pct_fraternity`, `greek_pct_sorority`, `course_family_codes_json.intro_1`
- **Quarantined:** derived raw professor count (do-not-score)

### `campus_systems` — searchable system grouping
- PK `id` · 1/system · join `campuses.parent_system_id → id` · **searchable, not selectable**

### `campus_greek_chapters` — Greek presence + counts
- **PK** `id` · **grain** 1 per (campus × org) · **join** `campus_id`
- **FKs** `campus_id → campuses.id`, `greek_org_id → greek_orgs.id`
- **Safe UI:** `chapter_designation`, `council`, `website_url`, `instagram_url`, `facebook_url`, `phone`, `discovery_source`, `confidence`, `status`, `enrichment_status`
- **Quarantined:** count for the 5 wrong-campus campuses (see §6)
- ⚠️ `council` = **campus** council (`ifc|panhellenic|nphc|mgc`). **No chapter email column.**

### `greek_orgs` — national org identity
- **PK** `id` · 1/national org · **join** via `campus_greek_chapters.greek_org_id`
- **Safe UI:** `name`, `nickname`, `letters`, `org_type`, `council`, `national_website`, `domain`
- ⚠️ `council` here = **national conference** (NIC/NPC) — **NOT** the campus council. `org_type` name-classified on **new** inserts; 439 legacy `unknown`.

### `campus_council_contacts` — IFC / Panhellenic / NPHC / MGC contacts
- **PK** `id` · **grain** 1 per (campus × council_type × email) · **join** `campus_id`
- **Safe UI:** `council_type`, `contact_type` (`role_inbox|staff_advisor|student_officer|unknown`), `name`, `role`, `email`, `instagram_url`, `source_type`, `source_url`, `confidence`, `is_current`
- ⚠️ `council_type` is a **TEXT enum**, not an FK. **Campus-level, not chapter-level.**

### `campus_council_status` — per-council status (drives the Enrichment panel)
- **PK** `id` · **grain** 1 per (campus × council_type) · **join** `campus_id`
- **Fields:** `council_type`, `status` (`complete|no_result`), `contacts_found`, `role_inbox_found`, `last_attempted_at`, `last_success_at`, `error`

### `campus_lead_suggestions` — **professors** (legacy table name)
- **PK** `id` · **grain** 1 per (campus × professor) · **join** `campus_id` (filter `archived_at is null`)
- **FKs** `campus_id → campuses.id`, `chapter_id → campus_greek_chapters.id` *(UNPOPULATED)*, `moved_to_campus_id → campuses.id`
- **Safe UI:** `first_name`, `last_name`, `title`, `department`, `email`, `is_cpa`, `is_phd`, `rmp_rating`, `rmp_num_ratings`, `rmp_profile_url`, `active_roster`, `student_visible`, `teaches_intro_1`, `rmp_target_course_counts_json`, `rmp_recent_target_match`, `rmp_target_confidence`
- **Quarantined:** `COUNT(*)` as scoring input (global) + 7 over-collection campuses (§6)

### Councils & Intro-1 qualification — derived, not tables
- **IFC/Panhellenic/NPHC/MGC** = `council_type` in `campus_council_contacts`/`campus_council_status` and `council` in `campus_greek_chapters`.
- **Intro-1 qualification** = derived: `(rmp_target_course_counts_json->>'intro_1')::int >= 1`. No dedicated table.

### New tables (migration `20260825_1200`, **NOT applied**)
`growth_scoring_exclusions` (quarantine list), `scrape_cache`, `backfill_lock`.

---

## 2. Campus drawer — fields & joins

| Drawer field | Expression |
|---|---|
| Campus name | `campuses.display_name` (fallback `name`) |
| State | `campuses.state` |
| Course code | `campuses.course_family_codes_json ->> 'intro_1'` |
| Greek chapter count | `count(campus_greek_chapters WHERE campus_id=? AND archived_at IS NULL)` — **exclude** `greek_orgs.org_type IN (professional,honor,service)` and campuses in `growth_scoring_exclusions(greek_chapter_count)` |
| IFC present | `EXISTS(chapters WHERE council='ifc')` OR `campus_council_status(ifc).status='complete'` |
| Panhellenic / NPHC / MGC present | same pattern with `panhellenic` / `nphc` / `mgc` |
| Council contact counts | `count(campus_council_contacts WHERE campus_id=? GROUP BY council_type)` |
| Professor count | `count(campus_lead_suggestions WHERE campus_id=? AND archived_at IS NULL)` — **display only** |
| Intro-1 professor count | `count(... AND (rmp_target_course_counts_json->>'intro_1')::int >= 1)` — **safe to score** |

**Professor count rule.** Raw professor count is **display-only** — never a scoring input (over-collection includes non-accounting faculty). Show it labeled *"directory-scraped; may include non-accounting faculty,"* and attach a warning badge when the campus is in `growth_scoring_exclusions(professor_count)`. **The score-safe number is the Intro-1 qualified count** (`intro_1 ≥ 1`), which is what feeds the student picker.

---

## 3. Greek organization list (nested chapter table)

| Wanted | Path |
|---|---|
| chapter id | `campus_greek_chapters.id` |
| greek org id | `campus_greek_chapters.greek_org_id` |
| name | `greek_orgs.name` (join on `greek_org_id`) |
| nickname / short name | `greek_orgs.nickname` |
| Greek letters | `greek_orgs.letters` — **often NULL** (augment later) |
| council | `campus_greek_chapters.council` (campus council) |
| chapter designation | `campus_greek_chapters.chapter_designation` |
| campus | `campus_greek_chapters.campus_id → campuses.display_name` |
| website | `campus_greek_chapters.website_url` (often null) |
| Instagram | `campus_greek_chapters.instagram_url` (often null) |
| **general email** | **NOT AVAILABLE** — no chapter email column; council contacts are campus-level. Weak point / augment later. |
| org type | `greek_orgs.org_type` |
| source | `campus_greek_chapters.discovery_source` (+ `notes`) |
| confidence | `campus_greek_chapters.confidence` (text) |

```sql
SELECT c.id AS chapter_id, c.greek_org_id, o.name, o.nickname, o.letters,
       c.council, c.chapter_designation, c.website_url, c.instagram_url,
       o.org_type, c.discovery_source, c.confidence
FROM campus_greek_chapters c
JOIN greek_orgs o ON o.id = c.greek_org_id
WHERE c.campus_id = :campusId AND c.archived_at IS NULL
ORDER BY c.council, o.name;
```

---

## 4. Professor list (Campus → Professors → details)

**Available today** (structural, this session): `first_name`, `last_name`, `title`, `department`, `email`, `is_cpa`, `is_phd`, `rmp_rating`, `rmp_num_ratings`, `rmp_difficulty`, `rmp_would_take_again`, `rmp_profile_url`, `active_roster`, `student_visible`, `teaches_intro_1`, `rmp_target_course_counts_json`, `rmp_recent_target_match`, `rmp_target_confidence`, `hasselback_match`, `source`.

**Course Intel should augment (not this session):**
- Official **schedule-of-classes** instructor-of-record for the Intro-1 code → the primary CONFIRMED proof (fixes the RMP false-negative gap).
- **Syllabus** authorship.
- **`chapter_id`** professor→chapter link (column exists, unpopulated).
- `teaching_evidence_url` / `teaching_evidence_notes`, section/term data, mobility (`moved_to_campus_id`).

```sql
SELECT first_name,last_name,title,department,email,is_cpa,is_phd,
       rmp_rating,rmp_num_ratings,rmp_profile_url,active_roster,student_visible,
       teaches_intro_1,(rmp_target_course_counts_json->>'intro_1')::int AS intro1_hits
FROM campus_lead_suggestions
WHERE campus_id = :campusId AND archived_at IS NULL
ORDER BY (rmp_target_course_counts_json->>'intro_1')::int DESC NULLS LAST, rmp_num_ratings DESC;
```

---

## 5. ✨ Enrichment panel — status + single-campus runners

### Status rules (derived from real fields)

| Category | COMPLETE | PARTIAL | MISSING | NEEDS REVIEW |
|---|---|---|---|---|
| Course code | `intro_1` present | — | `intro_1` absent | `course_codes_reviewed=false` (sparse) |
| Greek chapters | >0 active social | chapters all unknown/non-social | 0 chapters | in exclusions(greek) |
| Councils (IFC/Panhel/NPHC/MGC) | all applicable `status='complete'` | some complete, some not | no rows / all `no_result` | `complete` but `contacts_found=0` |
| Council contacts | `contacts_found>0 & role_inbox_found` | contacts but no role inbox | 0 contacts | email shared >3 campuses |
| Professors | active>0 **and** intro1>0 | active>0, intro1=0 (proof gap) | 0 active | in exclusions(professor) |

### Single-campus runners (all exist today; **do not run**)

| Category | Function / endpoint | ID | Providers | Cost | Admin-UI safe? | Locking / idempotency |
|---|---|---|---|---|---|---|
| Course code | `researchProgramCourses({data:{campusId,force:true}})` | campusId | SerpAPI + Firecrawl + AI | ~3-5 SERP, 1-3 FC, 1 AI | **yes** (fn unguarded; gate the UI) | idempotent overwrite of `course_family_codes_json` |
| Greek chapters | `scrapeCampusGreek({data:{campusId}})` | campusId | SerpAPI + Firecrawl + AI | ~2-3 SERP, 2 FC, 1 AI | **yes** | idempotent; dedups by `greek_org_id`; now verifies campus identity first |
| Council contacts | `discoverCouncilContacts({data:{campusId}})` | campusId | SerpAPI + Firecrawl + AI | **high SERP (~10-20, dominant)**, ≤5 FC, ≤5 AI | **yes** | upsert on `(campus_id,council_type,email)`; never invents emails |
| Professors (discover) | `autoDiscoverCampusUrls({data:{campusId}})` → `scrapeCampusFaculty({data:{campusId,urls,allowNoContact:true,maxPages:3}})` | campusId (+ urls) | SerpAPI + **Firecrawl (heavy)** + AI | ~2-4 SERP, **many FC**, AI | **yes**; accounting-scoped | idempotent; pagination cap 4 |
| Intro-1 qualify | `enrichProfintelCampus({data:{campusId,limit:150}})` | campusId | **RMP GraphQL (FREE)** | free | **yes** — cheapest, run liberally | idempotent RMP field updates |
| All-in-one | `POST /api/backfill` body `{campusId,stages?,lockOwner?,forceStages?}`, header `Bearer $BACKFILL_TOKEN` | campusId | all above | sum of stages | **only with `BACKFILL_TOKEN`** (local .env today; 503 in prod until set) | single-orchestrator lock via `lockOwner`; CC gate; per-stage idempotent |

**Recommended UI pattern:** call the individual server fns from an **admin-gated** route (they carry no guard themselves; the cockpit `AdminGate` is the gate). Use `enrichProfintelCampus` freely (free). Treat council + faculty as the expensive calls. Concurrent same-campus triggers are safe (idempotent upserts) but wasteful — debounce per campus in the UI.

---

## 6. Quarantines

| Item | Scope | Rule | Still displayable? |
|---|---|---|---|
| **Raw professor count** | GLOBAL | do-not-score | **Yes, with warning label** ("directory-scraped") |
| Professor over-collection | 7 campuses (UVA 259, UIUC 118, UT Austin 114, La Verne 103, Oral Roberts 95, Minnesota 90, UT-RGV 85) | `growth_scoring_exclusions(professor_count, needs_review)` | Yes, with warning badge |
| Greek-count outliers | 5 campuses (Parkland 64, Austin CC 58, Indiana NW 61, Cornell College 61, F&M 57) | `growth_scoring_exclusions(greek_chapter_count, needs_review)` | Yes, with warning badge |
| Community-college gate | runtime | council/faculty skipped by default; override via `forceStages` / `HIGH_VALUE_CAMPUS_IDS` | n/a (prevents future spend) |
| `greek_orgs.org_type='unknown'` | 439 rows | don't count as confident social | Yes |
| Shared council emails | 208 | verify before treating as distinct | Yes, with warning |

Large flagship Greek systems (UIUC 101, Rutgers 79, Purdue 61…) are plausible and **not** excluded. **All quarantined records may be displayed with warnings — they are excluded from scoring, not hidden.**

---

## 7. Cache / lock requirements

| Component | Table | Behavior |
|---|---|---|
| Scrape cache | `scrape_cache` | SERP 30-day, Firecrawl 7-day TTL, keyed by hash(kind,query/url). **Fails open** — scrapers work without it. |
| Orchestrator lock | `backfill_lock` | 2-min renewable `global` lease; `/api/backfill` returns **409** on contention when `lockOwner` passed. Fails open. |
| High-value override | env `HIGH_VALUE_CAMPUS_IDS` + per-request `forceStages:true` | forces full stages for a gated CC |
| Community-college gating | code (`isCommunityCollege`) | skips council + faculty by default |
| Pagination caps | code (`MAX_PAGINATION_PAGES=4`, runner `maxPages=3`) | bounds faculty Firecrawl spend |

**Migration prerequisite for the Enrichment button:** apply `20260825_1200_scraper_hardening.sql` to activate cache + lock + the quarantine list. The button *works* without it (cache/lock fail open), but: (a) no caching/locking benefit, and (b) the dashboard cannot read `growth_scoring_exclusions`. **Do not let scoring consume raw professor counts regardless of migration state.**

---

## 8. Join contract

```
campuses.id
  └─(campus_id)→ campus_greek_chapters              [strong uuid FK]
        └─(greek_org_id)→ greek_orgs                [strong uuid FK]
  └─(campus_id)→ campus_council_status  (filter council_type)   [strong on campus_id]
  └─(campus_id)→ campus_council_contacts(filter council_type)   [strong on campus_id; CAMPUS-level]
  └─(campus_id)→ campus_lead_suggestions (archived_at IS NULL)  [strong uuid FK]
```

**Weak / flagged joins:**
- `council_type` / `council` are **TEXT enums** (`ifc|panhellenic|nphc|mgc|other`), not FKs — there is **no councils table**.
- **`professor → chapter`** (`campus_lead_suggestions.chapter_id`) is **UNPOPULATED** — no professor-to-chapter link today.
- `greek_orgs.council` (national NIC/NPC) **≠** `campus_greek_chapters.council` (campus IFC/Panhel) — never join these.
- **No chapter-level email**; council contacts are campus-level.
- **3 duplicate campus records** (UCLA / UCSB / UW-Madison comma/dash variants) can double-join — dedupe first.

All primary joins use uuid keys; **no name-based joins required.**

---

## 9. Code / migration status

| | |
|---|---|
| Branch | `course-intel-v1` |
| HEAD | `5591430d` (Scraper hardening + data quarantine) |
| Main | `515d1e53` (campus systems — already merged) |
| Ahead of main | **1 commit** (`5591430d`: hardening + `api.backfill` runner + audit/handoff docs) |
| Pushed | **No** (local only) |
| **Migrations applied** | `20260824_1200_council_contacts`, `_1400_greek_density`, `_1500_council_email_index_fix`, `_1700_campus_systems` |
| **Migrations NOT applied** | **`20260825_1200_scraper_hardening`** (scrape_cache, backfill_lock, growth_scoring_exclusions + quarantine seed) |
| Needs merge | `course-intel-v1 → main` (1 commit) when ready |
| Manual config | `BACKFILL_TOKEN` in Vercel (local `.env` only today → `/api/backfill` = 503 in prod); optional `HIGH_VALUE_CAMPUS_IDS` |

---

## STRUCTURAL DATA READY FOR DASHBOARD INTEGRATION: **PARTIAL**

**Ready now (on live tables):** the **council, Greek, and Intro-1 layers** — campus drawer, Greek org list, council presence/contacts, and Intro-1 qualified counts all read directly from applied tables.

**Blocking full-green:**
1. Apply migration `20260825_1200` so the dashboard can read `growth_scoring_exclusions` and the Enrichment button gets cache/lock.
2. Keep **raw professor count out of scoring** (global rule) — score on Intro-1 qualified instead.
3. Optional but recommended before heavy use: set `BACKFILL_TOKEN` (if the Enrichment button uses `/api/backfill`), and one-time reclassify of legacy `contact_type` / `org_type` rows.
