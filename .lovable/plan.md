## Goal
1) Tighten the **AI Suggested Leads** table (sort by last name, drop status column, reorder).
2) Add a new **Phase 4C — Class Schedule Intelligence** pass that scrapes public registrar/business-school class schedules for accounting + business‑core courses, persists sections to a new table, and back-fills/creates lead suggestions when an instructor is visible.

No dashboard redesign. No auto-approval. No auto-import into `outreach_leads`.

---

## Part A — Leads panel UI tweaks (`LeadSuggestionsPanel.tsx`)

- Remove the **Status** column entirely from the table (status is still editable via the bulk action buttons + Accept/Reject/Needs‑Lee, and the per-row Select goes away).
- New column order: **checkbox · Type · Email · First · Last · Title · Teaches · PhD · CPA · Conf. · Source · Notes**.
- Default sort = **last_name ASC** (case‑insensitive, nulls last). Teaching‑priority sort becomes opt‑in via a new "Sort" dropdown next to the teaching filter: `Last name (A→Z)` (default) | `Teaching priority` (current behavior).
- Keep the teaching filter, counts, and bulk actions exactly as they are.

No changes to API or types.

---

## Part B — Phase 4C: Class Schedule Intelligence

### New table — `campus_course_sections`

Migration creates it with the columns you listed plus the standard `id / created_at / updated_at` + GRANTs + RLS (admin-only via `has_role`, service_role full access — same pattern as `campus_lead_suggestions`). Indexes on `campus_id`, `course_family`, `course_code`, `instructor_name`, `term`. `updated_at` trigger using the existing `public.set_updated_at()`.

`course_family` allowed values:
`intro_1 | intro_2 | intermediate_1 | intermediate_2 | finance | business_stats | business_analytics | microeconomics | macroeconomics | other`

### New edge function — `research-campus-sections`

Separate function (keeps `research-campus-leads` reliable; schedule scraping is best‑effort and slow). Same Lovable AI Gateway + `google_search` pattern.

Prompt instructs the model to:
- Open public **registrar / class search / business school schedule** pages (not just the accounting department). Try common prefixes: `ACCT, ACC, AC, BUAD, BUS, BUSA, FIN, ECON, STAT, BA, BANA, BUSN`.
- Capture sections for the four accounting families **plus** finance, stats/analytics, micro, macro when easily visible.
- For each section, return: `course_family, course_code, course_title, term, section_number, instructor_name, instructor_email, meeting_days, meeting_time, location, enrollment_current, enrollment_capacity, waitlist_count, source_url, confidence`.
- **Never hallucinate** — null any field without a real source URL. Return an empty `sections: []` if nothing public is found. Do NOT fail.

Sanitizer drops rows without `course_family` + `source_url`, clamps integers, and stores the full model object in `raw_payload`.

### Lead linkage (server-side, inside the same function after sections insert)

For each section row with an `instructor_name`:
1. Try to match an existing `campus_lead_suggestions` row for this campus by normalized `lower(first||' '||last)` containment of `instructor_name`.
2. **Match found** → merge into that suggestion:
   - Append the section to `courses_found` (dedup on `course_code + term + section_number`).
   - Flip the matching `teaches_intro_1/2/intermediate_1/2` boolean true (only for the four accounting families).
   - Set `teaching_evidence_url` / `teaching_evidence_notes` if currently null.
3. **No match** + `instructor_email` visible → insert a new `campus_lead_suggestions` row, `status='pending'`, `lead_type='professor'`, with the teaching booleans + `courses_found` populated.
4. **No match** + no email → insert pending suggestion with `email = null`, `notes = "Instructor found in class schedule; email not visible."`.

Run logs go into the existing `ai_research_debug_json` on `campuses` under a new `sections` key (so the Research & Approve modal's debug panel keeps working).

### Approve modal — new "Class Schedule Intelligence" section

In `ApproveCampusModal.tsx`, below the existing Lead Review block:
- New button **"Find class sections"** that invokes `research-campus-sections`.
- Summary line: `N sections · M intro accounting sections · K instructors · [source links]`.
- Collapsible table (read‑only): Course | Section | Instructor | Term | Meeting Time | Enrollment / Capacity | Source.
- Loaded via a tiny `getCampusSections(campusId)` helper added to `outreach-api.ts`.
- Not required for approval.

### Sort tweak (Part A interaction)

`LeadSuggestionsPanel` "Teaching priority" sort gets a tie-breaker bump: leads whose `courses_found` came from `campus_course_sections` (we'll add a transient `has_section_evidence` boolean derived in the panel by joining via a second fetch — small `getCampusSectionsByInstructor(campusId)` call) rank above leads with only model-asserted teaching. If that join would slow things down on the first build, fall back to ranking by current `teaches_*` flags only and leave a TODO. Default sort stays last‑name as in Part A.

---

## Files changed / created

- `supabase/migrations/<ts>_campus_course_sections.sql` *(new)*
- `supabase/functions/research-campus-sections/index.ts` *(new)*
- `src/lib/outreach-api.ts` — add `getCampusSections`, `runCampusSectionsResearch`, types
- `src/components/outreach/LeadSuggestionsPanel.tsx` — drop Status col, reorder, last‑name sort, sort dropdown
- `src/components/outreach/ApproveCampusModal.tsx` — Class Schedule Intelligence section
- `src/integrations/supabase/types.ts` — auto-regenerated after migration

---

## Example `campus_course_sections` row
```json
{
  "campus_id": "…usc…",
  "course_family": "intro_1",
  "course_code": "BUAD 280",
  "course_title": "Introduction to Financial Accounting",
  "term": "Fall 2025",
  "section_number": "14213",
  "instructor_name": "Smrity Randhawa",
  "instructor_email": null,
  "meeting_days": "MW",
  "meeting_time": "10:00–11:50",
  "location": "JKP 104",
  "enrollment_current": 38,
  "enrollment_capacity": 40,
  "waitlist_count": 3,
  "source_url": "https://classes.usc.edu/term-20253/classes/buad/",
  "confidence": "high"
}
```

## Updated AI output shape (sections function)
```json
{
  "success": true,
  "campus_id": "…",
  "sections_inserted": 47,
  "leads_updated": 6,
  "leads_created": 2,
  "debug": { "model": "...", "sources": [...], "raw_text": "..." },
  "sections": [ /* rows as above */ ]
}
```

## Guarantees
- Missing schedule data → `sections_inserted: 0`, function returns `success: true`. Never throws to the modal.
- No writes to `outreach_leads` from any of this.
- No new RLS allowance for `anon`.

Once you approve, I'll run the migration first, then ship the function + UI in a second pass and we'll re-test against USC.
