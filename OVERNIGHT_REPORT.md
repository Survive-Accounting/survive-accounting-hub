# Overnight Build — Survive Growth Admin V1

**Branch/worktree:** `overnight/growth-admin-v1` at `C:/Users/lee/Documents/sa-growth-admin`
**Status:** built, typechecked, linted, tested. Not merged, not deployed. One migration awaits manual apply.
**Date:** 2026-08-23 (overnight, unattended)

---

## TL;DR

A new internal workspace at **`/admin/growth`** unifies Campus → Council → Chapter →
National Org → People → Outreach → Students → Revenue behind seven obvious tabs, in the
same "Don't Make Me Think" style as the student product (search, filters, visual status,
row-click drawers, one-click actions — no dense CRM forms).

Everything that reads **existing** data works the moment you open it (946 campuses, 2,317
chapters, 198 national orgs are live now). The **Contacts** and **Outreach** tabs need one
additive migration applied first — until then they show a clear "storage not provisioned"
banner and the rest of the app is unaffected.

**One action needed from you:** paste
`migration/supabase-migrations/20260823_1200_growth_admin_contacts_outreach.sql` into the
Supabase SQL editor (project `unvxagsledbsdoremqeb`), then run
`bun run migration/supabase-migrations/verify_growth_admin.ts`. Optionally seed sample data
with `bun run migration/supabase-migrations/seed_growth_admin.ts --apply`.

---

## Why nothing was applied or deployed

Per the repo's own rule (`migration/supabase-migrations/README.md`) DDL is applied **by
hand** in the Supabase SQL editor and cannot run with the service-role key; a file in the
folder does not mean it is applied. The task also said do not deploy production and make
conservative choices. So I wrote the migration, made the UI degrade gracefully without it,
and left the apply to you. The three new tables are additive and prefixed `growth_` (RLS
deny-by-default, service-role only) — safe to apply and trivially reversible (`drop table`).

---

## Scope guardrails honored

- **Campus readiness** is owned by another session. I added **no** readiness table or
  column. The workspace derives readiness read-only from existing `campuses` columns
  (see "Readiness" below) via one swappable helper.
- **Referral / affiliate attribution** is owned by another session. This is **not** an
  affiliate platform. `growth_outreach_events.campaign_id` is a loose uuid (no FK) so it
  can reference `outreach_campaigns` later without coupling. The existing `referrals`
  table was left untouched.

---

## Schema reused (read-only)

The generated `src/integrations/supabase/types.ts` is materially stale, so column truth was
taken from the live schema (PostgREST OpenAPI) and existing `.functions.ts` select strings.
Tables read:

| Table | Used for |
|---|---|
| `campuses` (946) | campus list, readiness, colors, course code, public slug |
| `campus_greek_chapters` (2,317) | **the** chapter inventory — council, letters, IG, size, claim status, national-org flag |
| `greek_chapters` (5) | product shell → members + seat pools (linked via `campus_greek_chapter_id`) |
| `greek_orgs` (198) | national orgs table + drilldown |
| `greek_chapter_members` (9) | member counts per chapter/campus, seated students |
| `greek_chapter_contacts` (0) | existing per-chapter contacts, surfaced in the chapter drawer |
| `greek_chapter_claims` (1) | latest claim contact in the chapter drawer |
| `greek_org_people` (28) | officer tenure (current/former) in the chapter drawer |
| `chapter_seat_pools` (0) | chapter-seat revenue (`amount_cents`, active/paid, non-test) |
| `orders` (9) | direct student revenue (`total_cents`, paid/delivered, non-waitlist) |
| `entitlements` (0) | (available for future paid-student rollups) |

## Schema added (new — NOT yet applied)

`migration/supabase-migrations/20260823_1200_growth_admin_contacts_outreach.sql`

- **`growth_contacts`** — the person: name, email, phone, instagram, title, notes, source,
  source_url, last_verified_at, created_by, timestamps.
- **`growth_contact_roles`** — the dated relationship (history): contact_id → entity
  (`entity_type` campus|chapter|council|org + `entity_id`, denormalized `campus_id`,
  `council_slug`), role, start_term, end_term, `is_current`, source, notes. A person can
  hold many relationships over time — this is what powers "the former exec who promoted us
  last semester introduces the current exec who isn't replying."
- **`growth_outreach_events`** — append-only activity log: contact/entity target, `channel`
  (email|ig_dm|text|call|other), `direction` (outbound|inbound), `status`
  (queued|sent|delivered|bounced|opened|clicked|replied|unsubscribed|logged|no_answer|
  left_message), optional campaign_id/template_id/message_id, occurred_at,
  `next_follow_up_at` + `follow_up_done_at` (drive the work queue).

All three: `IF NOT EXISTS`, wrapped in `BEGIN…COMMIT`, RLS enabled deny-by-default, indexed
for the campus/entity/follow-up access paths, and end with a proof `SELECT`.

## Contact-history model

Existing stores were entity-specific and lacked a person that spans entity types with dated
role terms (`greek_org_people` is year-array tenure scoped to Greek officers;
`greek_chapter_contacts` is a current snapshot; `greek_chapter_claims` is claim events).
`growth_contacts` + `growth_contact_roles` is the clean cross-domain model; the chapter
drawer still surfaces the existing `greek_chapter_contacts` / `greek_org_people` /
`greek_chapter_claims` rows read-only so no history already captured is lost.

## Outreach-event model

No unified multi-channel, directional activity log existed (only `comms_sends`,
`outreach_email_events`, `sms_messages`, each channel-specific). `growth_outreach_events` is
that log. Fast actions (Log IG DM / Email / Text / Call / Reply / Set follow-up / Note) each
write one event with the current timestamp — no form. Logging a new touch auto-closes any
open follow-up on the same target. The status vocabulary is a superset of the email-campaign
lifecycle, so future app-generated campaign events slot in with no schema change.

---

## Views built (routes added)

| Route | What it does |
|---|---|
| `/admin/growth` | **Overview** — only useful KPIs, grouped (Readiness / Greek footprint / Students & revenue / Outreach). KPIs click through to filtered tables. |
| `/admin/growth/campuses` | Compact campus table (Campus · Ready · Course · Chapters · Members · Revenue · Outreach · Flags) + filters (student/greek/outreach-ready, needs-greek, needs-contacts, has-users, has-revenue, SEC-only) + detail drawer (course/route, councils, chapters, quality flags, public link). |
| `/admin/growth/chapters` | The high-use marketing table from `campus_greek_chapters` + council/status filters + rich drawer (public page, Instagram, claim contact, execs current/former, outreach timeline, quick-log actions). |
| `/admin/growth/councils` | Per-campus council rollup (IFC/Panhellenic/NPHC/MGC/Other) with one-click public partner-page link. |
| `/admin/growth/orgs` | National orgs with campus/chapter drilldown drawer + public national partner-page link. |
| `/admin/growth/contacts` | People with role history. Fast add (Name/Role/Email/Phone/IG + "More details"); drawer shows every relationship over time, add/end a role, log outreach, delete. |
| `/admin/growth/outreach` | The work queue — Follow up today · Overdue · Never contacted · Recently replied — with per-row quick actions. Feels like a to-do list. |

Reused the `/outreach` house style throughout: `<AdminGate>` gate, raw `<table>`,
hand-rolled detail drawer, `Tile` KPI, sonner toasts, debounced search, server-side
pagination.

## Files added

```
src/routes/admin.growth.tsx                     (shell + tabs)
src/routes/admin.growth.index.tsx               (overview)
src/routes/admin.growth.campuses.tsx
src/routes/admin.growth.chapters.tsx
src/routes/admin.growth.councils.tsx
src/routes/admin.growth.orgs.tsx
src/routes/admin.growth.contacts.tsx
src/routes/admin.growth.outreach.tsx
src/lib/growth-admin.functions.ts               (overview + campuses/chapters/councils/orgs reads)
src/lib/growth-contacts.functions.ts            (contacts + roles CRUD)
src/lib/growth-outreach.functions.ts            (events + work queue)
src/lib/growth-util.ts                           (pure helpers: council/slug/course-code)
src/lib/growth-util.test.ts                      (7 unit tests)
src/components/growth/shared.tsx                 (Tile, Drawer, Pill, readiness/flags, pager…)
src/components/growth/OutreachActions.tsx        (fast manual log/follow-up/note)
src/components/growth/EntityPicker.tsx           (attach a person to campus/chapter/council/org)
migration/supabase-migrations/20260823_1200_growth_admin_contacts_outreach.sql
migration/supabase-migrations/verify_growth_admin.ts
migration/supabase-migrations/seed_growth_admin.ts   (dry-run by default; --apply to write)
```

---

## Metrics available now

Campuses; student-ready / greek-ready / outreach-ready campus counts (derived); active
chapters; claimed chapters; national orgs; chapter members; seated students; paid orders;
direct revenue (paid/delivered order totals); chapter-seat revenue (active/paid seat pools);
follow-ups due; never-contacted greek-ready campuses. **Direct vs seat revenue are kept
strictly separate and never summed** (no double-counting).

## Metrics unavailable / deliberately not shown

- **"Students this semester"** as a single number — member rows aren't reliably
  semester-scoped, so I show *chapter members*, *seated students*, and *paid orders*
  separately instead of one ambiguous figure (avoids a vanity card).
- **Email open/click rates** — engagement data exists only for the faculty cold-email
  system (`outreach_email_events`) and isn't wired into this workspace. The event model is
  ready to record clicks/replies/bounces when app-sent outreach lands here; the UI
  intentionally emphasizes replies/conversions over opens.
- **Chapter-seat revenue** is read from `chapter_seat_pools.amount_cents` (accurate) rather
  than an invented seat-price constant; it reads $0 until seat pools exist.

## Known data limitations

- `types.ts` is stale — all Growth queries use the documented `as any`/`as never` cast
  convention against the live schema (same as existing `.functions.ts`).
- **Readiness is a derived heuristic** (student = has Intro 1 code; greek = has chapters;
  outreach = has ≥1 contact), centralized in `growth-util.ts` / the aggregate builder so it
  can be swapped for the campus session's canonical model when that lands. No readiness data
  is persisted.
- `campus_greek_chapters.council` is free text; classification uses `councilSlugOf()` (unit
  tested — it caught and fixed a real bug where "Panhellenic" mis-classified as IFC).
- Product tables (`greek_chapters`, `chapter_seat_pools`, `orders`, `entitlements`) are
  nearly empty today; the aggregates light up automatically as data grows.
- Performance: at current scale the reads page a handful of bulk selects and aggregate in
  JS (cached by React Query). Server-side search + pagination are in place. If chapters grow
  past ~5–10k, move the per-campus aggregates into SQL views/RPCs.

## Verification run (this build)

- **Typecheck:** `bunx tsc --noEmit` — 0 errors (see below for the final confirmation).
- **Tests:** `bun test src/lib/growth-util.test.ts` — 7 pass / 0 fail.
- **Lint:** new files are prettier-clean; the only remaining eslint findings are
  `@typescript-eslint/no-explicit-any` on stale-schema table access — identical to the
  existing `.functions.ts` baseline and intentional. (No global `eslint --fix`/`prettier .`
  was run — the repo's CRLF baseline makes that destructive; only the new files were
  formatted.)
- **Dev server:** `/admin/growth` returns HTTP 200 with no transform errors; route tree
  regenerated by the Vite plugin.

## Recommended next steps (in order)

1. Apply `20260823_1200_growth_admin_contacts_outreach.sql` in the Supabase SQL editor.
2. `bun run migration/supabase-migrations/verify_growth_admin.ts` (should print all PASS).
3. Optional: `bun run migration/supabase-migrations/seed_growth_admin.ts --apply` to
   populate a few sample contacts/roles/events so the workspace isn't empty on first open.
4. Review `/admin/growth` behind the AdminGate passcode; VAs start on Chapters/Outreach.
5. When the campus session ships a canonical readiness model, replace the derived heuristic
   in `growth-util.ts` / the aggregate builder.
6. When app-sent email/DM outreach is wired, write its lifecycle into
   `growth_outreach_events` (queued/sent/delivered/bounced/clicked/replied) — the schema and
   queue already support it.
