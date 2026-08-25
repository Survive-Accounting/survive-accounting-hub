# Greek 990 / Legal-Entity Intelligence — Existing System Audit

_Branch: `overnight/greek-990-sec-pilot` (worktree `sa-greek-990`, off `main` @ 515d1e53). Live project `unvxagsledbsdoremqeb`._

Written before creating anything, per the build brief §1. Purpose: reuse what
exists, avoid a second canonical chapter system, and scope exactly what is new.

## 1. Canonical Greek / campus data (READ-ONLY for this project)

| Table | Rows | Role |
|---|---:|---|
| `campuses` | 1013 | Canonical campus. Has `name`, `canonical_name`, `display_name`, `aliases` (jsonb), `city`, `state`, `slug`. All 16 SEC campuses resolve cleanly. |
| `campus_greek_chapters` | 4421 | **THE canonical chapter roster.** One row per (campus, org). Rich: `council`, `letters`, `chapter_designation`, `greek_org_id`, plus flat 990 fields (see §3). |
| `greek_orgs` | 205 | National organizations. `name`, `letters`, `nickname`, `council`, `org_type` (fraternity/sorority/professional/null), `ein`, `propublica_url`, `housing_entity`. |
| `greek_chapters` | 5 | Shell "claim/seat" chapters for the rep/seat product — **not** the roster. Do not confuse with `campus_greek_chapters`. |
| `campus_council_contacts` | 754 | IFC/Panhellenic/NPHC/MGC office contacts (name/role/email/phone/instagram + provenance). The distribution touchpoint. |

**SEC universe (16 campuses):** 862 active social chapters — 374 IFC, 228
Panhellenic, 137 NPHC, 99 MGC (+ case variants). 857 have `letters`, 862 have a
`greek_org_id`, **127** have a `chapter_designation`, and only **4** have an EIN.
So EIN discovery is essentially undone — exactly the gap this project targets.

Council values are free text with case drift (`IFC`/`ifc`, `MGC`/`mgc`) — must
be compared case-insensitively (matches the existing `councilMatches()` law in
memory). All four councils are social; the only non-social marker is
`greek_orgs.org_type = 'professional'` (4 orgs).

## 2. Prior 990 / ProPublica system (REUSE — do not duplicate)

A **working but manual** enrichment system already exists, keyed on the national
`greek_orgs` row with an optional `chapter_id`:

| Table | Rows | Notes |
|---|---:|---|
| `greek_org_propublica_cache` | 6 | `ein` → full ProPublica JSON `response`, `fetched_at`. **One API call per EIN, cached.** Reuse as-is. |
| `greek_org_filings` | 34 | Financials keyed by `chapter_id` + `org_id` + `tax_year`. revenue/expenses/assets_eoy/liabilities_eoy + itemized (salaries, contributions, mortgages…) + `object_id`, `pdf_url`, `source`. |
| `greek_org_people` | 28 | Officers/directors. `person_name`, `titles[]`, `years[]`, `first_year`/`last_year`, `is_current`, `source='propublica_officers'`. Good historical model — reuse the shape. |

Driver code:
- `src/lib/greek-orgs.functions.ts` — `enrichGreekOrgFilings`: takes a **hand-pasted** EIN/ProPublica URL per chapter, fetches ProPublica API v2
  (`/nonprofits/api/v2/organizations/{ein}.json`, cached), maps `filings_with_data`
  → `greek_org_filings`, scrapes the org HTML page for per-year `/full` `object_id`s
  (`fetchObjectIds`), and writes flat `ein`/`address`/`propublica_url` onto the chapter.
- `src/routes/outreach.greek-orgs_.people-queue.tsx` — a VA **hand-copies** officers
  from the ProPublica `/full` render into `greek_org_people`.

**Reusable primitives:** `extractEin()`, the ProPublica API v2 endpoint + cache
table, `fetchObjectIds()`, and the `filings_with_data` field mapping
(`totrevenue`, `totfuncexpns`, `totassetsend`, `totliabend`, …).

## 3. Flat 990 fields already on the roster (LEGACY — superseded, not removed)

`campus_greek_chapters` carries flat `ein`, `address`, `propublica_url`,
`house_corp_name`, `house_corp_990_url`, `advisor_name`, `advisor_notes`,
`enrichment_status`. `greek_orgs` carries `ein`, `propublica_url`,
`housing_entity`. These encode **one chapter = one EIN**, which the brief (§4)
explicitly forbids: a chapter has *many* legal entities (undergrad, house corp,
foundation, national parent). We leave these columns untouched (the manual UI
still uses them) but treat the new normalized model as the source of truth.

## 4. Provenance / research-status / growth models (patterns to mirror)

- **Provenance** is done per-row inline everywhere: `source_url`, `source_type`,
  `confidence`, `retrieved_at`, `last_verified_at`, `needs_verification`
  (`campus_council_contacts`, `greek_chapter_contacts`). New tables follow this.
- **Research status / resumable jobs**: `campus_research_jobs` +
  `campus_research_job_items` (status/current_step/retries/error/started_at) and
  `growth_discovery_runs` + `growth_discovery_status`. New per-chapter status
  table mirrors this shape (NOT_RUN…COMPLETE/FAILED/STALE).
- **Growth stakeholder graph**: `growth_contacts` / `growth_contact_roles` /
  `growth_public_contacts` / `growth_outreach_events` (all present, mostly empty).
  The 990 alumni-governance layer feeds this later; we do **not** write into it
  tonight (no student-contact duplication, no outreach).

## 5. What is NEW in this project (additive only)

No EO BMF, group-exemption, entity-type classification, many-to-many
chapter↔entity link, match-confidence, review-queue, or automatic officer
extraction exists. This project adds, all namespaced `greek_990_*` / `greek_legal_entity`:

1. `greek_legal_entity` — canonical nonprofit (1 row per EIN) with **entity_type**
   (LOCAL_CHAPTER / HOUSE_CORPORATION / FOUNDATION / NATIONAL_PARENT / …),
   BMF identity (subsection, NTEE, affiliation, GEN, parent, ruling date).
2. `greek_chapter_legal_entity` — **M:N** link with `relationship_type`,
   `match_confidence`, `match_method`, evidence + provenance.
3. `greek_990_filing` — filings keyed by `legal_entity_id` (990/990-EZ/990-N,
   `rich_filing_available`).
4. `greek_990_officer` — officers/directors, **historical** (years[]), stakeholder
   class, keyed by `legal_entity_id`.
5. `greek_990_entity_candidate` — scored candidates for the review queue.
6. `greek_chapter_990_status` — per-chapter research status.

**Reuses** `greek_org_propublica_cache` (shared EIN cache) and the ProPublica
client logic (lifted into `scripts/greek-990/lib/`). **Does not** alter the
existing `greek_org_*` tables or the manual UI. **Does not** create a second
chapter roster — everything links to `campus_greek_chapters.id`.

## 6. Access & tooling

- DB reads/writes: PostgREST + `SUPABASE_SERVICE_ROLE_KEY`.
- DDL: Supabase Management API + `SUPABASETOKEN` (via `migration/supabase-migrations/run_sql.ts`, dry-run by default).
- Secrets pulled to `.env` / `.env.vercel` (gitignored). Bun 1.3.14.
- All new code under `scripts/greek-990/`; source caches under `data/greek-990/`; outputs under `greek-990-output/`.
