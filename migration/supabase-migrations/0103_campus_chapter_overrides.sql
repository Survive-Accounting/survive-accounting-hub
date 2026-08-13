-- 0103_campus_chapter_overrides.sql — sparse per-campus topic order + chapter number [Prompt 3]
-- MANUAL-APPLY: paste into the Supabase SQL editor (project unvxagsledbsdoremqeb). Idempotent.
--
-- SPARSE by design: a row exists ONLY where a campus differs from the course default. With 946
-- campuses × 59 chapters this is never a full matrix — most campuses have zero rows and inherit
-- chapters.chapter_number / order verbatim. Both fields are independent + nullable: a campus can
-- override just the number (their textbook calls it "Ch 13"), just the order, or both.

create table if not exists public.campus_chapter_overrides (
  campus_id    uuid not null references public.campuses(id) on delete cascade,
  chapter_id   uuid not null references public.chapters(id) on delete cascade,
  local_number numeric,                     -- this campus's chapter number (null → course default)
  local_order  numeric,                     -- this campus's display order   (null → course default)
  updated_at   timestamptz not null default now(),
  primary key (campus_id, chapter_id)
);
create index if not exists cco_chapter_idx on public.campus_chapter_overrides(chapter_id);

alter table public.campus_chapter_overrides enable row level security;

-- READ open to anon + authenticated (the student shell renders a campus's order/number; not
-- sensitive, mirrors "anon read chapters"). WRITES have no policy → service-role only.
drop policy if exists "anon read cco" on public.campus_chapter_overrides;
create policy "anon read cco" on public.campus_chapter_overrides for select to anon using (true);
drop policy if exists "auth read cco" on public.campus_chapter_overrides;
create policy "auth read cco" on public.campus_chapter_overrides for select to authenticated using (true);
