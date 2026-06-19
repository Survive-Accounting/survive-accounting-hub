## Problem

In the latest IU Bloomington scrape, names and emails are mis-paired (e.g. **Robert Knisley → `jmkniola@iu.edu`**, **Bree Josefy → `kencjone@iu.edu`**, **Greg Geisler → `mgaske@iu.edu`**). The real markdown unambiguously shows `Robert Knisley` → `rknisle@iu.edu` inside one card block. Several leads also show "no email found" even though their card block contains a `mailto:` link.

### Root cause

`extractFacultyFromMarkdown` (in `src/lib/faculty-scrape.functions.ts`) hands the whole directory markdown to the AI extractor. The AI parses ~10 names and ~10 emails per page but does not reliably preserve row-level pairing — it cross-binds names from one card with emails from an adjacent card. Our existing `findEmailNearName` fallback then reinforces the wrong email because it scans a ±300/±500 character window, which on dense directory pages crosses 2-3 cards.

There is no deterministic "this email belongs to *this* card" check.

## Fix — deterministic card-block parser (vertical-agnostic)

Add a pre-AI pass that segments the markdown into **card blocks** and pairs each `Name + Email` (and title) within the same block. Use the AI result only when the deterministic pass finds nothing for a row. Override any AI email that disagrees with the in-block email.

A card block is a contiguous region between two natural delimiters that exist on every directory format we've seen — academic, law, accounting, IB, consulting, hospital, gov:

```text
delimiter ::= one of
  ![Name](image-url)              // photo card (Kelley, most .edu, hospitals)
  ### / ## / #### heading
  hr (---/***)
  list-item bullet preceded by blank line
  <h2|h3|h4> tag in raw HTML
```

Inside one block we collect the **first** match of each:
- name: `[Person Name](profile-url)` (preferred) or first `### **Name**` text
- email: `mailto:` href or bare email regex
- title: first short line that matches title heuristics (already implemented in `extractTitleNear` — reuse)
- profile_url: the link target

This is fully generic — the same block grammar works for `lawfirm.com/attorneys`, `hospital.org/find-a-doctor`, `consultancy.com/people`, `house.gov/representatives`. No vertical-specific regex.

### Changes

1. **New helper `parseDirectoryCards(md, sourceUrl)`** in `faculty-scrape.functions.ts` — returns `Array<{ first_name, last_name, title, email, profile_url }>`. Block detection by the delimiter rules above; name/email/title extracted strictly within the block bounds; rejects blocks where the email's local part is more than 1 edit-distance away from name/initials AND the email already appears in a different block (prevents bleed-through).

2. **Wire it into `extractFacultyFromMarkdown`**:
   - Run `parseDirectoryCards` first.
   - Still run the AI extractor (it catches non-card layouts: tables, freeform bios, news pages).
   - **Merge rule**: dedupe by normalized `last_name + first_initial`. When both sources have a row for the same person, the deterministic email wins; AI fills only what the card parser missed (e.g. `is_phd`, `is_cpa`, longer titles).
   - When AI email ≠ card email for the same person, log it to the debug bundle as `ai_email_overridden` (so Scraper Trends shows how often this saves us).

3. **Tighten `findEmailNearName`** so it cannot cross a card delimiter — shrink the window to "from previous delimiter up to next delimiter" instead of fixed ±300/±500 chars.

4. **Reverse-lookup fallback for RMP-only rows** (Jamie Seitz, PJ Hoffman, Will Demere, Jeff Clark — all show "no email found"). Before going to RMP reverse-lookup, scan every cached directory markdown for the same name via `parseDirectoryCards`. If found, take the card's email. This will recover the four "no email found" rows in the bundle because Jamie Seitz et al. *are* in the Kelley directory markdown already cached.

5. **Debug bundle** — add per-page counters `cardBlocks`, `cardEmailsPaired`, `aiEmailOverridden`, `reverseLookupCardHits`. Surface them in `scrape-debug.server.ts` so the AI Suggestions panel can detect regressions.

### Files

- `src/lib/faculty-scrape.functions.ts` — add `parseDirectoryCards`, rewrite merge logic in `extractFacultyFromMarkdown`, tighten `findEmailNearName` window.
- `src/lib/rmp-scrape.functions.ts` — before RMP reverse-lookup, try `parseDirectoryCards` over cached directory pages keyed by name.
- `src/lib/scrape-debug.server.ts` — add the four new counters to the bundle schema.

### Out of scope

- No DB migration.
- No UI changes (LeadsPanel already displays whatever email we insert).
- No change to the AI prompt — we just stop trusting it on email pairing.

## Verification

After the change, re-run the IU Bloomington scrape and confirm in the debug bundle:
- `Robert Knisley → rknisle@iu.edu`, `Bree Josefy → bjosefy@iu.edu` (or whatever the card actually contains), `Greg Geisler → ggeisler@iu.edu`.
- `cardEmailsPaired ≥ 10` on the directory page.
- `aiEmailOverridden ≥ 5` (proves the override fired).
- The 4 "no email found" rows now have emails from `reverseLookupCardHits`.
