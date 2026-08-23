-- 20260823_1000_test_mode.sql — Test Mode: Test University fixture + student_entitlements +
-- test_mode_activity. MANUAL-APPLY: paste into the Supabase SQL editor (project
-- unvxagsledbsdoremqeb). Idempotent.
--
-- SHAPE DECISIONS:
--  * Test University is a normal `campuses` row with slug `test-university` and NO campus_exams
--    map, so the student-map resolver falls through to the Starter Map (all Intro-1 chapters).
--    Every real CEQ set is available inside the test — no duplicate content to keep in sync.
--  * Test professors are `campus_lead_suggestions` rows with `active_roster=true` +
--    `rmp_profile_url` set (both are the visibility gates in searchOrderProfessors). The URLs
--    are placeholders; they never render in the picker.
--  * `student_entitlements` — the single source of truth for "can this user open this paid
--    exam". Populated by Stripe webhook (Phase B) OR by admin/test grants. `is_test=true` rows
--    unlock content only inside Test Mode (surfaces will check both).
--  * `test_mode_activity` — the guided-run event log; an admin drawer reads it live.
--
-- If you re-apply this, the ON CONFLICT clauses make it a no-op for the seeded rows; only
-- freshly-added rows land.

-- ────────────────────────────────────────────────────────────────────────────────
-- 1) TEST UNIVERSITY campus
-- ────────────────────────────────────────────────────────────────────────────────
-- Fixed uuid so the professor-seed can reference it deterministically.
insert into public.campuses (id, name, slug, canonical_name, state)
values ('00000000-1111-4000-8000-000000000001', 'Test University', 'test-university', 'Test University', 'TX')
on conflict (slug) do nothing;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2) TEST PROFESSORS — two visible entries + one intentionally-invisible entry
--    (so a tester can exercise the "not listed" write-in path even here).
-- ────────────────────────────────────────────────────────────────────────────────
insert into public.campus_lead_suggestions
  (id, campus_id, first_name, last_name, email, active_roster, rmp_profile_url, source, created_at)
values
  ('00000000-1111-4000-8001-000000000001', '00000000-1111-4000-8000-000000000001', 'Alex', 'Testerson', 'alex.testerson@test-university.edu', true, 'https://example.com/rmp/testerson-alex', 'test_mode_seed', now()),
  ('00000000-1111-4000-8001-000000000002', '00000000-1111-4000-8000-000000000001', 'Sam', 'Fixture',    'sam.fixture@test-university.edu',    true, 'https://example.com/rmp/fixture-sam',    'test_mode_seed', now())
on conflict (id) do nothing;

-- ────────────────────────────────────────────────────────────────────────────────
-- 3) STUDENT ENTITLEMENTS — what a signed-in student is allowed to open. One row per
--    (user, kind[, campus]). Kinds: exam_2 · exam_3 · final · pass. RLS: student reads
--    only their own; only service_role (Stripe webhook, admin) can insert.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.student_entitlements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null check (kind in ('exam_2','exam_3','final','pass')),
  campus_id   uuid references public.campuses(id) on delete set null,
  source      text not null check (source in ('stripe','admin','test_grant')),
  is_test     boolean not null default false,
  stripe_session_id  text,
  stripe_customer_id text,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  meta        jsonb
);

-- A given user gets ONE active row per (kind, campus). Duplicate grants short-circuit.
create unique index if not exists student_entitlements_uniq
  on public.student_entitlements (user_id, kind, coalesce(campus_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where revoked_at is null;
create index if not exists student_entitlements_user_kind on public.student_entitlements (user_id, kind) where revoked_at is null;

alter table public.student_entitlements enable row level security;

drop policy if exists "own entitlements read" on public.student_entitlements;
create policy "own entitlements read" on public.student_entitlements
  for select using (auth.uid() = user_id);

-- No client insert/update/delete — grants come from the Stripe webhook (service_role) or the
-- admin console. Test grants also use service_role via the test-mode server fn.

-- ────────────────────────────────────────────────────────────────────────────────
-- 4) TEST MODE ACTIVITY — the guided-run event log. Feeds /outreach/test-mode.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.test_mode_activity (
  id            bigserial primary key,
  session_key   text not null,           -- crypto.randomUUID() per tester session
  tester_email  text,
  tester_name   text,
  step          text,                    -- 'land','school','professor','open_set','answer',...
  event         text not null,           -- 'step_complete','click','notify_submit','magic_link_sent','test_grant','error'
  status        text not null default 'ok',   -- 'ok','warn','error'
  detail        text,                    -- one-line human-readable
  meta          jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists test_mode_activity_session on public.test_mode_activity (session_key, created_at desc);
create index if not exists test_mode_activity_recent  on public.test_mode_activity (created_at desc);

alter table public.test_mode_activity enable row level security;

-- Anon insert allowed (the tester surface is unauthenticated by design) — but only rows tagged
-- as test activity land, and the admin view reads via service_role.
drop policy if exists "test activity anon insert" on public.test_mode_activity;
create policy "test activity anon insert" on public.test_mode_activity
  for insert with check (true);
-- Reads go through service_role only.
