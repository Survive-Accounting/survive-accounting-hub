-- GROWTH DASHBOARD V1 — transactional topic-map approval (2026-08-25).
-- The ONLY write path from Course-Intel proposals into the student-facing map layer.
-- Called via RPC from the admin-gated server function; the whole approval is one
-- transaction: validate exact Survive topic ids -> archive the level's active rows ->
-- write new campus_exams + campus_exam_topics -> upsert map_meta -> audit.
-- Never touches other campuses/professors/levels. Raises (rolls back) on any invalid input.
begin;

create or replace function public.growth_approve_map(
  p_campus_id uuid,
  p_professor_id uuid,          -- null = campus-level map
  p_course_id uuid,
  p_exams jsonb,                -- [{"name":"Exam 1","position":1,"topic_ids":["uuid",...]}, ...]
  p_textbook_id uuid,
  p_approved_by text,
  p_source jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_exam jsonb;
  v_topic_id uuid;
  v_exam_id uuid;
  v_pos int;
  v_topic_pos int;
  v_bad int;
  v_all_topics uuid[] := '{}';
  v_created uuid[] := '{}';
begin
  if p_campus_id is null then raise exception 'campus_id required'; end if;
  if p_course_id is null then raise exception 'course_id required'; end if;
  if p_exams is null or jsonb_typeof(p_exams) <> 'array' or jsonb_array_length(p_exams) = 0 then
    raise exception 'at least one exam required';
  end if;
  if coalesce(p_approved_by, '') = '' then raise exception 'approved_by required'; end if;

  -- Collect and validate EVERY topic id against the course's Survive Units. A single
  -- unknown id aborts the whole approval — no partial writes.
  for v_exam in select * from jsonb_array_elements(p_exams) loop
    if coalesce(v_exam->>'name','') = '' then raise exception 'exam name required'; end if;
    for v_topic_id in select (jsonb_array_elements_text(coalesce(v_exam->'topic_ids','[]'::jsonb)))::uuid loop
      v_all_topics := array_append(v_all_topics, v_topic_id);
    end loop;
  end loop;
  select count(*) into v_bad from unnest(v_all_topics) t(id)
    where not exists (select 1 from public.chapters ch where ch.id = t.id and ch.course_id = p_course_id);
  if v_bad > 0 then
    raise exception '% topic id(s) are not Survive Units of course %', v_bad, p_course_id;
  end if;

  -- Archive ONLY this level's active rows (campus level: professor_id is null;
  -- professor level: that professor). Starter rows (campus_id null) are untouched.
  update public.campus_exams set status = 'archived'
    where course_id = p_course_id and campus_id = p_campus_id
      and (professor_id is not distinct from p_professor_id) and status = 'active';

  v_pos := 0;
  for v_exam in select * from jsonb_array_elements(p_exams) loop
    v_pos := v_pos + 1;
    insert into public.campus_exams (campus_id, course_id, professor_id, name, position, status)
      values (p_campus_id, p_course_id, p_professor_id, v_exam->>'name',
              coalesce((v_exam->>'position')::int, v_pos), 'active')
      returning id into v_exam_id;
    v_created := array_append(v_created, v_exam_id);
    v_topic_pos := 0;
    for v_topic_id in select (jsonb_array_elements_text(coalesce(v_exam->'topic_ids','[]'::jsonb)))::uuid loop
      v_topic_pos := v_topic_pos + 1;
      insert into public.campus_exam_topics (campus_exam_id, chapter_id, position)
        values (v_exam_id, v_topic_id, v_topic_pos)
        on conflict do nothing;
    end loop;
  end loop;

  -- map_meta: one row per (course, campus, professor) level; verified + provenance.
  update public.map_meta set status = 'verified', textbook_id = p_textbook_id, updated_at = now()
    where course_id = p_course_id and campus_id = p_campus_id
      and (professor_id is not distinct from p_professor_id);
  if not found then
    insert into public.map_meta (course_id, campus_id, professor_id, status, textbook_id)
      values (p_course_id, p_campus_id, p_professor_id, 'verified', p_textbook_id);
  end if;

  insert into public.growth_map_approvals (campus_id, professor_id, campus_exam_id, action, approved_by, payload)
    values (p_campus_id, p_professor_id, v_created[1],
            case when p_professor_id is null then 'approve_campus_map' else 'approve_professor_map' end,
            p_approved_by,
            jsonb_build_object('exams', p_exams, 'textbook_id', p_textbook_id, 'source', p_source));

  return jsonb_build_object('ok', true, 'created_exam_ids', to_jsonb(v_created));
end;
$$;

-- Revert a level to inheritance (campus -> starter, professor -> campus/starter):
-- archives the level's active rows; the resolver then falls through. Audited.
create or replace function public.growth_revert_map(
  p_campus_id uuid,
  p_professor_id uuid,
  p_course_id uuid,
  p_approved_by text
) returns jsonb
language plpgsql
as $$
declare v_n int;
begin
  if p_campus_id is null then raise exception 'campus_id required'; end if;
  if coalesce(p_approved_by, '') = '' then raise exception 'approved_by required'; end if;
  update public.campus_exams set status = 'archived'
    where course_id = p_course_id and campus_id = p_campus_id
      and (professor_id is not distinct from p_professor_id) and status = 'active';
  get diagnostics v_n = row_count;
  insert into public.growth_map_approvals (campus_id, professor_id, action, approved_by, payload)
    values (p_campus_id, p_professor_id, 'keep_starter', p_approved_by, jsonb_build_object('archived', v_n));
  return jsonb_build_object('ok', true, 'archived', v_n);
end;
$$;

commit;
