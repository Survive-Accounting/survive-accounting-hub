-- /the-campaign — the referral form's two tables (2026-08-30).
--
-- ONE CONCERN PER FILE, and this is one concern: "what Lee's personal network sends back from
-- /the-campaign". The two tables ship together because a single submission can write both — a
-- referral AND a subscribe — and applying one without the other would drop half of every form.
--
-- ── WHY THESE ARE NOT THE STUDENT OR CHAPTER LISTS ────────────────────────────────────────────
-- campaign_subscriber is Lee's PERSONAL NETWORK receiving progress updates. They are not
-- marketing contacts and must never enter an outreach sequence. Keeping them in their own table
-- (rather than as a flag on campus_waitlist) is what makes that enforceable rather than a
-- convention someone forgets: no sequence query joins this table, and nothing here carries the
-- columns a sequence reads.
--
-- Additive only. Nothing here rewrites or drops existing data.

BEGIN;

-- ── SUBSCRIBERS ──────────────────────────────────────────────────────────────────────────────
-- Progress updates only. NO PROMISED CADENCE anywhere in the product, so nothing here stores a
-- schedule — there is deliberately no next_send_at or frequency column to tempt one.
CREATE TABLE IF NOT EXISTS public.campaign_subscriber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  -- Which page they came from. One value today ("/the-campaign"); a column because the second
  -- private page is cheaper to add than to retrofit.
  source_page text NOT NULL DEFAULT '/the-campaign',
  -- THE UNSUBSCRIBE IS PART OF THE RECORD, not a separate list to reconcile. Anything sent to
  -- these people carries a working link; setting this is what that link does.
  unsubscribed_at timestamptz,
  unsubscribe_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex')
);

-- One row per email per page. A second submit updates rather than duplicating, so a person who
-- fills the form twice does not get two copies of every update.
CREATE UNIQUE INDEX IF NOT EXISTS campaign_subscriber_email_page
  ON public.campaign_subscriber (lower(email), source_page);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_subscriber_token
  ON public.campaign_subscriber (unsubscribe_token);

-- ── SUBMISSIONS ──────────────────────────────────────────────────────────────────────────────
-- EVERY submission, including comment-only ones. Those are feedback and Lee wants them; a table
-- that only stored referrals would silently discard the people who took the time to write.
--
-- Only submitter_name is NOT NULL, matching the form: everything else is optional there, so
-- everything else is nullable here. A NOT NULL that the UI does not enforce is a 500 waiting for
-- the one person who leaves that field blank.
CREATE TABLE IF NOT EXISTS public.referral_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),

  submitter_name text NOT NULL,
  submitter_email text,
  subscribed boolean NOT NULL DEFAULT false,

  -- THE REFERRAL, all optional. campus_id is the resolved campus when they picked one from the
  -- list; campus_text preserves what they typed when they did not, because "not listed" is a
  -- real answer and throwing it away loses the campus we most need to hear about.
  campus_id uuid,
  campus_text text,
  referral_name text,
  referral_contact text,
  relationship text,

  comments text,
  -- "Let's set up a call" / "Not right now" / unanswered.
  wants_call boolean,

  -- The outreach_leads row a referral created, so a submission can be traced to the contact it
  -- produced without matching on names.
  lead_id uuid,
  notified_at timestamptz
);

CREATE INDEX IF NOT EXISTS referral_submission_recent
  ON public.referral_submission (created_at DESC);

CREATE INDEX IF NOT EXISTS referral_submission_campus
  ON public.referral_submission (campus_id) WHERE campus_id IS NOT NULL;

COMMIT;

-- PROOF, not a comment claiming success: all three must return a row.
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'campaign_subscriber';

SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'referral_submission';

SELECT count(*)::text AS submitter_name_is_required
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'referral_submission'
   AND column_name = 'submitter_name' AND is_nullable = 'NO';
