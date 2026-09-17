-- 20260917_1200 — VIDEO ARCHIVE LABELS: course / kind / chapter / textbook ref / order for the legacy library.
--
-- WHY: public.video_archive (0062) holds ~1,300 legacy Vimeo→Mux videos with a title, a duration and a
-- transcript — and nothing that says which course they belong to, whether they work a textbook item or
-- review a chapter, or what order they go in. To sell the archive as an organized course library the rows
-- need those labels. An AI pass (src/lib/video-archive-labels.functions.ts) fills them from title +
-- transcript with label_source = 'ai'; Lee corrects rows in /outreach/video-archive, which stamps
-- label_source = 'lee' and the AI pass never touches those again.
--
-- ADDITIVE ONLY. Nothing student-facing reads these columns yet.
--
-- NOTE on course_family: the column ALREADY EXISTS on video_archive (0062, plain nullable text, filled by
-- the assign-to-scenario dropdown from courses.course_family, which also carries values like 'foundations').
-- It is therefore NOT given a check constraint here — a check would reject the scenario path and could fail
-- on existing rows. The four library values ('intro_1','intro_2','intermediate_1','intermediate_2') are
-- enforced in code (zod) for the labeler and the admin editor. kind and label_source ARE checked.
--
-- Apply by hand in the Supabase SQL editor. Idempotent. The final SELECT must list 10 column names.

begin;

alter table public.video_archive add column if not exists course_family     text;
alter table public.video_archive add column if not exists kind              text
  check (kind in ('homework', 'review', 'cram'));
alter table public.video_archive add column if not exists chapter_number    integer
  check (chapter_number is null or chapter_number between 1 and 40);
-- textbook item the video works, e.g. 'E5.4', 'QS 12-12', 'P22.1B' — null for lectures / reviews / cram runs
alter table public.video_archive add column if not exists source_ref        text
  check (source_ref is null or char_length(source_ref) <= 40);
-- order inside its (course_family, kind, chapter_number) playlist
alter table public.video_archive add column if not exists position          integer;
-- optional explicit playlist grouping when the course/kind/chapter triple is not enough
alter table public.video_archive add column if not exists playlist_key      text
  check (playlist_key is null or char_length(playlist_key) <= 120);
alter table public.video_archive add column if not exists label_source      text
  check (label_source in ('ai', 'lee'));
alter table public.video_archive add column if not exists label_confidence  numeric
  check (label_confidence is null or (label_confidence >= 0 and label_confidence <= 1));
alter table public.video_archive add column if not exists label_note        text;
alter table public.video_archive add column if not exists labeled_at        timestamptz;

create index if not exists video_archive_labels_idx
  on public.video_archive (course_family, kind, chapter_number);

comment on column public.video_archive.kind is
  'homework = works a specific textbook item (see source_ref); cram = short exam-focused topic run; review = lecture-style / chapter review.';
comment on column public.video_archive.label_source is
  'ai = filled by labelArchiveBatch, may be overwritten by a later AI pass only if still ai; lee = hand-set in /outreach/video-archive, never overwritten by AI.';

commit;

-- Proof: expect 10 rows.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'video_archive'
  and column_name in ('course_family','kind','chapter_number','source_ref','position','playlist_key',
                      'label_source','label_confidence','label_note','labeled_at')
order by column_name;
