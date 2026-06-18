# Speed Mode minimalize — build plan

PhD/Dr. greeting is already live. Scrape auto-flags PhD/CPA and the toolbar refactor (unified scrape button, inline program/shorthand, split Next button) shipped last turn. This plan covers the remaining cuts based on your answers.

## 1. "Show advanced" toggle in Approve Campus modal

`ApproveCampusModal.tsx` currently always renders the legacy multi-step research stack above Faculty Triage. We'll hide it behind a small toggle.

- Add `showAdvanced` state (default `false`, persisted to `localStorage` key `outreach.approveModal.showAdvanced` so it sticks per user).
- Wrap the legacy blocks in `{showAdvanced && (...)}`:
  - Step 1/2/3 tabs
  - `BatchResearchPanel` / `CleanProfessorResearchPanel` mounted inside the modal
  - `TextbookCoveragePanel`
  - `ProgramAndCoursesPanel`
  - `ClassScheduleIntelligencePanel`
  - Any "AI research" buttons in the modal header that aren't part of Speed Mode
- Add a tiny `Show advanced ▾` link-style toggle in the modal footer (or far-right of the new toolbar) so it's discoverable but out of the way.
- Speed Mode toolbar + Faculty Triage stay always-visible.

Nothing is deleted — all four panels remain mounted-on-demand so you can resurrect anytime.

## 2. Trim Faculty Triage columns (#5)

Edits in `FacultyTriagePanel.tsx`:

- Merge `PhD` + `CPA` into one `Creds` cell containing two compact toggle chips (`PhD` / `CPA`), each clickable like the current checkboxes. Saves ~100px.
- Hide the `Source` column. Render the source link as a small `↗` icon that appears on row hover inside the Name cell (uses existing `hover-card` if needed, but a CSS `group-hover:opacity-100` is enough).
- Only render the `Tags` column when at least one row in the current list has tags. Otherwise the column header and cells are omitted, and tags still appear in the amber bulk-tag bar when rows are selected.
- Keep click-to-select on Name/Title cells exactly as today (your answer to #5).

Final default columns: **Name · Title · Email · Creds · Decision** (5). With tags present: **Name · Title · Email · Tags · Creds · Decision**.

## 3. Archive (not delete) per your answer

No code removal. Just unmount from the modal when `showAdvanced` is off:
- `TextbookCoveragePanel`
- `ClassScheduleIntelligencePanel`
- `BatchResearchPanel`
- `CleanProfessorResearchPanel`
- `ProgramAndCoursesPanel`

All five files stay in `src/components/outreach/` untouched. `BatchResearchSettingsModal.tsx` also stays (it's reachable from outside the Approve modal).

## 4. Files touched

- `src/components/outreach/ApproveCampusModal.tsx` — advanced toggle, conditional rendering, footer link
- `src/components/outreach/FacultyTriagePanel.tsx` — merge Creds, hover-only Source, conditional Tags column

No DB migration. No server-function changes. No edge-function changes.

## 5. Verification

- Open Approve Campus modal → confirm only toolbar + Faculty Triage render by default.
- Click `Show advanced` → all legacy panels appear; reload page → preference persists.
- Triage with 0 tagged rows → no Tags column. Tag one → column appears.
- Click PhD/CPA chips → values save (same handler as today).
- Hover row → source icon appears in Name cell; click opens directory page in new tab.

Approve to build.
