# Final Dashboard Integration Handoff — Greek Legal / 990

_2026-08-25 · live project `unvxagsledbsdoremqeb` · branch merged to `main` (commit `5cac7864`) and
deployed to production. Read-only handoff — no new discovery, no officer harvesting, no outreach._

**One rule above all:** this is **ACCOUNT CONTEXT / ESCALATION RESERVE**, never a student
first-touch contact list. 990 people are **LATEST 990-REPORTED (TYxxxx)**, never "current."

---

## 0. Tables (all `public`, RLS deny-by-default → read server-side with the service role)

| Table | Rows | Grain | Role |
|---|---:|---|---|
| `greek_legal_entity` | 3,462 | 1 per EIN | The nonprofit entity (house corp / local / foundation / alumni / national parent). |
| `greek_chapter_legal_entity` | 7,160 | 1 per (chapter, entity) | **M:N link** — typed, scored, provenanced. |
| `greek_990_filing` | 14,499 (12,406 rich) | 1 per (entity, tax_year, form) | Financials + filing history. |
| `greek_990_officer` | 621 | 1 per (entity, person, title) | Officers/directors, historical `years[]`. |
| `greek_990_entity_candidate` | 40,911 | 1 per (chapter, candidate EIN) | Review queue backing — **admin only, do NOT render in the drawer.** |
| `greek_chapter_990_status` | 4,712 | 1 per chapter | Research status. |

**Canonical chapter key:** `campus_greek_chapters.id` (the existing roster — this project only
*references* it, never writes it). **Entity key:** `greek_legal_entity.id`. **Natural key:** `ein`.

Precomputed per-chapter rollup already exists as a file: `GREEK_990_CHAPTER_AGGREGATES.json`
(one row per chapter, the dashboard fields below). Use it for a fast first cut, or query live.

---

## 1. Chapter drawer contract

Given a `chapter_id` (= `campus_greek_chapters.id`), the drawer's 990 section reads:

### 1a. Entities linked to this chapter
```sql
select le.id, le.ein, le.legal_name, le.entity_type, le.city, le.state,
       le.group_exemption_number, l.match_confidence, l.match_method, l.match_evidence
from greek_chapter_legal_entity l
join greek_legal_entity le on le.id = l.legal_entity_id
where l.chapter_id = $1
  and l.match_confidence = 'HIGH_CONFIDENCE';       -- only auto-linked; MEDIUM lives in the review queue
```
Split the result: **chapter-specific** entities (`entity_type <> 'NATIONAL_PARENT'`) vs the
national parent (show separately / de-emphasised — see §6).

| Drawer field | Source |
|---|---|
| **Legal entities** (list) | rows above where `entity_type <> 'NATIONAL_PARENT'`; show `legal_name`, `entity_type`, `ein` |
| **House corporation present** | `EXISTS` a linked entity with `entity_type IN ('HOUSE_CORPORATION','PROPERTY_HOLDING_ENTITY')` |
| **Alumni corporation present** | `entity_type = 'ALUMNI_CORPORATION'` |
| **Foundation present** | `entity_type IN ('EDUCATIONAL_FOUNDATION','SCHOLARSHIP_FOUNDATION')` |
| **Entity name** | `greek_legal_entity.legal_name` |
| **Entity type** | `greek_legal_entity.entity_type` |
| **Source / filing** | link: `greek_chapter_legal_entity.match_method` + `match_evidence`; filing: `greek_990_filing.source` (`PROPUBLICA_API` / `IRS_990_XML`) + `form_type` + `tax_year` |
| **Latest filing year** | see §3 |
| **Revenue / Expenses / Assets** | see §3 |
| **Governance strength** | derived (§5 of the aggregate) — `STRONG / MODERATE / LIGHT / UNKNOWN` |
| **Latest 990-reported stakeholder** | see §5 |
| **Stakeholder role** | `greek_990_officer.normalized_title` (preserve `title_as_reported` on hover) |

### 1b. Recommended view (OPTIONAL — not yet created; no migration applied in this handoff)
A convenience view the dashboard team may add later (documented, not applied):
```sql
create view greek_chapter_990_summary as
select cle.chapter_id,
  count(distinct le.id) filter (where le.entity_type <> 'NATIONAL_PARENT') as legal_entity_count,
  bool_or(le.entity_type in ('HOUSE_CORPORATION','PROPERTY_HOLDING_ENTITY'))  as house_corp_present,
  bool_or(le.entity_type in ('EDUCATIONAL_FOUNDATION','SCHOLARSHIP_FOUNDATION')) as foundation_present,
  bool_or(le.entity_type = 'ALUMNI_CORPORATION')                              as alumni_corp_present,
  bool_or(le.entity_type = 'NATIONAL_PARENT')                                 as national_parent_present
from greek_chapter_legal_entity cle
join greek_legal_entity le on le.id = cle.legal_entity_id
where cle.match_confidence = 'HIGH_CONFIDENCE'
group by cle.chapter_id;
```

---

## 2. Contact / context distinction (labelling)

Every 990 person **MUST** render as advisory context, never as a live role:

- **Correct:** `990 CONTEXT · House Corporation President · TY2023`
  (badge `990 CONTEXT` + `normalized_title` + `TY` + the officer's `latest_filing_year`).
- **Forbidden:** "Current Chapter President", "Chapter President", or any label implying the person
  holds the role now.

Build the label from: `"990 CONTEXT · " || normalized_title || " · TY" || latest_filing_year`.
The pre-built `primary_latest_990_stakeholder.source` field already reads
`"LATEST 990-REPORTED (TY2023)"` — use it verbatim.

**Outreach-queue eligibility.** Default: **nothing from the 990 layer enters a first-touch queue.**
It is escalation/advisory context. If and when an outreach path is built, only the **primary
governing stakeholder** (house-corp / foundation / alumni-corp president or treasurer — §5) may be
eligible, and only for an **advisory / escalation** track, **gated behind demonstrated student
demand** (free Exam 1 → usage → academic chair → exec → *then* advisor/alumni). National-parent
officers, directors-en-masse, and local-chapter officers are **never** queue-eligible. Students are
reached through the existing demand-first channels, never the 990 layer.

---

## 3. Financials

| Value | Table.column |
|---|---|
| Revenue | `greek_990_filing.total_revenue` |
| Expenses | `greek_990_filing.total_expenses` |
| Assets | `greek_990_filing.total_assets` |
| (also available) | `total_liabilities`, `net_assets`, `contributions`, `program_service_revenue`, `investment_income`, `gross_receipts` |

- **Tax year:** `greek_990_filing.tax_year`.
- **Latest-filing selection:** per entity, the row with the **max `tax_year` where
  `rich_filing_available = true`** (990/990-EZ have financials; `990N` e-postcards do not):
  ```sql
  select distinct on (legal_entity_id) legal_entity_id, tax_year, total_revenue, total_expenses, total_assets
  from greek_990_filing
  where rich_filing_available and legal_entity_id = any($entity_ids)
  order by legal_entity_id, tax_year desc;
  ```
  Chapter **latest_filing_year** = `max(tax_year)` across the chapter's non-parent entities.
- **Organization-level vs chapter-level:** financials are **entity-level**. For a
  `HOUSE_CORPORATION` / `LOCAL_CHAPTER_ENTITY` / foundation that serves one chapter, that is
  effectively **chapter-level** context. For a `NATIONAL_PARENT`, the financials are the **whole
  national org** — **never present those as the chapter's** (exclude parent entities from chapter
  financials). When a chapter has several non-parent entities, show them per-entity (the house
  corporation is usually the meaningful one).

> **Financials are context only. They are NOT a purchasing-power score.** House-corporation assets
> are restricted real estate; foundation assets are restricted endowment. High assets do not imply
> spendable budget or willingness to buy. Do not derive any "can-afford" / spend-capacity metric.

---

## 4. Entity relationships (many-to-many)

A chapter has **many** legal entities (undergrad chapter, house corp, foundation, alumni corp,
national parent); an entity (esp. a national parent) links to **many** chapters. The join table:

| Field | Meaning |
|---|---|
| `chapter_id` | → `campus_greek_chapters.id` (chapter key) |
| `legal_entity_id` | → `greek_legal_entity.id` (entity key); `greek_legal_entity.ein` is the EIN |
| `relationship_type` | LOCAL_CHAPTER_ENTITY / HOUSE_CORPORATION / ALUMNI_CORPORATION / EDUCATIONAL_FOUNDATION / SCHOLARSHIP_FOUNDATION / PROPERTY_HOLDING_ENTITY / NATIONAL_PARENT |
| `match_confidence` | HIGH_CONFIDENCE (auto-linked) / MEDIUM_CONFIDENCE (candidate only, not linked) |
| `match_method` | `GROUP_EXEMPTION` (IRS-authoritative, 88% of links) / `BMF_NAME_GEO` (name + campus city) |
| `match_score` | numeric explainability score |
| `match_evidence` (jsonb) | `{ name, location, group_exemption, designation }` — human-readable provenance |
| `verified_status` | UNVERIFIED / NEEDS_REVIEW / CONFIRMED / REJECTED (+ `verified_by`, `verified_at`) |
| `source_reference` | `IRS group ruling` or `IRS EO BMF <ST>` |

**GEN relationship:** `greek_legal_entity.group_exemption_number` (GEN) + `affiliation_code`
(`6` = central/national, `9` = subordinate) + `national_greek_org_id` (→ `greek_orgs.id`). A
`GROUP_EXEMPTION` link means the entity is a subordinate under its national's IRS group ruling —
the strongest provenance we have.

**Retrieve only one chapter's entities:** filter the join table by `chapter_id` (indexed:
`greek_chapter_legal_entity_chapter_idx`) — see §1a. Never scan `greek_legal_entity` directly for a
chapter; always go through the link table.

---

## 5. Primary stakeholder — `primary_latest_990_stakeholder`

Selection (already implemented in `scripts/greek-990/aggregates.ts`, mirrored here as the contract):

1. Consider officers (`greek_990_officer`) **only** for the chapter's linked entities whose
   `entity_type <> 'NATIONAL_PARENT'` — **national-parent officers are excluded** (weak relevance;
   they are org-wide, not chapter people).
2. Rank candidates by, in order:
   a. **governing entity first** — entity_type ∈ {HOUSE_CORPORATION, EDUCATIONAL_FOUNDATION,
      SCHOLARSHIP_FOUNDATION, ALUMNI_CORPORATION, PROPERTY_HOLDING_ENTITY} outranks LOCAL_CHAPTER_ENTITY;
   b. **role** — President (3) > Treasurer (2) > Director/Chair (1) > other (0)
      (`normalized_title`);
   c. **most recent** — higher `latest_filing_year`.
3. The winner becomes `primary_latest_990_stakeholder = { name, role, entity_type,
   source: "LATEST 990-REPORTED (TY<year>)" }`. If no non-parent entity has any officer → `null`.

Currently populated for 68 chapters (officer harvesting = SEC subset, 3 of 12 IRS zips); scales as
more zips are parsed. Example: *Chi Omega @ University of Alabama → Kathleen Roth, House Corporation
President, LATEST 990-REPORTED (TY2022)*.

---

## 6. Null / national-only behaviour

- **No chapter-specific entity (only a national-parent link):** show a neutral state — e.g.
  *"National organization on file; no chapter-specific legal entity found."* **Do NOT** surface the
  national parent's officers, financials, or address **as if they were the chapter's.** National
  parent data is org-wide and misleading at the chapter level.
- **No entity at all:** show *"No 990 / legal-entity data found."* (a valid outcome — ~19% of
  chapters). No error, no placeholder people.
- **Entity but no rich filing (990-N only):** show the entity + *"Files a 990-N e-postcard (no
  financial detail)."* Financial fields stay null.
- **Never fabricate** a person, role, or figure to fill a field. Absence is information.

Data-confidence flag per chapter (drive the drawer's prominence): `HIGH` (chapter-specific entity),
`NATIONAL_ONLY`, `MEDIUM` (review candidates only), `NONE`.

---

## 7. Code / migration / DB status

| Item | Status |
|---|---|
| Branch | `overnight/greek-990-sec-pilot` — **merged to `main`** |
| Commit (main) | `5cac7864` — **deployed to production** (surviveaccounting.com, HTTP 200) |
| Migration | `supabase/migrations/20260825_0100_greek_990_legal_entity.sql` — **APPLIED LIVE** |
| Tables | `greek_legal_entity`, `greek_chapter_legal_entity`, `greek_990_filing`, `greek_990_officer`, `greek_990_entity_candidate`, `greek_chapter_990_status` — all live, RLS deny-by-default |
| Views | **none yet** — optional convenience view in §1b (not applied; safe to add later) |
| DB state | 190 campuses · 4,712 chapters · 3,462 entities · 7,160 HIGH links · 14,499 filings (12,406 rich) · 621 officers |
| Reused (unchanged) | `greek_org_propublica_cache`; prior `greek_org_*` tables and manual UI untouched |
| Needs merge | **Nothing** — main is current and deployed. No app/UI code changed (additive scripts/docs/migration only). |
| Pipeline scripts | `scripts/greek-990/` (run.ts, enrich-all.ts, officers.ts, aggregates.ts, export.ts, audit.ts) — for reruns/scale, not runtime |

No new discovery, officer harvesting, or outreach was performed for this handoff.

---

## 8. Verdict

**GREEK 990 DATA READY FOR DASHBOARD INTEGRATION: YES.**

The schema is live and deployed, the M:N contract is stable and indexed, every field the drawer
needs has an exact table.column source, provenance is on every link, and the read pattern is a
single indexed join on `chapter_id`. The precomputed `GREEK_990_CHAPTER_AGGREGATES.json` gives an
immediate per-chapter rollup. Remaining growth (more officer coverage, designation backfill) is
additive and does not block integration. Render it as **990 CONTEXT / escalation reserve** — not a
first-touch contact list — and honour the null rules in §6.
