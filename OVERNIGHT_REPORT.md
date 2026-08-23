# Overnight Report — Rep + Trackable Link Platform V1

**Branch / worktree:** `overnight/referral-platform-v1` at `C:/Users/lee/Documents/sa-referral-platform`
**Base:** `65d66c88` (origin/main head, same base as the concurrent Growth Admin session)
**Date:** 2026-08-23 (overnight, unattended)
**Status:** Built, typechecks/builds clean, unit tests green. **Migration NOT applied** (manual-apply). **Not deployed. Not merged. No real commissions issued.**

---

## 1. What this delivers

One **generic** attribution system — not one tracker per source type. Every source (campus rep,
student ambassador, Greek chapter, council, national org, flyer/QR, influencer, alumni, NIL/athlete,
or a scratch one-off promo) is the same thing:

```
Partner  →  Trackable Link (/r/<code>)  →  Click  →  Conversion (signup / purchase)  →  Commission
```

Admin console at **`/admin/reps`** with four tabs, exactly per spec:

- **Create link** — the Scratch Link Lab. Pick or create a partner, paste a destination, name the
  campaign, keep the default commission or set a custom one, hit Create → short `/r/<code>` URL + QR
  appear immediately with copy / download. No wizard.
- **Partners** — the generic partner registry (add/edit in a dialog) + each partner's funnel.
- **Links** — every link + its funnel; row → detail drawer (destination, partner, campaign, created,
  short URL + QR, effective commission rule, recent conversions, active toggle).
- **Conversions** — overall KPI row, the commission ledger (status editable: pending → approved →
  paid / void), the conversion feed, and a **Sync order purchases** reconcile.

The console is a self-contained shell (its own `AdminGate` + its own top-tab nav). It deliberately
does **not** touch the shared `/outreach` sidebar (`src/routes/outreach.tsx`) so it can't collide
with the concurrent Growth Admin nav work.

---

## 2. Schema — reused vs. created

### Created (one migration, manual-apply, NOT yet applied)
`migration/supabase-migrations/20260823_2330_referral_platform.sql` — five tables, deny-by-default
RLS, idempotent (`create ... if not exists`, `drop policy if exists`), `BEGIN;…COMMIT;`, a proof
`SELECT`, and `notify pgrst`. Follows the repo README naming (`YYYYMMDD_HHMM_*`).

| Table | Purpose |
|---|---|
| `referral_partners` | The generic source. `type` is a **label**, never a codepath. Inline default commission rule (`default_commission_type` percent/flat/none + `default_commission_rate`). `is_test`. |
| `referral_links` | One trackable `/r/<code>` per row. `destination_url` (any Survive URL/path), `campaign`, optional per-link commission override, optional `utm_*`, `active`, `is_test`. |
| `referral_clicks` | Append-only click log. **IP is hashed** (`ip_hash`), never stored raw. `is_bot`, `is_test`, `anon_id`. |
| `referral_conversions` | signup / purchase / chapter_purchase attributed to a link. Unique `(subject_type, subject_id, kind)` → recording is idempotent. `amount_cents` is server-computed. |
| `referral_commissions` | The ledger. Snapshotted `commission_type`/`rate`/`basis_cents`/`commission_cents`, `status` (pending/approved/paid/void), `is_test`. |

**To apply:** paste the file into the Supabase SQL editor (project `unvxagsledbsdoremqeb`). Until
then, the console renders but every list is empty and writes fail loudly in the UI toast — nothing
else in the app is affected (the code degrades; the order hook is wrapped and silent).

### Reused (not duplicated)
- **`orders`** (`total_cents`, `status`, `email`) is the real revenue source for order purchases. The
  reconcile reads it server-side — revenue is never taken from the client.
- **Canonical chapter links** `/go/<school>/<chapter>` (via `goPath()`), the flyer/QR generator
  (`flyer.server.ts`, `qrcode`), and the OG cards are all **left as-is**. A chapter flyer is just a
  partner + link whose `destination_url` is `/go/<school>/<chapter>` (see §8). No parallel link scheme.
- **`qrcode`** (already a dependency) generates the QR — server-side, in `referral.server.ts`, same
  pattern as `flyer.server.ts`.

### NOT collided-with, but worth noting
- The existing **campus-rep recruitment** flow (`rep.tsx`, `$school.rep.tsx`, `campus-rep.functions.ts`,
  admin `outreach.reps.tsx`) stores rep *applications* in the `referrals` table with a `[CAMPUS REP]`
  prefix, and there's an unapplied `campus_rep_applications` table. That is **recruitment intake**, a
  different concept from an active *partner with a link + commission*. I left it untouched. An approved
  application can become a `referral_partners` row (type `campus_rep`) — a natural, non-breaking bridge
  to wire later. See §6.

---

## 3. Attribution rule (explicit, conservative, documented)

**Last eligible referral click within a 30-day window, first-party cookie — single-touch.**

- Every `/r/<code>` hit sets/overwrites an **HttpOnly** first-party cookie `sa_ref = <code>~<epoch>`
  with a 30-day `Max-Age`, plus a stable `sa_anon` visitor id. **Last click wins.**
- A conversion server-fn reads `sa_ref`; if its timestamp is within `REFERRAL_WINDOW_DAYS` (30) it
  attributes the conversion to that link's partner. Outside the window → not attributed.
- Conversions are **idempotent** per `(subject_type, subject_id, kind)` — re-processing an order
  never double-counts.
- Configurable in one place: `REFERRAL_WINDOW_DAYS` in `src/lib/referral-shared.ts`. Model tag
  `last_touch_30d` is stored on every conversion for auditability.
- No multi-touch, no client-supplied revenue, no fingerprinting.

---

## 4. Redirect implementation (performance)

`src/routes/r.$code.tsx` — a **pure server route** (`server.handlers.GET`, same mechanism as
`api.flyer.*`). No client bundle, no interstitial.

- The only awaited work before redirecting is the single indexed code lookup needed to know the
  destination. The click insert is wrapped in its own try/catch — a DB hiccup can **never** turn a
  redirect into an error or a delay-to-failure.
- Sets `Location` + `Set-Cookie` and returns `302` with `cache-control: no-store`.
- Unknown / disabled / archived code → `302` to `/` (a printed flyer never dead-ends).
- Appends the link's `utm_*` (and a readable `ref=<code>` marker) to the destination without
  clobbering existing query params.
- Bots (`user-agent` heuristic) are flagged on the click row and excluded from click KPIs.

---

## 5. Test-mode behavior

- A conversion/commission is `is_test` when its **link or partner** is `is_test` (or a caller forces
  it). Test rows are **excluded from all real totals** and hidden unless "Show test data" is on (a
  per-browser toggle, `sa-reps-show-test`). This mirrors the repo's existing `is_test` convention
  (`comms_sends`, `student_entitlements`, `probe_attempts`).
- **Test Mode never issues a real commission**: test purchases create commissions marked `is_test`,
  which the real-money view drops.
- Clicks on a test link are marked `is_test` too.

---

## 6. Commission logic

- Effective rule = link override if set, else partner default (`effectiveRule`).
- `percent`: `round(basis_cents * rate / 100)`; `flat`: flat cents regardless of basis; `none`: 0.
- On an attributed **purchase with positive revenue**, one `referral_commissions` row is written with
  the rule **snapshotted** (later rule edits don't rewrite history), `status = pending`.
- Admin changes status pending → approved → paid, or void, in the ledger. **Payouts are not
  automated** — this is the ledger only.
- Pure, unit-tested math: `tests/referral-commission.test.ts` (9 tests, green).

**How purchases actually get recorded (the honest, low-risk wiring):**
1. At **order submit** (`submitOrder`, `orders.functions.ts`) a single guarded, non-throwing hook
   records a **signup** conversion (`subject_type='order'`, revenue 0) from the `sa_ref` cookie. This
   is the durable attribution join. It can never break order creation (wrapped in try/catch).
2. Most orders are unpriced "requests" at submit — Lee prices/marks them paid later. The **Sync order
   purchases** button (Conversions tab) scans those order-signup conversions, reads each order's
   *current* `total_cents`/`status` server-side, and for any now paid+priced with no purchase
   conversion yet, records the **purchase + commission** from the real order total. Idempotent.
3. **Manual entry** (`recordManualConversion`) exists for corrections / off-order purchases.

Revenue is therefore always computed server-side from real order records — never trusted from the
browser.

---

## 7. Existing rep-platform integration

- The public rep-recruitment surfaces and their admin queue were **left intact** — no behavior change.
- The bridge to make an approved campus-rep a real partner is one insert into `referral_partners`
  (type `campus_rep`) + a link in the Lab; the console's partner search/create already supports it. I
  did **not** auto-migrate applications tonight (they're a different concept and auto-migration risks
  duplicating partners); documented as the intended next step.
- No public partner portal was built (none exists today; spec said skip unless present). A rep-facing
  stats page can later read the same `referral_*` tables filtered to one partner — the data model
  already supports it (`byPartner` funnel).

---

## 8. Social / influencer / chapter use cases (all one path)

- **Former Ole Miss athlete → Ole Miss Exam 1, custom commission:** in the Lab, type the athlete's
  name (creates an `influencer` partner on the fly), destination `/ole-miss` (or the specific exam
  page), set a custom commission, Create. No NIL-specific logic anywhere.
- **Chapter flyer:** partner type `chapter`, destination `/go/<school>/<chapter>`, campaign
  "Chapter Flyer". Same tables, same funnel. The `/r/<code>` layer sits in front of the existing
  canonical `/go/` URL — it does not replace it.

---

## 9. Files

**New**
- `migration/supabase-migrations/20260823_2330_referral_platform.sql`
- `src/lib/referral-shared.ts` (pure types/constants/math; client+server safe)
- `src/lib/referral.server.ts` (codes, QR, IP hash, cookies, click record, the one conversion+commission path)
- `src/lib/referral-stats.server.ts` (paged funnel aggregation)
- `src/lib/referral-admin.functions.ts` (partners/links/conversions/commissions server fns + reconcile)
- `src/routes/r.$code.tsx` (redirect)
- `src/routes/admin.reps.tsx` (shell) + `admin.reps.index.tsx` (Lab) + `.partners.tsx` + `.links.tsx` + `.conversions.tsx`
- `src/components/reps/RepsKit.tsx` (shared UI bits)
- `tests/referral-commission.test.ts`

**Modified (one file, additively)**
- `src/lib/orders.functions.ts` — one guarded, non-throwing attribution hook after the order insert.

**Untouched shared files** — `src/routes/outreach.tsx` (Growth Admin's nav), the `/go/` link
system, flyer/OG generators, rep-recruitment flow.

---

## 10. Verification run

- `bun install` — clean.
- `bun run build` — see console output (regenerates the route tree; the four `/admin/reps` routes +
  `/r/$code` compile).
- `bun test tests/referral-commission.test.ts` — **9 pass / 0 fail.**
- Type-safety: new tables are reached with `as any`/`as never` casts (repo convention — no typegen
  for new tables), so `tsc` stays green without regenerating `src/integrations/supabase/types.ts`.

---

## 11. Blocked / needs Lee (not done tonight, by policy)

- **Apply the migration** (manual, Supabase SQL editor) — required before the console shows data.
- **Deploy** — not done (no production deploy per instructions).
- **Merge** — not merged to main.
- **Real Stripe purchases** — the entitlement/Stripe purchase path is "Phase B, not yet wired" in
  this repo, so there's no live purchase insert to hook tonight. When it lands, call
  `recordConversionForRequest(request, { kind: 'purchase', subjectType: 'entitlement', subjectId, amountCents })`
  from that server handler (server-side price only). Documented; the helper is ready.

## 12. Concurrent Growth Admin — collision notes

- No shared files edited except an additive hook in `orders.functions.ts` (unlikely to be in Growth
  Admin's scope). Nav lives entirely in my own `admin.reps.tsx` shell.
- **Possible future collision:** if Growth Admin introduces a top-level `/admin` **layout** route
  (`src/routes/admin.tsx`), my `/admin/reps*` routes would nest under it. That is usually fine (they'd
  gain a shared chrome), but if their layout assumes different auth or wrapping, reconcile at merge:
  either keep `admin.reps.tsx` self-contained (it already is) or move it under their layout. No
  duplicate *concepts* were invented — all referral/attribution/commission logic is namespaced
  `referral_*` / `/admin/reps`.
