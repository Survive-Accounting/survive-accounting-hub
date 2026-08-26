-- GROWTH V2 — remove test/deprecated data that was polluting the dashboard (2026-08-26).
--
-- Authorised by Lee. DESTRUCTIVE — review before running. Rows from real strangers are
-- deliberately KEPT (one order from maxellis22@gmail.com, one waitlist row from a real
-- visitor); everything below is either an internal test address, the Test Chapter fixture,
-- or a phantom row written by the legacy manual-log page.
--
-- The dashboard also filters these predicates at query time (isTestRow in growth-testdata.ts),
-- so the numbers are honest whether or not this has been run.
begin;

-- 1) Phantom outreach events. The legacy /admin/growth/outreach page writes
--    status='sent' rows with NO message_id — nothing was ever sent. They inflated the
--    daily counter (4/100). V2 counts only rows with a provider message_id.
delete from public.growth_outreach_events
 where message_id is null
   and email is null
   and subject is null;

-- 2) Test waitlist signups (internal addresses + the Test Chapter fixtures + a null-email row).
delete from public.campus_waitlist
 where is_test = true
    or email ilike '%@testchapter.example'
    or email ilike 'lee+%'
    or email in ('lee@survivestudios.com', 'lee@surviveaccounting.com')
    or email is null;

-- 3) The Test Chapter claim fixture (the chapter + Test University rows are left alone —
--    test mode still needs them).
delete from public.greek_chapter_claims
 where email ilike '%@testchapter.example';

-- 4) Practice attempts explicitly flagged as test.
delete from public.practice_attempts where is_test = true;

-- 5) Deprecated special-order rows placed from internal addresses. The made_to_order flow
--    is retired; V2 models revenue as chapter seats + individual exam purchases + (later)
--    the $150 semester pass. maxellis22@gmail.com is a real inbound lead and is KEPT.
delete from public.orders
 where email ilike 'lee+%'
    or email in ('lee@survivestudios.com', 'lee@surviveaccounting.com');

commit;

-- 6) FOLLOW-UP (same day): the first pass left test-ignore@surviveaccounting.com behind —
--    it is neither a plus-tag nor a "test@" prefix. Our own domains are internal by
--    definition, so the predicate (and this delete) now cover them wholesale.
begin;
delete from public.campus_waitlist
 where email ilike '%@surviveaccounting.com'
    or email ilike '%@survivestudios.com'
    or email ilike 'test-%';
commit;
