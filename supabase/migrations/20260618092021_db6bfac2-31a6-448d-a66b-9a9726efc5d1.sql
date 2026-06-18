
ALTER TABLE public.campus_lead_suggestions
  ADD COLUMN IF NOT EXISTS rmp_rating numeric,
  ADD COLUMN IF NOT EXISTS rmp_num_ratings integer,
  ADD COLUMN IF NOT EXISTS rmp_difficulty numeric,
  ADD COLUMN IF NOT EXISTS rmp_would_take_again numeric,
  ADD COLUMN IF NOT EXISTS rmp_profile_url text,
  ADD COLUMN IF NOT EXISTS rmp_checked_at timestamptz;
