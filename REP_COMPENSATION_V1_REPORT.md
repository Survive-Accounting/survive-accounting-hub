# REP COMPENSATION — 10% + SIGNING BONUS POOL

**Date:** 2026-08-30 · **Branch:** `feature/campus-rep-v1` (on top of the V2 program, base main `0e3955b1`).
Implements the 08-30 comp spec: **10% ongoing, no cap** + a **one-time signing bonus pool, $300 cap, locked until the first $1,000+ chapter sale.** No cash before revenue; every bonus event verified by our own system.

---

## 1. The four events — and how each is verified

| Event | Bonus | Verified by |
|---|---|---|
| Free signup through their link | $1 | `referral_conversions` kind=signup, attributed by the `sa_ref` cookie. **New capture hook:** a member joining a chapter through `/go` (`tagChapterMember`) now records the signup conversion — idempotent per member, chapter-scoped via the link's chapter FK. Verified live through the real click→join path. |
| Flyer produces 5 signups | $10 | **Unique QR per flyer:** every chapter flyer and the campus flyer now get their OWN link (`utm_content='flyer'`) — the printed QR and `?ref=` use it, the copy/DM link stays separate. Signups threshold pays; **scans (clicks on flyer links) are tracked as a diagnostic only** — the breakdown even tells the rep "lots of scans, few signups — try a better spot." |
| Chapter claims its page | $25 | `greek_chapter_claims.sourcing_partner_id`, **status approved only** — a rep could file the public claim form themselves; your approval call is the verification. |
| Chapter activated (10+ signups, one house) | $50 | Signups grouped by the link's chapter FK; shown per chapter, not just as a total. |

## 2. The rules, enforced in code (all unit-tested)

- **One-time:** events with `occurred_at` after the first qualifying sale don't count (`eventCounts` — verified live: a post-sale signup left the bonus unchanged).
- **$300 cap** across all four (`signingBonus`, spec's own $227 example is a test case).
- **Unlock = `chapter_purchase` ≥ $100,000¢ only** — student purchases never unlock (`isQualifyingSale`).
- **Reversal:** the bonus is **derived, not ledgered** — recomputed live from source tables, so voiding a conversion or deleting a claim reverses its bonus automatically. Once queued (below), reversal = the ledger's normal void.
- **No bonus for DMs/replies/screenshots.** DM logging stays in the dashboard as bonus-pool *eligibility* framing (copy says exactly that), and the retroactive check exists free: logged DM + later claim = real outreach, visible in `rep_activity` next to the claim record.
- **If no chapter ever signs up, no bonus** — stated plainly at signup (§7's exact statement sits under the `/rep/join` bullets, styled, not fine print) and again on the locked panel itself.

## 3. The dashboard panel (§6 — rendered exactly)

```
YOUR EARNINGS
  Commission $195.00 — 10% of sales through your link, always, no cap
  SIGNING BONUS — unlocks with your first chapter sale
  Free signups        15 × $1    $15.00
  Flyers producing     1 × $10   $10.00
  Pages claimed        0 × $25    $0.00
  Chapters activated   1 × $50   $50.00
  Earned so far   $75.00 of $300.00 max
  ✓ Unlocked — first chapter sale 8/30/2026. Pays with your next commission payout.
  [See which houses produced what]
```
The expander breaks every line down: signups per chapter (with ⚡ activated), per-flyer signups **and** scans, claims with dates. Locked state shows 🔒 with the full condition sentence.

## 4. Payment (§8)

Admin roster drawer now shows the derived bonus per rep with **[Queue bonus payout (one-time)]** — enabled only when unlocked and unqueued. Queuing snapshots the amount into the **existing `referral_commissions` ledger** as one flat *pending* row (`SIGNING BONUS` note), so it rides the normal monthly payout and your normal approve step, alongside commission. Re-queueing is refused. W-9 note unchanged (collected at first payout, not signup).

## 5. Flyers (§5)

Both flyers pre-generated and downloadable as before; the caption now sits **beneath every QR** on the flyer PDF + SVG **and** the meeting slide (both formats): *"Free ACCY 201 exam prep — first exam free."* (live course code, verified rendering). Chapter flyer QR = rep+chapter link; campus flyer QR = rep-only link.

## 6. Live QA (test data, all engine-path)

Piper Test · Ole Miss: 9 simulated chapter-link signups + **1 real click→member-join through the new hook** + 5 flyer-QR signups → panel showed 15/$15 · 1 flyer/$10 · ATO activated/$50 = **$75 locked** → $1,200 chapter sale → **unlocked + $120 commission pending** → post-sale signup ignored → **queue $75** landed as a flat pending ledger row → second queue refused. Flyer captions verified on `/api/flyer/...?f=svg`.

## 7. Files

`src/lib/rep-earnings.ts` (pure contract + constants, new) · `rep-earnings.test.ts` (12 tests, new) · `rep-earnings.functions.ts` (derived computation, new) · `greek-go.functions.ts` (signup capture hook) · `rep-workspace.functions.ts` (`ensureFlyerLink`, flyer-QR wiring, campus flyer code; main/DM link lookups scoped to exclude flyer links) · `flyer.server.ts` (under-QR captions ×4 renderers) · `RepWorkspaceView.tsx` (EarningsPanel, DM-eligibility copy, campus-flyer link) · `rep_.join.tsx` (§7 statement) · `rep-admin.functions.ts` (`adminGetRepBonus`, `adminQueueSigningBonus`) · `admin.reps.roster.tsx` (BonusBlock) · `rep-shared.ts` (campusFlyerCode field).

**No new tables, no migration** — the whole pool derives from `referral_conversions`, `referral_links`, `referral_clicks`, and `greek_chapter_claims`.

## 8. Deferred / notes

- **What a free signup actually is** (Lee, 08-30): *someone used the material through the rep's link and gave us their email.* Today the only capture that meets that bar is the **chapter join** on `/go` (email comes from the magic-link account). A student who scans a campus flyer, studies, and never joins a chapter is **not counted yet** — that email-capture hook is the open piece, and Lee has more spec coming for it.
- **Correction (08-30):** an earlier draft of this report also listed "order submit" as a signup capture. That was wrong. `/order` is the **made-to-order video flow, which is closed** — its referral hook never fired once in production (zero `subject_type='order'` conversions). The hook has been removed and the endpoint closed; see `ORDER_FLOW_DEPRECATION.md`. No rep's signup count ever depended on it.
- Refund reversal after queueing = manual void in the ledger (documented above); before queueing it's automatic.
- Suite: **2,062 pass / 1 pre-existing fail** (bolt-palette) · tsc clean · build green.
