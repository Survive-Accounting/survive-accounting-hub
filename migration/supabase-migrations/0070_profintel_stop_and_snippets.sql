-- 0070_profintel_stop_and_snippets.sql
-- (1) STOP / opt-out marker on profintel_sends — parallel to replied_at. A professor
--     who replies STOP is marked here from the metrics dashboard; "Stop rate" counts
--     these and they sink to the bottom of the follow-up ordering.
-- (2) profintel_reply_snippets — a small library of reusable reply / follow-up texts
--     Lee copies when answering from his inbox. Anon CRUD (AdminGate'd UI), matching
--     the other ProfIntel tables.
-- Idempotent. After 0069.

alter table public.profintel_sends
  add column if not exists stopped_at timestamptz;   -- opt-out (STOP), marked in the dashboard

create table if not exists public.profintel_reply_snippets (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  body       text not null,
  sort       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profintel_reply_snippets enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'profintel_reply_snippets'
      and policyname = 'profintel_reply_snippets_all'
  ) then
    create policy profintel_reply_snippets_all
      on public.profintel_reply_snippets for all to anon, authenticated
      using (true) with check (true);
  end if;
end $$;

-- Seed with Lee's "thanks for flagging" reply (from the Tracy Morgan thread). Snippets
-- are copy-paste — {first_name} is a manual placeholder (same token style as the cold
-- template), not auto-substituted.
insert into public.profintel_reply_snippets (name, body, sort)
select
  'Thanks for flagging',
  $body$Hi {first_name},

Thanks so much — I really appreciate it.

If any ACCT students reach out, I'll take good care of them.

Hope the rest of your summer is great,
Lee$body$,
  0
where not exists (
  select 1 from public.profintel_reply_snippets where name = 'Thanks for flagging'
);

notify pgrst, 'reload schema';
