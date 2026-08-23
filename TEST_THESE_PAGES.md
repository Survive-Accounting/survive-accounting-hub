# Test These Pages — 2026-08-23 morning

Each overnight branch lives in its own **worktree**; its new routes only exist there. Start that
worktree's dev server, then open the URLs (dev server default port shown is `5233`, but check the
`preview_start` output — the sandbox may pick another).

| Branch | Worktree folder | Run |
|---|---|---|
| test-mode | `sa-ui-polish` (switch to branch) or its own | `bun run dev` |
| partner-simplify | `sa-ui-polish` | `bun run dev` |
| growth-admin-v1 | `sa-growth-admin` | `bun run dev` — **apply migration first** |
| referral-platform-v1 | `sa-referral-platform` | `bun run dev` — **apply migration + salt first** |
| greek-roster-expansion | any (data is live) | any worktree's dev server |

---

## 🔴 MUST TEST

### 1. Chapter lifecycle — Test Mode  *(branch: `test-mode`)*
The full claim → approve → dashboard path, using the Test Mode panel. This is your stated gate
before this branch merges.

`http://localhost:5233/go/test-university/test-chapter?feedback=1&t=Lee&email=lee@surviveaccounting.com&testmode=1`

Test: **Show steps** → member join → **Claim your chapter** (new form) → **Test panel → Approve
claim** → dashboard magic link → share materials. Confirm the banner names your email, the activity
log shows `[TEST]` sends routed to you, and **Reset fixture** returns to step 1.

### 2. Campus council partner page  *(branch: `partner-simplify`)*
`http://localhost:5233/partners/council/university-of-arizona/ifc`

Test: hero (Arizona bolt, "for ACCT 200 · ARIZONA") → **What your chapters get** preview (exam tabs,
Exam 1 topics, worked question) → **Your chapters** (Copy link / Open page) → **Share with all
chapters** modal (copy email / message / links) → 3 FAQs. Then mobile (share = bottom sheet).

### 3. National org partner page  *(branch: `partner-simplify`)*
`http://localhost:5233/partners/national/kappa-kappa-gamma`

Test: preview **campus switcher** (Alabama → others) → **directory** search + `All / Ready to share
/ Active` filter + pagination (83 campuses) → **Share with chapters** modal → repeat CTA.

### 4. Growth Admin  *(branch: `growth-admin-v1` — APPLY MIGRATION FIRST)*
`http://localhost:5233/admin/growth`

Test each tab (overview, campuses, chapters, councils, orgs, contacts, outreach). **Before it ever
deploys, confirm the P1 auth gap** — the server functions trust the client-side gate only.

### 5. Referral platform  *(branch: `referral-platform-v1` — APPLY MIGRATION + SALT FIRST)*
`http://localhost:5233/admin/reps` — create a partner + link, then hit the public redirect:
`http://localhost:5233/r/<code>` (use a code you just created) and confirm it 302s to the target
and sets the `sa_ref` attribution cookie. Same **P1 auth-gap** caveat.

---

## 🟡 SHOULD TEST

### Generic partner pages  *(partner-simplify)*
- `http://localhost:5233/partners/campus-councils` — hero, council picker, example preview
- `http://localhost:5233/partners/national-organizations` — org **search**, "Add it", preview

### Chapter claim form + admin review  *(test-mode)*
- Claim form: any `/go/<school>/<chapter>` → step 2 → the new custom role picker, "Claim my chapter →"
- Admin review: `http://localhost:5233/outreach/greek-claims` (sign in) — submitted-time, Approve chapter

### Newly imported campuses resolve  *(greek data — live)*
Spot-check a few of the 61 imported campuses' `/go/` pages load and list chapters:
- `http://localhost:5233/partners/council/florida-state-university/ifc`
- `http://localhost:5233/partners/council/rutgers-university/panhellenic`
- `http://localhost:5233/university-of-virginia`

---

## ⚪ OPTIONAL / INTERNAL

- Growth Admin sub-tabs individually (`/admin/growth/contacts`, `/admin/growth/outreach`)
- Referral sub-tabs (`/admin/reps/partners`, `/admin/reps/links`, `/admin/reps/conversions`)
- Stripe test webhook endpoint `GET /api/stripe/webhook` (should 200; unsigned POST 400) *(test-mode)*

---

## Template coverage (representative, not exhaustive)

| Template | Representative URL | Branch |
|---|---|---|
| Homepage | `/` | main |
| Campus w/ course code | `/university-of-arizona` (ACCT 200) | main |
| Campus (imported) | `/iowa-state-university` | main + live data |
| Student player | `/` → exam tabs / topic accordion / Save | main |
| Council (personalized) | `/partners/council/university-of-arizona/ifc` | partner-simplify |
| Council (generic) | `/partners/campus-councils` | partner-simplify |
| National (personalized) | `/partners/national/kappa-kappa-gamma` | partner-simplify |
| National (generic) | `/partners/national-organizations` | partner-simplify |
| Greek chapter | `/go/university-of-arizona/phi-kappa-psi` | main |
| Test fixture chapter | `/go/test-university/test-chapter?testmode=1&feedback=1&t=Lee&email=lee@surviveaccounting.com` | test-mode |
| Chapter dashboard | `/chapters/dashboard` | test-mode |
| Growth Admin | `/admin/growth` | growth-admin-v1 |
| Referral admin | `/admin/reps` | referral-platform-v1 |

---

## First 10 URLs to open

1. `/go/test-university/test-chapter?feedback=1&t=Lee&email=lee@surviveaccounting.com&testmode=1`
2. `/partners/council/university-of-arizona/ifc`
3. `/partners/national/kappa-kappa-gamma`
4. `/partners/campus-councils`
5. `/partners/national-organizations`
6. `/admin/growth`  *(growth worktree, migration applied)*
7. `/admin/reps`  *(referral worktree, migration applied)*
8. `/r/<code>`  *(referral — after creating a link)*
9. `/partners/council/florida-state-university/ifc`  *(imported-data spot check)*
10. `/outreach/greek-claims`  *(claim review)*
