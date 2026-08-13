-- 0082_retire_accy_201.sql
-- Retire the legacy ACCY 201 course — a per-campus duplicate of the canonical INTRO1
-- row (course_family = 'intro_1', id 1111…). It carried 4 legacy je_scenarios, 11
-- chapters, and 1 campus_courses link. This migration deletes the 4 scenarios, repoints
-- the campus_courses row to INTRO1 (preserving its local code/name/active flag), drops
-- the 11 chapters, and deletes the course row.
--
-- Guarded + transactional: a DO block runs in one implicit transaction, and every
-- count-assert RAISEs EXCEPTION on drift, rolling the whole thing back. Idempotent:
-- this was applied to the live DB out-of-band on 2026-07-09 (service-role REST, since
-- the Management-API PAT is blocked/exposed), so on a fresh run the accy-201 lookup
-- returns null and the block no-ops. Depends on the canonical INTRO1 course existing.

do $$
declare
  v_accy      uuid;
  v_intro1    uuid := '11111111-1111-1111-1111-111111111111';
  v_chapters  int;
  v_scenarios int;
  v_campus    int;
  v_affected  int;
begin
  select id into v_accy from public.courses where slug = 'accy-201';
  if v_accy is null then
    raise notice 'accy-201 already retired — nothing to do.';
    return;
  end if;

  -- canonical repoint target must exist
  if not exists (select 1 from public.courses where id = v_intro1) then
    raise exception 'ABORT: INTRO1 canonical course % not found', v_intro1;
  end if;

  -- ---- pre-count asserts (abort → rollback before any write) ----
  select count(*) into v_chapters from public.chapters where course_id = v_accy;
  if v_chapters <> 11 then raise exception 'ABORT: expected 11 accy chapters, found %', v_chapters; end if;

  select count(*) into v_scenarios
    from public.je_scenarios s
    join public.chapters c on c.id = s.chapter_id
   where c.course_id = v_accy;
  if v_scenarios <> 4 then raise exception 'ABORT: expected 4 accy scenarios, found %', v_scenarios; end if;

  select count(*) into v_campus from public.campus_courses where course_id = v_accy;
  if v_campus <> 1 then raise exception 'ABORT: expected 1 campus_courses row, found %', v_campus; end if;

  -- ---- execute (FK-safe order) ----
  -- a. delete the 4 legacy scenarios
  delete from public.je_scenarios s
    using public.chapters c
   where s.chapter_id = c.id and c.course_id = v_accy;
  get diagnostics v_affected = row_count;
  if v_affected <> 4 then raise exception 'ABORT: deleted % scenarios, expected 4', v_affected; end if;

  -- b. repoint the campus_courses link to INTRO1 (do not delete it)
  update public.campus_courses set course_id = v_intro1 where course_id = v_accy;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'ABORT: repointed % campus_courses rows, expected 1', v_affected; end if;

  -- c. delete the 11 chapters (now unreferenced)
  delete from public.chapters where course_id = v_accy;
  get diagnostics v_affected = row_count;
  if v_affected <> 11 then raise exception 'ABORT: deleted % chapters, expected 11', v_affected; end if;

  -- d. delete the course row (now unreferenced)
  delete from public.courses where id = v_accy;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'ABORT: deleted % course rows, expected 1', v_affected; end if;

  raise notice 'accy-201 retired: 4 scenarios + 11 chapters + 1 course deleted; 1 campus_courses repointed to INTRO1.';
end $$;
