-- Cold Outreach v2 preloads three fixed business-club types: Women in Business, Finance,
-- Investing. The original check allowed only women_in_business / investment_finance, so finance
-- and investing inserts were rejected. Widen it (keep the legacy value for discovered rows).
alter table public.growth_business_clubs drop constraint if exists growth_business_clubs_category_ck;
alter table public.growth_business_clubs add constraint growth_business_clubs_category_ck
  check (category in ('women_in_business', 'investment_finance', 'finance', 'investing'));
