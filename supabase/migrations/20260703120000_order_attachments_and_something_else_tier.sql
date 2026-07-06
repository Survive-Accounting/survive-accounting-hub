-- Order request flow: student file uploads + a third "Request something else" option.
--
-- 1) attachments_json — student-uploaded supporting files (syllabus screenshots,
--    homework PDFs, etc.) recorded on the order as an array of
--    { name, path, size }. Files live in the private `student-syllabi` bucket
--    under `order-requests/<session>/...`; admin signs each path to view.
-- 2) Widen orders_tier_check to allow tier='something_else' — the de-emphasized
--    "Request something else" option in /order (no upfront price; Lee reviews).
--
-- Both changes are additive: a new column with a default, and a widened
-- allowed-values list. No existing rows are modified. Applied live via the
-- Management API on 2026-07-03.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS attachments_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_tier_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_tier_check
  CHECK (tier = ANY (ARRAY['free_teaser'::text, 'made_to_order'::text, 'one_on_one'::text, 'something_else'::text]));
