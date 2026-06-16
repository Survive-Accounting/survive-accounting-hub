## Goal

One modal does it all: confirm course details → textbooks → scrape & triage leads → approve. Campus row collapses to three buttons.

## Changes

### 1. `ApproveCampusModal.tsx` — Step 3 "Lead Review" becomes the scrape + triage hub

Replace the current Step 3 body with:

- Heading: "Leads" (rename stepper label from "Lead Review" → "Leads")
- Action row at top:
  - `ScrapeFacultyButton` (Firecrawl auto-discover) — pulls candidates for this campus
  - Small pending/accepted/rejected counts
  - Previous / Next Step on the right (unchanged)
- `FacultyTriagePanel` (the new Firecrawl candidate review with Keep/Skip + Import) rendered inline, scoped to this campus
- Keep `ClassScheduleIntelligencePanel` (it feeds leads here too)
- Keep the "skip lead import" checkbox so Approval can still proceed without leads
- **Delete** the helper copy: "Run AI research, then accept the leads you want…" and "Accepting a lead does not email them. Import Accepted Leads moves them…"

Move the **old** `LeadSuggestionsPanel` (the previous "AI Suggested Leads" table — pre-Firecrawl flow) into a collapsed `<details>` at the bottom of the modal labeled **"Archived: legacy AI lead suggestions"**. Still functional, just out of the way.

### 2. Top of modal — trim the header copy

Keep the **Run Full AI Research** and **Open Research Tools** buttons as-is. **Delete** the descriptive line: "Finds course codes, textbook matches, and suggested leads. You'll review everything before saving."

### 3. `CampusTable.tsx` — simplify row actions to 3 buttons

Replace the current per-row action cluster with exactly three buttons:

1. **Review** — opens modal at Step 1 (`onReview(s)`, modal's existing `setStep("1")` on open)
2. **Leads** — opens modal jumped to Step 3 (new prop `onOpenLeads(c)` → in `outreach.tsx` sets `reviewing` AND a new `initialStep="3"` passed into `ApproveCampusModal`)
3. **Metrics** — disabled/grey, tooltip "Coming soon"

Remove:
- The standalone `ScrapeFacultyButton` from the row (it now lives inside the modal's Step 3)
- The expanded `FacultyTriagePanel` row (also moved into the modal)
- The "Approved ✓" green button variant — `Review` is the single entry point; show approval state as a small badge next to the school name instead.

### 4. `outreach.tsx` — wire jump-to-step

- Add `leadsJumpId` state (or reuse `autoResearchId`-style pattern) for "open modal at step 3".
- Pass `initialStep` prop into `ApproveCampusModal`; modal uses it in its `useEffect` that currently resets to `"1"` on open.
- `onImportLeads` row handler → set both `reviewing` and `initialStep="3"`.

## Technical notes

- `ApproveCampusModal` already owns `step` state via `useState("1")` and `setStep("1")` on open (line 215). Accept an optional `initialStep?: string` prop; if provided, use it on open.
- `ScrapeFacultyButton` and `FacultyTriagePanel` both accept `campusId` + `campusName` and already handle their own refresh tokens — drop-in safe inside the modal.
- No backend / schema / server-function changes.
- No changes to the existing `ImportLeadsDialog` flow — `onImportLeads` is being repurposed to "open modal on Leads step" instead of opening the CSV import dialog. The CSV import dialog stays reachable from the Home tab's "Import leads" action.

## Files touched

- `src/components/outreach/ApproveCampusModal.tsx` — Step 3 rewrite, header copy trim, archived legacy panel, accept `initialStep` prop
- `src/components/outreach/CampusTable.tsx` — collapse row actions to Review / Leads / Metrics, drop inline scrape button + triage expansion
- `src/routes/outreach.tsx` — pass `initialStep`; repoint Leads button to open the modal at step 3
