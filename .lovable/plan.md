## Quick answers first

- **Is the AI free?** No, but it's *cheap*. Lovable AI Gateway deducts from your credit balance. Each AI call on `google/gemini-3-flash-preview` (the model we already use for per-scrape suggestions) costs a fraction of a cent — a weekly verdict over 500 scrapes is well under 1 credit. You said you have an abundance, so this is comfortably in budget.
- **Cross-vertical applicability** — yes, this is real. A "WordPress directory with hidden mailto" pattern applies just as much to mid-market accounting firms, regional CPA partnerships, boutique investment banks, and law firms as it does to universities. We can have the AI explicitly tag which suggestions generalize and to which verticals.

## What you'll get

1. **Trends Dashboard** — a new tab under `/outreach` called "Scraper Trends" with:
   - Line charts (last 30 / 90 / 365 days): emails per scrape, success rate, cost per contact, host-fail rate, % runs needing pagination walker, % runs needing map fallback, avg duration.
   - Vertical lines on the chart marking "Fix Milestones" (e.g. "added JS-pagination walker — Dec 18").
   - Latest AI Verdict card at the top: a 1-paragraph summary of "what got better/worse this week, which fix did it, and what other verticals would benefit."

2. **Fix Milestones** — one-click "Mark fix shipped" button (also in the AI Suggestions panel — when you copy a suggestion and ship it, mark it). Stored in a new table so the chart and the AI can correlate metric changes to fixes.

3. **AI Verdicts** — periodic + on-demand rollup analysis. The AI gets the last 30 days of `scrape_debug_bundles`, all fix milestones in that window, and the recurring `scrape_improvement_suggestions`. It writes a verdict with three sections:
   - **What improved / regressed** (with metric deltas)
   - **Which fix moved the needle** (correlates milestones to metric changes)
   - **Cross-vertical applicability** (which fixes/patterns would help scraping accounting firms, investment banks, law firms, hospitals, consultancies, etc. — useful both for Survive Accounting student leads and for any future scraper you build)

4. **Cross-vertical tags on existing suggestions** — extend the per-scrape suggestion prompt to also output `applies_to_verticals: ["accounting_firms", "law_firms", ...]`, surfaced as little chips in the AI Suggestions panel.

## Defaults I'll use (push back if any are wrong)

- Verdict runs **on-demand only** via a "Generate verdict now" button. No cron — keeps credit spend predictable and you'll likely want to run it after batch scrape sessions anyway. Easy to add a weekly schedule later.
- Trends page is gated under `/outreach` and only visible to authenticated users (matches the rest of the outreach surface).
- Charts use Recharts (already installed in this project).
- The "Mark fix shipped" button lives in the AI Suggestions panel (one click on a suggestion to mark it shipped, optionally with a free-text note).

## Cost ballpark

- Per-scrape suggestion (already running): ~$0.0005 each.
- Verdict generation: ~$0.005–$0.01 each (larger context window over rolled-up bundles).
- Storage: negligible — JSONB payloads, capped per-page markdown.

## Technical details

**Migration (one migration, four objects):**

```sql
CREATE TABLE public.scraper_fix_milestones (
  id uuid pk,
  name text NOT NULL,
  description text,
  deployed_at timestamptz NOT NULL default now(),
  tags text[] default '{}',
  suggestion_id uuid references scrape_improvement_suggestions(id) on delete set null,
  created_at, updated_at
);

CREATE TABLE public.scraper_performance_verdicts (
  id uuid pk,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  model text,
  summary text,                -- 1-paragraph headline
  what_changed jsonb,          -- {improved:[{metric, delta_pct, note}], regressed:[...]}
  fix_attribution jsonb,       -- [{milestone_id, name, impact_summary, metric}]
  vertical_applicability jsonb,-- [{vertical, applicable_patterns:[...], notes}]
  metrics_snapshot jsonb,      -- aggregates the AI was given
  created_at
);

ALTER TABLE public.scrape_improvement_suggestions
  ADD COLUMN applies_to_verticals text[] default '{}',
  ADD COLUMN shipped_at timestamptz,
  ADD COLUMN milestone_id uuid references scraper_fix_milestones(id) on delete set null;
```

All four objects get the standard `authenticated` SELECT/INSERT/UPDATE/DELETE grants + RLS (matches your existing pattern).

**Server functions** (`src/lib/scraper-trends.functions.ts`):
- `getScraperTrends({ days })` → aggregates `scrape_debug_bundles` by day into a time-series shape suitable for Recharts. Also returns fix milestones in the window.
- `listFixMilestones()` / `createFixMilestone({ name, description, suggestionId?, tags? })` / `markSuggestionShipped({ suggestionId, milestoneId? })`.
- `generatePerformanceVerdict({ days })` → builds a compact rollup (daily aggregates + recurring patterns + recent milestones), calls Gemini Flash with a fixed prompt asking for the three sections above, stores in `scraper_performance_verdicts`.
- `listPerformanceVerdicts({ limit })` → for the dashboard card.

**UI:**
- New route: `src/routes/_authenticated/outreach/scraper-trends.tsx` — full dashboard page.
- Update `AiSuggestionsPanel`: show `applies_to_verticals` chips, add a "Mark shipped" inline button that creates a milestone.
- Update the per-scrape AI prompt in `src/lib/scrape-debug.server.ts` to also return `applies_to_verticals`.
- Add a sidebar link "Scraper Trends" under the outreach section.

**Out of scope (call out if you want them):**
- Running verdicts automatically on a cron (would need pg_cron + a public webhook route).
- Backfilling `applies_to_verticals` on existing suggestions (cheap re-analysis run, ~few credits).
- Charting per-campus trends (this plan ships workspace-wide trends only).