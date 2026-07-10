-- 0083_chart_of_accounts_repair.sql
-- Clean up chart_of_accounts so it is a single, de-duplicated, correctly-typed account
-- vocabulary (Lee reuses this list outside the JE tool). Applied to the live DB on
-- 2026-07-09 via scripts/repair-chart-of-accounts.ts (service-role REST; Management-API
-- PAT blocked/exposed). This SQL is the idempotent record — re-running is a no-op.
--
-- chart_of_accounts has NO inbound foreign keys (generated types: Relationships: []) and
-- the JE engine matches accounts by canonical_name (string), never by id — so collapsing
-- duplicate rows orphans nothing.
--
-- Four operations, in order:
--   1. NORMALIZE legacy capitalized enum values → the lowercase vocabulary je-engine reads
--      ("Liability"→"liability", "Other Income"→"revenue", …); Premium on Bonds Payable →
--      liability_adjunct.
--   2. DEDUPE exact-canonical_name duplicates (each account was stored twice — once
--      lowercase, once capitalized), keeping one row per name.
--   3. MERGE punctuation/plural variants of the same account into the canonical spelling
--      (Building→Buildings, Accumulated Depreciation—Building→…Buildings, Salaries & Wages
--      Payable→Salaries and Wages Payable). Two scenario docs referencing the singular
--      "Building" forms were rewritten to plural in the same commit.
--   4. INSERT every account the scenario library uses that the COA still lacked.
-- Net: 110 rows → 173 (deleted 29 exact dupes + 3 variants, normalized 58, inserted 95).

-- 1. NORMALIZE enum casing + specific type fixes ------------------------------------------
update public.chart_of_accounts set account_type = case lower(account_type)
    when 'contra asset' then 'contra_asset'
    when 'contra liability' then 'contra_liability'
    when 'contra equity' then 'contra_equity'
    when 'contra revenue' then 'contra_revenue'
    when 'other income' then 'revenue'
    when 'other expense' then 'expense'
    else lower(account_type)
  end
where account_type is not null and account_type <> lower(account_type)
   or account_type in ('Other Income','Other Expense','Contra Asset','Contra Liability','Contra Equity','Contra Revenue');
update public.chart_of_accounts set normal_balance = lower(normal_balance)
  where normal_balance is not null and normal_balance <> lower(normal_balance);
update public.chart_of_accounts set account_type = 'liability_adjunct'
  where canonical_name = 'Premium on Bonds Payable';

-- 2. DEDUPE exact-name duplicates (keep the earliest ctid per canonical_name) -------------
delete from public.chart_of_accounts a
using public.chart_of_accounts b
where a.canonical_name = b.canonical_name and a.ctid > b.ctid;

-- 3. MERGE punctuation/plural variants into the canonical spelling -----------------------
delete from public.chart_of_accounts
  where canonical_name in ('Building', 'Accumulated Depreciation—Building', 'Salaries & Wages Payable');

-- 4. INSERT the accounts the scenario library uses (idempotent; guarded by NOT EXISTS) ---
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
select v.name, v.type, v.nb, true
from (values
  ('Accounts Payable', 'liability', 'credit'),
  ('Accounts Receivable', 'asset', 'debit'),
  ('Accumulated Depletion', 'contra_asset', 'credit'),
  ('Accumulated Depreciation', 'contra_asset', 'credit'),
  ('Accumulated Depreciation—Buildings', 'contra_asset', 'credit'),
  ('Accumulated Depreciation—Equipment', 'contra_asset', 'credit'),
  ('Accumulated Depreciation—Machinery', 'contra_asset', 'credit'),
  ('Advertising Expense', 'expense', 'debit'),
  ('Allowance for Doubtful Accounts', 'contra_asset', 'credit'),
  ('Amortization Expense', 'expense', 'debit'),
  ('APIC—Common Stock', 'equity', 'credit'),
  ('APIC—Preferred Stock', 'equity', 'credit'),
  ('Bad Debt Expense', 'expense', 'debit'),
  ('Bond Interest Expense', 'expense', 'debit'),
  ('Bond Issue Costs', 'asset', 'debit'),
  ('Bonds Payable', 'liability', 'credit'),
  ('Buildings', 'asset', 'debit'),
  ('Cash', 'asset', 'debit'),
  ('Cash Over and Short', 'expense', 'debit'),
  ('Coal Inventory', 'asset', 'debit'),
  ('Commission Expense', 'expense', 'debit'),
  ('Common Stock', 'equity', 'credit'),
  ('Common Stock Dividend Distributable', 'equity', 'credit'),
  ('Compensation Expense', 'expense', 'debit'),
  ('Construction Expenses', 'expense', 'debit'),
  ('Construction in Process', 'asset', 'debit'),
  ('Cost of Goods Sold', 'expense', 'debit'),
  ('Debt Conversion Expense', 'expense', 'debit'),
  ('Debt Investments', 'asset', 'debit'),
  ('Deferred Tax Asset', 'asset', 'debit'),
  ('Deferred Tax Liability', 'liability', 'credit'),
  ('Delivery Expense', 'expense', 'debit'),
  ('Depletion Expense', 'expense', 'debit'),
  ('Depreciation Expense', 'expense', 'debit'),
  ('Discount on Bonds Payable', 'contra_liability', 'debit'),
  ('Discount on Notes Payable', 'contra_liability', 'debit'),
  ('Dividend Revenue', 'revenue', 'credit'),
  ('Dividends', 'equity', 'debit'),
  ('Dividends Payable', 'liability', 'credit'),
  ('Dividends Payable — Common', 'liability', 'credit'),
  ('Dividends Payable — Preferred', 'liability', 'credit'),
  ('Employee Income Taxes Payable', 'liability', 'credit'),
  ('Equipment', 'asset', 'debit'),
  ('Equipment (new)', 'asset', 'debit'),
  ('Equipment (old)', 'asset', 'debit'),
  ('Equity Investments', 'asset', 'debit'),
  ('Estimated Inventory Returns', 'asset', 'debit'),
  ('Estimated Liability on Purchase Commitments', 'liability', 'credit'),
  ('Estimated Warranty Liability', 'liability', 'credit'),
  ('Expenses (total)', 'expense', 'debit'),
  ('Factory Overhead', 'expense', 'debit'),
  ('Factory Wages Payable', 'liability', 'credit'),
  ('Fair Value Adjustment — AFS', 'asset', 'debit'),
  ('Fair Value Adjustment — Bonds Payable', 'contra_liability', 'debit'),
  ('Fair Value Adjustment — Equity Investments', 'asset', 'debit'),
  ('Fair Value Adjustment — Trading', 'asset', 'debit'),
  ('Federal Unemployment Taxes Payable', 'liability', 'credit'),
  ('FICA Taxes Payable', 'liability', 'credit'),
  ('Finished Goods Inventory', 'asset', 'debit'),
  ('Gain on Disposal', 'revenue', 'credit'),
  ('Gain on Disposal of Equipment', 'revenue', 'credit'),
  ('Gain on Exchange', 'revenue', 'credit'),
  ('Gain on Redemption of Bonds', 'revenue', 'credit'),
  ('Gain on Restructuring of Debt', 'revenue', 'credit'),
  ('Gain on Sale of Equipment', 'revenue', 'credit'),
  ('Gain on Sale of Investments', 'revenue', 'credit'),
  ('Goodwill', 'asset', 'debit'),
  ('Income Summary', 'equity', 'credit'),
  ('Income Tax Expense', 'expense', 'debit'),
  ('Income Tax Payable', 'liability', 'credit'),
  ('Income Taxes Payable', 'liability', 'credit'),
  ('Insurance Expense', 'expense', 'debit'),
  ('Interest Expense', 'expense', 'debit'),
  ('Interest Payable', 'liability', 'credit'),
  ('Interest Receivable', 'asset', 'debit'),
  ('Interest Revenue', 'revenue', 'credit'),
  ('Inventory', 'asset', 'debit'),
  ('Inventory on Consignment', 'asset', 'debit'),
  ('Investment Income', 'revenue', 'credit'),
  ('Labor Efficiency Variance', 'expense', 'debit'),
  ('Labor Rate Variance', 'expense', 'debit'),
  ('Land', 'asset', 'debit'),
  ('Lease Expense', 'expense', 'debit'),
  ('Lease Liability', 'liability', 'credit'),
  ('Lease Receivable', 'asset', 'debit'),
  ('Lease Revenue', 'revenue', 'credit'),
  ('Liability to Repurchase Inventory', 'liability', 'credit'),
  ('Loss from Long-Term Contracts', 'expense', 'debit'),
  ('Loss on Bond Retirement', 'expense', 'debit'),
  ('Loss on Disposal', 'expense', 'debit'),
  ('Loss on Disposal of Equipment', 'expense', 'debit'),
  ('Loss on Impairment', 'expense', 'debit'),
  ('Loss on Inventory Write-Down', 'expense', 'debit'),
  ('Loss on Purchase Commitments', 'expense', 'debit'),
  ('Loss on Redemption of Bonds', 'expense', 'debit'),
  ('Loss on Restructuring of Debt', 'expense', 'debit'),
  ('Loss on Sale of Equipment', 'expense', 'debit'),
  ('Loss on Sale of Investments', 'expense', 'debit'),
  ('Machinery', 'asset', 'debit'),
  ('Manufacturing Overhead', 'expense', 'debit'),
  ('Materials Price Variance', 'expense', 'debit'),
  ('Materials Quantity Variance', 'expense', 'debit'),
  ('Merchandise Inventory', 'asset', 'debit'),
  ('Miscellaneous Expense', 'expense', 'debit'),
  ('Natural Resource Asset', 'asset', 'debit'),
  ('Notes Payable', 'liability', 'credit'),
  ('Notes Receivable', 'asset', 'debit'),
  ('OCI—Gain/Loss', 'equity', 'credit'),
  ('OCI—Prior Service Cost', 'contra_equity', 'debit'),
  ('Office Supplies Expense', 'expense', 'debit'),
  ('Operating Expenses', 'expense', 'debit'),
  ('Overhead Efficiency Variance', 'expense', 'debit'),
  ('Overhead Spending Variance', 'expense', 'debit'),
  ('Overhead Volume Variance', 'expense', 'debit'),
  ('Owner''s Capital', 'equity', 'credit'),
  ('Owner''s Draws', 'contra_equity', 'debit'),
  ('Paid-in Capital — Expired Stock Options', 'equity', 'credit'),
  ('Paid-in Capital — Stock Options', 'equity', 'credit'),
  ('Paid-in Capital — Stock Warrants', 'equity', 'credit'),
  ('Paid-in Capital from Treasury Stock', 'equity', 'credit'),
  ('Paid-in Capital in Excess of Par', 'equity', 'credit'),
  ('Paid-in Capital in Excess of Par — Common', 'equity', 'credit'),
  ('Paid-in Capital in Excess of Par — Preferred', 'equity', 'credit'),
  ('Paid-in Capital in Excess of Stated Value', 'equity', 'credit'),
  ('Paid-In Capital, Treasury Stock', 'equity', 'credit'),
  ('Patents', 'asset', 'debit'),
  ('Payroll Taxes Expense', 'expense', 'debit'),
  ('Pension Asset/Liability', 'liability', 'credit'),
  ('Pension Expense', 'expense', 'debit'),
  ('Petty Cash', 'asset', 'debit'),
  ('Postage Expense', 'expense', 'debit'),
  ('Preferred Stock', 'equity', 'credit'),
  ('Premium on Bonds Payable', 'liability_adjunct', 'credit'),
  ('Prepaid Insurance', 'asset', 'debit'),
  ('Prepaid Rent', 'asset', 'debit'),
  ('Purchase Discounts Lost', 'expense', 'debit'),
  ('Purchases', 'expense', 'debit'),
  ('Raw Materials Inventory', 'asset', 'debit'),
  ('Refund Liability', 'liability', 'credit'),
  ('Rent Expense', 'expense', 'debit'),
  ('Repair Parts Inventory', 'asset', 'debit'),
  ('Repairs and Maintenance Expense', 'expense', 'debit'),
  ('Retained Earnings', 'equity', 'credit'),
  ('Revenue from Long-Term Contracts', 'revenue', 'credit'),
  ('Right-of-Use Asset', 'asset', 'debit'),
  ('Salaries and Wages Expense', 'expense', 'debit'),
  ('Salaries and Wages Payable', 'liability', 'credit'),
  ('Salaries Expense', 'expense', 'debit'),
  ('Salaries Payable', 'liability', 'credit'),
  ('Sales Discounts', 'contra_revenue', 'debit'),
  ('Sales Returns and Allowances', 'contra_revenue', 'debit'),
  ('Sales Revenue', 'revenue', 'credit'),
  ('Sales Taxes Payable', 'liability', 'credit'),
  ('Service Revenue', 'revenue', 'credit'),
  ('State Unemployment Taxes Payable', 'liability', 'credit'),
  ('Supplies', 'asset', 'debit'),
  ('Supplies Expense', 'expense', 'debit'),
  ('Treasury Stock', 'contra_equity', 'debit'),
  ('Unearned Compensation', 'contra_equity', 'debit'),
  ('Unearned Revenue', 'liability', 'credit'),
  ('Unearned Service Revenue', 'liability', 'credit'),
  ('Unearned Warranty Revenue', 'liability', 'credit'),
  ('Unrealized Holding Gain or Loss — Equity', 'equity', 'credit'),
  ('Unrealized Holding Gain or Loss — Income', 'revenue', 'credit'),
  ('Utilities Expense', 'expense', 'debit'),
  ('Wages Expense', 'expense', 'debit'),
  ('Wages Payable', 'liability', 'credit'),
  ('Warranty Expense', 'expense', 'debit'),
  ('Warranty Liability', 'liability', 'credit'),
  ('Warranty Revenue', 'revenue', 'credit'),
  ('Work in Process Inventory', 'asset', 'debit'),
  ('Work in Process—Assembly', 'asset', 'debit'),
  ('Work in Process—Cutting', 'asset', 'debit')
) as v(name, type, nb)
where not exists (
  select 1 from public.chart_of_accounts c where c.canonical_name = v.name
);
