# Lead Finder — Streamlined Layout + Flame Focus

## 1. Header re-layout (`outreach.leadfinder.$campusId.tsx`)

Center the brand block again and remove duplicate dashboard nav:

- Remove the `← Dashboard` pill button from inside the navy header.
- Remove the `X` close button next to the campus name.
- Remove the `← Outreach Dashboard` link under the campus name.
- The Outreach sidebar (already present in the `/outreach` layout) remains the way back to the dashboard.
- Navy header content becomes a single centered column:
  - `Survive Accounting` logo
  - `USA College Campus Lead Finder ™`
  - `LEADS FOUND` label + odometer
- Remove the right-hand `Step #1 / Step #2` block from the header entirely.

## 2. Steps move under the campus name

Below the `University of Illinois Chicago` heading, render a single horizontal "steps strip":

```
[ Step #1 · Copy Faculty Link ]   [ Step #2 · Paste Scrape URL ▸ ]   [ Step #3 · Import N Leads ]
                                                                       (always shows current count)
```

- Steps #1 and #2 reuse `ScrapeFacultyButton` (stacked layout) but rendered inline horizontally.
- Step #3 is the merged Import button (see section 3).
- The small "Scrape failed? Import Website PDFs" link stays as a tertiary affordance below the strip.

## 3. Merge Step #3 (Apply Tags) into Step #4 (Import)

Replace the current Apply-Tags chip panel + bottom Import button with one merged flow:

- On scrape complete (or initial load), auto-apply the `Intro Target` tag to every row where `isIntroLikely(title)` is true. (Already supported by `applyTagToIds`; just call it once when new untagged intro-likely rows appear.)
- Remove the entire Step #3 chip panel UI: the `Detected:` row, the `From past campuses:` row, and the orange "Tag all N Intro-likely" button. Power users can still adjust tags via the existing `All tags` dropdown / new-tag input toolbar, which we keep.
- Each row gets a leading checkbox column. Checked = will be imported. Default = checked for intro-likely rows, unchecked for the rest. Checking/unchecking adds/removes the `Intro Target` tag on that row (existing `applyTagToIds` path), so the import-leads selection logic (`tagged > 0`) stays unchanged.
- Title column continues to show the raw title verbatim for every row, sortable as today.
- Bottom action bar becomes the single source of truth for import: `Step #3 · Import Leads (N)` with the live tagged count. Back / Next / filter dropdown stay as they are.

## 4. Animated flame border (focus indicator)

Add a small Tailwind/CSS utility `.flame-focus` in `src/styles.css`:

- Animated conic-gradient or dual box-shadow pulse in amber→orange→red, ~1.6s loop.
- Class is applied to whichever step currently needs the user's attention.

State machine in `LeadFinderPage`:

```
flameStep: 1 | 2 | 3
  1 (initial)         → flame on Step #1 button
  user clicks Step #1 → flame on Step #2 input/button
  scrape completes    → flame on Step #3 Import button (with extra glow + pulsing count badge)
  import succeeds     → flame off; advance toast suggests Next campus
```

- `flameStep` is local state in the page; resets when `campusId` changes.
- Step #1 click handler (wrapped around `copyFacultyGoogleLink`) bumps to 2.
- `ScrapeFacultyButton.onScraped` callback bumps to 3.
- Import success bumps off and fires a slick celebration toast: `🔥 Imported N leads from {campusName}` with a short `Next campus →` action button wired to the existing `handleNext`.

To let the page wrap Step #1's click, add an optional `onStep1Click` prop to `ScrapeFacultyButton` (fires after Copy Faculty Link succeeds) and an optional `flameStep` prop so the button can apply `.flame-focus` to the right child. Default behavior unchanged for other call sites.

## 5. Files touched

- `src/routes/outreach.leadfinder.$campusId.tsx` — header restructure, steps strip placement, flame state machine, merged import button, celebration toast.
- `src/components/outreach/FacultyTriagePanel.tsx` — remove Step #3 chip panel, add leading checkbox column wired to the `Intro Target` tag, keep `All tags` toolbar + new-tag input, auto-tag intro-likely rows on first load after a scrape.
- `src/components/outreach/ScrapeFacultyButton.tsx` — accept `onStep1Click` + `flameStep` props, apply `.flame-focus` to the active sub-button.
- `src/styles.css` — `.flame-focus` keyframe + utility.

No backend, schema, or business-logic changes; tagging + import paths are reused as-is.
