-- 0041_orders_quote_mode.sql — pre-order = a QUOTE by chapter count. The specifics
-- (textbook, exact chapter names, syllabus, special requests) move to the
-- post-order "Track Your Order" conversation (built separately). Additive,
-- nullable columns on public.orders. After 0040. Idempotent.

alter table public.orders add column if not exists chapter_count_only   int;
alter table public.orders add column if not exists syllabus_url          text;
alter table public.orders add column if not exists interested_in_group   boolean not null default false;
alter table public.orders add column if not exists group_size            int;
alter table public.orders add column if not exists awaiting_syllabus     boolean not null default true;

notify pgrst, 'reload schema';
