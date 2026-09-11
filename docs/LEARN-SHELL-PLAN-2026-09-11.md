# /learn shell plan — 2026-09-11

What the student shell IS, before what it looks like. Written after reading the strategy doc,
SESSION-CONTEXT, the redesign proposal Lee approved on 09-11, the cram-map and site-publish
designs, the shorts audit, BRAND-ANIMATION, the three Greek phases, the rep messaging audit,
landing.tsx, every file in `src/components/learn/`, bolt-boil, schools.ts, and the memory notes
the earlier sessions kept. Lee's words are in quotes; everything else is a reading of them.

## 1. What the shell is for

One promise, in Lee's words: **"I'll take you from a B to an A."** The page exists to get a
student from a shared link into a cram video with nothing in between. Strategy doc: **"Feed the
Machine"** — no strategy short until accounting shorts have shipped; on the page that reads as
*nothing that is not cram sits between the student and the first video*. Reps, chapters, reviews
and reminders are real, and they live behind the hamburger (proposal §1, as built).

**Human First** — every student-facing line traces to something Lee said. No invented copy, no
emoji, no "coming soon", no "run" / "blast" / "pledge". "Like Reels for exam prep." verbatim.
"Get notified when these drop." verbatim. Per-topic counts only, never cross-exam totals, never a
fake number. The "built with AI" story is **"not for students"** — it never appears here.

**Use Your Words** — the voice is the tutor's, first person ("I'll email you the day Exam 2
opens"), and it is literally a feature: Text Lee floats bottom-right on every tier with the three
lines as drafted ("I love hearing from students…").

## 2. The first ten seconds (email §15, Lee's four steps)

`pick my school → pick my exam → watch short videos → practice what I just watched`

1. **Arrive.** `/s/<campus>` redirects to `/learn?campus=…&g=…` — **"Show the thing, then ask."**
   The loading moment is the brand splash (BoltBoil); no second spinner.
2. **See who this is for.** Navbar: the campus bolt in the school's two colours (kept — Lee said no
   to darkening them), Greek letters over it when the funnel knows the chapter, "survive", the
   campus name, `ACCY 201 · Exam 1`. The course code appears once per block (one-code rule).
3. **See what to do.** A compact hero — display line, sub line, one **Get started** button with the
   real average video length under it — and the first row already visible below the fold line.
4. **Watch.** "Start Here: Easy Points · 5 videos", a row of 9:16 shorts (near-black media
   surfaces, as the videos are), then **Practice** as the last card of the same row.
5. **Practice.** The soft gate asks once ("Watch first / Practice anyway"); Practice is whole-set,
   never per-part (cram-map: "Ask Lee; not now").

## 3. After Exam 1 (proposal §4, "later, not now")

Exam 2 / 3 locked → waitlist sheet, `examWaitlistLine` ("Exam 1 is free. Exam 2 is $50…"), one
email through the unified intake. Then, in order and none of it on the cram path today: reminders
advertised between videos (a card in the player), reviews captured in-app after practice, GroupMe
share in the hamburger. Chapter email volume is the demand signal that activates a rep — the
email gate on later topics and the exam waitlist are the two places that signal is generated.

## 4. What never changes per campus, and what always does

| never changes | always changes |
|---|---|
| the Survive shell: navbar ground, wordmark, canvas, type ramp (Rubik 900 / Inter), hero copy, row structure, the hamburger list, Text Lee | the bolt (c1 + c2, both kept), the hairline under the navbar, the accent (buttons, active pill, selected states, hover glows, focus rings, the "Reels" word), the topic bolts, the practice art's tint |
| green = success only (correct, done, A+) | the campus name, course code, Greek letters, share banner |

The email reverses one thing built on 09-10: the navbar no longer wears the school (c1 ground,
c2 rule). Every `?look=` candidate in Part E keeps the school ONLY in the bolt, active states,
the hairline, buttons and hover glows — the shell reads as one product at every campus.

## 5. "Like Reels for exam prep." at 390px vs 1440px

- **390:** a phone page, deliberately. Hero is four lines tall; the first row is a swipeable
  strip of 80–90% width cards with scroll snap, Practice as the last card; no arrows; topics are
  blocks with 28px of air and a hairline; every target ≥ 44px; Text Lee opens `sms:`.
- **1440:** a centred 1280 column for headers and text, rails allowed to breathe to the edge;
  cards ~240–280px wide at 9:16, 3.5–5 visible, never stretched to fill; a subtle right-edge
  fade and an overlaid arrow ONLY when the rail actually overflows; hover lifts 4–6px.
- Both: `const rowItems = [...videos, practice]` — the row is as long as its videos. No reserved
  slot, no gap before Practice, zero videos still shows Practice.

## 6. The email's sixteen sections — day one vs after launch

Launch is Fri 09-11 (Exam 1 / Easy Points free). Day one must not break the email gate, the
waitlist intake, the school picker, or the player routes.

- **Day one (in slices, each pushed to main):** §1 global tokens as a `Look` (after Lee picks);
  §2 navbar shell + exam dropdown; §3 compact hero; §4–5 StudySection / StudyRail with Practice
  appended; §6 card hover; §7 Practice card layout with the real count; §11 headers; §13
  breakpoints; §14 a11y (aria-expanded / controls / haspopup, focus rings, reduced motion).
- **Post-launch:** §8–10 the Recraft cram machine (prepare the slot, named groups `#belt`,
  `#card-in`, `#stamp`, `#card-out`, `#mark`, the five `--illustration-*` vars; no art fabricated);
  §12 the calmer waitlist state (the blur-under-one-box is shipped and works; soften after launch);
  autoplay thumbnails; the hover conveyor sequence.

## 7. Order of work

1. This plan.
2. Part C's six conflicts — one message to Lee (palette, navbar, pills vs dropdown, fixed grid vs
   appended Practice, Get started vs Start cramming, practice art).
3. Part E's looks: cream, paper, chalk, charcoal, split, mono beside black and navy, behind
   `?look=`, with the `?looks=1` picker; screenshots at 1440 and 390, Ole Miss and no school. STOP
   for the pick.
4. The shell, in slices, each `tsc` + `bun test src/components/learn` + pushed to main.

Rules that hold throughout (SESSION-CONTEXT): another session is editing `blastoff/*` and `v3/*`
in this worktree — never touch or commit those paths; commit with `--only`; a green build proves
nothing until the built output is grepped for a string only this feature contains.
