# Site QA Cockpit — Implementation

`/admin/site-qa` is Lee's operational cockpit. It answers six questions with as
little reading as possible:

1. **What page templates exist?** → the template inventory.
2. **What changed recently?** → the *Recently changed* tab + per-row "changed Xh ago".
3. **What needs verifying?** → the default *Needs review* tab.
4. **What's actually used?** → the *Traffic* tab (PostHog) + per-row view counts.
5. **Is anything breaking?** → Sentry error badges + the "needs attention" count.
6. **What links do I open to test?** → representative example URLs on every row, one click to *Open* / *Copy* / *Test Mode*.

## Architecture principle — don't rebuild commodity tooling

Site QA is a **thin combiner**, not a clone:

| System | Owns |
|---|---|
| **PostHog** | page views, visitors, funnels, session replay, feature flags |
| **Sentry** | application errors, stack traces, debugging |
| **Vercel** | deployments, deployment status |
| **Survive / Supabase** | template inventory, dynamic page counts, representative URLs, last-verified state, QA notes |

Deep investigation links out (`View analytics ↗`, `View errors ↗`, `View deployment ↗`). We do **not** store traffic or error data in Survive.

---

## 1. Page-template manifest

**`src/lib/site-qa/manifest.ts`** — the maintained source of truth. Each `TemplateDef`
carries: `id`, `label`, `category`, one-line `description`, display `routePattern`,
the route files it `owns`, `extraFiles` (shared components/functions), a `countKey`
(how to count live pages), `trafficPaths`, and `testMode`/`internal` flags.

It is deliberately **dependency-free** (no imports, no `@/` alias) because it is
loaded three ways: the browser UI, the server functions, and — at build time — the
Vite change-detection plugin (which resolves it before path aliases exist).

Templates were discovered from the actual codebase (93 route files), grouped into
~26 templates. Redirects, dev labs, and API/cron endpoints are listed in
`IGNORED_ROUTES` with a reason rather than being silently dropped.

### New-template detection (spec §27)

**`src/lib/site-qa/manifest.coverage.test.ts`** asserts every file in `src/routes`
is owned by exactly one template **or** listed in `IGNORED_ROUTES`. Add a page →
the test fails until you register it. This is what makes "a new page can't silently
exist untested" mechanically true.

## 2. Verification storage

**Migration:** `migration/supabase-migrations/20260823_1600_site_qa.sql` creates
`qa_verifications` (one row per `template_id`):

- `verified_at`, `verified_by`, `verified_version` (content hash at verify time),
  `verified_sha` (deployed commit), `note`, `pinned_examples jsonb`.
- RLS on, **no policies** → reachable only via the service-role key inside
  admin-gated server functions.
- It stores **no** traffic/error data.

The app degrades gracefully if the table is absent (reads are wrapped in
try/catch and fall back to "never verified"), so the cockpit works before the
migration is applied — it just can't persist. **This migration is manual-apply**
(see "What Lee still needs to do").

## 3. Change detection

Explicit manifest + content hashing, chosen over dependency tracing because
"simple and reliable beats magical", and over filesystem mtime because production
is a serverless bundle where mtimes are meaningless.

- **`src/lib/site-qa/versions.node.ts`** (build-time only) hashes each template's
  source files (sha256, CRLF-normalized, path-mixed) and best-effort reads the
  last git commit time per template.
- **`scripts/vite-site-qa.ts`** is a Vite plugin exposing the result as the
  virtual module **`virtual:site-qa-versions`** (`{ builtAt, templates: { id: { hash, changedAt } } }`).
  Wired in `vite.config.ts`. Computed once per build and baked into the bundle.
- At request time the server compares the current `hash` to the stored
  `verified_version`. Differ → **Changed since verified**.

*Dev note:* the hash map is computed once per dev process; restart `vite dev` to
refresh it after editing template sources. Production builds are always fresh.

## 4. QA states (spec §7)

Derived in **`src/lib/site-qa/status.ts`**:

| State | Rule |
|---|---|
| 🔴 **Error detected** | Sentry reports recent errors for the template |
| 🟠 **Changed since verified** | current hash ≠ verified hash |
| ⚪ **Never verified** | no verification row |
| ✓ **Verified** | verified hash == current hash, no errors |

Errors win over everything. Priority for the *Needs review* list:
`error → changed → never → verified`, then by **30-day traffic** (spec §23) — the
pages most users see rise to the top; a critical error is never buried by low traffic.

## 5. PostHog integration

### Browser (event capture)
**`src/lib/analytics.ts`** is the single event layer. It:
- initializes PostHog **only** when `VITE_PUBLIC_POSTHOG_KEY` is set (else a no-op);
- loads `posthog-js` via dynamic import (no key ⇒ never fetched);
- swallows all errors (analytics never breaks a page);
- captures SPA pageviews from the router (wired in `src/routes/__root.tsx`).

**Event taxonomy** (prefer properties over new event names):
`school_selected`, `professor_selected`, `exam_opened`, `topic_opened`,
`problem_type_opened`, `question_answered`, `study_mode_selected`,
`progress_save_started`, `progress_saved`, `chapter_member_joined`,
`chapter_claim_started`, `chapter_claimed`, `share_link_copied`,
`flyer_downloaded`, `meeting_slide_downloaded`, `qr_landing`, `checkout_started`,
`purchase_completed`. Shared props: `campus_id`, `course_id`, `professor_id`,
`exam`, `topic_id`, `problem_type_id`, `chapter_id`, `council_id`,
`national_org_id`, `campaign`, `referral_source`.

Call it from a surface with `import { track } from "@/lib/analytics"` →
`track("exam_opened", { campus_id, exam })`. (There were **no** pre-existing
PostHog events to reuse; homegrown `expand_events`/`landing_events` remain as-is.)

### Server (read for the Traffic tab)
**`src/lib/site-qa/integrations.server.ts`** runs one HogQL query for top pages by
pageviews, classifies each path to a template (`src/lib/site-qa/classify.ts`), and
rolls up to page-type totals (spec §16). Secrets stay server-side. Deep links to
PostHog insights + replays are provided (spec §17). "pageviews" is labeled as
views, not "visits", to match the metric.

## 6. Sentry integration

`getSentryErrors()` reads recent unresolved issues via the Sentry API and buckets
them to templates **best-effort** (scanning `culprit`/`title`/`metadata` for a URL
path, then classifying it). Templates with mapped errors get the 🔴 badge; a global
`View errors ↗` link covers the rest. Unconfigured/failed ⇒ no badges, no crash.

**SDK (error capture):** `@sentry/react` is wired in **`src/lib/sentry.ts`** — init
in `__root.tsx` (guarded by `VITE_PUBLIC_SENTRY_DSN`, dynamic import, prod-only,
no-op when unset), the root error boundary reports via `captureError`, and every
route change tags the event with `route` so issues group per page. Set the DSN and
errors start flowing; the badges then light up. Per-template mapping is still
best-effort (the issues-list API doesn't return arbitrary tags), but the route
tagging makes the culprit/path scan land far more often.

## 7. Vercel integration

`getLatestVercelDeploy()` reads the latest production deployment (state + age +
inspector link) when `VERCEL_API_TOKEN` is set. Without a token it still surfaces
the deployed commit from `VERCEL_GIT_COMMIT_SHA` (injected at build). No Vercel
observability is recreated.

## 8. Dynamic page counts (spec §13)

`src/lib/site-qa/data.server.ts` counts **real routable** pages, excluding archived
records and the Test University fixture:

| Template | Source | Filter |
|---|---|---|
| Campus Page | `schools.generated.ts` | seeded campuses (excl. `test-university`) |
| Greek Chapter | `campus_greek_chapters` | `slug NOT NULL`, `archived_at NULL`, campus not archived/test |
| Council pages | chapters × 4 councils | distinct (campus, council) via `councilMatches()` (never `.eq()`) |
| National Org | `greek_orgs` names | distinct `orgSlugify(name)` among routable chapters |
| Foundations scenario | `courses→chapters→je_scenarios` | mirrors `scripts/gen-sitemap.ts` |

Counts are paged (PostgREST caps at 1000 rows/request). Templates vs. generated
public pages are distinguished in the UI (a template count vs. its `pages` count).

## 9. Representative URLs (spec §12)

`data.server.ts` derives up to 3 example URLs per dynamic template from live data
(e.g. campus, chapter, council, national-org). Admins **pin** a preferred example
(the pin becomes the row's default `Open` target) — stored in
`qa_verifications.pinned_examples`. Every example offers **Open**, **Copy link**,
and — where the template supports it — **Open in Test Mode**.

## 10. Test Mode (spec §26)

Test Mode is a global armed state (localStorage), armed by URL params. The cockpit
builds the launch URL for any example:
`…?feedback=1&t=<who>&email=<admin>&testmode=1`. Surfaced on Student Player, Greek
chapter/claim, Checkout (order-intake), and other `testMode: true` templates.

## 11. Security (spec §28)

- The route is wrapped in `AdminGate` (the app-wide client passcode).
- **Every** server function calls `assertAdmin(accessToken)` — it resolves the
  caller's Supabase token to an email and checks it against the `lee@ / king@`
  allow-list. This is a **real server-side gate**, stronger than the rest of
  `/outreach` (which relies on the client gate alone).
- Analytics/Sentry/Vercel **secrets are read from `process.env` inside handlers
  and never returned** to the client. Only the browser-safe `VITE_PUBLIC_POSTHOG_KEY`
  reaches the client, by design.

## 12. Graceful failure (spec §29)

Every external read returns `{ available: false, reason }` instead of throwing.
The core template/verification system runs entirely on Supabase + the baked
version map, so the cockpit loads and stays useful even if PostHog, Sentry and
Vercel are all down.

---

## File map

```
src/lib/analytics.ts                     PostHog browser layer + event taxonomy
src/lib/sentry.ts                        Sentry browser SDK init + route tagging
src/lib/site-qa/manifest.ts              template inventory (source of truth)
src/lib/site-qa/manifest.coverage.test.ts  new-template detection test
src/lib/site-qa/status.ts                QA state derivation
src/lib/site-qa/classify.ts              URL → template classifier
src/lib/site-qa/types.ts                 shared client/server types
src/lib/site-qa/versions.node.ts         build-time content hashing (+ git mtime)
src/lib/site-qa/integrations.server.ts   PostHog / Sentry / Vercel reads
src/lib/site-qa/data.server.ts           qa_verifications store + counts + examples
src/lib/site-qa/site-qa.server.ts        orchestrator (overview + traffic + admin gate)
src/lib/site-qa.functions.ts             createServerFn endpoints (admin-gated)
src/routes/admin.site-qa.tsx             the cockpit UI
scripts/vite-site-qa.ts                  Vite plugin → virtual:site-qa-versions
src/types/virtual-site-qa.d.ts           virtual-module type
migration/supabase-migrations/20260823_1600_site_qa.sql   qa_verifications table
```

## What Lee still needs to do

1. **Apply the migration** `20260823_1600_site_qa.sql` (manual-apply, same as the
   other `migration/supabase-migrations/*` — via the Supabase SQL editor /
   `run_sql.ts`). Until then, verification/pins/notes can't persist (everything
   else works).
2. **PostHog** — create a project, then set in Vercel env:
   - `VITE_PUBLIC_POSTHOG_KEY` (project key, browser-safe) + `VITE_PUBLIC_POSTHOG_HOST`
   - `POSTHOG_PERSONAL_API_KEY` (secret) + `POSTHOG_PROJECT_ID` for the Traffic tab.
3. **Sentry** — browser capture: `VITE_PUBLIC_SENTRY_DSN` (Sentry → Settings →
   Projects → your project → Client Keys (DSN)). Read/badges (server):
   `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`.
4. **Vercel deploy chip** (optional) — `VERCEL_API_TOKEN` (+ `VERCEL_PROJECT_ID`,
   `VERCEL_TEAM_ID` if applicable).

All four are optional; missing ones degrade gracefully. Nothing here deploys
automatically.
