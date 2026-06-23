-- 0021_je_scenarios.sql
-- Journal Entry Scenario Engine (prototype) schema + seeds.
--
-- A Scenario is a real-world event that produces journal entries which vary by
-- condition. The whole ScenarioDoc (see src/lib/je-engine.ts) lives in `doc` jsonb;
-- we are prototyping and will iterate the shape constantly, so we deliberately do NOT
-- normalize it into many tables yet.
--
-- Every statement is idempotent; this migration is safe to re-run.

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (shared, idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- je_scenarios — one jsonb document per scenario
-- ---------------------------------------------------------------------------
create table if not exists public.je_scenarios (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  doc jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists je_scenarios_set_updated_at on public.je_scenarios;
create trigger je_scenarios_set_updated_at
  before update on public.je_scenarios
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- je_principles — seeded reference table of accounting principles
-- ---------------------------------------------------------------------------
create table if not exists public.je_principles (
  key text primary key,
  label text not null,
  short_desc text,
  sort int
);

-- ---------------------------------------------------------------------------
-- RLS: authenticated full access; anon SELECT only (students read, never write)
-- ---------------------------------------------------------------------------
alter table public.je_scenarios enable row level security;
alter table public.je_principles enable row level security;

drop policy if exists "anon select je_scenarios" on public.je_scenarios;
create policy "anon select je_scenarios" on public.je_scenarios for select to anon using (true);
drop policy if exists "auth all je_scenarios" on public.je_scenarios;
create policy "auth all je_scenarios" on public.je_scenarios for all to authenticated using (true) with check (true);

drop policy if exists "anon select je_principles" on public.je_principles;
create policy "anon select je_principles" on public.je_principles for select to anon using (true);
drop policy if exists "auth all je_principles" on public.je_principles;
create policy "auth all je_principles" on public.je_principles for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Seed principles
-- ---------------------------------------------------------------------------
insert into public.je_principles (key, label, short_desc, sort) values
  ('revenue_recognition', 'Revenue Recognition', 'Record revenue when it is earned (the service or product is delivered), not necessarily when cash arrives.', 10),
  ('expense_recognition', 'Expense Recognition', 'Record expenses in the period they help generate revenue or are used up.', 20),
  ('matching', 'Matching', 'Pair expenses with the revenues they help produce so each period''s income is fair.', 30),
  ('historical_cost', 'Historical Cost', 'Record assets at what you actually paid for them, and keep that cost on the books.', 40),
  ('conservatism', 'Conservatism', 'When in doubt, do not overstate assets or income; recognize likely losses early.', 50),
  ('full_disclosure', 'Full Disclosure', 'Tell financial-statement readers anything that would change their decisions.', 60),
  ('going_concern', 'Going Concern', 'Assume the business will keep operating long enough to use its assets and pay its debts.', 70),
  ('economic_entity', 'Economic Entity', 'Keep the business''s records separate from its owners and other businesses.', 80),
  ('monetary_unit', 'Monetary Unit', 'Record only things you can express in money, and assume the currency is stable.', 90),
  ('cost_constraint', 'Cost Constraint', 'Only provide information when its benefit to users outweighs the cost of producing it.', 100),
  ('materiality', 'Materiality', 'Follow the rules strictly only when an amount is big enough to affect a decision.', 110)
on conflict (key) do update
  set label = excluded.label, short_desc = excluded.short_desc, sort = excluded.sort;

-- ---------------------------------------------------------------------------
-- Chart of accounts — ensure every account the seed scenarios reference exists.
-- (Most are seeded in 0018; these four are added here.)
-- ---------------------------------------------------------------------------
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
  select 'Merchandise Inventory', 'asset', 'debit', true
  where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Merchandise Inventory');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
  select 'Unearned Service Revenue', 'liability', 'credit', true
  where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Unearned Service Revenue');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
  select 'Gain on Disposal of Equipment', 'revenue', 'credit', true
  where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Gain on Disposal of Equipment');
insert into public.chart_of_accounts (canonical_name, account_type, normal_balance, is_global_default)
  select 'Loss on Disposal of Equipment', 'expense', 'debit', true
  where not exists (select 1 from public.chart_of_accounts where canonical_name = 'Loss on Disposal of Equipment');

-- ---------------------------------------------------------------------------
-- Seed scenario 1: sell-equipment-cash (flagship "structural variant + toggle")
-- ---------------------------------------------------------------------------
insert into public.je_scenarios (slug, title, doc) values
('sell-equipment-cash', 'Sell equipment for cash', $doc$
{
  "slug": "sell-equipment-cash",
  "title": "Sell equipment for cash",
  "event": "A company sells a piece of equipment for cash. Depending on how the cash proceeds compare to the equipment's book value (cost minus accumulated depreciation), the sale produces a gain, a loss, or breaks even — and the structure of the journal entry changes accordingly.",
  "courseFamilies": ["intro1", "intro2", "ia1"],
  "principleKeys": ["historical_cost", "revenue_recognition"],
  "axes": [
    {
      "key": "outcome",
      "label": "Sale outcome",
      "options": [
        { "value": "gain", "label": "At a gain" },
        { "value": "loss", "label": "At a loss" },
        { "value": "even", "label": "Break even" }
      ]
    }
  ],
  "variants": [
    {
      "id": "gain",
      "label": "Sold at a gain",
      "conditions": { "outcome": "gain" },
      "entries": [
        {
          "id": "sale",
          "caption": "Entry to record the sale at a gain",
          "lines": [
            { "id": "cash", "account": "Cash", "side": "debit", "label": "proceeds", "tooltip": "Cash received from the buyer", "why": "Cash received from the buyer is an asset inflow, so it is debited." },
            { "id": "accdep", "account": "Accumulated Depreciation—Equipment", "side": "debit", "label": "accumulated dep", "tooltip": "All depreciation taken to date", "why": "The contra-asset that built up against the equipment is removed by debiting it back to zero so the asset and its contra leave together." },
            { "id": "equip", "account": "Equipment", "side": "credit", "label": "original cost", "tooltip": "Historical cost of the equipment", "why": "The asset leaves the books at its historical cost, so Equipment is credited for its full original amount.", "principleKeys": ["historical_cost"] },
            { "id": "gainline", "account": "Gain on Disposal of Equipment", "side": "credit", "label": "gain", "tooltip": "Proceeds minus book value", "why": "Proceeds exceeded book value, so the difference is a gain, which is credited.", "trap": "Students record the plug on the wrong side — a Gain is a credit because proceeds exceeded book value; flip it to a debit and the equation breaks.", "principleKeys": ["revenue_recognition"] }
          ]
        }
      ]
    },
    {
      "id": "loss",
      "label": "Sold at a loss",
      "conditions": { "outcome": "loss" },
      "entries": [
        {
          "id": "sale",
          "caption": "Entry to record the sale at a loss",
          "lines": [
            { "id": "cash", "account": "Cash", "side": "debit", "label": "proceeds", "tooltip": "Cash received from the buyer", "why": "Cash received from the buyer is an asset inflow, so it is debited." },
            { "id": "accdep", "account": "Accumulated Depreciation—Equipment", "side": "debit", "label": "accumulated dep", "tooltip": "All depreciation taken to date", "why": "The contra-asset built up against the equipment is removed by debiting it back to zero." },
            { "id": "lossline", "account": "Loss on Disposal of Equipment", "side": "debit", "label": "loss", "tooltip": "Book value minus proceeds", "why": "Book value exceeded proceeds, so the shortfall is a loss, which is debited.", "trap": "A Loss is a debit — it reduces equity like an expense. Crediting it (or treating it as a gain) overstates income and unbalances the entry." },
            { "id": "equip", "account": "Equipment", "side": "credit", "label": "original cost", "tooltip": "Historical cost of the equipment", "why": "The asset leaves the books at its historical cost, so Equipment is credited.", "principleKeys": ["historical_cost"] }
          ]
        }
      ]
    },
    {
      "id": "even",
      "label": "Break even",
      "conditions": { "outcome": "even" },
      "entries": [
        {
          "id": "sale",
          "caption": "Entry to record the sale at book value (no gain or loss)",
          "lines": [
            { "id": "cash", "account": "Cash", "side": "debit", "label": "proceeds", "tooltip": "Cash received equals book value", "why": "Cash received from the buyer is an asset inflow, so it is debited." },
            { "id": "accdep", "account": "Accumulated Depreciation—Equipment", "side": "debit", "label": "accumulated dep", "tooltip": "All depreciation taken to date", "why": "The contra-asset is removed by debiting it back to zero." },
            { "id": "equip", "account": "Equipment", "side": "credit", "label": "original cost", "tooltip": "Historical cost of the equipment", "why": "Proceeds equal book value, so there is no gain or loss — Cash plus Accumulated Depreciation exactly offset Equipment's cost.", "principleKeys": ["historical_cost"] }
          ]
        }
      ]
    }
  ]
}
$doc$::jsonb)
on conflict (slug) do update set title = excluded.title, doc = excluded.doc, updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed scenario 2: merch-sale (variants with differing entry counts)
-- ---------------------------------------------------------------------------
insert into public.je_scenarios (slug, title, doc) values
('merch-sale', 'Record a merchandise sale', $doc$
{
  "slug": "merch-sale",
  "title": "Record a merchandise sale",
  "event": "A merchandiser sells goods to a customer on account. Under a perpetual inventory system, each sale posts TWO entries — one for the revenue and one to move the cost of the goods out of inventory. Under a periodic system, only the revenue entry posts now; cost of goods sold is computed at period-end.",
  "courseFamilies": ["intro1", "intro2"],
  "principleKeys": ["revenue_recognition", "matching", "expense_recognition"],
  "axes": [
    {
      "key": "method",
      "label": "Inventory method",
      "options": [
        { "value": "perpetual", "label": "Perpetual" },
        { "value": "periodic", "label": "Periodic" }
      ]
    }
  ],
  "variants": [
    {
      "id": "perpetual",
      "label": "Perpetual — two entries",
      "conditions": { "method": "perpetual" },
      "entries": [
        {
          "id": "revenue",
          "caption": "1. Record the sale (revenue side)",
          "lines": [
            { "id": "ar", "account": "Accounts Receivable", "side": "debit", "label": "selling price", "tooltip": "Amount the customer owes", "why": "The customer owes us, so the right to collect (an asset) is debited." },
            { "id": "salesrev", "account": "Sales Revenue", "side": "credit", "label": "selling price", "tooltip": "Price charged to the customer", "why": "Revenue is recognized when the sale is made, so Sales Revenue is credited.", "principleKeys": ["revenue_recognition"] }
          ]
        },
        {
          "id": "cost",
          "caption": "2. Record the cost of the goods sold",
          "lines": [
            { "id": "cogs", "account": "Cost of Goods Sold", "side": "debit", "label": "cost", "tooltip": "What the goods cost us", "why": "Perpetual tracks inventory cost continuously, so each sale immediately moves cost out of Inventory and into Cost of Goods Sold — matching the expense to the revenue.", "trap": "Periodic systems skip this second entry entirely; only perpetual records COGS at the point of sale.", "principleKeys": ["matching", "expense_recognition"] },
            { "id": "inv", "account": "Merchandise Inventory", "side": "credit", "label": "cost", "tooltip": "Cost of goods that left", "why": "The inventory asset decreases as goods leave, so Merchandise Inventory is credited." }
          ]
        }
      ]
    },
    {
      "id": "periodic",
      "label": "Periodic — one entry",
      "conditions": { "method": "periodic" },
      "entries": [
        {
          "id": "revenue",
          "caption": "Record the sale (revenue only)",
          "lines": [
            { "id": "ar", "account": "Accounts Receivable", "side": "debit", "label": "selling price", "tooltip": "Amount the customer owes", "why": "The customer owes us, so the right to collect (an asset) is debited." },
            { "id": "salesrev", "account": "Sales Revenue", "side": "credit", "label": "selling price", "tooltip": "Price charged to the customer", "why": "Periodic records only the revenue side at the time of sale; cost of goods sold is computed at period-end, not now.", "principleKeys": ["revenue_recognition"] }
          ]
        }
      ]
    }
  ]
}
$doc$::jsonb)
on conflict (slug) do update set title = excluded.title, doc = excluded.doc, updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed scenario 3: adjust-unearned-revenue (same entry, different computation path)
-- ---------------------------------------------------------------------------
insert into public.je_scenarios (slug, title, doc) values
('adjust-unearned-revenue', 'Recognize unearned revenue', $doc$
{
  "slug": "adjust-unearned-revenue",
  "title": "Recognize unearned revenue",
  "event": "A company collected cash up front for services it had not yet performed (a liability). At period-end it recognizes the portion now earned. The journal entry is the SAME regardless of how the earned portion is measured — only the computation path (the why/how of the amount) differs.",
  "courseFamilies": ["intro1", "intro2", "ia1"],
  "principleKeys": ["revenue_recognition"],
  "axes": [
    {
      "key": "given",
      "label": "How the earned amount is given",
      "options": [
        { "value": "months_elapsed", "label": "Months elapsed" },
        { "value": "percent_complete", "label": "% complete" }
      ]
    }
  ],
  "variants": [
    {
      "id": "recognize",
      "label": "Recognize earned portion",
      "conditions": {},
      "entries": [
        {
          "id": "adjust",
          "caption": "Adjusting entry to recognize earned revenue",
          "lines": [
            { "id": "unearned", "account": "Unearned Service Revenue", "side": "debit", "label": "earned portion", "tooltip": "Portion now delivered", "why": "We collected cash up front and owed the service; as we deliver, that liability shrinks, so Unearned Service Revenue is debited.", "trap": "It is tempting to credit Unearned because it is a liability — but here it is DECREASING (we delivered), so it is debited." },
            { "id": "servicerev", "account": "Service Revenue", "side": "credit", "label": "earned portion", "tooltip": "Revenue now earned", "why": "The portion now earned becomes revenue, so Service Revenue is credited.", "principleKeys": ["revenue_recognition"] }
          ]
        }
      ],
      "computationPaths": [
        {
          "id": "by-months",
          "appliesWhen": { "given": "months_elapsed" },
          "narration": "4 of the 12 contract months have elapsed, so recognize 4/12 of the upfront payment as earned. Move that fraction out of the liability and into revenue.",
          "steps": [
            { "label": "Fraction earned", "formulaText": "months elapsed / total months", "resultSlotKey": "fraction" },
            { "label": "Amount earned", "formulaText": "fraction × cash collected", "resultSlotKey": "earned" }
          ]
        },
        {
          "id": "by-percent",
          "appliesWhen": { "given": "percent_complete" },
          "narration": "The job is 30% complete per the engineer's estimate, so recognize 30% of the contract as earned this period — same entry, the amount just comes from percent-of-completion instead of the calendar.",
          "steps": [
            { "label": "Amount earned", "formulaText": "percent complete × contract value", "resultSlotKey": "earned" }
          ]
        }
      ]
    }
  ]
}
$doc$::jsonb)
on conflict (slug) do update set title = excluded.title, doc = excluded.doc, updated_at = now();

-- ---------------------------------------------------------------------------
-- Seed scenario 4: adjust-depreciation (richest computation: method × period)
-- ---------------------------------------------------------------------------
insert into public.je_scenarios (slug, title, doc) values
('adjust-depreciation', 'Record depreciation', $doc$
{
  "slug": "adjust-depreciation",
  "title": "Record depreciation",
  "event": "At period-end a company records depreciation on its equipment. The entry hits the same two accounts no matter what — Depreciation Expense and Accumulated Depreciation—Equipment — but the amount is computed differently depending on the method (straight-line vs. double-declining-balance) and whether it is a full or partial year in service.",
  "courseFamilies": ["intro1", "intro2", "ia1"],
  "principleKeys": ["matching", "expense_recognition", "historical_cost"],
  "axes": [
    {
      "key": "method",
      "label": "Depreciation method",
      "options": [
        { "value": "straight_line", "label": "Straight-line" },
        { "value": "double_declining", "label": "Double-declining" }
      ]
    },
    {
      "key": "period",
      "label": "Time in service",
      "options": [
        { "value": "full_year", "label": "Full year" },
        { "value": "partial_year", "label": "Partial year" }
      ]
    }
  ],
  "variants": [
    {
      "id": "depreciate",
      "label": "Record depreciation",
      "conditions": {},
      "entries": [
        {
          "id": "adjust",
          "caption": "Adjusting entry to record depreciation",
          "lines": [
            { "id": "depexp", "account": "Depreciation Expense", "side": "debit", "label": "period depreciation", "tooltip": "This period's depreciation", "why": "Allocate the asset's cost to the periods it helps generate revenue, so Depreciation Expense is debited (the matching principle in action).", "principleKeys": ["matching", "expense_recognition"] },
            { "id": "accdep", "account": "Accumulated Depreciation—Equipment", "side": "credit", "label": "period depreciation", "tooltip": "Running total of depreciation", "why": "The buildup of depreciation accrues in the contra-asset Accumulated Depreciation, so it is credited.", "trap": "Crediting Equipment directly would erase its historical cost. Depreciation accumulates in the contra-asset instead, preserving the asset's original cost on the books.", "principleKeys": ["historical_cost"] }
          ]
        }
      ],
      "computationPaths": [
        {
          "id": "sl-full",
          "appliesWhen": { "method": "straight_line", "period": "full_year" },
          "narration": "Straight-line: (cost − salvage value) ÷ useful life. A full year in service, so take the whole annual amount.",
          "steps": [{ "label": "Annual depreciation", "formulaText": "(cost − salvage) / useful life", "resultSlotKey": "depreciation" }]
        },
        {
          "id": "sl-partial",
          "appliesWhen": { "method": "straight_line", "period": "partial_year" },
          "narration": "Straight-line, prorated: (cost − salvage) ÷ useful life, then × months in service / 12. If the asset was placed in service in April, that is 9/12 of the annual amount.",
          "steps": [
            { "label": "Annual depreciation", "formulaText": "(cost − salvage) / useful life", "resultSlotKey": "annual" },
            { "label": "Prorated", "formulaText": "annual × months in service / 12", "resultSlotKey": "depreciation" }
          ]
        },
        {
          "id": "ddb-full",
          "appliesWhen": { "method": "double_declining", "period": "full_year" },
          "narration": "Double-declining-balance: 2 × straight-line rate × beginning book value. Salvage is ignored until book value would fall below it. A full year, so take the full computed amount.",
          "steps": [
            { "label": "DDB rate", "formulaText": "2 / useful life", "resultSlotKey": "rate" },
            { "label": "Depreciation", "formulaText": "rate × beginning book value", "resultSlotKey": "depreciation" }
          ]
        },
        {
          "id": "ddb-partial",
          "appliesWhen": { "method": "double_declining", "period": "partial_year" },
          "narration": "Double-declining-balance, prorated: 2 × straight-line rate × beginning book value, then × months in service / 12 for the first partial year.",
          "steps": [
            { "label": "DDB rate", "formulaText": "2 / useful life", "resultSlotKey": "rate" },
            { "label": "Full-year DDB", "formulaText": "rate × beginning book value", "resultSlotKey": "fullYear" },
            { "label": "Prorated", "formulaText": "fullYear × months in service / 12", "resultSlotKey": "depreciation" }
          ]
        }
      ]
    }
  ]
}
$doc$::jsonb)
on conflict (slug) do update set title = excluded.title, doc = excluded.doc, updated_at = now();
