# Fast track — small changes, built overnight

**Who:** Lee and King. **Where:** press **Ctrl+F** on any internal page (once the device is unlocked with the team passcode — the same one Ctrl+I asks for), or the ⚡ button on **/buildqueue**.

## How to use it (King)

1. Go to the page you want changed. Press **Ctrl+F**.
2. Write what should change and what it should look like after — a sentence or two. The page is captured for you.
3. **Send to fast track.** You get **10 a day** (resets at midnight Chicago). The counter is in the corner of the box.
4. Track it on **surviveaccounting.com/buildqueue** — queued → building now → built · preview ready.
5. When it's built, Lee gets an email with a preview link and a checklist, looks, and merges it live. Nothing goes live without that look.

## What fits

- One small change you can describe in a sentence or two — copy, a label, a colour, a layout tweak, a new column in a table, a small tool on a page.
- Say WHERE and WHAT.
- Nothing that touches data, sign-in, payments, or texting/emailing students. Nothing needing a new database table.
- If the build finds it's bigger than it looks, it stops and says so.

## What the build machine does with it

The request becomes an idea row with `context.lane = "fast_track"` and status SUBMITTED. `scripts/build-queue.ts` picks it up on its next pass, prepends `FAST_TRACK_RULES` (≤ 6 files, no migrations, no data writes, no auth/payments/comms/cron/server-only files, nothing a student sees, never weaken a test), builds on a `queue/*` branch — **never main** — and emails Lee the preview and checklist on success, or the reason on a stop. Lee merges: `git merge --ff-only origin/<branch>` on main.

The runner must be running on the build PC for anything to happen: `bun scripts/build-queue.ts` (see docs/TWO-MACHINES.md).
