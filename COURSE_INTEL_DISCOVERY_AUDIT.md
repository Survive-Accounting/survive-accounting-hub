# Course Intel — Discovery Audit

**Date:** 2026-08-23 · **Branch:** `overnight/syllabus-intel-audit` · **Author:** overnight research run
**Scope:** determine whether Survive can find syllabi + course documents at scale, extract
course/exam/textbook structure, obtain textbook TOCs, and map it all onto Survive's canonical
Intro-1 topics — **without** reproducing professor materials. **No production writes, no player
changes, no bulk paid scraping, no paywalled/authenticated content accessed.**

> This audit ran on a **28-campus representative sample** (10 active product campuses, 7 market,
> 11 SEC/big-public, 7 of them Texas) using free public web search + fetch. It is a discovery
> sample, not a census — treat percentages as directional.

---

## Can this work?

**Yes — for roughly half the target market it is strongly automatable today, and the textbook
layer (the highest-leverage piece) is nearly solved.** The other half needs a headless fetcher,
a licensed data source, or a human VA queue. The strategic unlock is **reuse**: US intro
accounting is dominated by a handful of textbook editions, so mapping *textbook chapters →
Survive topics once per edition* covers hundreds of campuses. Exam→chapter ranges come free from
syllabi/study guides where those are public.

Three things make it work now:
1. **Textbook identity is largely already in Survive's DB** — 170/372 US campuses already carry
   `course_family_textbooks_json` (title/ISBN/author/publisher from bookstore scraping).
2. **Textbook TOCs are public** for the dominant editions (publisher product pages + sample-chapter PDFs).
3. **Public syllabus systems exist and are enumerable** — Texas HB 2504, plus per-school repos (UF, UGA, UA, Park).

The main blocker is not discovery — it's **fetching**: many public repos are JS/SPA or redirect/TLS/403-hardened, so plain HTTP fetch fails and a **headless/Firecrawl fetcher is required**.

---

## Syllabus & course-document findings (28-campus sample)

| Source class | Meaning | Count | Automatable? |
|---|---|---|---|
| **A** | Structured public syllabus system | **8** | Yes — highest |
| **B** | Searchable public PDFs/pages | **6** | Yes — via search+fetch |
| **C** | Historical/indexed only | **1** | Partial |
| **D** | Manual research likely | **12** | No (VA queue) |
| **E** | No useful public source | 0 | — |

- **14/28 (50%) are Class A or B — directly automatable.** 15/28 have an identifiable public repository.
- **Real public syllabi/study-guides fetched** on UF, UT Austin, Arkansas, Alabama, Georgia, Park, plus repository confirmations elsewhere.
- **9/28 campuses yielded explicit exam→chapter ranges** from the public document (e.g. UF: Exam 1 = Ch 1-3,5).
- **Honest negatives (Class D, ~43%):** most non-flagship SEC schools (UT Knoxville, Auburn, Kentucky, Miss State, Vanderbilt, Missouri, South Carolina, USF, UCLA, Hawaii Pacific, Arizona) expose only catalog/bulletin descriptions on their .edu; their real syllabi sit on Course Hero / Studocu / Chegg (restricted — **not fetched**, per rules). These need a licensed source or manual work.

### The big structural finding: repositories cluster into a few platform families
See `SYLLABUS_ADAPTER_PLAN.md`. The Texas HB 2504 mandate is the single largest lever, and its
syllabi live on **~4 reusable SaaS platforms** (Simple Syllabus and Concourse are multi-tenant —
one adapter each covers many campuses), not per-school one-offs.

---

## Extraction feasibility (from the fetched public documents)

When a public syllabus/study-guide IS obtained, structured fields extract well. From the sample
of documents actually fetched (small n — directional):

| Field | Availability when a real doc is fetched |
|---|---|
| Professor | High (~90%) — syllabi name the instructor |
| Course code / title | High (~95%) |
| Term / year | High (~85%) |
| **Textbook title + author** | High (~80% of syllabi; **plus 170 campuses already in DB**) |
| **Edition** | Medium (~55%) — often stated, but bundle/looseleaf strings obscure it |
| ISBN | Medium (~50%) — frequent in syllabi and always in bookstore data |
| Exam count | High (~80%) |
| **Exam chapter ranges** | Medium-High (~65% of syllabi state them explicitly) |
| Weekly chapter schedule | Medium (~60%) |
| Homework system (Connect/MyLab) | High (~75%) |
| Learning objectives | Medium (~50%) |

The two fields that matter most for mapping — **textbook edition** and **exam→chapter range** —
are the two with the most edition-string ambiguity, which is exactly why the tested
`normalizeTextbook()` and `parseExamChapterRanges()` utilities exist (see `scripts/course-intel/`).

---

## Textbook intelligence (the highest-leverage layer)

- **Extreme concentration.** Across the 169 SA campuses with intro_1 textbook data, the **top 3
  titles cover 99%** and there are only ~77 distinct ISBNs (mostly McGraw-Hill Spiceland/Libby/Wild).
- **Exact TOC found for 9/9 canonical editions researched; 7/9 publisher-confirmed exact**
  (see `TEXTBOOK_TOC_AUDIT.csv`). Best sources: **publisher product pages** (mheducation.com,
  wiley.com, cambridgepub.com) and **publisher sample-chapter PDFs**; Open Library carries a TOC
  for some (e.g. Wild) but not most; bundle ISBNs do **not** resolve in Open Library/Google Books.
- **Do-not-use sources** that dominate raw search results: Stuvia, Course Hero, Course Sidekick,
  studentebookhub (solution-manual mills). These were identified and excluded.
- **Implication:** harvest ~20-30 TOCs (once per edition) and you cover essentially the entire
  target market. This is the reuse engine.

---

## Mapping feasibility (exam → chapters → Survive topics)

**Demonstrated end-to-end on real data** — see `SYLLABUS_INTEL_SAMPLES.json`:
- **UF · ACG 2021 · Goslinga · Fall 2025** (Spiceland 2025 Release): syllabus states Exam 1 = Ch
  1-3,5 → mapped to Survive topics (Financial Statements, Analyzing Transactions, Journal Entries,
  Adjusting Entries, Receivables…). **Confidence: HIGH** (explicit range + exact edition + TOC + recent).
- **UT Austin · ACC 311** (Libby 12e): Exam 1 = Ch 1-3 → Survive topics. **Confidence: MEDIUM**
  (edition varies by section → needs confirmation).
- **Arkansas · ACCT 2013** (Albrecht 11e, Cengage): explicit 4-exam map, but older/uncommon
  textbook with uncertain TOC. **Confidence: LOW** (edition confirmation required).

The pattern holds: **where a public syllabus states exam ranges AND the edition is identifiable
AND its TOC is public, a High-confidence mapping falls out mechanically.** All three conditions
are met most often at Class-A campuses using a top-3 textbook.

---

## Expected automation coverage

Directional, from the sample:
- **~50%** of target campuses: **automatable** (Class A/B) end-to-end (discover → fetch → parse → map).
- **~5-10%**: partial (historical/indexed, or repo exists but needs headless render).
- **~40%**: **human exception queue** (catalog-only public footprint; real docs paywalled/restricted).
- **Textbook layer: ~80-90% coverable** regardless of syllabus availability, because textbook
  data is already in the DB and TOCs are public and concentrated.

So the realistic V1 operating model is: **automate textbook identity + TOC + the ~50% Class-A/B
campuses; route the rest to King/VA**, prioritized by live student demand (see below).

---

## Estimated cost (see also the Cost section in COURSE_INTEL_ARCHITECTURE.md)

Grounded in Survive's measured ProfIntel rates (SerpAPI ~$0.015/search, Firecrawl ~$0.001-0.002/
scrape, Gemini-flash ~$0.003-0.008/parse). Cost is **SERP-dominated** and controlled by staged
discovery (cheap snippet classifier before any fetch).

| Scenario | Prof-courses | Low | **Expected** | High |
|---|---|---|---|---|
| A: 200 campuses × 3 profs | 600 | $60 | **~$110** | $210 |
| B: 200 campuses × 5 profs | 1,000 | $100 | **~$180** | $350 |
| C: 300 campuses × 5 profs | 1,500 | $150 | **~$270** | $525 |

**Reuse savings are large:** textbook TOC harvested once per edition (~30 editions total, not per
campus), documents hashed/deduped and parsed once, professor-course reused across terms. These
push real cost toward the "Low"/"Expected" columns on re-runs.

### Key question answered: what does **$100–$300** buy?
Practically, **$100–$300 of initial discovery/processing** covers roughly:
- **200–350 campuses** swept for public syllabi/course docs,
- **~600–1,500 professor-courses** attempted,
- **~250–700 useful public documents** found (Class A/B campuses),
- **~25–30 textbook editions** identified with public TOCs (covers ~90% of campuses via reuse),
- **~150–400 proposed exam mappings** (High/Medium), with
- **~40% of campuses flagged for human review** (Class D / restricted sources).
Assumptions: 50% Class-A/B hit rate, staged discovery, ~10 SERP searches + 3 fetches + 1-2 AI
parses per productive professor-course. Small sample → treat as a planning range, not a promise.

---

## Recommended pipeline (tomorrow, ordered)

1. **Textbook + TOC layer first** (cheapest, highest reuse). Normalize the 170 campuses' existing
   textbook data with `normalizeTextbook()`, harvest ~30 TOCs from publisher pages into the
   existing `textbook_chapters` table (already in schema `0113`).
2. **Textbook chapter → Survive topic mapping** (once per edition, human-approved). Seed from the
   3 sample mappings; this is the reuse engine.
3. **Class-A adapters** (Texas HB 2504 SaaS families + UF/UGA/UA/Park repos) — staged discovery →
   headless fetch → parse exam ranges → propose mapping.
4. **Class-B SERP→PDF adapter** for searchable public PDFs.
5. **Human exception queue** for Class-C/D.
6. **Demand-driven prioritization** wired to live signups/professor selections.

Full data-model + adapter + player/admin/prioritization design is in
**`COURSE_INTEL_ARCHITECTURE.md`** and **`SYLLABUS_ADAPTER_PLAN.md`**.

---

## King / VA role (human exception queue)

Automate the easy majority; route to King/VA: OCR-only scanned docs, ambiguous professor identity,
unclear/uncommon textbook editions, conflicting exam maps, repos needing per-vendor crawlers
(UTA Mentis), and Class-D catalog-only campuses. Humans **approve** proposed mappings and handle
QA — they do not research every course from scratch.

---

## Open Syllabus opportunity

Open Syllabus (opensyllabus.org) is a nonprofit corpus of ~27M syllabi with public aggregate
"Galaxy"/co-assignment tools, but **individual syllabus text and any bulk/API access are gated**
behind institutional/research agreements, and **commercial use requires a separate license.**
Recommended next steps for Lee (do not attempt unauthorized access):
1. Check whether **Ole Miss** (Survive's home institution) already has institutional access — if so,
   it may support *research* but almost certainly **not** commercial product use.
2. Email Open Syllabus about a **commercial data license** scoped to accounting courses (textbook
   + course-code + exam-structure signals), and ask what fields a license would expose.
3. Treat it as a possible **accelerant for Class-D campuses**, not a dependency — the public
   pipeline above stands on its own.

## Paid document platforms (Course Hero / Scribd / Chegg / Studocu)

- These surfaced constantly in results but were **never fetched** (terms prohibit automated extraction).
- None offers a clean public metadata API suitable for discovery. Chegg/Course Hero have data
  partnerships but on their terms; **do not build the pipeline to depend on circumventing them.**
- Recommendation: ignore for V1; revisit only via a formal data-license conversation.

---

## Biggest opportunities (ingest first)

1. **Textbook TOC reuse layer** — ~30 editions cover ~90% of campuses. Cheapest, highest leverage.
2. **Texas HB 2504** — dozens of public campuses on ~4 SaaS platforms; build Simple Syllabus +
   Concourse + WebAdvisor adapters.
3. **UF-style predictable-filename repos** (UF Warrington, UGA Bulletin, UA OIRA, Park app) —
   enumerable, high-yield, but need a headless fetcher.
4. **The 10 active product campuses** — map these first regardless of class; they have live students.

---

## Artifacts produced

| File | What |
|---|---|
| `COURSE_INTEL_SOURCE_AUDIT.csv` | 27 campuses × source class, repo, doc counts, adapter, difficulty |
| `TEXTBOOK_TOC_AUDIT.csv` | 9 canonical editions × TOC source, exact-edition confirmation, chapter count |
| `SYLLABUS_INTEL_SAMPLES.json` | 3 REAL inferred exam→chapter→Survive-topic mappings (High/Med/Low) |
| `COURSE_DOCUMENT_SAMPLES.json` | 42 discovered public documents in the proposed `course_document` shape |
| `COURSE_EVIDENCE_SAMPLES.json` | 26 derived evidence rows (exam ranges, textbook refs) with confidence |
| `SYLLABUS_PIPELINE_PRIORITY.csv` | 27 campuses ranked for enrichment (demand columns left blank — not fabricated) |
| `SYLLABUS_ADAPTER_PLAN.md` | Adapter families grouped by ingestion pattern |
| `COURSE_INTEL_ARCHITECTURE.md` | Data models, evidence weighting, player/admin/prioritization, copyright boundaries |
| `scripts/course-intel/lib.mjs` (+ tests) | Tested pure utilities: textbook normalizer, exam-range parser, confidence, doc classifier, freshness |

**Not done (by design):** no production writes, no player changes, no bulk scraping, no
paywalled/authenticated/Course-Hero content, no live mapping edits.
