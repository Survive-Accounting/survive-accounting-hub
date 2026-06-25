-- 0022_repoint_cron_to_live.sql
-- Repoint the pg_cron jobs and the waitlist trigger function from the DEAD Lovable
-- project (dhlzorresurzlcpuplkv) to the LIVE project (unvxagsledbsdoremqeb).
--
-- Why this exists: the live database was migrated with 0009/0011/0012 BEFORE those
-- files were corrected, so its cron jobs and trigger still POST to the dead project's
-- edge-function URLs. This re-applies the corrected definitions. Every statement is
-- idempotent (cron.schedule upserts by jobname; create-or-replace for the function),
-- so this is safe to re-run and is a no-op on a freshly-migrated database.
--
-- NOTE: for these calls to actually succeed, the edge functions must be deployed to the
-- live project AND the function-side cron secret must equal 'sa-cron-7kQ2vXp9mN4t'.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 0009: SMS outbox processor (every minute)
select cron.schedule(
  'sms-process-outbox-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/sms-process-outbox',
    headers := '{"Content-Type":"application/json","x-cron-secret":"sa-cron-7kQ2vXp9mN4t"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 0012: outreach scheduler (every 15 minutes)
select cron.schedule(
  'outreach-scheduler-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/outreach-scheduler',
    headers := '{"Content-Type":"application/json","x-cron-secret":"sa-cron-7kQ2vXp9mN4t"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- 0011: new waitlist signup -> notify Lee (trigger function on public.campus_waitlist)
create or replace function public.notify_waitlist_signup()
returns trigger language plpgsql security definer as $$
begin
  perform net.http_post(
    url := 'https://unvxagsledbsdoremqeb.supabase.co/functions/v1/notify-waitlist',
    headers := '{"Content-Type":"application/json","x-cron-secret":"sa-cron-7kQ2vXp9mN4t"}'::jsonb,
    body := jsonb_build_object('record', row_to_json(new))
  );
  return new;
end;
$$;

-- Verification: this should return ZERO rows once everything is repointed.
select 'cron job: ' || jobname as location, command as still_points_to_dead_project
from cron.job
where command like '%dhlzorresurzlcpuplkv%'
union all
select 'function: notify_waitlist_signup', pg_get_functiondef('public.notify_waitlist_signup'::regproc)
where pg_get_functiondef('public.notify_waitlist_signup'::regproc) like '%dhlzorresurzlcpuplkv%';
