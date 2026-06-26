-- 0033_campus_spirit.sql
-- Curated, HAND-VERIFIED school-spirit data for the subtle onboarding "spirit
-- moment" (school-color wash + greeting after campus select, before course-code
-- reveal). School colors/mascots/chants are tribal (SEC + rivals) — a WRONG guess
-- is worse than nothing, so this table is the ONLY source and the feature ONLY
-- animates when verified = true AND primary_hex + mascot are present. Anything
-- else → neutral on-brand fallback. NEVER auto-research/LLM-generate these rows.
-- Idempotent — safe to re-run. After the high-water mark (0032).

create table if not exists public.campus_spirit (
  campus_id     uuid primary key references public.campuses(id) on delete cascade,
  primary_hex   text,           -- required for animation (e.g. '#14213D')
  secondary_hex text,
  tertiary_hex  text,           -- nullable
  mascot        text,           -- required for animation (e.g. 'Rebels')
  greeting      text,           -- nullable (e.g. 'Hotty Toddy!')
  chant         text,           -- nullable — only ever shown if verified
  verified      boolean not null default false,
  verified_by   text,
  verified_at   timestamptz,
  updated_at    timestamptz default now()
);

alter table public.campus_spirit enable row level security;

-- Public read (school colors aren't sensitive); writes are service-role only.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campus_spirit' and policyname='campus_spirit_public_read') then
    create policy campus_spirit_public_read on public.campus_spirit for select to anon, authenticated using (true);
  end if;
end $$;

-- Seed ONE verified example so the mechanism is testable: University of
-- Mississippi (Ole Miss). All other campuses stay unseeded → graceful fallback.
insert into public.campus_spirit (campus_id, primary_hex, secondary_hex, mascot, greeting, verified, verified_by, verified_at)
select c.id, '#14213D', '#CE1126', 'Rebels', 'Hotty Toddy!', true, 'seed', now()
from public.campuses c
where (c.name ilike '%University of Mississippi%' or c.name ilike '%Ole Miss%')
  and c.name not ilike '%state%'
order by c.name
limit 1
on conflict (campus_id) do nothing;

notify pgrst, 'reload schema';
