# CEQ Practice — cram mode, navigation & release (branch `ceq-practice`)

Releases the authored Exam 1 CEQs to students before the videos. Built on `notifications` (for
the `question` intake) with `set-architecture` merged in (the Cram → Practice → Review model). The
cram-video slot stays in the shell as a **Cram Blast · coming soon** strip, so publishing a set's
video fills it with no layout change.

## 0. Pre-flight data — DONE on the live DB (2026-08-21)

**Scene dedupe (launch blocker) — fixed in code, not by editing data.** Every set existed in the
30-set workspace scene (`f103b5cd`, 08-14) and in its own per-set scene (edited 08-19/20). One
shared loader (`loadDecksDeduped` in `student.functions.ts`) now serves the tree, practice, and
playback: **per-set scenes (exactly one card deck) own their deck first, then newest `updated_at`**
— so even if the workspace scene is touched later and becomes "newest", the per-set copy still
wins, and a deck's cards are read only from its winning scene. The workspace scene was never
written to (a write there could have flipped ownership). Verified: 30 unique decks, 0 duplicates
served.

**Flipped live (`flip_exam1_live.ts --apply`, writes only to per-set scenes):** 19 Exam 1 sets →
`status=live`, 6 missing `sortOrder` values filled by name order, the 5 untitled/0-question
library stubs parked. **Exam 1 unit seeded**: `exam_units` "Exam 1" (Intro 1) with Ch 1, 2, 3, 6,
7, 8, 9 → `/learn` groups under it; the homepage uses the Starter Map either way.

**Final counts per topic (authoritative per-set scenes):**

| Ch | Topic | Sets | Questions |
|---|---|---|---|
| 1 | The Accounting Cycle | 1 | **8** |
| 2 | Analyzing Transactions | 2 | 48 |
| 3 | Recording Journal Entries | 3 | 60 |
| 6 | Trial Balances | 1 | 11 |
| 7 | Adjusting Entries | 4 | 32 |
| 8 | Financial Statements | 4 | 29 |
| 9 | Closing Entries | 4 | 18 |
| | **Total** | **19** | **206** |

**206, not 210:** the stale workspace copy of the Accounting Cycle set had 12 questions; the
authoritative per-set scene (edited 08-20) has 8. Either you cut four on purpose or they exist
only in the workspace — check `f103b5cd` if you want them back. Excluded from release: Ch 4
Receivables (8 Qs), Ch 5 Posting (24 Qs), Ch 10 Principles (14 Qs) — authored but not Exam 1
topics, left `draft`; the 5 stubs (parked, no topic/0 questions). Note the **Ole Miss campus
map** maps only Ch 1–3 to Exam 1, so that campus page shows `3 topics · 6 sets · 116 questions`;
the default/Starter Map shows all seven.

## Reference scheme
`Topic.Set.Question` (e.g. `3.2.14`), displayed in the stage as `3.2 · Q14 / 24` with the
question's shorthand as subtitle; set titles are the base stem. Numbers are derived at read
time from `chapter_number` + `sortOrder` + `stageOrder`; **analytics key on the stable deck id +
CEQ node id** (`fetchSetPractice` now returns node ids, not positions). The full reference is
prefilled into "Ask me about this one" and carried on the lead (`topic` = reference,
`source_path` = `ceq:<setId>:<ceqId>`).

## Navigation (homepage/campus/Greek player)
Rail: `3 Recording Journal Entries · 3 sets` → expands to `3.2 What is the journal entry… · 24
questions` with a thin **coverage** bar (questions attempted, never accuracy; localStorage,
updated live). Clicking a set enters cram at Q1. Variations never appear in the rail. Footer stat
is computed: `7 topics · 19 sets · 206 questions` (`~Xh video` appends only when runtimes exist).
Mobile: the rail collapses to the existing topic bar + drawer; the stage header carries
`1.1 · Q1 / 8`. `/learn` uses the identical cram component inside its set modal (no redesign,
per the earlier instruction to hold `/learn` until the HTML player).

## Cram mode (`src/components/site/PracticeStage.tsx`, shared)
Desktop: `↑/↓` highlight, `⏎` lock-in → green/red resolve with the filming-side sfx (`confirm` /
`vinylScratch`), `⏎` advances, `←/→` step (skips logged), `Shift+→` next set; hint strip in the
header; ~120 ms in-place swap; optional auto-advance after a **correct** answer only (toggle,
off by default, persisted). Mobile: tap row to lock in, fixed thumb-reachable **Next →**, swipe
left/right, 48 px rows; verified at 390×844 — no horizontal scroll, Next in viewport.
Feedback: correct highlighted, wrong pick struck; `Lee works this one in the review video —
coming soon.`; **Ask me about this one →** opens a box prefilled with the reference + shorthand →
`kind=question` through the unified intake (priority founder alert, student confirmation
"Got your question on 3.2.14"). Progress, not scores: no %, grade, or score anywhere; end of set
shows `You've been through 24 of 24 · 8 to review` + elapsed, primary **Retry the 8 you missed →**
(missed questions come back as pass 2+), then `Next set →` / `Review with Lee →` when it exists.
Rough-pass copy: "First pass is always rough — that's the point. Run the missed ones again."

## Analytics — `practice_attempts` (migration `20260821_1400`, applied)
`set_id, ceq_id, event (answer|skip|abandon), choice_id, correct, ms (reveal→lock-in),
attempt_number, session_id, user_id (nullable), campus, surface (home|campus|greek|learn),
is_test, created_at`. Written per event via `logPracticeEvents` (no auth; Exam 1 is ungated);
abandon = last question reached, written on unmount. **Admin:** `/outreach/practice` — per
question: attempts, % missed, median time, skips, quit-here, asks; sortable; filter. Asks are
highlighted — this is the filming priority queue. My test rows were deleted after verification.

## Access
Exam 1 practice is free and ungated on solo/campus pages (the school → professor gate stays,
the Greek member gate on `/go/` stays — both sit before the stage). Paid exams stay locked behind
the existing notify box (paid sets never carry questions or ids to the client).

## Checks
`bunx tsc --noEmit` clean · `bun test` 1,360 pass · `bun run build` OK. Screenshots in
`docs/screenshots/ceq-practice/`: rail expanded · cram mid-question (desktop) · resolution with
the ask box · end-of-set with retry · mobile cram at 390 (+ resolved/Next) · admin analytics.
