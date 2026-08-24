-- Course Intel — textbook edition enrichment + chapter→topic mapping
-- =====================================================================
-- REVIEW ONLY — not yet applied to the live DB.
-- Extends the existing 0113 tables (public.textbooks, public.textbook_chapters)
-- rather than adding a parallel edition table, so map_meta.textbook_id and
-- unit_textbook_links keep pointing at ONE textbook identity.
--
-- Adds:
--   1) edition-identity columns on public.textbooks (authors, publisher,
--      edition_key unique, edition_confirmed, isbn13, toc_source_url)
--   2) public.textbook_chapter_topic_mapping — topic-granular reuse table
--      (the "map once per edition, reuse across every professor/campus" engine)
--
-- Nothing here writes rows. The seed is a separate, dry-run-by-default script
-- (scripts/course-intel/seed-textbook-mappings.mjs). All mapping rows land as
-- state='proposed' and require human approval before any live map uses them.

begin;

-- 1) Enrich public.textbooks with a stable edition identity ------------------
alter table public.textbooks add column if not exists authors text null;
alter table public.textbooks add column if not exists publisher text null;
alter table public.textbooks add column if not exists isbn13 text null;
alter table public.textbooks add column if not exists edition_key text null;   -- title|author|edition (from normalizeTextbook)
alter table public.textbooks add column if not exists edition_confirmed boolean not null default false;
alter table public.textbooks add column if not exists toc_source_url text null;
alter table public.textbooks add column if not exists updated_at timestamptz not null default now();

-- edition_key is the dedupe identity when set; keep it unique but allow NULLs
-- (legacy rows may not have one yet).
create unique index if not exists textbooks_edition_key_uidx
  on public.textbooks (edition_key) where edition_key is not null;

-- 2) Topic-granular mapping: textbook chapter → Survive canonical topic ------
--    Many Survive topics may map to one chapter; one topic may recur across
--    editions. survive_topic_id soft-links to a Survive Unit (chapters row)
--    when the label resolves; the label is always stored so the row is
--    meaningful even before/without resolution.
create table if not exists public.textbook_chapter_topic_mapping (
  id uuid primary key default gen_random_uuid(),
  textbook_id uuid not null references public.textbooks(id) on delete cascade,
  textbook_chapter_id uuid not null references public.textbook_chapters(id) on delete cascade,
  survive_topic_id uuid null references public.chapters(id) on delete set null,
  survive_topic_label text not null,                 -- canonical Survive topic name
  problem_type text null,
  confidence text not null default 'Medium',         -- High | Medium | Low
  source text null,                                  -- provenance (e.g. publisher TOC URL + author)
  reason text null,
  state text not null default 'proposed',            -- proposed | approved | rejected | superseded
  proposed_by text null,
  approved_by text null,
  approved_at timestamptz null,
  superseded_by uuid null references public.textbook_chapter_topic_mapping(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (textbook_chapter_id, survive_topic_label)
);

create index if not exists tctm_textbook_idx on public.textbook_chapter_topic_mapping (textbook_id);
create index if not exists tctm_state_idx on public.textbook_chapter_topic_mapping (state);

-- deny-by-default; service-role only (matches 0113 tables). Admin UI reads via
-- server functions using the service-role client.
alter table public.textbook_chapter_topic_mapping enable row level security;

commit;
