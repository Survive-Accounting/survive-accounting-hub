# Drop overnight auto-import, keep manual flow with assists

Shifting back to a manual per-campus workflow. The overnight queue and the cron-driven auto-import are being archived. We add RMP URLs to the manual scrape, a faculty-URL assist, and a "reset leads" escape hatch.

## 1. Archive the overnight auto-import

**UI (`src/routes/outreach.leadfinder.$campusId.tsx`)**
- Delete the `OvernightAutoImportCard` block (lines ~235–238) and its component definition (~356–411).
- Delete `TestAutoScrapeButton` (~414–447) and its render at ~247.
- Drop the now-unused imports: `enqueueAllPendingCampuses`, `getFacultyBatchStatus`, `testAutoScrapeCampus`, `Sparkles`.
- Replace the now-empty "campus header actions" row with the new **Suggest faculty URLs** button (see §3) and keep the "Show / hide manual steps" toggle.

**Server**
- Delete `src/routes/api/public/hooks/faculty-overnight-batch.ts` (the cron hook).
- Delete `src/lib/faculty-overnight.functions.ts` and `src/lib/faculty-overnight.server.ts`.
- Migration: drop the existing `pg_cron` job (`SELECT cron.unschedule('faculty-overnight-batch')` — exact name to be confirmed by reading `cron.job` first).
- Migration: drop the two queue tables that only served the overnight worker: `outreach_faculty_batch_queue` and `outreach_faculty_batch_runs`. Nothing else references them (grep confirmed).

**Manual scrape stays intact**
- `ScrapeFacultyButton` + `FacultyTriagePanel` + the green "Import Leads" sticky bar all stay. That IS the manual flow now.

## 2. Add RMP URLs alongside faculty URLs

**Schema** (`campuses` migration)
- Add `rmp_page_url text` — stores one or more URLs (newline-separated, mirroring how `faculty_page_url` already works).

**Manual step UI**
- In `ScrapeFacultyButton` (or right next to it in the manual-steps strip), add a second URL input labeled **"RMP URLs"** plus a **"Scrape RMP"** button. Same UX as faculty: paste URLs → click scrape → results land in the triage panel as suggestions with `source = "rmp_scrape"`.
- RMP URLs are typically the school's professor listing (e.g. `ratemyprofessors.com/search/professors/1234?q=accounting`) or individual professor pages.

**Server: `src/lib/rmp-scrape.functions.ts` + `rmp-scrape.server.ts`**
- New server fn `scrapeRmpUrls({ campusId, urls })`:
  - For each URL, Firecrawl `scrape` with `formats: ['html', { type: 'json', prompt: '...' }]`.
  - Use Firecrawl `actions: [{ type: 'click', selector: 'button:has-text("Show More")' }, { type: 'wait', milliseconds: 1500 }]` repeated 5–10 times to expand the "Show More" pagination before extraction. If clicks fail (single-prof page), fall back to a plain scrape.
  - JSON extraction prompt: `Return an array "professors" of objects with { firstName, lastName, department, profileUrl, overallRating, numRatings, wouldTakeAgainPercent, levelOfDifficulty }`.
- Persist each prof as a `campus_lead_suggestions` row (existing table) with `research_mode = 'rmp_scrape'` and new fields stored in `notes` for now, plus 4 new columns added in the same migration on `campus_lead_suggestions`:
  - `rmp_rating numeric`, `rmp_num_ratings int`, `rmp_would_take_again numeric`, `rmp_difficulty numeric`, `rmp_profile_url text`.
- Also add the same five columns on `outreach_leads` so imported leads carry RMP data forward. The existing import path (`processOneCampus`-style logic in `ScrapeFacultyButton` import handler) copies these through.
- **Cross-reference**: when an RMP suggestion's `lower(first_name||' '||last_name)` matches an existing `outreach_leads` row for the same campus, update that lead's RMP columns directly instead of inserting a new suggestion. That way RMP enriches your already-imported faculty leads.

**Triage panel**
- Add 4 small columns to the triage table: ★ Rating, # Ratings, % Again, Difficulty. Sortable. (`FacultyTriagePanel` — read existing columns and append.)

> Realistic caveat about "Show More": RMP gates results behind JS pagination and sometimes a Cloudflare interstitial. The click-loop usually works for the school search URL, but if Firecrawl can't expand past N profs we'll see it on the first test. Plan B is to paste individual professor URLs (each one is a clean scrape). The new field accepts both shapes.

## 3. Faster faculty URL discovery (assist, not auto)

Repurpose the existing `autoDiscoverCampusFaculty` discovery path as a **manual assist**.

- New tiny server fn `suggestFacultyUrls({ campusId })` — pure discovery, no scraping (mirrors what `testAutoScrapeCampus` did but without saving anything to the campus row).
- New **"Suggest faculty URLs"** button in the campus header row.
- On click → modal with the ranked candidate URLs + checkboxes + a "Use selected" button that prepends them into the faculty-URL textarea in `ScrapeFacultyButton`. Lee picks, edits, then runs the manual scrape as usual.

Same flow added next to the new RMP input: **"Suggest RMP URLs"** runs `firecrawl.search("site:ratemyprofessors.com {campus_name} accounting")` and offers the top 5 to drop in.

## 4. Reset leads at campus

New button **"Reset campus leads"** in the campus header (destructive styling, behind a confirm dialog).

Server fn `resetCampusLeads({ campusId })` (admin-only):
- `DELETE FROM outreach_leads WHERE campus_id = $1 AND source IN ('faculty_scrape','rmp_scrape')` — preserves any manually-added leads with other sources.
- `UPDATE campus_lead_suggestions SET archived_at = NULL, archive_label = NULL, archive_reason = NULL, status = 'pending', title_tags = '{}' WHERE campus_id = $1 AND research_mode IN ('faculty_scrape','rmp_scrape')` — actually we delete instead, so the triage list is fully empty for a fresh attempt: `DELETE FROM campus_lead_suggestions WHERE campus_id = $1 AND research_mode IN ('faculty_scrape','rmp_scrape')`.
- Returns `{ leadsDeleted, suggestionsDeleted }`.

Confirm dialog text shows the counts about to be wiped before the user proceeds.

## 5. Testing flow

1. Approve migration (drop queue tables, drop cron, add `rmp_page_url` on campuses, add RMP columns on suggestions + leads).
2. Pick Troy. Hit **Suggest faculty URLs** → pick 1–2 → Scrape faculty (manual). Verify leads land in triage.
3. Paste a Troy RMP school URL → **Scrape RMP** → confirm Show-More click loop pulled >20 profs and that name matches updated existing leads' RMP columns.
4. Hit **Reset campus leads** → confirm everything for Troy is gone → re-scrape to verify the cycle works.

## Out of scope

- Backfilling RMP on already-imported leads from other campuses (we'll do that ad-hoc per campus).
- Scheduled re-checks of RMP scores.
- Per-rating tag extraction ("tough grader" etc.).

## Open questions

- For "reset", should we also clear leads with `source = 'manual'` or other sources? Current plan preserves them. Confirm.
- RMP URL field: store as newline-separated text like `faculty_page_url`, or as a structured `text[]`? Plan uses text for consistency with the existing pattern.
