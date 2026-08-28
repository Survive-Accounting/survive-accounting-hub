# SURVIVE — LOCAL FLAVOR PACKS
### v1 · Aug 28, 2026 · The "[insert local campus thing here]" system, codified.
### Companion to SURVIVE_METHOD_v1.md (Oxford Flavor Bank) and MASTER_CONTEXT_V2.

## 1. THE AUDIT — does the Exam 1 bank need Oxford anywhere?

**No. And that's a feature, not a gap.** Scan of the editorial pass
(274 active CEQs, all text: stems, choices, feedback):

- **Oxford references: ZERO.** No Proud Larry's, no Ole Miss, nothing.
- **Survive Co: 29 stems** — the only named company, exactly per canon
  ("Pretend you ARE the company").
- Everything else is deliberately generic: "a bank" (1), "a customer"
  (4), "a company" (9 — all conceptual/definitional, not scenes).
- The rent hits are definitional ("What type of account is Prepaid
  Rent?") — teaching THE WORD, not a scene. No flavor slot there.

The bank was built campus-neutral, which is precisely what makes the
flavor-pack idea possible. The data layer stays generic forever;
flavor is a skin that gets applied at display time. **Never write a
local name into the national bank.**

The real counterparty slots that exist today (the only stems where a
flavor token could ever live):

| CEQ | Scene | Possible token |
|---|---|---|
| ceq-ms3wqiu8-210 | borrows $5,000 from **a bank** | stays generic — see guardrail 3 |
| ceq-ms3wqiu8-235 | collects $1,500 from **a customer** | {{LOCAL.RESTAURANT}} as the customer |
| ceq-ms3wqiub-524 | collects $1,500 **on account** | same |
| ceq-msszlldm-sd582 | performed $700 of services, unbilled | same |
| ceq-ms3wqiu8-255 | pays $800 cash for rent | landlord could be "{{LOCAL.LANDMARK}} building" — optional |

Five slots out of 274. That's the honest size of the CEQ opportunity —
small. The big flavor payloads live elsewhere (section 4).

## 2. THE SYSTEM — flavor packs

**Principle: flavor is skin. Config, not code. Numbers, answers, and
teaching logic NEVER vary by campus.** Same display-layer pattern as
blast|short|lookback → Blast Off/Short/Vibe and memos → Playbook.

**Token vocabulary (keep it this small):**

- `{{LOCAL.RESTAURANT}}` — a beloved local restaurant
- `{{LOCAL.VENUE}}` — bar / music venue / hangout
- `{{LOCAL.COFFEE}}` — the study spot
- `{{LOCAL.LANDMARK}}` — a campus/town landmark
- `{{LOCAL.CAMPUS}}` — school name ("Ole Miss")
- `{{LOCAL.COURSE_CODE}}` — already exists in the Greek pages
  ("survive ACCT 2110") — fold it into this same system

**Campus pack = one JSON per campus:**

```json
{
  "campusId": "olemiss",
  "campusName": "Ole Miss",
  "town": "Oxford, MS",
  "courseCode": "ACCT 2110",
  "entries": [
    { "token": "RESTAURANT", "name": "Ajax", "verified": true },
    { "token": "VENUE", "name": "Proud Larry's", "verified": true },
    { "token": "COFFEE", "name": "Bottletree (verify)", "verified": false },
    { "token": "LANDMARK", "name": "the Lyceum", "verified": true }
  ]
}
```

**Render rule:** known campus → pack name. Unknown campus or missing
entry → the generic noun ("a local restaurant"). Never a blank, never
a raw token on screen. Today there is one campus, so the Oxford pack
IS the global default — which is exactly what you asked for — but the
fallback is generic, not Oxford, so day one on campus #2 nothing
embarrassing renders.

## 3. GUARDRAILS (these never move)

1. **Survive Co is never flavored.** The student IS Survive Co; the
   locals are counterparties only.
2. **Real businesses appear only in neutral-or-positive scenes** —
   Survive Co earns revenue from them, buys from them, caters their
   event. A real business is NEVER the deadbeat, the defaulter, the
   write-off, the fraud party. (A real restaurant that "still hasn't
   paid" is a lawsuit-flavored vibe. Generic entities take the L.)
3. **Banks and legal entities stay generic.** "A national bank,"
   always — per existing canon.
4. **No real people in the bank.** Deuce stays filmed-flavor only.
5. **Spelling verified before a pack ships** (the Coupe DeVille rule).
   `verified: false` entries never render.
6. **One source of truth:** the national bank text with tokens. Packs
   are data. No campus ever gets a forked question.

## 4. WHERE FLAVOR ACTUALLY PAYS (priority order)

1. **Your filmed voice** — already canon, already the best delivery.
   The camera is where "meet me at Funky's after the final" lives.
2. **Campus landing + Greek pages** — {{LOCAL.CAMPUS}} and
   {{LOCAL.COURSE_CODE}} are already half-built there. Highest-value,
   lowest-risk tokens.
3. **The Talkthrough Booth prompter** — show the campus's flavor list
   while you film, so tailored re-records grab local references
   naturally. The pack becomes a teleprompter ingredient.
4. **CEQ feedback lines** — a wink after the answer ("...same reason
   your tab at {{LOCAL.VENUE}} is a payable"). Low risk, high charm.
5. **CEQ stems** — last, and only the five counterparty slots above.
   The stems are built for speed; extra words cost more than flavor
   earns in most of them.

## 5. WHEN TO BUILD — not now (the pushback)

Wiring tokens before launch buys Ole Miss students nothing: with one
campus, generic + your filmed Oxford voice already equals the fully
tailored experience. This touches student-facing display and bank
text — wrong week for that risk. So:

- **NOW:** this doc is the codification. Add the vocabulary line to
  MASTER_CONTEXT_V2 (snippet below). Done.
- **TRIGGER:** campus #2 gets real → build the token renderer + pack
  loader (a small Session 1/Session 3 prompt; I'll write it when the
  trigger fires).
- **THE KING TIE-IN (the part to love):** "Research the dives, the
  favorite restaurants, the best spots in THAT college town" becomes
  step 1 of the new-campus playbook — a growth-engine task. King
  ships a 10-entry pack per town (names, categories, verified
  spellings), you approve it in five minutes, the whole product
  localizes. That's flavor as part of the Waymo, not part of your
  workload.

## 6. PASTE INTO MASTER_CONTEXT_V2 → section 2 (vocabulary)

> - **FLAVOR PACKS** — local color is a display-layer token system
>   ({{LOCAL.RESTAURANT}} etc.) resolved per campus from a campus
>   pack (JSON); fallback is always the generic noun. National bank
>   stays campus-neutral forever; Survive Co is never flavored; real
>   businesses only in neutral/positive scenes; no real people; banks
>   stay generic; verified spellings only. Spec:
>   SURVIVE_FLAVOR_PACKS_v1.md. Build trigger: campus #2. Pack
>   research: King, per the new-campus playbook.
