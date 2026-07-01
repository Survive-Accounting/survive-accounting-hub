-- 0042_order_flow_copy.sql — editable copy for the /order "Custom Study Pack
-- request" flow. Singleton row (id=1) holding a jsonb map of copy-key -> string
-- overrides. Read + written server-side (service-role) only. Additive. After 0041.

create table if not exists public.order_flow_copy (
  id         int primary key default 1 check (id = 1),
  copy       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.order_flow_copy (id, copy) values (1, '{}'::jsonb)
  on conflict (id) do nothing;

alter table public.order_flow_copy enable row level security;
-- deny-by-default: all access goes through the service-role server fns.

notify pgrst, 'reload schema';
