-- 20260821_0900_comms_unified_intake.sql — ONE intake, ONE send log, real suppression.
-- MANUAL-APPLY via run_sql.ts (project unvxagsledbsdoremqeb). Idempotent.
--
-- Implements the capture-point audit plan (2026-08-21): every web capture routes through
-- submitIntake → campus_waitlist (the table that already had the only founder-alert trigger).
-- The old DB trigger is DROPPED here: alerts + student confirmations now run in-app
-- (src/lib/intake.functions.ts) so one code path owns copy, suppression, caps, and [TEST].

-- 1) campus_waitlist becomes the unified lead row -------------------------------------------
alter table public.campus_waitlist alter column email drop not null;  -- phone-only captures exist
alter table public.campus_waitlist add column if not exists kind text;
alter table public.campus_waitlist add column if not exists channel text;          -- email | phone | both
alter table public.campus_waitlist add column if not exists campus_id uuid references public.campuses(id) on delete set null;
alter table public.campus_waitlist add column if not exists course_code text;
alter table public.campus_waitlist add column if not exists professor text;
alter table public.campus_waitlist add column if not exists exam int;
alter table public.campus_waitlist add column if not exists topic text;
alter table public.campus_waitlist add column if not exists chapter text;
alter table public.campus_waitlist add column if not exists source_path text;
alter table public.campus_waitlist add column if not exists note text;             -- free text (syllabus notes, referral text)
alter table public.campus_waitlist add column if not exists file_paths text[];     -- uploaded syllabi (storage paths)
alter table public.campus_waitlist add column if not exists is_test boolean not null default false;
alter table public.campus_waitlist add column if not exists consent_sms_at timestamptz; -- A2P: disclosure shown + submitted with a phone
alter table public.campus_waitlist add column if not exists legacy_table text;     -- set on rows migrated from retired tables
alter table public.campus_waitlist add column if not exists legacy_id text;
create index if not exists campus_waitlist_kind_idx on public.campus_waitlist (kind, created_at desc);
create index if not exists campus_waitlist_email_idx on public.campus_waitlist (lower(email));
create index if not exists campus_waitlist_exam_idx on public.campus_waitlist (exam) where kind = 'notify_exam';
-- kinds are enforced in code (zod) — a CHECK here would block the migrated legacy rows.

-- The old trigger → notify-waitlist edge fn would DOUBLE every founder alert now. Gone.
drop trigger if exists campus_waitlist_notify on public.campus_waitlist;

-- 2) Suppression — STOP replies, unsubscribes, bounces. Checked on EVERY send path. ----------
create table if not exists public.comms_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  reason text not null,           -- unsubscribe | stop | bounce | complaint | manual
  source text,                    -- link | sms_webhook | resend_webhook | admin
  created_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create unique index if not exists comms_suppressions_email_uidx on public.comms_suppressions (lower(email)) where email is not null;
create unique index if not exists comms_suppressions_phone_uidx on public.comms_suppressions (phone) where phone is not null;
alter table public.comms_suppressions enable row level security;  -- service-role only

-- 3) Contacts — one row per email: the unsubscribe/preferences token (CAN-SPAM link target). -
create table if not exists public.comms_contacts (
  email text primary key,
  token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now()
);
alter table public.comms_contacts enable row level security;

-- 4) Send log — every email/SMS out, student or founder. Powers: frequency cap (2 marketing
--    emails / 7 days), broadcast double-send guard, sequence state, founder rate limit. -------
create table if not exists public.comms_sends (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.campus_waitlist(id) on delete set null,
  to_email text,
  to_phone text,
  medium text not null,            -- email | sms
  template text not null,          -- e.g. confirm_notify_exam, seq_exam_t3, broadcast_exam_live, founder_priority
  category text not null,          -- transactional | marketing | founder
  subject text,
  dedupe_key text,                 -- e.g. broadcast:exam1 / seq_meet_lee / seq_exam_t10:exam1
  is_test boolean not null default false,
  status text not null default 'sent',  -- sent | queued | held | failed | skipped
  error text,
  provider_id text,
  sent_at timestamptz not null default now()
);
create index if not exists comms_sends_email_idx on public.comms_sends (lower(to_email), sent_at desc);
create index if not exists comms_sends_lead_idx on public.comms_sends (lead_id, template);
create index if not exists comms_sends_template_idx on public.comms_sends (template, sent_at desc);
create unique index if not exists comms_sends_dedupe_uidx on public.comms_sends (lead_id, dedupe_key) where dedupe_key is not null and lead_id is not null and is_test = false;
alter table public.comms_sends enable row level security;

-- 5) Broadcasts — admin-triggered "Exam N videos are live" sends, with the recipient count. ---
create table if not exists public.comms_broadcasts (
  id uuid primary key default gen_random_uuid(),
  exam int,
  topic text,
  subject text not null,
  recipient_count int not null default 0,
  sent_count int not null default 0,
  is_test boolean not null default false,
  created_by text,
  created_at timestamptz not null default now()
);
alter table public.comms_broadcasts enable row level security;

-- 6) Campus exam dates — drives sequence A (T-10 / T-3 / T-1). Empty until syllabi arrive. --
create table if not exists public.campus_exam_dates (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid not null references public.campuses(id) on delete cascade,
  course_code text,                -- null = every intro section at the campus
  exam int not null,
  exam_date date not null,
  source text,                     -- syllabus | manual
  created_at timestamptz not null default now(),
  unique (campus_id, course_code, exam)
);
alter table public.campus_exam_dates enable row level security;

-- 7) Migrate the two retired write targets IN, preserving timestamps ------------------------
--    (a) syllabus_submissions → kind by source: landing-notify → notify_exam, two_set_ask →
--        save_progress, everything else (file uploads) → syllabus.
insert into public.campus_waitlist (name, email, phone, campus_id, campus_text, professor, topic, note, file_paths, source, kind, channel, created_at, legacy_table, legacy_id)
select
  null,
  case when position('@' in coalesce(s.email, '')) > 0 then s.email else null end,
  case when position('@' in coalesce(s.email, '')) = 0 and coalesce(s.email, '') <> '' then s.email else null end,
  s.campus_id, s.campus_name, s.professor_name,
  nullif(substring(coalesce(s.note, '') from 'topic: (.*)$'), ''),
  s.note, s.file_paths,
  'legacy:syllabus_submissions:' || coalesce(s.source, 'syllabus'),
  case when s.source = 'landing-notify' then 'notify_exam' when s.source = 'two_set_ask' then 'save_progress' else 'syllabus' end,
  case when position('@' in coalesce(s.email, '')) > 0 then 'email' else 'phone' end,
  s.created_at, 'syllabus_submissions', s.id::text
from public.syllabus_submissions s
where not exists (select 1 from public.campus_waitlist w where w.legacy_table = 'syllabus_submissions' and w.legacy_id = s.id::text);

--    (b) outreach_waitlist_signups → kind outreach_page. The LIVE table is the older shape
--        (id, name, email, course, need_help_with, school_id) — no phone/campus/files.
insert into public.campus_waitlist (name, email, course_text, course_code, note, source, kind, channel, created_at, legacy_table, legacy_id)
select
  o.name, o.email, o.course, o.course, o.need_help_with,
  'legacy:outreach_waitlist_signups' || case when o.school_id is not null then ':school=' || o.school_id::text else '' end,
  'outreach_page', 'email', o.created_at, 'outreach_waitlist_signups', o.id::text
from public.outreach_waitlist_signups o
where o.email is not null
  and not exists (select 1 from public.campus_waitlist w where w.legacy_table = 'outreach_waitlist_signups' and w.legacy_id = o.id::text);

--    (c) Backfill kind/channel/exam on pre-existing campus_waitlist rows from their source tag.
update public.campus_waitlist set
  kind = 'notify_exam',
  channel = case when email is not null and phone is not null then 'both' when phone is not null then 'phone' else 'email' end,
  exam = coalesce(exam, nullif(substring(coalesce(source, '') from '_exam(\d+)$'), '')::int)
where kind is null;

-- Retired tables stay in place READ-ONLY for audit; no app code writes them after this ships.
