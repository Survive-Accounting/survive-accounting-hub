-- 0107_dedupe_intro1.sql — archive the DUPLICATE "Intro 1" course row (non-destructive, guarded).
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- Two active courses display as "Intro 1", so the Studio Topics pane rendered it twice. The app
-- already de-dups (prefers the course_family='intro_1' row), but the stray row should be archived
-- so nothing else trips on it. This ONLY sets status='archived' (reversible; no rows deleted) and
-- REFUSES to touch a duplicate whose chapters are referenced by any map / entitlement (only the
-- reference tables that exist are checked, so it runs whether or not 0104/0105/0106 are applied) —
-- if it finds one, it raises and changes NOTHING, so real content/access can never be stranded.
--
-- After it runs, read the Supabase "Messages" tab for a NOTICE naming what was archived (or "none").

do $$
declare
  keep_id uuid;
  dup     record;
  ref_cnt int;
  did     int := 0;
  clauses text[];
  q       text;
begin
  -- KEEP = the canonical Intro-1 course (the one the maps + outline use): course_family='intro_1'.
  select id into keep_id
    from public.courses
   where status = 'active' and course_family = 'intro_1'
   order by id
   limit 1;
  if keep_id is null then
    raise exception 'HALT (0107): no active course_family=''intro_1'' row found — cannot identify the canonical Intro 1. Nothing changed.';
  end if;

  -- Every OTHER active course that displays as "Intro 1" (by name, else code).
  for dup in
    select id, course_name, course_family, code
      from public.courses
     where status = 'active'
       and id <> keep_id
       and lower(trim(coalesce(course_name, code, ''))) = 'intro 1'
  loop
    -- Is any of this duplicate's chapters referenced by a campus exam map, the default map, or a
    -- topic entitlement? If so it is NOT an unused stray — halt for manual review. Only the
    -- reference tables that ACTUALLY EXIST are checked (0104/0105/0106 are manual-apply and may not
    -- all be applied yet), built as dynamic SQL so a missing table is skipped, not a parse error.
    -- (order_chapters is intentionally NOT checked: it stores a free-text chapter_label, not a
    -- chapters.id FK, so an order can never pin a specific chapter row.)
    clauses := array[]::text[];
    if to_regclass('public.campus_exam_topics') is not null then
      clauses := array_append(clauses, 'exists (select 1 from public.campus_exam_topics t where t.chapter_id = ch.id)');
    end if;
    if to_regclass('public.default_exam_units') is not null then
      clauses := array_append(clauses, 'exists (select 1 from public.default_exam_units d where d.unit_id = ch.id)');
    end if;
    if to_regclass('public.entitlements') is not null then
      clauses := array_append(clauses, 'exists (select 1 from public.entitlements e where e.scope = ''topic'' and e.scope_id = ch.id)');
    end if;

    if array_length(clauses, 1) is null then
      ref_cnt := 0;   -- none of the reference tables exist yet → nothing can strand a chapter
    else
      q := 'select count(*) from public.chapters ch where ch.course_id = $1 and ('
           || array_to_string(clauses, ' or ') || ')';
      execute q into ref_cnt using dup.id;
    end if;
    if ref_cnt > 0 then
      raise exception 'HALT (0107): duplicate "Intro 1" course % has % chapter(s) referenced by maps/entitlements — not safe to auto-archive. Review manually. Nothing changed.', dup.id, ref_cnt;
    end if;

    update public.courses set status = 'archived' where id = dup.id;
    did := did + 1;
    raise notice '0107: archived duplicate Intro 1 course % (family=%, name=%).', dup.id, coalesce(dup.course_family, '∅'), coalesce(dup.course_name, dup.code, '∅');
  end loop;

  if did = 0 then
    raise notice '0107: no duplicate "Intro 1" course to archive (already clean). Kept %.', keep_id;
  end if;
end $$;
