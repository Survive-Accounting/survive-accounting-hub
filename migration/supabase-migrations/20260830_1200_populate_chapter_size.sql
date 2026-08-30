-- Populate campus_greek_chapters.chapter_size from the greek academic reports
-- (greek_chapter_academics.member_count). Picks the MOST RECENT semester per chapter:
-- latest year, then latest term (winter>fall>summer>spring), coalescing member_count
-- with active_member_count. Idempotent — safe to re-run as new reports land.
update public.campus_greek_chapters c
set chapter_size = sub.mc
from (
  select distinct on (campus_greek_chapter_id)
         campus_greek_chapter_id,
         coalesce(member_count, active_member_count) as mc
  from public.greek_chapter_academics
  where campus_greek_chapter_id is not null
    and coalesce(member_count, active_member_count) is not null
  order by campus_greek_chapter_id,
           nullif(split_part(semester_key, '_', 2), '')::int desc nulls last,
           case split_part(semester_key, '_', 1)
             when 'winter' then 4 when 'fall' then 3 when 'summer' then 2 when 'spring' then 1 else 0 end desc
) sub
where c.id = sub.campus_greek_chapter_id
  and sub.mc is not null;
