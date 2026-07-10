# Nightly backups → Cloudflare R2

Owned, off-Supabase backups of the platform's data. Runs every night at
**04:00 UTC** via Vercel Cron and writes three `.zip` snapshots to an R2 bucket
we control.

## What gets backed up

Three groups, one `.zip` per group per night. Every table is dumped as **both**
`.csv` (Excel/human) and `.json` (schema-preserving, re-importable), plus a
`manifest.json` (row counts, columns, sizes, timestamps).

| Group | What | Tables |
| --- | --- | --- |
| `content` | The platform's brain | courses, chapters, je_scenarios, teaching_assets |
| `intel` | Campus + funnel treasure trove | campuses, campus_lead_suggestions, rmp_ratings, hasselback_faculty, faculty_moves, greek_orgs, greek_org_filings, greek_org_people, greek_firm_leads, greek_chapter_contacts, vendor_lists, campus_context, parent_groups, reddit_mentions, outreach_email_events, outreach_leads, outreach_send_log, outreach_settings |
| `commerce` | Highest-sensitivity student data | orders, order_chapters, order_stage_events, sms_conversations, sms_messages, preview_feedback, va_accounts, account_aliases, student_emails |

The table list lives in [`src/lib/backup-tables.ts`](../src/lib/backup-tables.ts).
A few names from the original spec aren't real tables and were mapped to the
nearest real source (see `UNRESOLVED_REQUESTS` in that file / the "Table mapping
notes" panel in the admin view).

## Storage layout (in the bucket)

```
backups/{group}/YYYY/MM/DD/{group}-YYYYMMDD.zip          ← daily
backups/{group}/YYYY/MM/DD/{group}-YYYYMMDD.manifest.json ← sidecar (cheap listing)
backups/{group}/monthly/{group}-YYYYMM.zip               ← promoted on the 1st
backups/{group}/annual/{group}-YYYY.zip                  ← promoted on Jan 1
```

## Retention (managed in code — portable, no bucket lifecycle rules required)

- **Daily:** keep the last 30, older ones deleted.
- **Monthly:** on the 1st of the month, that day's snapshot is promoted to
  `monthly/`; keep 12.
- **Annual:** on Jan 1, promoted to `annual/`; kept **forever**.

## Environment variables

Set these in the Vercel project **and** local `.env`:

| Var | Required | Notes |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | yes | Cloudflare account id (used to build the S3 endpoint). |
| `R2_ACCESS_KEY_ID` | yes | R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token secret. |
| `R2_BACKUP_BUCKET` | no | Defaults to `surviveaccounting-backups`. |
| `CRON_SECRET` | yes (prod) | Set in Vercel; Vercel Cron auto-sends it as `Authorization: Bearer …`. The cron endpoint fails closed if unset. `BACKUP_CRON_SECRET` is accepted as an alias if you want it separate from the Supabase edge-cron secret. |

Already present (reused): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (dump),
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_MESSAGING_SERVICE_SID` /
`LEE_PERSONAL_PHONE` (fail-loud SMS), `SUPABASE_ACCESS_TOKEN` (restore PK lookup).

## Fail-loud

If any table dump errors, the job **aborts that group** and texts Lee the group
and table name. The other groups still run.

## Admin view

`/outreach/backups` — latest snapshots per group with row counts, size, a 15-min
signed download link, and a **Run now** button (runs the same job in-process).

## Restore / diff

```bash
# Dry-run diff a snapshot against the live DB (default — touches nothing):
bun scripts/restore-from-backup.ts intel 20260709
bun scripts/restore-from-backup.ts commerce 20260709 --table orders

# Upsert a snapshot back into the DB (by primary key, non-destructive):
bun scripts/restore-from-backup.ts commerce 20260709 --table orders --apply

# Destructive full replace (delete-then-insert), requires explicit confirmation:
bun scripts/restore-from-backup.ts commerce 20260709 --table orders --apply --wipe --yes

# Read from a local backup dir instead of R2 (testing):
bun scripts/restore-from-backup.ts commerce 20260709 --local ./some/dir
```

## Running manually (cron endpoint)

```bash
curl -X POST https://<host>/api/cron/backup -H "Authorization: Bearer $CRON_SECRET"
```
