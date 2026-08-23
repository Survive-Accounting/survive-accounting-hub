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

---

## Phase B — Stripe checkout (08-23)

Merged 08-23. Adds real Stripe test-mode checkout for Exam 2 / Exam 3 / Final / Semester Pass.

### Files
- `src/lib/stripe.server.ts` — one lazy Stripe client (`STRIPE_SECRET_KEY_TEST` first,
  `STRIPE_SECRET_KEY` fallback for live). `stripeIsTest()` derives from the key prefix, never the
  client. `priceIdForKind` / `kindForPriceId` keep checkout and webhook in sync.
- `src/lib/student-entitlements.functions.ts` — `createCheckoutSession` (server fn) creates a
  Stripe Checkout Session and returns its URL; `listMyEntitlements` returns the caller's kinds
  (a `pass` grant auto-expands to include exam_2/3/final).
- `src/lib/use-entitlements.ts` — client hook. Refreshes on auth change, focus, and manual
  `bumpEntitlements()` (fired after Stripe return).
- `src/routes/api.stripe.webhook.tsx` — the webhook. Verifies `Stripe-Signature` with
  `STRIPE_WEBHOOK_SECRET_TEST` (or `STRIPE_WEBHOOK_SECRET`). On `checkout.session.completed`
  inserts a `student_entitlements` row (`source='stripe'`, `is_test` from key prefix). Dedupes
  on the unique index (Stripe retries land safely).

### Flow
1. Student clicks **Buy for $50** on a paid tab. Not signed in → `SaveProgressDialog` opens
   (they magic-link in first, then click Buy again).
2. `createCheckoutSession` returns a Stripe Checkout URL; the client redirects.
3. Stripe processes payment; on completion Stripe hits `/api/stripe/webhook`.
4. Webhook verifies signature, looks up `metadata.user_id` + `metadata.kind`, inserts the
   entitlement row.
5. Stripe redirects the student back to `<returnPath>?checkout=success&kind=<kind>`.
6. The landing page detects `?checkout=success`, strips the query params, and polls
   `bumpEntitlements()` for ~6 seconds so the webhook has time to land. Once the entitlement
   arrives, the Poster switches to **✓ Unlocked**.
7. If Test Mode is armed, step 8 (Buy) auto-completes when the entitlement first appears.

### Stripe webhook setup (do this once, then never again)

1. Stripe Dashboard → **Developers → Webhooks → + Add endpoint**
2. Endpoint URL: `https://surviveaccounting.com/api/stripe/webhook`
3. **Listen to events on your account** (not connected accounts).
4. Under **Events to send** pick just: **`checkout.session.completed`**
5. Click **Add endpoint**.
6. On the endpoint's page, **Reveal → Signing secret**. Copy the `whsec_…` value.
7. Add it to Vercel as `STRIPE_WEBHOOK_SECRET_TEST` (Production + Preview + Development).
   Then redeploy so the new env var is picked up.

The webhook fails safely if the secret isn't set: it returns `503 webhook secret not
configured` and Stripe will surface a red mark in the dashboard. The Poster still shows the
Buy CTA — students can pay — but no entitlement lands. Set the secret before your first real
test purchase.

### Env vars (all in Vercel — Prod + Preview + Dev)
| Name | Value | Purpose |
|------|-------|---------|
| `STRIPE_SECRET_KEY_TEST` | `sk_test_...` | Server API calls (Checkout Session create) |
| `STRIPE_PUBLISHABLE_KEY_TEST` | `pk_test_...` | Reserved for future Elements/embedded flows |
| `STRIPE_PRICE_EXAM2` | `price_1U7UQi…` | line_item for Exam 2 |
| `STRIPE_PRICE_EXAM3` | `price_1U7URR…` | line_item for Exam 3 |
| `STRIPE_PRICE_FINAL` | `price_1U7UTG…` | line_item for Final |
| `STRIPE_PRICE_PASS`  | `price_1U7UTi…` | line_item for Semester Pass |
| **`STRIPE_WEBHOOK_SECRET_TEST`** | **`whsec_...`** | **Verifies incoming Stripe webhook** (add this next) |

### Rotation
`STRIPE_SECRET_KEY_TEST` was pasted in a chat transcript. After the first smoke test in prod,
Stripe Dashboard → Developers → API keys → **Roll** the `sk_test_...` key and re-add the new
value to Vercel.
