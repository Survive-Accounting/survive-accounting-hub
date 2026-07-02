# Overnight run report — Cram Video positioning + scope-first wizard

Branch: `orders-foundation` · Date: 2026-07-02 · **Not pushed, not merged.**

## 1. Files changed
**Order flow (customer-facing):**
- `src/routes/order.tsx` — full rewrite to the **scope-first 6-step** wizard (Scope → Exam → School → Course → Professor → Your info). PART C copy hardcoded. New scope values, monospace receipt, new confirmation w/ "Track your request" link, 3-item FAQ, persistent pill + footer, page header "Request a Cram Video" + subline, "Step N of 6". Delivery-estimate copy removed. Textbook step already absent (was removed in a prior pass). **Notes textarea + group checkbox removed** (see Questions #5).
- `src/routes/order.$shortRef.tsx` — track page: renamed all customer-facing "Custom Study Pack" / "study pack" / "full pack" → **Cram Video** (title, headings, receipt PAYMENT row, unlock buttons, "Help me build the right Cram Video", supplement disclaimer).
- `src/lib/orders.functions.ts` — `submitOrder` `requestScope` enum → `everything_exam | one_chapter | one_or_two_topics | homework_explained`; `searchOrderProfessors` → **contacted-only** (removed the all-faculty fallback).

**Homepage:** No changes in this run — the Cram Video homepage copy (hero, reviews heading, how-it-works, my story, pricing, final CTA) was already committed earlier this session (`6ab52e7`, `6746cba`). Section-order note in Questions #2.

**Migration:** none created — see §2.

**Docs:** `docs/OVERNIGHT_QUESTIONS.md` (new), `docs/OVERNIGHT_RUN_REPORT.md` (this file).

## 2. Migration verify
**No migration was created.** PART D asked for `0042_request_scope.sql`, but:
- `0042` is already taken (`0042_order_flow_copy.sql`); live migrations run through **0043**.
- The `request_scope` column **already exists** (added by `0043_custom_study_pack_tracking.sql`).

Verified live (`information_schema` / `pg_constraint`):
- `orders.request_scope` = `text`, nullable, **no** CHECK constraint, **0** rows with a value.
- `request_notes` (text), `chapter_count_only` (int), `awaiting_syllabus` (bool NOT NULL) all present.

The 4 scope values are enforced at the app layer (Zod enum in `submitOrder`). A DB-level CHECK was intentionally **not** added (would need a fresh migration number + locks values into the DB) — see Questions #1.

## 3. Grep results (Part F)
**Retired product names on the rendered customer web surface** (`index.tsx`, `order.tsx`, `order.$shortRef.tsx`, `components/landing`): **ZERO.**
Checked: `Cram Pack`, `Study Pack`, `Custom Help Video`, `Made-to-order`, `Made to order`, `Pre-order`, `preorder`.

**Part B stripped strings on the homepage:** **ZERO** ("Tutoring availability is limited", "1 to 5 business days", "faster delivery for a fee", "request help for an entire exam").

**"Custom Study Pack" still present OFF the rendered web surface (flagged, not changed):**
- `src/components/outreach/orders/OrderDetailDrawer.tsx` — admin UI (internal; out of scope).
- `src/lib/order-copy.functions.ts` — the old editable copy store's **defaults**; no longer rendered on `/order` (disconnected, Questions #4).
- `src/lib/order-tracker.functions.ts` (magic-link email subject/body) and `src/lib/orders-admin.functions.ts` (stage-update email) — **customer-facing EMAIL copy**, but these are the track/notify server fns PART D said **do not touch**. Recommend a follow-up pass to rename these emails to "Cram Video" once you confirm.

## 4. Smoke test (through submitOrder's row mapping → live DB, notify trigger disabled, rows deleted)
Two representative requests inserted with the exact `orderRow` `submitOrder` builds, then deleted:
- **`#D9E40C97`** — Ole Miss, ACCY 303, professor "Dr. Smoke Test", `request_scope=one_chapter`, `exam_date=2026-07-12` (+10d), `exam_timeframe=null`, `tier=made_to_order`, `awaiting_syllabus=true`.
- **`#6D5D9429`** — Ole Miss, ACCY 201, no professor, `request_scope=everything_exam`, `exam_date=null`, `exam_timeframe=not_sure`, `awaiting_syllabus=true`.

Both rows: `remaining_after_delete = 0`. `orders_notify` trigger re-enabled and verified (`tgenabled='O'`). (Note: this exercises the DB save path with the real mapping; the Zod/type layer is verified by `tsc`. "not sure" was applied to the **exam** since the new scope enum has no "not sure" value — the old scope's "not sure" was replaced per PART C.)

## 5. Build result
`bunx tsc --noEmit` → **green** (exit 0). `bun run build` → **green** (exit 0, ~60s).

## 6. Open questions
See **`docs/OVERNIGHT_QUESTIONS.md`** — 5 items, each with the conflict + the call I made:
1. Migration `0042_request_scope.sql` not created (number taken + column already exists). Want a DB CHECK constraint (as 0044)?
2. Homepage section order left as you most-recently approved (PainHook above reviews, How-it-works after hero, My story under pricing) rather than PART B's strict 7-section list.
3. Professor picker is now **contacted-only** (no fallback) — with few campuses emailed, most pickers will be empty (free-text only). Confirm.
4. `/order` copy is now hardcoded; the "Edit Student Flow" editor still saves but **no longer affects** the live page.
5. Wizard no longer captures the free-text "focus" notes or the group checkbox (moved to the post-submit tracker per PART C).

## 7. What to click first (morning)
1. Open **/order** — confirm the new order: **What you need → Exam → School → Course → Professor → Your info**, with the "Request a Cram Video" header and the pill on every step.
2. Pick a scope card + an exam ("This week" then a day, and separately "Not sure yet"); make sure Continue enables correctly.
3. On **Step 5 (Professor)** try Ole Miss — expect a short contacted-only list (or empty → free-text). Flag if that's too sparse (Questions #3).
4. Finish a test request → check the **monospace receipt**, the confirmation "#REF", and the "Track your request →" button.
5. Skim **docs/OVERNIGHT_QUESTIONS.md** and answer #1–#5 so I can finish the loose ends (esp. the customer **email** copy still saying "Custom Study Pack").
