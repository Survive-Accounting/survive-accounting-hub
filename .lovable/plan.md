## Goal

Stop relying on the broad AI "clean professor research" flow that's been hallucinating names (Whitney Barton miss, fabricated rows). Replace it with a tight, per-campus, human-in-the-loop workflow:

1. Wipe the slate.
2. Scrape one campus's actual faculty/instructor page(s).
3. Show every scraped person as a triage row with PhD / CPA / Skip checkboxes.
4. Only the rows you approve get promoted into `outreach_leads` (the email queue).

## 1. Archive everything currently in the funnel

- Bulk-archive **all** `outreach_leads` (set `status='archived'`, stamp `sequence_stopped_at`, `sequence_stopped_reason='manual_reset_2026_06'`). Keep rows for history; the Email Queue / Campaign Builder already filters on `status`, so they disappear from the active UI.
- Bulk-archive all `campus_lead_suggestions` (set `archived_at=now()`, `archived_reason='manual_reset_2026_06'`, `archive_label='reset'`). Existing UI already hides archived suggestions.
- Also clear `outreach_campaign_leads` for any non-completed campaigns so the new approved leads start clean. Completed/sent history is preserved.

This is a one-shot SQL action triggered by a new red **"Archive all leads & start over"** button on the Campuses tab (with a typed-confirmation modal: "type ARCHIVE to continue").

## 2. New per-campus "Scrape faculty page" button

On each campus row in `CampusTable` (and inside `ApproveCampusModal`) add a **"Scrape faculty page"** button next to the existing research buttons. Behavior:

- Opens a small modal showing the URL it will scrape. It defaults to `campuses.faculty_page_url` (new column) or, if empty, asks the user to paste the URL(s). One textarea, one URL per line — supports the tabbed cases like Ole Miss where Faculty / Instructor / Staff are separate query strings.
- On submit, calls a new server function `scrapeCampusFaculty({ campusId, urls[] })` which:
  - Uses Firecrawl (`scrape` with `formats: ['markdown', 'links']`) on each URL — deterministic, no LLM guessing of names.
  - Follows obvious individual-profile links one level deep when the directory page only lists names (capped, e.g. 60 profile fetches per run, to keep cost bounded).
  - Runs a **single, narrow** Lovable AI Gateway call per page whose only job is to extract `{ first_name, last_name, title, email, profile_url }` rows **strictly from the provided markdown** — explicit "do not invent, do not pattern-guess emails, omit the row if no email and no profile URL is present in the source." No web search, no broad reasoning.
  - Inserts results into `campus_lead_suggestions` with `research_mode='faculty_scrape'`, `status='pending_triage'`, and `source_url` set to the exact page they came from.
- Returns a summary toast: "Scraped 3 pages, found 24 candidates."

If Firecrawl is not connected yet, the button surfaces a clear "Connect Firecrawl" message and we stop. (I'll wire the connector check in the same step.)

## 3. Triage table below the campus

New `FacultyTriagePanel` rendered on the Campuses tab when a campus is expanded (or inside `ApproveCampusModal` as a dedicated section). It lists every `campus_lead_suggestions` row for that campus where `archived_at IS NULL` and `research_mode='faculty_scrape'`.

Columns:

```text
Name | Title | Email | Source | [ ] PhD | [ ] CPA | ( ) Keep ( ) Skip | Notes
```

- PhD / CPA are independent checkboxes (write back to `is_phd`, `is_cpa`).
- Keep/Skip is a single status toggle: `pending_triage` → `kept` or `skipped`. Skipped rows stay archived-but-visible-on-toggle.
- A sticky footer button: **"Import N kept leads into Email Queue"** — disabled until at least one row is marked Keep.

Clicking Import promotes the kept suggestions into `outreach_leads` (only `status='new'`, `source='faculty_scrape'`, copy `email`, names, `department`, `is_phd`, `notes`, link `campus_id`/`school_id`). Duplicates by `(campus_id, lower(email))` are skipped silently. After import, the kept rows are marked `status='imported'` so they don't show up in triage again.

## 4. Demote the old "Clean professor research" flow

- The current `CleanProfessorResearchPanel` and `BatchResearchPanel` stay accessible inside the existing "Batch AI Research" modal but get an amber **"Legacy — known to hallucinate, prefer per-campus faculty scrape"** warning at the top.
- The home dashboard's primary CTA points at the new per-campus scrape flow instead of batch research.

## 5. Database changes (one migration)

- `ALTER TABLE campuses ADD COLUMN faculty_page_url text;` (nullable, stores the canonical URL the user pasted last time so the button is one-click next run).
- `ALTER TABLE campus_lead_suggestions` — extend the `status` value space to include `pending_triage`, `kept`, `skipped`, `imported`. No enum today (it's text), so no type change needed; just update the app-side allowed values.
- No grants needed (tables already exist with grants).

## 6. Out of scope (explicitly not doing this turn)

- No changes to SMS, campaigns, templates, or email sending logic.
- No change to BAP advisors / departments / alumni lead types — those cards remain "coming soon".
- Not deleting old data — only archiving — so nothing is permanently lost.

## Technical notes

- Firecrawl runs in a new `src/lib/faculty-scrape.functions.ts` server function gated by `requireSupabaseAuth` + admin role check. Lovable AI Gateway is used for the narrow extraction step (model: `google/gemini-2.5-flash`, temperature 0, JSON-mode).
- Archive action is a separate `archiveAllLeads` server function, admin-gated, doing the three `UPDATE`s in a single transaction.
- Triage panel uses the existing `campus_lead_suggestions` query patterns already in `LeadSuggestionsPanel.tsx` — reuses styling.
- No changes to `routeTree.gen.ts`; only existing routes are touched.

## Order of work once approved

1. Migration: add `faculty_page_url`.
2. Server functions: `archiveAllLeads`, `scrapeCampusFaculty`, `triagePatch`, `importKeptLeads`.
3. UI: red archive button + confirm modal, per-campus "Scrape faculty page" button + modal, `FacultyTriagePanel`, legacy warnings.
4. Manual verification on University of Mississippi: confirm Whitney Barton appears in triage after scraping `https://accountancy.olemiss.edu/about/faculty-and-staff/?role=instructor`.
