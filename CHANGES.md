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
