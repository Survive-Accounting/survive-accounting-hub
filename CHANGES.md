# Campus rep — interest pages (marketing + capture only)

Branch `campus-rep-interest`.

## Scope held

Built: the per-campus ad page, the generic picker, the interest form with its decline path, the
Twilio alert, the admin queue, and the footer link.

**Not built, deliberately:** rep links, codes or attribution; rep dashboards; commission tracking or
payouts; W-9 / 1099 handling; automated approval or onboarding email. None of these are stubbed
either — a half-built payout column is worse than an empty one, because it looks finished.

## Two findings that changed the plan

**There are no campus pages.** The brief scopes the rep route to "every school with a published
campus page", and `/ole-miss` and `/university-of-mississippi` both 404 in production. The rep pages
are therefore keyed on the school table directly rather than hung off a campus page that does not
exist.

> This also means **the campus flyer's QR points at a dead page** — `/{school}?s=flyer` 404s. That is
> a live bug in the flyer work shipped earlier today and is called out separately below.

**The route accepts either namespace.** The brief writes `/ole-miss/rep` — the picker *id* — while
`/go/` URLs use the campus *slug* (`university-of-mississippi`). Both resolve, because these links
get typed and forwarded and a rep should not have to know which one we meant. Campus context is
given the resolved slug, so the subhead shows the real course code (`ACCY 201`) either way.

## Where applications are stored, and why not their own table

They want a table — name, contact, school, year, pitch, a mutable status and a note. DDL still
cannot be run from this machine, so a feature depending on a new table would ship not working.

Two existing tables could hold it:

- **`student_intake_submissions`** has nearly every field — and *drives Lee's onboarding*
  (`routing_result`, `booking_link_shown`, `onboarding_*`). A rep application landing there risks
  being routed into a student booking flow. **Rejected.**
- **`referrals`** is thin free text, 0 rows, used only by the "not listed" capture behind its own
  prefix, and nothing processes it automatically. **Chosen.**

An application is one `referrals` row whose `raw_text` is a JSON envelope behind `[CAMPUS REP]`.
Status and note live in the envelope; the admin does read-modify-write on a single row, which is
fine at the volume a one-person business generates.

**`0119` is written and NOT applied** — it creates the real table with a status CHECK, indexes and
RLS denied by default, plus the `INSERT…SELECT` to migrate the interim rows. One code change in
`campus-rep.functions.ts` follows when it lands.

## The work-authorisation gate

Required, and **enforced server-side as well as in the browser** — a required checkbox that only
exists in the client is not a control. Unchecked, the form declines politely and **stores nothing**:
no row, no alert. Verified: `referrals` still holds 0 rows after walking the decline path.

Capturing someone we would have to turn down, and keeping their details on file, is worse for them
than not asking. The decline copy says nothing was submitted, and still offers them the free exam.

## Verified

`tsc` clean, 1319 tests pass.

- `/ole-miss/rep` — headline, subhead with **ACCY 201**, all three points, the honest line, all seven
  fields, school pre-filled as "Ole Miss", submit disabled until valid + authorised.
- Decline path — shown, reversible, form removed, **0 rows written**.
- `/rep` — picker only, no duplicate pitch, "somewhere else" fallback line.
- Footer link added to the navigate column; navbar and hamburger untouched.

**Screenshots not delivered** — the Browser pane does not composite frames.

---
# Chapter flyers — dynamic generation, preview, download, print

Branch `chapter-flyers`. One SVG template, ~1,100 chapters, rendered on demand.

## Prerequisite: the Tennessee merge landed first

The brief was explicit that flyers must not be generated against a slug about to be
merged — printed assets are permanent. Executed before any flyer work, dry run first:

| | before | after |
|---|---|---|
| `University of Tennessee, Knoxville` (keeper, SEC, ACCT 200) | 50 chapters | **51** |
| `University of Tennessee Knoxville` (`…-knoxville-r`) | 4 chapters | **row deleted** |
| total chapters | 1,107 | **1,104** |
| orphaned chapters | — | **0** |

The merge was **not** a bulk reassign: 3 of the 4 slugs (`alpha-tau-omega`,
`kappa-kappa-gamma`, `phi-kappa-tau`) already existed on the keeper and would have violated the
`(campus_id, slug)` unique index. All four had **zero member activity** (re-checked at execution
time, not just in the dry run), so the three duplicates were deleted and only `phi-kappa-psi` moved.

## Font licence finding

**No licence obstacle — but the premise of the brief was wrong.** The app has no self-hosted brand
fonts; every face loads from the Google Fonts CDN at runtime, so there were no font *files* for a
renderer to use.

Poppins (the template's own family) is **SIL Open Font License 1.1**, which explicitly permits
embedding and server-side rendering. Four faces are now vendored in `public/fonts/` —
Regular/SemiBold/Bold/Italic, **668KB total** — taken from the Google Fonts OFL repository with
`OFL.txt` alongside them.

> Worth recording: the first render came out in a **system fallback, not Poppins**, because resvg
> 2.6 takes `fontFiles`/`fontDirs`, not `fontBuffers` — the option was type-errored *and* silently
> ignored at runtime. That is exactly the silent font substitution the brief said to report rather
> than ship, caught by looking at the output rather than trusting a clean run.

## QR

Generated **locally** with `qrcode`, not through `api.qrserver.com` which the rest of the app uses.
A screen can be reloaded; a flyer is permanent, and a third-party outage at generation time would be
printed on paper.

- Error correction **H**, `margin: 0` — the template's white card is the quiet zone, unshrunk.
- Black `#000000` on white `#FFFFFF`, no colour, no logo overlay.
- 600×600 inside the template (2in at 300 DPI).
- Payload verified: `https://surviveaccounting.com/go/<school>/<chapter>?s=flyer`, and
  `.../<school>?s=flyer` for campus flyers.

**Scan test: NOT PERFORMED.** It requires a physical phone camera at printed size and I have no
camera. The encoded payload is verified; the physical scan is still outstanding and is Lee's.

## Cache strategy

HTTP caching, no cache table:

```
cache-control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800
etag: base64(school|chapter|courseCode|format|bytes)
```

The ETag carries the **course code**, so a school changing its code produces a different ETag and
the old flyer is replaced rather than served stale. Colourway changes ship with a deploy, which
rolls the edge cache anyway. Nothing to invalidate by hand and nothing to get out of step with the
data. Generation is ~1.2s warm; ~1,100 chapters are never pre-generated.

## Fallbacks used

**Colourway contrast guard — this bit.** The flyer background is `#14213D`, which is *identical* to
Ole Miss's `c1`. Rendered as-is, half the bolt disappeared into the paper. Any primary below 1.6:1
against the background swaps to the school's own secondary; if both are too dark it falls back to
brand red. Four of sixteen schools hit this:

| school | was | draws as |
|---|---|---|
| Ole Miss | `#14213D` navy | `#CE1126` red |
| Vanderbilt | `#1B1B1B` | `#C9A227` gold |
| Auburn | `#0C2340` | `#E87722` orange |
| Texas A&M | `#500000` | `#FFFFFF` white |

Schools with **no** colourway (every campus outside the SEC 16) get brand red `#CE1126` / blue
`#1D4E9E`, per the template.

**Missing course code** → hero reads `INTRO ACCOUNTING`, never blank and never an invented code.
79 of the 132 campuses with chapters have no code, so this path is well exercised.

**Course-code sizing** verified against the longest real case: Missouri's `ACCTCY 2026` (11 chars)
renders at font-size 200 and fits the artboard with margin — no overflow, no wrap.

## Graceful failure

Any render error returns **404, never 500**, and the on-page block removes itself via the image's
`onError`. A chapter whose flyer cannot render shows nothing; the copy-link and copy-message buttons
above it still work.

## Verification

`tsc` clean, 1319 tests pass. Endpoint checked live: PDF 200 `application/pdf`, PNG 200
`image/png`, campus variant 200, unknown chapter **404**. On-page preview loads the real
**2550×3300** image at 340px with the correct download filename
(`survive-<school>-<chapter>-flyer.pdf`).

**Screenshots not delivered** — the Browser pane does not composite frames. Sample PDFs were
generated locally for Ole Miss, Vanderbilt, Missouri (long code) and an Ole Miss campus flyer.

---
# Greek council pages — IFC / Panhellenic / NPHC / MGC outreach

Branch `greek-councils`. Private, unlisted, token-gated pages for council academics chairs.

## Council assignment report

**The council data already existed and is complete** — `campus_greek_chapters.council` was
populated by the GreekIntel seed. Nothing needed assigning, and nothing needs manual cleanup.

| value | chapters |
|---|---|
| `ifc` | 540 |
| `panhellenic` | 319 |
| `nphc` | 137 |
| `mgc` | 107 |
| `other` | 4 |
| **unassigned (null)** | **0** |

### Pages generated, per SEC school (slugged chapters only)

| School | IFC | Panhellenic | NPHC | MGC | pages |
|---|---|---|---|---|---|
| Auburn University | 30 | 18 | 7 | — | 3 |
| Louisiana State University | 20 | 12 | 9 | 4 | 4 |
| Mississippi State University | 20 | 10 | 9 | 4 | 4 |
| Texas A&M University | 22 | 14 | 8 | 11 | 4 |
| University of Alabama | 34 | 18 | 9 | 10 | 4 |
| University of Arkansas | 21 | 12 | 9 | 5 | 4 |
| University of Florida | 27 | 18 | 8 | 10 | 4 |
| University of Georgia | 29 | 19 | 8 | 11 | 4 |
| University of Kentucky | 25 | 16 | 9 | 7 | 4 |
| University of Mississippi | 17 | 11 | 9 | — | 3 |
| University of Missouri | 29 | 17 | 9 | 7 | 4 |
| University of Oklahoma | 19 | 12 | 9 | 8 | 4 |
| University of South Carolina | 28 | 13 | 9 | 8 | 4 |
| University of Tennessee, Knoxville | 23 | 14 | 7 | 6 | 4 |
| University of Texas at Austin | 25 | 14 | 9 | 12 | 4 |
| Vanderbilt University | 15 | 11 | 9 | 4 | 4 |

**62 council pages.** Auburn and Ole Miss have no MGC chapters, so no MGC page is generated there —
the "only councils with ≥1 chapter" rule doing its job rather than producing two empty boards.

The 4 `other` chapters (all UT Austin) get **no page**: `other` is not a governing body anyone
chairs, and a page for it would be a leaderboard with no audience.

## Where the tokens live, and why it is not a table

This needs mutable per-council state — token, rotation stamp, last-opened stamp, alert stamp for
rate limiting. That is a table's job. **DDL still cannot be run from this machine** (the Vercel CLI
is unauthenticated, so the Supabase Management PAT cannot be pulled — migration 0118, one line, is
still waiting).

Rather than ship a feature depending on a migration nobody can apply, state lives in the existing
`site_settings` single row under `councilPages`. Ceiling is 16 × 4 = 64 entries, nothing for a JSON
column. **The honest cost:** writes are read-modify-write on one row, so two admins rotating tokens
in the same second could clobber each other. With one admin that is theoretical. If it stops being
theoretical, this wants a real table.

## What was built

- **`/go/[school]/council/[slug]?k=[token]`** — `noindex, nofollow`; absent from `sitemap.xml`,
  which is a static list of public routes. Bad/missing token renders a friendly pointer to
  `/chapters` and leaks nothing about which part was wrong.
- **Leaderboard** ranked by members, second column **"Joined / wk"**. Zero-signup chapters stay on
  the board at the bottom with a `Send them the link` action — the gap between top and bottom is the
  motivation, so hiding them would remove the reason a chair acts.
- **Forward kit** — presidents email (with every chapter's own link inline), group-chat message,
  per-chapter copy list, QR slide, flyer. Every action logged to `expand_events` under `council_*`.
- **Twilio alerts** on first open and on copy actions, **rate-limited to one per council per hour**
  — a chair opening the page then copying twice is three events in ninety seconds, and three texts
  would train Lee to ignore them.
- **`/outreach/councils`** — admin list with chapters, members, last opened, copy-link and rotate.

## Two honesty notes

**"Joined / wk", not "Active this week".** The existing chapter dashboard labels the same figure
"Active this week", but the computation is `joined_at >= 7 days ago` — it is recent *signups*, not
activity. The council page uses the accurate label. **The dashboard's label is still wrong** and is
worth correcting separately.

**No grades anywhere.** Participation only, and the data to build a grade leaderboard is not
collected in the first place. The page says so out loud: *"Counts update as members sign up. Nothing
here shows grades."*

## Verification

`tsc` clean, 1317 tests pass. Verified locally against real data:

- Ole Miss **IFC = 17 chapters**, **Panhellenic = 11**, **zero overlap** — councils are separate.
- Panhellenic shows **1 member**, which confirms counting through the shell row works (members hang
  off `greek_chapters.id`, not `campus_greek_chapters.id` — counting the roster row directly would
  have returned zero for every chapter).
- Invalid token → friendly fallback, no leak, no error.
- `noindex, nofollow` present.

**Screenshots not delivered** — the Browser pane does not composite frames, so `screenshot` times
out. All figures above are DOM measurements.

---
# Data audit — schools, course codes, professors (report only, 2026-08-19)

Read-only. Nothing was written, no migration was run. Queried the live project `unvxagsledbsdoremqeb`.
Every count below was fetched with explicit `.range()` paging (PostgREST caps a response at 1,000
rows regardless of `.limit()`), and cross-checked against `count: "exact"`.

---

## 1. Schools

**946 campus records total.**

| SEC flag | count |
|---|---|
| `is_sec = true` | **16** |
| `is_sec = false` | 439 |
| `is_sec IS NULL` | 491 |

**How SEC status is determined:** a real boolean column, `campuses.is_sec`. It is reliable for the
16 true rows — they match the intended SEC list exactly. But **491 rows are NULL rather than false**,
so `is_sec` is *not* a clean two-state flag; treat `= true` as the only trustworthy test and never
`!= true` or `= false` to mean "non-SEC".

Slugs: **434 of 946 have no slug**; **0 duplicate slugs** among those that do.

### The 16 SEC schools

| short_name (DB) | canonical (code) | slug | intro_1 code | profs | colour | chapters |
|---|---|---|---|---|---|---|
| Auburn | auburn | auburn-university | ACCT 2110 | 19 | yes | 56 |
| LSU | lsu | louisiana-state-university | ACCT 2001 | 15 | yes | 46 |
| Mississippi State | mississippi-state | mississippi-state-university | ACC 2013 | 4 | yes | 43 |
| Texas A&M | texas-am | texas-aandm-university | ACCT 229 | 29 | yes | 56 |
| **Bama** | alabama | university-of-alabama | AC 210 | 21 | yes | 72 |
| Arkansas | arkansas | university-of-arkansas | ACCT 2013 | 26 | yes | 48 |
| **UF** | florida | university-of-florida | ACG 2021 | 8 | yes | 64 |
| **UGA** | georgia | university-of-georgia | ACCT 2101 | 30 | yes | 68 |
| **UK** | kentucky | university-of-kentucky | ACC 201 | 16 | yes | 58 |
| Ole Miss | ole-miss | university-of-mississippi | ACCY 201 | 21 | yes | 38 |
| **Mizzou** | missouri | university-of-missouri | ACCTCY 2026 | 12 | yes | 63 |
| **OU** | oklahoma | university-of-oklahoma | ACCT 2113 | 22 | yes | 49 |
| **USC** | south-carolina | university-of-south-carolina | ACCT 225 | 23 | yes | 59 |
| **UT Knoxville** | tennessee | university-of-tennessee-knoxville | ACCT 200 | 16 | yes | 50 |
| **UT Austin** | texas | university-of-texas-at-austin | ACC 311 | 7 | yes | 65 |
| **Vandy** | vanderbilt | vanderbilt-university | BUS 1100 | 5 | yes | 40 |

SEC totals: **274 pickable professors**, 2,166 raw lead rows, **875 chapters**.

### Data-quality problems

**Nicknames — 10 of 16 SEC rows.** `campuses.short_name` holds `Bama`, `UF`, `UGA`, `UK`, `Mizzou`,
`OU`, `USC`, `UT Knoxville`, `UT Austin`, `Vandy`. **These are not rendered to students today** —
`src/lib/schools.ts` is the canonical display name and the Greek picker was pointed at it. The DB
column is still the hazard: any new surface that reads `short_name` re-introduces them.

**Slug mismatch, school vs Greek `/go/`: NONE.** All 16 entries in `schools.ts` resolve to a slugged,
`is_sec = true` campus, and **0 of 1,107 chapters** reference a campus id that doesn't exist. The two
datasets already share one canonical slug — that was fixed when `schools.ts` was introduced.

**Near-duplicate school records — 15 clusters.** Two touch SEC:

- `University of Texas at Austin` **[SEC]** vs `The University of Texas at Austin`
- `University of Tennessee, Knoxville` **[SEC, 50 chapters]** vs `University of Tennessee Knoxville`
  (4 chapters, slug `…-knoxville-r`) — **the same school twice, and the 4 chapters on the duplicate
  are unreachable from the picker.**

The rest are non-SEC and mostly an abbreviated unslugged row beside a full one (`Case Western
Reserve Univ` / `Case Western Reserve University`, `Univ of Central Florida` / `University of
Central Florida`, …). Also two unicode-only pairs: `Wisconsin-Madison` vs `Wisconsin–Madison`
(en-dash) and `King's` vs `King’s` (curly apostrophe).

---

## 2. Course codes

**315 of 946 campuses have an `intro_1` code; 631 do not.** All 16 SEC schools have one — **no SEC
school is missing a code.**

**Structure — codes are already per-course, not per-school.** They live in
`campuses.course_family_codes_json`, a JSON map keyed by course family:

| key | campuses populated |
|---|---|
| `intro_1` | 315 |
| `intro_2` | 302 |
| `intermediate_1` | 300 |
| `intermediate_2` | 291 |

So the schema **already supports four courses per school** and the data is largely there. Only the
app is single-course: `listCampusIntroCodes` reads `intro_1` and nothing else.

**Placeholder / malformed codes — 2, both non-SEC:**

- `"ACCT 209/229/640"` — Texas A&M University Coll (three codes in one field)
- `"BNAC 260"` — Linfield College (probably a typo for BNAC/ACCT)

The 631 missing are overwhelmingly small non-SEC campuses that were never enriched.

---

## 3. Colorways

**Stored in CODE, not the database:** `SEC_SCHOOLS` in `src/components/canvas/brand.tsx`, as hex
pairs `{ id, name, c1, c2 }`. **16 defined — exactly the SEC 16. Every other campus (930) has none**
and falls back to the brand red/blue bolt.

Note there are also `campuses.primary_hex` / `secondary_hex` columns (and a `campus_spirit` table
with 1 row), but **nothing in the student-facing app reads them** — the code table is the live source.

**Low contrast against the page navy `#0F1A2E`** (the bolt carries a permanent white keyline, so
these still read — but they are the ones to inspect on a campus page):

| school | colour | ratio |
|---|---|---|
| vanderbilt | `#1B1B1B` | **1.01:1** |
| **ole-miss** | `#14213D` | **1.09:1** — *identical to `--brand-navy`* |
| auburn | `#0C2340` | 1.10:1 |
| texas-am | `#500000` | 1.11:1 |
| georgia / missouri / south-carolina (c2) | `#000000` | 1.21:1 |
| mississippi-state | `#660000` | 1.30:1 |
| lsu | `#461D7C` | 1.43:1 |
| south-carolina | `#73000A` | 1.44:1 |
| florida | `#0021A5` | 1.46:1 |

**Near-identical pairs** (RGB distance): `alabama #9E1B32` ≈ `arkansas #9D2235` (**distance 8 —
effectively the same crimson**), `auburn #0C2340` ≈ `ole-miss #14213D` (9), `florida` ≈ `kentucky`
(19), `mississippi-state` ≈ `south-carolina` (16).

### University marks — one thing to flag

**No logo, wordmark, crest or seal is stored or referenced anywhere.** `public/` contains only
Survive Accounting brand assets and Lee's photos.

**But mascot names and cheers ARE stored:** `campuses.mascot` is populated for **290 campuses**, with
`campuses.cheer` holding things like `Hook 'em Horns`, `Woo Pig Sooie!`, `Geaux Tigers`, `Anchor
Down`. `mascot_verified` is true for **1** row. There is also an unrendered component,
`src/components/onboarding/SpiritMoment.tsx`, which would display `Go {mascot}!` — **it is not
imported anywhere, so nothing reaches a student today.** Those cheers are university trademarks; the
data exists and one import away from shipping.

---

## 4. Course structure — what multi-course would take

Better than expected. The schema is **already course-aware in three of the four places**:

| thing | linked to | ready for multi-course? |
|---|---|---|
| course codes | `campuses.course_family_codes_json` keyed by family | **yes** — 4 keys already populated |
| courses | `courses` table: 5 rows (`intro-accounting-1`, `intro-accounting-2`, `intermediate-accounting-1`, `intermediate-accounting-2`, `accounting-foundations`), with `course_family`, `code`, `status` | **yes** |
| professors | `campus_lead_suggestions` has `teaches_intro_1`, `teaches_intro_2`, `teaches_intermediate_1`, `teaches_intermediate_2` | **yes** — per-course booleans already exist |
| topics/CEQs | `chapters.course_id` → `courses.id` | **yes** |

**So school → course → professor is already expressible. Nothing is "assumed to belong to the single
existing course" at the schema level.** What is hard-coded is the *application*:

- `listCampusIntroCodes` reads only `intro_1`
- `SEAT_COURSE_SLUG = "intro-accounting-1"` — seats grant one course
- the landing player resolves one course's exam tabs
- `campus-context` exposes a single `code`

**Estimate: this is an application change, not a migration.** No new tables, no new columns. The work
is threading a `courseFamily` through campus context, the code lookup, the player's tab resolution,
and the seat grant — roughly the same shape and size as the campus-context pass, and with the same
risk profile (one shared source, then remove per-component guesses). The professor picker would also
need to filter on `teaches_<family>`, which today it ignores entirely.

---

## 5. Professors

**There is no `professors` table.** They live in **`campus_lead_suggestions`** — the ProfIntel
outreach lead table — which the picker filters down to a high-confidence roster:

```
active_roster IS NOT NULL  AND  rmp_profile_url IS NOT NULL  AND  archived_at IS NULL
```

| | count |
|---|---|
| raw rows | **16,085** |
| **pickable** (passing all three filters) | **290** |
| pickable at SEC schools | **274** |
| rows with no `campus_id` | **0** |
| rows pointing at a campus that doesn't exist | **0** |

**Referential integrity is clean.** The gap is the filter: **1.8% of rows are pickable**, because
the table is a scraping/outreach corpus first and a student-facing roster second.

Schema is wide (~60 columns). The relevant groups: identity (`first_name`, `last_name`, `email`,
`title`, `department`), **course teaching flags** (`teaches_intro_1/2`, `teaches_intermediate_1/2`,
`courses_found`, `rmp_course_codes`), **RMP data** (`rmp_rating`, `rmp_num_ratings`,
`rmp_difficulty`, `rmp_would_take_again`, `rmp_profile_url`, `rmp_checked_at`, plus target-course
match JSON), Hasselback (`hasselback_match`, `hasselback_tenured`, `hasselback_areas`), lifecycle
(`active_roster`, `archived_at`, `archived_reason`, `status`), and **mobility** (`mobility_status`,
`moved_to_campus_id` — professors who changed schools).

**Schools with zero pickable professors: 916 of 946.** Only 30 campuses have any, and 16 of those
are the SEC schools.

---

## 6. Readiness

Bucketed across **all 946 campuses**:

| bucket | definition | count |
|---|---|---|
| **A — Full** | code + colourway + ≥1 professor | **16** |
| **B — Partial** | code, but no colourway and/or no professors | **299** |
| **C — Blocked** | no `intro_1` code | **631** |

**A (16) — exactly the SEC schools:** alabama, arkansas, auburn, florida, georgia, kentucky, lsu,
mississippi-state, missouri, ole-miss, oklahoma, south-carolina, tennessee, texas, texas-am,
vanderbilt.

**B (299)** — every one of these is missing the colourway (only 16 exist), so B is really "has a
course code, no brand colours, almost certainly no professors". Sample: Elon University, Eastern
Kentucky University, Delaware State University, Georgetown University, Indiana University, Gannon
University, Fayetteville State Univ, Embry-Riddle Daytona, Univ of Alaska Southeast…

**C (631)** — cannot publish a campus page without inventing a course code.

The practical read: **A and "SEC" are the same 16 schools.** Campus pages beyond the SEC are a
content problem (colourways, course codes, professor rosters), not an engineering one.

---

## 7. Testimonials

**Not a database table.** Hard-coded as `TESTIMONIALS` in `src/routes/landing.tsx`, curated from a
`testimonials.csv` that is not in the repo.

- **10 testimonials.**
- **All 10 tagged `school: "Ole Miss"`** — there is no other school represented.
- The type is `{ name, school, long, quote, avatar?, code? }` — it **already has an optional `code`
  for course attribution, and zero testimonials populate it.**

**Can they support school attribution on a matching campus page?** Structurally yes — `school` is a
field and filtering by it is trivial. **In practice no:** a campus page for any school other than
Ole Miss would filter to zero testimonials. Course attribution is supported by the type and unused.

Two of the ten mention courses in free text ("both intro courses", "first intermediate exam"), so
the content for course tagging exists but has not been captured into the field.

---

## 8. Greek cross-check

- **1,107 chapters** across **132 campuses**; 1,093 slugged.
- **875 chapters (79%) sit at the 16 SEC schools.**
- **Chapters whose campus doesn't exist: 0.** No orphans.
- **Chapters whose school slug doesn't match a school record: 0.**

**Campuses with chapters but NO `intro_1` code: 79 of the 132** (≈232 chapters). Their `/go/` pages
work — the header degrades to plain "Intro Accounting" — but cannot show a course code. Largest:
Florida State (4), Ohio State (4), Oklahoma State (4), Miami (4), Berkeley (4), Purdue (4),
Michigan State (4), Nebraska (4), Virginia Tech (4), Kansas (3), Duke (2), Pittsburgh (2).

---

## Queries used

All run read-only against `unvxagsledbsdoremqeb` via the service role. SQL equivalents for re-running
in the Supabase editor:

```sql
-- 1. schools + SEC split + slug health
select count(*) total,
       count(*) filter (where is_sec)            sec_true,
       count(*) filter (where is_sec = false)    sec_false,
       count(*) filter (where is_sec is null)    sec_null,
       count(*) filter (where slug is null)      no_slug
from campuses;

select slug, count(*) from campuses where slug is not null group by slug having count(*) > 1;

-- 2. course codes, per family
select count(*) filter (where course_family_codes_json->>'intro_1'         <> '') intro_1,
       count(*) filter (where course_family_codes_json->>'intro_2'         <> '') intro_2,
       count(*) filter (where course_family_codes_json->>'intermediate_1'  <> '') intermediate_1,
       count(*) filter (where course_family_codes_json->>'intermediate_2'  <> '') intermediate_2
from campuses;

select name, course_family_codes_json->>'intro_1' code
from campuses where is_sec order by name;

-- 5. professors: raw vs pickable, and orphans
select count(*) raw,
       count(*) filter (where active_roster is not null
                          and rmp_profile_url is not null
                          and archived_at is null) pickable
from campus_lead_suggestions;

select count(*) from campus_lead_suggestions p
  left join campuses c on c.id = p.campus_id where c.id is null;   -- orphans (0)

select c.name, count(*) profs
from campus_lead_suggestions p join campuses c on c.id = p.campus_id
where p.active_roster is not null and p.rmp_profile_url is not null and p.archived_at is null
group by c.name order by profs desc;

-- 8. greek cross-check
select c.name, count(*) chapters,
       (c.course_family_codes_json->>'intro_1') code
from campus_greek_chapters g join campuses c on c.id = g.campus_id
group by c.name, code order by chapters desc;

select count(*) from campus_greek_chapters g
  left join campuses c on c.id = g.campus_id where c.id is null;   -- orphans (0)

-- university marks held in data
select count(*) filter (where mascot is not null) with_mascot,
       count(*) filter (where mascot_verified)    verified,
       count(*) filter (where cheer is not null)  with_cheer
from campuses;
```

Colourways and testimonials are in code, not SQL:
`src/components/canvas/brand.tsx` (`SEC_SCHOOLS`) and `src/routes/landing.tsx` (`TESTIMONIALS`).

---
# Pipeline v2 — timeline, waveform zoom, transcript editing (Q0-Q3)

On `main` (vertical-filming -> main). Studio/filming code only — no landing, no Greek.

> Both sessions write this file; this entry STACKS on top of the Greek rework rather than replacing it.

---

## Q0 — Unblock a stuck set
DETACH now works on EVERY clip, including ones attached before the take store existed:
`ensureScratchRecord` reconstructs the missing kept-take record from the clip itself so it
lands in the scratch lane (files never touched). CLEAR ALL CLIPS detaches a whole set back
to scratch to re-cut from zero. RECYCLE is a bin ICON toggle now (count badge, drawer with
restore + open folder) — the always-open list and the "Recycle: N takes" line are gone.

## Q1 — Timeline rebuild
The Pipeline is an EDITING room: the frame spine is dropped, the capture window is a
pull-out MODAL (kept mounted so the OBS popout survives), and a large cut preview sits over
a single HORIZONTAL timeline (PipelineStage). One track, clips in cut order sized by trimmed
duration, thumbnails, drag-to-reorder, drag a scratch take to insert, detach -> scratch, a
red playhead, click/scrub to seek (useCutPlayer gained playFromMs + a live position;
cut-sequencer gained pure seekTarget/segmentStartsMs/seqSeek). A frame-marker row maps
regions to CEQs; clicking one switches to AUTHORING on that frame. TRUE RENDER reads as the
FINAL bake vs the instant inline preview.

## Q2 — Waveform zoom + fine trim
Selecting a clip opens a TRIM DETAIL: the waveform LARGE with landmarks (slate, onset,
offset). Mouse-wheel zooms centered on the cursor (down to ~60ms — cut between two words);
drag pans; click scrubs and plays so you HEAR the cut. Handles snap to landmarks; arrow =
50ms, shift+arrow = 10ms nudge the selected handle; exact in/out timecodes show ms-precise.
Recipe only; nothing bakes until True Render.

## Q3 — Transcript-based editing (Whisper, word-level)
Kept takes are transcribed in the background (OpenAI Whisper, verbose_json + word
timestamps — NOT Mux), stored in Supabase keyed by storage path. The trim detail gains a
transcript panel: karaoke highlight tracks playback, click a word to seek, select a word
range to "trim to selection" or "cut selection". An internal cut splits the recipe into two
segments of the same take around the removed words (non-destructive, honored by True Render);
split segments are marked and not individually draggable. Transcript-driven cuts log to the
edit-telemetry stream.

> **Lee — two SQL files to apply** in the Supabase SQL editor (I cannot; the token is
> write-only): `0117_edit_events.sql` (from the earlier telemetry work) and
> `0118_take_transcripts.sql`. And set **OPENAI_API_KEY** in Vercel env to enable
> transcription. Until then: the edit log queues locally + exports "local-only", and
> transcription queues (words just do not appear yet). Nothing is lost. Whisper's 25MB
> upload cap means very long takes fail loud (a worker audio-extract is the future fix).

## Not verified without OBS + real data
Every phase is unit/pin-tested (1308 pass), tsc + prod build clean. The full acceptance
walkthrough (film -> drag -> zoom-cut -> transcript-cut -> scrub -> True Render) needs a
live filming session; the Studio overlay also needs a displayed browser pane to composite,
so headless driving was limited (no console errors observed).

---
# Greek rework Pass 2 — portal minimal, chapter page sells

Branch: `greek-rework-2`, on top of `main` @ `230647a3`.

> Both sessions write this file, so this entry STACKS on top of what follows.

---

## The correction

Pass 1 put the chapter-level pitch on the **portal**. That was the wrong room twice over: a visitor
to `/chapters` has not said who they are or which chapter they belong to, so the argument was aimed
at nobody in particular — and the exec it was written for only reaches that decision on their **own
chapter's page**, where the numbers are about their house.

## 1. Portal — a hallway

Final contents: wordmark, `Find your chapter.`, one line, one card. Verified: **2 selects, 0 forms,
zero sales copy**.

Removed: the GPA headline, the "Dozens of your members…" subhead, the three benefit pills, pricing,
and the second stacked form (`Set up your chapter`).

`SignupFlow` is **kept in the file but no longer rendered**. `noUnusedLocals` is off so it compiles,
and it is one line from being placed anywhere. Deleting a working SMS chapter-creation flow on an
ambiguous instruction ("the claim/setup form still exists") seemed worse than parking it and saying
so here.

**`/greek` added as a redirect to `/chapters`** — the brief calls it the Greek portal and that URL
404'd. A redirect rather than a rename: `/chapters` is printed on flyers, sits in sent SMS, and
carries `/chapters/dashboard` beneath it.

## 2. Chapter page — where the pitch lives

The page no longer opens with the generic student hero. `LandingPage` gains a **`chapterTop` slot
that replaces the hero**; every other route is untouched.

The top is one ordered block:

    chapter header (name · school, that school's bolt, that school's course code)
      -> inline role fork
        -> the chosen path

**Exec path**, measured in the delivered order:

| element | y |
|---|---|
| chapter headline | 148 |
| `Intro accounting is quietly wrecking your chapter's GPA.` | 303 |
| subhead | 378 |
| first benefit pill | 462 |
| dashboard preview | 634 |
| `Seats are $100/member per semester, 10 minimum.` | 815 |
| claim form | 890 |
| (player) | 909 |

**Member path** is short: no pitch, no claim form, one quiet `On exec? Claim this chapter →`, and
the player starts at **y=317**.

**The fork is inline now.** It previously rode in the claim slot, which floated it above the hero so
it read as an interruption laid over a page rather than the page's first step.

## 3. The dashboard preview is NEW, not moved

There was **no mockup anywhere in the repo** — the brief said to move one, and there was nothing to
move. It mirrors the three figures `/chapters/dashboard` actually renders (members joined, active
this week, sets completed) rather than inventing prettier ones.

It shows **em-dashes, not sample numbers**. A fake "47 members" on a page that names a real chapter
is a claim *about that chapter*, and would be a lie to the one person who knows the true number.

## 4. What the stray artifact turned out to be

**It was the hero bolt.**

With the claim modal's 72%-opaque backdrop over the page, the bolt — 176×237 at x 960–1136, carrying
its own `drop-shadow` glow — was the one bright, isolated shape showing through, which reads as a
floating thumbnail or preview panel. Confirmed by hit-testing that region with
`document.elementsFromPoint`: the only element there was `button.sa-paper`.

It is gone from chapter pages because the generic hero is. Nothing was added to hide it.

## 5. Member attribution survived the redesign

Worth recording, because it was nearly lost silently. Removing the banner also removed its
`Claim your free access` form — which was the thing that **recorded a member against the chapter**,
and that count is what the exec dashboard is built on.

Choosing `I'm a member` on the chapter's own URL now *is* the attribution: `tagChapterMember` fires
fire-and-forget, nothing awaited, so a failed tag can never block access to the free exam.

**Lost in the trade:** the old form also captured name and mobile. The tag now records the member
without them. That is the right call for a member path the brief says must be short, but it is a
real reduction in what Lee learns about who joined.

## Carried-in fixes

- **Duplicate forms** — one card on the portal. ✓
- **Fork placement** — inline in page flow. ✓
- **Claim modal close controls** — re-verified on the new layout: ×, Esc, and click-outside all
  close it, and it still survives an inside-to-outside drag. ✓
- **Stray artifact** — identified and gone. ✓
- **Campus context** — Ole Miss chapter: `ACCY 201`, bolt `#697183/#CE1126`. LSU chapter:
  `ACCT 2001`, bolt `#FDD023/#896eab`. No cycling, no foreign branding. ✓

> The only other-school names on a chapter page are testimonial attributions in `<figcaption>`
> ("— …, Ole Miss") and the player's own school picker. Both are correct; noting it because a naive
> text search flags them.

## Now unrendered (flagged, not deleted)

- `SignupFlow` — see above.
- `ChapterBanner` and `ClaimModal` — still wired to `LandingPage`'s `chapterBanner` prop, which
  `/go/` no longer passes (the chapter header states the chapter, school and course in type, so the
  strip was the third place the same fact appeared). The prop still works if anything passes it.

## Verification

- `tsc --noEmit` clean; `bun test` **1274 pass / 0 fail**.
- Every figure above is a DOM measurement — **screenshots still not delivered**, as the Browser pane
  does not composite frames and `screenshot` times out.

---
# Greek rework — bugs, positioning, role fork

Branch: `greek-rework-1`. Landing/Greek only — no studio, no filming.

> Both sessions write this file, so this entry STACKS on top of what follows.

---

## 1. The two blocking bugs

### The banner was not a stacking bug

At `scrollY 0` the banner sits at y=71, already clear of the 55px sticky navbar. **The page was
scrolling itself ~74px on load.** The exam outline calls `scrollIntoView({block:"nearest"})` to
reveal the active topic, and `nearest` does not mean "the nearest container" — the browser adjusts
*every* scrollable ancestor, and the document is always one of them. The outline had no scrollable
ancestor of its own, so the only thing left to scroll was the window.

`src/lib/ui-scroll.ts` scrolls the nearest scrollable **ancestor** and nothing else, and does
nothing when there isn't one. The CTA's deliberate scroll to `#exam1` is untouched.

### The claim form had no way out at all

No ×, no Esc, no click-outside — the only exit was a reload, which also discarded anything typed.
All three added.

`src/lib/use-dismiss.ts` is one hook rather than three hand-rolled handlers. Two details worth
keeping:

- It tracks where a press **started**. Selecting text inside a panel and releasing outside fires a
  click on the backdrop; on `click` that closes the dialog and destroys the input.
- `enabled` is not optional in practice. A closed overlay that keeps listening eats Escape from
  whatever the visitor actually has open.

### Modal audit — every overlay in the app

| overlay | × | Esc | outside | action |
|---|---|---|---|---|
| `ClaimChapter` | ✗ | ✗ | ✗ | **all three added** — the reported bug |
| `SignInDialog` (`/learn`) | ✗ | ✗ | ✓ | × + Esc added |
| `ClaimModal` (banner) | ✓ | ✗ | ✓ | Esc added |
| `NotifyModal`, `SyllabusModal` | ✓ | ✓ | ✓ | already complete |
| `/learn` player + paywall | ✓ | ✓ | ✓ | already complete (one shared page-level handler) |
| header menu | ✓ | ✓ | ✓ | already complete |
| canvas / outreach overlays | — | ✓ | ✓ | **reported, not changed** — Lee-only surfaces, and `study_.canvas.tsx` is owned by the filming session |

**One further finding, not fixed:** every backdrop uses `onClick`, so all of them share the
text-selection-drag defect described above. Only `ClaimChapter` was migrated to the hook. Low
severity (a stray drag closes a dialog), but it is real and it is app-wide.

---

## 2. School + chapter data

### The nicknames were in the database, not the picker

`listGoSchools` mapped `short_name || name`, and `campuses.short_name` is where `Bama`, `Mizzou`,
`OU`, `Vandy`, `UT Austin`, `UF`, `UGA`, `UK`, `USC` live. The main site's list was already clean;
the Greek picker was rendering a different column. It now resolves through `canonicalSchoolName`
(see the campus-context entry), so all 16 read exactly as the landing picker does.

**SEC scoping already worked** — `is_sec = true` is exactly the right 16.

### Seed report — 1,107 chapters across 132 campuses

| school | chapters | slugged | intro-1 code |
|---|---|---|---|
| Alabama | 72 | 71 | AC 210 |
| Georgia | 68 | 67 | ACCT 2101 |
| Texas | 65 | 64 | ACC 311 |
| Florida | 64 | 63 | ACG 2021 |
| Missouri | 63 | 62 | ACCTCY 2026 |
| South Carolina | 59 | 58 | ACCT 225 |
| Kentucky | 58 | 57 | ACC 201 |
| Auburn | 56 | 55 | ACCT 2110 |
| Texas A&M | 56 | 55 | ACCT 229 |
| Tennessee | 50 | 50 | ACCT 200 |
| Oklahoma | 49 | 48 | ACCT 2113 |
| Arkansas | 48 | 47 | ACCT 2013 |
| LSU | 46 | 45 | ACCT 2001 |
| Mississippi State | 43 | 43 | ACC 2013 |
| Vanderbilt | 40 | 39 | BUS 1100 |
| Ole Miss | 38 | 37 | ACCY 201 |

**875 chapters at the 16 SEC schools.** The other 116 campuses are non-SEC with 1–4 chapters each
and mostly no course code; they are not offered in the Greek picker.

**Malformed / nickname-style rows:** none in the campus NAMES — the DB stores proper full names
(`University of Mississippi`). The nickname problem was entirely `short_name`, above.

**Two real data findings:**

1. **Duplicate campus.** `University of Tennessee, Knoxville` (50 chapters,
   `university-of-tennessee-knoxville`) and `University of Tennessee Knoxville` (4 chapters,
   `university-of-tennessee-knoxville-r`) are two rows for one school. No slug collision — the
   backfill's `-r` suffix avoided it — but the 4 chapters on the second row are unreachable from
   the picker, which only offers the `is_sec` row.
2. **The unslugged tail.** 14 chapters across the SEC schools have no slug (the "slugged" column
   above), deliberately: they are the duplicate `greek_orgs` rows the Phase-1 backfill declined to
   give a second URL to. They have no `/go/` page by design.

### Escape hatches

Both `My school isn't listed →` and `My chapter isn't listed →` open a four-field capture
(school, chapter, name, email-or-mobile) that texts Lee via `FOUNDER_ALERT_PHONE`.

Deliberately **not** the existing `SignupFlow`: that creates a chapter and verifies an officer by
SMS code, which is the wrong instrument for someone reporting a gap in the roster — and Twilio is
**not configured in production**, so it would dead-end.

> **Storage is a deliberate reuse, flagged.** Rows go to `referrals` behind a `[GREEK NOT LISTED]`
> prefix rather than a table of their own, because a new table needs DDL against the Management API
> and this machine has no PAT for it (the Vercel CLI is not authenticated, so the token cannot be
> pulled). The SMS is the real delivery path; the prefix keeps the rows greppable and they migrate
> later with a single `INSERT…SELECT`.

---

## 3. Greek landing — positioning

Headline now names the **problem**, not the offer:

> Intro accounting is quietly wrecking your chapter's GPA.

**Removed entirely**, all of which explained our mechanics to someone still deciding whether the
problem was real:

- `Every chapter is already live — no signup needed to see yours.`
- `One link, every member. Share it in the group chat… semester seats are $100/member (10 minimum).`
- the numbered 1/2/3 `Find your chapter / Share your link / Watch it work` strip

Pricing is out of the hero entirely. Three flat benefit statements replace the steps.

**One entry card.** Two bare dropdowns and a button with an unrelated link floating underneath read
as three loose controls; in a card with a `Find your chapter` header they read as one form. The
chapter picker is disabled until a school is chosen and says `Pick your school first` rather than
pretending to be ready.

---

## 4. Role fork

A `/go/` page serves two people with almost nothing in common. The fork asks once, in the slot
directly under the banner — **one slot, three states**: unknown role asks; an exec gets the claim
control; a member gets nothing there.

**The member path is never gated.** Exam 1 is free for everyone, so a member on an *unclaimed* page
gets it immediately. The chapter's claim status is an exec concern and must never become a
student's problem.

**Stored per chapter**, not globally — the same person can be an exec of their own house and a
member of a friend's. `accountRole` is threaded through and passed `null` today; the hook already
prefers it over storage, so wiring sign-in later needs no change at the call site.

---

## 5. Chapter page copy — "courtesy" was a false claim

`Free Exam 1, courtesy of [Chapter]` sat on **every unclaimed page**, crediting a chapter that had
done nothing — Exam 1 is free for everyone, so the line was misleading wherever it appeared.

Unclaimed pages now read `Cram videos for ACCY 201 — free Exam 1 for Alpha Chi Omega members.`,
with the course code coming from campus context (generic prose for a school without one). The
claim modal's success line still credits the chapter for the **attribution**, which is true, but
not for the exam.

**Not built:** the paid-chapter courtesy line (`Exams 2, 3 and the Final — courtesy of [Chapter].`)
for members with an assigned seat. It needs the seat lookup from Greek Phase 2b, which is still on
its own unmerged branch. The false claim is gone; the true one is not yet in.

---

## Verification

- `tsc --noEmit` clean; `bun test` **1274 pass / 0 fail**.
- `/go/university-of-mississippi/alpha-chi-omega`: `scrollY` 0 on load, banner at 71, claim link at
  128, both clear of the 55px navbar.
- Claim form closes by ×, Esc and outside-click, and **survives an inside-to-outside drag**.
- `/chapters`: all 16 names canonical with zero nicknames, chapter picker disabled with the right
  placeholder, both hatches present, every removed line confirmed absent.
- Role fork: appears with both choices and no claim; member persists and keeps Exam 1 FREE with
  2/3/Final priced; exec shows the claim; a different chapter still asks.
- **Screenshots not delivered** — the Browser pane does not composite frames, so `screenshot` times
  out. All of the above is DOM measurement.

## Still open

- Paid-chapter courtesy line (needs Phase 2b seats).
- `TWILIO_*` unset in production, so neither the claim alert nor the not-listed alert can actually
  send yet. Both save their row regardless.
- Backdrop `onClick` drag defect on the remaining overlays.

---
# Campus context — one shared source for "whose school is this?"

Branch: `campus-context`, on top of `main` @ `0277fa8f`.

> Both sessions write this file, so this entry STACKS on top of what follows.

---

## The root cause was three namespaces, not a rendering bug

The same fact was spelled three different ways and nothing joined them up:

| surface | spelling | example |
|---|---|---|
| landing picker | short id | `ole-miss`, `lsu`, `texas-am` |
| `/go/` URLs | campus slug | `university-of-mississippi`, `louisiana-state-university` |
| Greek picker | `campuses.short_name` | `Bama`, `Mizzou`, `OU`, `Vandy`, `UT Austin` |

That is why `/go/ole-miss/...` resolved to nothing (the slug is
`university-of-mississippi`) and why a chapter page could name one school in its banner while the
hero cycled another school's colourway beside it. Neither component was wrong on its own; they
never asked each other.

**`src/lib/schools.ts`** is now the one table — picker id, `campusId`, `/go/` slug, canonical name,
for each of the 16 SEC schools. Every mapping was **verified against the `campuses` table**, not
inferred from names: all sixteen resolve to a slugged campus with `is_sec = true`.

Canonical name = **the landing picker's name**, Greek pages included. A student who picks "Ole
Miss" on the front page should not meet "University of Mississippi" two clicks later and wonder
whether it's the same list.

**Course codes are deliberately NOT in that table.** They stay in
`campuses.course_family_codes_json.intro_1` and are fetched at runtime, so a code that changes
mid-semester doesn't need a deploy — and a hardcoded copy would be a second source of truth for the
exact fact this module exists to have only one of.

## The provider

**`src/lib/campus-context.tsx`** resolves campus once, in priority order:

1. `account` — signed-in user's school
2. `session` — picked this session. **Beats the URL on purpose**: a student on a chapter page who
   picks a different school in the player means it.
3. `url` — `/go/<school>/<chapter>`
4. `stored` — previous visit

None ⇒ **UNKNOWN**, and the app keeps today's cycling hero and generic copy.

A school with no verified code yields `code: null` and callers fall back to `your accounting
course`. Never a placeholder, never another school's code — that substitution is the whole failure
mode being fixed.

## Components migrated

| component | was | now |
|---|---|---|
| `LandingPage` | — | splits into a `CampusProvider` shell + `LandingPageInner` |
| hero (`ExamPaper`) | cycled all 16 regardless of page | locked when campus is known |
| player school pick | wrote `localStorage` directly | routes through `setSessionSchool` |
| player school step | asked even on a `/go/` URL | adopts the URL's school |

**The hero lock falls out of the data, not a new flag.** A known campus yields a *one-element*
`stops` array, and `ExamPaper` only starts its interval at `stops.length >= 2`. No extra machinery,
and unknown campus keeps the full rotation.

## A second bug found while wiring it

The player asked "Pick your school" on `/go/` pages even though the URL named the school.
`preSchool` derives from `initialCampusId`, which arrives from the chapter **query** — so it was
still `null` during the first render, `useState(preSchool)` captured that null and never looked
again, and the returning-visitor effect then bailed out ("chapter-link sessions keep their own
preselection") on a preselection that had silently failed. Campus context resolves the slug
synchronously, so it is right on the first render.

## Scope note — the hero text half of the reported bug was already gone

The spec's headline symptom, `Cram for ACC 311 / TEXAS` on an Ole Miss chapter page, refers to hero
copy that **Landing Pass 8 deleted earlier the same day** along with the card. Per Lee's decision,
the bolt-only hero stays; this branch fixes the **colourway** half. No hero course-code text was
resurrected.

## Schools missing a course code

**None of the 16 SEC schools.** All have a verified `intro_1` code (Ole Miss `ACCY 201`, LSU
`ACCT 2001`, Alabama `AC 210`, Tennessee `ACCT 200`, Arkansas `ACCT 2013`, South Carolina
`ACCT 225`, Georgia `ACCT 2101`, Kentucky `ACC 201`, Auburn `ACCT 2110`, Mississippi State
`ACC 2013`, Missouri `ACCTCY 2026`, Oklahoma `ACCT 2113`, Texas A&M `ACCT 229`, Florida `ACG 2021`,
Texas `ACC 311`, Vanderbilt `BUS 1100`).

The fallback path is therefore **not exercised by any SEC school today** — it exists for the
non-SEC campuses in the roster (most of the other 116 have no code) and for any future school added
before its code is confirmed.

## Verification

- `tsc --noEmit` clean; `bun test` **1181 pass / 0 fail**.
- Ole Miss chapter page locks to `#697183/#CE1126`; LSU to `#FDD023/#896eab` — each **stable across
  24s (six 4-second dwell periods)**.
- `/` with no stored school **still cycles** (`#FDD023/#896eab` → `#FFFFFF/#5c7cc2`).
- `/go/university-of-mississippi/alpha-phi` opens the player at "Pick your professor".
- **Screenshots not delivered** — the Browser pane does not composite frames, so `screenshot` times
  out. All figures are DOM measurements.

---
# Pipeline View — P0–P4 (filming → cut → telemetry, one room)

On `main` directly (vertical-filming → main), commits `c1b4460b`…`P4`. Studio/filming code only —
no landing, no Greek.

> Both sessions write this file, so this entry STACKS on top of Landing Pass 8 rather than replacing it.

---

## P0 — the two session-killers, root-caused first

**"Everything says 11 FRAMES and attaches to Q2":** three stacked defects — the badge showed the
sticky ARMED target's label (a one-time whole-set arm), Recording Mode UNMOUNTED the takes inbox
(closing the OBS websocket mid-session: no record events, no coverage, F10 into a null handler),
and record-start captured the visited-frames log BEFORE resetting it. Fixed with a module-level
coverage log (`coverage-log.ts`: begin = reset+seed, log gated on an open window, closed windows
retained so the Scan path matches late files by mtime), the inbox staying MOUNTED through Recording
Mode (`display:none` — the film-safe law is about pixels, not processes), and badges that show
COVERAGE ("Q3", "Q3–Q6") with an honest "→ armed-label" fallback.

**"Preview stops at clip 5":** no literal 5 anywhere. Stored durations are rounded to 0.1s; when
rounded UP past the real media end, the final timeupdate never crossed `outS−0.03` and `ended`
fired into NOTHING — wedged. At p≈0.2 per clip the geometric expectation is… 5. Playback decisions
now live in a PURE sequencer (`cut-sequencer.ts`, regression-tested with 12 clips): `ended`
advances, errors and stalls SKIP WITH A SURFACED NOTICE, never a wedge.

## P1 — the room

**PIPELINE** button in the canvas navbar (next to File) opens the Studio already in Pipeline mode.
Layout: spine · capture previewer · NEW center column (cut player over the clip stack) · take rail.
Nothing rebuilt: the player runs the P0 sequencer via `use-cut-player.ts`; the cut is the EXISTING
set-scope stitch recipe, derived read-only with fresh keeps auto-joined at their spine position;
TRUE RENDER is the existing per-CEQ ffmpeg path. The clip stack is `clipsPanel` moved OUT of the
rail — ONE takes surface (pinned by occurrence-counting tests). F10/F8 triage now also works in the
Studio itself, guarded so the film keymaps can never double-fire.

## P2 — waveforms, landmarks, trims

Per-clip waveform strips (Web Audio peaks, cached per take path), landmark ticks (slate end ·
speech onset · speech offset via RMS against the clip's own noise floor — **the 808 counts as
audio**: pure energy, no spectral tricks), draggable handles with magnetic snap (80ms) and
arrow/shift-arrow = 50/10ms nudges that never snap. Non-destructive by construction: a handle
writes `trimInS/trimOutS` on the STITCH RECIPE item only. **PROPOSE TRIMS**: in = onset − X,
out = offset + Y (X/Y are header settings, default 150/250ms), untrimmed clips only, marked amber
`autoTrim` until hand-adjusted, and it NEVER runs on its own.

## P3 — scratch lane + drag (the correction layer)

Rail = PENDING · SCRATCH (kept, unattached) · RECYCLE; attached takes live in the stack, one home
each. Rail rows drag onto a CEQ group or between clip rows — attach at that position; an explicit
drop target beats coverage/armed, and a drop never moves the spine. Clip rows reorder within their
group (the stack order IS the stitch order; a saved recipe permutes in-slot, trims riding along).
DETACH ≠ TRASH, said on the buttons. Keyboard loop untouched.

## P4 — edit telemetry

Every trim decision logs an event: take/CEQ/set, durations, slate/onset/offset, auto-proposed vs
final in/out, accepted (≤10ms) / nudged (≤300ms) / overridden, rule version + the X/Y that
produced it. Local-first queue cloned from the Idea Bank (derived queue, retries, loud failures,
prune-only-synced). **EXPORT EDIT LOG** = JSON + CSV, clipboard + download, honest about
merged-vs-local-only scope. No dashboards.

> **Lee: one SQL to apply** — `migration/supabase-migrations/0117_edit_events.sql` in the Supabase
> SQL editor (deny-by-default, same shape as idea_notes). Until then the log queues locally and the
> export says "local-only"; nothing is lost.

## Not verified without OBS

The full rehearsal (arm Q1 → F9/blast/F10 × ten frames → drag onto Q4 → reorder → Propose → nudge →
play cut → TRUE RENDER → export) needs a real filming session — every piece is unit/pin-tested
(1268 pass), but the OBS loop, real drags, and audio decoding on real takes are Lee's to confirm.

---

# Landing Pass 8 — link preview, hero simplification, mobile player, materials break

Branch: `landing-pass-8`, on top of `main` @ `34207001`. Landing page only — no Greek, no studio,
no filming code.

> Both sessions write this file, so this entry STACKS on top of Pass 7 rather than replacing it.

---

## 1. Link preview (the outreach bug)

**Was:** sharing `surviveaccounting.com` rendered `lee-stadium.webp` — a personal photo, nearly
square, so link previews centre-cropped it to 1.91:1 and it arrived as a headless torso. `.webp` is
also not reliably decoded by iMessage, which is where most of these links land.

**Now:** `public/og-card.png`, purpose-built at 1200×630 — navy `#14213D`, the wordmark with the
split red/blue bolt as the "i", `ACCOUNTING`, and `Cram what's on your exam.`

The card is **generated, not drawn**: `scripts/og-card.mjs` builds it from the same geometry the
site renders — `BOLT_OUTER` / `BOLT_RIGHT` from `brand.tsx`, and `SurviveWordmark`'s 0.8 bolt
scale, 0.13 baseline drop, −0.015/+0.03 kerning and 2° rotation about 100%/51%. Tracing it by hand
would have produced a share card that quietly stopped matching the logo.

The generator is a **one-off, not a build step** — it needs a rasteriser and a TTF, neither of which
the app uses. Run instructions are in the file header; it uses `npx` so `@resvg/resvg-js` never
enters `package.json`.

> An `npm i -D` of the rasteriser was reverted before committing: it rewrote `package-lock.json`
> (+2,409 lines) while this repo installs with **bun**. `bun install` restored the tree.

Meta wired in **both** routes, because both were serving the photo:

| | `__root.tsx` | `index.tsx` |
|---|---|---|
| `og:image` / `twitter:image` | photo → card | photo → card (**`twitter:image` was missing entirely**, so this route silently inherited the photo from `__root` despite setting its own `og:image`) |
| `og:image:width/height/type/alt` | added | added |
| `og:title` / `og:description` | spec copy | spec copy |
| `twitter:title` / `twitter:description` | **restored** — I dropped them while replacing the image block, then caught it | inherits `__root` (now matching) |

Both now read `Survive Accounting — Cram what's on your exam.` and `On-demand tutoring videos for
your first accounting course. Exam 1 is free.`

**Flagged, not changed:** `__root.tsx`'s `name="description"` still carries the retired
custom-video pitch ("Send Lee your toughest homework problems… Free to request."). That is the
Google snippet for every page and it now contradicts the OG copy — but it is SEO text outside this
brief, so I left it and am naming it here rather than changing it silently.

**Caching:** the image is a new URL, so scrapers won't serve a stale file. Twitter/Facebook cache
per *page* URL though — re-scrape in their debuggers if the old photo persists.

---

## 2. Hero → bolt only

Removed: the navy card, the course code, the university name, the faint exam hint rows and answer
bubbles, and the red check. `ExamPaper` renders the bolt and nothing else.

The bolt still cycles school **colourways** (~4s), so the graphic keeps its local nod without type
asserting anything. Reduced motion now shows the **brand red/blue**, not `stops[0]` — freezing on
the first school would leave one campus's colours permanently on the hero for those users.

The caption is horizontal. Its `rotate(-4deg)` and `-10px` negative margin existed to sit parallel
to the tilted card and close the gap that rotation opened; with no card, both were leftover
geometry — type at an angle for no reason reads as a mistake, not a flourish.

`paperStops` no longer filters on `codeVerified`. That filter existed because the card *printed*
the code and inventing one would have put a fabricated fact on the page. With nothing printed it
would now be silently shrinking the colour cycle to enforce a rule about text nobody renders.

**Mobile decision — the bolt is KEPT** (the brief asked which was chosen). Measured at 390×844:

| | before (card) | after (bolt) |
|---|---|---|
| graphic | ~380 × ~430 | **132 × 178** |
| CTA bottom | — | **627** (fold 844) |

217px of headroom, so the omit-on-mobile branch wasn't needed.

`exam-paper.test.ts` was **rewritten, not deleted**. The honesty rules it guarded are obsolete (no
text ⇒ no claim to be wrong about) and the inverse rule replaces them, plus a new guard that a stop
carries **only** `{id, c1, c2}` — so nobody re-introduces `stop.name` "just for the alt text".

---

## 3. Mobile player

**Exam tabs — two lines.** As `EXAM 1 — $50` each tab needed 92px, so at 390px the fourth sat
behind a horizontal scroll and the Final's *price* was the hidden half. Stacked, a tab needs 64px.
Verified at 390: all four visible, `scrollWidth === clientWidth`, prices on screen.

**Semester Pass `×`.** The dismiss control is absolutely positioned right; the centred text ran
under it once the line wrapped. The text button is now `block w-full px-7` — equal padding, so it
stays centred *and* clear (one-sided `pr-7` would have shifted it off centre). Measured: text ink
ends at **327**, `×` starts at **335** — 8px clearance, no overlap, 2 lines. Copy shortened to
`Or grab the Semester Pass — everything, all semester, for $150.`

**Right-panel dead space.** `--sa-panel-min` is **300px on mobile** (was 340), restored to 340 at
≥1024px, and both chooser states tightened `py-8 → py-6`. The min-height exists to stop the
two-column player card resizing between states — a desktop problem; on a phone the panel is full
width with nothing beside it.

| state (390×844) | panel before | panel after | content |
|---|---|---|---|
| 1 · school picker | 340 | **300** | 158 |
| 2 · professor list | 406 | 406 | 406 |
| 3 · materials gate | 340 | **300** | 254–276 |

**Known limitation, stated rather than smoothed over:** state 2 is 406px and *already* exceeded the
340px min before this pass — the panel jumps 300→406→300 as you advance. Its professor list is
already capped at 190px and scrolls; getting it under 300 would leave ~2 visible rows. Holding all
three at 406 instead would have made the empty states worse, which is the opposite of this item. So
dead space is down on the two short states, and the jump is **unchanged, not fixed**.

---

## 4. Materials header

`Prof. Lastname's Exam 1.` is wrapped in `whitespace-nowrap`, so the line breaks *before* `Prof.`
rather than stranding it at the end of a line. Verified: 2 lines, break lands before `Prof.`

---

## Verification

- `tsc --noEmit` clean.
- `bun test` — **1180 pass, 0 fail**, run without a pipe (a pipe masked the exit code in an earlier
  pass and pushed a red suite).
- Measured in the browser at 390×844 and 1280×900; no console errors.
- **Screenshots still not delivered** — 8th pass running. The Browser pane does not composite
  frames, so `screenshot` times out. Every number above is a DOM measurement instead.

---
# Landing Pass 7 — hero illustration, player stacking fix, FAQ collapse, footer + CTA

Branch: `landing-pass-7`, on top of `main` @ `20b41094`. Landing page only — no Greek, no studio,
no filming code.

> The filming session's changelog for `vertical-filming` / `studio-tease-mode` follows below,
> unchanged. Both sessions write this file; Pass 6's entry was already overwritten once, so this
> one stacks rather than replaces.

---

## 1. The pencil is gone

It was drawn to brand rules — flat shapes, the bolt's own white keyline — and it still read as clip
art the moment it sat beside the real mark. A second illustrated object competing with the bolt was
the problem; drawing it better was never going to fix that.

What replaced it is **context behind the bolt, not company beside it**: three text strokes and two
bubble rows at `opacity 0.5` over `rgba(245,239,230,0.13–0.14)` — roughly a quarter of Pass 4's
worksheet — plus **one red check** (`#CE1126`, two round-capped strokes, deliberately uneven so it
reads as marked rather than printed). An exam with a check on it is a *passed* exam; that is the
whole reason the hints are there.

The rule is written into the code: if the hints ever compete, lower the opacity — do not redraw.

**Caption** now carries `.sa-paper-caption` — `rotate(-4deg)` matching the card exactly, and
`margin-top: -10px` to close the gap the rotation opens, so it sits tight under the card's bottom
edge instead of floating in its own space.

## 2. The stacking bug — and a second cause underneath it

**The reported bug.** The branch condition was `!school && !notListed` — *"has a school been chosen
yet?"*. But the flow has four rungs, and answering the **first** one flipped it to the else-branch,
which renders `MatchPanel` **and** the content box. So during professor and materials the panel drew
the picker with a 16:9 black poster stacked under it, and the player grew by the height of a video
nothing was going to play. The condition is now the whole ladder:

```ts
const flowDone = (!!school || notListed) && profDone && materialsDone;
```

**Verified:** the 16:9 box exists in state 4 only; states 1–3 render exactly one thing.

### The audit found a second, unreported cause

Fixing exclusivity alone did **not** stabilise the height, because the culprit is the *other*
column. The **sidebar** shrinks as the school's real topic map replaces the Starter Map:

| state | sidebar |
|---|---|
| 1 school (Starter Map, 7 topics) | 392px |
| 2 professor (loading) | 358px |
| 3 materials (Ole Miss, 3 topics) | 258px |

The sidebar is the taller column, so the card followed it down — a 52px collapse that looks exactly
like the stacking bug but has nothing to do with state overlap. It is real content changing, not a
rendering fault, so the fix is to hold the **row**: `--sa-player-min: 392px` on the flex row, sized
to the tallest chooser sidebar.

**Result — card height across the four states: 478 / 492 / 478 / 481px, a 14px spread**, measured at
both 1440×900 and 1280×900. Was 478 / 444 / 426 / 481 (52px).

**No other overlap found** in school→professor or materials→content: each transition swaps exactly
one rendered subtree.

### On the "no internal scrollbar" re-check

One scroller remains, in the professor state only: the professor **list** itself
(`max-h-[190px] overflow-y-auto`, 22 names at Ole Miss). That is a deliberately bounded list *inside*
the panel, not the player scrolling — twenty-two names have to scroll somewhere, and the alternative
is a panel that grows past the video. Pass 5's requirement was that the sidebar and player don't
scroll, and they don't, in any state. Flagging it explicitly rather than quietly counting it as a
pass.

## 3. FAQ collapses to one

One question on load; `+ Show more (6)` reveals the rest; `× Show less` puts them back — the same
idiom as Meet your tutor, so the page has one way of saying "there is more here". Seven stacked
cards was a wall of text between the player and the testimonials, and the first question is the one
nearly everybody actually has.

## 4. Footer wordmark

`FitWordmark` hard-centres (`alignItems: "center"`), which is right in a navbar and wrong in a
footer column — the mark sat **83px** right of the tagline beneath it. The component spreads
`style` last, so `alignItems: "flex-start"` is the entire fix; no wrapper, navbar untouched.
Measured: wordmark box, tagline and column left edge all at **237px**.

## 5. CTA scroll target + arrival cue

`#exam1` had `scroll-mt-6` (24px) against a sticky ~55px navbar, so "Cram Exam 1 Free" parked the
exam tab row underneath it. Now `scroll-margin-top: calc(var(--sa-header-h, 54px) + 28px)` — it
reads the height SiteHeader publishes at runtime, so it tracks the real bar instead of a guess, and
mobile's shorter navbar is handled by the same rule. **Measured: 83px** = 55 real + 28.

The cue is a separate `cue` prop, **not** the existing `pulse` — `pulse` also *opens* the sheet, and
after an unrequested scroll a modal takes the decision away rather than pointing at it. All five
conditions verified:

| condition | result |
|---|---|
| plain page load | no cue |
| after CTA click | cue fires |
| after ~2s | cue gone |
| second click within 3s | suppressed |
| school already chosen | skipped |

`prefers-reduced-motion` swaps the pulse for a static border emphasis.

---

## Verification

`tsc` clean · 1122 tests · build clean · no console errors.

### Not verified

**Screenshots — seven requested, none produced. Seventh pass running.** The Browser pane will not
composite frames here. Also **unverifiable in this environment**: the CTA scroll *landing position*,
because smooth scrolling is compositor-driven and does not run — I verified the `scroll-margin-top`
contract (83px against a 55px navbar) rather than the final scroll offset. Worth one click on a real
browser.

Needs a human eye: whether the exam hints read as "subtle context" or as "smudges", and whether the
red check lands as a graded exam or as decoration.

---

# vertical-filming — 9:16 frames, capture window, mode toggle

> **This branch stacks on `studio-tease-mode`.** Both edit `CeqPreviewer.tsx`, so
> branching vertical off `main` would have conflicted immediately. Merge
> `studio-tease-mode` first; its changelog is the second half of this file.

## The supersession, recorded

**9:16 publications are filmed NATIVELY VERTICAL.** The earlier stitch spec had a
`ReframeDef` that composited a vertical from the 16:9 source. That renderer was
never built and now never will be — this branch removes the reason for it.

The publish gate changed to match. It used to ask *"does this 9:16 have an
authored reframe?"*; it now asks *"was this actually shot vertical?"*:

| gate | level | when |
|---|---|---|
| `framing/not-vertical` | **block** | every clip in a 9:16 cut was filmed landscape |
| `framing/mixed-orientation` | **block** | some were — a mixed cut letterboxes mid-video |
| `framing/unknown-orientation` | confirm | clips predate the field; confirm by eye |

`ReframeDef` stays as a type so the plan doc still reads, but nothing constructs
one.

## 1. Orientation as a first-class property

[`orientation.ts`](src/components/canvas/orientation.ts) is the one place that
knows what a frame's shape means — capture size, authoring frame, type scale,
composition bands, safe zones, exhibit fit. All pure, all unit-tested.

[`orientation-store.ts`](src/components/canvas/orientation-store.ts) holds the
workspace's current shape. Module-level, not React state, for the same reason the
slate is: the studio window and the capture popout are **one React tree**
(`PanelPopout` portals into the popout document), so a prop would have to thread
through the previewer, the film portal and the takes inbox — three places to
forget. It persists across reloads, because a silent revert to landscape
mid-session means filming the rest of a set in the wrong shape without noticing.

**The law, enforced by test:** orientation is a *layout* concern, never a content
fork. The CEQ, choices, memos, callouts, exhibits, highlights, boss styling and
spine are identical in both. One CEQ, two ways of drawing it.

Toggle lives in the Filming Mode status strip: `▭ 16:9` / `▯ 9:16`, default 16:9.

## 2. The vertical layout — retypeset, not shrunk

- **Composition:** card band on top, camera band below, clamped to Lee's 55–65%
  and always summing to exactly 1 (no gap, no overlap). Default 60/40.
- **Type steps UP:** `TYPE_SCALE["9:16"] = 1.35`. A 9:16 frame is 900 units wide
  against 1600, so landscape-sized type would render ~44% narrower in absolute
  terms and read as fine print at arm's length.
- **A legibility floor** (`stem: 30`, `choice: 26`) that nothing may go under —
  a stem that can't fit above it wraps rather than shrinking.
- **Safe zones per orientation.** Vertical's end-screen zone is the *social
  chrome* band: full width along the bottom, where TikTok/Reels/Shorts stack the
  caption and handle. `clearsEndScreen()` catches a punchline that would sit
  under one.
- **Exhibit reflow** (`exhibitFit`) lives in the shared layer, so the T-account,
  JE and trial-balance cards inherit it. Scales an exhibit down to the card band
  and **never past 1×** — blowing a diagram up past its authored size only
  softens it.

## 3. The vertical capture window

`captureCssSize` / `isCaptureExact` / `snapCaptureSize` / `captureFeasibility` all
take an orientation and default to landscape, so every existing call site is
unchanged. In 9:16 the window opens and snaps to **1080×1920 physical**, with the
same devicePixelRatio handling — verified in tests at 1×, 1.5× and 2× scaling.

The badge judges against the *active* orientation; a vertical window measured
against 1920×1080 would have read "wrong" while being exactly right.

The slate, the film keymap and the whole F9 → F10 loop are untouched and
orientation-agnostic by construction — they never knew the frame's shape.

## 4. Takes are tagged

`TakeRecord.orientation` is stamped **at ingest**, the only moment the shape is
known for certain, and rides onto the attached `TakeRef` so the publish gate can
see it. Vertical takes show a `9:16` chip in the rail, so a mixed pass is visible
long before it reaches the stitcher. Absent = `16:9`, which is what everything
filmed before today is.

## Verification

**Verified live in the running app:** the toggle renders in the Filming Mode
strip, switches, persists to `sa-orientation`, and shows the confirmation note.

**Verified by test** — 36 new tests in
[`orientation.test.ts`](src/components/canvas/orientation.test.ts), 1122 total,
0 fail, `tsc` clean:
frame/capture aspect agreement, type floor, band clamping and summation, safe
zones, exhibit fit, pixel-exactness at three scalings, and the wiring pins.

### NOT verified — needs you, and I won't claim otherwise

1. **The frame visually reshaping.** The local scene has no clips, so the
   previewer didn't mount for me to measure. The wiring is pinned by test
   (`frameW={isVertical(orient) ? frameSize(orient).w : frameW}`) but I have not
   seen a 9:16 frame drawn.
2. **1080×1920 in OBS at Reset Transform**, and razor-sharp text in a paused
   recording. The math is tested; the window is not.
3. **Phone legibility** — the explicit "view a 1080×1920 render on an actual
   phone" check. `TYPE_SCALE` of 1.35 and the floors are a considered starting
   point, not a measured one. Expect to tune `TYPE_SCALE` and `MIN_TYPE` after
   the first real look; they are two constants in one file precisely so that's a
   one-line change.
4. **The 5-CEQ vertical F9/F10 loop.** Needs OBS.
5. **Exhibit reflow on camera.** It is wired through the shared shell (below),
   but how the scaled cycle diagram actually reads on a phone is unverified.

### Exhibit reflow — wired (the gap from the first commit is closed)

`exhibitFit` is applied by **`ExhibitShell`**, so every exhibit card inherits it
by using the shell. `CycleNode` still knows nothing about orientation — pinned by
test — which is what keeps the future T-account / JE / trial-balance cards free
of it too.

**Landscape is bit-for-bit unchanged:** in 16:9 the fit is exactly `1` and no
transform or wrapper is emitted at all. Lee films landscape today, so the
vertical work must not be able to disturb it.

The inner box keeps its **natural** size and only the paint scales — the card's
own maths (pill percentages, the arc viewBox) are computed against the authored
size, so scaling the outer box instead would desynchronise the pills from the
arcs. The outer box reports the scaled size, so neighbours don't overlap it.

Still not eyeballed: how the scaled cycle actually reads on a phone.

---

# studio-tease-mode — note-frame eyebrow + tease mode

## 1. Note frame eyebrow

The note card's eyebrow was the topic name (`THE ACCOUNTING CYCLE`). It is now the
static string **`FOUND ON YOUR EXAM`** on every note frame, regardless of topic,
exam, school or professor, from one constant in
[`frame-copy.ts`](src/components/canvas/frame-copy.ts).

Applied to both the live frame and the film-stack standins. CEQ cards keep their
topic kicker in student view — a different card doing a different job.

**Why a constant:** anything in that file gets *filmed into footage*, and footage
that names a school can only ever be sold to that school. Exam number, university
and professor are stamped by the HTML player at watch time.

## 2. Tease mode

Clicking a step cycles `normal → highlighted → blurred → normal`. One click, one
advance, fixed order, looping — no modifiers, no mode, no context menu, because
the gesture happens on camera. Per node and independent.

Built in the **shared exhibit layer**, so future exhibit cards inherit it by
declaring. `CycleNode` gained paint only and still has no behaviour code.

| state | treatment |
|---|---|
| `highlighted` | amber border + bloom, **1.06** scale so it reads at thumbnail size |
| `blurred` | `blur(11px) contrast(0.72)` **on the text only** — crisp border at 0.9 opacity |

The blur radius exceeds the pill's glyph height and the contrast drop stops
letterforms reassembling when a viewer zooms. Transitions 180ms, no bounce. A
blurred node isn't also dimmed (that hides rather than teases), and blurring
alone doesn't dim the others — only a *lit* node drives the recede.

**Session-only:** no `localStorage`, no card write, pinned by test.

## 3. Reset binding — `0`

Every key bound in the canvas today:

```
/  @  Arrows  Backspace  C/c  D/d  Delete  Enter  Escape  F/f  F7  F8  F10
PageDown  PageUp  R/r  Tab  V/v  \  `  ~
```

- **`Escape` — rejected.** Already clears memo selection (`CeqPreviewer.tsx:2012`)
  and closes every popover and inline editor.
- **`0` — chosen.** No digit key is bound anywhere in the canvas. Far from
  `` ` ``, and "back to zero" says what it does.

`0` is narrow on purpose: `clearExhibitHighlights()` and nothing else. `` ` ``
remains the full global wipe, unchanged and pinned. Bound in both keymaps.

## 4. One law I narrowed — flagged

Two tests banned *any* transform in the emphasis path, written after a
pop-to-centre spotlight **resized the card mid-take**. Lee's spec asks for a
slight scale, so the tests now ban the *harm* rather than the word:
`translate`/`width`/`height`/`top`/`left` stay banned; one bounded `scale` from a
shared constant, asserted `≤ 1.1`, with the card pinned to exactly one `scale(`.
A pill is absolutely positioned, so scaling it cannot change the card's box.

Set `EXHIBIT_GLOW.litScale` to `1` for zero motion; both tests still pass.

**Not verified:** the blurred-node zoom check and the on-camera screenshots need
a human at 1080p.

---

# Landing Pass 6 — hero card redesign, player depth, copy lock, footer rebuild

Branch: `landing-pass-6`, on top of `main` @ `ca55099`. **No Greek branch changes** — Greek Phase 1
and 2a were merged to main before this branch was cut, so there is no overlap in the panel-state
code.

---

## 1. The hero card

**The exam is gone.** Earlier passes drew answer bubbles and greeked question rows so the
composition could show the problem being overpowered by the answer. Every pass since had been spent
dulling them down — fainter strokes, fainter fills, a darker sheet — which is a long way of
admitting they should not have been there. The card is now empty on purpose: two lines of type and
one mark.

| | |
|---|---|
| Line 1 | `Cram for ACCY 201` — **static cream**, legible on every colourway with no contrast work |
| Line 2 | `OLE MISS` — smaller, secondary, and the line that **carries the school colour** |

Line 2 keeps the Pass 5 legibility treatment: `-webkit-text-stroke` with `paint-order: stroke fill`,
which draws the dark edge *behind* the fill, so Vanderbilt gold and Tennessee white keep their true
colour instead of being dropped from the cycle for being too light.

**The pencil is drawn, not an emoji** — an emoji glyph renders as a different picture on every OS
and cannot take the white keyline that ties it to the bolt. Six flat shapes, one dark keyline, one
white outer keyline matching the bolt's, laid diagonally so it crosses the mark rather than sitting
beside it. Sized at 52% of the card: the bolt dominates, and the rule for future edits is written
into the CSS — if the pencil competes, shrink the pencil, don't restyle the bolt.

Caption below: `Covers any intro accounting course, nationwide.` The card names one school at a time,
which could read as *only* these schools.

Cycle behaviour unchanged: Ole Miss → LSU → Tennessee → picker order, ~4s, tandem crossfade,
reduced-motion → static.

## 2. Copy

- Subhead: `…last-minute strugglers and **anyone** chasing easy extra points.`
- Badge: `1,000+ students tutored since 2015` → **`1,000+ students helped`**. The date already lives
  in Lee's bio; a fact stated twice goes stale in one place and not the other.

## 3. Surface depth

A three-step ladder of one navy, declared as tokens in `styles.css`:

```
--sa-surface-0   #0F1A2E   page          (darkest)
--sa-surface-1   #1B2B4D   player frame / sidebar
--sa-surface-2   #223458   right panel   (lightest — the thing you look INTO)
--sa-surface-nav #182647   navbar, its own quiet layer
```

Tokens rather than inline values, because the ladder only works if every state uses the *same* step
— one panel state hardcoding `--brand-navy` drops back to the page colour and the depth breaks on
that screen alone. **Measured: all four right-panel states report `rgb(34,52,88)`.** No state
flashes back.

`--sa-surface-0` is `#0F1A2E`, not `#14213D`. The page renders `SITE_NAVY`, which is a shade darker
than `--brand-navy`; a ladder whose bottom rung names a colour the page doesn't use reads as correct
and measures wrong.

**The stray divider.** The line splitting the colours was `sa-passline`'s `border-b`, which spans
the full player exactly where the frame surface meets the panel surface — invisible while both were
the same navy, a hard cut the moment the panel lightened. Removed, along with the matching rule on
the mobile topic row: the surface step *is* the separation now.

## 4. School picker

- **One instruction, once.** The `Pick your school to start` heading is gone; the dropdown's own
  label carries it. The heading and the button were saying the same sentence twice.
- **The ticker is clickable.** It sits under the picker to answer "is my school here?", so a student
  who spotted theirs was being asked to look away and find it again in a dropdown. Clicking a name
  selects that school and advances the flow — **verified: clicking LSU stores `lsu` and lands on the
  professor step.** Pauses on hover *and* focus; the duplicate row that makes the marquee loop is
  `aria-hidden` and unfocusable, so schools are not in the tab order twice.

## 5. Sidebar

- `COMMON EXAM QUESTIONS` → **`WHAT'S ON EXAM 1`**, per tab. "CEQ" is internal vocabulary and is now
  absent from student-facing UI.
- `Filming this week!` **deleted, not relocated** — per the brief it belongs in the video player. The
  `EXAM1_STATUS_LABEL` export went with it rather than being left as a string nothing renders.

> **Bug caught in verification:** the Final tab rendered `What's on Exam 99`. Its `num` is a `99`
> sentinel, because the Final has no ordinal position. The heading now composes from `tab.label`,
> which is already every tab's display name, so it can't drift again.

## 6 & 7. Menus and footer

`About Lee` → `Meet your tutor` (it scrolls to a section by that name) and `⚡ Boost chapter GPAs`,
in **both** the hamburger and the footer.

The footer is three columns plus a full-width bottom row. **Measured against production, which is
still Pass 5:**

| | production | Pass 6 |
|---|---|---|
| desktop 1440 | 500px | **365px** (−27%) |
| mobile 375 | 541px | **460px** (−15%) |

The first attempt came in at 371px desktop but **688px mobile** — stacking three columns adds their
headers and the brand block to one narrow column, so "multi-column" made the phone *worse*. Two
things now drop below `sm`, both because they are duplicates there: the column labels (self-evident
when stacked) and the brand block (the header shows the wordmark a swipe away, and its tagline is
repeated verbatim in the bottom row). Tagline now appears **once**.

Bottom row text and order unchanged; the memorial line is still the last thing on the page.

---

## Verification

`tsc` clean · 1073 tests, 0 fail · production build clean · no horizontal overflow at 375
(`scrollWidth === innerWidth`).

Measured in the browser: hero card has **0 circles**, both text lines, pencil present, caption
present · badge and subhead updated · picker heading gone and button relabelled · 32 ticker buttons,
click selects · per-tab headers correct including the Final · `Filming this week` and
`Common exam questions` both absent from the DOM · surface ladder holds across all four panel states
· footer stacks in order with the memorial line last.

### Not verified

**Screenshots — the deliverable asked for nine and I produced none.** The Browser pane in this
environment will not composite frames: `computer{action:"screenshot"}` times out, and CSS
transitions freeze mid-flight so sampled colours are interpolated garbage rather than settled
values. Every visual claim above is measured DOM geometry and computed style, not a picture. The
things that most need a human eye: the bolt-and-pencil composition at hero size, whether the pencil
reads as clean or busy, and line 2's legibility on the light colourways (Vanderbilt, Tennessee).

---

## Part A — Non-SEC Greek outreach targets (read-only, 2026-08-19)

**Read the caveat before using the ranking.** Non-SEC chapter counts are scrape depth, not
Greek presence: SEC campuses average **54.8** chapters (min 38, max 72); non-SEC average **2.0**
(max 4). Penn State and Indiana have far more than four chapters. Ordering by chapter count
therefore ranks how much we happened to scrape, not how much Greek life is there.

| metric | count |
|---|---|
| campuses total | 945 |
| non-SEC with >=1 chapter | 115 |
| ...and a course code (**near-term target set**) | 37 |
| ...and a course code AND >=1 professor (**strongest set**) | **0** |
| ...and a course code AND a usable slug (**buildable today**) | 25 |
| non-SEC with a NULL slug (cannot host a page or /go/ URL) | 34 |
| non-SEC with a colourway | 0 |
| buckets | A=0 · B=37 · C=78 |

**No non-SEC campus has a single pickable professor** (roster + RMP URL + not archived).
The spec's "strongest set" is empty, and bucket A remains exactly the 16 SEC schools.

### Buildable today — chapters + course code + slug (all 25)

| # | Campus | Slug | Chapters | Course code | Profs | Colourway |
|---|---|---|---|---|---|---|
| 1 | Clemson University | `clemson-university` | 4 | ACCT 2010 | 0 | no |
| 2 | Indiana University Bloomington | `indiana-university-bloomington` | 4 | BUS-A 201 | 0 | no |
| 3 | Oregon State University | `oregon-state-university` | 4 | BA 211 | 0 | no |
| 4 | Pennsylvania State University | `pennsylvania-state-university` | 4 | ACCTG 211 | 0 | no |
| 5 | Texas Tech University | `texas-tech-university` | 4 | ACCT 2300 | 0 | no |
| 6 | University of Arizona | `university-of-arizona` | 4 | ACCT 200 | 0 | no |
| 7 | Arizona State University | `arizona-state-university` | 3 | ACC 231 | 0 | no |
| 8 | North Carolina State University | `north-carolina-state-university` | 3 | ACC 210 | 0 | no |
| 9 | University of Colorado Boulder | `university-of-colorado-boulder` | 3 | BCOR 2203 | 0 | no |
| 10 | Southern Methodist University | `southern-methodist-university` | 2 | ACCT 2301 | 0 | no |
| 11 | Syracuse University | `syracuse-university` | 2 | ACC 151 | 0 | no |
| 12 | University of Iowa | `university-of-iowa` | 2 | ACCT:2100 | 0 | no |
| 13 | University of Miami | `university-of-miami` | 2 | ACC 211 | 0 | no |
| 14 | University of Minnesota | `university-of-minnesota` | 2 | ACCT 2051 | 0 | no |
| 15 | University of Pennsylvania | `university-of-pennsylvania` | 2 | ACCT 1010 | 0 | no |
| 16 | University of Southern California | `university-of-southern-california` | 2 | BUAD 280 | 0 | no |
| 17 | Ball State University | `ball-state-university` | 1 | ACC 201 | 0 | no |
| 18 | George Washington University | `george-washington-university` | 1 | ACCY 2001 | 0 | no |
| 19 | Old Dominion University | `old-dominion-university` | 1 | ACCT 201 | 0 | no |
| 20 | Sam Houston State University | `sam-houston-state-university` | 1 | ACCT 2301 | 0 | no |
| 21 | San Diego State University | `san-diego-state-university` | 1 | ACCTG 201 | 0 | no |
| 22 | University of Houston | `university-of-houston` | 1 | ACCT 2301 | 0 | no |
| 23 | University of Idaho | `university-of-idaho` | 1 | ACCT 201 | 0 | no |
| 24 | University of Louisville | `university-of-louisville` | 1 | ACCT 201 | 0 | no |
| 25 | Western Kentucky University | `western-kentucky-university` | 1 | ACCT 200 | 0 | no |

### Has a course code but NO slug — 12 (blocked; needs a slug backfill)

- Kansas State University — 4 chapter(s), ACCTG 241
- Miami University — 4 chapter(s), ACC 221
- Oklahoma State University — 4 chapter(s), ACCT 2103
- Northwestern University — 2 chapter(s), ACCOUNT 201-DL
- University of Cincinnati — 2 chapter(s), ACCT 281
- Eastern Kentucky University — 1 chapter(s), ACC 201
- Johns Hopkins University — 1 chapter(s), EN.660.203
- Kent State University — 1 chapter(s), ACCT 23020
- Ohio Northern University — 1 chapter(s), BIZ 2101
- Radford University — 1 chapter(s), ACTG 211
- University of Connecticut — 1 chapter(s), ACCT 2001
- University of New Mexico — 1 chapter(s), ACCT 2110

### Has chapters but NO course code — 78 (bucket C; needs a code before a page means anything)

- Colorado State University — 4 chapter(s)
- Florida State University — 4 chapter(s)  *(also no slug)*
- Michigan State University — 4 chapter(s)
- Ohio State University — 4 chapter(s)  *(also no slug)*
- Purdue University — 4 chapter(s)
- University of California Berkeley — 4 chapter(s)
- University of Central Florida — 4 chapter(s)
- University of Illinois Urbana-Champaign — 4 chapter(s)
- University of Nebraska-Lincoln — 4 chapter(s)
- University of Wisconsin-Madison — 4 chapter(s)
- Virginia Tech — 4 chapter(s)
- Washington State University — 4 chapter(s)
- West Virginia University — 4 chapter(s)
- Cornell University — 3 chapter(s)  *(also no slug)*
- Georgia Institute of Technology — 3 chapter(s)
- Iowa State University — 3 chapter(s)  *(also no slug)*
- University of Kansas — 3 chapter(s)  *(also no slug)*
- University of Michigan — 3 chapter(s)
- University of North Carolina at Chapel Hill — 3 chapter(s)
- University of Oregon — 3 chapter(s)  *(also no slug)*
- University of Virginia — 3 chapter(s)
- University of Washington — 3 chapter(s)
- Bowling Green State University — 2 chapter(s)
- Bucknell University — 2 chapter(s)  *(also no slug)*
- Case Western Reserve University — 2 chapter(s)
- DePauw University — 2 chapter(s)
- Duke University — 2 chapter(s)  *(also no slug)*
- Ohio University — 2 chapter(s)  *(also no slug)*
- Rensselaer Polytechnic Institute — 2 chapter(s)
- Texas Christian University — 2 chapter(s)

…and 48 more.

---

## Seed applied — 2026-08-19

`campus-seed-FINAL.csv` (50 rows) and `national-greek-orgs.csv` (89 orgs), applied after the
reconciliation report. **Zero campuses created — all 50 matched an existing row.** A naive
upsert-by-slug would have created 22 duplicates.

### What a slug-only match would have broken

`miami-university-ohio` and `university-of-miami` are **different schools** (Miami University,
Ohio, ACC 221, 4 chapters — vs University of Miami, Florida, ACC 211, 2 chapters). A normaliser
that strips "University of" collapses them, and Ohio's course code would have landed on the
Florida campus. The matcher folds dashes and diacritics only.

### Three duplicate campus pairs, merged

Each was split so one row held the chapters and the other held the course code — the same
failure as the Tennessee merge, caused by an en-dash in the name:

| school | kept (had chapters) | merged away |
|---|---|---|
| UCLA | `…los-angeles-r` | `…los-angeles` → MGMT 1A |
| UCSB | `…santa-barbara-r` | `…santa-barbara` → ECON 3A |
| Wisconsin–Madison | `…wisconsin-madison` | `…wisconsinmadison` → ACCT IS 100 |

The code moved to the row with the chapters, because that row's `/go/` URLs may already be
shared. The emptied row was archived with a `-merged` slug, never deleted — a delete cascades
and would destroy the evidence.

### 14 campuses un-archived

718 of 945 campuses were archived on 2026-06-24 as `needs_review`, which is why they had no
slug. A campus in the hand-verified seed is one Lee chose to publish, so the seed was treated as
that review: Ohio State, Florida State, Oklahoma State, Kansas State, Miami (OH), Baylor,
Northwestern, Kansas, James Madison, Iowa State, Delaware, Cincinnati, Oregon, Pittsburgh.
Ids are in the commit for a clean undo.

### Applied

- 50/50 campuses: `short_name`, `color_primary`/`color_secondary`, `intro_1` code — verified complete
- 15 NULL slugs filled from the seed; 6 existing slugs **kept** (Illinois, Nebraska, UNC, Georgia
  Tech, Cal Poly, Oregon State) with the seed's slug becoming a search alias — those campuses have
  chapters, so a slug change would break `/go/` URLs that may already be printed
- Seed won all 4 course-code conflicts (Oregon State `BA 211Z`, Northwestern `ACCOUNT 201`,
  Cincinnati `ACCT 2081`, Wisconsin `AIS 100`)
- 21 further NULL slugs backfilled for archived campuses that have chapters (slug only — **not**
  un-archived, since they are not in the seed)
- `greek_orgs`: 87 enriched, 2 created (Beta Alpha Psi, Phi Chi Theta) — 89/89 now complete

### Still needs SQL — `20260819_1615_campus_aliases_and_code_demand.sql`

Colourways and short names needed **no DDL** (`campuses` already had `short_name`,
`color_primary`, `color_secondary`). Only two things do: `search_aliases text[]`, and the
`campus_code_demand` table. **50 alias rows are computed and waiting** on that column.

### Council vocabulary mismatch (not a bug, but a mapping)

`greek_orgs.council` uses the **national** bodies — NIC (53), NPC (26) — while campus councils
and the council pages use **IFC** and **Panhellenic**. Existing records won, as specified, so the
CSV did not overwrite. Council pages read `campus_greek_chapters.council` and are unaffected, but
lazy chapter creation must map NIC→IFC and NPC→Panhellenic or new chapters will not appear on
their council page.

---

## Part B — picker rework (branch `school-picker-all`)

### Canonical names and aliases

66 selectable schools: the SEC 16 plus the 50 seeded campuses. Everything else goes through
"My school isn't listed →", per the scope override — a student picking a school with no course
code gets a worse experience than one asked to tell us about it.

**One canonical display name per school**, generated from `campuses.short_name` and used
everywhere. 149 aliases are matched and never rendered.

**Naming collisions found and resolved:**

| collision | resolution |
|---|---|
| `USC` — University of **Southern California** and University of **South Carolina** both had `short_name = "USC"` | Trojans keep **USC** (common usage); Gamecocks take **South Carolina**, which every surface already displayed. `USC` is a search alias on both, so either still finds it. |
| `Miami` — **Miami University** (Ohio) vs **University of Miami** (Florida) | Distinct schools, distinct rows, distinct codes (ACC 221 / ACC 211). Displayed as **Miami (OH)** and **Miami**. This nearly caused a data corruption — see the seed section. |
| 8 SEC short names had drifted from what the app displays: `Bama`, `UGA`, `UK`, `OU`, `UF`, `UT Austin`, `UT Knoxville`, `Vandy` | DB synced to the canonical names; the drifted forms became search aliases. |
| `Missouri` vs `Mizzou` | **Mizzou**, per the brief's explicit list. `Missouri` is an alias. |

### Search ranking

Exact name → name prefix → exact alias → word-prefix → substring. Without the tiers, "Miami"
returned Miami (OH) and Miami in whatever order the sort happened to be stable in.

**`Mississippi` → Ole Miss** is satisfied by the PIN, not by score: Mississippi State legitimately
starts with "Mississippi" and outranks an alias match. Ole Miss is pinned above the group headers,
so it is the first row regardless. Both appear, which is the honest result — they are two real
schools a student could mean.

### Verified live at 1280px and 375×812

- Placeholder reads **"Search 66 schools…"**, from `schools.length`, never a literal
- Ole Miss pinned first and **not** repeated inside SEC — one row per school, so the count and the
  rows agree
- `SEC` / `Other schools` headers, both alphabetical, and headers **survive filtering**
- Alias search: `bama`→Alabama, `UIUC`→Illinois, `purd`→Purdue, `tOSU`→Ohio State,
  `K-State`→Kansas State, `Pitt`→Pittsburgh, `A&M`→Texas A&M, `Vandy`→Vanderbilt
- Aliases never render — rows show the canonical name and the course code only
- `My school isn't listed →` last row in every state, including empty results
- Selecting Purdue navigated to `/purdue-university#exam1`, H1 "ACCT 20000 at Purdue…"
- Mobile: no horizontal overflow, 16px search input (iOS will not zoom), 56px rows

**No virtualization.** 66 rows is not 900 — the scope override removed the reason for it, and
virtualizing a list this size would add complexity and break the sticky group headers for nothing.
If the list ever grows past a few hundred, revisit.

### Demand logging

Every selection of a school with no course code, and every "My school isn't listed", writes to
`campus_code_demand` with its source (`landing`, `campus-page`, `write-in`). Best-effort and
non-blocking — but it **reports** whether the row landed rather than assuming it, because the last
best-effort logger returned 200 while writing nothing for a day.

All 66 listed schools currently have a course code, so in practice this table fills from write-ins
until the data drifts.

### One source of truth

`SCHOOLS` in landing.tsx was a **third** hardcoded copy of the SEC 16 (alongside schools.ts and
brand.tsx) and had already drifted — it still said "Missouri". It, `ChapterFinder`, `/rep` and
`campus-context` now all read the generated table. `campus-context` was fetching course codes for
the SEC 16 only, so a non-SEC campus page could not have resolved its own code.
