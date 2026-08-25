-- Greek Academic Intelligence — add constructive per-chapter context labels to the
-- derived metrics aggregate. Internal, non-shaming labels for Growth/King context:
-- LARGE MEMBER BASE | STRONG ACADEMIC CULTURE | HIGH ACADEMIC OPPORTUNITY |
-- DECLINING TREND | IMPROVING TREND | UNKNOWN. Never a public GPA ranking.

begin;

alter table public.greek_chapter_academic_metrics
  add column if not exists academic_context_labels text[] not null default '{}';

select count(*) as metrics_rows,
       (select count(*) from information_schema.columns
          where table_schema='public' and table_name='greek_chapter_academic_metrics'
            and column_name='academic_context_labels') as label_col_added
from public.greek_chapter_academic_metrics;

commit;
