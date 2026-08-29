# CHAPTER PAGE — PASS 2 REPORT

**Branch:** `feature/player-v2-tonights-plan` · checkpoint `f798b044` → `HEAD`
**Status:** built, QA'd, committed, pushed. **Not merged** — say the word.

---

## SQL LEE MUST RUN

`migration/supabase-migrations/20260829_0900_claim_intent_and_report_log.sql`

Paste it into the Supabase SQL editor. It is additive and safe to run twice, and it ends with two
`SELECT`s that prove it worked (both must return a row). Until it runs:

- **K3 intent** is not stored. A claim still saves — the insert retries without the column so no
  exec ever loses a submission — and logs loudly that the migration is missing.
- **K5 reports** refuse to send at all: the send log is the duplicate protection, and mailing
  without it is how a chapter gets the same email five times.

## THE OTHER SWITCH — K5 sends nothing until you set it

`CHAPTER_REPORTS_ENABLED=1` in Vercel. Without it every cron run is a **dry run**: real counts,
real dedupe checks, a logged line per chapter saying what it *would* have sent, and no email.
The cron response reports `mode: "dry_run" | "live"`, so the two can never be confused.

Suggested order: apply the SQL → let the hourly cron dry-run for a day → read a run's JSON
(`GET /api/cron/chapter-reports?kind=surge` with the CRON_SECRET bearer) → then set the flag.

## Per item

| Item | Status |
|---|---|
| K1.1 heading `SURVIVE · AC 210` | ✅ |
| K1.2 right-door copy (GPA lines) | ✅ |
| K1.3 one navbar, home + chapter | ✅ byte-identical call: `<SiteHeader homeNav onLanding />` |
| K1.4 toast names the chapter | ✅ "Copied. Go share it with ADPhi!" |
| K1.5 GroupMe locked verbatim | ✅ incl. the blank line; claim state can no longer change a character |
| K1.6 flyer caption trimmed | ✅ both places |
| K1.7 player embed gone from chapter | ✅ home keeps it |
| K1.8 third value chip | ✅ "Built for AC 210 / Matched to your exact course." |
| K2 three-tier share kit | ✅ side-by-side desktop, stacked mobile, 5 distinct stamps |
| K3 claim engine | ✅ benefit lines, required intent, committed path + Lee alert, Stripe seam |
| K4.1 gated dashboard | ✅ real top line always, three labelled locks, one CTA |
| K4.2 `?claim=1` / `#claim` | ✅ scroll + auto-open verified; highlight code-verified (see below) |
| K4.3 post-share nudge | ✅ once/session, dismissible, non-blocking |
| K5 surge + weekly emails | ✅ built, both gates verified firing |

## QA gauntlet

1. **Doors + copy.** Heading and the two-line GPA copy verified live. COPY LAW grep: zero hits in
   chapter-page copy. Two hits elsewhere in the greek family were fixed (partner-kit rate sheet,
   chapter kit page). **Four remain outside this pass — your call:** `src/lib/og.ts:18` and
   `src/routes/$school.index.tsx:50` (SEO descriptions, "no account needed" — changing these moves
   search snippets), `src/routes/expand.tsx:45` ("no signup" in a share template),
   `src/routes/preview.tsx:120` ("No account, no password"). I left them because rewriting SEO
   descriptions and unrelated templates is outside a surgical chapter-page pass.
2. **Navbar** identical on both pages, same component, same props.
3. **Share kit:** three tiers at 1280 (301px each, no overflow), stacked at 375. GroupMe text
   matches the locked template character-for-character. Stamps: `link`, `groupme`, `text`,
   `flyer` (kept as the legacy `?s=flyer` the printed flyers carry), `slide` — all distinct.
4. **Claim:** strip sits between doors and share kit (verified by page offsets). Benefit lines,
   required intent, submit disabled until answered. **No price anywhere on the public page**;
   `$100/member` and the `$150` comparison appear only inside the claim sheet.
5. **Deep link:** `?claim=1` and `#claim` both scroll and auto-open the sheet — verified. The 2.6s
   highlight is code-verified only: dev-mode hydration takes longer than the highlight lasts, so I
   could not capture it in the pane. Worth one glance on a real load.
6. **Dashboard:** unpaid state shows real Signed up / New this week / Sets completed (zero shows
   zero, with "Share the link to get the first ones in."); roster, per-member activity and exam
   management sit behind three labelled locks; one CTA to the seat offer.
7. **Emails:** could not send a live test — the migration is not applied, which is exactly what
   makes the run refuse. Verified: the refusal fires with the right message, `reportsEnabled()` is
   false unless the flag is exactly `1`, week keys are ISO, and the source line reads correctly for
   one channel / a dominant channel / an even spread / nothing attributable. A real surge test
   belongs after the SQL lands.
8. **Diff review:** homepage components untouched. Two files had picked up literal CRLF from an
   edit helper, inflating a 7-line change into ~1,900 lines of noise; normalised and re-committed
   so the diff is reviewable.

## Decisions worth knowing

- **The GroupMe "partnered with" variant is gone.** It fired for claimed chapters and asserted an
  endorsement nobody agreed to, varying by state the reader could not see. One template now.
- **Source split ≠ per-signup attribution.** Signups are real member rows; the split comes from
  stamped visits in the same window. The email says "Mostly from your GroupMe link" — describing
  arrivals — and never claims which link each signup used, because we do not record that.
- **The hot-lead alert uses raw senders,** not the template pipeline: it is an internal operator
  alert to you and must not be suppressed, capped or unsubscribed like a lead message.
- **No live checkout.** The Stripe seam is a documented block in `runClaimIntake` where checkout
  joins or replaces the text-Lee promise. Nothing charges today.
- **Locks show no fake data.** No blurred placeholder roster behind the lock — a blurred list of
  invented names is a lie at low resolution, and this dashboard's promise is that its numbers are real.
