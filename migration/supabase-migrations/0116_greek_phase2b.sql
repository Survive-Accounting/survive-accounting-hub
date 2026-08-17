-- 0116_greek_phase2b.sql — Greek Phase 2b: seats + ownership transfer.
-- Apply with: bun run migration/supabase-migrations/run_sql.ts <this file> --apply
-- Idempotent. Extends the tables 0115 established; creates no parallel concepts.
--
-- AUDITED LIVE BEFORE WRITING:
--   entitlements            0 rows, columns (user_id, scope, scope_id, order_id, source, expires_at)
--   greek_chapters          0 rows  (0115 applied; seats_total absent)
--   greek_chapter_members   0 rows  (seat_assigned_at / user_id / source present from 0115)
--
-- WHY SEATS GRANT scope='course':
--   entitlements.functions.ts resolves exactly three scopes — 'topic', 'exam_unit' and 'course' —
--   and expands 'course' to every chapter in that course. A Greek seat IS "everything, all
--   semester", so it is a course grant. That means seats need NO change to the unlock resolver, and
--   a seat cannot drift out of sync with what a paying individual gets: same table, same scope,
--   same expansion.
--
-- WHY seats_note EXISTS:
--   there is no checkout in this codebase. Stripe appears once, commented out, and fulfillment is
--   an explicit stub (claimMyOrders: "No Stripe: this stands in for 'on order paid'"). Seats will
--   therefore be sold by invoice / transfer / a payment link for a while, and the ONLY record of
--   how a chapter paid would otherwise live in Lee's texts. One text column costs nothing and is
--   the difference between an auditable sale and a memory.

-- ── 1. SEATS ON THE CHAPTER ──────────────────────────────────────────────────────────────────
alter table public.greek_chapters
  add column if not exists seats_total      int not null default 0,
  -- Free-text on purpose: "invoice 1042", "Venmo 8/17 from treasurer", "stripe link, 12 seats".
  -- An enum would be guessing at payment methods that do not exist yet.
  add column if not exists seats_note       text,
  add column if not exists seats_updated_at timestamptz;

-- Seats cannot go negative. A chapter that "returns" seats gets its total lowered, and the assign
-- guard in the server fn is what stops that from stranding already-granted members.
do $$ begin
  alter table public.greek_chapters add constraint greek_chapters_seats_total_nonneg check (seats_total >= 0);
exception when duplicate_object then null; end $$;

-- ── 2. OWNERSHIP TRANSFER, WITH A TRAIL ──────────────────────────────────────────────────────
-- Chapter officers turn over every single year — transfer is the NORMAL case, not an exception.
-- Overwriting admin_email in place would lose who handed the chapter to whom, which is exactly the
-- question asked when two people both claim to run it.
create table if not exists public.greek_chapter_transfers (
  id                uuid primary key default gen_random_uuid(),
  greek_chapter_id  uuid not null references public.greek_chapters(id) on delete cascade,
  from_email        text,                       -- null when the chapter had no admin yet
  from_name_role    text,
  to_email          text not null,
  to_name_role      text not null,
  to_phone          text,
  -- Who authorised it: an admin email, or the outgoing owner's own email for a self-serve handoff.
  decided_by        text not null,
  reason            text,
  created_at        timestamptz not null default now()
);
create index if not exists greek_chapter_transfers_chapter_idx on public.greek_chapter_transfers(greek_chapter_id);
create index if not exists greek_chapter_transfers_to_email_idx on public.greek_chapter_transfers(lower(to_email));

alter table public.greek_chapter_transfers enable row level security;
-- Deny-by-default, matching 0111/0115: a transfer row carries two people's contact details and is
-- only ever read through a service-role server fn.

-- ── 3. SEAT GRANTS ARE TRACEABLE BACK TO THE CHAPTER ─────────────────────────────────────────
-- entitlements.source already exists; this records WHICH chapter paid, so revoking a chapter's
-- seats can find exactly the grants it created and nothing else. Without it, "revoke this
-- chapter's seats" would have to guess from user ids and could revoke a student's OWN purchase.
alter table public.entitlements
  add column if not exists greek_chapter_id uuid references public.greek_chapters(id) on delete set null;
create index if not exists entitlements_greek_chapter_idx on public.entitlements(greek_chapter_id);

notify pgrst, 'reload schema';
