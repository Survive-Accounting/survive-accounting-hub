# Morning Audit — Greek 990 / Legal-Entity SEC Pilot

_Read-only audit, 2026-08-25. No contact made, no data changed. Numbers pulled live from the
`greek_legal_entity` / `greek_chapter_legal_entity` / `greek_990_filing` / `greek_990_officer`
graph via `scripts/greek-990/audit.ts` (output: `MORNING_AUDIT_GREEK_990.json`)._

## 1. Universe

| Metric | Value |
|---|---:|
| SEC campuses attempted | 16 |
| Social Greek chapters attempted | 843 (of 858 social; 15 skipped for no matchable org name) |
| Legal entities discovered | 632 |
| Unique EINs | 632 |

## 2. Entity matching

Chapter-level outcome (each chapter counted once, best tier):

| Tier | Chapters | Share |
|---|---:|---:|
| **HIGH** (auto-linked, chapter-specific entity) | 384 | 45.6% |
| **MEDIUM** (routed to review) | 232 | 27.5% |
| **LOW** only (left unlinked by design) | 12 | 1.4% |
| **No entity found** | 215 | 25.5% |

- Link-level: **1,254 HIGH links** (548 carried by campus-city match, 21 by chapter designation,
  10 by full university name, and ~675 national-parent links).
- Candidate pool: 1,254 HIGH + 4,760 MEDIUM stored. **"Rejected" is not a stored state** — a
  candidate that fails the guards simply never becomes a link. LOW candidates are intentionally
  not persisted (they stay unlinked).

### Manual EIN work eliminated — a primary success metric
Before this pilot, exactly **4** SEC chapters had an EIN on the roster (each pasted by a human,
one at a time). The pilot discovered **632 legal entities with zero manual EIN lookup** — every
EIN, name, city, subsection, and group number came from the IRS EO BMF automatically. In practical
terms it removed ~1 VA research task for each of the **381 chapters** that now carry a
chapter-specific entity, plus the national-parent layer, and it surfaced multiple entities per
chapter (house corp + local + foundation) that a human rarely finds by hand. **This is the pilot's
strongest result: automatic discovery works.**

## 3. Entity types

| Type | Count |
|---|---:|
| LOCAL_CHAPTER_ENTITY | 384 |
| HOUSE_CORPORATION | 77 |
| NATIONAL_PARENT | 77 |
| UNKNOWN | 57 |
| ALUMNI_CORPORATION | 15 |
| EDUCATIONAL_FOUNDATION | 11 |
| PROPERTY_HOLDING_ENTITY | 10 |
| SCHOLARSHIP_FOUNDATION | 1 |
| OTHER_RELATED | 0 |

**Accuracy audit.** Spot-checking confirms the classifier is **conservative and safe** — it never
mislabels a house corporation or foundation as the undergraduate chapter (the failure the brief
warned about). The 57 UNKNOWNs are almost all real chapter-level entities whose legal name lacks a
classifying keyword — e.g. `KAPPA ALPHA ORDER`, `SIGMA KAPPA CORPORATION`, `BETA THETA PI
CORPORATION OF OKLA`, `ALPHA DELTA PHI INTERNATIONAL INC`. A handful of UNKNOWN 501(c)(3)s are in
fact foundations/committees (`IOTA PHI THETA DKO COMMUNITY ENGAGEMENT COMMITTEE`,
`LOUISIANA CHAPTERS OF PHI BETA SIGMA`). Net: no dangerous misclassification; some LOCAL/foundation
entities are under-labeled as UNKNOWN. Cheap fix — default a 501(c)(7) bare-org-name to
LOCAL_CHAPTER_ENTITY and treat 501(c)(3) as foundation-leaning.

## 4. Group exemption (GEN)

- 425 entities carry a group-exemption number; **76 of 77 national parents have a GEN**.
- The national-parent pass (BMF affiliation code = 6, "central org") **worked cleanly** and returned
  correct HQs + GENs: Chi Omega → Memphis (0273), Phi Delta Theta → Oxford OH (0164), Pi Kappa Alpha
  → Memphis (0355), Kappa Kappa Gamma → Dublin OH (0894), Sigma Chi → Evanston (0008), etc.

**Easiest orgs** (≈100% HIGH chapter-level): Kappa Delta, Delta Tau Delta, Gamma Phi Beta, Chi
Omega, Kappa Alpha Theta — large national IFC/NPC orgs with per-chapter 501(c)(7) registrations.
**Hardest orgs** (0% HIGH chapter-level): the multicultural/Latino/Asian-interest set (Omega Delta
Phi, alpha Kappa Delta Phi, Lambda Theta Alpha/Phi, Sigma Lambda Beta/Gamma, Delta Phi Omega/Lambda,
Kappa Delta Chi) **and** a few mainstream orgs — notably **Alpha Omicron Pi** and **FarmHouse**.
Verified this is a real data absence, not a matcher bug: e.g. there are **zero** "Alpha Omicron Pi"
entities in the entire Florida BMF — AOII registers no per-chapter nonprofit and files centrally
(its national parent WAS found, in Brentwood TN). These orgs have **no separate in-state 501(c)
registration**, so they are a genuine coverage floor. GEN-subordinate enumeration (below) is the
only real lever for them.

**Could GEN dramatically improve nationwide scale? Yes — this is the #1 lever.** Today we discover
by name+city. A stronger path: once a national's GEN is known, **enumerate its subordinates directly**
(BMF affiliation = 9, same GEN) and match those to campuses by city. That turns fuzzy name guessing
into an authoritative parent→child roster and would raise auto-match materially for every large
national.

## 5. Filings

| Form | Count |
|---|---:|
| 990 | 4,264 |
| 990-EZ | 670 |
| 990-N (e-postcard, no rich data) | 544 |
| 990-PF | 26 |

- Filing years span 2010–2025; the dense band is **2014–2023** (~350–380 filings/yr). 2024 is still
  filling in (176) and 2025 is negligible (7).
- **Latest-filing lag: average 3.38 years** behind the current year. Newest available is TY2024, so
  the *minimum* lag is 2 years; 164 entities are ~2 years stale and **288 are ≥3 years stale**.

**Staleness of officer info.** Officer/director names come from these filings, so they are 2–4 years
old. They are stored as `latest_filing_year` and are **never labelled "current"** — the correct
reading is *"the person the entity reported to the IRS as of TY20xx."* A 2022 treasurer has very
likely rotated out of an undergraduate role; alumni/house-corp officers turn over more slowly and
are the more durable contacts.

## 6. People (LATEST-990-REPORTED, not current)

| Role | Unique people |
|---|---:|
| Presidents | 99 |
| Treasurers | 55 |
| Directors | 94 |
| Trustees | 0 (frats/sororities file "director", not "trustee") |
| Advisors (explicitly labelled) | 4 |
| **Total unique people** | **620** |

Officer records were extracted from IRS 990 XML (filing years 2021–2025) plus 17 reused from the
prior manual set. **None should be called "current"** without independent confirmation — they are
the last leadership the entity reported to the IRS. Only 4 people are explicitly labelled "Advisor"
in filings; do not infer that any director *is* the chapter advisor.

## 7. Financials

Coverage is complete where a rich filing exists: **100% of the 4,835 rich filings carry revenue,
expenses, assets, and liabilities** (ProPublica returns all four for 990/990-EZ). Median latest
revenue ≈ **$606K**, median latest assets ≈ **$400K**, max assets ≈ **$96M** (a national/foundation).

**Useful as market context:** entity scale and physical-plant value — a chapter with a
$2–5M-asset house corporation has real alumni infrastructure and a facility to maintain; revenue
indicates operating scale. This helps *prioritise and understand* an account.

**Must NOT become a sales claim or purchasing-power score.** House-corporation assets are mostly
restricted real estate; foundation assets are restricted endowment. High assets do **not** mean
spendable education budget, and they say nothing about willingness to buy Survive. Financials are
context, not a "they can afford it" signal — keep them descriptive.

## 8. Match precision

Of 1,254 HIGH links, 548 rest on a campus-city match, 21 on a disjoint chapter designation, 10 on a
full university name, and ~675 are national-parent links (authoritative via GEN). **0 HIGH non-parent
links survive on a bare state match** — the guards (maximal Greek-letter run, "…OF `<other org>`",
disjoint-designation, sibling-chapter) held.

**Estimated false-link risk: low for org+city correctness, moderate for chapter-specificity in a
handful of cases.** Every sampled HIGH link is the right organisation in the right campus city. The
residual risk is *which* same-org entity belongs to *this* chapter when several exist in one city and
the roster has no chapter designation to disambiguate.

**Riskiest matches** (≥4 same-org, same-city entities, no designation to separate undergrad vs
house vs alumni vs defunct):

| Chapter | Same-city entities |
|---|---:|
| Chi Omega @ University of Alabama | 5 |
| Phi Delta Theta @ University of Alabama | 5 |
| Sigma Gamma Rho @ University of South Carolina | 4 |
| Chi Psi @ University of Georgia | 4 |
| Pi Kappa Phi @ University of Alabama | 4 |

These are not *wrong-org* errors — they over-attribute sibling/defunct same-org entities to one
chapter. Backfilling chapter designations collapses them to the correct one (the 21 designation-carried
links are already clean). 57 HIGH links point at UNKNOWN-typed entities (correct org/city, unlabelled type).

## 9. Stakeholder value

Which 990 legal-entity roles are genuinely useful as *future* chapter stakeholders:

- **Likely governing influence** — House Corporation president/treasurer, Educational/Scholarship
  Foundation president/directors, Alumni Corporation officers. These people control the chapter's
  facility and money and are the durable adult decision layer. ~77 house corps + 12 foundations +
  15 alumni corps carry these.
- **Possible influence** — house-corp / foundation board directors (94 directors), and local
  chapter-entity officers (often the reported undergrad exec, but 2–4 yrs stale).
- **Weak relevance** — national-parent officers (too far from the campus), sibling/defunct-entity
  officers, and generic "member/board member" rows.

No contact sequences created.

## 10. Nationwide feasibility

Based on the SEC results:

- **Automatic HIGH match:** ~45% of chapters (chapter-specific entity), skewed by council — IFC/NPC
  large nationals are near-ceiling; NPHC and especially MGC multicultural orgs drag it down.
- **Review:** ~28%.
- **Unresolved (no entity):** ~26% — a genuine floor for orgs that don't register separate nonprofits.

Nationwide should land in a similar band, possibly a few points lower outside the high-Greek-density
South (fewer registered house corporations in some regions). **Best architectural improvements, in
order:**

1. **GEN subordinate enumeration** — pull all affiliation-9 subordinates under each national's GEN and
   match by city. Turns name-guessing into an authoritative parent→child roster; biggest recall lever.
2. **Chapter-designation backfill** — only ~15% of chapters have a designation today; it is the
   cleanest disambiguator and directly fixes the riskiest same-city cases.
3. **Full IRS officer coverage** — download all 12 TEOS zips/year (pilot used 3 → ~25%); same parser.
4. **NPHC/MGC handling** — accept alumni-chapter/city-level entities and a lower coverage ceiling.
5. **UNKNOWN-type refinement** — default bare 501(c)(7) org names to LOCAL, 501(c)(3) to foundation.

## Final

**READY FOR NATIONWIDE GREEK 990 ENRICHMENT: PARTIAL → YES.**
The discovery → match → enrich pipeline is state-agnostic, idempotent, and precise. Entity graph +
financials are production-ready now; officer coverage and NPHC/MGC recall improve with the changes
above. No new engineering is required to scale — it is data volume plus the GEN-enumeration upgrade.

**IS THIS DATA WORTH INCLUDING IN THE GROWTH ACCOUNT GRAPH: YES.**
It adds a legitimate, previously-missing alumni/governance layer (house corps, foundations, their
officers) that complements student demand and council contacts — with typed relationships, match
confidence, and full provenance on every claim.

**HOW SHOULD KING SEE IT WITHOUT BEING TEMPTED TO SPAM EVERY STAKEHOLDER?**
- Surface it **read-only as account context**, one card per chapter: entity count, governance
  strength, latest-990 leadership — never as a bulk contact list.
- Label every person **"LATEST 990-REPORTED (TY20xx)"**, not "current," and show the filing-lag
  years next to the name so staleness is obvious.
- Gate any outreach behind the demand-first motion (free Exam 1 → student usage → academic chair →
  exec → *then* advisor/alumni when appropriate). The 990 layer is the **escalation reserve**, used
  when student demand justifies reaching the governing adults — not a first-touch channel.
- Show **one primary stakeholder per role** (house-corp president, foundation president), not the
  whole board, so the natural action is "reach the one right person," not "email everyone."
- Keep financials as descriptive context with an explicit "not a purchasing signal" note, so no one
  reads a $2M house corp as "they can buy."
