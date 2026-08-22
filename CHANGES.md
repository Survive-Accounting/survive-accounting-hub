# Student player: Reset/context, Q navigator, Cram·Practice·Review, one notify, Semester Pass (branch `player-reset-nav`)

Two focused UX/state passes on the student Exam/CEQ player. Marketing footer and authoring
tools untouched.

## 1. Reset respects route context (`src/routes/landing.tsx`)
Precedence inside the player: **route-provided school/chapter → this session's pick → stored
last-used → generic picker.** Route context is immutable: a stored campus never outranks a URL
campus (campus-context already resolved url above stored; the player now keeps it through Reset).
- `routeLocked = campusSlug || goChapter || greekOrg`. On a locked route the button reads
  **Start over** and resets only the session: professor + the professor-skip cookie are cleared,
  topic/set selection, open topics and the practice session (`resetSeq` in the SetFlowPanel key)
  are dropped, school/course/chapter stay. Next state: "Pick your professor to start" with
  "Skip for now →". No navigation home, no school picker.
- On the generic homepage the button reads **Reset** and still returns to school selection.
- Note: picking a school on the homepage navigates to `/<school>` (existing), so a wrong pick
  lands on a locked page. The explicit exit is the new **Not your school?** link under the
  professor step (`changeSchool` → forget stored campus → generic picker). That is a navigation,
  never a Reset.
- Professor persistence inspected, unchanged: localStorage `sa-landing-prof` + `sa-prof-skip`
  cookie (both in `src/lib/campus-prefs.ts`).

## 2. `Q1 / 8` is a navigator (`src/components/site/PracticeStage.tsx`, shared with /learn)
The chip is a button (`aria-haspopup="dialog"`, `aria-expanded`) opening `QuestionNav`: a tile
per question — unattempted (neutral), correct (green + check), incorrect (red + ×), current
outlined in gold independently of state; each tile is labelled "Question 3, correct[, current]";
`done of N answered`; Escape / outside-click / × close it. Click any tile to jump (non-linear; a
retry pass widens back to the full set if you jump outside the missed subset).
**Answers persist**: `pickedBy` remembers the locked-in choice per question, so Q3 → Q7 → Q3
shows Q3's result — no wipe, no silent resubmit (this also fixes the old back-arrow re-answer).
Statuses come from the session's latest attempt; grading untouched.

## 3. Cram / Practice / Review pills (`src/components/site/StagePills.tsx`, new)
Always-visible, compact stage control in the set strip: `SET n OF m · [⚡Cram] [☑Practice]
[↺Review]`. Availability is **derived from the content model** (`set-flow.ts` inputs): Cram =
`playbackId`, Practice = `ceqCount > 0`, Review = `hasReview` — no new flags, nothing hardcoded;
a published video un-mutes its pill automatically. Unavailable stages stay visible and clickable
at 62% with `· SOON` and a dashed ring. Mode colours are semantic only: Cram `#006BA6`, Practice
`#FFA611`, Review `#8B7FC7` (violet exists nowhere else). The redundant PRACTICE status pill in
the question header is dropped on this surface (`statusLabel=""`). Phones: the three pills wrap
to their own row (26px tall, one row of three).

## 4. ONE notify interaction (`src/lib/notify-request.ts`, new)
Every "tell me when it's ready" builds a `NotifyReq` (`want: cram|review|exam|pass` + exam,
topic, set, headline/sub) and opens the single `NotifyModal` (bottom sheet on phones). Copy:
"Cram Blast for The Accounting Cycle is coming soon. Want me to tell you when it lands?",
"Review for this set is coming soon…", "Exam 2 is still being filmed. Opens Fall 2026…", plus a
context line (school · course · professor · exam). `submitNotify` now carries `want`, `examNum`,
`courseCode`, `note` ("wants:cram · exam:Exam 1 · topic:… · set:…") into the unified intake
(`runIntake`, kind `notify_exam`, source_path `/#notify:cram`).
**Removed**: `PaidNotifyRow` (the permanent email form in the sidebar AND the Poster) and its
`joinPricingWaitlist` path in the player. Switching to Exam 2/3/Final just browses (topics,
runtimes, "Opens Fall 2026"); the Poster shows one **Notify me when it's ready →** button; a
locked set row opens the modal with that set as context.

## 5. Semester Pass: line → bracket
Expanded (first visit): "Save with the Semester Pass — Exams 2, 3 + Final for $150." with a
44px always-visible ×. Dismissed (remembered in localStorage `sa-pass-line-dismissed`, the
existing key): an 18px bracket under Exam 2 → Exam 3 → Final labelled `Semester Pass · $150`,
clickable → the same modal. Never a banner again; tabs unobstructed at 390px.

## Content-model note
Availability is fully derivable for free sets. For **paid** sets `playbackId`/`reviewPlaybackId`
are withheld server-side (entitlement), so Cram/Review availability cannot be read client-side
for them — today they never reach the stage (locked rows open the notify), so nothing is wrong,
but if paid sets ever render pills the server must send boolean `hasCram`/`hasReview` instead of
ids. Also: no Exam 2+ topic currently has sets on the Ole Miss map, so the locked-set → notify
path was verified by code, the Poster CTA path by browser.

## Shared persistence the marketing code should use
`src/lib/campus-prefs.ts` — `rememberCampus` / `readStoredCampus` / `rememberProfSkip` /
`readStoredProfSkip` + the `sa-school` cookie; `useCampus()` (`campus-context.tsx`) for
`setSessionSchool` / `clearSchool`. Marketing components were not edited here.

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,360 pass · `bun run build` OK · eslint: no new
findings (baseline prettier/autocrlf noise only). Screenshots: `docs/screenshots/player-reset-nav/`.
