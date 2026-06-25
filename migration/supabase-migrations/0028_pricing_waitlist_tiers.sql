-- 0028_pricing_waitlist_tiers.sql
-- Pricing page + free-video capture feed the EXISTING campus_waitlist list.
-- Adds a structured `tier_interest` column so Lee can see which materials tier
-- (test_pass | membership) or lead magnet (free_videos) each signup came from.
-- `source` already exists on campus_waitlist (used today to carry the origin).
-- Idempotent — safe to re-run. Next number after main's high-water mark (0027).
--
-- NOTE: until this is applied, the app encodes the tier inside `source`
-- (e.g. 'pricing_page_membership', 'free_videos') so capture works pre-migration.
-- Once applied, captures can also populate `tier_interest` directly.

alter table public.campus_waitlist
  add column if not exists tier_interest text;

create index if not exists campus_waitlist_source_idx on public.campus_waitlist (source);
create index if not exists campus_waitlist_tier_interest_idx on public.campus_waitlist (tier_interest);
