-- 0068_order_media.sql
-- Inbound MMS media (syllabus/textbook photos students text to the Twilio line).
-- Stored to the private `order-media` storage bucket; this table is the index.
-- order_id is nullable so media from an unrecognized number is NEVER dropped —
-- it lands unmatched and shows in the admin "Unmatched inbound" strip.

create table if not exists public.order_media (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references public.orders(id) on delete set null,
  storage_path   text not null,
  content_type   text,
  received_at    timestamptz not null default now(),
  from_phone     text
);

-- Deterministic storage_path is "{MessageSid}-{index}", so a Twilio retry of the
-- same webhook upserts instead of duplicating.
create unique index if not exists order_media_storage_path_uidx
  on public.order_media (storage_path);
create index if not exists order_media_order_id_idx on public.order_media (order_id);
create index if not exists order_media_from_phone_idx on public.order_media (from_phone);
create index if not exists order_media_unmatched_idx
  on public.order_media (received_at desc) where order_id is null;

alter table public.order_media enable row level security;
-- No policies: only the service role (edge function + admin server fns) touches it.

-- When the first syllabus image is matched to an order, stamp the order.
alter table public.orders add column if not exists syllabus_received_at timestamptz;
