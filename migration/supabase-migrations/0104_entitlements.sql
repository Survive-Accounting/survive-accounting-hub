-- 0104_entitlements.sql — purchase → unlocked content [Prompt 4]
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- A grant unlocks a scope for a user: a single topic (chapters.id), an exam_unit (all its
-- chapters), or a whole course. The student shell derives lock/unlock SERVER-SIDE from these
-- rows and withholds a paid set's playback id until the caller holds a covering grant. Grants
-- are written only by service-role fulfillment (claimMyOrders / future admin) — students may
-- READ their own but never insert.

create table if not exists public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  scope      text not null check (scope in ('topic', 'exam_unit', 'course')),
  scope_id   uuid not null,                 -- chapters.id | exam_units.id | courses.id, per scope
  order_id   uuid references public.orders(id) on delete set null,  -- provenance (null = admin/promo)
  source     text not null default 'order' check (source in ('order', 'admin', 'promo')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz,                    -- null = perpetual
  unique (user_id, scope, scope_id)
);
create index if not exists entitlements_user_idx on public.entitlements(user_id);

alter table public.entitlements enable row level security;

-- A student READS only their own grants; there is NO insert/update policy → every grant is
-- written by service-role fulfillment (students can never grant themselves).
drop policy if exists "own entitlements read" on public.entitlements;
create policy "own entitlements read" on public.entitlements for select using (auth.uid() = user_id);

-- ORDERS BRIDGE: order_chapters holds free-text labels ("Ch 13") with no FK. This optional
-- column resolves a label to a real chapter so fulfillment can grant topic entitlements.
alter table public.order_chapters add column if not exists chapter_id uuid references public.chapters(id) on delete set null;
