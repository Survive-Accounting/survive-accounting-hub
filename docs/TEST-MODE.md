# Test Mode — student guided run (Phase A)

Test Mode wraps the ordinary student experience so a tester can walk through the whole
"land → pick school → match professor → practice → notify → save → buy → return" path,
tagged so nothing pollutes real analytics. Same product code paths; every action is opted in
to `is_test = true`.

## Arm & disarm

**Arm via URL** (recommended — shareable link):

```
https://surviveaccounting.com/?feedback=1&t=Lee&email=lee@surviveaccounting.com&testmode=1
```

- `feedback=1` and `testmode=1` are interchangeable — either arms Test Mode.
- `t=<name>` and `email=<tester>` set who owns the run (surfaced in the top bar).
- On mount the URL params are stripped from the address bar (copy-paste of the current URL
  won't re-arm a real student), and `localStorage.sa-test-mode` keeps the arming.

**Disarm**: click **Exit Test Mode** in the drawer, or visit any URL with `?testmode=0`.

**Start student test over**: drawer footer. Resets the run's step state and clears local
session caches (practice-session id, resume, coverage). Never touches real data.

## The 9-step run

The right-side drawer shows the checklist; every step auto-detects when possible.

| # | Step | Auto-detect trigger |
|---|------|---------------------|
| 1 | Land on page | Drawer mount (page load with test mode armed) |
| 2 | Pick a school | `school` state resolves (route slug OR picker click) |
| 3 | Match professor (or Skip) | professor picked OR `profDone` flips (Skip counts) |
| 4 | Start Exam 1 | `pickSet(setId)` fires |
| 5 | Complete CEQ set | End-of-set screen renders with ≥1 correct + ≥1 incorrect |
| 6 | Contextual notify | `submitNotify` returns; tagged `is_test=true` |
| 7 | Save progress | `signInWithOtp` sent to tester email; metadata `sa_is_test:true` |
| 8 | Buy paid content | Stripe test checkout completes (**Phase B — coming**) |
| 9 | Verify return | Auth restored + resume context consumed |

Steps that don't auto-detect (Phase A) can still be marked by any component via
`markStep("id", meta)` from `@/lib/test-mode`.

## What gets tagged

| Path | Tagging |
|------|---------|
| `practice_attempts` | `is_test = testMode.enabled` (already existed as prop; now wired) |
| `campus_waitlist` (notify submits) | `is_test = true` when `submitNotify({..., isTest: true})` |
| `comms_sends` (`[TEST]` emails/SMS) | `is_test = true` — `sendTemplateEmail` prefixes `[TEST]` in subject; marketing cap + suppression skipped |
| Founder alerts | routed with `isTest`, land on tester email |
| Magic-link auth | `signInWithOtp({..., data: { sa_is_test: true }})` — the auth user carries the flag on `user_metadata` |
| Stripe checkout (Phase B) | `is_test=true` on `student_entitlements`; Stripe test keys used |

## Admin view

**`/outreach/test-mode`** — the guided-run activity feed. Grouped by session id, most recent
first, auto-refreshes every 8s. Each row shows the step + event + status; errors are red.

## Data

| Table | Owner | Notes |
|-------|-------|-------|
| `student_entitlements` | Stripe webhook (Phase B) + admin | RLS: student reads only own; grants come from `service_role` only. Unique on (user, kind, campus). |
| `test_mode_activity` | anon insert; admin reads via server fn | Append-only log |
| `campuses` (`test-university` slug) | seed | Falls back to Starter Map for exam content — real CEQ questions are reused |
| `campus_lead_suggestions` (`test_mode_seed` source) | seed | Two test professors + one intentionally unlisted for the write-in path |

## Files

- `src/lib/test-mode.ts` — URL parser, `useTestMode()`, `useTestSteps()`, `markStep`,
  `logTestEvent`, `bootstrapTestModeFromUrl`.
- `src/lib/test-mode.functions.ts` — `logTestModeActivity`, `grantTestEntitlement`,
  `listTestModeActivity`.
- `src/components/test-mode/TestMode.tsx` — the rust bar + the right-side drawer.
- `src/routes/outreach.test-mode.tsx` — the admin activity feed.
- `migration/supabase-migrations/20260823_1000_test_mode.sql` — Test University +
  `student_entitlements` + `test_mode_activity`.

## Phase B (Stripe checkout)

Once the four `STRIPE_PRICE_*` env vars are set (they are, 08-23), Phase B adds:

- `/api/stripe/checkout` server fn (creates a Stripe Checkout Session)
- `/api/stripe/webhook` (grants `student_entitlements`; `is_test=true` when the Session is
  in test mode)
- Paid-tab unlock in the player (reads `student_entitlements`)
- Step 8 auto-detects on webhook receipt (drawer subscribes via polling or channel)

Nothing above changes; Phase B is additive.

## Rotation

`STRIPE_SECRET_KEY_TEST` was pasted in a session transcript. Rotate in Stripe Dashboard
after the initial Phase B smoke test is done.
