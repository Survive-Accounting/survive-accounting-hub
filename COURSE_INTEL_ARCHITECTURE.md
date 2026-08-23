# Course Intel — Architecture & Data Model (design, not built)

Design recommendations for tomorrow's pipeline. **Nothing here is implemented tonight.** The
headline: **most of the schema already exists** in migration `0113_map_resolution.sql` — Course
Intel is mostly an *extension*, not a greenfield build.

---

## 1. What already exists (reuse it)

From `migration/supabase-migrations/` (verified this session):

| Concept | Existing table | Notes |
|---|---|---|
| Textbook | `public.textbooks` (`0002`, `0113:40`) | `title, edition (text), isbn, publisher` |
| Textbook family matcher | `public.supported_textbook_families` | `title_keywords[], author_keywords[], isbn13_prefixes[], edition_sensitive` |
| **Textbook TOC** | `public.textbook_chapters` (`0113:46-54`) | `textbook_id, chapter_key (stable id), number, title, position` — this IS a TOC model |
| Unit ↔ textbook chapter | `public.unit_textbook_links` (`0113:55-61`) | maps Survive Unit(=`chapters` row) ↔ textbook chapter |
| Per-prof/campus map | `public.map_meta` (`0113:23-33`) | `course/campus/professor, status(edited|verified), textbook_id` |
| Exam → chapters | `campus_exams` + `campus_exam_topics` (`0105`, `0113:16`) | `professor_id` enables prof-scoped maps; resolution walks professor → campus → Starter Map |
| Document provenance | `public.inbound_files` (`0113:68-80`) | `campus, professor, files[], source` — ≈ `course_document` |
| Evidence trail | `public.map_verification_files` (`0113:85-90`) | links a map to the file it was verified from — ≈ `course_evidence` |
| Syllabus intake | `public.syllabus_submissions` (`0108`) | student-uploaded syllabi |
| Prof teaches course | `public.campus_course_sections` | `instructor_name/email, term, source_url` |
| Campus course codes | `campuses.course_family_codes_json`, `course_family_textbooks_json`, `campus_courses` | 170 campuses already have textbook data |

**Canonical Intro-1 taxonomy** (the mapping target): `courses.course_family='intro_1'` → `chapters`
rows (Units). Current Exam 1 = `chapters` with `chapter_number ∈ {1,2,3,6,7,8,9}`. Set/problem-type
names ("Analyzing Transactions", "Recording Journal Entries", "Easy Points") live in
`canvas_scenes.nodes_json`, not a table. **Do not rewrite this.**

---

## 2. Net-new (small additions)

1. **`textbook_edition`** — promote edition from a text column to a first-class row so many campuses
   collapse onto one identity and TOC/mapping attach to the *edition*, not a bundle SKU.
   ```
   textbook_edition(id, textbook_id→textbooks, edition_number int, edition_label text,
                    edition_key text unique,   -- title|author|edition, from normalizeTextbook()
                    publisher, canonical_isbn13, toc_source_url, toc_confirmed bool)
   ```
   Then re-point `textbook_chapters.textbook_id` → `textbook_edition_id`.

2. **`textbook_chapter_topic_mapping`** — topic-granular (existing `unit_textbook_links` is
   unit-granular). THE reuse engine.
   ```
   textbook_chapter_topic_mapping(id, textbook_edition_id, textbook_chapter_id,
                    survive_topic_id (→chapters or topics), problem_type text,
                    confidence text (High|Medium|Low), source text, reason text,
                    state text (proposed|approved|rejected|superseded), approved_by, approved_at)
   ```
   Many Survive topics may map to one textbook chapter; one topic may recur across editions.

3. **`course_document`** — generic (not syllabus-only) discovered-document ledger. Generalize
   `inbound_files`:
   ```
   course_document(id, campus_id, course_family, professor_name, term, year,
                   document_type (study_guide|syllabus|schedule|homework|lecture|catalog|faculty_page),
                   value_tier int, source_url, source_domain, file_type, title,
                   textbook_edition_id?, content_hash, first_seen, last_checked, last_changed,
                   is_public_source bool, access (public|blocked), processing_status)
   ```

4. **`course_evidence`** — derived structured signals (one document → many rows):
   ```
   course_evidence(id, course_document_id→course_document, campus_id, professor_name, course_family,
                   exam_label, evidence_type (exam_chapter_range|textbook_reference|topic_signal|schedule),
                   textbook_chapter_id?, survive_topic_id?, raw_text, parsed_json,
                   confidence (High|Medium|Low), effective_term, freshness_weight,
                   superseded_by→course_evidence?)
   ```

That's it — 4 new tables + 1 FK re-point. Everything else reuses `0113`.

---

## 3. Evidence weighting, consensus & conflict (see `scripts/course-intel/lib.mjs`)

- **Weight by directness × freshness.** Directness: exam study guide / explicit syllabus range >
  homework-or-schedule inference > lecture/objectives > generic catalog. Freshness (`freshnessWeight`):
  current/last term 1.0 → 2-3 yrs 0.7 → 4-5 yrs 0.4 → older 0.2.
- **Confidence** is **High/Medium/Low**, not fake decimals (`scoreConfidence`): +explicit exam range,
  +exact edition, +exact TOC, +multiple recent agree, +professor-specific; −generic-catalog-only,
  −edition-uncertain, −old.
- **Multi-document consensus:** when ≥2 recent docs agree on the same exam→chapter map, promote to
  High. (E.g. a Fall-2024 syllabus + a Spring-2025 homework calendar + a Fall-2025 study guide all
  pointing at Ch 1-3 for Exam 1.)
- **Conflict resolution:** prefer **newer > more direct > more professor-specific**. **Never delete
  old evidence** — mark it `superseded_by` so history stays auditable.

## 4. Recommendation hierarchy (professor → course → generic)
`chooseMappingSource()` in the utils: use professor-specific mapping when its confidence isn't Low,
else course-level, else the generic Intro-1 Starter Map. This mirrors the existing `0113`
professor → campus → Starter Map resolution — Course Intel just feeds better data into it. Students
are never gated on perfect data; there's always a generic fallback.

## 5. Human-in-the-loop (V1 is not auto-apply)
The pipeline may **find / parse / normalize / suggest / rank**. It must **not** auto-rewrite live
professor exam mappings. Every mapping row carries a state: `proposed → approved | rejected |
superseded`. Only human approval flips a proposal into the live map (`map_meta.status='verified'`,
already in the schema). Approvals write provenance via `map_verification_files`.

## 6. Player presentation (design only — no player changes tonight)
- **Default:** the normal simple Survive topic list. Krug-simple. No machinery shown.
- **Only when confidence is High** for a professor/course + textbook: optionally show a
  chapter-organized view —
  ```
  WHAT'S ON EXAM 1?
  Chapter 1 · Financial Statements and Business Decisions
     Easy Points · Financial Statements
  Chapter 2 · Investing and Financing Decisions
     Account classification · Accounting equation effects
  Chapter 3 · Operating Decisions
     Recording Journal Entries
  ```
- **Never** surface confidence scores, source URLs, syllabus year, or provenance to students. That
  lives in admin only. The student should just feel: *"Survive knows my class."*

## 7. Admin workflow (design only)
Krug-simple review screen per campus·course·professor:
```
Clemson · ACCT 2010 · Smith
Sources: Syllabus 3 · Study Guides 2 · Homework 4 · Textbook ✓
Exam 1  HIGH   [Review]      Exam 2  MEDIUM  [Review]      Exam 3  LOW  [Review]
```
Review shows the proposed chapter→topic mapping with checkboxes + [Approve] / [Edit]. Data
requirements: `course_document` counts, `course_evidence` rows, `textbook_chapter_topic_mapping`
proposals, and the `map_meta` target — all defined above.

## 8. Demand-driven prioritization (design only)
Priority score inputs (leave blank until the metric exists — don't fabricate): current campus
signups, students selecting a professor, active Greek/chapter launch, upcoming exam date, map
incomplete, syllabus availability, conversion potential. Example: *43 K-State students, 31 picked
Prof Jones, Exam 1 in 12 days, map incomplete → jump to top of queue.* Pre-map broadly (cheap
textbook/TOC layer), let real demand reorder the *expensive* work (per-professor doc discovery).

## 9. Production-queue link (design only)
When evidence across campuses implies a topic Survive lacks (e.g. "Bank Reconciliation" referenced
by 8 professors / 6 campuses / 119 active students) and canonical content is missing, emit a
**content production queue** item with the demand signal. Defines the link; not built tonight.

## 10. Cost-control architecture (staged pipeline)
1. **Discover (cheap):** SERP/search only. 2. **Classify (cheap):** title/snippet/URL →
`classifyDocument` relevance + tier; drop Tier-4 noise before spending. 3. **Fetch:** only
likely-useful docs (headless where needed). 4. **Light extract:** metadata + relevant pages.
5. **Deep AI parse:** ONLY Tier-1/2 docs worth mapping — never send an 80-page PDF to a premium
model. **Reuse everywhere:** textbook TOC once per edition; `content_hash` skips re-parsing
unchanged docs; professor-course reused across terms; previously discovered URLs cached. SERP is
the dominant cost, so the cheap classifier before fetch is the main lever.

## 11. Copyright / source boundaries (hard rules)
Use syllabi + textbook info as **curriculum intelligence only**. Store: course metadata, textbook
**bibliographic** metadata, chapter **numbers/titles**, exam ranges, derived topic signals, mapping.
**Never** store or surface: professor assignments, textbook questions/prose, answer keys,
copyrighted homework. Public Survive content stays 100% original. Record source/provenance
internally (`course_document.source_url`, `is_public_source`), never in student-facing UI. Only
publicly accessible material; never bypass auth/paywalls/CAPTCHAs; never scrape restricted doc
services.
