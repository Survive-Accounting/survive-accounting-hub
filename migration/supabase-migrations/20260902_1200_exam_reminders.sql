-- EXAM REMINDERS — "text me before my exam" from the public homepage.
--
-- WHY ITS OWN TABLE, when the number also ends up in sms_conversations: consent here covers ONE
-- message about ONE exam. These numbers must never find their way onto an outreach or marketing
-- list, and the way to guarantee that is for them to live somewhere no marketing query looks,
-- rather than in a shared contacts table behind a flag somebody can forget to check.
--
-- WHAT ACTUALLY SENDS IT: nothing new. The message is queued into sms_outbox with a future
-- send_at, and the existing every-minute sms-process-outbox worker drains it. That worker already
-- re-reads the conversation at SEND time and cancels the row when the conversation is not
-- 'active', so a STOP received after enrolment stops a reminder queued days earlier — which is
-- the property that makes this legal to ship. Do not reimplement sending here.
--
-- A2P/TCPA: consent_at and consent_text are the record of what the student agreed to, stored
-- verbatim as it was rendered. If the disclosure copy changes, old rows keep the old text.

create table if not exists public.exam_reminders (
  id            uuid primary key default gen_random_uuid(),
  phone_e164    text        not null,
  exam_date     date        not null,
  -- How many days BEFORE exam_date the text goes out. Clamped at write time to something still
  -- in the future, so nobody can schedule a reminder for a moment that has already passed.
  offset_days   int         not null check (offset_days between 1 and 14),
  campus_id     uuid        null,
  course_code   text        null,
  -- Attribution, carried through from the link the student arrived on.
  ref           text        null,
  consent_at    timestamptz not null default now(),
  consent_text  text        not null,
  -- The queued sms_outbox row, so a re-submit can move the existing message instead of adding a
  -- second one.
  outbox_id     uuid        null,
  status        text        not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- SAME PHONE, SAME EXAM ⇒ UPDATE, NEVER A SECOND TEXT. A student who submits twice (or corrects
-- a typo in the date) should end up with one reminder, not two.
create unique index if not exists exam_reminders_phone_exam_idx
  on public.exam_reminders (phone_e164, exam_date);

create index if not exists exam_reminders_status_idx
  on public.exam_reminders (status, exam_date);

-- SERVER-ONLY. No policies are created, so with RLS on, anon and authenticated can read and write
-- nothing; every path goes through the service role. That is deliberate for a table of phone
-- numbers collected from a public form.
alter table public.exam_reminders enable row level security;
