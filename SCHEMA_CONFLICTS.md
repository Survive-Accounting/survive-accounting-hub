# Schema & Merge Conflicts — 2026-08-23

Short version: **there are no schema conflicts.** The overnight sessions did not invent competing
concepts. Documented here because the audit brief specifically asked to rule it out before merging.

## Table namespaces (no collision)

| Branch | New tables | Prefix |
|---|---|---|
| test-mode | `chapter_seat_pools`, `chapter_seat_assignments`, `chapter_share_events` | `chapter_seat_*` / `chapter_share_*` |
| growth-admin-v1 | `growth_contacts`, `growth_contact_roles`, `growth_outreach_events` | `growth_*` |
| referral-platform-v1 | `referral_partners`, `referral_links`, `referral_clicks`, `referral_conversions`, `referral_commissions` | `referral_*` |

Every table is namespaced and unique. No duplicate table, no duplicate column concept, no enum/status
clash. The brief's worst case — "Growth Admin creates `contacts`, another branch creates
`org_contacts`" — **did not happen**: Growth uses `growth_contacts` (internal CRM people), Referral
uses `referral_partners` (external attribution entities). Different concepts, different tables.

## Foreign keys — all point at existing tables

- `growth_contact_roles.contact_id` → `growth_contacts` (own). `campus_id` is denormalized, no FK.
- `growth_outreach_events.contact_id` → `growth_contacts` (own).
- `referral_*` FKs all reference `referral_partners`/`referral_links`/`referral_conversions` (own) or
  `campuses.id` (existing). No cross-branch FK.

No migration depends on another unmerged branch's schema. Apply order is free (timestamp order is
fine): `20260822_0900` (applied) → `20260823_1200` → `20260823_2330`.

## Conceptual overlap to be *aware* of (not a conflict)

Growth Admin's `growth_outreach_events` and Referral's `referral_conversions`/`referral_partners`
both model "partners + touches", but for different audiences (internal outreach CRM vs external
referral/commission attribution). They are intentionally separate systems. If a future "who is this
partner across both systems" view is wanted, that is a *new* join to design deliberately — do **not**
retrofit one table to serve both.

## Actual merge conflicts (source files, not schema)

| File | Branches | Fix |
|---|---|---|
| `OVERNIGHT_REPORT.md` | growth-admin-v1 **and** referral-platform-v1 | **Rename** before merging the second (`OVERNIGHT_REPORT_GROWTH.md` / `_REFERRAL.md`). Real content conflict. |
| `src/routeTree.gen.ts` | every route-adding branch | **Generated** — `git checkout --theirs` (or ours) then `bun run build` regenerates it correctly. |
| `src/styles.css` | partner-simplify **and** test-mode | Both append an **identical** `.sa-field` focus block — keep one copy; trivial. |

Nothing else is co-edited across the unmerged branches.

## RLS note (security, not conflict)

Both new migrations `enable row level security` with **zero policies**. This blocks the anon key but
the admin server functions use the **service-role** key, which bypasses RLS entirely — so RLS is not
the access control here. The client-side `<AdminGate>` is currently the only gate (see the **P1 auth
gap** in OVERNIGHT_MASTER_AUDIT.md). Add server-side `adminEmailFromToken` verification before these
tables carry real contact/commission data in production.
