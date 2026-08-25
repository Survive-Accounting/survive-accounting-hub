# Final Dashboard Integration Handoff — Contacts + Outreach QC

**2026-08-25 · READ-ONLY handoff.** No new discovery, nothing sent, dashboard not built. This maps the
exact data model a future OUTREACH tab + queue would sit on. Machine-readable twin:
`FINAL_INTEGRATION_GROWTH_CONTACTS.json`.

Ownership legend: **[GCI]** this system · **[BACKFILL]** Campus Backfill (read-only) · **[ADMIN]** Growth
Admin · **[COMMS]** unified comms · **[GREEK]** registry/990.

---

## 1. Outreach tab contract

**Single read surface: the `growth_outreach_eligibility` view**, filtered `where campus_id = :campus`.
It already unions every legitimate public contact for a campus (one row per contact):

| Reach path | Rows in view | contact_source / filter |
|---|---|---|
| IFC / Panhellenic / NPHC / MGC councils | `entity_type='council'`, `council_type` | campus_council_contacts **[BACKFILL]** |
| Individual chapters | `entity_type='chapter'`, `chapter_id` | growth_public_contacts **[GCI]** |
| Chapter execs | `contact_type='chapter_exec'` | growth_public_contacts |
| Role inboxes | `contact_type='role_inbox'` | both |
| General emails | `contact_type='organization_general'` | both + growth_business_clubs.general_email |
| Instagram | `contact_type='social_account'` / `instagram` not null | all sources |
| FSL advisors | `contact_type='staff_advisor'` / `campaign_purpose='ADVISORY_ESCALATION'` | normalized in `growth_advisors` |
| Business clubs | `entity_type='club'`, `org_id` | growth_business_clubs **[GCI]** |

**Fields** (view): `contact_id, contact_source, campus_id, chapter_id, council_type, org_id,
campaign_purpose, contact_type, name, role, email, instagram, source, source_type, confidence,
last_verified, effective_term, effective_year, freshness_status, outreach_eligible, review_reason,
qc_action`.

**Joins for labels:**
```
growth_outreach_eligibility.campus_id  = campuses.id
                          .chapter_id  = campus_greek_chapters.id
campus_greek_chapters.greek_org_id     = greek_orgs.id            -- chapter/org name + letters
council: (campus_id, council_type)     -- no council table; label from council_type
                          .org_id      = growth_business_clubs.id
advisors: growth_advisor_links.advisor_id = growth_advisors.id
          growth_advisor_links.entity_id  = campus_greek_chapters.id / campus_id
990 context: greek_org_people.chapter_id = campus_greek_chapters.id (org_id = greek_orgs.id)
```

Advisor display should use `growth_advisors` (one row) + `growth_advisor_links` (its chapters/councils),
not the per-chapter duplicates — so the drawer shows "Advisor: Remi Ventura — 8 councils" once.

## 2. Contact display classification

| UI label | Rule (on the view) |
|---|---|
| **CURRENT / HIGH CONFIDENCE** | `outreach_eligible=true AND confidence='high'` — role inboxes, official-page emails, advisors on official pages |
| **VERIFY** | `freshness_status='verify_before_use'` — named officer, no current-term evidence (748 today) |
| **SOCIAL** | `contact_type='social_account'` — Instagram handle |
| **ADVISORY / ESCALATION** | `campaign_purpose='ADVISORY_ESCALATION'` — FSL advisor (never student marketing) |
| **990 CONTEXT** | `greek_org_people` rows for the org — a context panel, **not an outreach recipient** |

Medium-confidence eligible rows (chapter IG, official general emails) render normally (usable, King eyeballs).

## 3. Checkbox → outreach queue

| Capability | Status | Backing |
|---|---|---|
| Select recipients | **EXISTS** | query `growth_outreach_eligibility` by campus, group by entity |
| One contact per org | **NEEDS BUILD** | data supports it (rank by confidence, prefer role_inbox/general over named officer); the *selection rule* is new |
| Avoid duplicate recipients | **PARTIAL** | advisors already normalized (`growth_advisors`); still dedupe by `lower(email)` across selected rows at queue time |
| Suppression | **EXISTS** | `comms_suppressions (email, phone, reason, source)` — check before queueing |
| Prior-contact checks | **EXISTS (empty)** | `growth_outreach_events` by `contact_id`/`email` — "already emailed?" |
| Verify-before-use | **EXISTS** | exclude `freshness_status='verify_before_use'` (and `qc_action != 'approve'`) from queue |
| Queue state | **EXISTS (empty)** | `growth_outreach_events.status='queued'` (+ `campaign_id`) is the queue |
| QC state | **EXISTS** | `growth_contact_qc.qc_action` must be `approve` to be queue-eligible |

**"93 emails ready"** = `count(growth_outreach_eligibility where campus in selected AND email not null AND
outreach_eligible AND qc_action='approve' AND email not in comms_suppressions AND contact not already in
growth_outreach_events)`.

**Dashboard build must ADD:** the one-per-org primary-selection rule, a queue-assembly service (dedupe →
suppress → prior-contact → approve/verify gate → write `growth_outreach_events` status='queued'), and the
"ready" counter query. **No new tables strictly required** — `growth_outreach_events` is the queue+history.

## 4. Email preview / merge-variable contract

Every variable exposes **value · source · confidence · last_verified**. Hold rules below.

| Variable | Value source | Confidence | Last verified | Required |
|---|---|---|---|---|
| `first_name` | contact.name (first token) | medium; **often null** | contact.last_verified_at | **yes** |
| `role` | contact.role (normalized) | medium/low | contact.last_verified_at | **yes** |
| `chapter` | greek_orgs.name via chapter | medium | chapter.updated_at | optional |
| `council` | campus_greek_chapters.council (councilKey) | medium (dirty free-text) | chapter.updated_at | optional |
| `campus` | campuses.name | **high** | internal | **yes** |
| `course_code` | course-intel intro_1 | **low/missing** | course-intel run | when used |
| `professor` | Intro-1 professor evidence | **low/missing** | course-intel run | when used |
| `exam_date` | campus_exams | **low/missing** | exam-intel run | when used |
| `tracked_link` | generated per recipient (referral `/r/<code>` or UTM) | high (generated) | generation | **yes** — *generator NOT built (referral branch unmerged)* |

**Hold for review (NEEDS_REVIEW, never auto-send) when:** any required variable is null/low-confidence, OR
the template implies a *current* officer and the contact is `verify_before_use`, OR the target email is in
`comms_suppressions`. Because term/year is 0% today, **any "Hi {first_name}, as {role} this term…" copy is
NEEDS_REVIEW until King verifies the person.**

## 5. Outreach history

**The spine exists but is EMPTY and unused:** `growth_outreach_events` **[ADMIN]** —
`id, contact_id, entity_type, entity_id, campus_id, council_slug, channel(email|ig_dm|text|call|other),
direction(outbound|inbound), status(queued|sent|delivered|bounced|opened|clicked|replied|unsubscribed|
logged|no_answer|left_message), campaign_id, template_id, message_id, subject, body, occurred_at,
next_follow_up_at, follow_up_done_at, notes`.

| Need | Exists? | Where |
|---|---|---|
| queued / approved / sent / delivered / opened / clicked / replied | ✅ (status values) | growth_outreach_events |
| bounce / unsubscribe | ✅ | status + `comms_suppressions` |
| follow-up | ✅ | next_follow_up_at / follow_up_done_at |
| Instagram DM | ⚠️ log-only | `channel='ig_dm'` (no Meta send/receipt) |
| suppression | ✅ | `comms_suppressions` |
| **reply category (positive/negative/interested)** | ❌ | **does not exist — add `reply_category`** |
| growth-contact-linked send pipeline | ❌ | `comms_sends` is `lead_id`-based (faculty), not wired to growth `contact_id` |

**Per-campus / per-chapter rollups** (Emails sent · Replies · Positive replies · DMs · Follow-ups due)
are **computable from `growth_outreach_events`** grouped by `campus_id` / `entity_id` **once it's
populated** — except **Positive replies**, which needs the new `reply_category` field.

## 6. Daily targets (counters only — no automation)

Data supports the counters; only a small **targets config is missing**.

| Counter | Count from |
|---|---|
| Emails 42 / 100 | `growth_outreach_events where occurred_at::date=today AND channel='email' AND direction='outbound' AND status in (sent,delivered,opened,clicked,replied)` — target `100` from config |
| Instagram 7 / 20 | same, `channel='ig_dm'` |
| Follow-ups 11 | `where next_follow_up_at <= now() AND follow_up_done_at is null` |

**Build should add:** a `growth_daily_targets` (or settings row) for the denominators; everything numeric
is a `growth_outreach_events` aggregate.

## 7. King QC — canonical structures

| Structure | PK | Row grain | Join keys | Safe actions |
|---|---|---|---|---|
| `growth_contact_qc` | `id` | one per `(contact_source, source_id)` = one per contact | `campus_id→campuses`, `entity_id→chapter/club`, `(contact_source,source_id)→source row` | UPDATE `qc_action, qc_edits, qc_notes, effective_term, outreach_eligible, review_reason` |
| `growth_outreach_eligibility` (view) | `qc_id` | one per contact | reads growth_contact_qc | **read-only** (write to growth_contact_qc) |
| `growth_advisors` | `id` | one per advisor email | `primary_campus_id→campuses`, `id→growth_advisor_links` | UPDATE name/title/confidence/last_verified; merge dupes |
| `growth_advisor_links` | `id` | one per `(advisor, entity)` | `advisor_id→growth_advisors`, `entity_id→campus_greek_chapters`, `campus_id→campuses` | INSERT/DELETE a link |
| `growth_public_contacts` | `id` | one contact-point per entity | `campus_id→campuses`, `entity_id→chapter/club` | UPDATE contact fields (this system's rows) |
| `campus_council_contacts` | `id` | one per (campus, council, email) | `campus_id→campuses` | **READ-ONLY** (Campus Backfill) |
| `growth_business_clubs` | `id` | one org per (campus, category) | `campus_id→campuses` | UPDATE club fields |

King queue = `growth_contact_qc where qc_action='pending'`. Actions APPROVE / EDIT / WRONG_DATA / REJECT /
SKIP. **All sends, campaigns, templates, automation toggles, and advisor outreach require Lee approval.**

## 8. Instagram / Meta

**Exists now (displayable):** ~3,039 Instagram handles across `growth_public_contacts.instagram_url`
(chapter, 2,322 social), `growth_business_clubs.instagram_url`, `campus_council_contacts.instagram_url`.
The dashboard can show handles as links and log a **manual** DM via `growth_outreach_events.channel='ig_dm'`.

**Requires future Meta integration (NOT present — do not assume it):** automated DM send, delivery/read
receipts, inbound-DM capture — i.e. Instagram Graph / Meta Business messaging. None is wired.

**Design now so email + DM coordinate later:** `growth_outreach_events` already unifies both channels on
one per-contact timeline (`channel`, `direction`, `status`, `contact_id`, `campaign_id`, `next_follow_up_at`).
Add now, cheaply, so Meta can slot in later without rework: **`reply_category`**, and an external-ref field
(e.g. `external_thread_id`) for future DM threads. Keep `comms_suppressions` **channel-agnostic** so an
opt-out suppresses both email and DM.

## 9. Code / migrations / DB state

- **Branch:** `growth/contact-intel-v1` · **HEAD** `74badae7` · **pushed** to origin · **NOT merged to main** · based on `overnight/growth-admin-v1` (also unmerged).
- **Applied migrations (LIVE):** `20260824_1500_growth_contact_intel.sql`, `20260825_1200_contact_qc.sql`; plus (not ours, already live) `20260824_1200_council_contacts.sql` [BACKFILL] and `20260823_1200_growth_admin_contacts_outreach.sql` (provides `growth_outreach_events`).
- **Unapplied migrations:** none in this worktree.
- **DB state:** all `growth_*` tables live and populated (contacts 2,675 · QC 4,302 · advisors 391 · links 896 · clubs 62); `growth_outreach_events` live but **empty**.
- **Needs merge:** `growth/contact-intel-v1` for the **server-function code + `growth_outreach_eligibility` view definition** (the DB objects are already live, but the app code lives on the branch). Dashboard integration should merge/cherry-pick this branch.

## 10. Final

**CONTACT + QC LAYER READY FOR DASHBOARD INTEGRATION: PARTIAL**

Ready: the read model (`growth_outreach_eligibility`), QC queue + actions, advisor normalization,
freshness gating, suppression list, and the outreach-history/queue spine all exist, are live, and are
populated — a dashboard can render the OUTREACH tab and a selection UI today.

Needs build before first campaign: the **queue-assembly service** (dedupe → suppress → prior-contact →
approve/verify gate), the **one-contact-per-org** rule, **`reply_category`**, a **daily-targets config**,
**tracked_link generation**, the **growth-contact-linked send pipeline** (populate `growth_outreach_events`),
and **Meta DM integration** (future). And the **branch must be merged**.
