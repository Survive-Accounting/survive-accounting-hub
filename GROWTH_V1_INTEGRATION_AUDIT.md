# GROWTH V1 — INTEGRATION AUDIT
_2026-08-25 · branch `feature/growth-campus-dashboard-v1` · worktree `sa-growth-dashboard`_

Reconciliation of the seven FINAL_INTEGRATION handoffs against **current git** and the **live DB**
(`unvxagsledbsdoremqeb`) before building the shared Growth dashboard.

---

## CURRENT MAIN

`origin/main` HEAD = **`5cac7864`** — "Merge origin/main into overnight/greek-990-sec-pilot".
Notable: several branches the handoffs describe as unmerged have since landed:

| Work | Handoff said | Reality on main |
|---|---|---|
| Greek 990 / legal entity | merged (5cac7864) | ✅ MERGED + deployed |
| Greek Academic Intelligence | merged (dedef7a8) | ✅ MERGED (headless only) |
| Growth Admin V1 (`/admin/growth` 8-tab workspace) | unmerged branch | ✅ **MERGED** (routes + `growth-admin.functions.ts` on main) |
| All 8 enrichment server functions | on various branches | ✅ **ALL on main** (`program-courses`, `auto-scrape`, `faculty-scrape`, `rmp-scrape`, `syllabus-intel`, `greekrank-scrape`, `council-contacts` .functions.ts) |
| Exam 1 Global Starter Map reset | — | ✅ on main (e8ab6961), live |

## CURRENT LIVE SCHEMA (verified by introspection 2026-08-25)

Live + populated: `campus_market_intelligence` (832) + `_card` view · `growth_contact_qc` (4,302) ·
`growth_outreach_eligibility` view (4,302) · `growth_public_contacts` (2,675) · `growth_advisors` (391) /
`growth_advisor_links` (896) · `growth_business_clubs` (62) · `growth_outreach_events` (live, **empty**) ·
`comms_suppressions` (empty) · `course_intel_campus_status` (884) · `course_document` (~3.4k) ·
`course_evidence` · `professor_intro1_evidence` (~732) · `textbooks`/`textbook_chapters`/
`textbook_chapter_topic_mapping` (114 proposed, `survive_topic_id` NULL) · `campus_greek_chapters`
(6,896 active) · `greek_chapter_academic_metrics` (2,084) · full Greek-990 graph (3,462 entities /
7,160 links / 14,499 filings / 621 officers / 4,712 status rows) · `campus_exams` (3 active, 0
professor-specific) · `campuses` (1,013).

Was **absent** live (per handoffs), now **applied by this session**: `scrape_cache`, `backfill_lock`,
`growth_scoring_exclusions` (+ 12-row quarantine seed) via `20260825_1200_scraper_hardening.sql`.

Still absent: **`campus_competitive_intel`** (competitive data is file-only) — created + imported by
this branch (see MIGRATIONS).

## HANDOFF CONTRACTS VERIFIED

- Course Intel: table set, resolution order (professor → campus → Starter), 3 active campus_exams,
  0 approved mappings, `teaches_intro_1` unpopulated — all verified.
- Structural: quarantine list content matches (7 professor-count + 5 greek-count campuses seeded);
  all single-campus runner functions exist on main.
- Market: 832 rows / card view live; duplicate-UNITID pairs confirmed (e.g. Arkansas State ×2,
  UCLA ×2) with `raw_json->>'duplicate_primary'` marking the canonical row.
- Contacts/QC: view + QC live and populated; `growth_outreach_events` empty spine confirmed;
  `reply_category` / `external_thread_id` missing as stated.
- Greek academics: 2,084 metrics rows live; merged on main.
- Greek 990: fully live + on main; nothing to merge.
- Competitive: 766-campus frozen aggregate exists only in `competitive-intel-output/` on the branch.

## HANDOFF CONTRACTS STALE / CHANGED

1. **Growth Admin V1 is merged** (contacts handoff said its base was unmerged) — contact-intel-v1
   merges cleanly on top.
2. **990 + Greek academics already on main** — no action needed (handoffs correctly noted this).
3. **First-party demand is pre-launch scale** (audited): 119 practice attempts (68 Ole Miss),
   1 identified user, 0 active entitlements, 9 orders, 88 intake submissions, 11 waitlist,
   1 chapter claim, 0 rep applications. The priority model must treat Observed Demand as a
   surfacing signal, not a rankable base (sample too small).
4. `practice_attempts.campus` is a **slug** (text), not campus_id — join via `campuses.slug`.

## BRANCHES / COMMITS BROUGHT IN (all verified additive vs main)

Merged into this feature branch, in dependency order:

| Branch | Commits | What it contributes |
|---|---|---|
| `course-intel-v1` | 1 | scraper hardening migration, `scrape-cache.ts`, `api.backfill.tsx`, hardened scraper fns |
| `overnight/course-intel-harvest` | 17 | harvest scripts, 2 already-applied migrations (source-of-truth), handoff docs |
| `overnight/campus-market-intelligence` | 8 | `src/lib/market-intel/` (scoring config v1 + types), scripts, applied migration source |
| `growth/contact-intel-v1` | 6 | `growth-intel*` code, eligibility-view migration source, `/admin/growth/intelligence` tab |
| `overnight/competitive-market-intelligence` | 5 | frozen `competitive-intel-output/` canonical JSON + scripts |

One trivial `.gitignore` merge conflict (both sides appended); resolved by keeping both.
**Not** brought in: `overnight/greek-990-sec-pilot`, `later/greek-academic-intelligence` (already on
main), `overnight/growth-admin-v1` (already on main), `overnight/referral-platform-v1` (tracked_link
generator — out of scope for V1; see gaps).

## MIGRATIONS

| Migration | State |
|---|---|
| `20260825_1200_scraper_hardening.sql` | **APPLIED by this session** (verified: 12 quarantine rows) |
| `20260824_2100` / `20260825_1200` course-intel, `20260824_2000` market, `20260824_1500` + `20260825_1200` contact QC | already applied live (verified via introspection) |
| **NEW** `20260825_1600_growth_dashboard_v1.sql` (this branch) | `campus_competitive_intel` + `growth_outreach_events.reply_category/external_thread_id/approved_*` + `growth_campus_pins` + `growth_campus_priority` + map-approval audit — applied by this session |

## DATA IMPORTS NEEDED

- `campus_competitive_intel` ← `competitive-intel-output/COMPETITIVE_CAMPUS_AGGREGATES.json`
  (766 rows, one-time; dataset frozen for V1). Done by this session (see report).

## CONFLICTS FOUND

- `.gitignore` merge conflict (resolved, both stanzas kept).
- Migration filename collision: three different sessions used `20260825_1200_*` — files are distinct
  names, no overwrite; noted for future numbering discipline.
- Duplicate campus rows (54 UNITID pairs + name variants). NOT merged in DB (destructive; out of
  scope). Dashboard suppresses non-primary duplicates via `raw_json->>'duplicate_primary'='false'`.
- `BACKFILL_TOKEN` exists only in local `.env`, **not** in the Vercel env pull → `/api/backfill`
  would 503 in prod. V1 therefore wires the ✨ Enrichment buttons to the **individual server
  functions directly** (admin-gated via `assertAdmin()`), not the orchestrator. Setting
  `BACKFILL_TOKEN` in Vercel remains optional/deferred.

## SAFE IMPLEMENTATION PLAN

1. ✅ Apply scraper-hardening migration (additive, idempotent).
2. Create + apply `20260825_1600_growth_dashboard_v1.sql` (all additive).
3. Import competitive aggregates (one-time, keyed on campus_id).
4. Priority analysis over the integrated live dataset → `GROWTH_PRIORITY_ANALYSIS.md/json`;
   deterministic versioned ranking stored in `growth_campus_priority`.
5. Build server functions (all behind `assertAdmin()`, service-role reads):
   dashboard reads, enrichment status/run, outreach queue assembly/preview/approve, topic-map
   approval (transactional), pins/overrides, results aggregates.
6. Rebuild `/admin/growth` primary surface: CAMPUSES list + campus drawer (Overview / Outreach /
   Topic Map) + nested professor & chapter drawers; existing tabs move under "More".
7. Tests (vitest) + typecheck + lint + production build.
8. No deploy, no outreach sends, no student-map writes without explicit dashboard approval action.

Guardrails honoured: no GPA/990-financial ranking, no competitor penalty, no raw-professor-count
scoring, Greek double-count corrected in the new analysis, exam countdowns only for current-term
evidence, 990 people never in first-touch queues.
