-- 0039_orders.sql — made-to-order exam prep: orders + order_chapters (additive, greenfield)
-- Renumbered from the plan's "0038": 0038_faculty_mobility.sql (ProfIntel) already
-- exists on origin/main, so orders takes 0039 to avoid a collision.
-- Idempotent (CREATE ... IF NOT EXISTS). FK target PKs verified uuid on live
-- (campuses.id, campus_lead_suggestions.id). After 0038.
--
-- RLS: deny-by-default. NO public anon/authenticated policies. Order writes must
-- go through a SERVER function using the service-role client (the
-- onboarding.functions.ts pattern), which bypasses RLS — NOT the anon-client
-- insertWaitlist pattern. Orders carry PII (name/email/phone) + pricing + ops
-- status, so public read/write must stay closed.

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  short_ref text unique not null default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- student contact (all required in the UI)
  first_name text not null,
  last_name  text not null,
  email      text not null,
  phone      text not null,

  -- campus + course: ALWAYS resolved from the SELECTED campus (getCampusCourseCodes), never a constant
  campus_id     uuid references public.campuses(id),
  campus_text   text,                       -- label / fallback when campus not in DB
  course_family text,                        -- intro_1 | intro_2 | intermediate_1 | intermediate_2
  course_code   text,                        -- the campus's local code shown, e.g. "ACCY 303"
  course_name   text,

  -- professor: free text, with an optional link to the scraped lead if picked from autocomplete
  professor_name    text,
  professor_lead_id uuid references public.campus_lead_suggestions(id),

  -- textbook: capture the name reliably; optional soft link to a supported family (no hard FK for v1 flexibility)
  textbook_name      text,
  textbook_family_id uuid,
  textbook_notes     text,

  -- exam timing: an exact date OR a bucket
  exam_date      date,
  exam_timeframe text check (exam_timeframe in ('this_week','next_week','not_sure')),

  -- the stack choice
  tier text not null check (tier in ('free_teaser','made_to_order','one_on_one')),

  -- pricing snapshot for made_to_order — store what the student saw, in cents
  chapter_count int     not null default 0,
  subtotal_cents int    not null default 0,
  rush boolean          not null default false,
  rush_fee_cents int    not null default 0,
  total_cents int       not null default 0,

  -- delivery estimate shown to the student
  delivery_estimate_days int,
  delivery_target_date   date,

  -- ops
  status text not null default 'new' check (status in ('new','in_progress','delivered','paid','cancelled')),
  admin_notes text,
  source text default 'order_flow'
);

create index if not exists orders_campus_id_idx on public.orders(campus_id);
create index if not exists orders_status_idx    on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create table if not exists public.order_chapters (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  chapter_label  text not null,             -- the literal label the student selected, e.g. "Ch 13: Current Liabilities"
  chapter_number int,
  struggle_note  text,                       -- optional "what's tripping you up in this chapter"
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists order_chapters_order_id_idx on public.order_chapters(order_id);

alter table public.orders         enable row level security;
alter table public.order_chapters enable row level security;
-- No permissive public policies: deny-by-default for anon/authenticated. Inserts/reads happen through a
-- server-side (service-role) Supabase client (onboarding.functions.ts pattern), which bypasses RLS.

-- Refresh PostgREST's schema cache so the new tables are reachable via the API.
notify pgrst, 'reload schema';
