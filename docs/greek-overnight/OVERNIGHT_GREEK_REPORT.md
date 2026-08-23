# Overnight Greek Roster Expansion — 2026-08-23

Branch `overnight/greek-roster-expansion` (worktree `sa-greek-roster`). **Data was applied to the
live database; no product code was deployed and nothing was merged to main.** Leave the branch for
review.

---

## Completed — the scannable summary

| | |
|---|---|
| **Campuses imported this run** | **61** |
| **Chapters harvested + imported** | **1,868** |
| Gap campuses fixed (all 19) | **19 / 19** |
| Expansion campuses imported | **42** |
| New national-org records created (all night) | **5** |
| Duplicate national orgs created | **0** |
| Unroutable chapters created | **0** |
| Import failures | **0** |
| Chapters in DB before → after | 2,317 → **3,923** |
| Campuses with ≥1 chapter | ~134 → **169** |

The single most important number is **5 new orgs across 1,868 imported chapters** — the org-matching
fix from earlier holds, so this run did not reintroduce the duplicate-organization problem it was
built to prevent.

### Council totals in the database after the run

IFC **1,817** · Panhellenic **1,051** · NPHC **612** · MGC **382** · Other 47 · none 14.

---

## The 19 gap campuses — all fixed

Every previously flagged campus now has a balanced roster (the gap was a partial import, not a
campus without those chapters):

Houston (33), Iowa State (50), Cal Poly (33), Colorado State (32), Florida State (54), Louisville
(29), Nebraska (48), Northwestern (46), Rutgers (51), San Diego State (34), TCU (28), USC (42),
Virginia (57), Virginia Tech (49), Illinois (89), Kansas State (44), Miami (31), Minnesota (50),
Utah (18).

Gap-flag recheck: **19 / 19 clear** — each now carries both an IFC and a Panhellenic presence plus,
in most cases, NPHC and MGC.

## The 42 expansion campuses imported

Penn (50), George Washington (48), Binghamton (49), UNT (40), USF (39), George Mason (35), UNC
Charlotte (33), FIU (34), Stephen F. Austin (33), Ball State (27), Old Dominion (32), Western
Kentucky (32), American (28), Drexel (30), Northeastern (29), Sam Houston (28), Southern Miss (28),
UTSA (28), FAU (27), RIT (27), Toledo (25), Eastern Michigan (25), Texas State (24), Troy (23),
UT Dallas (23), Georgia State (21), Jacksonville State (20), UNCG (18), UT Arlington (21), Idaho
(30), UWM (17), NYU (16), UIC (16), Lamar (16), Cleveland State (16), NDSU (15), Loyola Chicago
(13), UTEP (10), Brandeis (8), Howard (6), Morehouse (5), UMass Lowell (5).

Full per-campus counts (and council splits) are in `GREEK_IMPORT_COMPLETED.csv`.

---

## Data quality

- **Source**: GreekRank public campus pages — both the fraternities and sororities pages for each
  campus, parsed deterministically from the HTML (not an extractor model).
- **Inactive chapters dropped**: GreekRank flags closed chapters `INACTIVE`; those were excluded
  (e.g. Virginia Tech dropped 12, San Diego State 9, USC 6). Roughly 130 inactive chapters skipped.
- **Non-social excluded**: professional/honor/service orgs (Beta Alpha Psi, Alpha Kappa Psi, Delta
  Sigma Pi, Phi Sigma Rho, Gamma Sigma Sigma, Alpha Phi Omega, …) were filtered out before import.
- **Council classification came from canonical national-org metadata**, never from which GreekRank
  page an org appeared on — the live `greek_orgs` catalog plus standard NPC (26), Divine Nine (9),
  NIC and MGC reference lists. A chapter whose council could not be confirmed was imported with a
  **blank council** (14 rows) rather than a guessed one.
- **New orgs (5)**: Sigma Phi Omega, Phi Rho Eta, and three others — all genuine, canonically-named
  multicultural social organizations not previously in the catalog. No duplicates.
- **Uncertain orgs held out (24)**: organizations `classify()` could not confidently place were
  **not imported** (importing them would let the importer mint an org row for an unvetted name).
  They are listed in `GREEK_ORGS_NEEDS_REVIEW.csv` — a mix of real multicultural social orgs to add
  to the catalog (Pi Alpha Phi, Delta Sigma Iota, Sigma Theta Psi, Sigma Phi Society…) and
  professional/service ones to keep excluded (Alpha Sigma Kappa, Sigma Alpha, Omega Phi Alpha).

### One bug found and fixed mid-run

The earlier importer change (matching orgs on a space-joined key so it could strip descriptor
words) was **also feeding that key into the chapter slug**, so newly-created chapters got unroutable
slugs like `alpha chi omega`. This affected 589 rows (Michigan State from the prior task plus
tonight's first gap batch). Fixed in the importer (slug now always comes from `greekChapterSlug`),
and the 589 live rows were repaired — **0 unroutable, 0 bad slugs remain**. Committed on the branch.

---

## Verification

- **Idempotency**: re-running the importer on already-applied campuses gives **0 creates, all
  updates, 0 new orgs, 0 collisions** — the export/import round-trip is preserved.
- **Live route**: `surviveaccounting.com/go/university-of-houston/chi-omega` resolves on production
  and renders the Houston hero (ACCT 2301) — a newly imported chapter routes end-to-end.
- All slugs valid, no duplicate chapters, council counts sane per campus.

---

## Remaining

### Campuses needing research (89)

Not reached this run — listed in `GREEK_BLOCKED_OR_REVIEW.csv`. These are the smaller / branch /
religious campuses in the expansion queue (Penn State branch campuses, Bay Path, Catawba, Cedar
Crest, Concord, Erskine, Nelson, North Park, Ottawa, Wilmington, Woodbury, …) plus a handful of
mid-size universities I simply did not get to (Liberty, Lipscomb, Seattle U, Suffolk, SF State,
Western Washington, UVM, UCCS, UMass Dartmouth, Arkansas State, Furman, Campbell). Many of the small
colleges likely have little or no traditional social Greek system on GreekRank; each needs a
one-line eligibility check before harvest. **None was marked "no social Greek" without evidence** —
that determination was left for a look rather than guessed.

### Next 20 highest-priority to finish (all mid-size public/private with real Greek systems)

Liberty, SF State, Seattle U, Suffolk, Western Washington, UVM, UMass Dartmouth, UCCS, Arkansas
State, Furman, Campbell, Lipscomb, Grambling (HBCU — verify via official source; no clean GreekRank
page), Alabama State, Albany State, Savannah State, Winston-Salem State, Claflin (the last five are
HBCUs — GreekRank under-covers them, supplement from the campus NPHC directory).

### One duplicate campus found

**UT Austin** appears twice: the supported "Texas" (`university-of-texas-at-austin`, `faad6039…`)
and an expansion duplicate "UT Austin" (`the-university-of-texas-at-austin`, `102fd422…`). I did
**not** import to the duplicate. Recommend archiving/merging `102fd422`.

### HBCU coverage caveat

Howard (6) and Morehouse (5) imported only their NPHC chapters — GreekRank lists little else for
HBCUs. These are real chapters but the rosters are incomplete; supplement from each school's official
NPHC/Greek directory.

---

## Archived-campus restoration (section 24) — researched, NOT executed

I did the duplicate-safety research for the curated list but **did not auto-restore**, because
restoring an archived campus makes it publicly visible and every candidate below is **missing school
colors** (a stated restoration requirement), and most are missing a slug. Those are exactly the
"materially uncertain" conditions the task says to flag rather than force. Findings and
recommendations:

| Campus | Finding | Recommendation |
|---|---|---|
| **Indiana University** | **Already LIVE as "Indiana University Bloomington"** (`feab5578`, has slug+code+colors). The archived "Indiana University" (`390be85e`) is a DUPLICATE. | **Do NOT restore the archived record.** Import Greek into the live Bloomington record — it's a strong candidate (IU has a major system). |
| University of Connecticut | Archived `49672cb7`, has slug + code (ACCT 2001), **no colors**. No live dup. | Add colors → unarchive → import Greek. |
| Missouri State | Archived `6cec1e83`, code ACC 201, **no slug, no colors**. No live dup. | Add slug + colors → unarchive → import. |
| Montana State | Two archived (main `fdf5e2e4` + Billings). Main has code ACTG 201, no slug/colors. | Use `fdf5e2e4`; add slug + colors → restore. Ignore Billings. |
| UNLV | Archived `21cad3ab`, **malformed name** "Univ of Nevada, Las Vegas Las", no slug/colors. No live dup. | Fix name → add slug + colors → restore. |
| Kennesaw State | Archived `3888d1aa`, code ACCT 2101, no slug/colors. No live dup. | Add slug + colors → restore. |
| Towson | Archived `acae37b2`, code ACCT 201, no slug/colors. No live dup. | Add slug + colors → restore. |
| University of North Alabama | Archived `d37a8470`, code AC 291, no slug/colors. No live dup. | Verify AC 291 is the first financial course → add slug/colors → restore. |

MTSU (section C) and the section-D duplicate-conflict records were not touched, as instructed.

Every restoration is: set colors → generate slug → `archived_at = null` → run the importer with a
GreekRank harvest for that campus. The tooling to do it is all on the branch; it's a 15-minute pass
once colors are decided, best done with your eyes since these go public.

---

## Deliverables (in this folder)

- `GREEK_IMPORT_COMPLETED.csv` — 61 campuses, per-campus counts and council splits
- `GREEK_BLOCKED_OR_REVIEW.csv` — 91 campuses needing research/review + the duplicate
- `GREEK_ORGS_NEEDS_REVIEW.csv` — 24 organizations to classify
- `GREEK_NO_SOCIAL_SYSTEM.csv` — empty (none confidently determined; not guessed)
- `GREEK_IMPORT_ERRORS.csv` — empty (0 failures)
- `overnight_greek_harvest.csv` — all 1,868 imported rows, importer-format
- `Survive_Greek_Data_Import_Queue_UPDATED.xlsx` — the tracker with statuses filled in
- `greek_overnight_progress.json` — resumable per-campus log (status, uni id, councils, sources)

---

# Run 2 — Next-20 + archived-campus restoration (2026-08-23, follow-up)

Lee approved production writes and asked to (a) restore the archived campuses' school colors and
(b) work the "next 20". Both are now **applied to the live database** on this same branch.

## Archived-campus restoration — DONE (7 campuses)

Official brand hex codes were pulled from each school's brand guide / athletics style guide, slugs
were collision-checked, and the prior row state was backed up to `restore-backup.json`. Each row:
colors set, slug assigned, `colors_reviewed=true`, `archived_at` cleared (unarchived).

| Campus | Primary | Secondary | Tertiary | Slug |
|---|---|---|---|---|
| University of Connecticut | `#000E2F` | `#FFFFFF` | `#A2AAAD` | university-of-connecticut |
| Missouri State University | `#5E0009` | `#FFFFFF` | — | missouri-state-university |
| Montana State University | `#00205B` | `#BF995B` | `#FFFFFF` | montana-state-university |
| University of Nevada, Las Vegas | `#E31837` | `#9FA1A4` | `#000000` | university-of-nevada-las-vegas |
| Kennesaw State University | `#FDBB30` | `#0B1315` | `#C5C6C8` | kennesaw-state-university |
| Towson University | `#000000` | `#FFCC00` | `#FFFFFF` | towson-university |
| University of North Alabama | `#46166B` | `#DB9F11` | `#5F6062` | university-of-north-alabama |

UNLV's malformed name `Univ of Nevada, Las Vegas Las` was corrected to `University of Nevada, Las
Vegas` (short_name `UNLV`). To revert any of this, PATCH the rows back from `restore-backup.json`.

## Chapters imported — DONE (19 campuses, 337 new)

All 19 harvestable campuses (12 already-live + the 7 restored) imported in one pass:

- **create 337 · update 31 · new greek_orgs 0 · slug collisions 0 · failures 0**
- DB chapters **3,923 → 4,260**; campuses with ≥1 chapter **169 → 186**
- Council split now: IFC **1,969** · Panhellenic **1,132** · NPHC **697** · MGC **400**
- **0 unroutable / bad slugs** across all 19 campuses (verified post-write)
- Live route verified: `/go/kennesaw-state-university/alpha-kappa-alpha` resolves on production with
  ACCT 2101 — a restored, previously-archived campus routing a newly-imported chapter end-to-end.

Per-campus counts are appended to `GREEK_IMPORT_COMPLETED.csv`; the raw importer-format rows are in
`next20_restored_harvest.csv`.

Biggest rosters this run: Indiana Bloomington 67, UConn 41, Missouri State 31, UNLV 29, Kennesaw 29,
Towson 27, Arkansas State 22. HBCU rosters (Albany State 10, Savannah State 9, Winston-Salem St 7)
came back NPHC-heavy as expected — GreekRank covers only their NPHC chapters, so these are real but
incomplete; supplement from each school's official directory.

## Not harvested (evidence recorded, nothing invented)

- **Liberty University** → `GREEK_NO_SOCIAL_SYSTEM.csv`. Liberty officially prohibits Greek life
  (Greek population zero); no GreekRank page. Confirmed, will not be pursued.
- **Seattle University, Lipscomb, Grambling State, Alabama State, Claflin** → `GREEK_BLOCKED_OR_REVIEW.csv`
  as `needs-source`. No usable GreekRank page (Lipscomb uses non-national "social clubs"; Grambling/
  Alabama State/Claflin are HBCUs GreekRank doesn't cover). Each needs its official NPHC/FSL directory.
- **Western Washington University** → not in the campuses table at all; flagged `needs-campus-record`.
  Add it via the CSV importer first, then it can be harvested.

## Still open (unchanged from Run 1)

- 24 organizations in `GREEK_ORGS_NEEDS_REVIEW.csv` to classify.
- **UT Austin duplicate campus** (`102fd422…`) still recommended for archive/merge against the
  supported `university-of-texas-at-austin` (`faad6039…`).
- The remaining small/branch campuses in `GREEK_BLOCKED_OR_REVIEW.csv`.
