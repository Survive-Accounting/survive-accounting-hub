## Two independent fixes

### Findings from the database
- **Textbook coverage is essentially zero.** Of 455 campuses, only **4** have any `course_family_textbooks_json` populated. That's why Ole Miss (and ~99% of the others) shows "Not Checked" — there's literally no saved textbook data, so the Approve modal defaults every family to `not_checked`. This is not a UI bug; the bulk research never ran.
- **Summary texts already route via `LEE_PHONE` secret.** The webhook sends the AI summary to whatever number is stored there. We'll surface that number in the dashboard so you can confirm it's `+16012018759`, and let you update it inline if it isn't.

---

## Part A — Dual-role SMS testing from your own cell (+16012018759)

The cleanest "test it on my own phone" loop without provisioning a 2nd device:

1. **Add `+16012018759` to `SMS_TESTER_PHONES`** so the one-shot guard is bypassed (you can text the campus number repeatedly without being silenced as a "returning student").
2. **Confirm `LEE_PHONE` = `+16012018759`** so the AI summary lands on the same phone. The Setup tab will show:
   - Lee summary destination: `+1•••8759` (with a "Change" button that calls a tiny server fn updating the secret).
   - Tester phones currently in `SMS_TESTER_PHONES`, with add/remove buttons.
3. **New "Live end-to-end test" card** in the Texts → Setup tab:
   - Shows: *"From `+16012018759`, text the following to `<active campus number>`:"* with a prefilled message ("Hi, I need help with ACCY 201 before my Thursday exam").
   - A live feed below auto-refreshes every 3s and shows the three expected events in order:
     - **Inbound** logged in `sms_inbound_raw` ✓
     - **Outbound to student** (booking link) ✓
     - **Outbound to Lee** (AI summary) ✓
   - When you're the same number for both roles, you'll get both texts on your phone — the feed clearly labels which is which so you can tell what came from where.
   - "Reset thread" button cascades the conversation so the next text starts a brand-new flow.
4. **Zero-cost simulator** (already built last turn) stays as the dev fallback for when you don't want to spend Twilio fees: it POSTs to the webhook with form-encoded Twilio-shaped data and shows the same feed, but no real SMS leave Twilio.

Cost: ~$0.015 per real round-trip (1 inbound + 2 outbound). No new phone number needed.

---

## Part B — Get all 451 unchecked campuses to "checked" for textbook match

1. **Backfill job: queue every unchecked campus into a `textbook_only` research job.**
   - New server fn `enqueueTextbookBackfill()` creates one `campus_research_jobs` row with `research_mode='textbook_only'` and inserts a `campus_research_job_items` row for every campus where `course_family_textbooks_json` is null/empty (≈451 rows).
   - Existing `run-campus-batch` already handles `textbook_only` mode (calls `research-campus-textbooks` per campus, which writes back to `campuses.course_family_textbooks_json`).
   - Drive it with a `pg_cron` job that hits the batch runner every minute, 3 campuses per tick → full backfill finishes in ~2.5 hours, fully unattended.
2. **New "Textbook Coverage" card** on the Outreach dashboard:
   - Big counter: `X / 455 campuses have textbook data` with progress bar.
   - "Start textbook backfill" button (only enabled when no job is already running).
   - Live ticker showing the last 5 completed campuses + any failures.
   - "Re-run failures" button.
3. **Approve modal preload fix** so once a campus has textbook json, the four family rows show **"Matches"** / **"Likely Match"** etc. instead of "Not Checked":
   - On modal open, hydrate `familyStatus` from existing `course_family_textbooks_json` (any family with title/authors/ISBN ⇒ `likely_match`, confirmed source ⇒ `matches`) so Ole Miss won't show "Not Checked" after backfill completes.
   - This is the visual half of the fix — without it, the data is there but the chips still read "Not Checked" until you click Run Research again.
4. **Per-campus "Recheck textbooks" button** in the Approve modal so you can re-run just textbook research on any single campus without touching leads/sections.

Cost estimate: ~451 campuses × ~$0.002 Gemini Flash search call = **~$1 in AI credits** for the full backfill. Google Books ISBN lookup is free.

---

## Order of operations
1. Confirm/set `LEE_PHONE` and `SMS_TESTER_PHONES` to `+16012018759`.
2. Ship Setup-tab Live test card + reset.
3. Ship Approve modal hydration so existing textbook json renders as checked.
4. Ship Textbook Coverage card + backfill enqueuer + pg_cron driver.
5. You kick off the backfill from the dashboard; it runs in the background.

## Technical notes (for the next agent)
- Secret updates from UI go through `secrets--update_secret`-equivalent server fn protected by `requireSupabaseAuth` + admin role check.
- `pg_cron` calls `/api/public/hooks/run-campus-batch` (TanStack server route, anon-key authenticated per platform pattern) — not a direct edge function URL, so it survives function redeploys.
- Approve modal hydration: extend `loadCampus` to seed `familyStatus[fam] = 'likely_match'` when `course_family_textbooks_json[fam].title || .authors || .isbn13` is present and no prior status exists.
- The simulator path stays intact for $0 regression testing of webhook logic.
