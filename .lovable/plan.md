# Speed Mode: PhD/CPA automation + UI minimalize

## 1. Confirmed: PhD → "Dr." prefix

`supabase/functions/outreach-send-email/index.ts` already does this:

```ts
const greetingName = lead.is_phd
  ? `Dr. ${(lead.last_name ?? "").trim() || firstName}`
  : firstName;
// then: replace {recipient name} with greetingName
```

So any lead with `is_phd = true` gets `Dr. {LastName}` wherever the template uses `{recipient name}`. No code change needed — just need scrape to actually flag them (next item).

## 2. Auto-flag PhD / CPA during scrape

Today `faculty-scrape.functions.ts` extracts `title` but never sets `is_phd` / `is_cpa`. Update the pipeline to set both booleans before insert in **all three paths** (markdown parser, AI extraction, multi-page extraction):

- PhD regex on `name + title`: `/\b(Ph\.?\s?D|D\.?B\.?A|Ed\.?D|D\.?Phil|Doctorate)\b/i`
- CPA regex: `/\bC\.?P\.?A\b/i`
- Also strip trailing credentials from the displayed name (e.g. "Jane Doe, PhD, CPA" → name "Jane Doe", flags both true)
- Tell the AI extractor to return `credentials: string[]` so we don't rely on regex alone, then OR the regex result with the AI signal

Insert these into `campus_lead_suggestions` so the triage panel checkboxes are pre-ticked. Manual override on the panel still wins.

## 3. Top 5 UI minimalize suggestions for the modal

The Approve modal is ~1960 lines with experiments piled on. My ranked cuts:

1. **Collapse the 3-button scrape row into one "Scrape" button with a dropdown** (URL / Crawl / PDF). Today: 3 separate top-row buttons + their associated modals. Saves horizontal real-estate and groups the mental model ("get faculty from somewhere").
2. **Remove the multi-step "Step 1 / Step 2 / Step 3" tabs and the AI-research panel above triage.** In Speed Mode you only ever use Faculty Triage + Program name + Scrape. The legacy steps (textbook family pickers, course code research, etc.) are dead weight in Speed Mode and slow page load.
3. **Move Program name / Shorthand into a small inline header next to the school title** (one line: `Alabama State · Department of Accounting · Culver`). Currently it's a whole boxed section taking ~80px vertically.
4. **Drop the "Next filter" pill bar from the modal header** and move it to a small icon-dropdown on the Next button itself (`Next ▾`). Right now it eats a full row but is a one-time setting per session.
5. **Trim Faculty Triage columns**: merge `PhD` + `CPA` into a single `Creds` cell with two tiny toggle chips, hide `Source` behind a hover on the row, and drop the `Tags` column for rows with no tags (only render the column header when at least one row has tags). Keeps the table scannable at 4 columns: Name · Title · Email · Decision.

## 4. What I need from you before building

Please reply approve/deny per item (1–5). Plus:

- **For #2**: OK to fully *remove* the legacy step tabs / AI research panel from the modal, or do you want them kept behind a "Show advanced" toggle for non-Speed-Mode use? (If Speed Mode is becoming the only mode, I'd vote remove.)
- **For #5**: Should the row stay clickable for range-select (current behavior) if we hide Source on hover, or do you want a dedicated select checkbox column instead?
- **Anything I should *archive* rather than delete** (textbook coverage panel, class schedule intel, etc.) so we can resurrect later if needed?

Once you confirm, I'll ship #1 (PhD/Dr. is already live) + #2 (auto-flag) + whichever of the 5 you greenlight.
