-- Editable per-campus outreach priority — the order the sending schedule works campuses in.
-- Founder batch order is Lee's call (Ole Miss first, then the Florida cluster), NOT seats/market
-- rank, so it lives as its own editable number rather than reusing growth_campus_priority.rank
-- (which is the global market rank the tranche auto-assigner reads). Lower = sent first; NULL sorts
-- last, alphabetical within a tie. Idempotent — safe to re-run.
alter table public.campuses
  add column if not exists outreach_priority integer;
comment on column public.campuses.outreach_priority is
  'Editable outreach send-order (lower = first). NULL sorts last. Distinct from growth_campus_priority.rank (global market rank).';

-- Seed Lee's founder-8 in order. Two rows exist for UCF (a known duplicate) — seed both so the
-- order holds whichever the founder tranche points at.
update public.campuses set outreach_priority = 1 where id = '7b92a320-b196-43f2-a241-77a0805816fe'; -- University of Mississippi
update public.campuses set outreach_priority = 2 where id = '698dd98f-dd92-46c1-8f28-e930568cb15d'; -- Louisiana State University
update public.campuses set outreach_priority = 3 where id = '4c5126b1-3fe0-48fe-a1db-1e41d06e4642'; -- University of Florida
update public.campuses set outreach_priority = 4 where id = 'a20b5f96-7a39-4a87-8fc8-30a577bac114'; -- Florida International University
update public.campuses set outreach_priority = 5 where id = 'ae2ba2d1-a457-42b0-840d-83d83a6ad39b'; -- University of South Florida
update public.campuses set outreach_priority = 6 where id in ('9fc579bc-bed2-4e8b-9c89-0958f7edda42', '044c2f7d-7367-4634-8fb2-477920113a56'); -- University of Central Florida (+ dup row)
update public.campuses set outreach_priority = 7 where id = '42c3eddd-939e-48ae-ba21-2d04bdadb84e'; -- Florida Atlantic University
update public.campuses set outreach_priority = 8 where id = 'f88bae89-d063-4a50-9351-f473303841c8'; -- Florida Gulf Coast University
