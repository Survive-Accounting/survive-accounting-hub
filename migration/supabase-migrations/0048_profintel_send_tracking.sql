-- 0048_profintel_send_tracking.sql
-- Turns ProfIntel from drafts-only into a measured send channel:
--   • per-send delivery/tracking fields (sent, opened, replied, Resend id)
--   • a denormalized profintel_score for score-ordered scheduling
--   • a singleton settings row with a SENDING KILL-SWITCH (default OFF) + daily cap
-- The send worker + webhooks (edge functions) read/write these. NOTHING sends
-- until profintel_settings.sending_enabled is flipped true.
-- Idempotent. After 0047. Anon CRUD (AdminGate'd UI); the worker uses service-role.

alter table public.profintel_sends
  add column if not exists sent_at            timestamptz;
alter table public.profintel_sends
  add column if not exists opened_at          timestamptz;   -- first open (Resend webhook)
alter table public.profintel_sends
  add column if not exists open_count         integer default 0;
alter table public.profintel_sends
  add column if not exists replied_at         timestamptz;   -- inbound reply matched
alter table public.profintel_sends
  add column if not exists resend_message_id  text;          -- Resend email id, for webhook matching
alter table public.profintel_sends
  add column if not exists send_error         text;
alter table public.profintel_sends
  add column if not exists profintel_score    integer;       -- denormalized from the lead, for ordering

create index if not exists profintel_sends_due_idx
  on public.profintel_sends (scheduled_at)
  where status = 'scheduled';
create index if not exists profintel_sends_resend_idx
  on public.profintel_sends (resend_message_id)
  where resend_message_id is not null;

-- Global send controls (singleton). sending_enabled = the master kill-switch.
create table if not exists public.profintel_settings (
  id              integer primary key default 1,
  sending_enabled boolean not null default false,
  daily_send_cap  integer not null default 40,
  last_run_at     timestamptz,
  sent_today      integer not null default 0,
  sent_today_date date,
  updated_at      timestamptz default now(),
  constraint profintel_settings_singleton check (id = 1)
);
insert into public.profintel_settings (id) values (1) on conflict (id) do nothing;

alter table public.profintel_settings enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profintel_settings' and policyname='profintel_settings_all') then
    create policy profintel_settings_all on public.profintel_settings for all to anon, authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
