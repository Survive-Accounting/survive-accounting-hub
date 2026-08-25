# EXAM 1 GLOBAL STARTER MAP — Rebuild Report

**Course:** Intro Financial Accounting (`course_family=intro_1`, `11111111-…`)
**Branch:** `curriculum/exam1-global-starter-map-v1`
**Applied to live DB:** 2026-08-25 (Supabase `unvxagsledbsdoremqeb`)
**Source of truth:** `scripts/curriculum/Survive_Exam1_Global_Starter_Map.xlsx` → `Claude Import` sheet

**GLOBAL EXAM 1 STARTER MAP READY: YES**

---

## BEFORE

| Metric | Value |
|---|---|
| Exam 1 topics (Starter Map) | **7** — The Accounting Cycle, Analyzing Transactions, Recording Journal Entries, Adjusting Entries, Trial Balances, Financial Statements, Closing Entries |
| Sets (live, deduped) | **19** |
| CEQs (live, deduped) | **206** |
| Active campus-specific Intro-1 overrides | **Ole Miss** — Exam 1 (Ch1–3), Exam 2 (Ch11–14), Exam 3 (Ch15–18) |
| Active professor-specific overrides | **0** |
| Ole Miss Exam 1 resolution | its own campus map (Ch1, Ch2, Ch3) |

## AFTER

| Metric | Value |
|---|---|
| Exam 1 topics | **6** — Easy Points · Analyzing Transactions · Recording Journal Entries · Adjusting Entries & Trial Balance · Financial Statements · Closing Entries |
| Subtopic sets | **25** |
| CEQs | **280** |
| Active campus-specific Intro-1 Exam 1 overrides | **0** |
| Active professor-specific overrides | **0** |
| Ole Miss Exam 1 resolution | **Global Starter Map** (6 canonical topics) — old testing map archived |

**Topic → subtopic set breakdown (live, verified):**

| # | Topic | Sets | CEQs |
|---|---|---|---|
| 1 | Easy Points | 6 | 25 |
| 2 | Analyzing Transactions | 2 | 54 |
| 3 | Recording Journal Entries | 4 | 69 |
| 4 | Adjusting Entries & Trial Balance | 5 | 61 |
| 5 | Financial Statements | 4 | 41 |
| 6 | Closing Entries | 4 | 30 |
| | **Total** | **25** | **280** |

## CONTENT

- **Reused CEQs:** 205 (reuse their original CEQ node id → analytics lineage preserved)
- **New CEQs:** 75 (deterministic ids `ceq-e1s-<QuestionKey>`)
- **Reclassified:** all 205 reused questions were regrouped from the old 19 question-style sets into the 25 canonical subtopic sets; student-facing set names are now the subtopic labels (old names like "What type of account is [ ]?" retired).
- **Removed duplicate:** 1 — the old Ch1 duplicate (`ceq-mt0nkduu-1`, "Which step is right after recording journal entries?") is absent from the workbook and therefore dropped (206 → 205 reused).
- **Feedback:** 104 questions carry explanation text, attached to the correct choice (renders on a correct pick).
- **Reconciliation:** "The Accounting Cycle" → **Easy Points**; "Adjusting Entries" + "Trial Balances" folded into **Adjusting Entries & Trial Balance** (Trial-balance-errors content moved in; the Trial Balances chapter is kept in the DB for future Exam 2/3 use but removed from every Exam-1 grouping and its old set parked).

## TECHNICAL

**Files added**
- `src/lib/exam1-starter/plan.ts` — pure deterministic plan builder + topic reconciliation
- `src/lib/exam1-starter/workbook.ts` — `Claude Import` sheet reader (xlsx)
- `src/lib/exam1-starter/scene.ts` — canonical deck/CEQ node builders
- `src/lib/exam1-starter/plan.test.ts` — CI contract test (6/25/280 + structure)
- `scripts/curriculum/exam1-starter-import.ts` — dry-run/`--apply` importer (snapshots, writes)
- `scripts/curriculum/exam1-starter-validate.ts` — live invariants + resolution tests
- `scripts/curriculum/Survive_Exam1_Global_Starter_Map.xlsx` — committed source of truth
- npm scripts `curriculum:exam1-starter-import` / `curriculum:exam1-starter-validate`

**Migrations/scripts:** No SQL migration — this is a data reset applied through an idempotent
service-role script (deterministic ids: `deck-e1s-<t>-<s>`, scene UUIDv5 from a fixed namespace,
CEQ ids reuse/`ceq-e1s-<key>`). Re-running `--apply` reproduces the same 6/25/280 with no dupes.

**Scene strategy:** Each of the 25 sets is written to its OWN per-set canvas scene (1 card deck +
its tucked CEQ nodes). Because the student loader's dedupe ranks single-deck scenes first, every
canonical set is guaranteed to be the winning copy students read. All 38 old deck instances (19
decks × workspace + per-set copies) were parked (`status=archived`, `parked=true`) so no stale set
resolves. New scenes were written BEFORE parking old decks → no empty-Exam-1 window mid-apply.

**Maps rewritten (3 surfaces):**
- `campus_exam_topics` (Starter Exam 1) → 6 topics in order — landing / resolver
- `exam_unit_chapters` (Exam 1 unit) → 6 topics (Trial Balances dropped) — `/learn` grouping
- `default_exam_units` → Exam 1 mirror = 6 topics — legacy fallback

**Override reset:** Ole Miss's campus Exam 1/2/3 rows set to `status=archived` (full inherit —
the resolver is level-all-or-nothing, so neutralizing Exam 1 alone isn't possible while Exam 2/3
stay active). Every Intro-1 campus/professor now falls through to the Global Starter Map. The
underlying syllabi / inbound files / Course Intel evidence / `map_meta` were NOT touched.

**Rollback / snapshot:** `scripts/curriculum/snapshots/pre-apply-<ts>.json` — captures the prior
chapters, starter + Ole Miss `campus_exams`/topics, `exam_unit_chapters`, `default_exam_units`,
`map_meta`, and every affected scene's `nodes_json`. Reversible.

**Validation results (`curriculum:exam1-starter-validate`, live):** **24 / 24 pass** — 6/25/280,
exactly 25 live sets on the 6 topics all mapped to canonical decks, 280 live CEQs (0 noteOnly
counted), every CEQ 2–5 choices + one correct, no dup ids/prompts, Starter Map + exam_unit = 6
topics (no Trial Balances), 0 active campus/professor overrides, and global resolution: Ole Miss /
Auburn / Florida / Georgia / generic all → Starter (6 canonical topics).

**Test results:** 7 new curriculum tests pass; full suite **1578 pass / 1 fail**. The single
failure (`bolt-palette.test.ts` — a colour-accent threshold) is **pre-existing on the base commit
`89d6f67e` and unrelated** to this branch (not a file this branch touches).

**UI:** `/learn` SSR confirmed rendering the new **Easy Points** topic with its 6 canonical
subtopic sets and correct question counts on production (which reads the same live DB). Full
interactive/visual verification (course-map switcher across all 6 topics, answering questions) was
limited by the headless browser pane not compositing frames; the data layer and SSR confirm
correctness. Note: the `/learn` route intentionally shows a "practice player lands here soon"
placeholder (pre-existing) — the interactive practice player is served on the homepage surface via
`fetchSetPractice`, which returns these free sets with full choices + correct + feedback.

## PAGES / ROUTES TO TEST (manual, in a displayed browser)
- `/` (homepage player) — Exam 1 shows 6 topics in order; open a set → practice → answer → feedback.
- `/learn` — course map lists all 6 topics; Trial Balances absent; no duplicate/old sets.
- Confirm on a phone width — course-map sheet + set grid.

## NEEDS MANUAL REVIEW
- Interactive practice run-through in a displayed browser (headless pane couldn't composite).
- Decision applied per your calls: **archive all 3 Ole Miss overrides** (full inherit) and
  **deploy to production**.
