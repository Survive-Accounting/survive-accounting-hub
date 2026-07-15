-- 0092_seed_start_here.sql
-- SEED START HERE (Foundations) — COA set + 27 scenario stubs + placements.
-- Gets Lee authoring immediately. Requires 0091_scenario_placements.sql applied first.
--
-- CRITICAL SPLIT — this file seeds ONLY unambiguous mechanics:
--   SEEDED: account lines (DR/CR + account), scenario titles/captions (Lee's),
--           placements, chapter structure, COA set membership.
--   NEVER WRITTEN (left EMPTY — Lee's voice): memos, labels, "why" text, traps,
--           distractors, reveal order, amounts (??? placeholders). No explanatory prose.
--
-- Idempotent; safe to re-run. Resolves everything by NATURAL KEYS (account
-- canonical_name, foundations course_family, chapter_name, scenario slug) so it
-- works against the live DB without hard-coded uuids.

-- ============================================================================
-- PART 1 — MASTER CHART: add any missing accounts (do NOT modify/remove existing).
-- Guarded by NOT EXISTS on canonical_name, so accounts that already exist are
-- left untouched (see the report for which pre-existed).
-- Income Summary: typed account_type='equity' (temporary), normal_balance='credit'
-- (the equity convention — the column is NOT NULL; Income Summary has no textbook
-- normal balance, credit chosen to match Common Stock / Retained Earnings and the
-- equation lens's equity handling). Reported to Lee.
-- ============================================================================
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
select v.name, v.type, v.nb, true
from (values
  ('Interest Receivable', 'asset', 'debit'),
  ('Wages Payable', 'liability', 'credit'),
  ('Interest Payable', 'liability', 'credit'),
  ('Income Summary', 'equity', 'credit'),
  ('Interest Revenue', 'revenue', 'credit'),
  ('Supplies Expense', 'expense', 'debit'),
  ('Depreciation Expense', 'expense', 'debit'),
  ('Interest Expense', 'expense', 'debit')
) as v(name, type, nb)
where not exists (
  select 1 from public.chart_of_accounts c where lower(c.canonical_name) = lower(v.name)
);

-- ============================================================================
-- PART 2 — FOUNDATIONS COA SET = exactly the 30 listed accounts, nothing else.
-- Master untouched; only course_coa membership is (re)built. Two steps:
--   (a) add every listed account to the set (resolve id by canonical_name),
--   (b) remove any set member NOT in the list.
-- ============================================================================
with foundations as (
  select id from public.courses where course_family = 'foundations' limit 1
),
wanted(name) as (values
  -- ASSETS
  ('Cash'),('Supplies'),('Accounts Receivable'),('Prepaid Insurance'),('Prepaid Rent'),
  ('Interest Receivable'),('Land'),('Equipment'),('Buildings'),('Machinery'),('Trucks'),
  -- CONTRA ASSET
  ('Accumulated Depreciation'),
  -- LIABILITIES
  ('Accounts Payable'),('Unearned Revenue'),('Notes Payable'),('Wages Payable'),('Interest Payable'),
  -- EQUITY
  ('Common Stock'),('Retained Earnings'),('Income Summary'),
  -- CONTRA EQUITY
  ('Dividends'),
  -- REVENUES
  ('Fees Earned'),('Interest Revenue'),
  -- EXPENSES
  ('Utilities Expense'),('Wages Expense'),('Insurance Expense'),('Rent Expense'),
  ('Supplies Expense'),('Depreciation Expense'),('Interest Expense')
)
insert into public.course_coa (course_id, account_id)
select f.id, c.id
from foundations f
cross join wanted w
join public.chart_of_accounts c on lower(c.canonical_name) = lower(w.name)
on conflict (course_id, account_id) do nothing;

-- Remove Foundations set members that are NOT in the wanted list.
delete from public.course_coa cc
using public.courses co
where cc.course_id = co.id
  and co.course_family = 'foundations'
  and not exists (
    select 1 from public.chart_of_accounts c
    join (values
      ('Cash'),('Supplies'),('Accounts Receivable'),('Prepaid Insurance'),('Prepaid Rent'),
      ('Interest Receivable'),('Land'),('Equipment'),('Buildings'),('Machinery'),('Trucks'),
      ('Accumulated Depreciation'),
      ('Accounts Payable'),('Unearned Revenue'),('Notes Payable'),('Wages Payable'),('Interest Payable'),
      ('Common Stock'),('Retained Earnings'),('Income Summary'),
      ('Dividends'),
      ('Fees Earned'),('Interest Revenue'),
      ('Utilities Expense'),('Wages Expense'),('Insurance Expense'),('Rent Expense'),
      ('Supplies Expense'),('Depreciation Expense'),('Interest Expense')
    ) as w(name) on lower(c.canonical_name) = lower(w.name)
    where c.id = cc.account_id
  );

-- ============================================================================
-- PART 3 — CHAPTERS: insert "Important Principles" as Ch 9; Course Wrap-up
-- becomes Ch 10. Preserve Ch 1-8 as-is. Collision-safe: bump Wrap-up (currently
-- Ch 9) to 10 FIRST (frees 9), then insert Important Principles at 9.
-- ============================================================================
update public.chapters
set chapter_number = 10
where course_id = (select id from public.courses where course_family = 'foundations')
  and chapter_name = 'Course Wrap-up';

insert into public.chapters (course_id, chapter_number, chapter_name, subtitle, status, je_only_mode, target_lessons, topics_locked)
select (select id from public.courses where course_family = 'foundations'), 9, 'Important Principles', null, 'active', false, 0, false
where not exists (
  select 1 from public.chapters
  where course_id = (select id from public.courses where course_family = 'foundations')
    and chapter_name = 'Important Principles'
);

-- ============================================================================
-- PART 4 — SEED 27 SCENARIOS (status active, source authored). Doc carries the
-- mechanical lines only; memos/labels/traps/amounts are EMPTY (Lee authors from
-- the canvas). Idempotent by slug. A helper builds the minimal ScenarioDoc.
-- ----------------------------------------------------------------------------
-- Line shape (matches src/lib/je-engine ScenarioDoc + library.jeLinesFrom):
--   { "id": "l1", "account": "Cash", "side": "debit" }   -- no amount/label/trap
-- ============================================================================
create or replace function pg_temp.seed_scenario(p_slug text, p_title text, p_lines jsonb)
returns void language plpgsql as $$
begin
  insert into public.je_scenarios (slug, title, doc, status, source)
  select p_slug, p_title,
    jsonb_build_object(
      'slug', p_slug,
      'title', p_title,
      'event', p_title,
      'axes', '[]'::jsonb,
      'variants', jsonb_build_array(jsonb_build_object(
        'id', 'base', 'conditions', '{}'::jsonb,
        'entries', jsonb_build_array(jsonb_build_object(
          'id', 'e1', 'caption', p_title, 'lines', p_lines
        ))
      ))
    ),
    'active', 'authored'
  where not exists (select 1 from public.je_scenarios where slug = p_slug);
end $$;

-- helper to build a debit/credit line
create or replace function pg_temp.ln(p_id text, p_account text, p_side text)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'account', p_account, 'side', p_side);
$$;

select pg_temp.seed_scenario('sh-01-owner-invests-cash', 'Owner invests cash for common stock',
  jsonb_build_array(pg_temp.ln('l1','Cash','debit'), pg_temp.ln('l2','Common Stock','credit')));
select pg_temp.seed_scenario('sh-02-buy-supplies-cash', 'Purchasing supplies by paying cash',
  jsonb_build_array(pg_temp.ln('l1','Supplies','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-03-buy-supplies-credit', 'Purchasing supplies on credit',
  jsonb_build_array(pg_temp.ln('l1','Supplies','debit'), pg_temp.ln('l2','Accounts Payable','credit')));
select pg_temp.seed_scenario('sh-04-pay-ap-for-supplies', 'Paying cash for supplies purchased on credit',
  jsonb_build_array(pg_temp.ln('l1','Accounts Payable','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-05-receive-cash-services', 'Receiving cash for services performed',
  jsonb_build_array(pg_temp.ln('l1','Cash','debit'), pg_temp.ln('l2','Fees Earned','credit')));
select pg_temp.seed_scenario('sh-06-services-on-credit', 'Performing services on credit',
  jsonb_build_array(pg_temp.ln('l1','Accounts Receivable','debit'), pg_temp.ln('l2','Fees Earned','credit')));
select pg_temp.seed_scenario('sh-07-collect-ar', 'Receiving cash for services performed on credit',
  jsonb_build_array(pg_temp.ln('l1','Cash','debit'), pg_temp.ln('l2','Accounts Receivable','credit')));
select pg_temp.seed_scenario('sh-08-receive-unearned', 'Receiving cash upfront for services we''ll perform later',
  jsonb_build_array(pg_temp.ln('l1','Cash','debit'), pg_temp.ln('l2','Unearned Revenue','credit')));
select pg_temp.seed_scenario('sh-09-earn-unearned', 'Performing the services we received cash upfront for',
  jsonb_build_array(pg_temp.ln('l1','Unearned Revenue','debit'), pg_temp.ln('l2','Fees Earned','credit')));
select pg_temp.seed_scenario('sh-10-pay-prepaid-insurance', 'Paying cash for prepaid insurance',
  jsonb_build_array(pg_temp.ln('l1','Prepaid Insurance','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-11-expire-insurance', 'Recording expense for expired insurance',
  jsonb_build_array(pg_temp.ln('l1','Insurance Expense','debit'), pg_temp.ln('l2','Prepaid Insurance','credit')));
select pg_temp.seed_scenario('sh-12-pay-prepaid-rent', 'Paying cash for prepaid rent',
  jsonb_build_array(pg_temp.ln('l1','Prepaid Rent','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-13-rent-used', 'Recording expense for rent used',
  jsonb_build_array(pg_temp.ln('l1','Rent Expense','debit'), pg_temp.ln('l2','Prepaid Rent','credit')));
select pg_temp.seed_scenario('sh-14-pay-wages', 'Paying cash for employee wages',
  jsonb_build_array(pg_temp.ln('l1','Wages Expense','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-15-pay-utilities', 'Paying cash for utilities',
  jsonb_build_array(pg_temp.ln('l1','Utilities Expense','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-16-depreciation', 'Recording depreciation on equipment',
  jsonb_build_array(pg_temp.ln('l1','Depreciation Expense','debit'), pg_temp.ln('l2','Accumulated Depreciation','credit')));
select pg_temp.seed_scenario('sh-17-pay-dividends', 'Paying cash dividends to owners',
  jsonb_build_array(pg_temp.ln('l1','Dividends','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-18-buy-equipment-cash', 'Purchasing equipment for cash',
  jsonb_build_array(pg_temp.ln('l1','Equipment','debit'), pg_temp.ln('l2','Cash','credit')));
select pg_temp.seed_scenario('sh-19-borrow-note', 'Borrowing cash by signing a note payable',
  jsonb_build_array(pg_temp.ln('l1','Cash','debit'), pg_temp.ln('l2','Notes Payable','credit')));

-- ADJUSTING-ONLY (20-23)
select pg_temp.seed_scenario('sh-20-adjust-supplies', 'Adjusting supplies used',
  jsonb_build_array(pg_temp.ln('l1','Supplies Expense','debit'), pg_temp.ln('l2','Supplies','credit')));
select pg_temp.seed_scenario('sh-21-accrue-wages', 'Accruing wages expense',
  jsonb_build_array(pg_temp.ln('l1','Wages Expense','debit'), pg_temp.ln('l2','Wages Payable','credit')));
select pg_temp.seed_scenario('sh-22-accrue-interest-revenue', 'Accruing interest revenue',
  jsonb_build_array(pg_temp.ln('l1','Interest Receivable','debit'), pg_temp.ln('l2','Interest Revenue','credit')));
select pg_temp.seed_scenario('sh-23-accrue-interest-expense', 'Accruing interest expense',
  jsonb_build_array(pg_temp.ln('l1','Interest Expense','debit'), pg_temp.ln('l2','Interest Payable','credit')));

-- CLOSING (24-27)
select pg_temp.seed_scenario('sh-24-close-revenues', 'Closing revenues',
  jsonb_build_array(pg_temp.ln('l1','Fees Earned','debit'), pg_temp.ln('l2','Interest Revenue','debit'), pg_temp.ln('l3','Income Summary','credit')));
select pg_temp.seed_scenario('sh-25-close-expenses', 'Closing expenses',
  jsonb_build_array(
    pg_temp.ln('l1','Income Summary','debit'),
    pg_temp.ln('l2','Utilities Expense','credit'), pg_temp.ln('l3','Wages Expense','credit'),
    pg_temp.ln('l4','Insurance Expense','credit'), pg_temp.ln('l5','Rent Expense','credit'),
    pg_temp.ln('l6','Supplies Expense','credit'), pg_temp.ln('l7','Depreciation Expense','credit'),
    pg_temp.ln('l8','Interest Expense','credit')));
select pg_temp.seed_scenario('sh-26-close-income-summary', 'Closing income summary',
  jsonb_build_array(pg_temp.ln('l1','Income Summary','debit'), pg_temp.ln('l2','Retained Earnings','credit')));
select pg_temp.seed_scenario('sh-27-close-dividends', 'Closing dividends',
  jsonb_build_array(pg_temp.ln('l1','Retained Earnings','debit'), pg_temp.ln('l2','Dividends','credit')));

-- ============================================================================
-- PART 5 — PLACEMENTS (0091 join). Resolve scenario by slug, chapter by
-- (foundations, chapter_name), course = foundations. sort_order = the listed order.
-- Idempotent on (scenario_id, chapter_id).
-- ============================================================================
create or replace function pg_temp.place(p_slug text, p_chapter_name text, p_sort int)
returns void language plpgsql as $$
declare v_course uuid; v_chapter uuid; v_scenario uuid;
begin
  select id into v_course from public.courses where course_family = 'foundations' limit 1;
  select id into v_chapter from public.chapters where course_id = v_course and chapter_name = p_chapter_name limit 1;
  select id into v_scenario from public.je_scenarios where slug = p_slug limit 1;
  if v_course is null or v_chapter is null or v_scenario is null then return; end if;
  insert into public.scenario_placements (scenario_id, course_id, chapter_id, sort_order)
  values (v_scenario, v_course, v_chapter, p_sort)
  on conflict (scenario_id, chapter_id) do update set sort_order = excluded.sort_order;
end $$;

-- Ch 1 (What is Accounting & A = L + E): scenarios 1-19, order as listed
select pg_temp.place('sh-01-owner-invests-cash','What is Accounting & A = L + E',1);
select pg_temp.place('sh-02-buy-supplies-cash','What is Accounting & A = L + E',2);
select pg_temp.place('sh-03-buy-supplies-credit','What is Accounting & A = L + E',3);
select pg_temp.place('sh-04-pay-ap-for-supplies','What is Accounting & A = L + E',4);
select pg_temp.place('sh-05-receive-cash-services','What is Accounting & A = L + E',5);
select pg_temp.place('sh-06-services-on-credit','What is Accounting & A = L + E',6);
select pg_temp.place('sh-07-collect-ar','What is Accounting & A = L + E',7);
select pg_temp.place('sh-08-receive-unearned','What is Accounting & A = L + E',8);
select pg_temp.place('sh-09-earn-unearned','What is Accounting & A = L + E',9);
select pg_temp.place('sh-10-pay-prepaid-insurance','What is Accounting & A = L + E',10);
select pg_temp.place('sh-11-expire-insurance','What is Accounting & A = L + E',11);
select pg_temp.place('sh-12-pay-prepaid-rent','What is Accounting & A = L + E',12);
select pg_temp.place('sh-13-rent-used','What is Accounting & A = L + E',13);
select pg_temp.place('sh-14-pay-wages','What is Accounting & A = L + E',14);
select pg_temp.place('sh-15-pay-utilities','What is Accounting & A = L + E',15);
select pg_temp.place('sh-16-depreciation','What is Accounting & A = L + E',16);
select pg_temp.place('sh-17-pay-dividends','What is Accounting & A = L + E',17);
select pg_temp.place('sh-18-buy-equipment-cash','What is Accounting & A = L + E',18);
select pg_temp.place('sh-19-borrow-note','What is Accounting & A = L + E',19);

-- Ch 4 (Journal Entries): scenarios 1-19, same order
select pg_temp.place('sh-01-owner-invests-cash','Journal Entries',1);
select pg_temp.place('sh-02-buy-supplies-cash','Journal Entries',2);
select pg_temp.place('sh-03-buy-supplies-credit','Journal Entries',3);
select pg_temp.place('sh-04-pay-ap-for-supplies','Journal Entries',4);
select pg_temp.place('sh-05-receive-cash-services','Journal Entries',5);
select pg_temp.place('sh-06-services-on-credit','Journal Entries',6);
select pg_temp.place('sh-07-collect-ar','Journal Entries',7);
select pg_temp.place('sh-08-receive-unearned','Journal Entries',8);
select pg_temp.place('sh-09-earn-unearned','Journal Entries',9);
select pg_temp.place('sh-10-pay-prepaid-insurance','Journal Entries',10);
select pg_temp.place('sh-11-expire-insurance','Journal Entries',11);
select pg_temp.place('sh-12-pay-prepaid-rent','Journal Entries',12);
select pg_temp.place('sh-13-rent-used','Journal Entries',13);
select pg_temp.place('sh-14-pay-wages','Journal Entries',14);
select pg_temp.place('sh-15-pay-utilities','Journal Entries',15);
select pg_temp.place('sh-16-depreciation','Journal Entries',16);
select pg_temp.place('sh-17-pay-dividends','Journal Entries',17);
select pg_temp.place('sh-18-buy-equipment-cash','Journal Entries',18);
select pg_temp.place('sh-19-borrow-note','Journal Entries',19);

-- Ch 5 (Receivables, Payables & Posting): 3, 4, 6, 7
select pg_temp.place('sh-03-buy-supplies-credit','Receivables, Payables & Posting',1);
select pg_temp.place('sh-04-pay-ap-for-supplies','Receivables, Payables & Posting',2);
select pg_temp.place('sh-06-services-on-credit','Receivables, Payables & Posting',3);
select pg_temp.place('sh-07-collect-ar','Receivables, Payables & Posting',4);

-- Ch 6 (Trial Balances & Adjusting Entries): 11, 13, 9, 16, 20, 21, 22, 23
select pg_temp.place('sh-11-expire-insurance','Trial Balances & Adjusting Entries',1);
select pg_temp.place('sh-13-rent-used','Trial Balances & Adjusting Entries',2);
select pg_temp.place('sh-09-earn-unearned','Trial Balances & Adjusting Entries',3);
select pg_temp.place('sh-16-depreciation','Trial Balances & Adjusting Entries',4);
select pg_temp.place('sh-20-adjust-supplies','Trial Balances & Adjusting Entries',5);
select pg_temp.place('sh-21-accrue-wages','Trial Balances & Adjusting Entries',6);
select pg_temp.place('sh-22-accrue-interest-revenue','Trial Balances & Adjusting Entries',7);
select pg_temp.place('sh-23-accrue-interest-expense','Trial Balances & Adjusting Entries',8);

-- Ch 8 (Closing Entries): 24-27
select pg_temp.place('sh-24-close-revenues','Closing Entries',1);
select pg_temp.place('sh-25-close-expenses','Closing Entries',2);
select pg_temp.place('sh-26-close-income-summary','Closing Entries',3);
select pg_temp.place('sh-27-close-dividends','Closing Entries',4);
-- Chapters 2, 3, 7, 9, 10 get no scenario placements.
