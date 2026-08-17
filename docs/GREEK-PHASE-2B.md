# Greek Vertical — Phase 2b (seats · transfer · share kit)

Branch: `greek-phase-2b`, on top of `main` @ `ecf3ad98`. Migration **0116 is applied and verified**.

---

## The one thing that isn't what the brief asked for

The brief said **"seat entitlements wired to checkout"**. I audited before building, and there is no
checkout in this codebase:

- `STRIPE_SECRET_KEY` appears exactly once, in a **commented-out** line (`config.server.ts:24`).
- The one payment constant, `STRIPE_TUTORING_PAYMENT_LINK`, is `""` — and grep finds no reader for
  it anywhere outside its own definition.
- Fulfillment is `claimMyOrders`, whose own header reads: *"FULFILLMENT STUB … **No Stripe**: this
  stands in for 'on order paid'."*

Building a checkout was outside the ask, and faking one would have been worse than either. So the
**grant path** is real and payment-agnostic instead:

```
setChapterSeats(chapterId, seatsTotal, note)   ← whatever collects the money calls this
assignSeat(chapterId, memberId, assign)        ← turns one seat into a real entitlement
```

A Stripe webhook, an invoice marked paid, or Lee's own hand all call `setChapterSeats` and nothing
else changes. `seats_note` is free text because seats will be sold by invoice and transfer for a
while, and without it the only record of how a chapter paid lives in Lee's texts.

**What is NOT done:** money does not move by itself. Seats are recorded by an admin.

---

## Seats

**A seat grants `scope: 'course'`.** `entitlements.functions.ts` resolves exactly three scopes —
`topic`, `exam_unit`, `course` — and expands `course` to every chapter in it. A seat *is* "everything,
all semester", so it needed **no resolver change**, and a seat cannot drift from what an individual
purchase unlocks: same table, same scope, same expansion.

> **Bug caught during the build.** The first version resolved the course by matching `/intro/`
> against the course list. There are **five** courses and **two** match — `intro-accounting-1` and
> `intro-accounting-2` — so `.find()` would have returned whichever came back first and silently
> granted the wrong semester to a paying chapter, with no error anywhere. (It also tested a `name`
> column that does not exist; only `slug` does.) It is now a named constant,
> `SEAT_COURSE_SLUG = "intro-accounting-1"`, resolved by slug, returning **null rather than a
> fallback** if that slug is missing — a seat that cannot name its course must fail at the point of
> sale, not hand out access to something else.

Other decisions:

| | |
|---|---|
| **Lowering `seats_total` below what's assigned** | refused, with the count — no silent over-commit, no silent mid-semester revoke |
| **Assigning to a member with no account yet** | recorded on the member row; `reconcileSeatGrants` converts it when they sign in. An entitlement against a null `user_id` is a grant nobody holds |
| **Unassigning** | deletes only grants filtered by `greek_chapter_id` **and** `source='greek_seat'` — which is what stops a chapter from deleting a student's *own* purchase |
| **Who assigns** | admin **or** the chapter's own owner. Handing seats to your own members is the exec's job |

`entitlements.greek_chapter_id` (new in 0116) is what makes that revoke-scoping possible at all.

---

## Ownership transfer

Officers turn over every year — transfer is the **normal** case. Routing every handoff through Lee
would make him the bottleneck on a calendar event he doesn't control, so the **current owner** can
transfer too, not just an admin.

`greek_chapter_transfers` records every handoff. Overwriting `admin_email` in place would erase who
gave the chapter to whom, which is exactly the question asked when two people both claim to run it.
**The trail row is written first** — if the update then fails, the record of an attempted handoff
survives; the other order would leave a chapter whose owner changed with nothing saying why.

Transfer sets `phone_verified_at` so the incoming exec can sign in immediately: the outgoing one
already vouched for them.

---

## Share kit — `/chapters/kit/<school>/<chapter>`

Two artefacts, one page: a portrait **flyer** (8.5×11, printed on white) and a 16:9 **slide** for the
TV at chapter meeting. `Cmd/Ctrl-P` or the Print button gives a PDF.

**Why a page and not a generated file:** the obvious reading of "flyer generation" is a server-side
PDF renderer — which means a font pipeline and a storage bucket, to produce something the browser
already prints, and one more thing that can be stale when the chapter's name or link changes. This
page *is* the artefact.

The QR reuses the same public encoder the dashboard already uses rather than adding a library for
one image — but the URL under it is built by `goPath()`, so **LINK LAW applies to print**: a flyer
carrying a `/c/` URL would outlive the redirect that makes it work. The typed URL sits under the QR
because a camera that fails at a bad angle otherwise leaves the student with nothing.

Verified live at `/chapters/kit/university-of-mississippi/alpha-chi-omega`: real chapter resolved
("Alpha Chi Omega · Ole Miss"), flyer ratio **0.773** (8.5/11 = 0.7727), slide **1.778** (16/9),
QR encodes the `/go/` URL, and `/c/` appears nowhere in the DOM.

---

## Files

| | |
|---|---|
| `migration/supabase-migrations/0116_greek_phase2b.sql` | **applied + verified** |
| `src/lib/greek-seats.functions.ts` | new — seats, reconcile, transfer, transfer history |
| `src/routes/chapters_.kit.$school.$chapter.tsx` | new — flyer + slide |
| `src/lib/greek-chapters.functions.ts` | dashboard payload gains `chapterId`, `kitPath`, seats, per-member `id`/`hasSeat` |
| `src/routes/chapters_.dashboard.tsx` | seats panel, per-row seat toggle, kit link, transfer form |

## Verification

`tsc` clean · tests pass · build clean · 0116 verified by reading the live schema back (all four
column probes PASS) · kit route verified in the browser.

### Not verified

Nothing has exercised these against **real rows** — `greek_chapters`, `greek_chapter_members` and
`greek_chapter_claims` are all still empty, so no seat has been assigned, no entitlement written and
no chapter transferred. That needs a real claim approved first (Phase 2a), which in turn needs
`FOUNDER_ALERT_PHONE` set in Vercel or the claim saves with no alert to Lee.

Screenshots: still none — eighth pass. The flyer and slide have been measured, not looked at, and a
print artefact is exactly the kind of thing that measures right and prints wrong.
