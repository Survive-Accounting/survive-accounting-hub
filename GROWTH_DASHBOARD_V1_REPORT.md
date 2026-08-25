# SURVIVE GROWTH — V1 DASHBOARD REPORT
_2026-08-25 · branch `feature/growth-campus-dashboard-v1` · worktree `sa-growth-dashboard`_

The shared Lee/King operating surface: one ranked campus list, one drawer per campus, and the
three workflows (launch overview · outreach queue · topic-map approval) that turn the collected
intelligence into daily work. **Not deployed. No outreach sent. No student maps changed.**

---

## 1. Current architecture

- **Primary surface:** `/admin/growth` (rewritten) — SURVIVE GROWTH campus list. Search, 5 basket
  chips (+More), ranked rows, campus drawer with OVERVIEW / OUTREACH / TOPIC MAP tabs, nested
  professor + chapter drawers, ✨ Enrichment panel. `/admin/growth/results` = first-party outcomes.
  The 7 older per-source workspaces stay reachable under **More ▾** (nothing deleted).
- **Auth:** every server function calls `assertAdmin()` (Supabase admin session in an HttpOnly
  cookie) — same convention as the rest of the admin surface; pages wrapped in `AdminGate`/
  `AdminSessionGate`. Service-role reads stay server-side; no service keys in the browser.
- **Ranking:** `growth_priority_v1` — pure deterministic model in
  [growth-priority-core.ts](src/lib/growth-priority-core.ts), data assembly in
  `growth-priority-data.server.ts`, stored in `growth_campus_priority` (rank, score, why chips,
  transparent components). Refresh = admin button or `bun scripts/growth-priority/refresh.ts`.
  No LLM anywhere in the ranking path.

## 2. Data integrated (all keyed on `campuses.id` uuid; zero name joins)

Market intel (832 rows) · Competitive intel (766 rows, **newly imported into
`campus_competitive_intel`**) · Course intel (status/documents/evidence/textbooks/professor
evidence) · Structural (Greek roster 6,896, councils, council contacts, quarantines) · Contact/QC
layer (eligibility view 4,302 · QC · advisors) · Greek academics (2,084 chapter metrics) ·
Greek 990 entity graph (3,462 entities / 7,160 links / 14,499 filings / 621 officers) ·
First-party product signals (practice attempts by campus slug, entitlements, waitlist, orders,
claims, landing events, referral partners).

## 3. Branches / commits reconciled

Merged into this branch (verified additive): `course-intel-v1` (1) · `overnight/course-intel-harvest`
(17) · `overnight/campus-market-intelligence` (8) · `growth/contact-intel-v1` (6) ·
`overnight/competitive-market-intelligence` (5). Already on main (no action): greek-990, greek
academics, growth-admin-v1. Full reconciliation: [GROWTH_V1_INTEGRATION_AUDIT.md](GROWTH_V1_INTEGRATION_AUDIT.md).

## 4–5. Migrations created / applied (ALL applied live via Management API)

| Migration | Contents |
|---|---|
| `20260825_1200_scraper_hardening.sql` (from course-intel-v1) | `scrape_cache`, `backfill_lock`, `growth_scoring_exclusions` + 12-row quarantine seed — verified live |
| **`20260825_1600_growth_dashboard_v1.sql`** (new) | `campus_competitive_intel` · `growth_outreach_events` + `reply_category`/`external_thread_id`/`approved_by`/`approved_at`/`email` + indexes · `growth_campus_pins` · `growth_campus_priority` · `growth_map_approvals` · `growth_outreach_templates` (3 seed templates) |
| **`20260825_1700_growth_map_approval.sql`** (new) | `growth_approve_map` / `growth_revert_map` — transactional, validating, audited map approval |

## 6. Competitive import result

766 campuses upserted from the frozen `COMPETITIVE_CAMPUS_AGGREGATES.json`: 509 validated paid
markets, 312 with course-specific competitors, 45 white-space. One source quirk handled:
`nonbrand_search_candidate` is tri-state (`true|partial`) → stored as text.

## 7. Priority methodology

`score = renormalized(0.40·market + 0.20·reach + 0.15·paid + 0.15·readiness + 0.10·growth) + demand_boost(≤15)`
— deterministic, versioned, explainable (why chips + components stored per campus), pins/manual
override layered on top without touching the computed rank. Full analysis + corrections (Greek
double-count fixed, UH-Downtown wrong-campus bleed quarantined, `validated_paid` de-emphasized):
[GROWTH_PRIORITY_ANALYSIS.md](GROWTH_PRIORITY_ANALYSIS.md). Fall-2026 top of board: UF, Georgia,
Arkansas, UNLV, Ole Miss, FAU, FGCU, (UHD⚠), Kentucky, North Texas, Tennessee, Alabama.

## 8–10. Categories shipped

**Campus chips:** Top Markets (136) · Course Ready (45) · Greek Powerhouses (67) · Needs
Enrichment (169) · Live Demand (8) · More ▾: Proven Paid (284), White Space (35), Pinned.
**Chapters:** sorted members-desc inside the campus drawer with reach badges (email/IG/990),
claimed flag; the "Large + Reachable" cut (162 chapters ≥100 members with a reach path) falls out
of that sort. **Professors:** evidence-first ordering (CONFIRMED > LIKELY > POSSIBLE), doc counts,
map state; `teaches_intro_1` boolean never trusted; raw directory count never shown as Intro-1.

## 11. Ranking guardrails (tested)

No GPA/academic-need input (not even a field) · no 990 financials · competitor presence
additive-only · no raw professor counts · quarantine list honored · duplicate campuses suppressed ·
historical exam dates never render as countdowns (ESTIMATED window shown instead) · demand boost
capped so tiny samples surface campuses without reordering the country.

## 12. Pages / routes built

- `/admin/growth` — the V1 campus dashboard (rewritten index)
- `/admin/growth/results` — first-party outcomes + daily targets (new)
- Components: `CampusDrawer` (bolt header, tabs), `EnrichmentPanel`, `OutreachTab` (+ QueuePreview),
  `TopicMapTab`, `ProfessorDrawer`, `ChapterDrawer`
- Route registrations added to `routeTree.gen.ts` for `results` AND the previously unregistered
  `/admin/growth/intelligence` (missed by the contact-intel branch)

## 13. Outreach queue flow

Campus → entities (councils / chapters / clubs) from `growth_outreach_eligibility`, every reach
path shown and classified (HIGH CONFIDENCE / USABLE / SOCIAL / VERIFY / ADVISORY). Entity checkbox
auto-picks the default contact (role inbox → org-general → high-confidence named; VERIFY/ADVISORY
never auto-picked, blocks visible). Build queue → server assembly enforces, in order: email
present · not advisory · outreach-eligible · QC approved · not verify-held · lower(email) batch
dedupe · `comms_suppressions` · prior-contact history — every hold reported with its reason,
passes written to `growth_outreach_events` `status='queued'` with rendered subject/body + merge-var
review flags. Preview walks EVERY email (Previous / n of m / Next) with Approve / Edit (re-requires
approval) / Wrong data (writes back through `growth_contact_qc`) / Skip, then "Approve N ready" and
one explicit **Send N approved** (re-checks suppression at send, Resend, statuses updated). NO
autonomous sending anywhere. IG: handles link out; DMs manually logged (`channel='ig_dm'`);
`external_thread_id` reserved for Meta later. Reply categories (interested/question/referred/
not_interested/unsubscribe→suppresses/other). Daily targets from `site_settings.growthDailyTargets`
(default 100 email / 20 IG).

## 14. Topic-map approval flow

TOPIC MAP tab: current resolved map (STARTER or CAMPUS badge) → evidence-backed SUGGESTED map
(exam ranges from `course_evidence`, REAL chapter titles from `textbook_chapters` only, confidence,
source links, prefilled Survive topics from the matching starter exam) → Approve / Edit (checkbox
grid over the exact Intro-1 Survive Units) / Keep Starter. Approval calls `growth_approve_map`:
one transaction that validates every topic id against `chapters` (course `1111…`), archives only
that level's active rows, writes `campus_exams` + `campus_exam_topics`, upserts `map_meta`
(verified + textbook), and audits who/when/what into `growth_map_approvals`. Professor variations
listed with inherit state; per-professor approval uses the same function with `professor_id`.
Resolution order (professor → campus → starter) untouched — `resolveStudentMap` remains the law.

## 15. Enrichment flow

✨ Enrichment (drawer header): 10 derived categories (course code, Greek chapters, councils,
council contacts, professors, RMP qualify, syllabi/docs, textbook, exam ranges, exam dates) with
COMPLETE / PARTIAL / MISSING / NEEDS_REVIEW per the handoff contracts, provenance + quarantine
badges + cost notes ("Firecrawl-heavy" etc.). Run buttons wire the EXISTING targeted server
functions directly (researchProgramCourses, scrapeCampusGreek, discoverCouncilContacts,
autoDiscoverCampusUrls→scrapeCampusFaculty, enrichProfintelCampus, discoverCourseDocuments) —
admin-gated, per-campus lease in `backfill_lock` (`campus:<id>`, 10-min) blocks double-clicks,
sequential "Run missing enrichment". **No dependency on `/api/backfill` or `BACKFILL_TOKEN`**
(which is absent from the deployed env — no 503 path).

## 16. Analytics / results sources

practice_attempts (via `campuses.slug` — the campus column is a slug) · student_entitlements
(identified/paid, `source='stripe'`) · campus_waitlist · orders · greek_chapter_claims ·
landing_page_events · referral_partners (rep hired). Unknown ≠ zero: metrics with no signal render
"—"/omitted, the drawer says "No student activity observed" rather than a wall of zeros.

## 17. Known remaining gaps

1. **Student→professor demand signal doesn't exist** — professor drawer omits it (per contract).
2. **tracked_link is the campus landing URL**, not a per-recipient referral `/r/<code>` (referral
   branch unmerged); swap the generator in when that merges.
3. **Only 20/212 CONFIRMED evidence rows link to lead rows** — professor joins fall back to name
   text within campus; fine for display, worth a backfill pass.
4. Council/faculty runner spend is real money — enrichment is admin-gated + leased, but there is
   no per-day budget cap yet.
5. Exam-2 sellability is honest but blunt: starter Exam 2 has 0 topics today, so every campus
   shows Exam 2 NOT READY until the starter/campus Exam-2 maps get topics + content.
6. The competitive dataset is frozen; the refresh path is re-running the import script.
7. Pre-existing repo debt untouched: repo-wide eslint noise (CRLF/`any`), one bolt-palette
   accent-distinctness test failing on main, duplicate campus rows in `campuses` (suppressed in
   ranking, not merged in DB).

## 18. Meta / Instagram future hook

`growth_outreach_events.external_thread_id` + channel-agnostic `comms_suppressions` + the unified
per-contact timeline mean Meta Graph messaging can slot in as a send/receipt layer without schema
rework. Nothing about IG automation is faked in V1.

## 19. Tests

New: `growth-priority-core.test.ts` + `growth-outreach-core.test.ts` (26 tests: determinism,
duplicate/two-year suppression, quarantine gating, additive-only paid validation, readiness
weighting, demand-boost cap + surfacing, all queue hold rules incl. lower(email) dedupe +
suppression + prior-contact + verify-held + advisory-gated, default-contact ordering, template
conditionals, review gating). Suite: **1,633 pass / 1 pre-existing failure** (bolt-palette accent
threshold, present on origin/main). Typecheck: **clean** (regenerated `types.ts` from the live DB;
patched 5 legacy files whose code referenced schema that no longer exists live). Production build:
passes (`bun run build`).

## 20. Manual QA routes

- `/admin/growth` — list, chips, search, pin, re-rank
- `/admin/growth?open=<campusId>` — deep-link a campus drawer
  - Auburn `e330e87c…` · Georgia `3f570e37…` · Alabama `b3af67c6…` · **UF `4c5126b1-3fe0-48fe-a1db-1e41d06e4642`** ·
    Ole Miss `7b92a320…` (live demand) · a Needs-Enrichment campus via the chip
- Drawer: Overview (checklist, exams ladder, professors, orgs) → professor drawer → chapter drawer
  (Chi Omega @ Alabama for 990 officer context; any Alabama/Ole Miss chapter for academics)
- Outreach tab: select → Build queue → Preview → Approve → (Send only when you mean it)
- Topic Map tab: UF shows a suggested campus map from evidence (Exams 1–3); Approve/Edit/Keep Starter

---

### FINAL SUMMARY

| | |
|---|---|
| FEATURE BRANCH | `feature/growth-campus-dashboard-v1` (worktree `sa-growth-dashboard`) |
| FINAL COMMIT | see `git log` — three commits: audit+priority · dashboard build · report/QA |
| FILES CHANGED | ~30 new/modified app files + 2 new migrations + 3 deliverable docs + regenerated `types.ts` (full list: `git diff --stat origin/main...`) |
| MIGRATIONS | `20260825_1600_growth_dashboard_v1.sql`, `20260825_1700_growth_map_approval.sql` (+ applied the pre-written `20260825_1200_scraper_hardening.sql`) |
| DB WRITES | migrations above · competitive import (766 rows) · priority table (677 rows) · quarantine +1 (UH-Downtown) · template seed (3) — **no student-facing map writes, no outreach rows beyond schema** |
| NO-DEPLOY | Confirmed — branch not pushed to main, nothing deployed, no emails/DMs sent |
| ROUTES TO TEST | `/admin/growth`, `/admin/growth/results` (+ legacy tabs under More) |
| TRUE BLOCKERS | none for internal use. Before FIRST real send: verify `RESEND_API_KEY` in the deployed env and skim the 3 seed templates; before heavy enrichment: consider a spend cap |
