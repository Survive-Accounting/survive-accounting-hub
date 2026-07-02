-- 0046_order_special_instructions.sql
-- Additive: a free-text "special instructions" field captured on the /order
-- confirmation step (distinct from special_requests, which the post-submit
-- tracker uses). Nullable, RLS unchanged (orders stays deny-by-default).
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS special_instructions text;
