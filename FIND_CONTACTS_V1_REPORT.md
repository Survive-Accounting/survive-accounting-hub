# IN-APP CONTACT FINDING — V1

**Date:** 2026-08-31 · **Branch:** `feature/campus-rep-v1` · Implements the *In-app contact finding* brief.

King's loop — dashboard → copy prompt → Gemini → copy links → Claude → xlsx → verify → paste back — is now **click Find contacts → review table → import.** Two model calls, one review step.

---

## 1. It works on real data

Verified live against Ole Miss through the actual gateway, not mocks:

| | Result |
|---|---|
| **Step 1** (council pages) | 6.7s · **$0.0053** · 5 real councils (IFC, Panhellenic, NPHC, FSL, WIB), **every URL probed 200**, MGC correctly omitted rather than guessed |
| **Step 2** (officers) | 10.4s · **$0.0061** · 12 officers across 3 councils |
| **The review outcome** | 8 rows → **2 importable, 6 blocked "no contact method"** |
| **Import** | 1 imported, 2 skipped (no contact method / no source URL); **re-running imported 0** — the duplicate guard holds |

That 6-of-8 block rate is the feature working, not failing. The model returned honest `null`s instead of substituting the Greek Life office address, and those rows refuse to import. **A blank is information; a copied office address hides the gap.**

## 2. What the live run caught that I'd missed

The model returned `ifcpresident@olemiss.edu` for the IFC president. My role-account detector missed it — it matched prefixes like `ifc-` and `president@` but not the **concatenation** `ifcpresident`. Widened to catch a run-together local part naming both a council and a role (`ifcpresident`, `panhellenicvp`, `nphcsecretary`), and the live case is now a test. This is exactly the substitution that produced 27 unique emails across 126 rows last batch.

## 3. Model choice — and why not the existing pipeline

**`perplexity/sonar`** via the gateway: web search is built in, so "search then read the pages" is *one* call rather than SerpAPI → Firecrawl → Gemini. The gateway returns the **real dollar cost** per call, so the running total in the header is a fact rather than a local estimate that drifts from the invoice.

`council-contacts.functions.ts` already discovers council contacts and **auto-saves** them. It's untouched: this is a different product — nothing is written until a person has looked. Model id is env-overridable (`AI_MODEL_FINDCONTACTS`).

## 4. The review table (§2, §3)

Nothing saves until reviewed; every field is editable in place; unticking excludes. Flags, all pure and unit-tested:

- **Block** — no contact method · no `source_url` · email already on this campus · Instagram already on this campus
- **Warn** — email looks like a role account · one handle on more than one row (an org account) · a searched handle nobody has confirmed

Footer reads `Import 14 of 17` with the excluded count and reasons.

**Instagram — three states, one fast fallback**, exactly as specced:
- **listed** (printed on the council page) — highest trust, still verifiable
- **found, low confidence** — shows `Open ↗` / `Confirm` / `Wrong — clear`; **never imported as confirmed** until a person looks; clearing drops it to the third state
- **not found** — `Search ↗` opens a prefilled query built from what we already know (`"Sarah Chen" "University of Mississippi" Panhellenic treasurer instagram`) plus an inline paste field. No modal, no navigation.

Two verification checkboxes per row (**IG verified**, **Source checked**) record *who and when* on the contact — never a boolean the importer can set, because a model that fetched a page is not a person confirming a handle.

**Hit-rate tracking:** every Confirm / Wrong-clear / manual paste writes an `ig_find_outcomes` row, so the header can say `IG auto-find: 31% confirmed` and you can decide whether the automatic attempt earns its tokens.

## 5. The server re-decides

`importReviewedContactsFn` re-reads what exists **now** and re-runs the **same pure functions** the UI showed. A client that posts a blocked row gets it dropped, not trusted. Duplicates are excluded, never overwritten. No campuses are ever created from returned data.

## 6. Attribution (§7) — already existed

`growth_va` + `/va/<token>` already gives King's team their own logins, so I reused it rather than adding a role: every write records `created_by` from the admin **or** VA session. Verified — the imported row carried the acting admin's real email, not a shared account.

## 7. Cost & caching (§5)

Per-run tokens and real cost land in `find_contact_runs`; step 1 is cached **30 days** per campus (council URLs don't move) with a `Re-run search` override; the panel shows this run's spend and whether URLs came from cache.

## 8. Fallback (§6) and single-add (§8)

`Copy step-1 prompt` / `Copy step-2 prompt` produce the *same words* the gateway is given (one source, so they can't drift), plus a paste box accepting **tab-separated, CSV, and markdown tables** — including quoted commas in names — which loads straight into the same review table. It appears on failure, never as the default. The existing manual add-contact accordion is untouched.

## 9. Deferred — stated plainly

- **§4 batch across 4 campuses** is **not built.** The single-campus flow is complete and is what unblocks King today; batching multiplies the review-table and progress UI and is better done once the single flow has been used on a few real campuses. The server functions are already per-campus and stateless, so batching is orchestration on top, not a rewrite.
- **`.xlsx` / `.csv` file upload** in the fallback: paste handles TSV/CSV/markdown; file parsing isn't wired.
- Concurrency rate-limiting is moot until batch exists.

## 10. Files & verification

New: `find-contacts-shared.ts` (+27 tests), `find-contacts.server.ts`, `find-contacts.functions.ts`, `components/growth/FindContactsPanel.tsx`, migration `20260831_1200_find_contacts.sql` (**applied live**: provenance + verification columns on `campus_council_contacts`, `find_contact_runs`, `ig_find_outcomes`). Modified: `admin.growth.coldoutreach.index.tsx` (panel mounted in `AddContacts`, so it appears for Lee **and** in VA mode).

tsc clean · **2,168 pass / 1 fail** (pre-existing bolt-palette) · production build green · all QA data removed from production afterwards (0 leftover contacts, outcomes cleared; the 3 real cost rows kept, $0.0172 actually spent).
