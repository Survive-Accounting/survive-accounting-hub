# Growth contacts schema — what shipped, and what Lee must run

Branch `growth-contacts-schema`. Implements `CONTACTS-SCHEMA.md` and the handoff, on top of the
DM console (`/admin/growth/dm`) and the Cold Outreach CSV pair already on main.

## 1. Adopt the schema — DONE

`src/lib/growth-contacts-schema.ts` holds the 25 columns, the enums, the CSV reader/writer and
`contact_id`.

`contact_id` is a self-contained SHA-1 (no node crypto, so it runs in the browser for a preview and
on the server for the upsert). **It reproduces the PowerShell cleaner's ids exactly — verified
against all 3,250 rows of `contacts-clean.csv`, zero mismatches** — so importing a file the
reference implementation produced updates rather than duplicates.

The reader takes BOTH shapes: a 25-column schema file, or a legacy scrape
(`School,Council,Role,Name,Instagram,Chapter,Email`). Legacy files are cleaned before upsert.

## 2. Cleaning baked into the import — DONE

`src/lib/contacts-clean.ts` (+ `contacts-clean-tables.ts` for the reference data) is a TypeScript
port of `clean-contacts.ps1`, run on every scrape import before upsert.

**Verified against the reference on live data**: same input produces **3,250 rows, 253 schools,
104 flagged for review** — all three matching the handoff exactly, and 94% of `contact_id`s
identical to Lee's file row for row.

### One deliberate change from the reference: determinism

The PowerShell keeps "the first row of a group" in several places — which duplicate survives a
merge, which handle becomes `org_ig` and which fall to `alt_ig`. That makes the output depend on
the order rows happen to arrive in. Since `contact_id` is built from those fields and **everything
upserts on it**, a re-scrape in a different order would mint new ids and insert a second copy of
every affected contact.

The port therefore sorts its input and orders the handle pools, making output a pure function of
the SET of rows. A test shuffles the input three ways and asserts byte-identical output.

This is why ~6% of ids differ from Lee's file: those are rows where the reference's winner depended
on order. The importer handles it — see the natural-key fallback below — so no duplicates result.

## 3. Scraper defects — 4 of 5 DONE

`sendToDmQueueFn` now runs the same cleaner over scraped rows **before** they are stored, which
fixes four of the five documented defects in one place instead of four:

| Defect | How it is now fixed |
|---|---|
| Chapter IG search noise | handle re-matched to the chapter it actually spells; school-wide accounts dropped; council handles moved to their council |
| Cross-school contamination | rows whose email domain proves another school are moved, then excluded from this campus's import and **reported** |
| Cartesian product | one officer listed under every chapter collapses to one row, resolved via their handle or flagged |
| Per-council duplication | an advisor emitted once per council becomes one row carrying `councils_covered` |
| **Chapter list per school is incomplete** | **NOT DONE** — seeding each school's chapter list from the handles found is a scraper change, not an import change |

`sendToDmQueueFn` now returns `cleaned: { merged, movedToAnotherSchool, flagged }` so rows that
disappear between "submitted" and "imported" are visible rather than mysterious.

## 4. Load the data — BLOCKED ON YOU

I could not run it: this machine's `.env` has no Supabase management token, so I cannot apply DDL,
and the 3,250 rows need the new columns first.

**Step 1 — run the migration.** Supabase dashboard → SQL Editor → paste
`migration/supabase-migrations/20260910_1800_growth_contacts_schema.sql` → Run. The closing SELECT
must return 22 rows.

It is **additive on `growth_contact_qc`**, deliberately, not a new table — that table is what the DM
board, the chapter roster grid, the send schedule and find-contacts all read, and a parallel table
would leave half the product looking at the old half. The importer keeps writing the legacy columns
(`name`, `role`, `instagram`, `email`, `entity_type`, `entity_id`, `council_type`) alongside the new
structured ones, so everything built before today keeps working.

**Step 2 — import the file.** `/admin/growth/coldoutreach` → **Import CSV** → upload
`contacts-clean.csv`. The preview says what it will do; nothing is written until you press Import.
Expect **3,250 rows, 253 schools, 104 flagged**.

## 5. Import safety rules — DONE

1. **Upsert on `contact_id`**, with a **natural-key fallback** (campus + org + person + email) when
   no id matches. This is what makes the ~6% id drift harmless: a re-cleaned row updates the person
   already on file instead of inserting a twin.
2. **`dm_*` columns are app-owned.** A scrape fills a blank one, never blanks a set one.
3. **`source` accumulates** (`a.csv @ 2026-09-10; b.csv @ 2026-10-01`).
4. **`needs_review` rows are imported, never dropped**, and there is an **Export → Needs review**
   button that downloads only those rows for fixing.

## Still open

- Seeding each school's chapter list from discovered handles (defect 5).
- An inline "Needs review" editing surface. Today the flagged rows import, show up on the board and
  export on their own; fixing one means editing it and re-importing, not editing it in place.
- The 104 flagged rows have not been reviewed by anyone — they are flagged, not fixed.
