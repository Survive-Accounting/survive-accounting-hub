-- Growth Admin V1 — unified contact history + outreach event log.
--
-- WHY THESE TABLES EXIST (shape decisions):
--   The repo already has entity-specific people/contact stores — greek_org_people
--   (national-org officers, year-array tenure), greek_chapter_contacts (a current
--   snapshot, no history), greek_chapter_claims (claim events), outreach_leads
--   (faculty, denormalized) — but NONE model a PERSON that (a) can hold several
--   relationships to different entities (campus / chapter / council / national org)
--   and (b) preserves those relationships OVER TIME (start/end term, current vs
--   former). That history is the load-bearing requirement for the Growth workspace:
--   "the former exec who promoted us last semester introduces the new exec who
--   isn't replying." So growth_contacts (the person) + growth_contact_roles (the
--   dated relationship) is a clean, additive person↔entity↔role↔term model.
--
--   Likewise there is no append-only, multi-channel (email / IG DM / text / call),
--   directional outreach ACTIVITY log — only channel-specific send tables
--   (comms_sends, outreach_email_events, sms_messages). growth_outreach_events is
--   that log: one row per touch, with channel + direction + status + timestamp +
--   an optional next_follow_up_at that drives the work queue. Its status vocabulary
--   is a superset of the email-campaign lifecycle (queued/sent/delivered/bounced/
--   opened/clicked/replied/unsubscribed) plus manual-log states (logged/no_answer/
--   left_message) so future app-generated campaign events slot in with no schema change.
--
-- SCOPE GUARDRAILS (other sessions own adjacent areas):
--   * Campus "readiness" is owned by a separate session — this migration adds NO
--     readiness column/table. The Growth UI derives readiness read-only from
--     existing campuses columns.
--   * Referral / affiliate attribution is owned by a separate session — this is NOT
--     an affiliate platform. campaign_id here is a loose uuid (no FK) so it can
--     reference outreach_campaigns without coupling.
--
-- entity_type + entity_id is a polymorphic pointer:
--   'campus'  -> campuses.id
--   'chapter' -> campus_greek_chapters.id   (the rich per-campus roster row)
--   'org'     -> greek_orgs.id
--   'council' -> no table (councils are (campus_id, council_slug)); entity_id NULL,
--                council_slug set, campus_id set.
--   campus_id is denormalized onto every row so the whole workspace filters by campus
--   with one indexed predicate regardless of entity_type.
--
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb).
-- Service-role writes bypass RLS; RLS is deny-by-default so nothing is exposed to anon.

begin;

-- 1. The person -------------------------------------------------------------
create table if not exists public.growth_contacts (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  email            text,
  phone            text,
  instagram        text,
  title            text,                       -- optional headline role, e.g. "Chapter President"
  notes            text,
  source           text,                       -- how we found them: 'manual' | 'chapter_site' | 'ig' | 'referral' | 'roster' ...
  source_url       text,
  last_verified_at timestamptz,
  created_by       text,                        -- admin identity from AdminGate (lee | king)
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists growth_contacts_name_idx  on public.growth_contacts (lower(full_name));
create index if not exists growth_contacts_email_idx on public.growth_contacts (lower(email));

-- 2. The dated relationship (history) --------------------------------------
create table if not exists public.growth_contact_roles (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.growth_contacts(id) on delete cascade,
  entity_type  text not null check (entity_type in ('campus','chapter','council','org')),
  entity_id    uuid,                            -- null for council
  campus_id    uuid,                            -- denormalized; references campuses.id (kept loose, no FK)
  council_slug text,                            -- set when entity_type = 'council'
  role         text,                            -- free text: 'President','Treasurer','Recruitment Chair','Advisor'...
  start_term   text,                            -- free text term label: 'Fall 2025' (terms are messy in the wild)
  end_term     text,
  is_current   boolean not null default true,
  source       text,
  source_url   text,
  notes        text,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists growth_roles_contact_idx on public.growth_contact_roles (contact_id);
create index if not exists growth_roles_entity_idx  on public.growth_contact_roles (entity_type, entity_id);
create index if not exists growth_roles_campus_idx  on public.growth_contact_roles (campus_id);
create index if not exists growth_roles_current_idx on public.growth_contact_roles (is_current) where is_current;

-- 3. The append-only outreach activity log ---------------------------------
create table if not exists public.growth_outreach_events (
  id                bigserial primary key,
  contact_id        uuid references public.growth_contacts(id) on delete set null,
  entity_type       text check (entity_type in ('campus','chapter','council','org')),
  entity_id         uuid,
  campus_id         uuid,                        -- denormalized for filtering
  council_slug      text,
  channel           text not null check (channel in ('email','ig_dm','text','call','other')),
  direction         text not null default 'outbound' check (direction in ('outbound','inbound')),
  status            text not null default 'logged'
                      check (status in ('queued','sent','delivered','bounced','opened','clicked',
                                        'replied','unsubscribed','logged','no_answer','left_message')),
  campaign_id       uuid,                        -- loose link to outreach_campaigns.id (no FK, intentional)
  template_id       uuid,
  message_id        text,
  subject           text,
  body              text,
  occurred_at       timestamptz not null default now(),
  next_follow_up_at timestamptz,
  follow_up_done_at timestamptz,                 -- set when a later touch resolves the follow-up
  notes             text,
  created_by        text,
  created_at        timestamptz not null default now()
);

create index if not exists growth_events_contact_idx    on public.growth_outreach_events (contact_id);
create index if not exists growth_events_entity_idx      on public.growth_outreach_events (entity_type, entity_id);
create index if not exists growth_events_campus_idx      on public.growth_outreach_events (campus_id);
create index if not exists growth_events_occurred_idx    on public.growth_outreach_events (occurred_at desc);
create index if not exists growth_events_followup_idx    on public.growth_outreach_events (next_follow_up_at)
  where next_follow_up_at is not null and follow_up_done_at is null;

-- 4. RLS: deny-by-default. Service-role (server functions) bypasses RLS entirely; --
--    no anon/authenticated policies are created, so the browser can never read these. --
alter table public.growth_contacts        enable row level security;
alter table public.growth_contact_roles   enable row level security;
alter table public.growth_outreach_events enable row level security;

commit;

-- Proof: list the three tables and their column counts (readable output, not a claim). --
select c.table_name, count(*) as columns
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('growth_contacts','growth_contact_roles','growth_outreach_events')
group by c.table_name
order by c.table_name;
