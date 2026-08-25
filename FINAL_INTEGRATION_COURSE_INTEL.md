# Final Integration Handoff — Course Intelligence

_Read-only integration audit · 2026-08-25 · branch `overnight/course-intel-harvest` @ `bf96f57f`.
No new research, no deploy, no student-map changes. This is the contract the Growth / Course
Readiness dashboard should build against._

**Canonical campus key: `campuses.id` (uuid).** Every Course Intel table joins via `campus_id →
campuses.id`. **Never** join on campus name — names are non-unique and messy.

---

## 1. Current state (final counts)

| Metric | Count |
|---|--:|
| Campuses in universe / researched | 884 / 884 |
| Campuses with confirmed Intro-1 course code | **338** |
| Campuses with Intro-1 professor evidence | **154** |
| CONFIRMED professors (rows / campuses) | **212 / 68** |
| LIKELY professors | 459 |
| POSSIBLE professors | 61 |
| Campuses with any course document | 449 |
| Campuses with a parsed syllabus | 234 |
| Campuses with textbook evidence | **103** |
| Textbooks with a confirmed edition | 159 |
| Campuses with exam-range evidence | **68** |
| — Exam 1 / Exam 2 / Exam 3 / Final / Midterm | 48 / 44 / 35 / 37 / 20 |
| Exam-date rows (total) | 285 |
| — current-term (2026+) / historical / unknown | **25 / 239 / 21** |
| Campuses with a rolled-up Exam-1 date | 28 |
| Proposed topic mappings | **114** |
| **Approved / student-facing topic mappings** | **0** |
| Student-facing `campus_exams` (total / active / professor-specific) | 9 / 3 / **0** |
| Total documents | 3,389 |

**All-exams nationwide pattern (supported by the data):** **Exam 1 = Ch 1–4** (96/91/87/65% of 48
campuses) → **Exam 2 = Ch 5–8** → **Exam 3 = Ch 9–12** → **Final = cumulative Ch 1–13**; midterm
courses front-load Ch 1–6. Confidence: STRONG for Exam 1 / 2 / Midterm / Final, MODERATE for Exam 3.

---

## 2. Exact canonical tables/views the dashboard reads

> There are **no views** — read the tables directly. Course Intel is the **source of truth** for the
> intel tables; the map tables (`campus_exams`…) are the *student-facing* layer Course Intel proposes
> *into*, never writes directly.

| Table | Purpose | PK | Campus join | Professor join | Course join | Key FKs | Row grain | SoT |
|---|---|---|---|---|---|---|---|---|
| `course_intel_campus_status` | per-campus intel aggregate + research status (the dashboard's campus row) | `campus_id` | `campus_id→campuses.id` | — | `course_code` text | — | 1/campus | **YES** |
| `course_document` | discovered public docs | `id` | `campus_id` | `professor_name` text (nullable) | `course_code` text | `textbook_id→textbooks.id` | 1/(campus,source_url) | **YES** |
| `course_evidence` | extracted evidence | `id` | `campus_id` | `professor_name` text | — | `course_document_id→course_document.id`, `superseded_by` | 1/(doc,evidence_type,exam_label) | **YES** |
| `professor_intro1_evidence` | doc-derived Intro-1 prof evidence | `id` | `campus_id` | `lead_suggestion_id→campus_lead_suggestions.id` (nullable) | `course_code` | `source_document_id→course_document.id` | 1/(campus,prof,state,url) | **YES** |
| `textbooks` | edition identity | `id` | — | — | — | unique `edition_key` | 1/edition | **YES** |
| `textbook_chapters` | TOC (number+title) | `id` | — | — | — | `textbook_id→textbooks.id` | 1/(textbook,chapter) | **YES** |
| `textbook_chapter_topic_mapping` | **PROPOSED** chapter→topic | `id` | — | — | — | `textbook_id`, `textbook_chapter_id`, `survive_topic_id→chapters.id` (nullable) | 1/(chapter,topic_label) | proposed only |
| `campus_lead_suggestions` | professor entity | `id` | `campus_id` | self | — | — | 1/professor | **YES** |
| `campus_exams` *(student-facing, do not write)* | live per-campus/prof exam def | `id` | `campus_id` | `professor_id` (nullable) | `course_id` | — | 1/exam | live map |
| `campus_exam_topics` *(student-facing)* | exam→Survive Unit | `(campus_exam_id,chapter_id)` | via campus_exams | — | — | `campus_exam_id`, `chapter_id→chapters.id` | 1/(exam,unit) | live map |
| `map_meta` *(student-facing)* | map identity + verify status | `id` | `campus_id` | `professor_id` | `course_id` | `textbook_id` | 1/map | live map |
| `chapters` *(Survive Units)* | canonical topics (Starter Map spine) | `id` | — | — | `course_id`=`2222…2222` | — | 1/unit | live |

---

## 3. Campus drawer data contract

| field_name | source_table | source_column | join_path | meaning | confidence semantics | safe_for_UI | nullable |
|---|---|---|---|---|---|---|---|
| campus | `campuses` | `name`/`display_name` | `status.campus_id→campuses.id` | campus name | — | yes | no |
| course_code | `course_intel_campus_status` | `course_code` | — | Intro-1 code (e.g. ACC 201) | — | yes | yes |
| course_title | `campuses` | `course_family_titles_json->>intro_1` | campus_id | Intro-1 title | — | yes | yes |
| course_family | (constant) | `'intro_1'` | — | fixed | — | yes | no |
| course_confirmed | `course_intel_campus_status` | `course_code IS NOT NULL` | — | do we know the course | — | yes | no |
| professor_evidence | `course_intel_campus_status` | `confirmed_intro1_professors`, `professor_candidates` | — | prof coverage | count; confirmed = doc-confirmed | yes | no |
| textbook | `course_intel_campus_status` | `textbook_docs_found` | — | textbook found | — | yes | no |
| syllabus_docs | `course_intel_campus_status` | `documents_found`, `syllabi_found`, `study_guides_found` | — | doc counts | — | yes | no |
| exam_range_evidence | `course_intel_campus_status` | `high_value_documents` + `course_evidence` count | campus_id | do we know exam chapters | — | yes | no |
| exam_1_date | `course_intel_campus_status` | `exam_1_date`, `exam_1_date_confidence`, `exam_1_date_term` | — | best Exam-1 date | HIGH/MEDIUM/LOW; **check term is current before showing a countdown** | **date yes; countdown NO unless term≥2026** | yes |
| highest_confidence | `course_intel_campus_status` | `highest_source_confidence` | — | best evidence confidence | High/Medium/Low | yes | yes |
| intel_status | `course_intel_campus_status` | `status` | — | COMPLETE/NEEDS_REVIEW/NO_RESULT/WAITING_*/FAILED | — | yes | no |
| map_status | `campus_exams`/`map_meta` | see §5 | campus_id | Starter/proposed/campus/verified | — | yes | — |
| recommended_next_action | `course_intel_campus_status` | `recommended_next_action` | — | admin hint | — | yes (admin) | yes |

---

## 4. Professor data contract

**Professor entity = `campus_lead_suggestions`** (there is no `professors` table).

**Campus drawer → PROFESSORS section:**

| Column | How to get it |
|---|---|
| Professor name | `campus_lead_suggestions.first_name + last_name` (or `professor_intro1_evidence.professor_name`) |
| Intro-1 confidence | `professor_intro1_evidence.evidence_state` for this campus+prof: CONFIRMED > LIKELY > POSSIBLE > (ACCOUNTING_PROFESSOR = in lead table, dept accounting, no intro evidence) |
| Students | **NOT AVAILABLE YET** — no student→professor selection table exists; leave blank / COMING_SOON |
| Documents | `professor_intro1_evidence.source_document_id` → `course_document` (docs naming this professor) |
| Map status | see resolution below (currently: all = Starter) |

**Professor drawer / detail — retrieval:**

| Field | Source |
|---|---|
| professor id | `campus_lead_suggestions.id` |
| name | `campus_lead_suggestions.first_name/last_name` |
| title | `campus_lead_suggestions.title` |
| email (if stored) | `campus_lead_suggestions.email` |
| department | `campus_lead_suggestions.department` |
| Intro-1 teaching status | `professor_intro1_evidence.evidence_state` (documents, RMP-independent); secondary `campus_lead_suggestions.rmp_target_course_counts_json->>intro_1` (RMP, unreliable). **`teaches_intro_1` boolean is UNPOPULATED — do not use.** |
| teaching confidence | `professor_intro1_evidence.confidence` (High/Medium/Low) + `source_quality` (HIGH/MEDIUM/LOW) |
| teaching evidence | `professor_intro1_evidence` rows (state, source_url, source_document_id, term, year) |
| courses taught | `campus_lead_suggestions.courses_found`; else `course_document.course_code` for their docs |
| current/recent term | `professor_intro1_evidence.term`/`year` (⚠ mostly historical) |
| campus | `campus_lead_suggestions.campus_id → campuses.id` |
| syllabi/docs for professor | `course_document WHERE professor_name = prof` (or via `professor_intro1_evidence.source_document_id`) |
| textbook evidence for professor | `course_evidence WHERE professor_name = prof AND evidence_type='textbook_reference'` |
| exam evidence for professor | `course_evidence WHERE professor_name = prof AND evidence_type='exam_chapter_range'` |
| proposed map | see §5 — none professor-specific yet |
| approved map | `campus_exams WHERE professor_id = prof.id AND status='active'` (currently 0) |
| inherited campus map | `campus_exams WHERE campus_id = X AND professor_id IS NULL AND status='active'` |
| inherited Starter Map | `chapters WHERE course_id='2222…2222'` (the Global Starter Map) |

**What map a professor currently receives (resolution order — mirrors migration 0113):**
1. **Professor-specific** map: `campus_exams` row with matching `professor_id`, `status='active'` (→ its `campus_exam_topics`). *(0 exist today.)*
2. else **Campus** map: `campus_exams` with `professor_id IS NULL`, `status='active'`. *(3 exist.)*
3. else **Global Starter Map**: `chapters` for course `2222…2222`. **Today ≈ every professor gets the Starter Map.**

---

## 5. Topic-map workflow contract

**UX supported today (data-wise):**

- **Starter Map identity:** `chapters` rows for `course_id='22222222-2222-2222-2222-222222222222'` (Survive Units) + set/problem-type names in `canvas_scenes.nodes_json`. This is the always-available fallback.
- **Campus map identity:** a `campus_exams` row (`campus_id` set, `professor_id NULL`, `status='active'`) with `campus_exam_topics` (exam→`chapters` Units). `map_meta` carries `status` (`edited|verified`).
- **Professor map identity:** same, but `campus_exams.professor_id` set. **None exist yet.**
- **Resolution order:** professor map → campus map → Starter Map (see §4).
- **Proposed evidence storage:** `course_evidence` (exam_chapter_range per campus/professor) + `textbook_chapter_topic_mapping` (chapter→topic, `state='proposed'`). These are **proposals**, not maps.
- **Approval status:** `textbook_chapter_topic_mapping.state` (`proposed|approved|rejected|superseded`); `map_meta.status` (`edited|verified`); `campus_exams.status` (`active|archived`).
- **Source documents:** every evidence/proposal row traces to `course_document` (`source_url`, `source_domain`, `content_hash`, `first_seen`).
- **Textbook evidence:** `course_evidence` (`textbook_reference`) + `course_document.textbook_id` → `textbooks`.

**"Campus → Topic Map tab" model:**
- If a campus has **no** `exam_chapter_range` evidence and no `campus_exams` → show **GLOBAL STARTER MAP**.
- If it has evidence → show **SUGGESTED CAMPUS MAP** built from its `course_evidence` exam ranges (resolved through the textbook's `textbook_chapter_topic_mapping`), with [Approve] [Edit] [Keep Starter].
- **PROFESSOR VARIATIONS:** list each professor from `professor_intro1_evidence`/`campus_lead_suggestions` with their state: `campus map` (inherits), `proposed` (has evidence, unapproved), `verified` (`campus_exams.professor_id` active), `starter` (no evidence).

**How an edited map safely becomes approved (recommended, not built):** admin edits the suggested map → write/update `campus_exams` (+`campus_exam_topics`) for that campus (and optionally professor), set `map_meta.status='verified'` with provenance in `map_verification_files` (→ `inbound_files`/`course_document`), and flip the contributing `textbook_chapter_topic_mapping.state='approved'`. This is the ONLY path that touches student-facing content — it must be a deliberate human action.

**What DOES NOT exist yet (build for the dashboard):**
- An approval UI / server action that promotes a proposal into `campus_exams`/`campus_exam_topics`.
- `survive_topic_id` is NULL on all 114 proposed mappings — needs a human step to attach the exact Survive Unit.
- A student→professor **selection/demand** table (the "Students" column) — does not exist.
- A materialized "current map per professor" view (today it's computed by the resolution order).

---

## 6. Textbook chapter presentation

- **Textbook tables:** `textbooks` (`id, title, authors, edition, isbn13, edition_key, edition_confirmed, publisher, toc_source_url`).
- **TOC:** `textbook_chapters` (`textbook_id, number, title, chapter_key, position`). **Authoritative** where present (now 4 top editions seeded + 3 prior = ~7 editions with TOC).
- **Textbook → campus:** `course_document.textbook_id` (356 docs) and `course_evidence` (`textbook_reference`, 103 campuses). Also legacy `campuses.course_family_textbooks_json`.
- **Textbook → professor:** via the shared document — `course_evidence.professor_name` + `course_document.textbook_id` on the same syllabus.
- **Chapter → Survive topic:** `textbook_chapter_topic_mapping` — **PROPOSED** (114 rows, `survive_topic_id` NULL). The `survive_topic_label` is human-readable; the exact Survive Unit is attached on approval.
- **Authoritative vs proposed:** `textbooks` + `textbook_chapters` (titles/editions) are **authoritative**. Chapter→topic mappings are **proposed** until `state='approved'`. Render real chapter titles from `textbook_chapters`; render topic mappings only as *suggestions* until approved.

---

## 7. Enrichment checklist support

**Per-campus state calculation (all from `course_intel_campus_status` unless noted):**

| Item | COMPLETE | PARTIAL | MISSING | NEEDS REVIEW |
|---|---|---|---|---|
| Course code | `course_code IS NOT NULL` | — | code null | — |
| Professors | `confirmed_intro1_professors > 0` | `professor_candidates > 0` but 0 confirmed | `professor_candidates = 0` | conflicting `professor_intro1_evidence` states |
| Syllabi / docs | `syllabi_found > 0` | `documents_found > 0`, `syllabi_found = 0` | `documents_found = 0` | classifier-noise suspected |
| Textbook | `textbook_docs_found > 0` AND a `textbooks.edition_confirmed` | `textbook_docs_found > 0`, edition unconfirmed | none | noise title (Dummies/Intermediate) |
| Exam ranges | `course_evidence` exam_chapter_range for Exam 1 **and** highest_source_confidence='High' | some exam ranges but not High / not Exam 1 | none | range span > 6 chapters (mis-parse) |
| Exam dates | `exam_1_date` with term ≥ 2026 | `exam_1_date` historical | none | LOW confidence |

**Existing targeted per-campus enrichment (DO NOT run here — for the admin "Run enrichment" button):**

| Need | Function | Provider / cost | Output | Safe as admin button |
|---|---|---|---|---|
| course code | `researchProgramCourses` (`src/lib/program-courses.functions.ts`) | SerpAPI+Firecrawl+AI · ~$0.05–0.10 | writes `campuses.course_family_codes_json/titles` | **yes** |
| professors | `autoDiscoverCampusUrls`→`scrapeCampusFaculty` (`src/lib/faculty-scrape.functions.ts`) | SerpAPI+Firecrawl+AI · ~$0.05–0.40 (Firecrawl-heavy) | writes `campus_lead_suggestions` | **yes** |
| RMP intro-1 qualify | `enrichProfintelCampus` | RMP · low | `campus_lead_suggestions.rmp_*` | yes (but RMP weak for intro-1) |
| syllabi/docs (discover) | `discoverCourseDocuments` (`src/lib/syllabus-intel.functions.ts`) | SerpAPI only · ~$0.05–0.15 | writes `course_document` | **yes** |
| exam/textbook/prof evidence (parse) | `parseCourseDocument` (server fn) or `scripts/course-intel-harvest/parse-pass.mjs` | Firecrawl+AI · ~24 credits/PDF | writes `course_evidence` + `professor_intro1_evidence` + `textbooks` | **yes** |

Orchestrator that chains these per campus: `POST /api/backfill` (`src/routes/api.backfill.tsx`, gated by `BACKFILL_TOKEN`), stages `{code, greek, council, profs, enrich, syllabi}`.

---

## 8. Joining to the rest of Growth

**Canonical identifier: `campuses.id` (uuid).** Everything joins through it.

| Target | Join | Notes |
|---|---|---|
| `campuses` | `course_intel_campus_status.campus_id = campuses.id` | base identity, domain, colors, `course_family_codes_json` |
| `campus_market_intelligence` | `.campus_id = campuses.id` | **832 campuses** — demand: `estimated_intro1_annual`, `undergrad_enrollment`, `accounting_bachelors`, `business_growth_1y` |
| Greek | `campus_greek_chapters.campus_id = campuses.id` (chapter density); `campuses.greek_pct_fraternity/sorority` (% of student body) | primary distribution signal |
| Growth contacts | `growth_contacts` → `campuses.id` | table exists but **EMPTY (0 rows)** today |
| Competitive data | none owned by this session | n/a |

**MUST NOT use:** any join on campus **name/`campus_name`** text (non-unique, messy). Always `campus_id`.

---

## 9. Known risks / caveats

- **Exam dates are mostly historical** (239 historical vs 25 current-term). `days_until_exam_1` is not reliable; show estimated windows (Exam 1 ≈ term week 5–6) instead of live countdowns unless term ≥ 2026.
- **Map layer is Starter-only:** 3 active `campus_exams`, 0 professor maps, 0 approved mappings. Almost every professor receives the Global Starter Map.
- **Proposed ≠ approved:** 114 `textbook_chapter_topic_mapping` rows are `state='proposed'`, `survive_topic_id` NULL. Never render as student-facing.
- **Exam-range false positives:** a few Exam-1 ranges are mis-parsed cumulative/final (span > 6 chapters, e.g. 1–24). Flag for review.
- **Textbook contamination:** some `textbook_reference` rows are non-intro titles (Bookkeeping for Dummies, Intermediate, tax). Exclude on review.
- **Syllabus classifier noise:** some `course_document.document_type='syllabus'` rows are handbooks/reports/listings/wrong-course. The 234 "parsed syllabi" is inflated.
- **Ambiguous professor attribution:** `professor_intro1_evidence` links to `campus_lead_suggestions` via `lead_suggestion_id` when matched, else name text (within-campus only).
- **Dark campuses:** ~435 returned zero docs, mostly because no public domain is stored on the campus row (upstream gap), not discovery failure.
- **`teaches_intro_1` boolean is unpopulated** — use `professor_intro1_evidence` + `rmp_target_course_counts_json`.
- **Incomplete migrations:** none outstanding for Course Intel (both this-session migrations applied). `growth_contacts` empty. Data lives in the DB, not files — the CSV/JSON deliverables are *reports*, not the source of truth.

---

## 10. Migrations / code status

- **Branch:** `overnight/course-intel-harvest` · **latest commit:** `bf96f57f` · **16 commits** this session (off `course-intel-v1`).
- **Not merged to main. Not deployed.**
- **Uncommitted:** only runtime cruft (`.gitignore`, `launch-when-ready.sh` flag edit, `launcher.out`) — no code of consequence.
- **Migrations created (both APPLIED to live DB):**
  - `20260824_2100_course_intel_harvest_status.sql` → `course_intel_campus_status`, `professor_intro1_evidence`
  - `20260825_1200_course_intel_exam_dates.sql` → exam-date columns on the status table
- **Migrations NOT applied:** none.
- **DB writes made:** `course_document` (~3,389), `course_evidence` (~1,100+), `professor_intro1_evidence` (~732), `course_intel_campus_status` (884), `textbooks`/`textbook_chapters` (4 editions + 51 chapters), `textbook_chapter_topic_mapping` (54 proposed). **No student-facing map rows were written.**
- **Must merge before dashboard work:** the two migrations are already applied to the DB, so the dashboard can read the tables today. Merging the **branch** to main is only needed if you want the harvest/enrichment **scripts + the `discoverCourseDocuments`/`parseCourseDocument`/`researchProgramCourses` server functions** available in the deployed app (they already exist on `course-intel-v1`, which this branch descends from). The dashboard's **reads** need no merge.

---

## 11. Machine-readable

See `FINAL_INTEGRATION_COURSE_INTEL.json`.

---

## COURSE INTELLIGENCE READY FOR DASHBOARD INTEGRATION: **PARTIAL**

**Ready now (read directly):** per-campus status aggregate, documents, exam evidence (all exams),
professor evidence (RMP-independent), textbooks + real TOCs, proposed topic mappings, and clean uuid
joins to `campuses` / `campus_market_intelligence` / Greek. The dashboard can render campus + professor
drawers and the enrichment checklist today.

**Not ready (needs build, not more research):** (1) an **approval workflow** to promote proposals into
`campus_exams`/`campus_exam_topics` (nothing is approved yet; `survive_topic_id` unattached); (2) **live
exam timing** (dates are historical — needs re-parse near term start); (3) a **student→professor
demand** signal (no table exists); (4) optional cleanup of syllabus-classifier and textbook noise.

No new broad research. No deploy.
