# Hero redesign v1 — what moved where

Branch: `hero-redesign-v1`. Scope: the hero and the entry journey. The player itself, the
pricing page and checkout were not touched.

---

## The hero is now exactly four things

In order: **brand lockup → headline → subhead → CTA.**

| | |
|---|---|
| Lockup | `survive` with the animated split bolt as the "i", and `ACCOUNTING` beneath it in letterspaced small caps at 55% opacity |
| Headline | `Cram what's on your exam.` (unchanged, as instructed) |
| Subhead | `Built for your first accounting course.` |
| CTA | `Cram Exam 1 Free ⚡` — the only interactive element on the screen |

The section is `.sa-hero`, which fills exactly the viewport left under the sticky header, so
nothing below it can peek above the fold.

## What left the hero, and where it went

| Was in / under the hero | Now |
|---|---|
| Exam dropdown | Unchanged, inside the player — now below the fold |
| School / course selector (the blurred **gate**) | Deleted. School is chosen in the match sheet, or never |
| "Let's tailor this to Prof. X's exams" | Deleted from all three places it appeared. The ask is the last, optional step of the match sheet |
| "Send your syllabus" link | Same — inside the match sheet, and in the footer only as a removed item (see below) |
| Topic selector | Unchanged, inside the player — and no longer hidden until a school exists |
| School marquee (inside the gate) | Below the player as `SchoolProofBand` — proof, not an input |

## The journey: one tap to content

1. **Tap the CTA** → scrolls to the player, which is already on Exam 1, first topic, with the
   first live set selected. No account, no school pick, no interstitial.
2. **The player carries a quiet chip**: `Match this to your school →`.
3. **Tapping the chip** opens a bottom sheet: school → professor → optional syllabus. Every step
   is skippable, and the professor step has a `← Change school` row so a wrong first answer is
   fixable.
4. **When matched**, the chip becomes a badge: `✓ Ole Miss · ACCY 201 · Prof. Allen ▾`, still
   tappable. Only the parts actually known are shown — a missing course code or professor drops
   out rather than being invented.
5. **School not listed** → the sheet goes to the syllabus step instead of dead-ending.

**The gate is gone.** `ExamPlayer` used to compute `gated = !school && !notListed` and blur the
stage behind a school picker. The Starter Map resolves Exam 1's seven topics with no campus at
all, so the blur was withholding content the server was already willing to serve. The
`if (!school) return;` guard that stopped the CTA from selecting a live set is gone with it.

## Below the fold, in order

1. `SchoolProofBand` — "BEING BUILT FOR" + the school marquee.
2. `HowItWorks` — Pick your exam → Cram the topics → Walk in ready.
3. `PricingBlock` — Exam 1 free · Exams 2/3/Final $50 each · Semester Pass $150.
4. Then the existing testimonials, Lee section and footer, unchanged in order.

## Copy decisions made inside the rules

- **"Try" is gone everywhere.** The CTA is `Cram Exam 1 Free`; the internal handler was renamed
  `onTryFree` → `onStart` so the forbidden verb is not even in the source.
- **The subhead does not restate the product.** The old line ("Cram videos for Intro Financial
  Accounting — built for your professor's exams") repeated the lockup, repeated the headline, and
  promised tailoring before the student had seen anything worth tailoring.
- **"ACCOUNTING" appears once**, in the lockup. Neither the headline nor the subhead says it.
- **No hero sentence is over 8 words** (subhead is 6; headline is 5, as specified).
- **The proof band is not tappable.** The brief allows deep-linking a school from it, but a
  scrolling marquee makes every name a moving target — the worst possible tap affordance — and
  the brief's stronger requirement is that the band read as proof, not as a step. The stationary
  version of that list lives in the match sheet.
- **How-it-works line 1 says "No account."** because that is now literally true.

## Footer (requested mid-flight)

Removed the YouTube and Instagram icons — both pointed at `#` because the accounts do not exist
yet, and a dead link costs more trust than a missing one. Removed `Send your syllabus` and
`Text Lee` from the link row: the syllabus ask now lives in the match sheet where it has
context, and Text Lee is the large amber button directly above. `For Greek orgs` is the only
link left.

## Deleted code

`CourseMasthead`, `ProfessorPicker` and `SchoolDemandField` are gone, along with the state that
only fed them (`pickerPulse`, `profSkipped`, `skipProfessor`, `changeSchool`, `mapStatus`,
`mapLevel`, `mapped`). `CampusSelector` stays — `/chapters` and `/expand` still use it.

**One capability was genuinely dropped:** the "Likely covers N% of Prof. X's Exam 2" coverage
line and the "✓ Mapped to …" trust lines that lived in `CourseMasthead`. The chip's `✓` plus the
school/code/professor badge carries the *matched* signal, but the percentage is not shown
anywhere now. It could return inside the sheet's final step, where it would motivate sending a
syllabus. Flagging rather than silently reinstating it.

## Bugs fixed on the way

- `SchoolTicker` called `matchMedia` during render via `useMemo` — a real SSR/hydration mismatch
  on this server-rendered route, since the server always took the animated branch. Now read in an
  effect.
- The professor roster prefetch was lost when `CourseMasthead` was deleted, so the sheet's step 2
  opened empty and filled a second later. Restored in `ExamPlayer` on the same query key.
- `TwoSetAsk` required a non-null school. It now accepts `null` and records what is known, so the
  two-sets-watched ask still fires for a student who never matched a campus.

## Verified at 390×844 (measured, not eyeballed)

- Hero spans y=49 → 844: fills the viewport exactly, zero overflow.
- Interactive elements above the fold: **1** (the CTA). The header's hamburger fades in only
  after 80px of scroll, and is `aria-hidden` + `pointer-events:none` until then, so it is not
  reachable by keyboard or screen reader either.
- Cold load → tap CTA → player in view, gate gone, seven Exam-1 topics listed: **1 tap**.
- Match sheet: 17 school rows → 21 professor rows on open (prefetch working) → compact syllabus
  step → chip reads `✓ Ole Miss · ACCY 201 · Prof. Allen`. Root scroll lock released on close.
- `tsc --noEmit` clean; 925/925 tests pass.

## Not verified

- **Screenshots could not be captured.** The Browser pane's screenshot renderer paints the page
  into a ~105px corner of the canvas while the DOM correctly reports 820×900, and under 768px it
  forces `devicePixelRatio: 2` and crops rather than downscales. The numbers above are measured
  from the live DOM instead. The preview deploy is the thing to look at.
- **Lighthouse was not run**, so "performance does not regress" is unproven. The change removes
  a component tree and adds three small static sections; no new dependency was introduced.
- Real iOS behaviour of the bottom sheet (keyboard geometry, rubber-band, safe-area) is still
  the open item from the picker work — unchanged by this branch.
