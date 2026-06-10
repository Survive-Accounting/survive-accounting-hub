# Migration Plan — Old App → Survive Accounting Hub

How to bring the old project's schema + data into this app, entirely through Lovable
(no Supabase dashboard or service keys needed on your side).

## One-time setup (you, in Lovable)

1. **Enable Lovable Cloud** on this project (if not already enabled). This provisions
   the Supabase backend that the migrations and data land in.

2. **Run the schema migrations** in order. In Lovable, open Cloud → Database → SQL
   (or ask Lovable: "run this SQL exactly as written, do not modify") and execute:
   - `migration/supabase-migrations/0001_outreach_schema.sql`
   - `migration/supabase-migrations/0002_content_ceq_schema.sql`
   - `migration/supabase-migrations/0003_lead_capture.sql`
   - `migration/supabase-migrations/0004_rls.sql`

   ⚠️ If Lovable already created its own `campuses` table for the mock dashboard,
   rename it first: `alter table public.campuses rename to campuses_lovable_copy;`

3. **Deploy the edge function.** Move `migration/edge-functions/migrate-from-old/`
   to `supabase/functions/migrate-from-old/` (or tell Lovable: "deploy this folder as
   an edge function named migrate-from-old, exactly as written").

4. **Add three secrets** in Lovable → Project → Secrets:
   - `OLD_ADMIN_EMAIL` — your old app's admin login email
   - `OLD_ADMIN_PASSWORD` — your old app's admin password
   - `MIGRATION_SECRET` — any random string you make up (it guards the function)

   Your credentials never leave your Lovable project — the function signs into the
   old project directly from the new project's backend.

## Run the migration

Ask Lovable to call the function, or use any HTTP client:

```
POST https://<new-project-ref>.supabase.co/functions/v1/migrate-from-old
Headers:
  x-migration-secret: <your MIGRATION_SECRET>
  Content-Type: application/json
Body: {}
```

Optional scoping: `{"tables": ["campuses", "outreach_leads"]}` or `{"skipStorage": true}`.

It's idempotent (upserts by id) — safe to re-run anytime. The response is a per-table
report of copied row counts.

## What comes over

All 170 campuses (IPEDS tuition/enrollment, colors, course codes, approval + assignment
state), professor leads with full email history, email templates, VA accounts and
per-date assignments, saved views, TAM estimates, campus intelligence, courses/chapters/
topics, all 2,531 teaching assets (content columns only), chapter master content, banked
questions, study-tool content, the full CEQ system including tutoring-note files, and
every captured landing-page lead.

## After migration

- Regenerate Supabase types (Lovable does this automatically on next sync).
- Sign in to the new app once, then update `va_accounts.user_id` rows to the new auth
  user IDs (old auth users don't transfer).
- When email sending goes live: set `RESEND_API_KEY` and re-point the Resend webhook
  to this project's webhook function. CEQ AI functions need `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` when those are ported.
- Delete the `migrate-from-old` function and its secrets once you're satisfied.
