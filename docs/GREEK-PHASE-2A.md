# Greek Vertical — Phase 2a (claim → alert → approve)

Branch: `greek-phase-1` (2a sits on top of Phase 1; they ship together once the migration lands).

**Code-complete. Live-unverified — `0115` is still not applied**, so no claim has ever been written
to a real table. What IS verified is the part that matters most, below.

---

## The flow

1. An exec on `/go/<school>/<chapter>` opens **"Run <Chapter>? Claim this page"** — closed by
   default, at the foot. Four fields: name, position, email, phone.
2. `submitChapterClaim` writes a `greek_chapter_claims` row, flips the roster row to `pending`, and
   snapshots `members_at_claim`.
3. Lee gets a text with everything needed to reply from a phone: chapter, school, who, their
   position, a tappable number, and how many members are already banked.
4. Lee approves or rejects at `/outreach/greek-claims`.
5. Approve attaches the admin to the chapter record and texts the exec their link.

---

## Auth — the part worth reading

`AdminGate` is a localStorage flag guarding a passcode **compiled into the public client bundle**.
Its own source says: *"This is a deterrent, not real security."*

Approving a claim hands a stranger a chapter dashboard, a roster of student names and phone numbers,
and (in 2b) paid seats. So the passcode cannot be the gate. It isn't:

- `/outreach/greek-claims` is wrapped in `AdminGate` only to keep it out from underfoot.
- The page then demands a **real Supabase session** (magic link).
- Every server call — `listChapterClaims`, `decideChapterClaim` — independently verifies that JWT
  and matches the email against a **server-side** `ADMIN_EMAILS` list that never reaches the browser.

### Verified adversarially

With the client passcode **already defeated** (localStorage set by hand, page past the gate):

| Call | Forged JWT | Result |
|---|---|---|
| `listChapterClaims` | yes | `null` — not an empty list, not data |
| `decideChapterClaim` | yes | `{ ok: false, error: "Not authorised." }` |

`null` rather than `[]` is deliberate: the UI can tell "you are not an admin" apart from "no claims",
so a signed-in non-admin sees a plain refusal instead of an empty queue that reads as success.

---

## Decisions worth knowing

**Duplicate claims are reported, not stacked.** Two execs claiming in the same week is normal; a
second row would just mean Lee gets two texts about one chapter. The second submitter is told
someone already claimed it.

**A rejected claim returns the chapter to `unclaimed`**, not left dangling on `pending` — otherwise
one rejection would permanently block the chapter from ever being claimed again.

**Approval attaches to the existing shell.** A chapter that banked members before anyone claimed it
already has a `greek_chapters` row. Approval `update`s that row rather than inserting, which is what
keeps the banked members attached — a blind insert would either trip the unique index or orphan
every member.

**Approval sets `phone_verified_at`.** Lee approving *is* the verification, since he spoke to the
person. Leaving it null would lock the new admin out of the dashboard they were just granted.

**SMS failures never lose the claim.** The row is saved first; a failed text is logged and surfaced,
not fatal. Losing a claim because Twilio hiccuped would be strictly worse than Lee finding it in the
queue instead.

**`membersAtClaim` and `membersNow` are both shown.** A chapter that kept growing while the claim
sat in the queue is a different proposition from one that stalled.

---

## Environment

`FOUNDER_ALERT_PHONE` must be set in Vercel env (server-side) or **no alert is sent** — the claim
still saves, and the miss is logged. It is read only via `process.env` in a server function and is
never hardcoded, per the brief.

> Unrelated but found while checking that: Lee's personal mobile IS hardcoded in two
> **client-side** files — `src/routes/welcome.tsx:15` and
> `src/components/outreach/CampusTable.tsx:240` — so it ships in the public bundle today. Both
> predate this work; flagged as a separate task.

---

## Files

| File | |
|---|---|
| `src/lib/greek-claims.functions.ts` | new — submit / list / decide, JWT-verified |
| `src/components/site/ClaimChapter.tsx` | new — the claim form on a `/go/` page |
| `src/routes/outreach.greek-claims.tsx` | new — the approval queue |
| `src/lib/greek-chapters.functions.ts` | `sendSms` exported for reuse |
| `src/routes/go.$school.$chapter.tsx` | mounts `ClaimChapter` |

## Verification

`tsc` clean · 1055 tests pass · build clean · `/outreach/greek-claims` renders, and passing the
client passcode yields **no decision buttons** — it demands a session · forged-JWT calls refused.

**Not verified:** a claim actually being written, the Twilio alert firing, approval attaching an
admin to a shell chapter, and the exec's approval SMS. All four need `0115` and `FOUNDER_ALERT_PHONE`.
