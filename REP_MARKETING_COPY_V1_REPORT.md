# CAMPUS REP — MARKETING COPY V1

**Date:** 2026-08-31 · **Branch:** `feature/campus-rep-v1` · Implements the *Campus rep — marketing copy* brief.

Everything a rep candidate reads now comes from **one module** (`src/lib/rep-copy.ts`) instead of being written ad hoc across three surfaces. The two numbers are earnings claims made to 20-year-olds, so the invariants are unit-tested rather than trusted.

---

## 1. The two numbers, and where each goes

Both, in the brief's order — the ceiling first, then the ramp:

> **A campus that's up and running produces around $20,000 a year, and you earn 10% of it. Ole Miss is already there.**
> Your campus won't be there in October. Your first semester is about opening it — figure a few hundred dollars while you're building it, and a real number once it's running.

Live on `/rep/join`, directly under the three bullets. Tests assert the ceiling names $20,000 + 10% + Ole Miss, the ramp never contains "$20,000", and the résumé line carries no dollar figure ("Launched a new campus for a national tutoring platform" stands on its own).

**One copy change I made deliberately:** the third bullet used to say *"just one chapter can earn you $300+"*. That number competed with the ceiling/ramp pair sitting right beneath it — two different earnings claims in the same eyeful. It's now the mechanism (*"Earn 10% of everything your chapters buy — for as long as they keep buying"*) and the numbers live in one place.

**One dated string, flagged:** "in October" is deliberately concrete for this fall's recruiting. It's the only time-bound phrase in the file, isolated in one constant with a comment — a one-line change when the season turns.

## 2. The dashboard empty state — the piece that didn't exist

Built to the brief's layout, on `/rep/dashboard`, for a newly approved rep who hasn't done anything:

```
YOUR CAMPUS · OLE MISS
You've got 3 chapters. Here's what happens next.
1  We give you each chapter's Instagram and a message to send
2  You send about 10 a day — from your account, to houses you know
3  When a chapter signs up, you earn 10% of everything they buy

A campus like this is worth about $20,000 a year once it's running.
Your job is getting it started.

Your first bonus unlocks at your first chapter sale.
[ See your chapters → ]
```

Verified rendering live (screenshot text captured verbatim above). Details worth knowing:

- **No dismiss button.** It disappears the moment they act — freshness is derived (`no DMs sent && 0 clicks && 0 kits && 0 contacts`), so there's no flag to store and nothing to get out of sync. QA-proved: `before: true → after first Copy DM: false`.
- **Degrades honestly at zero chapters** ("Your chapters are being set up") and stays grammatical at one.
- The CTA scrolls to *Your chapters*, or the full campus list when nothing is assigned yet.
- The optional "How it works" video folds into this card, so it appears at the moment it matters.

## 3. The bonus explainer

The gate is now one shared sentence — *"Your first bonus unlocks at your first chapter sale. If no chapter signs up, the bonus isn't paid."* — rendered on the locked earnings panel and asserted by tests in both directions, so it can never be softened in one place and not the other.

## 4. The rejection note

New `rep_declined` template, sent **only on Decline** (a waitlisted rep hasn't been turned down and must not be told they have). Short, warm, door left open, and it points them back at the free product:

> **About the campus rep spot**
> Hey Jordan, Thanks for putting your name in for Auburn. I'm not able to bring you on right now — I'm keeping the program small on each campus while I figure out what works, so it's a numbers thing more than anything about you.
> If that changes I'll come back to you first. And either way, Exam 1 is free — use it, and send it to your chapter if it helps them.
> Thanks for wanting to be part of it. — Lee

Tests assert it's ≤4 blocks and contains none of "unfortunately" / "regret" / "application was unsuccessful". It rides the existing comms layer, so it inherits suppression, dedupe (`rep_declined:<id>`), logging and test-mode routing. **QA:** declining a test rep logged `skipped · test_no_destination` — it correctly refused to mail a fake address rather than falling through.

## 5. Tone

Swept the rep-facing paths for "ambassador", "brand partner", "leverage", "Growth Partner" — **zero hits**, and a test now fails the build if any of them appear in the copy module. Growth Partner stays the internal term; a student only ever sees *campus rep*.

## 6. The first three calls

The brief's four questions are the copy brief for the next revision, so they're now *in the review queue where the call happens*: the call-notes field is labeled "Call notes — 4 things to capture", placeholdered with *"What did they ask about first?"*, and all four sit in the label's tooltip. Captured live rather than reconstructed afterwards.

## 7. Deliberately NOT done

The **two recruiting emails** (individual + business orgs) already exist in `outreach-templates-v2`, and the brief says revisit them after the first calls. Left alone — rewriting them before the calls would be guessing at exactly the questions §5 exists to answer.

## 8. Files & verification

New: `src/lib/rep-copy.ts`, `src/lib/rep-copy.test.ts` (12 tests). Modified: `rep_.join.tsx`, `RepWorkspaceView.tsx` (empty state + shared gate line + anchors), `comms/templates.ts`, `rep-admin.functions.ts` (decline note), `admin.reps.roster.tsx` (call prompts).

tsc clean · **2,074 pass / 1 fail** (the pre-existing bolt-palette accent test, failing on main) · production build green · live QA on `/rep/join` and a genuinely fresh approved rep (Maya Test · Ole Miss · 3 chapters).
