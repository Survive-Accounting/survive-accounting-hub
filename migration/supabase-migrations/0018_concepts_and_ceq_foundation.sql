-- 0018: Concept-centric CEQ schema — concepts spine, mappings, structured
-- teaching blocks, dictation sessions, chart-of-accounts seed.

create table if not exists public.concepts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  parent_id uuid references public.concepts(id) on delete set null,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.concept_mappings (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references public.concepts(id) on delete cascade,
  entity_type text not null check (entity_type in ('chapter','teaching_asset','ceq','teaching_block','tutoring_note','dictation_segment')),
  entity_id uuid not null,
  role text not null default 'primary' check (role in ('primary','secondary')),
  created_at timestamptz not null default now(),
  unique (concept_id, entity_type, entity_id)
);
create index if not exists concept_mappings_entity_idx on public.concept_mappings(entity_type, entity_id);

-- Structured payload for teaching blocks (JE lines, formula lines, etc.)
alter table public.ceq_teaching_blocks add column if not exists payload jsonb;

-- Marathon dictation: one session per run, one segment per resource talked through.
create table if not exists public.ceq_dictation_sessions (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.chapters(id) on delete cascade,
  status text not null default 'recording',  -- recording | processing | harvested
  audio_url text,
  transcript text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create table if not exists public.ceq_dictation_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.ceq_dictation_sessions(id) on delete cascade,
  resource_type text,            -- teaching_asset | tutoring_note | teaching_block | free
  resource_id uuid,
  transcript text,
  start_seconds numeric,
  end_seconds numeric,
  skipped boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.concepts enable row level security;
alter table public.concept_mappings enable row level security;
alter table public.ceq_dictation_sessions enable row level security;
alter table public.ceq_dictation_segments enable row level security;
create policy "anon all concepts" on public.concepts for all to anon using (true) with check (true);
create policy "anon all concept_mappings" on public.concept_mappings for all to anon using (true) with check (true);
create policy "anon all ceq_dictation_sessions" on public.ceq_dictation_sessions for all to anon using (true) with check (true);
create policy "anon all ceq_dictation_segments" on public.ceq_dictation_segments for all to anon using (true) with check (true);
create policy "auth all concepts" on public.concepts for all to authenticated using (true) with check (true);
create policy "auth all concept_mappings" on public.concept_mappings for all to authenticated using (true) with check (true);
create policy "auth all ceq_dictation_sessions" on public.ceq_dictation_sessions for all to authenticated using (true) with check (true);
create policy "auth all ceq_dictation_segments" on public.ceq_dictation_segments for all to authenticated using (true) with check (true);
grant all on public.concepts, public.concept_mappings, public.ceq_dictation_sessions, public.ceq_dictation_segments to anon, authenticated;

-- ============ Concept spine (Lee-editable draft) ============
insert into public.concepts (slug, name, sort_order) select 'accounting-equation', 'The Accounting Equation', 10 where not exists (select 1 from public.concepts where slug = 'accounting-equation');
insert into public.concepts (slug, name, sort_order) select 'accounting-cycle', 'The Accounting Cycle', 20 where not exists (select 1 from public.concepts where slug = 'accounting-cycle');
insert into public.concepts (slug, name, parent_id, sort_order) select 'journalizing', 'Journalizing & Debits/Credits', (select id from public.concepts where slug = 'accounting-cycle'), 1 where not exists (select 1 from public.concepts where slug = 'journalizing');
insert into public.concepts (slug, name, parent_id, sort_order) select 'posting-ledger', 'Posting & the Ledger', (select id from public.concepts where slug = 'accounting-cycle'), 2 where not exists (select 1 from public.concepts where slug = 'posting-ledger');
insert into public.concepts (slug, name, parent_id, sort_order) select 'trial-balance', 'Trial Balance', (select id from public.concepts where slug = 'accounting-cycle'), 3 where not exists (select 1 from public.concepts where slug = 'trial-balance');
insert into public.concepts (slug, name, parent_id, sort_order) select 'closing-entries', 'Closing Entries', (select id from public.concepts where slug = 'accounting-cycle'), 4 where not exists (select 1 from public.concepts where slug = 'closing-entries');
insert into public.concepts (slug, name, sort_order) select 'adjusting-entries', 'Adjusting Entries', 30 where not exists (select 1 from public.concepts where slug = 'adjusting-entries');
insert into public.concepts (slug, name, parent_id, sort_order) select 'accruals', 'Accruals', (select id from public.concepts where slug = 'adjusting-entries'), 1 where not exists (select 1 from public.concepts where slug = 'accruals');
insert into public.concepts (slug, name, parent_id, sort_order) select 'deferrals', 'Deferrals & Prepaids', (select id from public.concepts where slug = 'adjusting-entries'), 2 where not exists (select 1 from public.concepts where slug = 'deferrals');
insert into public.concepts (slug, name, parent_id, sort_order) select 'depreciation-adjustment', 'Depreciation Adjustments', (select id from public.concepts where slug = 'adjusting-entries'), 3 where not exists (select 1 from public.concepts where slug = 'depreciation-adjustment');
insert into public.concepts (slug, name, sort_order) select 'financial-statements', 'Financial Statements', 40 where not exists (select 1 from public.concepts where slug = 'financial-statements');
insert into public.concepts (slug, name, parent_id, sort_order) select 'income-statement', 'Income Statement', (select id from public.concepts where slug = 'financial-statements'), 1 where not exists (select 1 from public.concepts where slug = 'income-statement');
insert into public.concepts (slug, name, parent_id, sort_order) select 'balance-sheet', 'Balance Sheet', (select id from public.concepts where slug = 'financial-statements'), 2 where not exists (select 1 from public.concepts where slug = 'balance-sheet');
insert into public.concepts (slug, name, parent_id, sort_order) select 'retained-earnings-statement', 'Statement of Retained Earnings', (select id from public.concepts where slug = 'financial-statements'), 3 where not exists (select 1 from public.concepts where slug = 'retained-earnings-statement');
insert into public.concepts (slug, name, parent_id, sort_order) select 'statement-presentation', 'Presentation & Classification', (select id from public.concepts where slug = 'financial-statements'), 4 where not exists (select 1 from public.concepts where slug = 'statement-presentation');
insert into public.concepts (slug, name, sort_order) select 'conceptual-framework', 'Conceptual Framework', 50 where not exists (select 1 from public.concepts where slug = 'conceptual-framework');
insert into public.concepts (slug, name, parent_id, sort_order) select 'qualitative-characteristics', 'Qualitative Characteristics', (select id from public.concepts where slug = 'conceptual-framework'), 1 where not exists (select 1 from public.concepts where slug = 'qualitative-characteristics');
insert into public.concepts (slug, name, parent_id, sort_order) select 'recognition-measurement', 'Recognition & Measurement', (select id from public.concepts where slug = 'conceptual-framework'), 2 where not exists (select 1 from public.concepts where slug = 'recognition-measurement');
insert into public.concepts (slug, name, sort_order) select 'merchandising', 'Merchandising Operations', 60 where not exists (select 1 from public.concepts where slug = 'merchandising');
insert into public.concepts (slug, name, parent_id, sort_order) select 'perpetual-periodic', 'Perpetual vs Periodic', (select id from public.concepts where slug = 'merchandising'), 1 where not exists (select 1 from public.concepts where slug = 'perpetual-periodic');
insert into public.concepts (slug, name, parent_id, sort_order) select 'gross-profit', 'Gross Profit & Net Sales', (select id from public.concepts where slug = 'merchandising'), 2 where not exists (select 1 from public.concepts where slug = 'gross-profit');
insert into public.concepts (slug, name, sort_order) select 'inventory', 'Inventory', 70 where not exists (select 1 from public.concepts where slug = 'inventory');
insert into public.concepts (slug, name, parent_id, sort_order) select 'fifo-lifo', 'FIFO / LIFO', (select id from public.concepts where slug = 'inventory'), 1 where not exists (select 1 from public.concepts where slug = 'fifo-lifo');
insert into public.concepts (slug, name, parent_id, sort_order) select 'weighted-average-inventory', 'Weighted Average', (select id from public.concepts where slug = 'inventory'), 2 where not exists (select 1 from public.concepts where slug = 'weighted-average-inventory');
insert into public.concepts (slug, name, parent_id, sort_order) select 'lcnrv', 'Lower of Cost or NRV', (select id from public.concepts where slug = 'inventory'), 3 where not exists (select 1 from public.concepts where slug = 'lcnrv');
insert into public.concepts (slug, name, parent_id, sort_order) select 'inventory-errors', 'Inventory Errors', (select id from public.concepts where slug = 'inventory'), 4 where not exists (select 1 from public.concepts where slug = 'inventory-errors');
insert into public.concepts (slug, name, parent_id, sort_order) select 'dollar-value-lifo', 'Dollar-Value LIFO', (select id from public.concepts where slug = 'inventory'), 5 where not exists (select 1 from public.concepts where slug = 'dollar-value-lifo');
insert into public.concepts (slug, name, parent_id, sort_order) select 'retail-gross-profit-methods', 'Retail & Gross Profit Methods', (select id from public.concepts where slug = 'inventory'), 6 where not exists (select 1 from public.concepts where slug = 'retail-gross-profit-methods');
insert into public.concepts (slug, name, sort_order) select 'internal-controls', 'Cash & Internal Controls', 80 where not exists (select 1 from public.concepts where slug = 'internal-controls');
insert into public.concepts (slug, name, parent_id, sort_order) select 'bank-reconciliation', 'Bank Reconciliation', (select id from public.concepts where slug = 'internal-controls'), 1 where not exists (select 1 from public.concepts where slug = 'bank-reconciliation');
insert into public.concepts (slug, name, parent_id, sort_order) select 'petty-cash', 'Petty Cash', (select id from public.concepts where slug = 'internal-controls'), 2 where not exists (select 1 from public.concepts where slug = 'petty-cash');
insert into public.concepts (slug, name, sort_order) select 'receivables', 'Receivables', 90 where not exists (select 1 from public.concepts where slug = 'receivables');
insert into public.concepts (slug, name, parent_id, sort_order) select 'allowance-method', 'Allowance Method & Bad Debts', (select id from public.concepts where slug = 'receivables'), 1 where not exists (select 1 from public.concepts where slug = 'allowance-method');
insert into public.concepts (slug, name, parent_id, sort_order) select 'notes-receivable', 'Notes Receivable', (select id from public.concepts where slug = 'receivables'), 2 where not exists (select 1 from public.concepts where slug = 'notes-receivable');
insert into public.concepts (slug, name, parent_id, sort_order) select 'receivables-financing', 'Factoring & Pledging', (select id from public.concepts where slug = 'receivables'), 3 where not exists (select 1 from public.concepts where slug = 'receivables-financing');
insert into public.concepts (slug, name, sort_order) select 'time-value-of-money', 'Time Value of Money', 100 where not exists (select 1 from public.concepts where slug = 'time-value-of-money');
insert into public.concepts (slug, name, parent_id, sort_order) select 'present-future-value', 'Present & Future Value', (select id from public.concepts where slug = 'time-value-of-money'), 1 where not exists (select 1 from public.concepts where slug = 'present-future-value');
insert into public.concepts (slug, name, parent_id, sort_order) select 'annuities', 'Annuities', (select id from public.concepts where slug = 'time-value-of-money'), 2 where not exists (select 1 from public.concepts where slug = 'annuities');
insert into public.concepts (slug, name, sort_order) select 'ppe', 'Property, Plant & Equipment', 110 where not exists (select 1 from public.concepts where slug = 'ppe');
insert into public.concepts (slug, name, parent_id, sort_order) select 'acquisition-cost', 'Acquisition Cost', (select id from public.concepts where slug = 'ppe'), 1 where not exists (select 1 from public.concepts where slug = 'acquisition-cost');
insert into public.concepts (slug, name, parent_id, sort_order) select 'capitalize-vs-expense', 'Capitalize vs Expense', (select id from public.concepts where slug = 'ppe'), 2 where not exists (select 1 from public.concepts where slug = 'capitalize-vs-expense');
insert into public.concepts (slug, name, parent_id, sort_order) select 'disposals-exchanges', 'Disposals & Exchanges', (select id from public.concepts where slug = 'ppe'), 3 where not exists (select 1 from public.concepts where slug = 'disposals-exchanges');
insert into public.concepts (slug, name, sort_order) select 'depreciation', 'Depreciation', 120 where not exists (select 1 from public.concepts where slug = 'depreciation');
insert into public.concepts (slug, name, parent_id, sort_order) select 'depreciation-methods', 'Methods (SL, DDB, Units)', (select id from public.concepts where slug = 'depreciation'), 1 where not exists (select 1 from public.concepts where slug = 'depreciation-methods');
insert into public.concepts (slug, name, parent_id, sort_order) select 'partial-year', 'Partial-Year Depreciation', (select id from public.concepts where slug = 'depreciation'), 2 where not exists (select 1 from public.concepts where slug = 'partial-year');
insert into public.concepts (slug, name, parent_id, sort_order) select 'estimate-revisions', 'Revisions of Estimates', (select id from public.concepts where slug = 'depreciation'), 3 where not exists (select 1 from public.concepts where slug = 'estimate-revisions');
insert into public.concepts (slug, name, sort_order) select 'impairments-depletion', 'Impairments & Depletion', 130 where not exists (select 1 from public.concepts where slug = 'impairments-depletion');
insert into public.concepts (slug, name, sort_order) select 'intangibles', 'Intangible Assets', 140 where not exists (select 1 from public.concepts where slug = 'intangibles');
insert into public.concepts (slug, name, parent_id, sort_order) select 'goodwill', 'Goodwill', (select id from public.concepts where slug = 'intangibles'), 1 where not exists (select 1 from public.concepts where slug = 'goodwill');
insert into public.concepts (slug, name, parent_id, sort_order) select 'amortization', 'Amortization', (select id from public.concepts where slug = 'intangibles'), 2 where not exists (select 1 from public.concepts where slug = 'amortization');
insert into public.concepts (slug, name, parent_id, sort_order) select 'rd-costs', 'R&D Costs', (select id from public.concepts where slug = 'intangibles'), 3 where not exists (select 1 from public.concepts where slug = 'rd-costs');
insert into public.concepts (slug, name, sort_order) select 'current-liabilities', 'Current Liabilities', 150 where not exists (select 1 from public.concepts where slug = 'current-liabilities');
insert into public.concepts (slug, name, parent_id, sort_order) select 'payroll-liabilities', 'Payroll', (select id from public.concepts where slug = 'current-liabilities'), 1 where not exists (select 1 from public.concepts where slug = 'payroll-liabilities');
insert into public.concepts (slug, name, parent_id, sort_order) select 'contingencies', 'Contingencies', (select id from public.concepts where slug = 'current-liabilities'), 2 where not exists (select 1 from public.concepts where slug = 'contingencies');
insert into public.concepts (slug, name, parent_id, sort_order) select 'short-term-notes', 'Short-Term Notes Payable', (select id from public.concepts where slug = 'current-liabilities'), 3 where not exists (select 1 from public.concepts where slug = 'short-term-notes');
insert into public.concepts (slug, name, sort_order) select 'long-term-liabilities', 'Long-Term Liabilities', 160 where not exists (select 1 from public.concepts where slug = 'long-term-liabilities');
insert into public.concepts (slug, name, parent_id, sort_order) select 'bond-issuance', 'Bond Issuance & Pricing', (select id from public.concepts where slug = 'long-term-liabilities'), 1 where not exists (select 1 from public.concepts where slug = 'bond-issuance');
insert into public.concepts (slug, name, parent_id, sort_order) select 'bond-amortization', 'Bond Amortization (Effective Interest / SL)', (select id from public.concepts where slug = 'long-term-liabilities'), 2 where not exists (select 1 from public.concepts where slug = 'bond-amortization');
insert into public.concepts (slug, name, parent_id, sort_order) select 'long-term-notes', 'Long-Term Notes', (select id from public.concepts where slug = 'long-term-liabilities'), 3 where not exists (select 1 from public.concepts where slug = 'long-term-notes');
insert into public.concepts (slug, name, parent_id, sort_order) select 'debt-retirement', 'Early Retirement of Debt', (select id from public.concepts where slug = 'long-term-liabilities'), 4 where not exists (select 1 from public.concepts where slug = 'debt-retirement');
insert into public.concepts (slug, name, sort_order) select 'stockholders-equity', 'Stockholders'' Equity', 170 where not exists (select 1 from public.concepts where slug = 'stockholders-equity');
insert into public.concepts (slug, name, parent_id, sort_order) select 'stock-issuance', 'Common & Preferred Stock Issuance', (select id from public.concepts where slug = 'stockholders-equity'), 1 where not exists (select 1 from public.concepts where slug = 'stock-issuance');
insert into public.concepts (slug, name, parent_id, sort_order) select 'treasury-stock', 'Treasury Stock', (select id from public.concepts where slug = 'stockholders-equity'), 2 where not exists (select 1 from public.concepts where slug = 'treasury-stock');
insert into public.concepts (slug, name, parent_id, sort_order) select 'dividends', 'Cash & Stock Dividends', (select id from public.concepts where slug = 'stockholders-equity'), 3 where not exists (select 1 from public.concepts where slug = 'dividends');
insert into public.concepts (slug, name, parent_id, sort_order) select 'splits', 'Stock Splits', (select id from public.concepts where slug = 'stockholders-equity'), 4 where not exists (select 1 from public.concepts where slug = 'splits');
insert into public.concepts (slug, name, sort_order) select 'eps', 'Earnings Per Share', 180 where not exists (select 1 from public.concepts where slug = 'eps');
insert into public.concepts (slug, name, parent_id, sort_order) select 'basic-eps', 'Basic EPS', (select id from public.concepts where slug = 'eps'), 1 where not exists (select 1 from public.concepts where slug = 'basic-eps');
insert into public.concepts (slug, name, parent_id, sort_order) select 'diluted-eps', 'Diluted EPS', (select id from public.concepts where slug = 'eps'), 2 where not exists (select 1 from public.concepts where slug = 'diluted-eps');
insert into public.concepts (slug, name, parent_id, sort_order) select 'dilutive-securities', 'Convertibles, Options & Warrants', (select id from public.concepts where slug = 'eps'), 3 where not exists (select 1 from public.concepts where slug = 'dilutive-securities');
insert into public.concepts (slug, name, sort_order) select 'investments', 'Investments', 190 where not exists (select 1 from public.concepts where slug = 'investments');
insert into public.concepts (slug, name, parent_id, sort_order) select 'debt-investments', 'Debt Investments (Trading/AFS/HTM)', (select id from public.concepts where slug = 'investments'), 1 where not exists (select 1 from public.concepts where slug = 'debt-investments');
insert into public.concepts (slug, name, parent_id, sort_order) select 'equity-method', 'Equity Method', (select id from public.concepts where slug = 'investments'), 2 where not exists (select 1 from public.concepts where slug = 'equity-method');
insert into public.concepts (slug, name, parent_id, sort_order) select 'fair-value-adjustments', 'Fair Value Adjustments', (select id from public.concepts where slug = 'investments'), 3 where not exists (select 1 from public.concepts where slug = 'fair-value-adjustments');
insert into public.concepts (slug, name, sort_order) select 'revenue-recognition', 'Revenue Recognition', 200 where not exists (select 1 from public.concepts where slug = 'revenue-recognition');
insert into public.concepts (slug, name, parent_id, sort_order) select 'five-step-model', 'Five-Step Model', (select id from public.concepts where slug = 'revenue-recognition'), 1 where not exists (select 1 from public.concepts where slug = 'five-step-model');
insert into public.concepts (slug, name, parent_id, sort_order) select 'performance-obligations', 'Performance Obligations', (select id from public.concepts where slug = 'revenue-recognition'), 2 where not exists (select 1 from public.concepts where slug = 'performance-obligations');
insert into public.concepts (slug, name, parent_id, sort_order) select 'long-term-contracts', 'Long-Term Contracts', (select id from public.concepts where slug = 'revenue-recognition'), 3 where not exists (select 1 from public.concepts where slug = 'long-term-contracts');
insert into public.concepts (slug, name, sort_order) select 'income-taxes', 'Income Taxes', 210 where not exists (select 1 from public.concepts where slug = 'income-taxes');
insert into public.concepts (slug, name, parent_id, sort_order) select 'deferred-taxes', 'Deferred Tax Assets & Liabilities', (select id from public.concepts where slug = 'income-taxes'), 1 where not exists (select 1 from public.concepts where slug = 'deferred-taxes');
insert into public.concepts (slug, name, parent_id, sort_order) select 'nol', 'Net Operating Losses', (select id from public.concepts where slug = 'income-taxes'), 2 where not exists (select 1 from public.concepts where slug = 'nol');
insert into public.concepts (slug, name, parent_id, sort_order) select 'valuation-allowance', 'Valuation Allowance', (select id from public.concepts where slug = 'income-taxes'), 3 where not exists (select 1 from public.concepts where slug = 'valuation-allowance');
insert into public.concepts (slug, name, sort_order) select 'pensions', 'Pensions', 220 where not exists (select 1 from public.concepts where slug = 'pensions');
insert into public.concepts (slug, name, parent_id, sort_order) select 'pension-expense', 'Pension Expense Components', (select id from public.concepts where slug = 'pensions'), 1 where not exists (select 1 from public.concepts where slug = 'pension-expense');
insert into public.concepts (slug, name, parent_id, sort_order) select 'pbo-plan-assets', 'PBO & Plan Assets', (select id from public.concepts where slug = 'pensions'), 2 where not exists (select 1 from public.concepts where slug = 'pbo-plan-assets');
insert into public.concepts (slug, name, sort_order) select 'leases', 'Leases', 230 where not exists (select 1 from public.concepts where slug = 'leases');
insert into public.concepts (slug, name, parent_id, sort_order) select 'lessee-accounting', 'Lessee (Operating vs Finance)', (select id from public.concepts where slug = 'leases'), 1 where not exists (select 1 from public.concepts where slug = 'lessee-accounting');
insert into public.concepts (slug, name, parent_id, sort_order) select 'lessor-accounting', 'Lessor Accounting', (select id from public.concepts where slug = 'leases'), 2 where not exists (select 1 from public.concepts where slug = 'lessor-accounting');
insert into public.concepts (slug, name, sort_order) select 'accounting-changes', 'Accounting Changes & Errors', 240 where not exists (select 1 from public.concepts where slug = 'accounting-changes');
insert into public.concepts (slug, name, parent_id, sort_order) select 'change-in-estimate', 'Change in Estimate', (select id from public.concepts where slug = 'accounting-changes'), 1 where not exists (select 1 from public.concepts where slug = 'change-in-estimate');
insert into public.concepts (slug, name, parent_id, sort_order) select 'change-in-principle', 'Change in Principle', (select id from public.concepts where slug = 'accounting-changes'), 2 where not exists (select 1 from public.concepts where slug = 'change-in-principle');
insert into public.concepts (slug, name, parent_id, sort_order) select 'error-correction', 'Error Correction', (select id from public.concepts where slug = 'accounting-changes'), 3 where not exists (select 1 from public.concepts where slug = 'error-correction');
insert into public.concepts (slug, name, sort_order) select 'cash-flow-statement', 'Statement of Cash Flows', 250 where not exists (select 1 from public.concepts where slug = 'cash-flow-statement');
insert into public.concepts (slug, name, parent_id, sort_order) select 'operating-indirect', 'Operating — Indirect Method', (select id from public.concepts where slug = 'cash-flow-statement'), 1 where not exists (select 1 from public.concepts where slug = 'operating-indirect');
insert into public.concepts (slug, name, parent_id, sort_order) select 'operating-direct', 'Operating — Direct Method', (select id from public.concepts where slug = 'cash-flow-statement'), 2 where not exists (select 1 from public.concepts where slug = 'operating-direct');
insert into public.concepts (slug, name, parent_id, sort_order) select 'investing-financing', 'Investing & Financing Activities', (select id from public.concepts where slug = 'cash-flow-statement'), 3 where not exists (select 1 from public.concepts where slug = 'investing-financing');
insert into public.concepts (slug, name, sort_order) select 'financial-statement-analysis', 'Financial Statement Analysis', 260 where not exists (select 1 from public.concepts where slug = 'financial-statement-analysis');
insert into public.concepts (slug, name, parent_id, sort_order) select 'liquidity-ratios', 'Liquidity Ratios', (select id from public.concepts where slug = 'financial-statement-analysis'), 1 where not exists (select 1 from public.concepts where slug = 'liquidity-ratios');
insert into public.concepts (slug, name, parent_id, sort_order) select 'profitability-ratios', 'Profitability Ratios', (select id from public.concepts where slug = 'financial-statement-analysis'), 2 where not exists (select 1 from public.concepts where slug = 'profitability-ratios');
insert into public.concepts (slug, name, parent_id, sort_order) select 'solvency-ratios', 'Solvency & Coverage Ratios', (select id from public.concepts where slug = 'financial-statement-analysis'), 3 where not exists (select 1 from public.concepts where slug = 'solvency-ratios');
insert into public.concepts (slug, name, sort_order) select 'managerial-concepts', 'Managerial Accounting Concepts', 270 where not exists (select 1 from public.concepts where slug = 'managerial-concepts');
insert into public.concepts (slug, name, parent_id, sort_order) select 'cost-classifications', 'Cost Classifications', (select id from public.concepts where slug = 'managerial-concepts'), 1 where not exists (select 1 from public.concepts where slug = 'cost-classifications');
insert into public.concepts (slug, name, parent_id, sort_order) select 'manufacturing-costs', 'Manufacturing Costs & COGM', (select id from public.concepts where slug = 'managerial-concepts'), 2 where not exists (select 1 from public.concepts where slug = 'manufacturing-costs');
insert into public.concepts (slug, name, sort_order) select 'job-order-costing', 'Job Order Costing', 280 where not exists (select 1 from public.concepts where slug = 'job-order-costing');
insert into public.concepts (slug, name, parent_id, sort_order) select 'predetermined-overhead', 'Predetermined Overhead Rate', (select id from public.concepts where slug = 'job-order-costing'), 1 where not exists (select 1 from public.concepts where slug = 'predetermined-overhead');
insert into public.concepts (slug, name, parent_id, sort_order) select 'over-under-applied', 'Over/Under-Applied Overhead', (select id from public.concepts where slug = 'job-order-costing'), 2 where not exists (select 1 from public.concepts where slug = 'over-under-applied');
insert into public.concepts (slug, name, sort_order) select 'process-costing', 'Process Costing', 290 where not exists (select 1 from public.concepts where slug = 'process-costing');
insert into public.concepts (slug, name, parent_id, sort_order) select 'equivalent-units', 'Equivalent Units', (select id from public.concepts where slug = 'process-costing'), 1 where not exists (select 1 from public.concepts where slug = 'equivalent-units');
insert into public.concepts (slug, name, sort_order) select 'abc', 'Activity-Based Costing', 300 where not exists (select 1 from public.concepts where slug = 'abc');
insert into public.concepts (slug, name, parent_id, sort_order) select 'cost-pools-drivers', 'Cost Pools & Drivers', (select id from public.concepts where slug = 'abc'), 1 where not exists (select 1 from public.concepts where slug = 'cost-pools-drivers');
insert into public.concepts (slug, name, sort_order) select 'cvp', 'Cost-Volume-Profit', 310 where not exists (select 1 from public.concepts where slug = 'cvp');
insert into public.concepts (slug, name, parent_id, sort_order) select 'contribution-margin', 'Contribution Margin', (select id from public.concepts where slug = 'cvp'), 1 where not exists (select 1 from public.concepts where slug = 'contribution-margin');
insert into public.concepts (slug, name, parent_id, sort_order) select 'breakeven', 'Break-Even Analysis', (select id from public.concepts where slug = 'cvp'), 2 where not exists (select 1 from public.concepts where slug = 'breakeven');
insert into public.concepts (slug, name, parent_id, sort_order) select 'target-profit', 'Target Profit', (select id from public.concepts where slug = 'cvp'), 3 where not exists (select 1 from public.concepts where slug = 'target-profit');
insert into public.concepts (slug, name, parent_id, sort_order) select 'margin-of-safety', 'Margin of Safety & Operating Leverage', (select id from public.concepts where slug = 'cvp'), 4 where not exists (select 1 from public.concepts where slug = 'margin-of-safety');
insert into public.concepts (slug, name, sort_order) select 'variable-costing', 'Variable vs Absorption Costing', 320 where not exists (select 1 from public.concepts where slug = 'variable-costing');
insert into public.concepts (slug, name, sort_order) select 'budgeting', 'Budgeting', 330 where not exists (select 1 from public.concepts where slug = 'budgeting');
insert into public.concepts (slug, name, parent_id, sort_order) select 'master-budget', 'Master Budget', (select id from public.concepts where slug = 'budgeting'), 1 where not exists (select 1 from public.concepts where slug = 'master-budget');
insert into public.concepts (slug, name, parent_id, sort_order) select 'cash-budget', 'Cash Budget', (select id from public.concepts where slug = 'budgeting'), 2 where not exists (select 1 from public.concepts where slug = 'cash-budget');
insert into public.concepts (slug, name, parent_id, sort_order) select 'flexible-budget', 'Flexible Budgets', (select id from public.concepts where slug = 'budgeting'), 3 where not exists (select 1 from public.concepts where slug = 'flexible-budget');
insert into public.concepts (slug, name, sort_order) select 'standard-costing', 'Standard Costing & Variances', 340 where not exists (select 1 from public.concepts where slug = 'standard-costing');
insert into public.concepts (slug, name, parent_id, sort_order) select 'materials-variances', 'Materials Variances', (select id from public.concepts where slug = 'standard-costing'), 1 where not exists (select 1 from public.concepts where slug = 'materials-variances');
insert into public.concepts (slug, name, parent_id, sort_order) select 'labor-variances', 'Labor Variances', (select id from public.concepts where slug = 'standard-costing'), 2 where not exists (select 1 from public.concepts where slug = 'labor-variances');
insert into public.concepts (slug, name, parent_id, sort_order) select 'overhead-variances', 'Overhead Variances', (select id from public.concepts where slug = 'standard-costing'), 3 where not exists (select 1 from public.concepts where slug = 'overhead-variances');
insert into public.concepts (slug, name, sort_order) select 'performance-measurement', 'Performance Measurement', 350 where not exists (select 1 from public.concepts where slug = 'performance-measurement');
insert into public.concepts (slug, name, parent_id, sort_order) select 'roi-residual-income', 'ROI & Residual Income', (select id from public.concepts where slug = 'performance-measurement'), 1 where not exists (select 1 from public.concepts where slug = 'roi-residual-income');
insert into public.concepts (slug, name, sort_order) select 'relevant-costing', 'Relevant Costing & Decisions', 360 where not exists (select 1 from public.concepts where slug = 'relevant-costing');
insert into public.concepts (slug, name, parent_id, sort_order) select 'special-orders', 'Special Orders', (select id from public.concepts where slug = 'relevant-costing'), 1 where not exists (select 1 from public.concepts where slug = 'special-orders');
insert into public.concepts (slug, name, parent_id, sort_order) select 'make-or-buy', 'Make or Buy', (select id from public.concepts where slug = 'relevant-costing'), 2 where not exists (select 1 from public.concepts where slug = 'make-or-buy');
insert into public.concepts (slug, name, parent_id, sort_order) select 'drop-segment', 'Keep or Drop a Segment', (select id from public.concepts where slug = 'relevant-costing'), 3 where not exists (select 1 from public.concepts where slug = 'drop-segment');
insert into public.concepts (slug, name, parent_id, sort_order) select 'constrained-resource', 'Constrained Resources', (select id from public.concepts where slug = 'relevant-costing'), 4 where not exists (select 1 from public.concepts where slug = 'constrained-resource');
insert into public.concepts (slug, name, sort_order) select 'capital-budgeting', 'Capital Budgeting', 370 where not exists (select 1 from public.concepts where slug = 'capital-budgeting');
insert into public.concepts (slug, name, parent_id, sort_order) select 'npv-irr', 'NPV & IRR', (select id from public.concepts where slug = 'capital-budgeting'), 1 where not exists (select 1 from public.concepts where slug = 'npv-irr');
insert into public.concepts (slug, name, parent_id, sort_order) select 'payback-arr', 'Payback & ARR', (select id from public.concepts where slug = 'capital-budgeting'), 2 where not exists (select 1 from public.concepts where slug = 'payback-arr');

-- ============ Best-effort chapter -> concept primary mappings ============
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'conceptual-framework' and ch.chapter_name ilike '%Conceptual Framework%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'accounting-cycle' and ch.chapter_name ilike '%Accounting System%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'income-statement' and ch.chapter_name ilike '%Income Statement%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'balance-sheet' and ch.chapter_name ilike '%Balance Sheet%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'time-value-of-money' and ch.chapter_name ilike '%Time Value%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'receivables' and ch.chapter_name ilike '%Cash & Receivables%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'inventory' and ch.chapter_name ilike '%Inventories, Cost%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'inventory' and ch.chapter_name ilike '%Inventories, Additional%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'ppe' and ch.chapter_name ilike '%Property, Plant%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'depreciation' and ch.chapter_name ilike '%Depreciation%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'intangibles' and ch.chapter_name ilike '%Intangible%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'current-liabilities' and ch.chapter_name ilike '%Current Liabilities%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'long-term-liabilities' and ch.chapter_name ilike '%Long Term Liabilities%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'stockholders-equity' and ch.chapter_name ilike '%Stockholder%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'eps' and ch.chapter_name ilike '%Dilutive%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'investments' and ch.chapter_name ilike '%Investments%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'revenue-recognition' and ch.chapter_name ilike '%Revenue Recognition%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'income-taxes' and ch.chapter_name ilike '%Income Taxes%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'pensions' and ch.chapter_name ilike '%Pensions%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'leases' and ch.chapter_name ilike '%Leases%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'accounting-changes' and ch.chapter_name ilike '%Accounting Changes%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'cash-flow-statement' and ch.chapter_name ilike '%Cash Flow%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'cash-flow-statement' and ch.chapter_name ilike '%Statement of Cash Flows%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'accounting-equation' and ch.chapter_name ilike '%Accounting in Business%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'accounting-cycle' and ch.chapter_name ilike '%Journalizing%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'adjusting-entries' and ch.chapter_name ilike '%Adjusting Entries%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'merchandising' and ch.chapter_name ilike '%Merchandising%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'inventory' and ch.chapter_name ilike '%FIFO%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'internal-controls' and ch.chapter_name ilike '%Internal Controls%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'receivables' and ch.chapter_name ilike '%Receivables%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'ppe' and ch.chapter_name ilike '%Long Term Assets%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'stockholders-equity' and ch.chapter_name ilike '%Equity%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'financial-statement-analysis' and ch.chapter_name ilike '%Financial Statement Analysis%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'managerial-concepts' and ch.chapter_name ilike '%Managerial Accounting Concepts%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'job-order-costing' and ch.chapter_name ilike '%Job Order%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'process-costing' and ch.chapter_name ilike '%Process Costing%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'abc' and ch.chapter_name ilike '%Activity Based%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'cvp' and ch.chapter_name ilike '%Cost Volume%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'variable-costing' and ch.chapter_name ilike '%Variable Costing%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'budgeting' and ch.chapter_name ilike '%Master Budget%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'standard-costing' and ch.chapter_name ilike '%Standard Costing%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'performance-measurement' and ch.chapter_name ilike '%Performance Measures%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'relevant-costing' and ch.chapter_name ilike '%Relevant Costing%'
on conflict (concept_id, entity_type, entity_id) do nothing;
insert into public.concept_mappings (concept_id, entity_type, entity_id, role)
select c.id, 'chapter', ch.id, 'primary' from public.concepts c, public.chapters ch
where c.slug = 'capital-budgeting' and ch.chapter_name ilike '%Capital Budgeting%'
on conflict (concept_id, entity_type, entity_id) do nothing;

-- ============ Chart of accounts defaults (top-up, never duplicates) ============
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Cash', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Cash');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Accounts Receivable', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Accounts Receivable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Allowance for Doubtful Accounts', 'contra_asset', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Allowance for Doubtful Accounts');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Notes Receivable', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Notes Receivable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Interest Receivable', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Interest Receivable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Inventory', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Inventory');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Supplies', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Supplies');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Prepaid Insurance', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Prepaid Insurance');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Prepaid Rent', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Prepaid Rent');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Equipment', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Equipment');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Accumulated Depreciation—Equipment', 'contra_asset', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Accumulated Depreciation—Equipment');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Buildings', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Buildings');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Accumulated Depreciation—Buildings', 'contra_asset', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Accumulated Depreciation—Buildings');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Land', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Land');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Patents', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Patents');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Goodwill', 'asset', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Goodwill');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Accounts Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Accounts Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Notes Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Notes Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Salaries Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Salaries Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Interest Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Interest Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Unearned Revenue', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Unearned Revenue');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Income Taxes Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Income Taxes Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Dividends Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Dividends Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Bonds Payable', 'liability', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Bonds Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Premium on Bonds Payable', 'liability_adjunct', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Premium on Bonds Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Discount on Bonds Payable', 'contra_liability', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Discount on Bonds Payable');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Common Stock', 'equity', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Common Stock');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Paid-in Capital in Excess of Par', 'equity', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Paid-in Capital in Excess of Par');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Preferred Stock', 'equity', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Preferred Stock');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Retained Earnings', 'equity', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Retained Earnings');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Treasury Stock', 'contra_equity', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Treasury Stock');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Dividends', 'equity', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Dividends');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Service Revenue', 'revenue', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Service Revenue');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Sales Revenue', 'revenue', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Sales Revenue');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Sales Returns and Allowances', 'contra_revenue', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Sales Returns and Allowances');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Sales Discounts', 'contra_revenue', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Sales Discounts');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Interest Revenue', 'revenue', 'credit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Interest Revenue');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Cost of Goods Sold', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Cost of Goods Sold');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Salaries Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Salaries Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Rent Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Rent Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Insurance Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Insurance Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Supplies Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Supplies Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Utilities Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Utilities Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Depreciation Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Depreciation Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Amortization Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Amortization Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Bad Debt Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Bad Debt Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Interest Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Interest Expense');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default) select 'Income Tax Expense', 'expense', 'debit', true where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Income Tax Expense');
