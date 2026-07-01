-- 0043_custom_study_pack_tracking.sql — student-facing Custom Study Pack tracker.
-- Additive. Renumbered from the prompt's "0041" (0041/0042 already exist).
-- Two new tables (magic-link tokens + stage timeline), extra order columns, and
-- an AFTER INSERT trigger that seeds the initial "request_received" stage event.
-- All new tables are deny-by-default RLS; access is service-role only. After 0042.

-- ---- extra order columns -------------------------------------------------
alter table public.orders add column if not exists special_requests     text;
alter table public.orders add column if not exists chapter_priority_json jsonb;
alter table public.orders add column if not exists syllabus_url          text;   -- may already exist (0041)
alter table public.orders add column if not exists preview_url           text;
alter table public.orders add column if not exists unlock_price_cents    integer;
alter table public.orders add column if not exists unlocked_at           timestamptz;
alter table public.orders add column if not exists request_scope         text;
alter table public.orders add column if not exists request_notes         text;

-- ---- magic-link access tokens --------------------------------------------
create table if not exists public.order_access_tokens (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  email       text not null,                         -- email the token was issued to (matches orders.email, case-insensitive)
  token       text not null unique,                  -- 32 bytes, base64url
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  consumed_at timestamptz,                           -- null = magic link not yet redeemed into a session
  used_at     timestamptz                            -- last time used to view the tracker
);
create index if not exists order_access_tokens_order_id_idx    on public.order_access_tokens(order_id);
create index if not exists order_access_tokens_token_idx       on public.order_access_tokens(token);
create index if not exists order_access_tokens_lower_email_idx on public.order_access_tokens(lower(email));
create index if not exists order_access_tokens_created_at_idx  on public.order_access_tokens(created_at);

alter table public.order_access_tokens enable row level security;
-- deny-by-default: no policies. Access is service-role only.

-- ---- stage timeline ------------------------------------------------------
create table if not exists public.order_stage_events (
  id                     uuid primary key default gen_random_uuid(),
  order_id               uuid not null references public.orders(id) on delete cascade,
  stage                  text not null check (stage in (
                           'request_received','reviewing','preview_in_progress',
                           'preview_ready','unlocked','delivered','post_exam_check_in')),
  note                   text,        -- admin-only
  student_visible_message text,       -- shown on the tracker
  preview_url            text,        -- Loom/video/preview link (preview_ready)
  unlock_price_cents     integer,     -- optional (preview_ready / unlocked)
  unlock_url             text,        -- optional future payment link
  created_at             timestamptz not null default now()
);
create index if not exists order_stage_events_order_created_idx on public.order_stage_events(order_id, created_at);
create index if not exists order_stage_events_stage_idx         on public.order_stage_events(stage);

alter table public.order_stage_events enable row level security;
-- deny-by-default: no policies. Access is service-role only.

-- ---- seed the first stage event on every new order -----------------------
create or replace function public.order_seed_stage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.order_stage_events (order_id, stage, student_visible_message)
  select new.id, 'request_received',
         'Your request was received. I''ll review your course, professor, exam timing, and requested topics.'
  where not exists (
    select 1 from public.order_stage_events e
    where e.order_id = new.id and e.stage = 'request_received'
  );
  return new;
end;
$$;

drop trigger if exists orders_seed_stage on public.orders;
create trigger orders_seed_stage
  after insert on public.orders
  for each row execute function public.order_seed_stage_event();

notify pgrst, 'reload schema';
