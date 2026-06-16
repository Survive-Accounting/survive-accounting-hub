# Campuses Tab — Stats & Cleanup

## 1. Move Batch AI Research out of the main view

- Remove `<BatchResearchPanel />` from the top of the Campuses tab.
- Add a small header row at the top of the Campuses tab with:
  - Left: a toggle button **"Analyze Campus Leads"** (chevron icon, shows/hides the stats panel below it).
  - Right: a gear/settings icon button that opens a modal containing the existing `BatchResearchPanel` (no behavior changes inside — just wrapped in a `Dialog`).
- Result: the campus table area stays clean; AI batch tooling is one click away but no longer dominates.

## 2. New `CampusLeadsStatsPanel` component

Collapsible panel (closed by default; state persisted in `localStorage`) that opens beneath the toggle. Contains a **shared filter bar** + **stat tiles**.

### Filter bar (reusable — extracted so the future campaign builder can import it)

New file: `src/components/outreach/filters/LeadFilterBar.tsx` exporting:
- `LeadFilterBar` component
- `LeadFilters` type: `{ courseFamilies: string[]; seasons: string[]; campusIds: string[]; teachingOnly: boolean; minConfidence: number }`
- `useLeadFilters()` hook with default = all-selected

Controls (all multi-select with "Select all / Clear" actions, default = all):
- **Course family** — Intro 1, Intro 2, Intermediate 1, Intermediate 2 (the 4 with dedicated `teaches_*` columns). "Show all 9 families" advanced toggle later.
- **Season / term** — derived from distinct `term` values on `campus_course_sections` grouped into Fall / Spring / Summer / Winter + year picker.
- **Campus** — searchable multi-select chip picker (defaults to all; "Clear" empties; "All" restores).
- **Confidence** — slider 0–1 (default 0.0) for lead confidence.
- **Teaching-evidence only** — switch (default off) limits to leads with at least one `teaches_*` flag true.

### Stat tiles (top row, primary headline)

> **"X high-confidence leads across Y campuses with Z course sections found"** — single sentence headline driven by current filters.

Then a tight grid of small tiles:

| Tile | Source |
|---|---|
| Total leads (matching filters) | `campus_lead_suggestions` count |
| High-confidence leads (≥ 0.8) | same, filtered |
| Campuses covered | distinct `campus_id` |
| Course sections found | `campus_course_sections` count |
| Sections by season | mini bar (Fall/Spring/Summer) |
| Leads by family | mini bar: Intro1 / Intro2 / IA1 / IA2 |
| PhDs / CPAs | counts of `is_phd`, `is_cpa` |
| Top 5 campuses by lead count | small ranked list with campus name + count |
| Avg sections per campus | sections / campuses covered |
| Coverage | campuses with ≥1 lead ÷ total campuses (progress bar) |

All tiles re-compute reactively against the filter state.

### Suggested extras (slick, low-effort)

- **"New since last batch"** badge — count of leads created in last 24h (uses `created_at`).
- **Export filtered → CSV** button (leads only, current filter state).
- **Click a tile → drills down**: e.g., clicking "Intro 1" sets family filter to Intro 1 only; clicking a campus row pre-filters campus + opens its drawer.

## 3. Data layer

Add to `src/lib/outreach-api.ts`:
- `fetchLeadStats(filters: LeadFilters)` — one query per source table, aggregated client-side (volumes are small: ~5k leads, ~10k sections). Returns the shape consumed by `CampusLeadsStatsPanel`.
- `fetchAvailableTerms()` — distinct terms for the season filter.

Wrap each in `useQuery` with `queryKey: ['lead-stats', filters]` and `staleTime: 60s`.

## 4. Files touched / created

**Created**
- `src/components/outreach/CampusLeadsStatsPanel.tsx`
- `src/components/outreach/filters/LeadFilterBar.tsx` (reusable)
- `src/components/outreach/BatchResearchSettingsModal.tsx` (thin Dialog wrapper around existing `BatchResearchPanel`)

**Edited**
- `src/routes/outreach.tsx` — replace `<BatchResearchPanel />` block with new header row (toggle + settings icon) + `<CampusLeadsStatsPanel />` collapsible.
- `src/lib/outreach-api.ts` — add stats fetchers.

**Unchanged**
- `BatchResearchPanel.tsx` — reused as-is inside the new modal.
- `CampusTable.tsx`, `LeadsPanel.tsx` — untouched.

## 5. Visual / UX notes

- Toggle button uses outline variant + chevron that rotates open.
- Panel uses `Collapsible` from `@/components/ui/collapsible` with a subtle bordered card; muted background so it doesn't compete with the table.
- Tiles use `Card` with single-line label + large number + tiny delta/sparkline where useful.
- Filter bar sticky inside the panel when scrolled.
- Mobile: tiles wrap into 2 cols; filter bar collapses into a "Filters" popover.

## 6. Out of scope (callouts for future turns)

- Saving filter presets to `outreach_saved_views` (existing table) — easy follow-up; reuse same `LeadFilters` type.
- Wiring `LeadFilterBar` into the campaign builder you mentioned — same component, drop in.