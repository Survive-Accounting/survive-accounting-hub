-- ADMIN USAGE TELEMETRY (parts 1–2) — evidence for simplifying admin surfaces.
-- Local-first from the app; these tables are the durable, cross-session store the
-- "Copy activity log prompt" reads for the 7d/30d ranges. Deny-by-default RLS: only
-- the service role writes/reads (all access is through server fns). Idempotent.

create table if not exists public.admin_usage_events (
  id            text primary key,               -- client-minted (idempotent upsert key)
  session_id    text not null,
  user_id       uuid,                            -- Lee / King (nullable — never merge across users)
  surface       text not null,                   -- 'study-canvas' | 'growth'
  element_id    text not null,                   -- stable, from a data attribute (survives restyling)
  element_label text,
  event_type    text not null,                   -- 'interaction' | 'impression' | 'rage_click'
  screen_region text,
  parent_panel  text,
  occurred_at   timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists admin_usage_events_surface_time on public.admin_usage_events (surface, occurred_at);
create index if not exists admin_usage_events_session on public.admin_usage_events (session_id);
create index if not exists admin_usage_events_element on public.admin_usage_events (surface, element_id);

create table if not exists public.admin_usage_sessions (
  id          text primary key,                  -- session_id
  user_id     uuid,
  surface     text not null,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  active_ms   bigint not null default 0,
  note        text,                              -- optional tag ("filming set 12")
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists admin_usage_sessions_surface on public.admin_usage_sessions (surface, started_at);

alter table public.admin_usage_events   enable row level security;
alter table public.admin_usage_sessions enable row level security;
-- no policies => anon/auth denied; the service role bypasses RLS (server-fn only).
