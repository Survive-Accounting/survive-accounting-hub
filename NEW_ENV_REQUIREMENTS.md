# New Environment / Migration Requirements — 2026-08-23

No secret values here. What each overnight branch needs before it works.

## Environment variables

| Variable | Purpose | Required? | Branch |
|---|---|---|---|
| `REFERRAL_IP_SALT` | Salt for hashing click IPs (privacy). Falls back to a **static** salt if unset. | Optional (set for real privacy) | referral-platform-v1 |
| `TEST_MODE_ENABLED` | Master switch for Test Mode (server-side lock). Already in local `.env`; add to Vercel **Preview** only. | Required for Test Mode | test-mode (Phase A merged; branch extends) |
| `STRIPE_SECRET_TEST` / `STRIPE_PUBLIC_TEST` | Stripe **test** keys for chapter-seat checkout. Already in Vercel. | Required for seat checkout | test-mode |
| `STRIPE_WEBHOOK_SECRET_TEST` | Verifies the Stripe test webhook signature. | Required for webhook | test-mode |

Growth Admin introduces **no new env vars**.

## Migrations to apply (Lee pastes DDL — service key cannot run DDL)

Apply in timestamp order. All only reference existing tables; independent of each other.

| Migration | Creates | Applied? | Effect if unapplied |
|---|---|---|---|
| `20260822_0900_chapter_seat_terms.sql` | `chapter_seat_pools`, `chapter_seat_assignments`, `chapter_share_events` | ✅ **Applied** (verified live) | — |
| `20260823_1200_growth_admin_contacts_outreach.sql` | `growth_contacts`, `growth_contact_roles`, `growth_outreach_events` | ❌ **Not applied** | Growth Admin degrades gracefully (contacts/outreach tabs empty; verified `42P01` handling) |
| `20260823_2330_referral_platform.sql` | `referral_partners`, `referral_links`, `referral_clicks`, `referral_conversions`, `referral_commissions` | ❌ **Not applied** | Referral platform is **entirely inert** — no fallback |

**Both unapplied migrations enable RLS with 0 policies.** That is fine for blocking anon PostgREST,
but does **not** protect the service-role server functions (see the P1 auth gap in the master audit).

## Data already applied (no migration file to run)

- **Greek roster expansion** — 61 campuses / 1,868 chapters were inserted directly to the live DB
  via service key (verified: 3,923 chapters total, 0 duplicate orgs). The branch's import *tooling*
  is not in `main` yet, but the data is live.

## Webhooks / cron

- **Stripe test webhook** (`/api/stripe/webhook`, test-mode branch): configure in the Stripe
  **test** dashboard → `STRIPE_WEBHOOK_SECRET_TEST`. Preview deploys are SSO-gated, so use the
  Stripe CLI locally or the production endpoint with the test secret (documented on the branch).
- No new cron jobs from the overnight branches.
