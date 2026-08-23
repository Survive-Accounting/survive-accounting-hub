-- 20260823_2330_referral_platform.sql — Generic referral / attribution / commission platform.
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- ONE attribution system for every source type — campus reps, student ambassadors, Greek
-- chapters, councils, national orgs, flyers/QR, influencers, alumni, NIL/athlete partners, and
-- scratch one-off promo links. The type is a label on a partner, NOT a separate codepath.
--
--   Partner  →  Trackable Link (/r/<code>)  →  Click  →  Conversion (signup/purchase)  →  Commission
--
-- ATTRIBUTION RULE (documented, conservative, single-touch):
--   Last eligible referral click within a 30-day window, first-party cookie `sa_ref`.
--   Every /r/<code> hit (over)writes the cookie (code + ts, 30-day Max-Age). Last click wins.
--   A conversion server-fn reads the cookie; if its click is within the window it attributes the
--   conversion to that link's partner. Conversions are deduped per (subject_type, subject_id, kind)
--   so re-processing an order never double-counts. No multi-touch, no client-supplied revenue.
--
-- TEST MODE: a conversion/commission is `is_test` when its LINK or PARTNER is `is_test`. Test rows
--   are excluded from real revenue/commission totals (admin filters is_test = false) and are only
--   visible when the test filter is on. Test Mode never issues a real commission.
--
-- RLS: deny-by-default on every table (RLS enabled, NO anon/authenticated policy). All reads/writes
--   go through server functions using the service-role client (bypasses RLS), reached behind the
--   AdminGate for admin surfaces and inside trusted server handlers for click/conversion capture.
--
-- Re-applying is a no-op: create-if-not-exists + drop-policy-if-exists guards throughout.

begin;

-- ────────────────────────────────────────────────────────────────────────────────
-- 1) PARTNERS — the generic source. Type is a label, never a branch.
--    Commission fields inline (no separate rules table for V1): a partner carries a DEFAULT rule;
--    a link may override it. commission_type: 'percent' (rate = whole percent, 10 = 10%) |
--    'flat' (rate = flat cents per purchase) | 'none'.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.referral_partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text not null default 'other'
                  check (type in ('campus_rep','ambassador','chapter','council','national_org',
                                  'influencer','alumni','flyer','other')),
  email         text,
  phone         text,
  social_handle text,
  status        text not null default 'active' check (status in ('active','paused','archived')),
  default_commission_type text not null default 'percent'
                  check (default_commission_type in ('percent','flat','none')),
  default_commission_rate numeric not null default 10,
  campus_id     uuid references public.campuses(id) on delete set null,
  notes         text,
  is_test       boolean not null default false,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists referral_partners_status  on public.referral_partners (status, created_at desc);
create index if not exists referral_partners_type    on public.referral_partners (type);
create index if not exists referral_partners_is_test on public.referral_partners (is_test);

alter table public.referral_partners enable row level security;

-- ────────────────────────────────────────────────────────────────────────────────
-- 2) LINKS — one trackable /r/<code> per row. destination_url is any Survive URL (often a
--    canonical /go/<school>/<chapter> built by goPath). commission_type/rate NULL = inherit the
--    partner default. utm_* are optional passthrough appended to the destination on redirect.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.referral_links (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  partner_id      uuid not null references public.referral_partners(id) on delete cascade,
  label           text,
  destination_url text not null,
  campaign        text,
  commission_type text check (commission_type in ('percent','flat','none')),
  commission_rate numeric,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  active          boolean not null default true,
  is_test         boolean not null default false,
  created_by      text,
  created_at      timestamptz not null default now()
);
create index if not exists referral_links_partner on public.referral_links (partner_id, created_at desc);
create index if not exists referral_links_active  on public.referral_links (active) where active;

alter table public.referral_links enable row level security;

-- ────────────────────────────────────────────────────────────────────────────────
-- 3) CLICKS — append-only. Written by the /r/<code> server route (service-role). ip is HASHED,
--    never stored raw (privacy). No PII, no sensitive ids exposed in the code itself.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.referral_clicks (
  id          bigserial primary key,
  link_id     uuid not null references public.referral_links(id) on delete cascade,
  code        text not null,
  anon_id     text,
  occurred_at timestamptz not null default now(),
  ip_hash     text,
  user_agent  text,
  referer     text,
  is_bot      boolean not null default false,
  is_test     boolean not null default false,
  meta        jsonb
);
create index if not exists referral_clicks_link   on public.referral_clicks (link_id, occurred_at desc);
create index if not exists referral_clicks_anon   on public.referral_clicks (anon_id) where anon_id is not null;
create index if not exists referral_clicks_recent on public.referral_clicks (occurred_at desc);

alter table public.referral_clicks enable row level security;

-- ────────────────────────────────────────────────────────────────────────────────
-- 4) CONVERSIONS — a signup/purchase attributed to a link. kind:
--      'signup'          — a lead/account/request (revenue may be 0)
--      'purchase'        — a paid student purchase (amount_cents from the server-side order/entitlement)
--      'chapter_purchase'— a paid chapter/seat purchase
--    subject_type/subject_id point at the real record ('order','entitlement','waitlist','manual').
--    The unique index makes purchase recording idempotent per real record.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.referral_conversions (
  id               uuid primary key default gen_random_uuid(),
  link_id          uuid references public.referral_links(id) on delete set null,
  partner_id       uuid references public.referral_partners(id) on delete set null,
  code             text,
  anon_id          text,
  kind             text not null check (kind in ('signup','purchase','chapter_purchase')),
  subject_type     text,
  subject_id       text,
  user_id          uuid,
  email            text,
  amount_cents     integer not null default 0,
  attribution_model text not null default 'last_touch_30d',
  occurred_at      timestamptz not null default now(),
  is_test          boolean not null default false,
  meta             jsonb
);
-- One conversion per (real record, kind). NULL subject_id (manual/anon) is exempt from the guard.
create unique index if not exists referral_conversions_subject_uniq
  on public.referral_conversions (subject_type, subject_id, kind)
  where subject_id is not null;
create index if not exists referral_conversions_partner on public.referral_conversions (partner_id, occurred_at desc);
create index if not exists referral_conversions_link    on public.referral_conversions (link_id, occurred_at desc);

alter table public.referral_conversions enable row level security;

-- ────────────────────────────────────────────────────────────────────────────────
-- 5) COMMISSIONS — the ledger. One row per purchase conversion. basis_cents is the server-computed
--    revenue; commission_type/rate are SNAPSHOTTED at calculation time so later rule edits don't
--    rewrite history. status: pending → approved → paid, or void. Payouts are NOT automated.
-- ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.referral_commissions (
  id                uuid primary key default gen_random_uuid(),
  conversion_id     uuid unique references public.referral_conversions(id) on delete cascade,
  partner_id        uuid not null references public.referral_partners(id) on delete cascade,
  link_id           uuid references public.referral_links(id) on delete set null,
  basis_cents       integer not null default 0,
  commission_type   text not null check (commission_type in ('percent','flat','none')),
  commission_rate   numeric not null default 0,
  commission_cents  integer not null default 0,
  status            text not null default 'pending' check (status in ('pending','approved','paid','void')),
  is_test           boolean not null default false,
  notes             text,
  created_at        timestamptz not null default now(),
  status_changed_at timestamptz not null default now(),
  status_changed_by text
);
create index if not exists referral_commissions_partner on public.referral_commissions (partner_id, created_at desc);
create index if not exists referral_commissions_status  on public.referral_commissions (status);
create index if not exists referral_commissions_is_test on public.referral_commissions (is_test);

alter table public.referral_commissions enable row level security;

commit;

-- Refresh PostgREST's schema cache so the new tables are reachable immediately.
notify pgrst, 'reload schema';

-- ────────────────────────────────────────────────────────────────────────────────
-- PROOF — real output you can read, not a comment claiming success. Lists the five tables that
-- must now exist. A missing row means that table did not get created.
-- ────────────────────────────────────────────────────────────────────────────────
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('referral_partners','referral_links','referral_clicks',
                     'referral_conversions','referral_commissions')
order by table_name;
