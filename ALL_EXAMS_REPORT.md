# Course Intel — All-Exams Map (Exam 1 / 2 / 3 / 4 / Midterm / Final)

_Read-only analysis of evidence already extracted from parsed syllabi + study guides + schedules ·
2026-08-25 · branch `overnight/course-intel-harvest`. No new discovery for the chapter data; the
schedule parse (146 docs) was run to add exam dates. No student-facing maps changed._

> **Headline:** the parsed syllabi don't just reveal Exam 1 — they reveal the **whole course
> structure**, and it's remarkably consistent nationwide: a **four-chapters-per-exam cadence** —
> **Exam 1 = Ch 1–4 → Exam 2 = Ch 5–8 → Exam 3 = Ch 9–12 → Final = cumulative (≈Ch 1–13)** — with
> midterm-style courses front-loading Ch 1–6. **67 campuses** now carry explicit per-exam chapter
> evidence (was 5 before parsing).

---

## The nationwide exam structure

Distinct-campus chapter frequency per exam (a chapter "belongs" to an exam when a majority of campuses
that name that exam include it):

| Exam | Campuses | Core chapters (≥50% of campuses) | Top ranges (campuses) | Confidence |
|---|--:|---|---|---|
| **Exam 1** | 48 | **Ch 1, 2, 3, 4** (96 / 92 / 88 / 67%) | 1–4 (21), 1–3 (13), 1–5 (6) | **STRONG** |
| **Exam 2** | 44 | **Ch 5, 6, 7, 8** (68 / 75 / 68 / 57%) | 5–8 (12), 4–6 (8), 6–10 (6) | **STRONG** |
| **Exam 3** | 35 | **Ch 9, 10, 11** (51 / 54 / 54%) | 9–12 (6), 11–16 (3), 8–10 (2) | **MODERATE** |
| **Exam 4** | 16 | — (no chapter ≥50%) | 10–13 (2), 11–13 (2), 7–8 (2) | **WEAK** (varies) |
| **Midterm** | 22 | **Ch 1–4** (86%), Ch 5 (59%), Ch 6 (50%) | 1–5 (7), 1–4 (6), 1–6 (5) | **STRONG** |
| **Final** | 37 | **Ch 1–13** broadly (57–78%) | 1–13 (7), 1–12 (6), 1–10 (5) | **STRONG (cumulative)** |

### How to read it
- **Exam 1 = Chapters 1–4.** Near-universal for Ch 1–3 (88–96%), majority for Ch 4 (67%). The single
  most reliable pattern in the dataset.
- **Exam 2 = Chapters 5–8.** Equally clean — the second quarter of the book.
- **Exam 3 = Chapters 9–12.** Real but a bit looser (lower percentages, more variance) — courses differ
  more in the back half.
- **Final = cumulative**, typically Ch 1–13 (the whole intro sequence). A minority use a non-cumulative
  final (Ch 13–15 only).
- **Midterm courses** (2-exam structure) front-load: the midterm ≈ Ch 1–5/6, i.e. it replaces Exam 1+2.
- **Exam 4** exists only in 4-exam courses and has no dominant pattern — treat per-campus.

### Confidence separation (honest)
- **STRONG cross-campus patterns:** Exam 1 (Ch 1–4), Exam 2 (Ch 5–8), Final (cumulative), Midterm
  (first half). These hold across 22–48 independent campuses each.
- **MODERATE:** Exam 3 (Ch 9–12) — directionally clear, lower agreement.
- **WEAK / per-campus:** Exam 4; any single-campus range; the scattered high-chapter hits (alternate
  textbook numbering).
- **Problem types:** still insufficient evidence to generalize — do not infer.

---

## What this unlocks (beyond Exam 1)

1. **A full-course topic map, not just Exam 1.** Survive can now say, evidence-backed, what each exam
   covers for a typical Intro Financial Accounting course — and organize the whole product around the
   1–4 / 5–8 / 9–12 / cumulative cadence.
2. **Per-campus exam maps** (see `ALL_EXAMS_CAMPUS_MAPS.csv`) — one row per campus with its Exam 1 /
   2 / 3 / 4 / Midterm / Final chapter ranges as actually stated in its syllabus. These are the raw
   material for per-campus "what's on your next exam" once human-approved.
3. **Filming can sequence to the calendar.** Because exams track chapter quartiles, a campus mid-
   semester is almost always between Exam 1 (Ch 1–4) and Exam 2 (Ch 5–8) — so the *next* exam's topics
   are predictable even without that campus's own syllabus.

## Film priority (whole course, evidence-based)
1. **Exam 1 core — Ch 1–4** (financial statements & the equation → transaction analysis → journal
   entries → adjusting entries). Strongest signal; also the first exam students face.
2. **Exam 2 core — Ch 5–8** (typically merchandising / inventory / receivables / internal control &
   cash, depending on textbook). Second-strongest.
3. **Exam 3 core — Ch 9–12** (long-lived assets / liabilities / equity — varies more).
4. **A cumulative-final review** spanning Ch 1–13 — matches the dominant final structure.

## Data notes
- Chapter numbers are the textbook's own numbering; the top-3 textbooks (Libby / Spiceland / Wild)
  align closely, which is why the cross-campus pattern is this clean. Mapping each edition's TOC →
  Survive topics (the prepared worklist) would let these ranges resolve to exact Survive topics.
- The **schedule** docs (146) were parsed to harvest exam dates but proved mostly institutional
  academic calendars — low yield (a handful of ranges/dates); the exam-date signal lives in syllabi.
- **285 exam-date evidence rows** exist across all exams, but the large majority are from prior-term
  syllabi (historical) — useful for *timing patterns* (Exam 1 ≈ week 5–6), not live countdowns.
- Everything here is **PROPOSED / NEEDS_REVIEW**; no student-facing exam/topic/chapter map was altered.

**Deliverables:** `ALL_EXAMS.json` (per-exam frequencies + ranges), `ALL_EXAMS_CAMPUS_MAPS.csv`
(per-campus exam→chapter map).
