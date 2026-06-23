-- 0009: SMS intake system (Twilio) — per-campus numbers, conversations,
-- scheduled outbox, and the every-minute processor cron.

create table if not exists public.campus_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade unique,
  phone_e164 text not null unique,
  twilio_sid text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.sms_conversations (
  id uuid primary key default gen_random_uuid(),
  student_phone text not null,
  campus_number text not null,
  campus_id uuid references public.campuses(id) on delete set null,
  short_ref serial,
  course text,
  exam_date text,
  struggles text,
  major text,
  sentiment text,
  status text not null default 'active',
  opener_sent boolean not null default false,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_phone, campus_number)
);
create index if not exists sms_conversations_number_idx on public.sms_conversations(campus_number, last_message_at desc);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sms_conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  author text,
  body text not null,
  twilio_sid text,
  created_at timestamptz not null default now()
);
create index if not exists sms_messages_convo_idx on public.sms_messages(conversation_id, created_at);

create table if not exists public.sms_outbox (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sms_conversations(id) on delete cascade,
  body text not null,
  author text not null default 'auto',
  send_at timestamptz not null,
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists sms_outbox_due_idx on public.sms_outbox(status, send_at);

grant select, insert, update, delete on public.campus_phone_numbers to anon, authenticated;
grant select, insert, update, delete on public.sms_conversations to anon, authenticated;
grant select, insert, update, delete on public.sms_messages to anon, authenticated;
grant select, insert, update, delete on public.sms_outbox to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant all on public.campus_phone_numbers to service_role;
grant all on public.sms_conversations to service_role;
grant all on public.sms_messages to service_role;
grant all on public.sms_outbox to service_role;

alter table public.campus_phone_numbers enable row level security;
alter table public.sms_conversations enable row level security;
alter table public.sms_messages enable row level security;
alter table public.sms_outbox enable row level security;
create policy "anon read campus_phone_numbers" on public.campus_phone_numbers for select to anon using (true);
create policy "anon read sms_conversations" on public.sms_conversations for select to anon using (true);
create policy "anon read sms_messages" on public.sms_messages for select to anon using (true);
create policy "anon all sms_outbox" on public.sms_outbox for all to anon using (true) with check (true);
create policy "auth all campus_phone_numbers" on public.campus_phone_numbers for all to authenticated using (true) with check (true);
create policy "auth all sms_conversations" on public.sms_conversations for all to authenticated using (true) with check (true);
create policy "auth all sms_messages" on public.sms_messages for all to authenticated using (true) with check (true);
create policy "auth all sms_outbox" on public.sms_outbox for all to authenticated using (true) with check (true);

create extension if not exists pg_cron;
create extension if not exists pg_net;
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