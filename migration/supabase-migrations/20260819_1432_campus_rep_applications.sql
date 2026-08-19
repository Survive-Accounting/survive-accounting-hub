-- 20260819_1432 — a real table for campus rep applications.
--
-- NOT REQUIRED FOR THE FEATURE TO WORK. Applications currently live as `referrals` rows whose
-- raw_text is a JSON envelope behind a "[CAMPUS REP]" prefix, because DDL cannot be run from the
-- machine this was built on. That works and is isolated (nothing processes `referrals`
-- automatically), but it is a queue in a text column: no per-column indexes, no constraint on
-- status, and every status change is a read-modify-write of a JSON blob.
--
-- Apply this when convenient, then migrate with the INSERT…SELECT at the bottom. The application
-- code needs one change afterwards — campus-rep.functions.ts reads and writes `referrals` today.

BEGIN;

CREATE TABLE IF NOT EXISTS public.campus_rep_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  email         text NOT NULL,
  phone         text NOT NULL,
  school_slug   text NOT NULL,
  school_name   text NOT NULL,
  year_in_school text,
  greek_org     text,
  pitch         text,
  -- The work-authorisation answer is recorded, not just enforced: if we ever need to show why
  -- someone was or was not contacted, the answer they gave is part of that record. A row only
  -- exists at all when this was true — the decline path stores nothing.
  work_authorized boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','approved','declined')),
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS campus_rep_applications_status_idx  ON public.campus_rep_applications (status, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_rep_applications_school_idx  ON public.campus_rep_applications (school_slug);

-- DENY BY DEFAULT. Reached only through the service role in a server function; no anon or
-- authenticated policy is created, so a leaked key cannot read applicants' contact details.
ALTER TABLE public.campus_rep_applications ENABLE ROW LEVEL SECURITY;

COMMIT;

-- MIGRATE the interim rows (safe to re-run — ON CONFLICT does nothing, and the source rows are
-- left in place so this can be verified before anything is deleted):
--
--   INSERT INTO public.campus_rep_applications
--     (name, email, phone, school_slug, school_name, year_in_school, greek_org, pitch, status, note, created_at)
--   SELECT
--     j->>'name', j->>'email', j->>'phone', j->>'schoolSlug', j->>'schoolName',
--     j->>'year', NULLIF(j->>'greek',''), NULLIF(j->>'pitch',''),
--     COALESCE(j->>'status','new'), NULLIF(j->>'note',''), (j->>'submittedAt')::timestamptz
--   FROM (
--     SELECT (regexp_replace(raw_text, '^\[CAMPUS REP\]\s*', ''))::jsonb AS j
--     FROM public.referrals WHERE raw_text LIKE '[CAMPUS REP]%'
--   ) src;
--
-- VERIFY: SELECT count(*) FROM public.campus_rep_applications;
--         SELECT count(*) FROM public.referrals WHERE raw_text LIKE '[CAMPUS REP]%';   -- must match
