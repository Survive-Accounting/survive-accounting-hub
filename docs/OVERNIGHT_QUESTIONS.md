# Overnight run — open questions / conflicts (fail-loud)

Recorded 2026-07-02 during the "Cram Video positioning + scope-first wizard" overnight run.
Each item is something the prompt asked for that conflicts with what's already in the code.
I made the safest call and kept moving; **these are for Lee to confirm.**

---

## 1. Migration `0042_request_scope.sql` — NOT created (conflict + redundant)
**What the prompt asked:** Add `request_scope` via a new migration `0042_request_scope.sql`, with a CHECK constraint on `('everything_exam','one_chapter','one_or_two_topics','homework_explained')`.

**Reality in the code/DB:**
- `0042` is already taken → `migration/supabase-migrations/0042_order_flow_copy.sql` (the editable-copy singleton). Live migrations run through **0043**.
- The `request_scope` column **already exists** — added by `0043_custom_study_pack_tracking.sql`. Verified in the live DB: `orders.request_scope` = `text`, nullable, **no** CHECK constraint, **0** existing values.

**What I did:** Created **no migration**. The column already satisfies the data need. The 4 scope values are enforced at the app layer instead (Zod enum in `submitOrder`).

**Decision needed:** Do you want a DB-level CHECK constraint too? If so I'll add it as **0044_request_scope_check.sql** (not 0042). Low risk now (no existing data), but it locks the 4 values into the DB.

---

## 2. Homepage section order — LEFT as you last approved (conflict with PART B)
**What the prompt (PART B) asked:** top-to-bottom order = Hero → Reviews → How it works → My story → Pricing → Questions/Text me → Final CTA. It does **not** mention the PainHook ("My exam looked nothing like…"), the intro video, the free-explainers, or the Beyond teaser sections.

**Reality:** In your **two messages just before this run** you explicitly set: How-it-works right after the hero (above Reviews), PainHook **above** Reviews, and My story **under** Pricing. I committed those (`6746cba`).

**What I did:** **Left the homepage order as you last set it** rather than reorder to PART B (which would also imply dropping PainHook / intro video / free-explainers / Beyond, which you did not ask to remove). PART B's copy (hero, reviews heading, how-it-works, my story, pricing, final CTA) is already live from the earlier commits.

**Decision needed:** Keep the current order (recommended — it's your most recent instruction), or switch to the strict PART B 7-section order and remove the unmentioned sections?

---

## 3. Professor picker — now **only professors Lee has contacted** (behavior change)
**What the prompt (PART C, Step 5) asked:** only show professors at the campus who have been contacted via the outreach system; no fallback.

**Reality:** `searchOrderProfessors` currently does **emailed-first _with_ fallback** to the full confirmed-faculty directory when nobody's been emailed at that campus yet (a documented prior decision: "Emailed-first, fall back to all faculty"). Source table is unambiguous: `outreach_leads.sent_at IS NOT NULL`, intersected with `campus_lead_suggestions` for names.

**What I did:** Implemented PART C — **removed the fallback.** Now if nobody's been emailed at a campus, the picker is empty and the student uses free-text ("My professor isn't listed"). This directly overrides the earlier fallback decision.

**Decision needed:** Confirm you want the strict "contacted-only" filter. Right now **very few campuses have outreach emails sent**, so for most schools the picker will be empty (free-text only). If that's too aggressive, say so and I'll restore the fallback.

---

## 4. `/order` copy is now **hardcoded** — the "Edit Student Flow" editor is disconnected
**What the prompt (PART C) asked:** a new scope-first step structure with verbatim copy.

**Reality:** The `/order` wizard read **all** its copy from an editable store (`order-copy.functions.ts`, edited by admins at `/outreach/orders-settings` → "Edit Student Flow"). That store is keyed to the **old** step structure (School→Course→Professor→Request→Exam→Summary) and old scope values.

**What I did:** Rewrote `order.tsx` with the new structure and PART C copy **hardcoded**, and **stopped reading the editable store** (the new structure is incompatible with the old keys). I did **not** touch `order-copy.functions.ts` or the admin editor page (avoiding admin sprawl per the prompt). Result: the "Edit Student Flow" editor still loads and saves, but **its edits no longer affect the live /order page.**

**Decision needed:** Either (a) retire the "Edit Student Flow" editor, or (b) have me re-plumb the editable store to the new structure in a follow-up (touches `order-copy.functions.ts` + the admin settings page). Until then, `order-copy.functions.ts` still contains the retired "Custom Study Pack" default strings, but **they no longer render anywhere on the customer surface.**

---

## 5. Wizard no longer captures free-text "focus" notes or the group checkbox (per PART C)
**What the prompt (PART C) specified:** Step 1 (Scope) = 4 cards only. No step in PART C includes the old "what should I focus on?" textarea or the "classmates want this too" group checkbox. The FAQ says notes/files are added **on the tracker page after submitting**.

**What I did:** Removed the notes textarea + group checkbox from the wizard. `submitOrder` still accepts `requestNotes`/`interestedInGroup`/`groupSize` (optional) for the tracker, but the request flow now sends them null/false.

**Decision needed:** Confirm you're OK losing the at-request "focus" free-text (it was useful signal for you). If you want a minimal optional notes field back on Step 1, I'll add it.
