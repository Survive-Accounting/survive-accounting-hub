-- 0118 — allow entitlements.source = 'greek_seat'.
--
-- THE BUG: Phase 2b's assignSeat writes an entitlement with source 'greek_seat' (and
-- greek_chapter_id, which 0116 did add). entitlements carries a CHECK on `source` that 0116 never
-- extended. Probing the live table shows the permitted set is exactly:
--
--     order, admin, promo
--
-- so every seat grant fails 23514. The chapter-seat path is dead against the live schema, and
-- nothing caught it because there are no accounts yet and no chapter has paid.
--
-- WHY A NEW VALUE RATHER THAN REUSING 'admin': unassign deletes on
-- (greek_chapter_id, source = 'greek_seat'). That pair is what stops a chapter revoking a grant it
-- did not pay for — a student's own purchase, or a comp. Folding chapter seats into 'admin' would
-- make those indistinguishable.
--
-- ── V2, AFTER THE FIRST ATTEMPT DID NOT TAKE ─────────────────────────────────────────────────
--
-- The first version hard-coded the constraint name `entitlements_source_check`. If the real
-- constraint is named anything else, `DROP CONSTRAINT IF EXISTS entitlements_source_check` is a
-- silent no-op and the old rule survives — which is the most likely reason a run that looked
-- successful changed nothing.
--
-- So this version finds EVERY check constraint on the table whose definition mentions `source`,
-- drops each by its real name, and then adds ours. It also RAISES NOTICE with what it did and
-- ends with a SELECT you can read, so a run that changes nothing cannot look like a run that
-- worked. Idempotent: safe to re-run.

BEGIN;

DO $$
DECLARE
  c RECORD;
  dropped INT := 0;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.entitlements'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%source%'
  LOOP
    EXECUTE format('ALTER TABLE public.entitlements DROP CONSTRAINT %I', c.conname);
    RAISE NOTICE 'dropped constraint %', c.conname;
    dropped := dropped + 1;
  END LOOP;
  RAISE NOTICE 'dropped % source constraint(s)', dropped;
END $$;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_source_check
  CHECK (source IN ('order', 'admin', 'promo', 'greek_seat'));

COMMIT;

-- READ THIS OUTPUT. It must show greek_seat. If the row is missing or lacks greek_seat, the
-- migration did not commit and seat grants will still fail.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.entitlements'::regclass AND contype = 'c';
