## Goal

Replace per-row selection + bulk-tag with a **title-driven tagging step** that auto-suggests role tags from each faculty member's title and lets you apply a tag to every matching person with one click. Tuned to surface Intro 1 / Intro 2-likely instructors.

## New flow on `/outreach/leadfinder/$campusId`

1. **Step #1** — Copy faculty link (unchanged)
2. **Step #2** — Paste scrape URL → run scrape (unchanged)
3. **Step #3 — Review / Edit Tags** *(new)*
4. Keep / Skip + Import Leads (unchanged)

Step #3 is a single compact panel above the faculty table.

## Step #3 panel — three rows

```text
┌──────────────────────────────────────────────────────────────────────┐
│ INTRO-LIKELY (12)  [ Tag all as "Intro Target" ]   highlight rows ☐ │
├──────────────────────────────────────────────────────────────────────┤
│ Detected roles:                                                       │
│  + Lecturer (3)   + Adjunct (2)   + Instructor (4)                    │
│  + Assistant Prof (6)   + Associate Prof (5)   + Visiting (1)         │
│  + Teaching Prof (2)   + Professor of Practice (1)   ...              │
├──────────────────────────────────────────────────────────────────────┤
│ From past campuses:  + Clinical Lecturer   + Senior Instructor        │
│ Custom: [ new tag ____ ] [Add]   • applies to current selection or   │
│                                    matching titles if rule provided   │
└──────────────────────────────────────────────────────────────────────┘
```

- **Click a role chip** → applies that tag to every row whose title matches the role's keyword. Click again → removes it from those same rows.
- **Counts on each chip** reflect how many people on this campus match.
- **"Intro-likely" button** = one-click tag-all of every row whose title matches the intro-targeting set (see below).
- **"From past campuses"** pulls tags previously used on titles that match patterns present here, so your taxonomy stays consistent across schools.
- **Custom tag** still works; optionally attach a keyword so future scrapes auto-tag that role too.
- **No row selection required** for any of this. Drag-select still works for one-offs.

Sticky **Tag legend** at the table header colors each row's role chip(s) inline (small, muted), so you can see at-a-glance who got tagged.

## Keyword set — Intro 1 / Intro 2 targets

These are the titles most likely to teach Principles of Financial / Managerial Accounting. Bolded ones are the high-yield core.

- **Lecturer** — Senior Lecturer, Clinical Lecturer, Teaching Lecturer
- **Adjunct** — Adjunct Professor / Faculty / Lecturer / Instructor
- **Instructor** — Senior Instructor, Clinical Instructor, Continuing Instructor
- **Assistant Professor** — Clinical Assistant Professor, Visiting Assistant Professor, Teaching Assistant Professor, Assistant Teaching Professor
- **Associate Professor** *(secondary — many still teach intro)* — Clinical Associate Professor, Teaching Associate Professor
- **Teaching Professor** / **Professor of Teaching** / **Professor of Practice** / Practitioner in Residence
- **Visiting** — Visiting Lecturer / Instructor / Professor
- **Graduate Assistant** / **Teaching Assistant** / **Grader** *(often coordinator-adjacent for intro sections)*

**Excluded by default** (research-heavy, unlikely intro): Full Professor, Distinguished / Endowed / Named Chair, Emeritus, Dean, Associate Dean, Department Chair, Director of [Research/PhD/Center], Provost.

The "Intro Target" auto-rule = matches any of the bold groups OR any title containing `lecturer|adjunct|instructor|teaching professor|professor of practice|visiting`, AND does **not** contain `emeritus|dean|chair|provost|director of (research|phd|center)`.

## Persistence & learning

- Role keyword table lives in code (`src/lib/role-keywords.ts`) so it's easy to extend.
- Per-campus tag history already exists (`title_tags` on `outreach_leads_triage`). Add a tiny `useQuery` that pulls **distinct tags across all campuses with the titles that produced them** so the "From past campuses" suggestion is data-driven, not hard-coded.
- Custom tag + optional regex stored locally in `localStorage` (`sa-tag-rules`) for now; can be promoted to a DB table later.

## Technical notes

- Edit `src/components/outreach/FacultyTriagePanel.tsx`:
  - Extract `ROLE_TAG_KEYWORDS` into `src/lib/role-keywords.ts` and expand per list above (with `intro` flag per entry).
  - Replace the current "Suggested:" row (which only appears with a selection) with the always-on **Step #3 panel** described above.
  - New helpers: `matchRows(rule)`, `applyTagToMatches(label, rule, mode)`, `introLikelyRows()`.
  - Keep the existing `setTriageTagsBulk` writer; just feed it the matched IDs instead of `selected`.
- Add `src/lib/role-keywords.ts` exporting:
  - `ROLE_KEYWORDS` (array of `{ label, re, intro: boolean }`)
  - `INTRO_TARGET_RE` (compiled OR-pattern with the exclusion lookbehind logic done in code)
  - `matchRoles(title): string[]`
- New tiny query `fetchTagsByTitlePattern()` in `src/lib/faculty-triage.ts` for cross-campus "From past campuses" suggestions.
- No DB migration required.

## Out of scope (call out)

- Auto-applying tags during scrape (could come later; for now Step #3 is a one-click pass per campus).
- Promoting custom rules to a shared DB table (start with localStorage).
