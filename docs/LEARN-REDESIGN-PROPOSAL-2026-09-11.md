# /learn redesign — proposal for discussion (2026-09-11)

Lee's notes from the first desktop look, turned into decisions to agree on before building.
Nothing here is built yet. Black stays the palette (navy compared and rejected).

## 1. The shell

- **No left rail.** Cram · Review · You goes away. There is only cramming right now; the rail is
  three labels for one thing. The page is one column.
- **Navbar, left:** the bolt, BIG, with the campus name and, under it, `ACCY 201 · Exam 1`. The
  wordmark says **survive** (drop "accounting"). "Ole Miss · ACCY 201 · Exam 1" leaves the bar.
- **Exam pills under the bolt:** Exam 1 is the live pill. Exam 2/3 show a lock; tapping a locked
  one opens the waitlist sheet with the price line ("Exam 1 is free. Exam 2 is $50 — join the
  waitlist and I'll tell you the day it opens.").
- **Greek letters on the bolt.** When a chapter is known, its letters sit centred over the big
  bolt (ATO in the middle of the bolt). The bolt animates; the letters hold still. Same letters
  the home page's doors draw.
- **Navbar, right:** `Leave a review` (text link) · `Share` (button) · a **hamburger** that holds
  everything else, in this order: Share this · Set up exam reminders (opens the reminder as a
  modal) · Home · Sign in / Sign out · Set up your Greek chapter · Join the campus rep program.
  GroupMe share later. The bottom footer and the bottom reminder block go away.
- **Text Lee** floats bottom-right on every tier: the photo with a soft 3D shadow and the chat
  icon. On a phone it opens `sms:`. On a computer it opens a small modal: "Text Lee ·
  (662) 565-8818" plus three bullets — I love hearing from students; ask anything, introduce
  yourself; I do my best to answer every single one. (Today it offers email/text choices on
  desktop; that goes.)
- **Fonts and buttons** come from the home page's tokens (Rubik/League Spartan, the red CTA
  style), not /learn's own.

## 2. The hero

- Centred. `Like Reels for exam prep.` Under it `Cram what's on your exam. Skip everything else.`
- One button: **Get started** with the average video length under it as a caption
  ("~2.4 min per video", real, computed). "See what's on the exam" is removed.
- Get started scrolls to the first row (and outlines it once), or opens the first playable video.

## 3. The rows

- First row heading: **Start Here: Easy Points** · `5 videos`. No "Exam 1", no "free" chip there
  (the exam pill already says it).
- Later rows: the topic name and its own counts only — `5 videos · 34 practice questions`. No
  cross-exam totals anywhere ("6 topics · 25 videos · 285 questions" is gone).
- The waitlist box ("Get notified when these drop." / Join the waitlist) appears ONLY inside a
  later topic when it is opened. It never renders under Easy Points. If Easy Points has
  unposted videos they are simply grey.
- **Practice card artwork:** a Recraft illustration — nuts-and-bolts, mechanical, floating,
  drop shadow — generated once, then re-tinted per school (the school's third colour or a hue
  shift of c2) so every campus's card differs. The illustration registry already exists
  (`/admin/illustrations/styles`); add a "practice-card" subject.
- **Dimension:** cards get a subtle bevel/shadow; on mobile each topic section gets more
  vertical padding and a hairline so topics read as separate blocks.

## 4. Later, not now

- Exam reminders advertised between videos (a card in the player), not on the page bottom.
- GroupMe share in the hamburger.
- Reviews captured in-app after practice, then a Google link.

## Decide

1. Hamburger on the right replaces the rail — yes/no.
2. Exam 2/3 locked pills with the $50 line — yes/no, and the exact price copy.
3. Text Lee desktop modal copy — use the three bullets above or send yours.
4. Recraft prompt for the practice art — I'll draft one; you pick the style.
