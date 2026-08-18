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
