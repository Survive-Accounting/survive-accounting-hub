## Diagnosis

Pulled every clean-professor run for University of Mississippi from the DB. The pattern is clear:

| Run (label)                  | Time   | Inserted | Whitney? |
|------------------------------|--------|----------|----------|
| Test 17:53                   | 17:53  | 10       | (cumulative)|
| Test 17:56                   | 17:56  | 7        | —        |
| Test 18:05                   | 18:05  | 3        | —        |
| Test 18:11                   | 18:11  | 11       | —        |
| Test 18:20                   | 18:20  | 5        | —        |
| Test 18:22                   | 18:22  | 9        | **YES** (wfbarton@olemiss.edu) |
| Test 18:47                   | 18:47  | 5        | NO       |
| Run 1 (most recent)          | 18:47  | 5        | NO       |

Whitney's row exists in `campus_lead_suggestions` (status=pending) from the 18:22 run. So this is not a data-loss bug — it's a **single-pass coverage bug**: each individual AI call returns a non-deterministic 3–11 person subset of the ~25 people on `accountancy.olemiss.edu/about/faculty-and-staff/`. The prompt already names Whitney as a canary and tells the model to walk the `?role=instructor` tab, but Gemini still skips that tab on ~half of runs.

Across runs the dedupe layer is cumulatively building a complete list, but any single "fresh" test looks broken. For bulk runs across 170 campuses that's worse: every campus gets exactly one shot.

Root cause: one AI call, one set of search queries, model temperature drift. The instructor/adjunct tab is the consistently-missed page.

## Fix — Deterministic two-pass enumeration in `research-campus-leads-clean`

### Pass 1 — Faculty (current behavior, narrowed)
Call Gemini with the current prompt but scoped to: full / associate / assistant professors, clinical, professor of practice, chair, BAP advisor. Returns ~8–12 senior names.

### Pass 2 — Instructors / Adjuncts / Lecturers (new, mandatory)
A second AI call with a **role-locked** prompt:

> List EVERY person at `${dept_url}` whose title contains "Instructor", "Lecturer", "Adjunct", "Clinical", "Teaching Professor", "Professor of Practice", or "Visiting". Open `?role=instructor`, `?role=staff`, `#instructors`, and any standalone "Adjunct Faculty" / "Instructors" page. If a directory only lists names, open each individual profile (e.g. `/faculty-and-staff/<slug>/` or `/profiles/<username>.php`) to confirm title and email. Do NOT include tenure-track professors — Pass 1 covers those. Return 0 rows only if you can prove the department has no non-tenure-track faculty.

Reject token (`temperature: 0`, lower `top_p`) for determinism on this pass.

### Merge + sanitize + self-audit
- Merge both arrays, sanitize once (current rules), dedupe by email.
- Self-audit guard: if the merged list contains **zero** rows whose title regex-matches `/instructor|lecturer|adjunct|clinical|practice|visiting/i`, automatically fire Pass 2 ONE more time with the explicit text "Your previous response listed no instructors. The department almost certainly has some — search `?role=instructor` and the staff directory now." Cap at one retry to bound cost.
- Insert as today; existing email-dedupe handles overlap with prior runs.

### Cost
Two Gemini Flash calls per campus instead of one. ~$0.004 → $0.008 per campus. Full 170-campus clean run ≈ $1.40 → $2.80. Trivial.

### Per-campus override (optional, small)
Extend the request body with optional `force_urls?: string[]`. If present, both passes are told "you MUST open these URLs before searching". Lets you re-run Ole Miss with `["https://accountancy.olemiss.edu/about/faculty-and-staff/?role=instructor"]` and prove the fix.

## Verification plan
1. Deploy updated `research-campus-leads-clean`.
2. Re-run the clean test for University of Mississippi from the panel.
3. Confirm Pass-2 returns Whitney Barton, Katy Mullinax, Sandi Goodwin, Evelyn Farmer, Grace Herrington, Jennifer Burchfield, Cere Muscarella (the known instructor set). All seven should appear in the accepted_preview of the result modal, not just cumulatively in the DB.
4. Spot-check 2 other campuses (different state, different CMS) to confirm Pass 2 doesn't regress tenure-track-only schools.

## Files touched
- `supabase/functions/research-campus-leads-clean/index.ts` — split into `buildPromptFaculty()` + `buildPromptInstructors()`, add Pass 2 call, merge, audit-retry, optional `force_urls`.
- No frontend changes required; existing test modal will surface the larger accepted list automatically.

## Out of scope
- Changing the broader `research-campus-leads` (non-clean) endpoint.
- Switching models or providers.
- Backfill across 170 campuses — that's a separate bulk-run decision after we confirm the fix on Ole Miss.
