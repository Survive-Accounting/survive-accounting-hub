## Problem

USC's BUAD 280 has ~13 sections this term, but Class Schedule Intelligence only captured Merle Hopkins. The single-shot Gemini call with Google Search is **summarizing** the catalog page instead of **enumerating** every section row. Same risk for BUAD 281, ACCT 370/385, ECON 203/205, BUAD 306.

Two things to fix:
1. Make the scrape exhaustive and per-family (not one prompt that has to balance 9 families).
2. In the UI, make CERTAIN Intro 1 / Intro 2 instructors visually unmissable.

---

## Fix 1 — Per-family enumeration in `research-campus-sections`

Replace the single Gemini call with a **fan-out loop, one call per course family** (intro_1, intro_2, intermediate_1, intermediate_2, finance, business_stats, business_analytics, microeconomics, macroeconomics). Each call:

- Targets that family only, with explicit course-prefix hints (`ACCT`, `ACCY`, `BUAD`, `BUS`, `FIN`, `ECON`, `STAT`).
- Instructs the model: *"Return EVERY section row visible on the schedule page. Do not summarize. Do not return only the first 1–3. If you see 13 BUAD 280 sections, return 13 entries — one per section_number. If you cannot enumerate all rows, return an empty array rather than a partial sample."*
- Requires `section_number` to be non-null (filters out summary rows).
- Logs per-family counts to `debug.per_family` so we can see "intro_1: 1 section" and know it under-pulled.

When a family returns 0 sections, retry that family once with a stricter prompt before giving up. Continue other families on failure — missing data still returns `success: true` per existing contract.

Add a per-section dedupe **inside the run** and a DB-level unique index on `(campus_id, course_code, section_number, term)` to prevent dupes across re-runs (so re-running the search is safe).

## Fix 2 — Confirmed Intro Instructor highlight

In `LeadSuggestionsPanel`:

- Add a "⭐ Confirmed Intro" treatment (gold star + tinted row background) whenever a lead has `teaches_intro_1` OR `teaches_intro_2` set to `true` AND a non-null `teaching_evidence_url`. This is the "we are CERTAIN" rule — the flag was set by the schedule scraper from an actual public class-schedule page, not by lead AI inference.
- Add a "Confirmed Intro only" filter toggle at the top of the panel.
- The default "Teaching Priority" sort already buckets these to the top; tighten so Confirmed Intro 1/2 (with evidence URL) sits above Inferred Intro 1/2 (no evidence URL).

In `ClassScheduleIntelligencePanel`:

- Header counts per family (e.g. "intro_1: 13 · intro_2: 9 · ia1: 4 …"), so a thin result like "intro_1: 1" is immediately visible and signals "re-run."
- A small ⚠️ chip next to a family count below 2 with a tooltip: *"Suspiciously low — re-run Find class sections."*

## Fix 3 — Assessment surface (so we can see what went wrong)

Expose the per-family debug from the edge function in an expandable "Why these results?" section in `ClassScheduleIntelligencePanel`:

- Per family: requested vs returned count, source URLs hit, finish_reason, rejected sample reasons.
- A "Re-run this family" button per family (calls the function with a single-family override).

---

## Technical notes

- Migration: `CREATE UNIQUE INDEX … ON public.campus_course_sections (campus_id, course_code, section_number, term) WHERE section_number IS NOT NULL;` and switch the inserts to `upsert(..., { onConflict: ... })`.
- Edge function: add optional `families?: string[]` param to `research-campus-sections` body so the per-family retry button can target one family.
- `outreach-api.ts`: extend `runCampusSectionsResearch(campusId, families?)`.
- No changes to `outreach_leads` or to `research-campus-leads`; star/highlight is purely a UI read of existing fields.
- Rate My Professors still excluded.

## Out of scope (call out, don't build)

- HTML fetch/parse of USC `classes.usc.edu` directly (would be most reliable but is per-school engineering — propose as a Phase 4D if per-family enumeration still misses on USC after this fix).
- Outreach scoring.

## Files changed

- `supabase/functions/research-campus-sections/index.ts` — per-family loop, stricter prompt, retry, per-family debug, optional `families` param.
- `supabase/migrations/<ts>_campus_sections_unique_idx.sql` — unique index.
- `src/lib/outreach-api.ts` — `families?` arg, surface per-family debug.
- `src/components/outreach/ClassScheduleIntelligencePanel.tsx` — family counts, low-count warning, per-family re-run, "Why these results?" panel.
- `src/components/outreach/LeadSuggestionsPanel.tsx` — Confirmed Intro star/row highlight, "Confirmed Intro only" filter, tighter priority sort.
