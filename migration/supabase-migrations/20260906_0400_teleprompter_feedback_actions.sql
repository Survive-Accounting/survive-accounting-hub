-- TELEPROMPTER FEEDBACK ACTIONS (2026-09-06, third rehearsal pass). Lee, on the review:
-- "I think cleaned up version of 'what you said' then Suggested improvement. I pick either or
-- write mine in." So the one-line review's actions ('approved' / 'revised') retire, and the
-- three the new review logs are which card he took: 'said' (his own words, cleaned),
-- 'suggested' (the improvement), 'edited' (he typed his own). The 1-5 rating and the comment
-- are gone from the review too — the columns stay, nullable, nothing writes them now.
--
-- FOR A DATABASE THAT ALREADY RAN 20260906_0100 with the old CHECK. That file is also edited
-- in place to allow both generations, so a database that has NOT run it yet gets the wide
-- constraint straight away and this file is a harmless no-op there (the DO block re-creates
-- the same constraint).
--
-- Drops by DISCOVERED name (docs/SESSION-CONTEXT.md §2), never a guessed one.
begin;

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.teleprompter_feedback'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%action%'
  loop
    execute format('alter table public.teleprompter_feedback drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.teleprompter_feedback
  add constraint teleprompter_feedback_action_ck
  check (action in ('said', 'suggested', 'edited', 'approved', 'revised'));

commit;

-- Proof: the one action check on the table, and it names the new values.
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.teleprompter_feedback'::regclass and contype = 'c'
  and pg_get_constraintdef(oid) ilike '%suggested%';
