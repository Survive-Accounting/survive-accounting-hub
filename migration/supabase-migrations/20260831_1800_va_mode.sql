-- VA enrichment mode. VAs (King's team + EJ) whose only job is adding contacts get a private,
-- passcode-free link and a stripped view. Three tables:
--
-- growth_va — the roster. One row per VA, reached by a unique `token` in their link. `team` maps to
-- the campus pool they work (king → King's tranche, lee → founder). Rates are per-VA overrides; NULL
-- falls back to the global default ($4/ready, $1/personal IG). No passwords — the token is the key.
create table if not exists public.growth_va (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  name text not null,
  team text not null default 'king' check (team in ('king','lee')),
  active boolean not null default true,
  rate_ready_cents integer,
  rate_ig_cents integer,
  created_at timestamptz not null default now()
);

-- growth_va_campus — which VA is working which campus. Claiming (one owner per campus) keeps two VAs
-- off the same campus and makes READY-credit unambiguous for pay.
create table if not exists public.growth_va_campus (
  id uuid primary key default gen_random_uuid(),
  va_id uuid not null references public.growth_va(id) on delete cascade,
  campus_id uuid not null references public.campuses(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  reached_ready boolean not null default false,
  unique (campus_id)
);
create index if not exists growth_va_campus_va_idx on public.growth_va_campus (va_id);

-- growth_va_problem — "report a problem" submissions. Emailed to Lee AND kept here with the context
-- (campus, page, browser) so nothing is lost if the email bounces.
create table if not exists public.growth_va_problem (
  id uuid primary key default gen_random_uuid(),
  va_id uuid references public.growth_va(id) on delete set null,
  campus_id uuid references public.campuses(id) on delete set null,
  note text not null,
  page text,
  user_agent text,
  screenshot_urls text[],
  created_at timestamptz not null default now()
);

-- Deny-by-default: only the service role (bypasses RLS) touches these.
alter table public.growth_va enable row level security;
alter table public.growth_va_campus enable row level security;
alter table public.growth_va_problem enable row level security;

-- A test VA so the /va/<token> link can be exercised. Real VAs are added from Lee's roster later.
insert into public.growth_va (token, name, team)
  values ('vk_test_9f3a2b1c7d', 'Test VA', 'king')
  on conflict (token) do nothing;
