## Goal

While we're already pulling the faculty/department pages with Firecrawl, also detect which degree levels the accounting program offers — **Bachelors**, **Masters**, **PhD** — and store it on the campus so we can filter on it later (e.g. "MAcc schools only", "no PhD programs").

We get this almost for free because the markdown is already in memory during the scrape.

## How detection works

For each page Firecrawl returns during a scrape run, run a small regex pass over the combined markdown. Three independent boolean signals:

- **has_bachelors** — matches like `BBA`, `BSBA`, `B\.S\.? in Accounting`, `Bachelor of (Science|Business|Accountancy)`, `undergraduate (major|degree|program) in accounting`.
- **has_masters** — `MAcc`, `MAcy`, `MSA`, `MS in Accounting`, `Master of (Accountancy|Science in Accounting|Professional Accounting)`, `MBA … Accounting concentration`, `graduate (program|degree) in accounting`.
- **has_phd** — `Ph\.?D\.? in Accounting`, `Doctorate in Accounting`, `DBA … Accounting`, `doctoral program`.

Each match also captures a short snippet (±80 chars) so we can show the user *why* we flagged it.

Results from multiple scraped pages and multiple URLs in one run are OR-ed together at the campus level.

### Why regex first, not AI

The AI call already runs per page to extract faculty — adding another structured field to that prompt is the obvious "smarter" path, but:

1. Regex is deterministic, free, and instant.
2. Degree names are highly standardized in accounting departments.
3. We can always add an AI fallback later for the small set of campuses where regex finds nothing (see "Optional follow-up").

So step one is regex-only.

## Where it gets stored

Add three booleans + a JSON evidence blob to `campuses`:

```text
has_bachelors_accounting   boolean   default false
has_masters_accounting     boolean   default false
has_phd_accounting         boolean   default false
program_levels_evidence    jsonb              -- { bachelors: [snippets], masters: [...], phd: [...], detected_at, source_urls }
```

Update rule on each scrape run: **OR-merge** with existing values (never clear a `true` based on a single empty scrape — different pages cover different programs). `program_levels_evidence` is overwritten with the latest run's findings.

## UI surface

Small, low-noise additions only:

- **ApproveCampusModal header** — under the program shorthand row, a single line of compact chips: `BS · MAcc · PhD`. Detected levels are solid; undetected are faded. Tooltip on each chip shows the matched snippet.
- **Campus list/table** — wherever campuses are listed for triage, add a tiny `BS/MAcc/PhD` column rendered the same way. No filter UI yet — just the data — since the user said "useful later".

Nothing else changes in the scrape flow. Same button, same URL panel.

## Where it plugs in

In `src/lib/faculty-scrape.functions.ts`, both `scrapeCampusFaculty` and `autoDiscoverCampusFaculty` already loop scraped pages to feed the AI extractor. In that same loop:

1. Run `detectProgramLevels(markdown)` → `{ bachelors, masters, phd, evidence }`.
2. Accumulate across pages.
3. After the run finishes (and before returning), `UPDATE campuses SET has_*_accounting = existing OR detected, program_levels_evidence = {...} WHERE id = campusId`.

No new Firecrawl calls, no new AI calls, no new round trips.

## Technical details

- New file `src/lib/program-levels.ts` exporting `detectProgramLevels(markdown: string)` — pure function, fully unit-testable, no I/O.
- New migration adds the three boolean columns + jsonb column to `campuses` with defaults so existing rows are valid.
- Server function uses the existing authenticated supabase client to update `campuses` — no new RLS work since the table is already writable by the same callers.
- TypeScript types for `campuses` regenerate automatically from the migration; the modal and list read the new fields directly.

## Optional follow-up (not in this plan)

If after a week of runs we see campuses where regex misses (e.g. only a PDF catalog mentions the MAcc), add a one-shot AI classification on the merged markdown as a fallback — gated to only run when all three flags are still false after regex. Decide later based on real data.

## Files touched

- `supabase/migrations/<new>.sql` — add 4 columns to `campuses`.
- `src/lib/program-levels.ts` — new, regex detector.
- `src/lib/faculty-scrape.functions.ts` — call detector in both entry points, OR-merge, persist.
- `src/components/outreach/ApproveCampusModal.tsx` — chip row under shorthand.
- Campus list component (wherever the triage list lives) — small chip cell.
