# "Use your words" — the Blast Off typing audit

2026-09-07. Lee: "'Use your words' is the fundamental value we are building into survive accounting
and survive studios. So, I'd like for an audit across all of v3 for blast off pipeline for any
other situations where instead of typing I can talk. Wherever we can click, talk, get
suggestions. It's like, I know we've already brainstormed what to say about this set, but now
we've illustrated for it (which could mean I now may reference the illustration!), we've
rehearsed it, maybe 2-3 rounds, and possibly found new things, and now we're at the final editing
point. Maybe one last thing comes around to enhance our video… I want it all. Nowadays, I feel
like this is the only way to succeed in the shorts game. Every second matters."

This is a report, not a build. Every `<input>` / `<textarea>` / `contentEditable` / `window.prompt`
on the /v3 Blast Off line was read (routes `v3*.tsx`, `components/v3/**`, `components/blastoff/**`,
the Booth, the Illustrator, the review board, the production pill, Cross-post, Iterate). The
shape we are copying everywhere is the one that already works in two places: **click a mic, talk,
the AI follows along and suggests the finished thing, one click keeps it, typing is the fallback
(edit the suggestion in place).** That shape is in the rehearsal review (`RehearsalReview.tsx`) and
the Illustrator's "Say it" box; it is in none of the ~30 other fields below.

The pattern in one sentence: **every word that CREATES content on this line is spoken (the Booth,
rehearsal, the Illustrator brief, Ctrl+I); every word that CORRECTS or FINISHES content is typed.**

## 1. Every place Lee types today — ranked by hits per set

Frequency is an estimate from how the flow works (a set = ~10–15 slides, 2 rehearsal rounds, 2–6
illustrated slides). "AI" = a model call already wired to that field. "Lands" = where the spoken
suggestion would be written.

| # | Hits / set | Where (file:line) | What he types | Mic? | AI? | Proposed click · talk · get suggestions |
|---|---|---|---|---|---|---|
| 1 | 5–15 | `src/components/blastoff/IllustrationPanel.tsx:297` | "or: what to change…" — the revision to the AI-prepped picture prompt. Enter or "Revise" → `draft(true)` | No (the mic at :228 feeds only the first box) | Yes — `runMicro` at :138 with `previous` + `revision` | Mic on the revision box, same `useDictation`; the brief re-runs on a ~2.5 s throttle while he talks (the rehearsal review's pattern) and the summary updates live; "Use that" generates. Lands: `illustration.prompt` / `summary`. |
| 2 | 3–8 | `src/components/blastoff/ReviewDeck.tsx:694` | The callout title / caption / blank-slide text for `phrase`, `tip`, `exhibit`, `blank` (placeholder literally says "say it the way you'd say it on camera") | No | None — ReviewDeck imports no `runMicro` | One "🎙 Say it" per `SlideEditor`: he talks about the slide, the AI returns `{title, lines}` in the cram register using the card + talkthrough notes (rehearsal-context.ts already composes both), shown as a diff against the current slide; "Use this" patches. Lands: `frame.text` (+ `frame.bullets`, #3). |
| 3 | 2–6 | `ReviewDeck.tsx:698` | Bullets, one per line, Tab nests (`indentBulletLine`) | No | None | Same call as #2 — the spoken take yields the lines with nesting; a "shorten" pass (the rehearsal review's, `buildShortenLineMessages`) on the lines. Lands: `frame.bullets`. |
| 4 | 2–8 | `ReviewDeck.tsx:914` (stem), `:923` (choice text ×3–5), `:924` (feedback) | The CEQ editor — rewording a live exam question; Save writes the BANK (`applyCeqEdit` :848) | No | None here (the Booth's edit draft `Booth.tsx:356–394` is a different path) | "Say the fix": he talks ("choice B should say lender, and the stem's too long"), the AI returns the edited stem/choices as a diff with the correct one still marked; Save → bank as today. Reuse `buildMicroEditMessages` (Booth.tsx:379). Lands: `CeqDraft` → bank. Highest consequence field on the line — keep the Save click. |
| 5 | 2–6 | `src/components/canvas/ReviewBoard.tsx:209` | "your note on this item…" under every Step-1 result card: the correction for one AI card; 📌 Pin distills it into a standing `styleNote` (:211–219, the ONLY author of `styleNotes`); "Regenerate with my notes" (:220) | No | Yes — `pinStyleNote` + `regenerateReviewItem` (talkthrough-review.ts:233, :254) | Mic on the note; while he talks the AI shows the one-line style note it would pin AND the regenerated card side by side; two buttons: "Pin that" / "Regen with that". Lands: `BoardItem.comment`, `styleNotes`. |
| 6 | up to 4 | `src/components/v3/ProductionTimer.tsx:366` | "What sucked, what would've been better? (optional)" — the retro note per finished step; raw material for Step 5's consultant (`improve-brief.ts`) | No | Downstream only (`ImprovePage.tsx:255`) | Mic in the finish sheet: talk the retro, the AI returns a one-line note + a tagged bottleneck ("waiting on Recraft", "re-recorded slide 4 ×3") for the consultant. Lands: `run.steps[step].note`, `production_time_log.note`. |
| 7 | 1–4 | `src/components/blastoff/BankPicker.tsx:138` (title, placeholder "In Lee's words"), `:142` ("Why / when") | A fresh phrase / cheat code not yet banked; Enter writes it BACK to the bank (`putBoardItem` :108) and onto the slide | No | None | Mic: he says the phrase and why; the AI returns `{title, body}` in his register, one Enter banks + places it. Lands: `BoardItem` + `frame.title/text/body`. |
| 8 | 1–4 | `BankPicker.tsx:115`; `src/routes/v3.post.tsx:188` | Search boxes ("search the bank…", "Search a topic or set…") | No | None | Low value — a spoken search is slower than three letters. Leave. |
| 9 | 1–3 | `ReviewDeck.tsx:687` (cheat title), `:689` (first line under it) | The Cheat Code heading + body | No | None | Same mic as #2 — the cheat kind returns `{title, body}`. Lands: `frame.title`, `frame.body`. |
| 10 | 1–3 | `ReviewBoard.tsx:378` (stem), `:383` (choice ×n) | The CEQ OVERRIDE on a Step-1 review card ("Click to override"); Save override → bank (:401) | No | The card IS the AI's proposal | Same "say the fix" as #4, on this card. |
| 11 | 0–2 | `IllustrationPanel.tsx:279` | "the subject (edit if you must)" — hand-editing the prepped prompt | No | It is the output of :138 | Covered by #1 — a spoken revision replaces most hand edits. |
| 12 | 0–2 | `src/components/talkthrough/SessionView.tsx:396` | The legacy regen note on non-results board kinds | No | `regenItem` :148 | Same as #5 if those cards survive; otherwise retire. |
| 13 | 0–2 | `src/components/blastoff/BlastOffCapture.tsx:636` | The prompter line, edited by hand — only after round 2 (`prompterEditable`), main window only | No (rehearsal dictation at :159 is the ROUND, not this field) | None — the review made the line | Mount the rehearsal review's `SuggestedCard` here: click the line → "Say it" + ✂ shorten passes + ↶, same brief. Lands: `frame.prompter/prompterKeys/prompterTransition` via `commitPrompterLine` :216. |
| 14 | occasional | `src/components/blastoff/RehearsalReview.tsx` (`SuggestedCard` textarea) | Editing the Suggested line in place | Yes — beside it: "🎙 Say it (T)" re-briefs live | Yes | Done (fourth + fifth pass). Remaining gap: talking never lands IN the textarea; only via the brief. Fine by design ("we're not writing our own, we're talking about it"). |
| 15 | up to 4 | `v3.post.tsx:308` | "paste the URL" — the posted Short's link per destination | No | None | A URL, not words — leave. But see §3, the caption that ISN'T here. |
| 16 | rare | `ReviewDeck.tsx:715` (intro topic line), `:719` (outro tagline) | Overrides for the intro/outro text | No | None | Fold into the #2 mic (kind-aware). Low priority. |
| 17 | rare | `ReviewDeck.tsx:776–782`; on-slide `src/components/blastoff/AdSlide.tsx:123, 126, 131, 142` | Ad label / headline / lines / url | No | None | Talk the ad: "make it the app ad, lead with the price" → the AI fills all four from `ad-kinds.ts`. Low priority — ads are canned. |
| 18 | rare | On-slide click-the-words: `src/components/brand-cards/BoltZoom.tsx:353, 355, 366, 371, 372` via `Editable.tsx:44` / `frame-view.tsx:76` | Open tagline, domain, intro topic, tutor line | No | None | Leave — set-and-forget brand text. |
| 19 | rare | `ProductionTimer.tsx:355` | The pause reason ("one line — what pulled you away") | No | Consultant reads it later | Mic on the input, no AI needed — a spoken reason is already the artifact. |
| 20 | rare | `src/components/v3/improve/ImprovePage.tsx:380` (task label), `:386` (`window.prompt("New task")`) | Renaming / adding checklist tasks | No | None | Replace the `window.prompt` with an inline field + mic. Configuration, not per-set. |
| 21 | 0–1 | `src/components/talkthrough/Booth.tsx:903` | "Paste the dictation here…" — a transcript dictated elsewhere; stamps parsed from the words | No mic by design (the words were spoken elsewhere); `.txt` upload at :913 | Pure parse, no model | Leave — it exists so typing ISN'T needed. |
| 22 | any page | `src/components/ideas/IdeasDock.tsx:488` (Ctrl+I body), `:457` ("write in…" category) | An idea | Yes — "🎙 Hold to dictate" (:503, MediaRecorder → server transcription, `ideas/voice.ts`) | Ctrl+F fast track drafts from it | Done. The category write-in has no mic — trivial, skip. |
| 23 | any page | `src/components/ideas/FastTrackSheet.tsx:157` (Ctrl+F) | "Say what should change, in your own words" | No — the placeholder says "say", the box only types | Yes — the fast-track brief | Mic on the sheet (`useDictation`, four lines). Cheap. |

Outside the Blast Off line but in the same building, for completeness: `src/components/shipped/NotepadSurface.tsx:67`
(mid-take notepad, contentEditable), `src/components/shipped/ConfirmScreen.tsx:40–47` (SHIPPED
title/topic/semester), `src/routes/admin.growth.v3.tsx:91` (campus search). None dictated; none
per-set.

Not typing, listed so nobody re-audits them: the canned intro/bio/outro `<select>`s
(`RehearsalReview.tsx` CannedSlotRow), the layout `<select>` (`v3.$topic.$set.index.tsx:93`),
the psych and camera-size sliders (`ReviewDeck.tsx:749, 807`), the visual-stamp "What kind?" chips
+ select (`Booth.tsx:728–751` — a note written with zero keystrokes, the right idea), the run
pickers (`ImprovePage.tsx:87`, `ProductionTimer.tsx:480`), the reference-photo file input and the
"rhymes with" select in the Illustrator.

## 2. Already done — the baseline

- **The Booth (Step 1).** Two engines at once: browser `SpeechRecognition` for instant text and
  Whisper for the stored truth (`src/components/canvas/talkthrough-audio.ts:48–58, 246, 289, 426`);
  press-to-press segments, focus as a boundary, stamps by Enter/arrows while talking
  (`Booth.tsx:435–445, 500–513`); a closed EDIT stamp fires a micro draft off the just-spoken
  words (`Booth.tsx:356–414`); End Session queues script / CEQ edits / illustration briefs / ideas
  from the transcript (`talkthrough-review.ts:311, 411, 436, 459, 484`).
- **The Illustrator's "Say it"** (`IllustrationPanel.tsx:81, 228–233`): dictation streams into
  the brief box; "Prep the prompt" (`runMicro` :138) → title + three bullets + the prompt; "Use my
  words as-is" skips the prep.
- **Rehearsal rounds** (`BlastOffCapture.tsx:159–170, 560–569`): live dictation per slide into
  the round's transcript, captions on the film surface ("seeing the words populate will help me
  get a feel for brevity visually").
- **The rehearsal review** (`RehearsalReview.tsx`): one slide, the slide drawn beside it, "What you
  said, cleaned" + "Suggested" (register, scan keywords, hand-off), "🎙 Say it (T)" re-briefing
  every ~2.5 s while he talks, edit in place, and — this commit — ✂ shorten passes (concise → cut
  → tighter still) with v1 · v2 · v3 chips and ↶, the slide's picture in the brief, every call
  priced into the cost ledger.
- **Ctrl+I** (`IdeasDock.tsx:81–93, 503–515`): hold-to-dictate into the Idea Bank; **Ctrl+F**
  drafts a fast-track from the idea.
- **SHIPPED** (`src/components/shipped/Recorder.tsx:71`): live captions on the take, the
  transcript kept.

## 3. What's missing that isn't a field yet

- **Cross-post has no caption, title, description or hashtag field at all** (`v3.post.tsx` — two
  inputs: a search and the pasted URL). The StepBar promises "Captions, exports, every
  destination" (`StepBar.tsx:53`); Lee's own header note: "we will still need to optimize the
  publishing some, so it's an afterthought." This is the "one last thing comes around to enhance
  our video" moment: after film, before post — talk 20 seconds about the set and the AI writes the
  title + caption + hashtags per destination from the kept prompter lines, the card, the
  talkthrough notes and the take's captions. Nothing to retrofit; it's greenfield.
- **A "last word" pass before filming.** By the time Lee films, three things exist that the slide
  text never saw: the picture, the kept prompter lines (2 rounds), and the shorten passes. Nothing
  offers the slide's own text a rewrite from them. A single "tighten the slide to the line" button
  on the film surface (or Editor) — the AI proposes shorter bullets that match what he'll SAY —
  closes the loop Lee describes ("we've illustrated… rehearsed… now we're at the final editing
  point").

## 4. Proposed build order — one brief each

The order is by hits per set × how much of the pattern already exists (a mic + a brief is a
morning; a new screen is a night). Every one reuses `useDictation` (`src/lib/use-dictation.ts`),
`runMicro`, the rehearsal review's live-brief throttle (`LIVE_BRIEF_EVERY_MS`), and logs its price
with `logCostEvent`.

1. **Illustrator revision by voice** (#1) — mic on the "what to change" box; re-run `draft(true)`
   on the throttle while he talks, summary updates live, one click generates.
2. **Editor "Say it" per slide** (#2, #3, #9, #16) — one mic in `SlideEditor`; a new pure
   `buildSlideTextMessages({ kind, current, card, talkthrough, picture, spoken })` returning
   `{title, body, lines}`; shown as a diff, "Use this" patches through `onPatch`; a ✂ shorten pass
   on the lines reusing `buildShortenLineMessages`.
3. **Say the fix — CEQ edits by voice** (#4, #10) — mic in `CeqEditor` and `CeqEditCard`; the
   spoken correction + the current stem/choices → the edited card with the correct one marked
   (reuse `buildMicroEditMessages`); Save → bank stays a click.
4. **Cross-post: talk the caption** (§3) — new per-destination title/caption/hashtags on
   `/v3/post`, a mic, one brief from set + kept lines + talkthrough + take captions; copy buttons per
   destination.
5. **The retro by voice** (#6, #19) — mic in the finish sheet and the pause sheet; the AI returns
   the one-line note + bottleneck tag; the consultant reads tags, not prose.
6. **Review-board note by voice** (#5, #12) — mic on the note; live preview of the style note it
   would pin and the regenerated card; "Pin that" / "Regen with that".
7. **Bank picker by voice** (#7) — mic on "In Lee's words"; `{title, body}` in his register;
   Enter banks + places.
8. **Prompter line on film after round 2** (#13) — mount `SuggestedCard` (Say it + shorten + ↶)
   in place of the plain textarea.
9. **Ctrl+F mic** (#23) — four lines.
10. **The "last word" pass** (§3) — after both rounds: propose slide bullets that match the kept
    line, per slide, accept per slide.

Left out on purpose: search boxes (#8), the pasted URL (#15), on-slide brand text (#18), the ads
(#17 — canned), the Booth import (#21 — it already exists so typing isn't needed), Improve task
labels (#20 — configuration; only swap the `window.prompt` when someone is in that file anyway).
