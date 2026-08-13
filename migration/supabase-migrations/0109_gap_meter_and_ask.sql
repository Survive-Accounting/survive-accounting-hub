-- 0109_gap_meter_and_ask.sql — gap-meter coverage % (per campus exam) + submission provenance.
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
-- Apply AFTER 0108 (it extends syllabus_submissions).

-- GAP METER: a manually-set "we cover ~N% of this exam" per campus exam (default 80). NOT computed —
-- we don't know the true denominator, so this is an honest editable estimate the mapper controls.
alter table public.campus_exams add column if not exists coverage_pct int not null default 80;

-- SUBMISSION PROVENANCE: the free-flow email asks (syllabus modal + the "two sets down" inline card)
-- both land in syllabus_submissions. Record which ask it came from + the professor if one was picked.
alter table public.syllabus_submissions add column if not exists professor_name text;
alter table public.syllabus_submissions add column if not exists source text; -- 'syllabus_modal' | 'two_set_ask'

notify pgrst, 'reload schema';
