-- 0069_orders_is_waitlist.sql
-- Fall 2026 waitlist reframe: the slimmed /order intake now captures waitlist
-- signups (campus / course / professor / interests) rather than paid orders.
-- New rows default to is_waitlist = true so the existing server-side insert keeps
-- working before any app change; flip individual rows to false once a student
-- converts to a real paying order.
alter table public.orders
  add column if not exists is_waitlist boolean not null default true;

-- Existing pre-waitlist orders were real requests, not waitlist signups.
update public.orders set is_waitlist = false where created_at < '2026-07-13';

comment on column public.orders.is_waitlist is
  'True = Fall 2026 waitlist signup from the slimmed /order intake; false = converted/paying order.';
