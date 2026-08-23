-- Site QA cockpit (/admin/site-qa) — internal QA verification state.
--
-- Survive owns ONLY the QA-workflow columns here: which template was verified,
-- when, by whom, against which build version, plus an optional short note and any
-- pinned representative example URLs. It deliberately stores NO traffic or error
-- data — PostHog owns "what people do", Sentry owns "what breaks", Vercel owns
-- deploys. See SITE_QA_IMPLEMENTATION.md.
--
-- One row per template id (the ids come from the maintained manifest in
-- src/lib/site-qa/manifest.ts). A row may exist with verified_at = NULL when only
-- example pins have been set. The app degrades gracefully if this table is absent
-- (every read is wrapped in try/catch and falls back to "never verified"), so the
-- cockpit works before this migration is applied — it just cannot persist.

create table if not exists public.qa_verifications (
  template_id       text primary key,
  -- Verification state
  verified_at       timestamptz,
  verified_by       text,          -- admin email or short name (e.g. "lee")
  verified_version  text,          -- template content hash at time of verify (see manifest hashing)
  verified_sha      text,          -- optional deployed git commit sha at verify time
  note              text,          -- one short current QA note per template
  -- Admin-pinned representative example URLs: [{ "url": "...", "label": "..." }]
  pinned_examples   jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.qa_verifications is
  'Internal Site QA (/admin/site-qa) verification state per page-template. No traffic/error data here.';

-- Deny-by-default: all access is through the service-role key inside server
-- functions (the /admin/site-qa route + its server fns enforce the admin check).
-- No policies are added, so anon/authenticated clients cannot read or write.
alter table public.qa_verifications enable row level security;
