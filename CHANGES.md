# Landing Pass 4 — hero bolt fix, copy lock, player flow restage

Branch: `landing-pass-4` (on top of Pass 3). **No Greek page changes**, per the brief. Checkout and
the video player internals were not touched.

---

## Every copy string changed

| Where | Was | Now |
|---|---|---|
| Hero subhead | `On-demand exam prep for your first accounting course. Built for the night before.` | `On-demand tutoring videos for your first accounting course. Built for last-minute strugglers and 4.0s chasing easy extra points.` |
| Trust badge | `Built by a pro tutor` | `Created by a pro tutor` |
| Below-player block | 1-2-3 cards (`Pick your exam` / `Cram the topics` / `Walk in ready`) | header `Will this match my professor's exam?` |
| — body | *(three card lines)* | `That's the whole point. Pick your school and professor in the player — then send your syllabus, study guides, or old exams, and I'll send back an exact gameplan for your exam.` |
| — CTA | *(none)* | `Match my exam ⚡` |
| Materials modal title | `One last thing` | `Get your exam gameplan` |
| Materials modal headline | `Want it matched exactly?` | `Get your exam gameplan` |
| Materials modal body | `Send your syllabus and I'll map your exams topic by topic.` | `Send your syllabus, study guides, old exams — whatever you've got — and I'll match my videos to your course and send you an exact gameplan. The more you send, the better the plan.` |
| Materials primary CTA | `Send your syllabus` | `Upload course materials` |
| Coverage line | `Right now this likely covers N% of …` | `This already covers about N% of …` |
| Top bar action | `Change` | `Reset` |
| Professor step | had `Skip this` | **removed** |
| Hamburger / footer Greek item | *(no subtext)* | + `Boost chapter GPAs` |

Hero H1, both exam-tab labels, the Semester Pass line, `Meet your tutor` and all legal/memorial
lines are unchanged.

## 1. Hero graphic

- **The bolt is now the real brand asset** — `Bolt` from `components/canvas/brand`, the same
  13-point split bolt the wordmark and player use. Not redrawn.
- **Sized to overpower the exam**: 122% of the sheet's height, overhanging top and bottom.
- **Paper simplified**: 5 rows → **4**, strokes lightened (`#DCE1E9` / `#E6EAF0`), one inked
  bubble per row in brand red.
- **Course-code cycling replaces the colour-only cycle.** The header reads `ACCY 201 — EXAM 1`;
  every 4s the code, its accent and the bolt's colourway crossfade together (900ms). Order is
  Ole Miss → LSU → Tennessee → the rest in picker order.
- Glow deliberately restrained — a low double `drop-shadow`, per "if in doubt, reduce the glow".
- `prefers-reduced-motion` → static first stop (Ole Miss), no interval, no transitions.
- No marquee in the hero; it remains only under `Pick your school to start`.

**Honesty rule:** `paperStops` **drops any school without a VERIFIED course code** rather than
showing a blank or a plausible-looking one. If none are verified the hero renders no graphic at
all. Covered by `src/components/site/exam-paper.test.ts`.

## 2. Player flow — actions on centre stage

`MatchPanel` is now three sequential states in the middle of the right panel:

1. **Pick school** (unchanged).
2. **Pick professor** — new `ProfessorStage`, rendered *inline on the stage*, not in a sheet:
   heading, search box, scrollable list, `My professor isn't listed →`, and `← Change school`
   demoted to small muted text beneath. **`Skip this` removed** — `isn't listed` is the only
   alternate path, and it reaches the same next step, so nobody is trapped.
3. **Confirmed** — the top bar carries only what is true: `✓ Ole Miss · ACCY 201 · Prof. Allen`
   plus **`Reset`**. `Add professor` is gone; adding one happens by resetting the flow.

The sheet now takes an `initialStep`, so finishing the professor rung on stage opens it directly
on materials instead of re-asking a question already answered. (Caught in testing — it was
re-opening at the professor step.)

## 3. Other

- **Semester Pass bar is dismissible.** Hover-revealed `×` on pointer devices, permanently visible
  at 50% opacity on touch, focus-visible for keyboard. Dismissal persists in localStorage
  (`sa-pass-line-dismissed`), read in an effect so SSR and client agree.
- **Testimonials**: card `minHeight` 260 → 210, padding trimmed, quote 16/18px → 14.5/15.5px,
  quote mark 64 → 44px, **avatar 36px → 48px**. Attribution is `[Campus] · [Course code]` — but
  **no testimonial carries a code today, so every card renders campus-only.** The field is
  optional and must be filled per student; inferring a code from the campus would be inventing a
  fact about a real person.
- **Footer rebuilt** — all five nav links (with the Greek subtext), the existing text-me block, and
  the three legal/memorial lines unchanged at the very bottom.

## 4. The navbar sticky bug — root cause

Not a missing `position: sticky`; it was already set. The landing root div carried
`overflow-x: hidden`, which forces `overflow-y` to compute to `auto` — **making it a scroll
container**. A sticky header then sticks to *that container* rather than the viewport, so it
scrolled away (measured: header at `-900` after scrolling 900px).

Fixed by switching to `overflow-x: clip`, which blocks the same sideways overflow **without**
creating a scroll container, on both the root div and the `html.sa-navy` guard rail. `hidden` is
kept as a preceding declaration so engines without `clip` still get the overflow guard.

Measured after: header at `0` after scrolling 1200px, and horizontal overflow still prevented.

## Verified (measured from the live DOM)

- Graphic: `BUTTON`, `aria-label="Cram Exam 1 Free"`, 2 bolt paths filled `var(--sa-bolt-1)`,
  4 question rows, header cycling `ACCT 200` → `AC 210` → `ACCT 2013` on a 4s beat.
- Cycle ORDER proven by unit test (browser timing kept sampling mid-rotation): Ole Miss, LSU,
  Tennessee, then picker order; unverified codes dropped.
- Copy: new subhead present, `Created by a pro tutor` present, `Built by a pro tutor` absent.
- Objection block present with `Match my exam ⚡`; `Go crush exam day` absent.
- Pass line `×` present and `opacity: 0` at rest.
- Professor stage: heading, `Search Ole Miss professors` placeholder, 21 roster rows,
  `isn't listed`, `← Change school`, **no `Skip this`**, and not rendered as a sheet.
- Materials modal: `Get your exam gameplan`, new body, `Upload course materials`, `Not now`;
  old copy absent.
- Top bar: `✓ Ole Miss …`, `Reset`, no `Add professor`.
- Footer: 5 links incl. Greek + subtext, text-me block, three legal lines last and in order.
- Navbar sticky at 1440×1000; `tsc` clean; **1032/1032 tests**.

## Not verified

- **Screenshots — fourth pass running.** The Browser pane paints into a ~105px corner and, under
  768px, forces `devicePixelRatio: 2` and crops instead of downscaling. None of the seven
  requested shots could be captured. The preview deploy is the thing to look at.
- Mobile WAS re-measured after writing this section: at 390×844 the graphic sits at 58vw and the
  CTA bottom lands at y=670 with **174px of headroom**; the navbar is sticky on mobile too and
  there is no horizontal overflow. So the graphic stays on mobile.

- The crossfade's *feel* (900ms against a 4s dwell) and whether the restrained glow reads as
  "illuminated" — both judgement calls that want your eye.
