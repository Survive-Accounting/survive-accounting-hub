-- 0114_referrals.sql — the /expand referral page (unlisted, emailed to tutoring alumni + past users).
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- TWO tables, both deny-by-default (service-role server fns only — nothing here is anon-writable):
--   referrals      — the Tier-3 fallback form. ONE freeform text box, deliberately UNSTRUCTURED:
--                    "My little brother's roommate is in Sig Ep at Auburn" is a valid lead. Do NOT
--                    add name/campus/chapter columns — parsing is Lee's job, not the form's.
--   expand_events  — the page's REAL conversion metric: copy-message clicks (which card), not form
--                    submits. One row per click; no PII, no session id, nothing to join on.
create table if not exists public.referrals (
  id             uuid primary key default gen_random_uuid(),
  submitted_at   timestamptz not null default now(),
  raw_text       text not null,   -- the whole lead, exactly as the referrer typed it
  referrer_email text,            -- optional: only if they're open to Lee following up
  ok_to_name     boolean not null default false  -- may Lee open with "<name> passed along your info"?
);
create index if not exists referrals_submitted_idx on public.referrals(submitted_at desc);

alter table public.referrals enable row level security;
-- No public policies: only the service-role submitReferral server fn writes.

create table if not exists public.expand_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event      text not null    -- copy_student | copy_greek | sms_student | sms_greek | play_video
);
create index if not exists expand_events_created_idx on public.expand_events(created_at desc);

alter table public.expand_events enable row level security;
-- No public policies: only the service-role logExpandEvent server fn writes.

notify pgrst, 'reload schema';

-- Counts by card, once forwards start landing:
--   select event, count(*) from public.expand_events group by 1 order by 2 desc;
--   select submitted_at, ok_to_name, referrer_email, raw_text from public.referrals order by 1 desc;
