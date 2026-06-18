# Title Tags — triage selection + audience filter

Goal: in the Faculty Triage panel, quickly tag candidate rows by their Title string (free-form, verbatim — "Lecturer", "Instructor", "Part-Time Instructor", …). Tags persist onto the imported lead and become a filter in the Audience tool so you can do laser-targeted 50/day blasts and compare performance per title later.

## 1. Schema (one migration)

- `campus_lead_suggestions.title_tags text[] not null default '{}'` — tag while triaging.
- `outreach_leads.title_tags text[] not null default '{}'` — copied in on import; this is the long-lived field used by audiences.
- GIN index on `outreach_leads.title_tags` for fast `&&` / `@>` audience filters.
- `importKeptLeads` updated to copy `title_tags` from suggestion → lead, and to merge tags on existing duplicates instead of skipping the tag work.

## 2. Triage panel UX (`FacultyTriagePanel.tsx`)

- New `Tags` column showing tag chips on each row (small, removable).
- Click the column header to sort by Title (asc/desc toggle). Default sort becomes Title so duplicates cluster.
- Row selection:
  - Click anywhere on a row's Title cell → selects that row (highlight).
  - Shift-click another Title cell → fills the range between them (the "reversi" behavior). Works on the currently-sorted order so a Title sort + shift-click captures every "Lecturer" in one move.
  - Cmd/Ctrl-click toggles a single row.
  - Click outside / Esc clears selection.
- Floating action bar appears when ≥1 row is selected:
  - "Tag N selected as…" → small combobox seeded with the distinct Title strings present in the selection (so one click adds "Lecturer" verbatim). Free-text entry also allowed; Enter commits.
  - "Clear tags on selection".
  - Multiple tags per lead allowed (array union; no duplicates).
- Header counter updates to: `N candidates · N pending · N kept · N tagged` (tagged = suggestions with `title_tags` length > 0, per-campus only).
- Tagging is independent of Keep/Skip — you can tag a row you haven't decided on yet, and tagging never auto-keeps. (Keep + Tag are common enough that we'll also show a one-click "Keep + tag as <Title>" option in the action bar when exactly one distinct Title is selected.)

## 3. Audience filter

- `AudienceEditorModal` + `audience-filters.ts`: new "Title tags" multi-select. Options come from the distinct set of tags currently on `outreach_leads.title_tags` (queried once when the modal opens).
- Match mode: ANY (lead has at least one of the selected tags). Future "ALL" toggle is easy to add but out of scope now.
- Persisted on the audience row alongside existing filters.

## 4. Out of scope (called out for later)

- No analytics dashboard per tag yet — tags are stored so we can slice send/open/reply stats later.
- No tag rename / merge UI. If a typo sneaks in we can fix in SQL.
- No global "tagged across all campuses" badge (you picked per-campus).
- Curated/normalized tag vocabulary — staying free-form for now.

## Files touched

- new migration: add `title_tags` to both tables + GIN index.
- `src/lib/faculty-triage.ts`: new `setTriageTags(id, tags)` + `bulkSetTriageTags(ids, addTags, removeTags)`; update `TriageRow` type; update `importKeptLeads` to carry tags forward (merge on conflict).
- `src/components/outreach/FacultyTriagePanel.tsx`: sort, selection, action bar, tag chips, updated counter.
- `src/lib/audience-filters.ts` + `src/components/outreach/AudienceEditorModal.tsx`: new `title_tags` filter, distinct-tag fetch helper.
- `src/integrations/supabase/types.ts`: regenerated after migration approval.

## Declutter note

You asked me to flag stale dashboard pieces on future turns. Logging that as a standing instruction — next time you send a screenshot I'll call out specific panels/cards from older iterations that look safe to remove.
