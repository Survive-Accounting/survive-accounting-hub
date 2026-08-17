# Landing Pass 3 — hero graphic + Exam 1 notify pattern

Branch: `landing-pass-3`. Two focused changes; everything else from Pass 2 is untouched. The
school/professor flow, checkout and the Greek page were not opened.

---

## 1. Hero — two columns and a graphic

**≥1024px:** two-column grid, `1.05fr / 0.95fr`. Copy left-aligned on the left, the exam-paper
graphic on the right. Below 1024px it collapses to the Pass 2 single centred column.

**Copy unchanged from Pass 2** — H1, subhead, CTA and both trust badges are byte-identical.

**Hero height was tuned by measurement, not by guess.** The brief asked for the player's tab row
to peek above the fold as a scroll cue. First attempt (62vh) put the tab row at **y=672 on a 1080
viewport, exposing ~400px of the player** — that is not a peek. At **80vh** the tabs land at
**y=865 with 46% of the card visible**: present as a cue, not fully revealed.

## 2. The exam-paper graphic — `src/components/site/ExamPaper.tsx`

Pure SVG + CSS. No JS animation loop, no canvas, no video, no raster asset.

- Cream sheet, rounded, rotated −4°, with a soft drop shadow lifting it off the navy.
- `EXAM 1` header + a name/date rule line.
- **5 greeked question rows**, each two strokes of varying length so the block reads as language
  rather than as a barcode, with **exactly one of four bubbles inked** per row in brand red.
- The split bolt struck through the middle at ~50% of sheet height, with a radial glow.

**Decorative only, deliberately.** No legible accounting content and no legible answers anywhere
on the paper. The inked bubbles were chosen for visual rhythm; putting real content on a marketing
prop is how an answer key ends up in a screenshot.

**The colour cycle animates two CSS custom properties** (`--sa-bolt-1` / `--sa-bolt-2`) through
four SEC colourways on a 10s ease-in-out loop — red/grey → red/blue → orange/navy → purple/gold.
Animating the *variables* rather than the fills means one keyframe drives the bolt and its halo in
lockstep, so the light can never disagree with the object casting it. Zero JS per frame.

**Reduced motion:** verified a `prefers-reduced-motion` block targeting `.sa-paper` exists — the
cycle stops on the canonical red/grey, the glow stays, hover scaling is disabled.

**The whole graphic is a `<button>`** — `aria-label="Cram Exam 1 Free"`, keyboard focusable
(`tabIndex 0`), visible focus ring, hover scale 1.02 with an intensified glow.

## 3. Mobile — the graphic stays, decided by measurement

The brief said CTA-above-the-fold beats the graphic. At 390×844 the graphic renders above the H1
at **58% of viewport width (226px)** and the **CTA bottom lands at y=641 — 203px of headroom**. So
it comfortably fits and the graphic stays. The fallback (`display:none`) is recorded in
`styles.css` next to the rule, so if the copy ever grows the next person knows which way to trade.

## 4. Exam 1 adopts the Exam 2 notify pattern

| | |
|---|---|
| Sidebar label | `Filming this week`, from `EXAM1_STATUS_LABEL` in `landing.tsx` |
| Notify box | `Get notified once Exam 1 is ready` + `you@school.edu` + `Notify me` |
| Removed from the poster | `Coming Fall 2026` and `Get notified →` |

`EXAM1_STATUS_LABEL` is one exported constant. It is the only copy on the page expected to change
weekly, which is exactly why it is isolated.

Exams 2/3/Final keep `Opens Fall 2026` and their own notify boxes — verified unchanged.

**Notify signups now record their exam.** `joinPricingWaitlist` gained an optional `examNum` that
rides in the **source tag** (`pricing_page_test_pass_exam1`), not a new column — no migration
needed. `tier` deliberately stays a real `WaitlistTier`: the union is only
`"test_pass" | "membership"`, and widening it to carry an exam would corrupt every existing
`tier_interest` report. (My first draft passed `tier: "exam_1_free"`, which would not have
compiled — caught before it shipped.)

`Poster` lost its now-dead `queued` and `onNotify` props rather than keeping parameters that no
longer do anything.

---

## Verified (measured from the live DOM)

**Desktop 1440×1080:** two columns (`499.8px / 452.2px`); H1 left-aligned at x=217; graphic is a
`BUTTON` with `aria-label="Cram Exam 1 Free"`, animation `sa-bolt-cycle` at `10s`; tab row at
y=865 with 46% of the player exposed; no horizontal overflow.

**Mobile 390×844:** single column; graphic above the H1 at 58vw; CTA bottom y=641 with 203px
headroom; no horizontal overflow.

**Exam 1 tab:** `Filming this week`, `Get notified once Exam 1 is ready`, `you@school.edu`,
`Notify me`, `COMMON EXAM QUESTIONS` header, topic pill present — and `Coming Fall 2026` /
`Get notified →` both **absent**.

**Exam 2 tab:** `Opens Fall 2026`, `Get notified once Exam 2 is ready`, no blur line — unchanged.

**Graphic activation:** instrumented `scrollIntoView` and clicked both controls. Both call it on
`#exam1` with identical options and both land at **y=757**. The graphic does exactly what the CTA
does.

`tsc --noEmit` clean; **1028/1028 tests** pass.

## Not verified

- **Screenshots could not be captured**, for the third pass running. The Browser pane paints the
  page into a ~105px corner of the canvas and, under 768px, forces `devicePixelRatio: 2` and crops
  instead of downscaling. The measurements above stand in; the preview deploy is the thing to look
  at. The two glow-cycle moments in particular cannot be captured here.
- **The colour cycle depends on `@property`.** Where it is supported the four colourways
  interpolate smoothly; without it browsers fall back to discrete swaps at each keyframe, which
  reads as four steps rather than a crossfade. Not visually confirmed in this environment.

## One note on smooth scrolling

Clicking either the CTA *or* the graphic appears not to scroll in this pane. That is a harness
artifact, not a bug: `scrollIntoView({behavior:'auto'})` moves to y=757 while `'smooth'` does not
move at all, because smooth scrolling is compositor-driven and this pane does not composite. The
same starvation freezes CSS animations and breaks screenshots here. No code was changed to
accommodate it.
