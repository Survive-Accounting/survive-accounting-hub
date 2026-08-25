# Contact Intelligence — V1 Quality + King QC Layer (Integration-Ready)

**2026-08-25.** Built on top of the discovered contacts. **No discovery restart, nothing sent.**
Campus Backfill's `campus_council_contacts` is read-only throughout — all QC state lives in new
`growth_*` tables. Investment/Finance nationwide expansion is deferred (not a Growth-V1 blocker).

Companion machine-readable contract: `KING_QC_DATA_CONTRACT.json`.

---

## What was built (schema — migration `20260825_1200_contact_qc.sql`, applied live)

| Table / view | Role |
|---|---|
| `growth_advisors` | one normalized identity per advisor (keyed on email) + `chapters_linked`/`councils_linked` |
| `growth_advisor_links` | advisor → many chapters/councils/campuses (**preserves the shared relationship**) |
| `growth_contact_qc` | polymorphic QC + eligibility + King-queue state across **all** contact sources |
| `growth_outreach_eligibility` (view) | the reusable outreach-eligibility shape (§6) |

All RLS deny-by-default (service-role only).

## 1 & 3 — Shared-advisor normalization (relationships preserved)

The audit's 231 duplicate emails were mostly one FSL advisor listed against many chapters. Instead of N
unrelated contacts, an advisor is now **one `growth_advisors` row** linked to many entities via
`growth_advisor_links`:

- **392 distinct advisor identities**, **194 of them shared across more than one chapter/council**,
  collapsing **896 source contact rows**.
- Each link records the source (`campus_council_contacts` or `growth_public_contacts`), the entity
  (chapter id, or council_type+campus), and the `source_url` — nothing is lost, and Campus Backfill's
  rows are untouched.
- One advisor now answers "which chapters/councils does this person advise?" directly.

## 2 — UNKNOWN classification

The **137 UNKNOWN** contacts (they live in Campus Backfill's read-only `campus_council_contacts`) are
**classified inside the QC layer** — `growth_contact_qc.contact_type` gets the inferred type (role inbox /
officer / advisor / general) from local-part + name + role heuristics, **without modifying the source
row**. Result: **0 UNKNOWN campaign purposes remain**.

## 4 — Freshness fields (never invented)

Every QC row carries `effective_term`, `effective_year`, `last_verified_at`, `source_url`, `confidence`.
Because discovery captured **no** term/year, those stay **NULL** — we do not fabricate them. `last_verified_at`
falls back to the discovery `retrieved_at`.

## 5 — VERIFY_BEFORE_USE for un-evidenced officers

`freshness_status` is computed per contact:

- `stable` — role inboxes, org general, staff advisors, social accounts (persist across terms)
- `verify_before_use` — **any named student officer / chapter exec with no current-term evidence**
  (this is all of them today: **748 named officers**). These are **not outreach-eligible** until a human
  verifies the person is current.
- `unknown` — low-confidence / unclassifiable
- `current` / `likely_stale` — reserved for when term data exists

## 6 — Reusable outreach-eligibility / QC shape

`growth_outreach_eligibility` exposes exactly the requested shape, one row per contact:

`contact_id · campus_id · chapter_id / council(council_type) / org_id · campaign_purpose · email ·
instagram · contact_type · source · confidence · last_verified · freshness_status · outreach_eligible ·
review_reason`

**Eligibility rule:** eligible when `contact_type != unknown` AND `confidence != low` AND not a
named-officer-without-term. Named officers → `verify_before_use` → not eligible; unknown → not eligible;
low-confidence → not eligible.

Snapshot (4,302 QC rows):

| | Count | % |
|---|---|---|
| Outreach-eligible | 3,538 | 82% |
| Needs review | 764 | 18% |
| — of which verify_before_use (named officers) | 748 | — |

**Campaign purpose split:** STUDENT_DISTRIBUTION 3,090 · ADVISORY_ESCALATION 913 · CHAPTER_SALES 228 ·
CAMPUS_REP_RECRUITMENT 71. (Advisory/escalation is a separate channel from student marketing; rep
recruitment is separate from Greek distribution.)

## 7 — Merge-variable QA contract

Every generated variable exposes **value / source / confidence / last_verified** (full spec in
`KING_QC_DATA_CONTRACT.json`). Coverage today:

| Variable | Source | Typical confidence |
|---|---|---|
| `{campus}` | campuses.name | **high** |
| `{email}` | contact.email + source_url | high on official pages |
| `{first_name}` | contact.name (first token) | medium; **often null** |
| `{role}` | contact.role (normalized) | medium/low (no term) |
| `{chapter}` | greek_orgs.name via chapter | medium |
| `{council}` | campus_greek_chapters.council (normalized) | medium (dirty free-text) |
| `{course_code}` | course-intel intro_1 | **low / missing** |
| `{professor}` | Intro-1 professor evidence | **low / missing** |
| `{exam_date}` | campus_exams | **low / missing** |

**Gating:** an email renders `READY` only if every **required** variable (`{first_name}`, `{role}`,
`{campus}`, `{email}`, plus `{course_code}`/`{professor}`/`{exam_date}` **when the template uses them**)
has a non-null value at acceptable confidence, and — for any officer-implying copy — the contact is not
`verify_before_use`. Otherwise the email is **NEEDS_REVIEW and is never auto-sent** — it goes to King.

## 8 — King QC queue data model

`growth_contact_qc.qc_action` (queue = rows where `qc_action='pending'`):

| Action | Meaning |
|---|---|
| **APPROVE** | correct + usable; for `verify_before_use` this also asserts the officer is current (optionally sets `effective_term`) |
| **EDIT** | fix a field; change stored in `qc_edits {field:newValue}`, source row preserved |
| **WRONG DATA** | a specific value is wrong (wrong person / instagram / org / council); excluded until corrected |
| **REJECT** | unusable (bad email, opted out); permanently excluded |
| **SKIP** | defer; returns to queue |

**King owns:** wrong variable · wrong person · old officer (verify_before_use) · bad email · wrong
Instagram · wrong organization · shared-advisor collapse review · UNKNOWN triage.

**Requires Lee approval:** any outbound send · bulk campaign/list activation · new template · new
campaign type · any automation/auto-send toggle · advisor/escalation outreach · anything touching
billing/seats/pricing · standing rules/persistent config.

## 9 — Investment/Finance nationwide

Deferred by design. Useful for campus-rep recruiting, **not a Growth-V1 blocker**. Ready to run through
the existing runner (`--categories=invfin`) once King's QC layer is in use.

---

## Refresh cadence

- **Annually** (+ on bounce): role inboxes, staff advisors, general emails, websites, IG handles.
- **Each semester**: named officers / chapter execs, business-club presidents (highest churn).
- **On bounce/failure**: immediate re-verify.
- **Monthly**: only contacts a live campaign targets near a term boundary.

## Readiness

**Integration-ready for King QC: YES.** The QC queue, eligibility view, advisor normalization, UNKNOWN
classification, freshness gating, and merge-variable contract are live and populated. Outreach itself
remains gated behind King review + Lee send-approval.

**Before first campaign:** King works the `pending` queue (start with the 748 verify_before_use officers
and the 194 shared advisors), and a template's required merge variables must resolve `READY` or the
email is held as `NEEDS_REVIEW`.
