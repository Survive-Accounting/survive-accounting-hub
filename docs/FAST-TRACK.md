# Fast track — small changes, built by the machine

**Who:** Lee and King. **Where:** press **Ctrl+F** on any internal page (once the device is unlocked with the team passcode — the same one Ctrl+I asks for), or the ⚡ button on **/buildqueue**.

## How to use it (King)

1. Go to the page you want changed. Press **Ctrl+F**.
2. The box says whether the **build machine is up** and which model builds it (**Claude Sonnet 5**). If the machine is off, the button says *Save to the list* — it builds when the machine is back.
3. Say what should change, in your own words — copy, a label, a color, a size. **Add a screenshot** if a picture says it faster (paste one with Win+Shift+S, or the 📷 button) — up to 3.
4. **Prep the request.** The AI turns your words into a title, a couple of bullets, and the exact instruction for the build — shown to you before anything builds, with the full instruction behind a toggle if you want to read it. If the request isn't a UI/UX change, it says so and refuses — send that one through Ctrl+I instead.
5. **Looks good — send.** You get **10 a day** (resets at midnight Chicago). You get an email at once (Lee on cc) with a **CANCEL** link that works while it's still queued.
6. When it's built (usually 10–40 minutes) you get a second email (Lee on cc): the preview, the checklist, what it cost, and a **REVERT** link.
7. **Check it out before the next one.** Ctrl+F asks for 👍 / 👎 and one line on how it went. No new request until the last one is rated — and none while one is still building.
8. **The Log** button in Ctrl+F lists everything you've sent: date/time, ~cost, time to build, your rating and comment, cancelled/reverted — with any screenshots you attached.

## King's playground

King's changes land on **/admin/growth/v3** — a copy of the v2 command center — never on v2 or the shared growth code. He keeps working in /v2 without fear of breaking it; when something on v3 is proven, Lee ports it to v2 by hand. The rule is prepended to every one of his builds (`playgroundRules` in `src/lib/fast-track.ts`).

## What fits

- **UI/UX only** — copy, a label, a colour, spacing, sizing something bigger or smaller. The prep step (`src/lib/fast-track-brief.ts`) checks this before anything is submitted and refuses anything else, with a reason.
- Nothing that touches data, sign-in, payments, or texting/emailing students. Nothing needing a new database table.
- If the build finds it's bigger than it looks anyway, it stops and says so.

## What the build machine does with it

The request becomes an idea row with `context.lane = "fast_track"` and status SUBMITTED. `scripts/build-queue.ts` picks it up on its next pass (it writes a heartbeat to `site_settings.settings.buildQueueHeartbeat` every pass — Ctrl+F reads that to say "up" or "off"), prepends `FAST_TRACK_RULES` (≤ 6 files, no migrations, no data writes, no auth/payments/comms/cron/server-only files, nothing a student sees, never weaken a test), builds on `claude-sonnet-5` (`FAST_TRACK_MODEL` to change it) on a `queue/*` branch — **never main** — and writes the invoice onto the row (`costUsd`, `buildSeconds`, `tokensIn`, `tokensOut`, `model`). Emails go to the requester with the other of the two on cc. Lee merges: `git merge --ff-only origin/<branch>` on main.

**Cancel** parks the row so the runner never picks it up (queued only — the runner never stops mid-build). **Revert** parks a built row, so it is never merged, and emails Lee; if it was already merged, Lee runs `git revert` by hand.

The runner must be running on the build PC for anything to happen: `bun scripts/build-queue.ts --watch` (see docs/TWO-MACHINES.md).
