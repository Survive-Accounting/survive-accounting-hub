# Arkansas scrape diagnosis + RMP-in-V2 + mailto-deobfuscation plan

## Part 1 — What the Arkansas screenshots show

Two distinct issues, plus one related issue the scraper-trends dashboard just surfaced.

### A. Junk rows added by the faculty extractor (precision drop, not recall)

The real professors are correct (Chad Reed, Ashleigh Bakke, Ryan Robinson, Caleb Rawson, Thomas Hayes, Robyn Jarnagin, Kim Petrone, Barry Bryan — all good). The bad rows are all of one shape:

- Headings / nav captured as people: "Buildings and Locations", "Sam M. Walton College of Business", "New & Noteworthy / View all news", news article titles, "Show your support \\ Invest in Accounting Students".
- Emails that aren't emails: `gradu@ion.undergraduate`, `undergradu@e-accounting-program.php`, `gre@options.for`, `integr@ed-macc.php`. These are fragments of relative URLs (`graduation.undergraduate.php`, `e-accounting-program.php`, `integrated-macc.php`) that survived the email regex.

Root cause: the card-block segmenter accepts non-faculty blocks (news teasers, footer CTAs, page headers) and the email regex doesn't reject URL-slug shapes. Recall on actual professors is fine; precision falls off at the end of the page where news/CTA blocks live. (Out of scope for this PR — tracked in `.lovable/plan.md`.)

### B. RMP column is all `—`

`scrape_batches`/`rmp_*` columns exist on `campus_lead_suggestions` and `outreach_leads`, and discovery + scraping exist (`src/lib/auto-scrape.functions.ts` lines 167–188, `src/lib/rmp-scrape.functions.ts`). Three independent failure modes can all produce the same em-dash:

1. **Discovery never matched.** `auto-scrape.functions.ts` only accepts `/school/<digits>` URLs; RMP also returns `/search/professors/<id>?q=…` URLs that the scraper itself can parse, but discovery rejects them.
2. **RMP fetched but department filter dropped everyone.** `isAccountingDept` hardcodes `"accounting" | "accountancy"`. Joint-appointment and adjunct faculty often appear with different department strings.
3. **Department matched but name join missed.** Match is exact-normalized first+last; RMP middle initials and anonymized first names ("A. Bakke") fail silently.

The UI can't tell these apart — `—` means all three.

### C. New trend signal: `mailto_obfuscation_js_click_miss`

The scraper-trends dashboard flagged a high-severity pattern: directories that build `mailto:` links via JS hover/click handlers (char-code offsets, string reversal, late DOM insertion) defeat the HTML/markdown extractor. Same shape will hit Law, IB, Consulting, Hospitals, Gov verticals. Pagination walks that need stateful navigation (`.u-directory__item` style components) also miss rows after page 1. We should fold this into the same PR because the fix path (vertical-aware Firecrawl scrape options + post-fetch deobfuscation) overlaps the RMP refactor's plumbing.

### What V1 did that V2 lost

In V1: SERP-discover the RMP school page → scrape it → attach ratings. No manual paste. V2 has all the parts but the discovery regex is too strict, department matching is hardcoded to accounting, name matching has no fallback, and there's no "tried-and-missed" signal for the UI.

## Part 2 — Claude Code prompt

Paste the block below into Claude Code in the repo root.

````text
You're working in the SurviveAccounting / Lovable outreach repo (TanStack
Start, Lovable Cloud / Supabase). The faculty scraper (V2) works well on
University of Arkansas: real professors come through correctly. Two real
problems remain:

  1. Rate My Professors enrichment is unreliable — the RMP column on the
     leadfinder review table is empty almost everywhere, even when the
     RMP school page is reachable. We want V1-style behavior: SERP-discover
     the school's RMP page automatically and attach ratings to every
     matched professor, with no user paste.

  2. The scraper-trends dashboard just flagged a high-severity pattern
     called `mailto_obfuscation_js_click_miss`: directories build mailto
     links via JS (hover/click handlers, char-code offsets, string
     reversal, late DOM insertion) and our HTML/markdown extractor
     misses the email entirely. The pattern also breaks paginated walks
     of components like `.u-directory__item`. Same failure mode is
     expected on Law, IB, Consulting, Hospital, Gov verticals.

Both fixes need to land in a way that generalizes to other verticals,
not just accounting.

## Files to read FIRST (don't grep blindly — read these end to end)

- src/lib/auto-scrape.functions.ts            # SERP discovery (faculty + RMP)
- src/lib/rmp-scrape.functions.ts             # RMP GraphQL + match/insert
- src/lib/batch-scrape.functions.ts           # orchestrator for "Batch scrape V2"
- src/lib/faculty-scrape.functions.ts         # faculty directory scraper
- src/lib/verticals.ts                        # vertical config — EXTEND, don't fork
- src/lib/directory-cards.ts                  # card-block parser (referenced; do not rewrite)
- src/lib/scraper-trends.functions.ts         # where the mailto pattern surfaced
- src/components/outreach/AutoScrapeButton.tsx
- src/components/outreach/BatchScrapePanel.tsx
- src/routes/outreach.leadfinder.$campusId.tsx  # RmpScrapePanel around line 478

Confirm the actual shape of scrapeCampusRmp's response, the verticals.ts
schema, and the rmp_* / mailto_* columns on campuses, campus_lead_suggestions,
and outreach_leads BEFORE writing any code.

## Goals (priority order)

1. RMP enrichment runs automatically after every faculty scrape, for every
   vertical, with no manual paste.
2. Department matching becomes a vertical config (`rmpDepartmentMatchers:
   string[]`), case-insensitive substring, any-of. Accounting seed:
   ["accounting", "accountancy"]. Other verticals stay empty until we
   ship them — empty list means "do not filter by dept" only if the
   vertical explicitly opts in via `rmpAcceptAllDepts: true`; otherwise
   empty list means "match nothing" so we don't pollute campaigns.
3. Name matching gets a second pass: exact first+last → last+first-initial
   → Jaro-Winkler ≥ 0.92 on first name (last must match exactly). Never
   loosen the last-name match.
4. SERP discovery accepts both `/school/<id>` and `/search/professors/<id>`
   (extractSchoolLegacyId already parses both).
5. UI distinguishes "never tried" (`—`) from "tried, no match"
   (`· no match`, muted) from "matched" (`★ 4.2 (37)`).
6. Manual paste panel keeps working but gains a "Find RMP page
   automatically" button that calls the discovery server fn.
7. Add a Firecrawl-based JS de-obfuscation pass for `mailto:` links and
   paginated directory components — gated by vertical config so we don't
   pay for the extra browser actions on directories that don't need it.
8. Every RMP attempt and every mailto-deobfuscation attempt writes a
   structured debug row (reuse `scrape_debug_bundles` — no new tables).

## What NOT to do

- Do not change the card-block extractor in faculty-scrape.functions.ts /
  directory-cards.ts. The "junk rows" problem on Arkansas (news headlines,
  URL-slug emails like `gre@options.for`) is tracked separately in
  .lovable/plan.md and is OUT OF SCOPE.
- Do not add new tables. rmp_* columns and scrape_debug_bundles exist.
- Do not loosen RMP department matching to "any teacher at the school" —
  that pollutes accounting campaigns with finance/marketing/management
  professors. Per-vertical matchers, not no matchers.
- Do not add `vertical` as a parameter to every server fn signature when
  you can read it off the `campuses` row inside the handler.
- Do not run the Firecrawl JS-interaction pass on every scrape. It's
  slower and more expensive. Gate it on `verticals[v].directoryQuirks`
  containing `'mailto_js_obfuscation'` or `'stateful_pagination'`, OR on
  a per-campus override flag.
- Do not wire any "use server" / Next.js patterns. Stay in
  createServerFn-from-@tanstack/react-start.

## Implementation order

### Step 1 — Extend vertical config (src/lib/verticals.ts)
Add to Vertical type:
  rmpDepartmentMatchers: string[]
  rmpAcceptAllDepts?: boolean
  directoryQuirks?: Array<'mailto_js_obfuscation' | 'stateful_pagination'>
Seed accounting: `{ rmpDepartmentMatchers: ['accounting', 'accountancy'] }`.
Export `matchesVerticalDept(dept: string | null, vertical): boolean` and
`verticalHasQuirk(vertical, quirk): boolean`.

### Step 2 — Generalize scrapeCampusRmp (src/lib/rmp-scrape.functions.ts)
- Replace isAccountingDept with matchesVerticalDept(dept, vertical).
- At the top of the handler, look up the campus's vertical from the
  `campuses` table; default to 'accounting' if null so existing rows
  keep working.
- Add the second-pass name matcher from Goal 3. Maintain counters:
  { exactMatched, initialMatched, fuzzyMatched, unmatched }.
- Return `debug: { vertical, deptMatchers, perPage, counters }` and write
  a row to scrape_debug_bundles per call (reuse the existing helper).

### Step 3 — Loosen SERP discovery (src/lib/auto-scrape.functions.ts)
- Accept `/school/\d+` OR `/search/professors/\d+`.
- Keep two-pass query strategy.
- On failure return `rmpUrl: null` plus `rmpDiscoveryReason: string`.

### Step 4 — Always run RMP after faculty scrape
In BatchScrapePanel.tsx (~line 139) and AutoScrapeButton.tsx, always call
rmpFn when discovery returned a URL. When discovery returns null, persist
`rmpDiscoveryReason` to a campus debug field (use the existing
auto_scrape_debug JSON column if present; do not add a new column).

### Step 5 — UI signals (src/routes/outreach.leadfinder.$campusId.tsx)
- RMP column renders three states (rating / `· no match` / `—`) using
  rmp_checked_at + rmp_rating from campus_lead_suggestions.
- Tooltip on the column header explains the difference.
- In RmpScrapePanel (~line 478), add a "Find RMP page automatically"
  button that calls the discovery server fn, populates the textarea
  with the URL it finds, and toasts the reason on failure.

### Step 6 — Mailto JS de-obfuscation + stateful pagination pass
This is the new piece prompted by the scraper-trends finding
`mailto_obfuscation_js_click_miss`.

Implementation:
- In faculty-scrape.functions.ts (or a small new helper file
  src/lib/firecrawl-interact.ts), add a `scrapeWithInteractions` wrapper
  around the existing Firecrawl scrape. Use Firecrawl's `actions` array
  to:
    a. `wait` 750ms for client JS to attach.
    b. For each candidate directory item selector
       (`a[href^="mailto:"]`, `.u-directory__item a`, `button[data-mailto]`,
        `[onclick*="mailto"]`), `hover` then `click` to force the mailto
       URL to materialize.
    c. After interactions, return `formats: ['html', 'markdown', 'links']`
       so we get post-interaction DOM.
- Post-process the returned HTML for known JS obfuscation patterns BEFORE
  the markdown extractor sees it:
    - char-code offset arrays (e.g. `String.fromCharCode(...)`)
    - reversed strings (`'ude.kraU@retsigna'.split('').reverse().join('')`)
    - CSS-display-none decoy spans inside the visible mailto
    - data-* attribute encodings (`data-user="x" data-domain="y"`)
  Add `decodeKnownMailtoObfuscations(html: string): string` with a
  pure-function unit-test surface (no dynamic eval — pattern-match and
  substitute statically; eval() is forbidden).
- For paginated directories: when the rendered page contains a
  `data-pagination` / `.pagination__next` / `aria-label="Next page"`
  control AND `verticalHasQuirk(v, 'stateful_pagination')`, use
  Firecrawl actions to click "next" up to N=10 times, concatenating the
  HTML between paginations. Cap total bytes at 1MB to keep cost bounded.
- Gate the entire pass on `verticalHasQuirk(vertical,
  'mailto_js_obfuscation')` OR `verticalHasQuirk(vertical,
  'stateful_pagination')` OR a per-campus boolean
  `campuses.directory_needs_interactions`. Default off for accounting
  unless a specific campus opts in (so we don't regress speed/cost on
  the 169 campuses that already scrape fine).
- Write a scrape_debug_bundles row with:
    { kind: 'mailto_deobfuscation',
      patternsMatched: ['charcode'|'reverse'|'data-attr'|'css-decoy'],
      emailsRecovered: number,
      pageActionsTaken: number,
      bytes, costMs }

### Step 7 — Wire the quirk flag for the campus that triggered the trend
At the end, find the one campus the scraper-trends row references
(query `scraper_performance_verdicts` or the trend row's source). Set
its `directory_needs_interactions = true` so the next scrape exercises
the new path. Do NOT enable the quirk globally for any vertical yet —
we need observation data first.

## Verification (do all of these before declaring done)

1. Run auto-scrape on University of Arkansas
   (campus id e631c8de-37a3-4aae-a948-a64bd20ea4c5).
   - rmpUrl is discovered without manual paste.
   - Bakke, Rawson, Hayes, Petrone, Bryan, Jarnagin, Reed, Robinson
     get rmp_rating populated (most of them — accept ≥70%).
   - Any miss has rmp_checked_at set and renders `· no match`, never
     a bare `—`.
2. Run rmp-scrape on a campus where you temporarily switch the
   vertical to a non-accounting one with `rmpDepartmentMatchers: []`
   and `rmpAcceptAllDepts: false`. Confirm counters.unmatched > 0
   and nothing is inserted — proves the generalization is safe.
3. Pick the campus flagged by the mailto_obfuscation trend, enable
   `directory_needs_interactions`, scrape it, and confirm
   `emailsRecovered > 0` in the debug bundle and at least one new
   suggestion appears with a real email that wasn't there before.
4. Pick three accounting campuses that previously scraped fine
   (any green ones in scraper-trends). Re-scrape with the quirk flag
   OFF and confirm: same number of suggestions, similar latency
   (±20%), no new mailto debug bundles. Proves the gate works.
5. Inspect scrape_debug_bundles for: an rmp run, a mailto recovery
   run, and a baseline run. Each should have a distinct `kind` and
   useful counters.

## Out of scope for this PR (do not touch)

- Card-block extractor / junk-row filtering (.lovable/plan.md owns it).
- Campaign builder / email send paths.
- Any UI outside the leadfinder review table and RmpScrapePanel.
- New tables, new edge functions, new third-party services.

When you finish, post a short summary listing:
  - Files changed
  - Counters from each verification run
  - One paragraph on what would need to change to enable the mailto
    quirk for a whole vertical (so we know the rollout path).
````

## Decisions I'd recommend before sending the prompt

1. **Junk-row cleanup stays a separate PR.** The Arkansas "added leads" problem is a card-segmenter issue, not RMP or mailto. The prompt above explicitly leaves it alone so Claude doesn't tangle the two refactors. Say so if you want them combined; I'd advise against it.
2. **Quirk gating defaults OFF.** The prompt enables `mailto_js_obfuscation` per-campus rather than per-vertical, because the trend has fired exactly once. Once we have ~5 confirmed campuses for a given vertical we can flip the vertical default. Confirm you're OK with that conservative default.
3. **Empty `rmpDepartmentMatchers` = match nothing (not match all).** Safer for cross-vertical expansion — it forces you to make a deliberate choice per vertical instead of accidentally pulling every prof at the school into an accounting campaign. The `rmpAcceptAllDepts: true` escape hatch is there if a future vertical genuinely wants "everyone."
