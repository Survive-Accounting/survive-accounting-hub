-- SITE CHAT (2026-09-13, King's idea, Lee: "build this"). The floating Lee button opens a
-- Messenger-style conversation instead of a text message. Additive only.
--
-- Visitors never touch these tables directly: every read and write goes through service-role
-- server functions (lib/site-chat.functions.ts), which check the visitor's own id. RLS is on with
-- no policies, so the anon key can read nothing.
--
-- AUTO-REPLIES WITHOUT A CRON: a reply is inserted at once with deliver_at = now() + its delay.
-- The visitor only ever sees messages whose deliver_at has passed (and a "typing" hint shortly
-- before one lands); the admin inbox sees them as scheduled. A human reply cancels any auto-reply
-- still waiting.

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null,
  nickname text null,
  campus text null,
  page text null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz null,
  last_visitor_at timestamptz null,
  last_admin_at timestamptz null,
  admin_read_at timestamptz null,
  visitor_read_at timestamptz null,
  is_test boolean not null default false
);
create index if not exists chat_conversations_visitor_idx on public.chat_conversations (visitor_id, created_at desc);
create index if not exists chat_conversations_recent_idx on public.chat_conversations (last_message_at desc nulls last);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender text not null check (sender in ('visitor', 'admin', 'auto')),
  body text not null,
  created_at timestamptz not null default now(),
  deliver_at timestamptz not null default now(),
  auto_rule_id uuid null,
  admin_email text null
);
create index if not exists chat_messages_conversation_idx on public.chat_messages (conversation_id, deliver_at);

create table if not exists public.chat_auto_replies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  trigger text not null check (trigger in ('first_message', 'keyword', 'no_reply')),
  keywords text[] not null default '{}',
  body text not null,
  delay_seconds integer not null default 45 check (delay_seconds >= 0 and delay_seconds <= 86400),
  enabled boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_auto_replies enable row level security;
