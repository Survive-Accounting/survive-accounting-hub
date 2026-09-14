# Easy Points — the strategy

Lee, 2026-09-14. Written down as it was decided, while the first series was built for Exam 1 ·
Know Your Accounts. Every exam gets one Easy Points set first. Its structure below is the template.

## What Easy Points is for

- **The easiest points on the exam, not the explanation.** The concept work waits for later topics.
- **A free teaser.** It shows how Survive works, earns an email for the rest, and later sells the
  $50 exam packs.
- **Bingeable.** Short videos that feel like a series, each connected to the next, never one
  unbroken blast.

## The structure of a series

1. **Intro** — how Survive works. Filmed once and kept.
2. **The hook / teaser intro** — opens on the big common exam question alone ("What type of account
   is ____?"), then a shuffled speed run of questions from every video, the 5 types, and a teaser of
   what's coming. The cheat codes are **teased, not shown**.
3. **Practice first (optional)** — "If you want to practice these before we begin, I'd highly
   recommend it. Then watch the videos and practice again." On the site this is a real
   **[Try Practice Questions]** button with surviveaccounting.com under it. On social exports it
   reads "Practice at surviveaccounting.com" instead of a button nobody can tap. Lee says "keep
   watching if you want."
4. **One video per cheat code** — the cheat code, at most one quick "why" slide, then the questions,
   with the obvious ones as a speed run.
5. **Practice** — "Your move · Practice Questions · Finish the questions to unlock the full recap."
   **[Start Practice →]** is the prominent button; "Skip practice" is a small text link. Same
   social rule: no buttons in the export.
6. **The recap** — filmed LAST, because it teases the next topic. Every cheat code lined up, then
   the trickiest questions under a TRICKY QUESTION alert, then up next.

## The rules

- **The 30-second rule.** If a why can't be explained in 30 seconds or 3 slides (fewer is better),
  it waits for a later topic. Receivable, Prepaid, Payable and Unearned each get one quick why.
  Equity is "memorize these" for now.
- **The answer's explanation repeats the video's cheat code** ("ANYTHING 'Receivable' = always an
  asset"), so a student who misses one hears the rule that fixes it.
- **Repeats are removed; deeper questions go to a Later group.** Later questions stay live in
  practice but aren't filmed in the series.
- **Splits matter less here.** Easy Points is short, clean videos; splitting earns its keep on the
  later topics that need explanation.
- **Breathers** go where the mental model shifts. For Know Your Accounts that's after the assets
  videos and after the balance-sheet side. The copy is Lee's.
- **Socials:** the cheat-code videos go to Reels, TikTok and Shorts. On YouTube, the whole series is
  a free exam-prep playlist. The intro, the practice hand-off and the recap stay on the site.

## Camera

- On callouts the camera sits **top**, above the callout chip, never over the words.
- On question cards it sits **home**, bottom right.

## Filming (the target workflow)

- One slide at a time, one video at a time. /film shows the slide coming up; the popout is captured
  by OBS.
- Press F4 in OBS to punch in, and F4 again to punch out. Mark a speed-run start and end for a
  range. Press F3 to scrap a take, F3 again to confirm; Ctrl+Z brings it back.
- The recordings come in through OBS WebSocket automatically.
- When a video's slides are done, press **Preview**. Pauses are trimmed and the takes are joined,
  and it plays in the site player with its buttons. Check the title and thumbnail, then **Post**
  before moving on.
- Any single slide can be punched in again later to fix or improve it.

Related: `docs/TWO-MACHINES.md`, the v4 flow (`components/v4`), Quick post (`/v3/quick-post`),
breathers (`/v4/breathers`).
