-- 0118 — allow entitlements.source = 'greek_seat'.
--
-- THE BUG THIS FIXES, and how it was found.
--
-- Phase 2b's assignSeat writes an entitlement with source 'greek_seat' (and greek_chapter_id, which
-- 0116 did add). But entitlements carries a CHECK constraint on `source`, and 0116 never extended
-- it. Probing the live table shows the permitted set is exactly:
--
--     order, admin, promo
--
-- so every seat grant fails with 23514 entitlements_source_check. The whole chapter-seat path is
-- dead against the live schema, and nobody noticed because there were no accounts to grant to and
-- no chapter had ever paid — the code was written and merged against a table it could not write to.
--
-- assignSeat DOES return the error rather than swallowing it, so this surfaces as a visible failure
-- in the dashboard rather than a seat that silently does nothing. That is the one piece of luck
-- here; the fix is still the constraint.
--
-- WHY A NEW VALUE RATHER THAN REUSING 'admin':
-- unassign deletes on (greek_chapter_id, source = 'greek_seat'). That pair is what stops a chapter
-- from revoking a grant it did not pay for — a student's own purchase, or a comp Lee handed out.
-- Folding chapter seats into 'admin' would make those indistinguishable and put someone else's
-- access one click away from deletion.
--
-- Idempotent: safe to re-run.

BEGIN;

ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_source_check;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_source_check
  CHECK (source IN ('order', 'admin', 'promo', 'greek_seat'));

COMMIT;

-- VERIFY (expects one row, with 'greek_seat' present in the definition):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.entitlements'::regclass AND conname = 'entitlements_source_check';
