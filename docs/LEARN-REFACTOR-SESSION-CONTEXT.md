# /learn refactor — context for a fresh session (2026-09-11)

Paste this file's path into a new Claude Code session in this repo (worktree `sa-film-camera`,
dev server launch config `film-camera-dev` on :8097). Part A is what exists on `main` tonight.
Part B is the refactor prompt Lee received by email at 11:19 PM on 2026-09-10 (from a design
chat; it is the newest word and supersedes the earlier "black stays the palette" decision where
they conflict). Part C is the conflicts to settle before coding. Part D is the working rules.

---------------------------------------------------------------------------------------------

## A. What /learn is right now (main tip `921c0c9c`, all pushed, tree clean)

Route `src/routes/learn.tsx` → `LearnTop` (navbar) · `LearnEntrance` (hero) · `LearnHome`
(rows) · `LearnTextLee` (floating Text Lee) · `LearnLoading` (entrance) · `LearnSchoolSheet`
(pick-school sheet). The left rail (`LearnRail.tsx`) is still in the tree but unmounted.

- **Theme** `src/components/learn/learn-theme.ts`: `LOOKS` = `black` (the Blackboard, default)
  and `navy` (the home page's palette, `?look=navy`). `themeFor(school, look)` writes `--lk-*`
  vars (`bg`, `text`, `muted`, `border`, `acc`, `green`, `topBg`…) after contrast checks against
  the live ground; `LK` is the alias object components read; `.lk-btn-cta`, `.lk-pill`,
  `.lk-short` (152×270 9:16 card) are its CSS. A THIRD look is the natural place for the cream
  canvas (Part B §1) — extend `Look`/`LOOKS`/`isLook`, don't fork the file.
- **Home-page brand tokens** `src/styles.css:51` `--brand-navy: #14213D` (`--color-brand-navy`
  alias line 41); `--brand-cream` is aliased to `--text-primary` (line 346). Reuse these; do not
  mint near-duplicates.
- **Navbar** `LearnTop.tsx` (389 lines): the bar STILL WEARS THE SCHOOL — ground = `c1`, rule =
  `c2`, ink re-picked for contrast (header comment line 25, `theme.topBg` line 139). Big
  `BoltBoil` top-left with the campus name and `ACCY 201 · Exam 1` under it; wordmark
  "survive"; EXAM PILLS row (`role="tab"`, lines ~88 and ~180: Exam 1 live, Exam 2/3 drawn lock →
  `setWaitlistExam(n)` opens the waitlist sheet with `examWaitlistLine(exam)` — "Exam 1 is free.
  Exam 2 is $50…", `LATER_EXAM_PRICE_USD = 50` in `learn-gate.ts`); right: Leave a review ·
  Share · hamburger (Share this · exam reminders modal · Home · Sign in/out · Set up your Greek
  chapter · Join the campus rep program). Greek letters sit cream over the bolt when a chapter
  is known.
- **Hero** `LearnEntrance.tsx` (47 lines): centred "Like Reels for exam prep." / "Cram what's on
  your exam. Skip everything else." / one **Get started** button with the real average video
  length caption under it (`averageVideoCaption` in `learn-gate.ts`). Get started scrolls to
  the first row. Lee's eye (email): too tall on desktop.
- **Rows** `LearnHome.tsx` (524 lines): tiers from `use-tier.ts` (`narrow` <640, `mid` <1024,
  `wide`; SSR defaults wide, corrected in a layout effect). `GRID_COLS` line 152 =
  `{ narrow: 0, mid: 4, wide: 5 }` — the LAST column is always Practice, so wide = four frames +
  Practice pinned right, mid = three + Practice. More videos than columns → `CramStrip`
  (line 429: fade + arrow, scrolls one frame) sized to those columns with Practice still beside
  it. THIS IS THE "HARDCODED FOUR SLOTS" THE EMAIL WANTS GONE (Part B §4–5). `TopicRow`
  line 342 (later topics, collapsed/expanded), `PracticeFrame` line 473 (PracticeArt + "Practice"
  + real `questionCount`), `PracticeAskSheet` line 406 (soft gate: "Watch first / Practice
  anyway", `practiceGateNeeded`). Waitlist/email gate: `waitlistNeeded`, `emailGateNeeded`
  (`learn-gate.ts` 58/63) → `EmailGate` variants in LearnHome, intake kind `notify_exam` with
  sources `learn-gate` / `learn-waitlist` / `learn-exam-waitlist`. Counts per topic only
  (`topicRowDetail`, `topicDetail`); no cross-exam totals; no "coming soon" copy anywhere —
  "Get notified when these drop." is the exact waitlist heading.
- **Practice art** `PracticeArt.tsx` (157 lines): an SVG motor (gear, two nuts, hand-drawn bolt),
  idle float ±4px/4s, hover pump, `--lk-art-stroke/--lk-art-fill` from the school with .6s
  transitions. A PLACEHOLDER — the email replaces it with the Recraft "cram machine" (Part B
  §7–10). There is a Recraft illustration registry at `/admin/illustrations/styles` (subject
  `practice-card` was proposed; the email says the file lands at `/public/brand/cram-machine.svg`).
- **Text Lee** `LearnTextLee.tsx`: photo `/lee-text-avatar.jpg`, `sms:` on narrow, a card with
  three lines on wide. Keep.
- **Tests** `learn-gate.test.ts`, `use-tier.test.ts`, `learn-redesign.test.ts`, `spine.test.ts`
  (`bun test src/components/learn`). Known unrelated failure in the full suite:
  `bolt-palette.test.ts` "distinct accents".
- **Animation deps**: `framer-motion ^12.40.0` is already in package.json (Part B §10 says use
  CSS keyframes or Framer, don't add another library).
- **Storage keys**: `sa-learn-unlocked`, `sa-learn-intro-seen`, `sa-learn-start-pulsed`.
- **Hydration gotchas** (both bit us this week): no localStorage reads in `useState`
  initializers; never give `<style>` two text children (`{A}{B}`) — concatenate.

---------------------------------------------------------------------------------------------

## B. The email, verbatim (Lee → Lee, 2026-09-10 11:19 PM, subject "(no subject)")

### Design direction (the chat's reasoning)

I'd change the visual system pretty substantially. The underlying concept is good, but right
now the page feels like a dark placeholder/carousel rather than a polished learning product.

The biggest architectural fix is exactly what you identified: videos determine the row
length; Practice is simply appended as the final item. There should never be fake empty space
reserved so Practice lands in "slot 5."

I'd also stop changing the entire navbar to each school's color. That makes Survive feel like
a different product at every campus. Keep the Survive shell consistent and let campus identity
appear through accents.

The visual direction I'd use: Use a warm cream canvas rather than pure black or pure white.
Something around #F4F1E9 / #F7F4ED. Cards can be a slightly lighter cream/white. Keep your
navy from the homepage as the permanent navigation color.

Then: Survive navy = permanent navbar / brand structure. Cream = student learning canvas.
Near-black/navy = video media surfaces where appropriate. School primary/secondary colors =
bolt, active states, selected exam, buttons, hover glows, tiny borders, progress indicators.
Green = success only: correct, completed, A+, etc.

I particularly would not make the whole header Tennessee orange, Arkansas red, etc. The
product starts feeling skinned rather than branded.

### The prompt

We need a significant visual/UX refactor of the student-facing exam prep page.

Do NOT change the underlying course/content data model unnecessarily. Inspect the existing
implementation first and reuse current routing, school configuration, exam configuration,
video data, practice question data, authentication, waitlist logic, etc.

The goal is to make this feel like a polished consumer learning product:
"Like Reels for exam prep."

The current implementation has several problems:

1. The page uses too much pure black and feels unfinished.
2. The navbar changes its entire background based on the selected school. This weakens the
   Survive brand and creates inconsistent contrast.
3. Exam 1 / Exam 2 / Exam 3 are displayed as separate navbar pills and consume too much space.
4. Content rows appear hardcoded around four video slots followed by a Practice card.
5. Practice must instead ALWAYS be immediately after the final video in that topic, regardless
   of video count.
6. The current Practice illustration is generic gears/lightning artwork and does not
   communicate the product.
7. Content rows have excessive empty space and carousel controls feel detached from the content.
8. The hero pushes actual study content too far down the page.
9. The current page does not have the polished interaction/motion quality we want.

#### 1. GLOBAL VISUAL SYSTEM

Make the student experience visually consistent across every campus.

The SURVIVE navbar should NOT change its full background color for each university.

Use a persistent Survive brand shell:

    --survive-navy: use the existing navy from the main homepage
    --survive-cream: warm off-white / cream, approximately #F5F1E8
    --survive-surface: a slightly lighter cream/white
    --survive-ink: very dark navy
    --survive-muted: muted warm gray
    --campus-primary: existing dynamic university primary color
    --campus-secondary: existing dynamic university secondary color

The NAVBAR should always remain Survive navy.

Campus personalization should instead appear through: bolt colors; active/focus accents; very
thin accent line beneath navbar; buttons where appropriate; progress states; subtle card hover
accents; section icons; selected dropdown elements.

Do not flood large backgrounds with school colors.

The page body should switch from pure black to a warm cream/off-white learning canvas. This
should feel warmer, more approachable, and more premium. Dark/navy can still be used inside
video/media cards where appropriate.

#### 2. NAVBAR

Refactor the top navigation. Keep roughly:

    [Survive logo] | [Campus selector]
                     [course + exam selector]
    Right: Leave a review · Share · hamburger

Campus selector example:

    Arkansas ▾
    ACCT 2013 · Exam 1 ▾

The campus selector already communicates dropdown behavior well. Use the same visual language
for the exam selector.

REMOVE the persistent Exam 1 / Exam 2 / Exam 3 pill row. Instead, clicking "Exam 1 ▾" should
open a dropdown: Exam 1 · Exam 2 · Exam 3 · Final Exam. Support whatever exam states already
exist in the data. If an exam is locked, visually indicate it inside the dropdown. Clicking
the dropdown should NOT accidentally trigger the campus dropdown. The navbar should remain
compact. Add a very thin campus-colored line along the bottom of the navbar. The Survive
wordmark remains consistent. The bolt/logo accent may dynamically use the campus
primary/secondary colors if our existing SVG architecture makes this practical.

#### 3. HERO

The current hero is too tall. Keep the messaging: "Like Reels for exam prep." / "Cram what's
on your exam. Skip everything else." Keep a CTA such as "Start cramming". But dramatically
reduce vertical padding. On desktop the hero should feel like a compact introduction, not a
marketing landing-page hero. Students should see the beginning of the first study section
without needing a major scroll. Clicking "Start cramming" should smoothly scroll to the first
playable video. Eventually this may initiate playback, so structure the handler in a way that
could support that later.

#### 4. CONTENT SECTION STRUCTURE

Each content section represents a topic/chapter. Example: "Start Here: Easy Points 5 videos",
then a horizontal row.

CRITICAL ARCHITECTURE CHANGE: DO NOT hardcode four video positions. DO NOT reserve positions
for missing videos. The row contents should be created dynamically. Conceptually:

    const rowItems = [...section.videos, practiceItem]

Practice is simply the final item. 5 videos → [v][v][v][v][v][practice]; 2 → [v][v][practice];
1 → [v][practice]; 8 → [v]×8[practice]. There should NEVER be blank fake card slots. There
should NEVER be a large artificial gap before Practice. If there are zero videos but practice
exists, handle gracefully and show Practice. Build this as a reusable component rather than
special-casing sections:

    <StudySection>
      <StudyRail>
        {videos.map(...)}
        <PracticeCard />
      </StudyRail>
    </StudySection>

#### 5. STUDY RAIL / CAROUSEL

Use a horizontally scrolling flex/grid rail.

Desktop: cards have consistent width; approximately 3.5–5 cards may be visible depending on
viewport; cards should NOT stretch merely to fill screen width; gap around 16–24px; content
is left aligned; rail itself may overflow horizontally.

Mobile: approximately 80–90% viewport width per card; horizontal scroll snap; swipe naturally;
avoid relying on tiny arrows.

Use `scroll-snap-type: x proximity` or `mandatory` where appropriate. Hide the scrollbar
visually while preserving accessibility. Only show a right-navigation control when the rail
ACTUALLY overflows. Do not display a giant floating arrow in a permanent gap between video
cards and Practice. If using desktop arrow controls, overlay them subtly near the right edge
of the rail. Fade the right edge slightly when additional content exists.

#### 6. VIDEO CARDS

Maintain vertical short-form proportions, target approximately 9:16. Do not make them
enormous; desktop target roughly 240–280px wide depending on responsive breakpoint. The
thumbnail/media area should dominate the card. Title should live cleanly at bottom.
Eventually these will contain real autoplay/video thumbnails, so keep media implementation
modular. Hover: translate up 4–6px, scale roughly 1.01–1.02, subtle shadow increase,
~180–250ms easing, no dramatic bouncing. Cards should feel tactile.

#### 7. PRACTICE CARD

Completely redesign the existing Practice card. Remove the current generic gear/lightning
illustration. The Practice card should occupy the SAME visual slot and approximately the SAME
dimensions as a video card. It should clearly feel like the logical next step after watching
the shorts. Content concept:

    [animated/isometric cram machine illustration]
    Practice
    97 questions
    Start practicing →

Use actual practice count dynamically. Do not make Practice look like an unrelated utility
panel. It should look like the final card in the learning sequence.

#### 8. NEW "CRAM MACHINE" ILLUSTRATION ARCHITECTURE

We will create a new illustration externally with Recraft. Do NOT fabricate final artwork
yourself right now. Instead, prepare the PracticeCard component so we can drop in
`/public/brand/cram-machine.svg`.

The desired art direction is a dimensional/isometric SaaS illustration with depth, similar in
GENERAL interaction quality to high-end product illustrations like Ashby. Do NOT copy Ashby's
artwork. Our subject matter should be uniquely Survive/accounting/exam-prep.

Concept: a compact "cram machine" viewed in isometric/3-quarter perspective. A small conveyor
belt moves exam-prep cards/pages through the machine. Study materials enter one side. They
pass through a processing/stamping section. They emerge marked with A+ OR 100 OR a green
check. Potential visual elements: flashcard, calculator, tiny ledger sheet, exam paper,
conveyor rollers, small stamping arm, floating completed card, subtle lightning/energy detail.
Avoid generic gears as the primary motif. The illustration should have dimensional depth, soft
rounded geometry, and layered shadows.

#### 9. ILLUSTRATION COLOR SYSTEM

We want the illustration to support university personalization without generating a separate
image for every school. Assume the SVG will ultimately use a controlled palette. Structure
CSS/components so we can map illustration colors to:

    --illustration-neutral-dark
    --illustration-neutral-light
    --illustration-campus-primary
    --illustration-campus-secondary
    --illustration-success

Ideally school primary/secondary colors can dynamically influence the SVG. Do not hardcode
Arkansas red, Tennessee orange, etc. inside PracticeCard. If direct SVG CSS-variable
recoloring becomes impractical, keep the component architecture ready for it rather than
introducing per-school asset duplication.

#### 10. PRACTICE CARD MOTION

We want premium interaction. Idle: illustration may have an EXTREMELY subtle 2–4px floating
motion, slow, non-distracting. Hover/focus: Practice card lifts slightly; illustration
enlarges around 3–6%; shadow gains depth. Eventually, individual SVG pieces should animate.
Desired hover animation: 1. exam/flashcard appears on left edge of conveyor; 2. belt moves it
across; 3. stamping mechanism comes down; 4. card receives A+ / check / 100; 5. completed card
moves off to the right; 6. sequence repeats while card remains hovered/focused.

Do NOT animate the entire illustration as one PNG. Build animation support around SVG
groups/elements. Use CSS keyframes or Framer Motion depending on existing project
dependencies. Do not add a heavy animation library solely for this feature if we already have
a good solution. Respect `prefers-reduced-motion`: disable looping/internal machine motion,
retain only basic hover state if appropriate. Mobile has no hover, so eventually trigger a
short animation when the card becomes prominently visible or when tapped. Do not implement
obnoxious continuous mobile movement.

#### 11. SECTION HEADERS

Simplify headers. Example: "Start Here: Easy Points · 5 videos" or "Recording Journal
Entries / 2 videos · 26 practice questions". Avoid giant outlined containers unless a section
is intentionally collapsed. Typography should be strong but not overpowering. Use campus
accent very sparingly here.

#### 12. COMING SOON / WAITLIST CONTENT

Preserve our existing coming-soon and email waitlist functionality. However, reduce the
current "everything is blurred behind a giant modal" feeling. Prefer a clearly
disabled/coming-soon section state. Possible structure:

    Recording Journal Entries   COMING SOON
    2 videos · 26 questions
    [preview cards with tasteful muted/locked treatment]
    Get notified when these drop
    [email ] [Notify me]

Do not let the waitlist UI completely obscure the page unless there is a product reason to
use a true modal. Use existing backend/API behavior.

(NOTE from the earlier session: Lee said "no more coming soon" on 09-10 — the heading "Get
notified when these drop." is the exact copy, and unposted videos are simply grey. Keep that;
the "COMING SOON" tag in the example above is the chat's wording, not Lee's.)

#### 13. RESPONSIVENESS

Test at minimum: 375px, 430px, 768px, 1024px, 1440px, 1920px. Desktop should not become
ridiculously wide. Use a centered max-width container for headers/text while allowing study
rails enough horizontal breathing room. Mobile should feel deliberately designed rather than
a shrunk desktop version.

#### 14. ACCESSIBILITY

All dropdowns must support keyboard interaction. Use proper `aria-expanded`, `aria-controls`,
`aria-haspopup`. Practice/video cards must have visible focus states. School colors must NOT
be used where they create insufficient text contrast. Decorative motion must honor
reduced-motion preferences.

#### 15. IMPORTANT DESIGN PRINCIPLES

This is not a normal online course dashboard. It should feel like TikTok/Reels speed +
Spotify/Netflix browsing + a polished consumer study tool. Students should immediately
understand: 1. Pick my school 2. Pick my exam 3. Watch short videos 4. Practice what I just
watched. The layout should visually reinforce that sequence. Do not add dashboard clutter,
sidebars, complicated progress graphs, or LMS-style interfaces. Keep it extremely simple.

#### 16. IMPLEMENTATION PROCESS

Before editing: 1. Inspect the current student page components. 2. Find the current
school/campus theming implementation. 3. Find how exam selection currently works. 4. Find how
sections/videos/practice counts are represented. 5. Find current waitlist/locked-section
logic. 6. Identify existing animation libraries. 7. Identify the homepage navy/cream brand
variables so we reuse them instead of creating near-duplicates. (Part A answers all seven.)

Then implement the refactor. Avoid duplicate components and duplicate design tokens.

After implementation, report: files changed; components added/refactored; how StudyRail
determines its children; how Practice is appended after videos; how campus colors are now
applied; how Exam dropdown works; where cram-machine.svg should be placed; which SVG
IDs/classes the eventual animation will expect.

---------------------------------------------------------------------------------------------

## C. Conflicts with what Lee said earlier today — settle these first (ask him, one message)

1. **Palette.** 09-10 afternoon: "black is better" (navy compared via `?look=navy`, rejected).
   The email (later, 11:19 PM) wants a cream canvas + a permanent navy navbar. Recommendation:
   build it as a third `Look` ("cream") so `?look=` still compares all three, and make cream
   the default only when Lee says so after seeing it.
2. **Navbar wears the school.** Built today on purpose (LearnTop line 25). The email reverses
   it: navy always, school only in the bolt, a hairline under the bar, and accents. Memory
   note: campuses KEEP two school colours on the bolt (Lee said no to darkening them).
3. **Exam pills vs dropdown.** Built today as pills with locks (Lee's #2 answer: keep them, $50
   line). The email wants "ACCT 2013 · Exam 1 ▾" as a dropdown with locks inside. The waitlist
   sheet + `examWaitlistLine` stay either way.
4. **Practice pinned right in a fixed grid** (Lee's own 09-10 spec: "four cram frames …
   practice pinned right … 5 total … odd numbers") vs the email's "videos determine the row
   length; Practice appended; never a reserved slot". The email calls this THE architectural
   fix — treat it as decided.
5. **Get started vs Start cramming.** Lee chose "Get started" (#6 yes) with the average-length
   caption; the email says "a CTA such as Start cramming". Keep "Get started" unless he says.
6. **Practice art.** Today's SVG motor is a placeholder either way; the email's cram machine
   (§8–10) replaces the nuts-and-bolts brief. Prepare `PracticeCard` for
   `/public/brand/cram-machine.svg` with named groups: `#belt`, `#card-in`, `#stamp`,
   `#card-out`, `#mark` (A+/check) — and the five `--illustration-*` vars from §9.
7. Everything else in the email is additive to what's built (hero height, rail snap, hover,
   headers, waitlist state, breakpoints, a11y) — no conflict.

---------------------------------------------------------------------------------------------

## D. Working rules for this session

- ANOTHER SESSION WORKS ON MAIN (the Editor: `src/components/blastoff/*`, `src/lib/blastoff-*`).
  Never touch or commit those paths. Stay inside `src/components/learn/*`, `src/routes/learn.tsx`,
  `src/styles.css` (tokens only, additively), `public/brand/`.
- Commit with `git commit --only <paths>` (or `git add` exact paths). Push:
  `git fetch origin main && git rebase origin/main && git push origin HEAD:main`.
- Per item: `bunx tsc --noEmit` and `bun test src/components/learn`. Full build once at the end.
- Fail loud; no silent fallbacks; additive migrations only (none expected here).
- Module-scope callables as `function` declarations (the TDZ ratchet test pins it).
- Every file starts with a header comment that records decisions and Lee's words — keep them
  and add tonight's.
- Copy rules: no emoji, no "coming soon", no "run"/"blast"/"pledge", "Like Reels for exam
  prep." verbatim, "Get notified when these drop." verbatim, per-topic counts only.
- Browser: `preview_start` `film-camera-dev` (:8097); open a fresh tab per check because the
  console accumulates; test 375/430/768/1024/1440/1920 with `resize_window`; the dev server
  dies of heap OOM after hours — restart it, don't debug it.
- Launch is tomorrow (Fri 2026-09-11): Exam 1 / Easy Points free. Don't break the email gate,
  the waitlist intake, the school picker, or the player routes to make the page prettier.

---------------------------------------------------------------------------------------------

## E. The `?look=` candidates — build ALL of these first, Lee picks ONE

Lee (2026-09-11, after the email): "give me a bunch of possible options to try with ?look=.
I want to pick only the best one." So: before any shell work, extend `Look`/`LOOKS`/`isLook`
in `learn-theme.ts` with the palettes below, keep `themeFor`'s contrast checks running against
each ground, and add a small floating "Look" picker (bottom-left, only when `?looks=1` is in
the URL) that rewrites `?look=` so he can flip through them on one page with a school picked.
Every look keeps: the school ONLY in the bolt, active states, the hairline under the bar,
buttons and hover glows; green only for success; the Survive shell identical at every campus.
Fill each palette's full ladder (`surface2`, `border2`, `dim`) by the same one-hue stepping
`styles.css` uses ("three steps of ONE navy"); the values here are the anchors.

| look | canvas | surface (cards) | text | muted | border | navbar | fallback accent | why it might win |
|---|---|---|---|---|---|---|---|---|
| `black` (exists) | `#0A0A0A` | as today | chalk | as today | as today | wears the school today → make it `#0A0A0A` | lime | Lee's 09-10 pick; Reels-native; video thumbnails disappear into it |
| `navy` (exists) | `#0D1730` | `#162443` | `#F7F0E6` | `#AAB4C8` | `#34486D` | `#14213D` | `#FFA611` | matches the home page exactly; one brand, one door |
| `cream` (the email) | `#F5F1E8` | `#FBF9F4` | `#14213D` | `#6E6B63` | `#E4DDD0` | `#14213D` | `var(--brand-red)` | warm, premium, "a study tool not a feed"; video cards stay near-black so the shorts pop |
| `paper` | `#FAFAF7` | `#FFFFFF` | `#0F172A` | `#64748B` | `#E5E7EB` | `#14213D` | `var(--brand-red)` | the quiet Linear/Notion look; maximum thumbnail contrast; least "designed" |
| `chalk` | `#111827` | `#1A2233` | `#F2EDE3` | `#A7B0C0` | `#2B3548` | `#0B1220` | `#FFA611` | between black and navy: dark enough for video, blue enough to feel like Survive |
| `charcoal` | `#1C1B1A` | `#262422` | `#F2EDE3` | `#A9A39A` | `#33302C` | `#14213D` | `var(--brand-red)` | warm dark: cream text on brown-black reads like the cream look at night |
| `split` | navbar + hero on `#14213D`, rows on `#F5F1E8` | `#FBF9F4` | navy on cream / cream on navy | `#6E6B63` | `#E4DDD0` | `#14213D` | `var(--brand-red)` | Netflix-style: dark brand up top fading into a cream study canvas; the fold IS the design |
| `mono` | `#F7F7F5` | `#FFFFFF` | `#0B0B0B` | `#6B6B6B` | `#E6E6E3` | `#0B0B0B` | the school's `c1` | no navy at all — black, white, and the campus colour as the ONLY colour; the boldest, most "skinned" |

Build order: `cream`, `paper`, `chalk`, `charcoal`, `split`, `mono` (black and navy exist).
Screenshot each at 1440 and 390 with Ole Miss picked and with no school, send the grid to Lee,
and STOP for his pick. Do not build the shell on a guess.

---------------------------------------------------------------------------------------------

## F. The brief: the best student shell we can build

Lee: "Make sure it studies /learn, our strategy docs, etc. I want it to build the best
student shell possible for us." So before Part E, read — in this order — and write a
one-page plan (`docs/LEARN-SHELL-PLAN-<date>.md`) that says what the shell IS before saying
what it looks like:

1. `docs/SURVIVE_STRATEGY_CULTURE_2026-09.md` — Human First / Feed the Machine / Use Your
   Words; who the student is; why Greek chapters and campus reps matter to the page.
2. `docs/SESSION-CONTEXT.md` — multi-session rules, migration naming, what a green build proves.
3. `docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md` — the proposal Lee approved this afternoon
   (what's built) and his six answers.
4. `docs/DESIGN-CRAM-MAP.md` and `docs/DESIGN-SITE-PUBLISH.md` — cram path vs offshoots
   ("Take it to an A"), how splits will reach students.
5. `docs/SHORTS-POLISH-AUDIT.md`, `docs/BRAND-ANIMATION.md` — what the videos look like and
   what brand motion already exists (BoltBoil, BoltZoom; the globe was REMOVED, don't revive).
6. `docs/GREEK-PHASE-1.md`, `GREEK-PHASE-2A.md`, `GREEK-PHASE-2B.md`, `docs/REP-MESSAGING-AUDIT.md`
   — the share flow (`/s/[campus]` → /learn), chapter letters, rep program copy.
7. Code: `src/routes/landing.tsx` (the home page's voice and tokens), `src/components/learn/*`
   (all of it, including `learn-modes.ts` and `CramPlayer.tsx`), `src/components/brand-cards/
   bolt-boil.tsx`, `src/lib/schools.ts` (`c1`/`c2`), `src/components/home/ChapterDoors.tsx`.
8. Memory the earlier sessions kept: no emoji/cringe; contained detail views, never
   full-screen; campuses keep two school colours on the bolt; exact spec copy, no fake numbers.

The plan should answer, in Lee's words where possible: what a student does in the first 10
seconds (pick school → pick exam → watch → practice, §15); what the page is for AFTER Exam 1
(Exam 2/3 waitlist, reminders, reviews, GroupMe — §4 of the proposal); what never changes per
campus and what always does; what "Like Reels for exam prep." means at 390px versus 1440px;
and which of the email's sixteen sections are day-one versus post-launch. Then Part C's
questions, then Part E's looks, then the shell — in slices, each pushed to main.
