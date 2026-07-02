# Active Roster — apply report

Branch `orders-foundation` · 2026-07-02 · migration 0045 applied · **committed, not merged.**

## What shipped
- **Migration 0045** (`campuses.active_roster`; `campus_lead_suggestions.active_roster` / `source` / `activated_at`) — additive, nullable, RLS unchanged.
- **CSV import** from `data/sec_faculty_batch1.csv` (544 usable rows / 32 schools) into `campus_lead_suggestions`, scoped by `active_roster='sec'`.
- **/order pickers** now scoped: campus picker → `active_roster='sec'` only (`searchOrderCampuses`); professor picker → `active_roster IS NOT NULL` (`searchOrderProfessors`). Free-text "my school/professor isn't listed" escapes preserved.
- **Admin** at `/outreach/active-roster` — toggle campuses in/out, expand to see roster professors, remove-from-roster per professor.
- **ProfIntel** — one opt-in checkbox "Only Active Roster" on the lead-selection step. **Default OFF** (unchanged send flow). No send/schedule/notify code touched.

## Step 3 apply counts (single transaction)
- Campuses activated: **29**
- New professors inserted: **166**
- Existing professors merged: **318**
- **Total active roster rows: 484** (all `source='sec_csv_batch1'`)
- Email conflicts resolved: **4** — CSV won for 3 (`@tennessee.edu` ×2, fixed a truncated `n@moore.sc.edu`); kept the existing academic `.edu` over a free-mail address for **Bryan Cataldi** (per your call).
- Excluded per your calls: the **19 non-faculty** rows (grad assistants / advisors / admin staff) and the **3 unmatched campuses** (below).
- Fail-loud check: **no active campus has an empty professor list**.

## Unmatched campuses — LEFT for you to resolve (nothing written for these)
Each exists in `campuses` under an abbreviated name; you chose to leave them out for now. To add later, toggle them on in `/outreach/active-roster` (their professors would still need importing, or re-run with them mapped):
- **University of Alabama at Birmingham** → likely `Uof Alabama at Birmingham` (`a348048e-fc82-46b7-a488-22b20e51e009`)
- **University of Central Arkansas** → likely `Univ of Central Arkansas` (`964be11f-f306-4df2-9671-835a053ace33`)
- **University of Louisiana Monroe** → likely `Univ of Louisiana at Monroe` (`e10d4e7f-f243-4713-b21c-b4ac88b69205`)

## Smoke test (STEP 7 — query-level; preview tool can't reach this worktree)
- Campus picker (`active_roster='sec'` + name filter) returns only active campuses — verified `%miss%` → State/Ole Miss/Missouri/Southern Miss only.
- Ole Miss professor picker → 30 roster professors (sample: Allen, Arguello, Barton).
- A non-roster campus (Duke) → 0 active professors → empty picker → student falls through to free-text. No dead end.
- No test orders were inserted (picker verification is read-only).

## ProfIntel default unchanged
With the toggle OFF, `fetchProfintelLeads(campusId, false)` runs the **exact same query as before** (the `active_roster` filter is only appended when the box is ON). Parity confirmed (Ole Miss OFF=30). Lee's ongoing sends are unaffected.

## Notes
- `campus_lead_suggestions` has no `phone`/`office` columns; for NEW rows those went into `notes` as provenance, `department` into `department`. Existing rows' `notes` were not touched.
- `data/sec_faculty_batch1.csv` is intentionally **not committed** (gitignored) — it's source data with contact emails.
