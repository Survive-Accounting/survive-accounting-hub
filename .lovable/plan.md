# Triage cleanup + Speed Mode toolbar redo

Two files touched. No DB / no server changes.

## 1. `FacultyTriagePanel.tsx`

**Remove**
- `Source` column entirely (link still surfaces on row hover in the Name cell — keep that)
- `Tags` column entirely (tags are only managed via the bulk bar now)

**Redesign the bulk-tag bar** (only visible when ≥1 row selected). New layout, left-to-right:

```
[8 selected] [tag as ▾]  [+ custom tag input] [Add]   [How this works?]  [Clear (Esc)]
```

- `tag as ▾` is a single dropdown listing **every tag that exists in this campus** (union of all `title_tags` across rows + every custom tag ever added), sorted A–Z. Click a tag in the dropdown → it's added to every selected row. Each dropdown item has a small × on the right; clicking × deletes that tag from every row in the campus (with confirm).
- Custom tag input + Add behaves as today; adding a new custom tag makes it immediately appear in the dropdown for future use.
- "How this works?" is a tiny underlined link → opens a small modal with VA-friendly instructions:

```
How tagging & triage works

• Click a name to select that row. Shift-click another to fill a range.
  Cmd/Ctrl-click toggles one row.
• Press Esc to clear selection.

• Tags are short labels you put on a person (like "Assistant Professor"
  or "Intermediate I"). You can pick a tag from the dropdown or type a
  new one in "custom tag". The tag is added to every selected row.

• Pick a tag in the dropdown to add it. Click the × next to a tag in
  the dropdown to remove it from every person in this campus.

• PhD and CPA are NOT tags — they have their own buttons because:
    – PhD turns on the "Dr. {LastName}" greeting in emails.
    – CPA helps us send the right pitch for licensed accountants.
  Always tick these when you see PhD, Ph.D., D.B.A., or CPA in the title.

• Keep = include this person when you click "Import kept leads".
  Skip = ignore this person.
```

## 2. `ApproveCampusModal.tsx` — Speed Mode toolbar

Restructure the dense toolbar into a tiny numbered checklist so a VA can follow it top-to-bottom. Grad cap = the existing 🎓 school icon at the top-left of the toolbar.

```
🎓 University of Pennsylvania        [Copy Faculty Link]   ← Step #1
  ┌─ #2 Paste URL to Scrape ────────────────────────────────────┐
  │  [Scrape URL ▾]  [Crawl multi-page]                          │
  │  [Import PDF]   (?)  ← tooltip: "Only use if scrape fails"   │
  └──────────────────────────────────────────────────────────────┘
  Program: [..............] Shorthand: [........]    [Close] [Back] [Quick Approve] [Next ▾]
```

- **#1 Copy Faculty Link**: button next to the school name. On click it copies
  `https://www.google.com/search?q={school_name}+accounting+faculty+directory`
  to the clipboard and toasts "Search link copied — paste in a new tab".
  Does NOT open a tab (Google was blocking it).
- **#2 Paste URL to Scrape**: groups the existing Scrape URL + multi-page crawl buttons under a small "#2" label.
- **Import PDF** moves below the scrape buttons with a small `?` hover-tooltip: `Only use if scrape fails`.
- Program / Shorthand / Close / Back / Quick Approve / Next stay on a second row exactly as they are now.

## 3. Files touched

- `src/components/outreach/FacultyTriagePanel.tsx`
- `src/components/outreach/ApproveCampusModal.tsx`

Plus one new tiny component for the help modal:
- `src/components/outreach/TriageHelpModal.tsx`

## 4. Verification

- Triage table renders 4 columns: Name · Title · Email · Creds · Decision.
- Selecting rows shows the new bulk bar; dropdown lists all known tags A–Z; deleting from dropdown removes from every row; custom tag persists into the dropdown.
- "How this works?" opens the help modal with the copy above.
- Toolbar shows #1/#2 layout; Copy Faculty Link copies a Google search URL; Import PDF sits below with the tooltip.

Approve to build.
