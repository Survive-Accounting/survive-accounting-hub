-- 0047_active_roster.sql
-- Additive scope filter for student-facing campus & professor pickers.
-- Non-SEC data is preserved and untouched. A campus with active_roster=null
-- simply does not appear in the /order student picker; ProfIntel's data is
-- unchanged unless explicitly filtered by this column at query time.
ALTER TABLE public.campuses                ADD COLUMN IF NOT EXISTS active_roster text;
ALTER TABLE public.campus_lead_suggestions ADD COLUMN IF NOT EXISTS active_roster text;
ALTER TABLE public.campus_lead_suggestions ADD COLUMN IF NOT EXISTS source        text;
ALTER TABLE public.campus_lead_suggestions ADD COLUMN IF NOT EXISTS activated_at  timestamptz;
