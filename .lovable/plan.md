## Goal

Stand up the database tonight to support a Greek Orgs side of Lead Finder. No new UI tabs or scraping yet — that comes in Phase 2 once you've slept on it. We reuse the existing `campus_lead_suggestions` / `outreach_leads` pipeline so the triage UI, audiences, and campaigns all work for chapter officers as soon as the scraper lands.

## What gets built

### 1. New tables

**`greek_orgs`** — national org master list (one row per Greek-letter org, not per chapter).

- `name` ("Sigma Alpha Epsilon")
- `nickname` ("SAE")
- `letters` ("ΣΑΕ")
- `org_type` enum: `fraternity` | `sorority` (NPHC sororities are still sororities)
- `council` enum: `IFC` | `NIC` | `NPC` | `NPHC` | `MGC` | `local` | `other`
- `national_website`, `founded_year`
- `is_active` flag (lets us suppress dormant orgs without deleting)
- Unique on lower(name)

**`campus_greek_chapters`** — per-campus chapter instance (this is the row we scrape exec pages for).

- `campus_id` → `campuses`
- `greek_org_id` → `greek_orgs` (nullable; allow "unrecognized local" rows)
- `chapter_designation` ("Alpha Beta", "Theta Eta")
- `chapter_url` (chapter's own site, e.g. `sae.indiana.edu`)
- `exec_page_url` (the officers/exec board page — what the scraper hits)
- `status` enum: `active` | `inactive` | `suspended` | `unknown`
- `discovery_source` text ("manual" | "campus_greek_page" | "ai_search")
- `notes`, `archived_at`
- Unique on `(campus_id, greek_org_id, chapter_designation)` so re-scrapes are idempotent
- Helpful index on `(campus_id) WHERE archived_at IS NULL`

### 2. Extend the existing lead pipeline

Add to **both** `campus_lead_suggestions` and `outreach_leads`:

- `chapter_id uuid` → `campus_greek_chapters` (nullable; null = faculty lead)
- `position text` (e.g. "President", "Academic Chair", "Treasurer")
- `term text` (e.g. "Spring 2026")

`research_mode` already exists on `campus_lead_suggestions` — Greek scrapes will write `'greek_scrape'`. No new triage table needed. Tags like `Intro Target` keep working; you can layer on `Exec Target` later.

### 3. Seed data

Pre-populate `greek_orgs` with the well-known national orgs so the scraper can match chapter rosters to known orgs out of the box:

- **NPC** (Panhellenic sororities) — all 26 (Alpha Chi Omega … Zeta Tau Alpha)
- **NIC** (mainstream fraternities) — ~50 active members (SAE, Sigma Chi, Phi Delt, Pike, ATO, etc.)
- **NPHC** — the Divine 9 (Alphas, Kappas, Omegas, Sigmas, Iotas / AKA, Deltas, Zetas, SGRho)
- **MGC** — top ~15 multicultural orgs (Lambda Theta Phi, Sigma Lambda Beta, Lambda Theta Alpha, Sigma Lambda Gamma, etc.)

Roughly 100 seed rows. Unknown/local orgs get inserted with `greek_org_id = null` at scrape time.

### 4. RLS

Both new tables: admin-only writes/reads via the same `has_role('admin', auth.uid())` pattern the rest of `outreach_*` uses. `service_role` full access for server fns. No `anon` grant.

## Phase 2 (NOT in tonight's plan — for reference)

Once schema is in:

1. **Discovery scrape** — for each of the 170 campuses, Firecrawl `search` "fraternity sorority life $campus", then AI-extract chapters → upserts `campus_greek_chapters`. Mirrors `faculty-scrape.functions.ts`.
2. **Per-chapter exec scrape** — copy of `ScrapeFacultyButton` flow, scoped to a chapter row; pulls president / VP / academic chair / scholarship / treasurer / finance chair into `campus_lead_suggestions` with `chapter_id` set.
3. **Lead Finder UI** — `/outreach/leadfinder` grows a `Faculty | Greek` tab toggle. Greek tab navigates campus → chapter → triage. Reuses `FacultyTriagePanel` with a chapter filter.
4. **Overnight batch** — clone of `outreach_faculty_batch_queue` + worker for chapters.

## Technical details

Schema lives in one migration:

```text
0021_greek_orgs.sql
├── CREATE TYPE greek_council, greek_org_type, greek_chapter_status
├── CREATE TABLE greek_orgs (+ GRANT + RLS + admin policy)
├── CREATE TABLE campus_greek_chapters (+ GRANT + RLS + admin policy)
├── ALTER TABLE campus_lead_suggestions
│     ADD COLUMN chapter_id, position, term
├── ALTER TABLE outreach_leads
│     ADD COLUMN chapter_id, position, term
├── updated_at triggers on both new tables
└── INSERT INTO greek_orgs (~100 seed rows: NPC, NIC, NPHC, MGC)
```

`set_updated_at()` already exists — reuse it for the trigger.

No code changes ship tonight. After approval and the types regen, Phase 2 PRs can import the new tables immediately.

## Out of scope tonight

- Discovery / exec scraping (Phase 2)
- Lead Finder Greek tab UI (Phase 2)
- Overnight batch automation (Phase 3)
- Beta Alpha Psi / professional/honor accounting orgs (separate effort — you said skip)
- Editing the faculty pipeline behavior
