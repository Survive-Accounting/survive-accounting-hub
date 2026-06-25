-- 0027_real_ole_miss_chapters.sql
-- Replace the GENERIC placeholder chapters that 0026 seeded for ACCY 201 with Lee's REAL
-- Ole Miss chapter map across four courses (recovered from the old leeingram app's
-- CourseExplorerSection.tsx). Reuses the existing courses/chapters tables — no new system.
--
-- SELF-CONTAINED: produces the correct end state whether or not 0026 was applied. It
-- (re)adds je_scenarios.chapter_id, seeds the four courses + real chapters, repoints the
-- four 0021 seed scenarios, and re-asserts the merch-sale UI flags. Every statement is
-- idempotent; safe to re-run. Depends only on 0002 (courses/chapters) and 0021 (scenarios).
--
-- Approach note: rather than delete+reinsert (which would orphan je_scenarios.chapter_id),
-- we RENAME the placeholder chapter rows in place to the real chapters (matched by
-- course+number) and repoint the two scenarios whose chapter number changed. Net result:
-- exactly the real chapters, with no orphaned references.

-- ---------------------------------------------------------------------------
-- 1. Ensure the link column(s) exist (works even if 0026 never ran)
-- ---------------------------------------------------------------------------
alter table public.je_scenarios
  add column if not exists chapter_id uuid references public.chapters(id) on delete set null;
alter table public.je_scenarios
  add column if not exists chapter_topic_id uuid references public.chapter_topics(id) on delete set null;
create index if not exists je_scenarios_chapter_id_idx on public.je_scenarios (chapter_id);

-- ---------------------------------------------------------------------------
-- 2. The four real courses (reuse courses; match on slug). Update names if the course
--    already exists (e.g. 0026 created accy-201 as "Principles of Accounting I"); insert
--    the rest. We don't overwrite description on update (avoid clobbering outreach data).
-- ---------------------------------------------------------------------------
update public.courses c
set code = v.code, course_name = v.course_name
from (values
  ('accy-201', 'ACCY 201', 'Intro Accounting 1'),
  ('accy-202', 'ACCY 202', 'Intro Accounting 2'),
  ('accy-303', 'ACCY 303', 'Intermediate Accounting 1'),
  ('accy-304', 'ACCY 304', 'Intermediate Accounting 2')
) as v(slug, code, course_name)
where c.slug = v.slug;

insert into public.courses (code, course_name, slug, description)
select v.code, v.course_name, v.slug, v.descr
from (values
  ('accy-201', 'ACCY 201', 'Intro Accounting 1', 'Intro 1'),
  ('accy-202', 'ACCY 202', 'Intro Accounting 2', 'Intro 2'),
  ('accy-303', 'ACCY 303', 'Intermediate Accounting 1', 'IA1'),
  ('accy-304', 'ACCY 304', 'Intermediate Accounting 2', 'IA2')
) as v(slug, code, course_name, descr)
where not exists (select 1 from public.courses c where c.slug = v.slug);

-- ---------------------------------------------------------------------------
-- 3. The real chapters. Listed once in a session temp table, then upserted by
--    (course, number): rename existing rows (converts 0026 placeholders in place),
--    insert any missing. Numbering is PRESERVED exactly (Intro 2 starts at 12; IA2 at 13).
-- ---------------------------------------------------------------------------
drop table if exists _real_chapters;
create temporary table _real_chapters (slug text, num numeric, name text);
insert into _real_chapters (slug, num, name) values
  -- ACCY 201 — Intro Accounting 1
  ('accy-201', 1,  'Accounting in Business'),
  ('accy-201', 2,  'Journalizing Transactions'),
  ('accy-201', 3,  'Adjusting Entries'),
  ('accy-201', 4,  'Merchandising'),
  ('accy-201', 5,  'FIFO/LIFO'),
  ('accy-201', 6,  'Cash & Internal Controls'),
  ('accy-201', 7,  'Receivables'),
  ('accy-201', 8,  'Long Term Assets'),
  ('accy-201', 9,  'Current Liabilities'),
  ('accy-201', 10, 'Long Term Liabilities'),
  ('accy-201', 11, 'Equity'),
  -- ACCY 202 — Intro Accounting 2 (starts at 12)
  ('accy-202', 12, 'Cash Flow Statements'),
  ('accy-202', 13, 'Financial Statement Analysis'),
  ('accy-202', 14, 'Managerial Accounting Concepts'),
  ('accy-202', 15, 'Job Order Costing'),
  ('accy-202', 16, 'Process Costing'),
  ('accy-202', 17, 'Activity Based Costing'),
  ('accy-202', 18, 'Cost Volume Profit'),
  ('accy-202', 19, 'Variable Costing'),
  ('accy-202', 20, 'Master Budgets'),
  ('accy-202', 21, 'Standard Costing'),
  ('accy-202', 22, 'Performance Measures'),
  ('accy-202', 23, 'Relevant Costing'),
  ('accy-202', 24, 'Capital Budgeting'),
  -- ACCY 303 — Intermediate Accounting 1
  ('accy-303', 1,  'The Conceptual Framework'),
  ('accy-303', 2,  'The Accounting System'),
  ('accy-303', 3,  'The Income Statement'),
  ('accy-303', 4,  'The Balance Sheet'),
  ('accy-303', 5,  'Time Value of Money'),
  ('accy-303', 6,  'Cash & Receivables'),
  ('accy-303', 7,  'Inventories Cost Approach'),
  ('accy-303', 8,  'Inventories Additional Issues'),
  ('accy-303', 9,  'Property Plant and Equipment'),
  ('accy-303', 10, 'Depreciation Impairments and Depletion'),
  ('accy-303', 11, 'Intangible Assets'),
  ('accy-303', 12, 'Current Liabilities'),
  -- ACCY 304 — Intermediate Accounting 2 (starts at 13)
  ('accy-304', 13, 'Long Term Liabilities'),
  ('accy-304', 14, 'Stockholder''s Equity'),
  ('accy-304', 15, 'Dilutive Securities and EPS'),
  ('accy-304', 16, 'Investments'),
  ('accy-304', 17, 'Revenue Recognition'),
  ('accy-304', 18, 'Income Taxes'),
  ('accy-304', 19, 'Pensions'),
  ('accy-304', 20, 'Leases'),
  ('accy-304', 21, 'Accounting Changes'),
  ('accy-304', 22, 'Statement of Cash Flows');

-- rename existing (course, number) rows to the real name (converts placeholders in place)
update public.chapters ch
set chapter_name = r.name
from _real_chapters r
join public.courses co on co.slug = r.slug
where ch.course_id = co.id
  and ch.chapter_number = r.num
  and ch.chapter_name is distinct from r.name;

-- insert any (course, number) that doesn't exist yet
insert into public.chapters (course_id, chapter_number, chapter_name)
select co.id, r.num, r.name
from _real_chapters r
join public.courses co on co.slug = r.slug
where not exists (
  select 1 from public.chapters ch where ch.course_id = co.id and ch.chapter_number = r.num
);

drop table if exists _real_chapters;

-- ---------------------------------------------------------------------------
-- 4. Repoint the four 0021 seed scenarios to the correct REAL chapters
--    unearned-revenue + depreciation -> ACCY 201 Ch 3 (Adjusting Entries)
--    merch-sale                      -> ACCY 201 Ch 4 (Merchandising)
--    sell-equipment-cash             -> ACCY 201 Ch 8 (Long Term Assets)
-- ---------------------------------------------------------------------------
update public.je_scenarios s
set chapter_id = ch.id
from public.chapters ch
join public.courses co on co.id = ch.course_id
cross join (values
  ('adjust-unearned-revenue', 3::numeric),
  ('adjust-depreciation',     3::numeric),
  ('merch-sale',              4::numeric),
  ('sell-equipment-cash',     8::numeric)
) as m(slug, num)
where co.slug = 'accy-201'
  and ch.chapter_number = m.num
  and s.slug = m.slug;

-- ---------------------------------------------------------------------------
-- 5. Re-assert the v2 UI flags on merch-sale (idempotent; covers the case where 0026
--    was never applied so the flags were never set).
-- ---------------------------------------------------------------------------
update public.je_scenarios
set doc = jsonb_set(
            jsonb_set(
              jsonb_set(doc, '{isSequence}', 'true'::jsonb, true),
              '{sequenceGroup}', '"merchandising-cycle"'::jsonb, true
            ),
            '{hasMemorizationGrid}', 'true'::jsonb, true
          )
where slug = 'merch-sale';

-- ---------------------------------------------------------------------------
-- 6. Safety net: delete any leftover ACCY 201 placeholder chapter that step 3 did NOT
--    rename (e.g. a placeholder at a number outside 1-11) AND that no scenario references.
--    With the real 201 map covering 1-11, step 3 renames every 0026 placeholder, so this
--    normally deletes nothing — it just guarantees no placeholder name survives.
-- ---------------------------------------------------------------------------
delete from public.chapters ch
using public.courses co
where ch.course_id = co.id
  and co.slug = 'accy-201'
  and ch.chapter_name in (
    'Accounting in Action',
    'The Recording Process',
    'Adjusting the Accounts',
    'Completing the Accounting Cycle',
    'Accounting for Merchandising Operations',
    'Inventories',
    'Plant Assets, Natural Resources, and Intangibles'
  )
  and not exists (select 1 from public.je_scenarios s where s.chapter_id = ch.id);
