# Landing Pass 5 — in-player states, FAQ, no internal scrollbar, hero polish

Branch: `landing-pass-5` (on top of `main` @ `382f878`). Nothing outside the landing page and its
own components was touched — no Greek work, no checkout, no player internals.

---

## 1. The materials step moved INSIDE the player

`MatchSheet` is **deleted**, not hidden. It portalled to `document.body`, so the materials step
rendered as a detached panel pinned to the top-left of the viewport rather than inside the player —
and because a professor pick re-opened it (at the professor rung), picking a professor read as the
selection having failed.

`MatchPanel` is now the whole flow, one state machine in the right panel:

| State | What the panel is |
|---|---|
| 1 | Pick your school |
| 2 | Pick your professor |
| 3 | **Materials gate** (new — was the modal) |
| 4 | Confirmed bar + video/poster |

State 3 is centred in the panel like the two rungs before it. `matchOpen` is gone; the panel tracks
`materialsDone`, and `useEffect(… , [school?.id])` clears both `profDone` and `materialsDone`, so
Reset genuinely restarts the flow instead of resuming three-quarters of the way through it.

### Coverage % is now on the materials header

The stat and the ask are one sentence in one place instead of a title above a separate modal:

- with a professor — `This already covers ~80% of Prof. Prakash's Exam 1.`
- school only — `This already covers ~80% of most Exam 1s.`
- resolver returned nothing — `This already covers most Exam 1s.`

The number is only ever the real resolver value. When there isn't one, the sentence drops the
number rather than inventing one. All three branches were exercised in the browser.

Body copy: *Send your syllabus, study guides — whatever you've got — and I'll match my videos to
your course. The more you send, the better.* Buttons: `Upload materials` / `Not now`. The "old
exams" phrasing is gone.

## 2. FAQ replaces the objection block

`MatchObjection` (headline + `Match my exam ⚡`) is replaced by a 7-question FAQ under a quiet
`FREQUENTLY ASKED QUESTIONS` label. The CTA went with it on purpose: the answer to Q1 points at the
player *above*, so a button here would have scrolled past the thing it was pointing at.

Order is biggest-objection-first, ending warm — `What if I watch everything and still feel lost?`
closes on a person, not a policy. `FAQS` is a plain array, built to grow.

## 3. The player has no internal vertical scrollbar

**Reproduced first.** The outline column was capped at `sm:max-h-[380px] overflow-y-auto`. With the
Starter Map's 7 topics the column's natural height is **392px** — 12px over the cap — so it
scrolled, and the notify box (the last thing in the column, and the only thing in it that captures
an email) sat below the fold of a box most students never realise is scrollable.

- At `sm` and up the cap is removed entirely (`sm:max-h-none sm:overflow-visible`). The column is
  its natural height and the **page** scrolls. It cannot re-break as topics are added.
- Below `sm` the outline is a drop-down drawer stacked above the video, where capping it is
  correct — an unbounded drawer would push the video off-screen. It keeps a cap, now `60vh`.
- The notify box was compacted anyway (`px-3 py-2.5` → `px-2.5 py-2`, 11.5px label → 11px,
  `mt-1.5` → `mt-1`), since every pixel it spends is a pixel the column grows past the video.

Measured after the change at 1920×1080 and 1440×900: **nothing inside `#exam1` scrolls** — outline
392px, right panel 392px, whole player card 479px. The school/professor lists inside the picker
still scroll, which is intended.

## 4. Hero polish

- **The white keyline is back on the bolt.** Pass 4 passed `keyline=""`; on the dark colourways
  (Auburn navy, Florida blue) that merged the bolt into the navy page.
- **The sheet is navy-tinted (`#22304F`), not cream.** At hero size the cream sheet was the loudest
  object in the composition and competed with the bolt. Rules, rows and bubbles were re-tinted to
  match; it still reads unmistakably as a tilted, ruled exam sheet.
- **The course code is static cream.** It was `var(--sa-bolt-1)`, so its legibility changed with
  every school in the cycle.
- **The campus name (new, bottom-left) carries the school colour.** Legibility comes from
  `-webkit-text-stroke: 3px rgba(10,16,30,0.85)` with `paint-order: stroke fill`, which draws the
  dark edge *behind* the fill — so Vanderbilt gold and Tennessee white keep their true colour
  instead of being dropped from the cycle for being too light.

`EXAM1_STATUS_LABEL` → `Filming this week!`.

---

## Verification

- `tsc --noEmit` — clean.
- `bun test` — 1049 pass, 0 fail.
- `bun run build` — clean.
- Browser, at 1920×1080 / 1440×900 / 375×812: all four panel states walked end to end including
  the no-professor fallback header; zero console errors on a fresh tab; no internal scrollbar in
  the player; mobile drawer still capped at 60vh; no horizontal page overflow (`scrollWidth` ==
  `innerWidth` at 375).

### Not verified

**Screenshots.** The Browser pane won't composite frames in this environment, so every visual claim
above rests on measured DOM geometry and computed styles, not on looking at the page. The campus
name's contrast in particular is reasoned (`boltFor` floors every `--sa-bolt-1` at 2.6 against the
page navy; against the slightly lighter `#22304F` card the worst case lands near 2.2 before the
dark stroke is counted) rather than seen. Worth a glance on a real screen.
