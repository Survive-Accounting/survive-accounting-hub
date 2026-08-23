# Syllabus / Course-Document Adapter Plan

Adapters grouped by **ingestion pattern**, from the 28-campus discovery sample. The key insight:
public syllabus repositories cluster into a **small number of reusable platform families** — build
per-*platform* adapters, not per-school scrapers. All URLs below were observed publicly this
session; none require login. **Many need a headless/Firecrawl fetcher** (plain HTTP fetch failed on
SPAs, redirect+TLS chains, and 403s) — that is the single most important engineering requirement.

---

## Adapter A — Texas HB 2504 public syllabus systems (highest leverage)
Texas law requires public posting of undergraduate syllabi + instructor CVs for public
institutions. Observed to split across **4 platform sub-families**:

| Sub-adapter | Platform | Example campuses | URL shape | PDFs? | Difficulty |
|---|---|---|---|---|---|
| **A1** | UT System in-house | UT Austin (`utdirect.utexas.edu/apps/student/coursedocs/nlogon/`), UT Dallas (`dox.utdallas.edu`), UT Arlington (`mentis.uta.edu`) | search UI + stable per-doc download | Yes (A1 direct; UTA Mentis `/dashboard/file/download/id/<int>`) | Easy–Medium |
| **A2** | **Simple Syllabus** (multi-tenant SaaS) | Texas A&M, Lone Star College (+ many national) | `<tenant>.simplesyllabus.com/en-US/syllabus-library` | HTML SPA + PDF/print export (headless needed) | Medium |
| **A3** | **Concourse** (multi-tenant SaaS) | Houston CC | `<tenant>.campusconcourse.com` | HTML SPA export (headless) | Medium |
| **A4** | Ellucian WebAdvisor/Colleague | Tarrant County College | `…/DisplaySyll?courseDesc=ACCT-2301&term=2024FL&id=<id>&lev=UG` | **Yes, direct PDF, fully parameterized** | Easy (once section id known) |

- **Inputs:** campus tenant slug, course code, term, section id (or a library-browse step to find ids).
- **Retrieval:** A1/A4 = parameterized URL → PDF. A2/A3 = headless render → export.
- **Coverage:** very high across Texas + Simple Syllabus/Concourse's national tenant lists.
- **Win:** two SaaS adapters (Simple Syllabus, Concourse) + one WebAdvisor adapter cover 4 of 5 TX sample schools and generalize far beyond Texas.

## Adapter B — Predictable-filename .edu repositories
Public folders / stores with a deterministic naming convention → enumerate directly.

| Campus | Pattern | Notes |
|---|---|---|
| **UF (Warrington)** | `asset.warrington.ufl.edu/syllabi/{termcode}_{CODE}_{title}_{section}_{Last, F}.pdf` (termcode = year + 1/5/8) | Gold standard — full syllabi w/ exam→chapter maps |
| **UGA Bulletin** | `bulletin.uga.edu/Syllabus?Syllabus={ID}` | Public + indexed, but JS SPA → headless |
| **UA (Alabama) OIRA** | `oira.ua.edu/syllabus/{TERMCODE}/{ID}` | Public + indexed; 302 chain + TLS quirk → headless |
| **Liberty** | `…/online/wp-content/uploads/{CODE}_CourseGuide.pdf` | "Sample" course guides; edition gated in LMS |
| **Miami Dade** | `…/asa/documents/competencies/` | College-wide Course Competencies PDFs (topic spine) |

- **Inputs:** term code + course code (+ section/instructor for UF).
- **Retrieval:** enumerate candidate URLs → fetch → parse. Cheap once the pattern is known.
- **Difficulty:** Easy (UF, Liberty) to Medium (UGA/UA need headless render).

## Adapter C — ID-addressed public syllabus web apps
Per-section syllabi behind an opaque numeric id in a public app.

| Campus | Pattern | Notes |
|---|---|---|
| **Park University** | `app.park.edu/syllabus/syllabus.aspx?ID=<n>` | Public; needs a live-term id discovery step |

- **Inputs:** section id (discover via search or an index page).
- **Retrieval:** crawl id space / discover ids from search → fetch.
- **Difficulty:** Medium (id discovery is the gap).

## Adapter D — SERP → public PDF (the general fallback)
Staged Google discovery for campuses with no structured repo but public PDFs on the .edu.

- **Inputs:** `site:<domain> "<course code>" (syllabus|study guide|exam 1|schedule) filetype:pdf`.
- **Retrieval:** SERP → cheap snippet classifier (`classifyDocument`) → fetch only Tier-1/2 hits.
- **Coverage:** the Class-B campuses (Arkansas Walton advising archive, Ole Miss iStudy, etc.).
- **Difficulty:** Medium; cost-controlled by the snippet classifier before any fetch.

## Adapter E — Bookstore textbook lookup (textbook/ISBN, not syllabi)
Already partly in Survive's DB; generalizes for refreshing textbook identity.

- **Patterns:** `bkstr.com/…/course-materials-results?...` (already the `source` on 170 campuses),
  `ou.textbookbrokers.com/courselisting/.../loadMaterials?courses=[{school,term,dept,course,section}]`.
- **Inputs:** dept + course + live section id. **Output:** title/author/edition/ISBN → `normalizeTextbook()`.
- **Difficulty:** Easy–Medium (needs a current section id).

## Adapter F — Publisher TOC harvest (once per edition)
Not per-campus — per textbook edition. The reuse engine.

- **Sources:** publisher product pages (mheducation.com, wiley.com, cambridgepub.com) + publisher
  sample-chapter PDFs; Open Library `/works/{id}/editions.json` where a `table_of_contents` exists.
- **Inputs:** normalized edition identity (title|author|edition).
- **Output:** chapter number + title rows → `textbook_chapters` (already in schema `0113`).
- **Difficulty:** Easy; ~30 editions total.

## Adapter Z — Manual VA queue
Class-D catalog-only campuses, OCR-only scans, ambiguous professor/edition, LSU-style login-gated
databases. Human finds/validates; system stores the result in the same evidence model.

---

## Build order (cheapest × highest coverage first)
1. **F (publisher TOC)** + **E (bookstore textbook)** — cheap, ~90% campus coverage via reuse.
2. **A4 + B (parameterized URLs)** — direct PDFs, no headless needed.
3. **A1 (UT System)** — high yield.
4. **A2/A3 (Simple Syllabus / Concourse) + B-headless (UGA/UA) + C (Park)** — require the headless
   fetcher; biggest campus count.
5. **D (SERP→PDF)** — general fallback.
6. **Z (manual)** — everything else.

**Shared infrastructure all adapters need:** a headless/Firecrawl fetcher, URL canonicalization +
content-hash dedupe (don't re-fetch/re-parse unchanged docs), a staged cost gate (snippet
classifier before fetch; light extraction before deep AI parse), and per-document provenance.
