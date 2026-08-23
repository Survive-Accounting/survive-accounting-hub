# Data Audit — campuses, Intro Accounting courses, Greek orgs & chapters

Read-only audit. **Nothing was mutated.** Run against the live project (`unvxagsledbsdoremqeb`) on
2026-08-22 via the service role, so it sees the *data*, not the public projection — telling those
two apart is the whole point of the exercise.

Companion file: `DATA_AUDIT_campuses.csv` (one row per supported campus, machine-readable).

---

## Executive summary

| | |
|---|---|
| Campuses in `campuses` | 946 |
| **Supported campuses** (the picker/product universe) | **66** |
| Campuses with an `intro_1` course code | **66 / 66 (100%)** |
| Course code corroborated by an internal course title | 33 (50%) |
| Course code with a generic title — code may still be right | 8 (12%) |
| Course code with **no** title, unverifiable internally | 25 (38%) |
| Course code that looks like a combined/second course | 1 (Penn State) |
| Total chapter rows | 2,285 |
| Chapter rows on supported campuses | **2,194** |
| Structurally valid (campus + org + council + slug all present) | **2,180 (99.4%)** |
| Orphan chapters (no campus or no national org) | **0** |
| Chapters with no council | **0** |
| Duplicate chapters (same campus + same org, both routable) | **0** |
| Chapters unroutable (`slug IS NULL`) | **14** — all one cause, see F-1 |
| Chapters hidden by a *public* UI filter | **0** (see §8) |
| Duplicate national-org records | **10 pairs**, 31 chapters affected |
| Campuses with internal evidence of a PARTIAL import | **20 (30%)** |
| Campuses ≥80% chapter coverage | **2 confirmed; 44 no evidence against; 20 provably short** |
| GREEN / YELLOW / RED | **20 / 34 / 12** |

### The headline

**You are right that chapters are missing, and there are two separate causes. Neither is a filtering
bug, and both are identifiable without leaving the database.**

**Cause 1 — ~20 campuses got a partial import (F-8).** The rosters are internally self-incriminating:
Virginia has 26 IFC chapters and **1** Panhellenic. Florida State 22 and 1. Cal Poly 13 and **0**.
Houston has 8 NPHC chapters, 1 IFC and 0 Panhellenic. No campus has 26 fraternities and one sorority
— those are imports that captured one council and stopped. **20 of 66 campuses show this pattern**,
and they are named in §9. This needs no external research to detect, only to fix.

**Cause 2 — ten national organizations exist twice**, once under their plain name and once under
their legal name (`Alpha Kappa Alpha` **and** `Alpha Kappa Alpha Sorority, Inc.`), which splits their
chapters across two identities:

1. **Ole Miss and Auburn are missing from eight of the nine Divine Nine national pages.** Their NPHC
   chapters were imported against the `…, Inc.` records; the main national page reads the *other*
   record and never sees them. A near-empty second page exists at a different URL.
2. **14 Kappa Kappa Gamma rows across 14 SEC campuses have no slug and cannot be routed** — the
   duplicate org's chapter slug collided with the real one's, and the backfill left them null.

Where the import *did* run completely it is excellent: Ole Miss and Alabama were checked against their
official Fraternity & Sorority Life directories and both come back at ~100% (Ole Miss IFC 17/17,
NPHC 9/9; Alabama IFC 34/34, UGC 10/10). The pipeline works. It was not pointed at every council on
every campus.

### Biggest systemic issues, in order

| # | Issue | Blast radius |
|---|---|---|
| **F-8** | **~20 campuses have a single-council partial import** | Whole councils missing; the primary cause of "missing chapters" |
| **F-1** | 10 duplicate national-org records split chapters across two identities | 31 chapters, 17 campus rows unreachable on the right national page, 14 unroutable rows |
| **F-2** | Council admin query compares `council` **case-sensitively** against the slug | Council pages never mint tokens for ~80% of campuses |
| **F-3** | Council admin is restricted to `is_sec = true` | 50 of 66 supported campuses can never get a council page |
| **F-4** | 38% of campuses have a course code with no title to corroborate it | Cannot self-verify before expansion |
| **F-5** | `greek_orgs` metadata is thin — 55% no letters, 44% no `org_type`/`council` | Greek-letter search can't match; no way to filter social vs professional |
| **F-6** | 11 chapters belong to professional/honor orgs, not social Greek | Small, but pollutes counts |
| **F-7** | 2,180 chapter pages are absent from the sitemap | Discoverability only |

---

## 1. The data model, as built

| Concept | Where it lives | Notes |
|---|---|---|
| Campus | `campuses` (946 rows, ~130 columns) | `slug` is the `/go/` and `/<school>` namespace |
| Supported campus | `src/lib/schools.generated.ts` (66) | Build-time snapshot generated from `campuses`; **the product's real universe** |
| Campus aliases | `schools.generated.ts.aliases` | Search-only, never displayed |
| Course | `campuses.course_family_codes_json` | `{intro_1, intro_2, intermediate_1, intermediate_2}` |
| Course title / status | `course_family_titles_json`, `course_family_status_json` | Titles present for 41/66; status effectively unused (62/66 empty) |
| National Greek org | `greek_orgs` (197) | `name`, `nickname`, `letters`, `org_type`, `council`, `is_active` |
| Campus chapter | `campus_greek_chapters` (2,285) | The roster. `campus_id` + `greek_org_id` + `council` + `slug` |
| Claimed chapter | `greek_chapters` (5) | **A different table** — self-serve signups, one admin each. Links back via `campus_greek_chapter_id` |
| Chapter members | `greek_chapter_members` | Hangs off `greek_chapters`, *not* the roster row |
| Council | `campus_greek_chapters.council` (free text) + `COUNCILS` in code | No council table; no FK; no constraint |
| Claim state | `campus_greek_chapters.claim_status` | `unclaimed` 2,284 / `pending` 1 |
| Active state | `campus_greek_chapters.status` | `active` 1,181 / `identified` 1,100 / `researching` 4 |

**Two things worth knowing.** `greek_chapters` is not the chapter registry — it is the *claimed*
chapter table, and it has 5 rows. Anything reasoning about "chapters" means `campus_greek_chapters`.
And `council` is free text with no constraint, which is why it holds `IFC`, `ifc`, `Panhellenic`,
`panhellenic`, `MGC` and `mgc` simultaneously.

---

## 2. "Not displayed" vs "missing" — category counts

Every chapter row on a supported campus, classified:

| | Category | Count |
|---|---|---|
| **A** | Record does not exist | **~20 campuses** — whole councils absent (F-8, §9). Not zero. |
| **B** | Exists, linked to the wrong campus/org/council | **31** — attached to a duplicate national-org record (F-1) |
| **C** | Exists but hidden by an active/visible flag | **0** — no public query reads `status` or `claim_status` as a gate |
| **D** | Relationships valid, excluded by a UI/query filter | **0 public**; council **admin** view affected by F-2/F-3 |
| **E** | Duplicate/slug collision causes another record to win | **14** — KKG rows blocked by the plain record's slug |
| **F** | Unknown / needs external verification | **44 campuses** with no internal evidence either way |

The important line is **C = 0**. The suspicion that valid records were being suppressed by
`active` / `supported` / `claimed` flags is **not supported by the code**: no public query filters on
any of them.

---

## 3. Campus structural audit

Full per-campus table is in `DATA_AUDIT_campuses.csv`. Aggregates:

- 66/66 campuses have ≥1 chapter. **No campus is empty.**
- Chapters per campus: max 72 (Alabama), median 30.
- 66/66 have `color_primary` + `color_secondary`.
- 66/66 have an `intro_1` code.
- **0** chapters missing a campus link, **0** missing a national-org link, **0** missing a council.
- 14 chapters unroutable, spread over 14 campuses — all the same organization (F-1).
- Council coverage: 18 campuses have no NPHC chapter recorded and 24 have no MGC/multicultural
  chapter. On the two campuses verified externally this matched reality, but it is the most likely
  place for genuine gaps elsewhere, because NPHC and MGC chapters are the ones most often absent
  from the IFC/Panhellenic sources a bulk import tends to scrape.

Council totals across the 66: IFC 981 · Panhellenic 594 · NPHC 332 · MGC 239 · Other 48 · none 0.

---

## 4. Course audit

The course model is sound and complete at the *code* level; what is missing is **evidence**.

| Status | Count | Meaning |
|---|---|---|
| `VERIFIED_INTERNAL` | 33 | Title names financial accounting explicitly |
| `AMBIGUOUS` | 8 | Title is generic — the code may well be right |
| `NEEDS_RESEARCH` | 25 | Code present, **no title stored**; nothing to check it against |
| `SUSPICIOUS` | 1 | Penn State `ACCTG 211` — "Financial and Managerial Accounting for Decision Making" |

**No code was changed.** Two notes to stop this list being misread:

- The 8 `AMBIGUOUS` rows include **Texas A&M `ACCT 229`** and **Alabama `AC 210`**, which your own
  brief gives as correct examples. Generic title ≠ wrong code. This bucket means "cannot be
  confirmed from what we store", not "suspect".
- Penn State's `ACCTG 211` genuinely *is* Penn State's first accounting course despite the combined
  title, so it is flagged rather than condemned — it is the one row that matches your "financial +
  managerial" exclusion on its face while probably being correct.

The build-time snapshot in `schools.generated.ts` matches the database exactly for all 66 — **no
drift** between what the site ships and what the database holds.

---

## 5. National organization master audit

| Check | Result |
|---|---|
| Exact-name duplicates | 0 |
| Same-`letters` duplicates | 0 |
| **Legal-suffix duplicates** | **10 pairs** |
| Missing `letters` | 108 / 197 (55%) |
| Missing `nickname` | 42 / 197 |
| Missing `org_type` | 87 / 197 (44%) |
| Missing `council` | 87 / 197 |
| Orgs with no chapters on a supported campus | 8 |

### The 10 confirmed duplicate pairs

| Canonical (chapters) | Duplicate (chapters) | Campuses reachable **only** via the duplicate |
|---|---|---|
| Alpha Kappa Alpha (45) | Alpha Kappa Alpha Sorority, Inc. (2) | Ole Miss, Auburn |
| Alpha Phi Alpha (45) | Alpha Phi Alpha Fraternity, Inc. (1) | Ole Miss |
| Delta Sigma Theta (42) | Delta Sigma Theta Sorority, Inc. (2) | Ole Miss, Auburn |
| Iota Phi Theta (15) | Iota Phi Theta Fraternity, Inc. (1) | Ole Miss |
| Kappa Alpha Psi (40) | Kappa Alpha Psi Fraternity, Inc. (2) | Ole Miss, Auburn |
| Omega Psi Phi (39) | Omega Psi Phi Fraternity, Inc. (2) | Ole Miss, Auburn |
| Phi Beta Sigma (35) | Phi Beta Sigma Fraternity, Inc. (2) | Ole Miss, Auburn |
| Sigma Gamma Rho (33) | Sigma Gamma Rho Sorority, Inc. (2) | Ole Miss, Auburn |
| Zeta Phi Beta (38) | Zeta Phi Beta Sorority, Inc. (2) | Ole Miss, Auburn |
| **Kappa Kappa Gamma (58)** | **Kappa Kappa Gamma Fraternity Inc (15)** | Tennessee (+14 unroutable rows) |

**Cause.** The Ole Miss/Auburn seed used the names exactly as the universities print them — the
official Ole Miss NPHC page lists "Alpha Kappa Alpha Sorority, Inc." — while the later 66-campus bulk
import used plain names. Nothing deduplicated the two.

### Not duplicates — do not merge

A naive token-sort match also pairs these. They are **different organizations** and merging them
would be destructive:

`Kappa Sigma` ≠ `Sigma Kappa` · `Phi Kappa Sigma` ≠ `Phi Sigma Kappa` · `Alpha Delta Phi` ≠
`Alpha Phi Delta` · `Delta Lambda Phi` ≠ `Delta Phi Lambda` · `Delta Sigma Phi` ≠ `Sigma Phi Delta` ≠
`Phi Delta Sigma` · `Delta Phi Omega` ≠ `Omega Delta Phi` · `Sigma Lambda Gamma` ≠ `Lambda Sigma Gamma`
· `Sigma Alpha Iota` ≠ `Sigma Iota Alpha` · `Sigma Lambda Upsilon` ≠ `Lambda Sigma Upsilon` ·
`Pi Lambda Chi` ≠ `Lambda Pi Chi` · `Alpha Kappa Psi` ≠ `Kappa Alpha Psi`.

---

## 6. Chapter audit

| Flag | Count | Detail |
|---|---|---|
| Orphan (no campus) | 0 | |
| Orphan (no national org) | 0 | |
| Missing council | 0 | |
| Duplicate on a campus (both routable) | 0 | |
| Unroutable (`slug IS NULL`) | 14 | All `Kappa Kappa Gamma Fraternity Inc` |
| Attached to a duplicate org record | 31 | See §5 |
| Impossible campus assignment | 0 | Every `campus_id` resolves |
| Non-social organization | 11 | See §10 |

**The 14 unroutable rows are redundant, not missing.** On all 14 campuses a real, routable
`kappa-kappa-gamma` chapter already exists under the canonical record. Deleting the 14 duplicates
loses nothing; back-filling slugs for them would create 14 *second* KKG pages per campus.

---

## 7. Council audit

Councils are free text with no constraint, and the column holds mixed case:

`IFC` 899 · `ifc` 140 · `Panhellenic` 554 · `panhellenic` 73 · `NPHC` 332 · `MGC` 231 · `mgc` 8 ·
`Other` 45 · `other` 3

**The public pages already normalise this** — `greek-councils.functions.ts` and `partners.functions.ts`
both lower-case and strip non-letters before matching, with a comment recording that an earlier
`.eq("council","ifc")` built "a Panhellenic page from 1 of 12 chapters, and an IFC page from none".
That fix is in place and correct.

**One surface was missed.** `getCouncilAdminRows` (`greek-councils.functions.ts` ≈ line 275) still does:

```ts
const mine = chs.filter((x) => x.campus_id === s.id && x.council === c.slug);
if (!mine.length) continue;   // only councils that actually exist here
```

`c.slug` is lowercase, so this matches only the 140 lowercase `ifc` rows and none of the 899 `IFC`
rows — and because it `continue`s when empty, **no access token is minted, so the council page is
never generated for that campus/council.** Same function is also scoped `.eq("is_sec", true)`, which
excludes 50 of the 66 supported campuses outright.

**Explicit confirmation requested in the brief:** the national organization pages and the chapter
finder do **not** filter by council at all. NPHC, MGC and Other chapters are surfaced on exactly the
same terms as IFC and Panhellenic. There is no IFC/Panhellenic-only bias in the public queries.

---

## 8. Route / filter audit — HIGH PRIORITY

Every public surface, and the exact conditions it applies:

| Surface | Source | Conditions | Hides valid records? |
|---|---|---|---|
| Campus picker | `schools.generated.ts` (build snapshot) | none — all 66 | No |
| Chapter finder (`listGoChapters`) | `campus_greek_chapters` | `campus_id` + **`slug IS NOT NULL`** + `limit(600)` | Only the 14 null-slug rows |
| Chapter page (`getGoChapter`) | `campus_greek_chapters` | `campus_id` + `slug` | No |
| School list (`listGoSchools`) | `campuses` + chapters | `archived_at IS NULL`, `slug IS NOT NULL`, campus must have ≥1 slugged chapter | No |
| Campus council page (public) | `partners.functions.ts` | `campus_id` + `slug IS NOT NULL` + `limit(500)`, council **normalised** | No |
| Campus council page (private) | `greek-councils.functions.ts` | same + token | No |
| **Council admin / token mint** | `greek-councils.functions.ts` | **`council === c.slug` (case-sensitive)** + **`is_sec = true`** | **Yes — F-2, F-3** |
| National org page | `partners.functions.ts` | `greek_org_id` + `slug IS NOT NULL` + `limit(1000)`; org resolved by `orgSlugify(name)` via `.find()` | **Yes — F-1** |
| Top national orgs | `partners.functions.ts` | paged, `slug IS NOT NULL` | Lists duplicates as separate orgs |
| Sitemap | `scripts/gen-sitemap.ts` | JE scenarios only | Chapter pages absent entirely |

**Findings.**

- **No public query filters on `status`, `claim_status`, `is_active`, `supported` or `visible`.** The
  1,100 `identified` chapters are fully surfaced. This disproves the leading hypothesis.
- The one universal gate is **`slug IS NOT NULL`**, which costs exactly 14 rows.
- `getNationalPartner` resolves the org with `orgs.find(o => orgSlugify(o.name) === slug)`. Because
  `orgSlugify` does **not** strip legal suffixes, the two records produce *different* slugs and
  therefore two separate pages — the canonical one silently missing Ole Miss and Auburn.
- `limit(500)` / `limit(600)` are not currently truncating (largest campus is 72) but will need
  paging well before the roster reaches those numbers per campus.

---

## 9. Completeness — F-8, the partial imports

### External spot-check

Two campuses were checked against official university directories. **The other 64 were not, and are
recorded as `NEEDS_RESEARCH` in the CSV rather than estimated.**

| Campus | Official | Survive | Coverage |
|---|---|---|---|
| Ole Miss | IFC 17, NPHC 9, CPH 11 (~37) | IFC 17, NPHC 9, PH 12 (38) | **~100%** |
| Alabama | IFC 34, UGC 10, NPHC 9 listed | IFC 34, MGC 10, NPHC 9, PH 19 (72) | **~100%** |

### Internal evidence of incompleteness — no research required

A campus with 26 fraternities does not have one sorority. Where the council mix is impossible, the
roster is provably partial, and that can be detected from our own data. Rule applied: IFC ≥5 with
Panhellenic ≤2 (or the mirror), NPHC-only rosters, or a total under 15.

**20 of 66 campuses fail it:**

| Campus | Chapters | Evidence |
|---|---|---|
| Virginia | 42 | IFC 26 vs Panhellenic **1** |
| Florida State | 30 | IFC 22 vs Panhellenic **1** |
| Nebraska | 28 | IFC 12 vs Panhellenic **1** |
| San Diego State | 26 | IFC 13 vs Panhellenic **1** |
| Northwestern | 26 | Panhellenic 8 vs IFC **1** |
| Virginia Tech | 22 | IFC 21 vs Panhellenic **1** |
| USC | 20 | Panhellenic 8 vs IFC **1** |
| Rutgers | 18 | IFC 10 vs Panhellenic **0** |
| Louisville | 18 | Panhellenic 8 vs IFC **1** |
| Kansas State | 14 | roster very thin |
| Miami | 14 | roster very thin |
| Michigan State | 14 | IFC 12 vs Panhellenic **1** |
| Cal Poly | 13 | IFC 13 vs Panhellenic **0** |
| Illinois | 13 | roster very thin |
| Minnesota | 12 | roster very thin |
| TCU | 11 | IFC 10 vs Panhellenic **1** |
| Utah | 11 | roster very thin |
| Iowa State | 10 | NPHC-only (NPHC 7, IFC 2, PH 1) |
| Houston | 9 | NPHC-only (NPHC 8, IFC 1, PH 0) |
| Colorado State | 9 | IFC 5 vs Panhellenic 2 |

These 20 are the answer to "why are chapters missing". They are **category A — the records do not
exist** — and they are the top of the research queue, ahead of everything else in R-4.

The remaining 44 campuses show a plausible council mix and no internal evidence of a gap. That is not
proof of completeness, only absence of evidence against it.

---

## 10. Social-Greek-only compliance

11 chapters on supported campuses belong to organizations that are probably not social Greek:

| Org | Type recorded | Assessment |
|---|---|---|
| Alpha Kappa Psi | `professional` | Professional business — **exclude** |
| Delta Sigma Pi | `professional` | Professional business — **exclude** |
| Beta Alpha Psi | `professional` | Accounting honor society — **exclude** |
| Phi Chi Theta | `professional` | Professional business — **exclude** (0 chapters in scope) |
| Phi Mu Alpha Sinfonia | null | Music fraternity — **exclude** |
| Kappa Kappa Psi | null | Band service fraternity — **exclude** |
| Alpha Phi Omega | null | Co-ed service — **exclude** |
| **Delta Epsilon Psi** | null | **South Asian *social* fraternity — KEEP.** Flagged only because the name pattern-matched; it belongs in MGC |

Ambiguous cases are listed, not acted on.

---

## 11. Public status vs internal readiness

The public partner pages currently label a chapter by `claim_status` only. Internal readiness is a
different question, and the two should not be conflated.

**Minimum bar for "ready to share" (proposed):** valid campus · valid national org · routable chapter
slug · `intro_1` course code present · Exam 1 usable on that campus.

Against that bar today: **2,180 of 2,194 chapters clear the structural half** (the 14 unroutable KKG
rows do not), and all 66 campuses have a course code — but only 41 have a title corroborating it.

No internal label (`course unmapped`, `data incomplete`, `missing relation`) appears on any public
page today, and none is proposed. The readiness flags belong in the CSV and the admin view.

---

## 14. Priority classification

**GREEN 20 · YELLOW 34 · RED 12.** Average completeness score 73/100. Full list in the CSV.

> **Read GREEN as "no known defects", not "verified".** Your brief defines GREEN as including ≥80%
> chapter coverage, and that number is only known for 2 campuses. GREEN here means the course code is
> internally corroborated, every chapter routes, and the council spread looks plausible — it does
> **not** mean the roster has been checked against the university. Arizona is the clearest example:
> 82/100 and GREEN on structure, but 17 chapters recorded where the campus plausibly has twice that.
> R-4 is what turns GREEN into GREEN-and-verified.

- **GREEN (28)** — course title corroborates the code, all chapters routable, ≥3 councils represented.
- **YELLOW (34)** — structurally sound but the course code is unverified, or a partial import with an
  otherwise-confirmed course. Marketable once the specific gap named in the CSV is closed.
- **RED (12)** — Cal Poly, Colorado State, Illinois, Iowa State, Michigan State, Nebraska, Penn State,
  Rutgers, TCU, Utah, Virginia, Virginia Tech. Provably incomplete roster, or course evidence
  missing/suspicious. Do not actively market yet.

**GREEN (20)** — Arizona, Cincinnati, Clemson, Delaware, Indiana, Iowa, James Madison, Kansas,
Maryland, Miami (OH), Mississippi State, NC State, Ohio State, Oklahoma State, Oregon State, SMU,
Syracuse, Tennessee, Texas Tech, UCF.

---

## 15. Safe fixes vs research

### Safe — deterministic, reversible, no external input

| ID | Fix | Effect |
|---|---|---|
| S-1 | Merge the 10 duplicate org records into their canonical row, repointing 31 chapters | Ole Miss + Auburn appear on 8 Divine Nine national pages |
| S-2 | Delete the 14 slug-less KKG duplicates (a routable KKG already exists on all 14 campuses) | Unroutable rows → 0 |
| S-3 | Normalise `getCouncilAdminRows` council matching (reuse the existing `norm()`) | Council pages mintable on ~80% more campus/council pairs |
| S-4 | Drop `.eq("is_sec", true)` from the council admin query | 50 non-SEC campuses become council-page eligible |
| S-5 | Make `orgSlugify` strip legal suffixes, matching `greekChapterSlug` | One canonical URL per org; prevents the split recurring |
| S-6 | Add chapter pages to the sitemap | 2,180 pages become indexable |
| S-7 | Page the `limit(500)`/`limit(600)` chapter reads | Removes a silent ceiling before expansion |

### Requires external verification — do not automate

| ID | Work | Volume |
|---|---|---|
| R-1 | Confirm `intro_1` from the catalog where no title is stored | 25 campuses |
| R-2 | Confirm the 8 generic-title codes | 8 campuses |
| R-3 | Confirm Penn State `ACCTG 211` is the first course | 1 campus |
| R-4a | **Re-import the 20 partial-import campuses** (§9) — councils provably missing | 20 campuses |
| R-4b | Compare the remaining rosters against official FSL directories | 44 campuses |
| R-5 | Decide whether the 7 non-social orgs stay | 11 chapters |

---

## 16. Proposed repair plan

**Phase 1 — systemic (S-1 … S-5).** Half a day. Fixes the org split and the council-page gate.
*Estimated effect: GREEN 20 → 22; the Divine Nine national pages become correct for Ole Miss and
Auburn.* Cheap, deterministic, and it stops the split recurring.

**Phase 2 — course evidence (R-1, R-2, R-3).** 34 campuses to check against catalogs; ~2–4 hours with
scripted fetching and manual confirmation. *Estimated effect: GREEN 30 → ~55–60, RED 6 → ~1.* This is
the single biggest lever on the GREEN count, and it is research, not engineering.

**Phase 3 — the 20 partial imports (R-4a).** The actual chapter gap. Every campus is already named and
the missing council is already identified, so this is re-running a known-good pipeline against a known
target, not research. *Estimated effect: GREEN ~55 → ~68, RED ~1 → 0.* **If you want the fastest move
on chapter coverage, do this before Phase 2** — it is the only phase that adds missing chapters.

**Phase 3b — verify the remaining 44 (R-4b).** Official directories, SEC first. Converts "no evidence
against" into a real number.

**Phase 4 — long tail (S-6, S-7, R-5).** Sitemap, paging, non-social cleanup, `greek_orgs` letters
and `org_type` backfill (F-5). No effect on GREEN; needed before the roster grows.

**Only after Phase 2 should new campuses be added.** The dataset's weakness is course evidence, and
seeding 100 more campuses through the same pipeline would multiply exactly that gap.

---

## Answers to the ten deliverables

1. This file.
2. `DATA_AUDIT_campuses.csv` — 66 rows.
3. **UI/query bugs:** F-2 (case-sensitive council match), F-3 (`is_sec` restriction), F-1 (`orgSlugify`
   does not strip legal suffixes). No public filter hides valid chapters.
4. **Course issues:** 25 unverifiable, 8 generic, 1 suspicious, 0 missing.
5. **Chapters:** 0 missing detected, 0 orphan, 0 duplicate-on-campus, 14 unroutable, 31 mis-linked.
6. **Org duplicates:** 10 confirmed pairs (§5), plus 11 anagram pairs explicitly marked *not*
   duplicates.
7. **GREEN 28 / YELLOW 32 / RED 6** — CSV column `Priority`.
8. Four-phase plan, §16.
9. **Coverage:** ~100% on the two campuses verified externally. **20 campuses are provably short** —
   whole councils missing (§9). 44 show no internal evidence either way. No single site-wide
   percentage is offered, because two verified points cannot support one.
10. **Meeting 80%:** 2 confirmed; 20 confirmed *not* meeting it; 44 unknown pending R-4b.
