## Problem

Many university directories render only the first page server-side and load pages 2+ via JavaScript without changing the URL (IU Kelley Accounting: 10 of ~70 profs scraped). Firecrawl's default single-shot scrape misses everything past page 1.

This is a generic pattern — Drupal Views, WordPress admin-ajax, custom XHR tables, "Load more" buttons, infinite scroll — not IU-specific. Fixing it lifts reliability across every school using a CMS-driven directory.

## Approach (three layers, generic)

### 1. Pagination detector
After the initial scrape of a `facultyUrl`, inspect the returned HTML/markdown for any of these signals:
- Pagination controls: `.pagination`, `[aria-label*="page" i]`, `a[rel="next"]`, buttons with text `Next`, `›`, `»`, or numeric `1 2 3 …`
- "Load more" / "Show more" buttons
- Inline JS referencing `?page=`, `&p=`, `chunk.php`, `admin-ajax.php`, `/api/`, `wp-json`
- Result count vs. card count mismatch (e.g. page text says "Showing 1–10 of 67")

If any signal fires AND extracted-prof count is below a threshold (default 15), mark the URL as `paginated: true` and trigger the page-walker.

### 2. Firecrawl `actions` page-walker (primary)
Re-scrape the same URL with Firecrawl `actions`:
```
[
  { type: 'scrape' },
  { type: 'click', selector: '.pagination a:has-text("Next"), a[rel="next"], button:has-text("Load more")' },
  { type: 'wait', milliseconds: 1500 },
  { type: 'scrape' },
  ... (repeat up to MAX_PAGES = 10)
]
```
Concatenate the HTML from each `scrape` step, then run the existing extractor over the combined HTML. Stop early when:
- Click selector not found
- Two consecutive pages produce zero new email addresses
- Hit `MAX_PAGES` cap

### 3. Sitemap/map fallback (backup, already partially in place)
If actions yield < 5 new profs OR the click selector never matches, run `firecrawl.map(rootDomain, { search: '<dept> faculty profile', limit: 200 })` and filter results to URL patterns matching the seed (`profile.html?id=`, `/people/`, `/faculty/`, `/directory/`). Enqueue those as individual profile fetches. This is the IU-style escape hatch: even when JS pagination is unscrapable, profile-detail URLs are usually static and discoverable via sitemap.

## Wiring into existing system

- **`src/lib/faculty-scrape.functions.ts`**: After the first `firecrawlScrape` of each `facultyUrl`, run `detectPagination(html)`. If positive, call new `scrapeWithActionsPagination(url, maxPages)` and feed combined HTML back into the existing extractor. Track `pagesWalked`, `actionsUsed`, and any click-selector miss in the per-URL debug record.
- **`src/lib/auto-scrape.functions.ts`**: No change to URL discovery; the detector runs after fetch.
- **`FacultyTriagePanel.tsx`**: Show a small "paginated (Np)" badge on rows whose source URL used the walker, so you can verify it's firing.
- **Scrape Metrics**: Add counters — `paginated_urls_detected`, `pages_walked_total`, `pagination_fallback_to_map`. These prove the fix is active across schools, not just IU.

## Cost & safety

- Firecrawl `actions` costs ~1 credit per `scrape` step. Capping at `MAX_PAGES = 10` means worst case +10 credits per directory; typical case (3–4 real pages) +3–4.
- Detector is HTML-only, no extra fetch.
- `MAX_PAGES` and the click-selector list are constants at the top of the file for easy tuning.

## Expected outcome on IU Kelley Accounting

- Detector fires: pagination controls present, only 10 extracted of "Showing 1–10 of 67"
- Walker clicks `Next` 6 times → combined HTML contains all 7 page snapshots → extractor pulls ~67 profs
- Total cost: ~7 Firecrawl credits for that URL instead of 1, vs. ~60 profs missed

## Files to edit

- `src/lib/faculty-scrape.functions.ts` — add `detectPagination`, `scrapeWithActionsPagination`, wire into the per-URL loop
- `src/components/outreach/FacultyTriagePanel.tsx` — paginated badge
- `src/components/outreach/ScrapeMetricsPanel.tsx` — three new counters

No DB migration, no schema change, no new dependency (Firecrawl SDK already supports `actions`).
