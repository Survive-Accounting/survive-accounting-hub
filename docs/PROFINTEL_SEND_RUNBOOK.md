# ProfIntel — turning on real sending + open/reply tracking

Everything below is **your side** — I can't deploy edge functions, apply migrations, or
configure Resend/DNS (the Supabase Management PAT is dead). The app code + edge functions
+ migration are all written and on `main`. Do these to go live. **Nothing sends until the
kill-switch is flipped (last step).**

## 1. Apply the migration (Supabase → SQL Editor)
Run `migration/supabase-migrations/0048_profintel_send_tracking.sql`. It adds tracking
columns to `profintel_sends` and the `profintel_settings` singleton (kill-switch OFF, daily
cap 40). Idempotent.

## 2. Set secrets (Supabase → Project Settings → Edge Functions → Secrets)
Already set (reused): `RESEND_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
Add two new random secrets (any long strings):
- `PROFINTEL_WEBHOOK_SECRET` — for the opens webhook
- `PROFINTEL_INBOUND_SECRET` — for the replies webhook

## 3. Deploy the three edge functions
```
bunx supabase functions deploy profintel-send-worker   --project-ref unvxagsledbsdoremqeb --use-api
bunx supabase functions deploy profintel-email-webhook --project-ref unvxagsledbsdoremqeb --use-api
bunx supabase functions deploy profintel-inbound       --project-ref unvxagsledbsdoremqeb --use-api
```
(Needs `SUPABASE_ACCESS_TOKEN` = a valid PAT. `config.toml` already sets `verify_jwt = false` for all three.)

## 4. Cron the send worker (SQL Editor) — fires due emails every 5 min
```sql
select cron.schedule(
  'profintel-send-worker',
  '*/5 * * * *',
  $$ select net.http_post(
       url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/profintel-send-worker',
       headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', current_setting('app.cron_secret', true)),
       body := '{}'::jsonb
     ) $$
);
```
If `app.cron_secret` isn't set as a DB setting, paste the literal `CRON_SECRET` value into the
header instead (same value the other crons use, e.g. `sa-cron-7kQ2vXp9mN4t`).

## 5. Open tracking (Resend → Webhooks)
Add an endpoint pointing at:
`https://unvxagsledbsdoremqeb.supabase.co/functions/v1/profintel-email-webhook?secret=<PROFINTEL_WEBHOOK_SECRET>`
Subscribe to at least **email.opened** (and optionally email.bounced / email.complained).
`opened_at` + open % populate automatically after sends go out.

## 6. Reply tracking (optional, needs an inbound mailbox)
Email replies don't flow through Resend's send events, so reply % needs an inbound mailbox.
Set up **Resend inbound** (or any forwarder) on a subdomain and point its webhook at:
`https://unvxagsledbsdoremqeb.supabase.co/functions/v1/profintel-inbound?secret=<PROFINTEL_INBOUND_SECRET>`
It matches the reply's sender to the most recent `sent` email to that professor → `replied_at`.
**Until this is configured**, use the **"mark" button** in the Reply column on the Metrics tab to
log replies by hand.

## 7. Deliverability check (before flipping ON)
- Confirm **SPF, DKIM, and DMARC** are all green for `mail.surviveaccounting.com` in Resend/DNS — biggest inbox-placement factor.
- Do a **test send to yourself**: create a draft to your own address, schedule it in the past, let the worker fire, confirm it lands in the inbox (not spam) and looks right.
- The template already carries your opt-out line; the worker sends the body as-is.

## 8. Go live
On **ProfIntel → Metrics**, click **Sending: OFF → ON**. The worker will start firing
`status='scheduled'` rows at their times, up to the daily cap (40/day; adjustable in
`profintel_settings.daily_send_cap`). Flip it back OFF anytime to pause.

### Daily flow
Choose-leads tab → create drafts → **Schedule N (top score first)** (spreads Tue–Thu 10–3,
highest score earliest) → the worker sends them → watch Metrics for opens/replies.
