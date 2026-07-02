# Orders Work Stream — Context & Guardrails

*Survive Accounting · made-to-order exam prep · brief for the Claude Code session building the order flow + admin. **Read this first**, then orient with `git status` and the files named below. No secrets in this file.*

> **Corrections applied this session (0039 schema build) — supersede the original brief:**
> 1. **Migration number is `0039`, NOT 0038.** `0038_faculty_mobility.sql` (ProfIntel) already exists on `origin/main`; orders takes **0039**. Any later orders migration uses **0040+**.
> 2. **`insertWaitlist` (pricing-api.ts) writes via the ANON browser client, NOT service-role** (the original brief assumed service-role). Therefore **order writes must go through a SERVER function using the service-role client** (the `onboarding.functions.ts` pattern), which bypasses the deny-by-default RLS. Do **not** copy the anon `insertWaitlist` mechanism for orders — orders carry PII + pricing and must stay non-public.
> 3. New tables are reached via `as never`/`as any` **casts** (see `pricing-api.ts`), **not** a regenerated `types.ts`.

---

## This work stream
Build a **made-to-order exam prep** order flow + admin. A student requests custom prep for their exact **campus → course → professor → textbook chapters → exam date**, then chooses how they want it: **free teaser / made-to-order (paid) / 1-on-1**. Content is produced on demand and **paid on delivery** (no card today). This replaces the unsellable "materials" SKUs on the pricing section. Test student = **Ole Miss**.

## Working guardrails (match Lee's other sessions)
- **Stay on branch `orders-foundation`.** Never push to `main`. Never merge unless Lee explicitly says so. **Show diffs before committing.**
- **Verify every build:** `npx tsc --noEmit && bun run build` before committing.
- **Branch-then-preview:** validate on the branch's Vercel preview (`...-git-orders-foundation-...vercel.app`, hard-refresh / incognito). "Built" ≠ "deployed."
- **Anti-hallucination (this data drives who Lee emails + what he builds):** NEVER fabricate course codes, professor names, emails, or textbooks. Unknown = `null` + editable + student confirms. A wrong course code (or a rival school's detail) is worse than nothing.
- **Privacy:** student-facing identity = work Twilio number **(662) 565-8818** only. Lee's personal number **(601) 201-8759** appears ONLY on the post-payment page — never in this flow.
- **No secrets** in code or chat (Stripe / Twilio / Resend / Supabase creds live in Supabase secrets / env).

## ⚠️ Concurrency — other agents share this repo + live DB
Separate Claude Code sessions work other streams (ProfIntel, je-tool, etc.) concurrently in their own git worktrees, on this **same repo and same live Supabase project** (`unvxagsledbsdoremqeb`).
- **Do NOT** touch `profintel_*` / `faculty_mobility` tables or `profintel.ts` / `outreach.profintel*.tsx`.
- **Migration numbers are shared** (one live DB). **Orders owns `0039`.** Next free is `0040+` — never reuse a number.
- Stay in your worktree / on your branch. Other branches are stale; `origin/main` is your base.

---

## Locked product decisions (do not re-litigate)
- **Pricing** (pay on delivery; store a cents snapshot of what the student saw): 1 ch = **$30** · 2 = **$60** · 3 = **$75** · **4+ = $100 flat**.
- **Rush: +$49 flat**, shown **only** when standard delivery would land *after* the exam date — so it always reads as a real upgrade, never mandatory.
- **Standard delivery: ~2 days per chapter**, targeted before the exam when there's time. System computes it; the student never calculates. Use **"days," not "business days."**
- **No card today** → Stripe **payment link on delivery** (same pattern as the 1-on-1 link; Stripe is currently OFF — `ENABLE_PREPAY=false`, link empty — never hardcode fake URLs; gate buttons until set).
- **Sell by chapters, build by topics.** Students pick textbook chapters; topic mapping is internal. Capture an **optional free-text "what's tripping you up in this chapter?" per chapter** (structured topic tagging is Phase 2).
- **Professor:** free text + optional autocomplete; **always allow free text** (many students don't know the name).
- **Textbook:** confirm if known for that campus/course; else pick/search; **"not listed" → editable**. Never present a guessed textbook as confirmed. Capture the name reliably; cover images later.
- **Phone required.** No password / account creation.
- **The "stack" at the order summary** (value ladder; all three capture the same demand signal): **Free teaser** (email, $0) · **Made-to-order (recommended)** · **Premium 1-on-1** ($1,250, request contact).
- **Retire** the *Just One Test ($60)* and *Semester Membership ($150)* cards in `PricingPlans.tsx`; **keep** the Premium 1-on-1 "Reserve your slot" card visible for anyone skipping the flow.
- **Graceful fallback:** the flow must work for campuses not yet active (editable course + chapters) — no dead ends.

---

## Verified wiring (from the pre-build investigation — reuse these, don't rediscover)
- **Course codes — resolve from the SELECTED campus, never a constant:** `getCampusCourseCodes` (`onboarding.functions.ts`) filters `.eq("id", campusId)` on `campuses.course_family_codes_json`; families `intro_1 | intro_2 | intermediate_1 | intermediate_2`. The relational `campus_courses` carries `local_course_code` / `local_course_name` + override price cents.
  - ⚠️ `preview.tsx` **hardcodes** Ole Miss `COURSES` and ignores the campus — the known per-campus bug. **Do NOT replicate it.** (Fixing `preview.tsx` is optional, out of scope here.)
- **Campus search:** `searchCampuses` (`onboarding.functions.ts`).
- **Professor autocomplete source:** `campus_lead_suggestions` (PK `id` = uuid). Query: `.eq("campus_id", id).is("archived_at", null).order("last_name")`. **De-dupe** by `(lower(last_name), lower(first_name), email)`. Handle null `last_name`; `first_name` may hold a middle initial. RMP fields live here too.
- **Textbook — NOT relational-greenfield:** real source is **`supported_textbook_families`** + **`campuses.course_family_textbooks_json`**. `textbook-matcher.ts` / `TextsPanel.tsx` exist for reference.
- **Insert client — IMPORTANT:** `insertWaitlist` (`pricing-api.ts`) uses the **ANON browser client** (`@/integrations/supabase/client`), and `campus_waitlist` has a permissive anon INSERT policy. **Orders are different:** use a **server function with the service-role client** (`@/integrations/supabase/client.server` → `supabaseAdmin`, the `onboarding.functions.ts` pattern) so the deny-by-default RLS on `orders`/`order_chapters` holds and order PII is never publicly readable/writable.
- **Notify — mirror EXACTLY for orders:** insert → DB trigger → edge function. `campus_waitlist` insert → trigger `campus_waitlist_notify` (migration 0011) → edge fn `supabase/functions/notify-waitlist/index.ts` (Resend email to Lee + Twilio SMS via `TWILIO_MESSAGING_SERVICE_SID`; finds/creates an `sms_conversations` row so the lead is repliable from the work number; validates `x-cron-secret`). Build an `orders` trigger → new **`notify-order`** edge fn copied near-verbatim. **Do NOT** use the inline SMS-only `notifyLee`.
- **Validation pattern:** Zod-per-step `createServerFn` handlers in `onboarding.functions.ts` — copy this shape.
- **Pricing UI:** `PricingPlans.tsx`, rendered at `index.tsx` (anchor `#plans`). The `/outreach/landing` editor only toggles section visibility + hero video (`site_settings`, 0030) — it does **not** edit prices.
- **Onboarding step UI to reuse:** `o.$shortRef.tsx`.
- **Migrations:** manual `00xx_` series in **`migration/supabase-migrations/`**, applied via the Supabase **Management API** (the way 0037/0038 were applied). **Orders = `0039`; next = `0040+`.** (The `supabase/migrations/` timestamp folder is the *other*, CLI-generated convention — do NOT put new schema there.)
- **Types:** new tables reached via `as` casts (like `campus_waitlist` / `profintel`), NOT a regenerated `types.ts`.
- **Stripe:** scaffolded but OFF (`site-config.ts`: `STRIPE_TUTORING_PAYMENT_LINK=""`, `ENABLE_PREPAY=false`); `reservePrepayLead` builds a `client_reference_id`.

---

## Build sequence (where we are)
1. **✅ 1A — orders schema** (`0039_orders.sql`: `orders` + `order_chapters`). ← schema built this session.
2. **1B — order flow UI** on the landing page (the steps + the stack + live pricing / rush / delivery-vs-exam logic + graceful fallback; retire the 2 SKUs, keep 1-on-1). **Insert via a service-role server function.**
3. **Notify** — `orders` trigger + `notify-order` edge fn (copy `notify-waitlist`).
4. **1C — admin** at `/outreach/orders` (list + manage orders; activate a campus; edit codes).
5. **1D — verify** SEC + the 5 (Clemson, Penn State, etc.) are searchable with correct codes.
6. Later: **1.5** invite-classmates virality · **Phase 2** card-on-file + structured struggle-topics + textbook library + delivery tooling · **Phase 3** national scale + demand analytics.

## Project basics
TanStack Start + Supabase + Vercel + Bun. Repo: `survive-accounting-hub` (this worktree: `survive-accounting-orders`, branch `orders-foundation`). `main` = production = **surviveaccounting.com**. Live Supabase project ref: `unvxagsledbsdoremqeb`. Test student = **Ole Miss** (ACCY 201 = Intro 1 · 202 = Intro 2 · 303 = IA1 · 304 = IA2).
