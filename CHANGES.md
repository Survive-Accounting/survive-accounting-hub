# Landing realign — Pass 2

Branch: `landing-realign-pass-2`. Landing page + player chrome only. Checkout, the Greek page and
the video player internals were not touched.

---

## 1. Navbar (new)

Sticky, always fully visible. Top-left is the **compact lockup** — `survive` with the split-bolt
"i" and `ACCOUNTING` in letterspaced muted caps beneath. This is now the **only** wordmark on the
page.

Hamburger menu, in order:

1. Cram Exam 1 Free → `#exam1`
2. Reviews → `#reviews` *(new anchor, added above the testimonials)*
3. About Lee → `#lee`
4. Contact → `#contact`
5. *(divider)*
6. For Fraternities & Sororities → `/chapters` *(a route, not an anchor — hence the divider)*

The previous fade-in-on-scroll hamburger is **removed**. It existed to keep exactly one
interactive element above the fold while the hero carried the wordmark; now the navbar *is* the
brand statement, and hiding half of it on load just looked unfinished.

## 2. Hero — four elements

| | |
|---|---|
| H1 | `Cram what's on your exam.` |
| Subhead | `On-demand exam prep for your first accounting course. Built for the night before.` |
| CTA | `Cram Exam 1 Free ⚡` |
| Badges | `Built by a pro tutor` · `1,000+ students tutored since 2015` |

**Wordmark removed from the hero.** No config controls.

## 3. Player — screenshot-6 layout restored

- **Four exam tabs**, full player width, amber underline on the active one:
  `EXAM 1 — FREE` · `EXAM 2 — $50` · `EXAM 3 — $50` · `FINAL — $50`.
  The row scrolls horizontally rather than compressing, because the price is the load-bearing half
  of each label and must not truncate at 320px.
- **Under the tabs:** `Or grab the Semester Pass — everything, all semester, $150.`
- **Left sidebar:** `Common exam questions` header + topic list with "coming" states + topic count.
- **Right panel** replaces the top school/professor bar entirely:
  - *Initial:* `Pick your school to start` + the school dropdown (`Search 16 SEC schools…`) + the
    scrolling marquee directly beneath it.
  - *After school:* professor search (`Search [School] professors`) with
    `My professor isn't listed →`, `← Change school`, `Skip this`.
  - *Confirmed:* `✓ [School] · [Course] · Prof. [Name]` inside the panel, above the content.
- `My school isn't listed →` stays pinned at the bottom of the school list (unchanged).
- The `One last thing / Send your syllabus` step is unchanged apart from the coverage line below.

**`← Change school` / `Change` is a FULL reset** — clears school, the not-listed flag *and* the
professor. A partial reset would leave a professor attached to a different campus's faculty.

## 4. Locked tabs (Exam 2 / 3 / Final)

- Sidebar header `Common exam questions` with right-aligned `Opens Fall 2026`.
- The lock line `Blurred bits unlock with Exam 2.` is **removed** — there are no blurred bits yet.
- Notify box: `Get notified once Exam 2 is ready` + `you@school.edu` + `Notify me`.

## 5. Removals

| Removed | Why |
|---|---|
| `Start studying` floating pill | glitchy, deleted outright |
| `BEING BUILT FOR` marquee section | the marquee now lives only under the school picker |
| Pricing table (`Exam 1 / start here / Free … Tell me when they land`) | superseded by the tab row + Semester Pass line |
| School/professor top bar (`MatchChip`) | selection moved into the right panel |
| Hero wordmark | the navbar lockup is the only one now |
| Hamburger fade-in-on-scroll | navbar is always fully visible |

## 6. Three steps — final copy

1. **Pick your school and professor** — `So your cram videos match your specific exam.`
2. **Start cramming** — `Exam 1 is completely free. Other exams are $50 each.`
3. **Go crush exam day** — `Way easier when a tutor has shown you exactly what to expect.`

## 7. Testimonials

Header `What students are saying` and the carousel are unchanged. Only an `#reviews` anchor was
added above it so the navbar item lands.

## 8. About → "Meet your tutor"

- Section header: `Why I built Survive Accounting` → **`Meet your tutor`**. The story keeps its
  name as a small uppercase sub-heading inside the expanded body.
- Portrait caption split into three lines: `Lee Ingram` / `Ole Miss accounting grad` /
  `Tutor since 2015` (was one dot-joined line).
- Collapsed teaser unchanged (two student quotes + `Sound familiar?` + `Read more`).
- Expanded body, final copy:
  - `Lectures teach you *about* accounting. Exams test whether you can *do* it.`
  - `So my cram videos are real exam-style questions, worked start to finish — you walk into the exam having already done the problems.`
  - `This course is tough. So are you. Exam 1 is free — see for yourself.`

## Also in this branch: the coverage line

Moved into the match sheet's **last step**, as requested. On the old top bar it was a passive
statistic; on the final rung it is the *reason* to send a syllabus.

> Right now this likely covers **N%** of Prof. [Name]'s [Exam].

**It renders only when the resolver returns a real number** for the active exam — a null coverage
shows nothing rather than a zero or a guess. One deliberate deviation from the old rule: the
previous version showed coverage on *paid tabs only*, because "80%" next to a free Exam 1
manufactured doubt at the free offer. In the syllabus step the framing is the opposite (it names
the gap the syllabus closes), so the paid-tab restriction was dropped. **Consequence to know:** on
current data the Starter Map returns `null` coverage for Exam 1, so the line does not appear yet —
I could not see it render, only verify the guard and the wiring.

---

## Verified at 390×844 (measured from the live DOM)

- Hero spans y=55 → 844 — fills the viewport exactly, no horizontal overflow.
- Above the fold: lockup, hamburger, CTA (Pass 2 intends all three; the one-element rule belonged
  to the previous hero).
- Tabs: all four present, `tablist` scrolls horizontally, **every price visible**.
- Locked Exam 2: `Opens Fall 2026`, `Get notified once Exam 2 is ready`, `you@school.edu`,
  `Notify me`, no blur line.
- Flow: panel picker → school sheet (sticky `My school isn't listed →`) → professor step
  (21 rows; footer `My professor isn't listed →`, `← Change school`, `Skip this`) → `One last
  thing` → confirmed `✓ Ole Miss · ACCY 201 · Prof. Allen`.
- `Change` reset: returns to `Pick your school to start`, marquee restored, and **both**
  `sa-landing-school` and `sa-landing-prof` cleared from localStorage.
- Removals confirmed absent from the DOM: `BEING BUILT FOR`, the pricing table, `Start studying`.
- `Meet your tutor` is the section header.
- `tsc --noEmit` clean; 1022/1022 tests pass.

## Not verified

- **Screenshots could not be captured.** The Browser pane's screenshot renderer paints the page
  into a ~105px corner of the canvas while the DOM correctly reports the real viewport, and under
  768px it forces `devicePixelRatio: 2` and crops instead of downscaling. Same limitation as the
  previous pass. The measurements above stand in; the preview deploy is the thing to look at.
- The coverage line rendering with a real percentage (see above).

## One flag

Section 3 reinstates a **school-first gate**: the right panel shows the picker instead of content
until a school is chosen, reversing the previous pass's "try-first, never a gate". Built as
specified. It is softer than the old blur — the left outline stays populated the whole time — but
the only escape at the school step is `My school isn't listed →`, which is untrue for a student
whose school *is* listed and simply doesn't want to say. A neutral `Skip for now` would close that
hole without weakening the ask.
