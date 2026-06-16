## Why only 3 campuses match a textbook

Short version: **the matcher is working correctly. The bottleneck is research coverage, not matching logic.**

Of 170 active campuses, only **4** have any textbook research stored in `campus_family_textbooks_json`. The other 166 are `unknown` (no data yet — not "unmatched"). Of those 4:

| Campus | Intro 1 | Intro 2 | Why |
|---|---|---|---|
| Southern Miss | matched (Wild/Shaw) | matched (Wild/Shaw) | full title + authors + publisher |
| Penn | matched (Hanlon/Magee/Pfeiffer) | matched (Hartgraves/Morse) | full metadata |
| USC | matched (Hanlon/Magee/Pfeiffer) | matched (Garrison/Noreen/Brewer) | full metadata |
| UF | unmatched | unmatched | only an ISBN was researched; title/authors/publisher are blank, so the keyword matcher has nothing to score |

So the "3 matched" number is really `3 matched + 1 ISBN-only unmatched + 166 not-yet-researched`.

### How matching works today (`src/lib/textbook-matcher.ts`)
1. Load all rows from `supported_textbook_families` (14 families across intro_1, intro_2, intermediate_1, intermediate_2).
2. For each campus + course family, read the detected book (`title`, `authors`, `publisher`, `isbn13`) from `campuses.course_family_textbooks_json`.
3. If all four fields are empty → status = `unknown`.
4. Otherwise score against every family in that course slot:
   - authors: 2+ keyword hits = 0.7, 1 hit = 0.5
   - title: 2+ hits = 0.25, 1 hit = 0.15
   - publisher: any hit = 0.2
5. Best score ≥ 0.5 → `matched`. Editions are ignored unless a family sets `edition_sensitive`.
6. ISBN is stored but **not** used for matching — that is the gap that hides UF.

### Fixes proposed

**A. ISBN-13 lookup as a fallback signal.** Add an `isbn13_prefixes` column (or a small `supported_textbook_isbns` table) to each family. UF's `9781266670268` / `9781264290000` are McGraw-Hill ISBNs that Wild/Shaw and Garrison sit inside; we can match by ISBN even when the AI returns no title/author. This alone should flip UF from `unmatched` to `matched`.

**B. Re-research the missing 166.** Right now `Clean Professor Research` only does professor discovery — it intentionally skips textbook research. We need a way to actually populate `course_family_textbooks_json` for the rest.

## What you asked for

### 1. Textbook matching report (modal)
New "How matching works" panel inside the existing **Textbook Match Audit** modal: explains the scoring, lists the 14 supported families, and adds a top-line breakdown:
`170 active · 4 researched · 3 matched · 1 unmatched (UF — ISBN only) · 166 unknown (no research yet)`.
Plus a one-click **"Re-run textbook research for unknown campuses"** button that kicks off `research-campus` (textbook step only) for the 166.

### 2. Run Clean Professor Research on all 170
This already works — open the green **Run Clean Professor Research** card, switch Scope to **All active campuses (170)**, click Run. I'll just make that path more obvious by:
- Adding a "170" count badge directly on the button.
- Adding a confirm dialog that estimates cost (~$5.10 at $0.03/campus) and warns it will take ~15–20 minutes.

### 3. Test a single campus first
New **"Test on one campus"** control on the Clean Professor card:
- Searchable campus picker (defaults to a textbook-matched campus so you see a fair test).
- Runs the same `research-campus-leads-clean` edge function for just that one campus, synchronously.
- Opens a results dialog showing: prompt used, raw model output, leads created, leads rejected + reason, sources cited.
- Nothing is auto-imported — results land as pending suggestions tagged `research_label = 'Clean Professor Test — <campus> <timestamp>'` so they're easy to find or archive.

### Technical changes
- **Migration:** add `isbn13_prefixes text[]` to `supported_textbook_families` and seed prefixes for the 14 families.
- **`src/lib/textbook-matcher.ts`:** new ISBN-prefix branch — if title/authors/publisher all blank but ISBN matches a family's prefix, return `matched` with reason `"isbn13 prefix match"` and confidence 0.6.
- **`TextbookMatchAuditModal.tsx`:** add explanatory header section + coverage breakdown + "Re-run textbook research" action.
- **`CleanProfessorResearchPanel.tsx`:** add single-campus picker + "Test one campus" button; show count badge + cost/time confirm on the bulk Run.
- **New component `CleanRunTestResultModal.tsx`:** shows leads, rejections, sources for the test run.
- **`supabase/functions/research-campus-leads-clean/index.ts`:** accept a `test_mode: true` flag → return the full result payload (prompt, raw output, accepted, rejected with reasons) instead of just persisting and returning a count.
- **`src/lib/outreach-api.ts`:** add `runCleanProfessorTest(campusId)` and `triggerTextbookResearchForUnknown()`.

No existing data is modified or deleted; ISBN matching only adds matches, never removes them.