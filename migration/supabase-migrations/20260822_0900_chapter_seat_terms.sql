-- CHAPTER SEATS BECOME TERM-SCOPED (branch: chapter-seats)
--
-- WHAT CHANGES. Today a chapter has one timeless number: greek_chapters.seats_total, set by hand
-- by an admin. That cannot express "20 seats for Fall 2026, expiring Dec 31" — and without a term
-- there is nothing to expire, so a chapter that paid once would hold access forever.
--
-- These two tables add the term. The old columns are LEFT ALONE and become read-only legacy: no
-- data is moved, nothing is dropped, and the existing admin path keeps working until the new one
-- replaces it. A later migration can backfill pools from seats_total if we decide to.
--
-- is_test EVERYWHERE. Both tables carry it so the Test Mode purge can find and remove every
-- artifact of a test lifecycle in one dependency-ordered sweep, and so every real count, roster,
-- revenue figure and council metric can exclude test rows with the same predicate the comms
-- tables already use (campus_waitlist.is_test, comms_sends.is_test).
--
-- SAFE TO RE-RUN.

-- ── the term seat pool ─────────────────────────────────────────────────────────────────────────
-- One row per (chapter, term). "20 purchased for Fall 2026, expiring Dec 31 2026", plus how it
-- was paid for and the Stripe references when there are any. Seats are never rolled forward: a
-- new term is a new row.
create table if not exists public.chapter_seat_pools (
  id              uuid primary key default gen_random_uuid(),
  chapter_id      uuid not null references public.greek_chapters(id) on delete cascade,
  -- "fall-2026" — parsed by lib/terms.ts termFromId(). The label and dates are derived from it,
  -- never stored separately, so a config change moves every existing pool with it.
  term_id         text not null,
  seats_total     integer not null check (seats_total >= 0),
  -- Denormalised from the term config at purchase time so an expiry is auditable even if the
  -- config later moves; lib/terms.ts remains the source for anything forward-looking.
  starts_at       timestamptz not null,
  expires_at      timestamptz not null,
  amount_cents    integer not null default 0 check (amount_cents >= 0),
  -- card | invoice | check | comp  (comp = courtesy access granted by Lee)
  payment_method  text,
  -- pending | awaiting_check | active | void
  status          text not null default 'pending',
  activated_at    timestamptz,
  -- Stripe references. Null until the payment work lands (Test Mode gates that build).
  stripe_checkout_id text,
  stripe_invoice_id  text,
  invoice_number     text,
  invoice_url        text,
  invoice_status     text,
  note            text,
  is_test         boolean not null default false,
  created_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- One pool per chapter per term: buying more seats for a term ADDS to that pool rather than
  -- creating a second one, which is what keeps "14 of 20 assigned" a single true statement.
  constraint chapter_seat_pools_chapter_term_key unique (chapter_id, term_id)
);

create index if not exists chapter_seat_pools_chapter_idx on public.chapter_seat_pools (chapter_id);
create index if not exists chapter_seat_pools_term_idx    on public.chapter_seat_pools (term_id);
create index if not exists chapter_seat_pools_active_idx  on public.chapter_seat_pools (status, expires_at);

-- ── who holds a seat, for that term ────────────────────────────────────────────────────────────
-- released_at rather than a delete: an unassigned seat is history the chapter may need for its
-- semester summary, and the brief requires assignment records to survive term expiry.
create table if not exists public.chapter_seat_assignments (
  id           uuid primary key default gen_random_uuid(),
  pool_id      uuid not null references public.chapter_seat_pools(id) on delete cascade,
  chapter_id   uuid not null references public.greek_chapters(id) on delete cascade,
  member_id    uuid references public.greek_chapter_members(id) on delete set null,
  user_id      uuid,
  member_email text,
  assigned_at  timestamptz not null default now(),
  released_at  timestamptz,
  -- The entitlement this assignment granted, so releasing a seat can revoke exactly that row.
  entitlement_id uuid,
  is_test      boolean not null default false,
  assigned_by  text,
  created_at   timestamptz not null default now()
);

create index if not exists chapter_seat_assignments_pool_idx    on public.chapter_seat_assignments (pool_id);
create index if not exists chapter_seat_assignments_chapter_idx on public.chapter_seat_assignments (chapter_id);
create index if not exists chapter_seat_assignments_member_idx  on public.chapter_seat_assignments (member_id);
-- A member holds at most ONE live seat per pool. Partial index, so released rows never block a
-- reassignment to the same person later in the term.
create unique index if not exists chapter_seat_assignments_live_key
  on public.chapter_seat_assignments (pool_id, member_id)
  where released_at is null and member_id is not null;

-- ── share-kit / pitch activity ─────────────────────────────────────────────────────────────────
-- Which chapters are actively pitching internally: every share-kit generate/copy/download is a
-- row here. Deliberately an ACTION log, never a viewing log — see the privacy rule: execs may see
-- membership and seat assignment, never what an individual member watched.
create table if not exists public.chapter_share_events (
  id         uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.greek_chapters(id) on delete cascade,
  kind       text not null,          -- flyer | treasurer_pdf | slide | groupchat | treasurer_email | invoice_link
  term_id    text,
  actor      text,
  is_test    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chapter_share_events_chapter_idx on public.chapter_share_events (chapter_id, created_at desc);

-- ── deny-by-default ────────────────────────────────────────────────────────────────────────────
-- Same posture as the rest of the Greek tables: no anon/authenticated policies, so only the
-- service-role server functions can read or write. Seat money and roster identity never travel
-- through the browser's key.
alter table public.chapter_seat_pools       enable row level security;
alter table public.chapter_seat_assignments enable row level security;
alter table public.chapter_share_events     enable row level security;
