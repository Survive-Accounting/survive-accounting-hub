# Campus Stats — Clarity Fixes + Drill-Down Report

Three changes to the Campuses → Analyze Campus Leads panel. No backend schema changes; this is presentation + a new modal.

## 1. Coverage denominator: exclude archived campuses

Current behavior: "Coverage 4 / 455 campuses" uses the full `campuses` list, which includes 285 archived rows (verified: 455 total, 170 active where `archived_at IS NULL`).

Fix: in `aggregateCampusLeadStats` (`src/lib/outreach-api.ts`), set `totalCampusCount` to the count of campuses where `archived_at == null`. The headline will then read **"4 / 170 active campuses"**. Label updated in `CampusLeadsStatsPanel.tsx`.

## 2. Inline explanations for confusing metrics

Add small `?` info tooltips (using existing `Tooltip` primitive) on three tiles + the headline:

- **Course sections** — "A course section is one scheduled offering of a class for a specific term (e.g. ACCT 201 Section 03, Fall 2024). One professor teaching two sections of intro accounting in the same term = 2 sections. Pulled from each campus's class schedule by AI research. Currently 11,416 sections across 9 course families."
- **Textbook match only** (filter label) — "Restricts to campuses where AI research found a confirmed adopted textbook (ISBN13) for at least one of the four course families. Today only a handful of campuses have textbook ISBNs stored, which is why this filter shrinks the list so aggressively. It does NOT check whether a specific lead teaches a course that uses our supported textbooks."
- **Suggested leads** — "Distinct rows in `campus_lead_suggestions` matching the filters — people AI research surfaced as likely professors/staff for the four core accounting course families. Not yet imported into the outreach queue."
- **Imported outreach leads** — "Suggested leads that have been promoted into `outreach_leads` and are eligible for campaign enrollment."

This addresses the user's "are we sure textbook match is working correctly?" — it is working, but the rule is "campus has any textbook ISBN on file", not "lead's course matches our books". The tooltip makes that explicit.

## 3. New "View detailed report" modal

A new button next to "AI Research Settings" in the panel header: **"View detailed report"** (opens when the panel is expanded). Opens a large dialog (`max-w-6xl`) titled "Campus Leads Report" with the active filter summary at the top and three tabs:

**Tab 1 — Campuses** (covered by current filters)
- Columns: Campus · State · # Suggested leads · # Imported leads · # Sections · Has textbook ISBN (Y/N) · Last researched
- Sortable by lead count / section count. Row click → filters the parent panel to that single campus.

**Tab 2 — Leads** (filtered `campus_lead_suggestions`)
- Columns: Name · Title · Email · Campus · Confidence · PhD · CPA · Teaches (I1/I2/IA1/IA2 chips) · Source URL · Imported? (Y/N)
- Paginated 50/page; total count shown.

**Tab 3 — Course sections** (filtered `campus_course_sections`)
- Columns: Campus · Family · Course code · Title · Term · Section · Instructor · Enrollment · Source URL
- Paginated 50/page; total count shown. Grouping toggle: "Group by campus" / "Group by family".

Each tab has a "Download CSV" button that exports the filtered rows for that tab.

The modal reads from the same already-fetched arrays the stats panel uses (no extra queries) — `fetchCampusLeadStats` will be extended to also return `filteredLeads`, `filteredSections`, and a `perCampus` enriched list, behind a new `includeDetail: true` option so the existing summary path stays lean. The modal calls a sibling `fetchCampusLeadReport(filters, campuses)` that reuses the same row-collection + filter helpers and returns the detailed arrays.

## Technical notes

Files touched:
- `src/lib/outreach-api.ts` — fix `totalCampusCount` (exclude archived), add `fetchCampusLeadReport` reusing existing fetch + filter helpers.
- `src/components/outreach/CampusLeadsStatsPanel.tsx` — add tooltips, "View detailed report" button, modal trigger; update coverage label to "active campuses".
- `src/components/outreach/CampusLeadsReportModal.tsx` — new file: dialog + tabs + tables + CSV export.

Not changed: filter bar, batch research, campaign builder, email sending.

## Open question

For the Campuses tab table itself (separate from this panel), should archived campuses also be hidden by default? Today the bottom table appears to include them. Out of scope for this change unless you say yes — flag it for a follow-up.
