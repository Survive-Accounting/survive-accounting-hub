# Growth Contact Intelligence

Public-outreach contact discovery for the growth funnel:
**Campus → Council outreach → Individual Greek chapter outreach → Business-club rep recruitment.**

Discovery only. Nothing in this system emails, DMs, texts, follows, or messages anyone —
it collects publicly available information for later human-supervised outreach.

## Separate but connected to Campus Backfill

**Campus Backfill** (`sa-course-intel`, migration `20260824_1200_council_contacts.sql`) owns the
relatively stable campus intelligence, including **council contact discovery**
(`campus_council_contacts`, `campus_council_status`) and the `campuses.greek_eligibility` gate.

**Growth Contact Intelligence** (this system) owns the outreach contacts that change by semester
and adds the two surfaces Campus Backfill does not cover:

| Surface | Owner | Tables |
|---|---|---|
| Council contacts (IFC/Panhellenic/NPHC/MGC) | **Campus Backfill** | `campus_council_contacts`, `campus_council_status` |
| Individual Greek **chapter** contacts | Growth Contact Intelligence | `growth_public_contacts` (`entity_type='chapter'`) |
| **Business clubs** (Women-in-Business / Investment-Finance) | Growth Contact Intelligence | `growth_business_clubs`, `growth_public_contacts` (`entity_type='club'`) |

This system **reads** `campus_council_contacts` / `campus_council_status` to present councils in the
unified outreach view; it never writes them. That is the "separate but connected" boundary.

## Schema (migration `20260824_1500_growth_contact_intel.sql`)

- `growth_business_clubs` — the org entity for rep recruitment (V1: `women_in_business`,
  `investment_finance` only; Beta Alpha Psi excluded). Dedupe key `(campus_id, category, normalized_name)`.
- `growth_public_contacts` — polymorphic contact-point for chapters + clubs, UNION-compatible with
  `campus_council_contacts`. `contact_type ∈ role_inbox | student_officer | staff_advisor |
  organization_general | social_account | unknown` (§8). Temporal (`is_current`, `effective_term`,
  `first_seen`, `last_seen`), provenance (`source_url`, `source_type`, `confidence`, `retrieved_at`),
  `superseded_by` for history.
- `growth_contact_evidence` — every public source a value was seen on. Makes dedupe safe: the same
  email on three official pages → **one** contact row + **three** evidence rows.
- `growth_discovery_status` — per `(campus, category[, entity])` lifecycle:
  `not_run | running | complete | no_result | needs_review | failed | stale`. `NO_RESULT` (ran,
  found nothing) is distinct from `NOT_RUN` (never attempted). Chapter runs track per-chapter.
- `growth_discovery_runs` — one row per batch; SERP/Firecrawl/AI call counts + est USD, for
  resumability and spend accounting.
- `growth_outreach_events` (existing) — reused touch log; its `entity_type` check widened to add
  `'club'`. This is the outreach spine; discovery writes nothing to it.

All tables are RLS deny-by-default (service-role only), matching `campus_council_contacts`.

## Pipeline (`src/lib/growth-intel-core.ts`)

Mirrors the Campus Backfill council pipeline: **search → classify → fetch public source → extract →
normalize → dedupe/match → confidence → save provenance.**

- **Providers:** SerpAPI (`SERPAPI_API_KEY`), Firecrawl v2 scrape (`FIRECRAWL_API_KEY`), Vercel AI
  Gateway → `google/gemini-2.5-flash` (`AI_GATEWAY_API_KEY`).
- **Source priority (§6):** `site:<campus-domain>` scoping first; official university org
  directory / business-school page / university-hosted page rank above org sites and indexed social.
- **Hallucination guard:** every stored email/handle must appear **verbatim** in the fetched page
  (AI output ∩ regex scan). No value is ever invented.
- **Cross-campus guard:** a `.edu` host that is not the campus's own domain is rejected (prevents
  pulling another university's orgs).
- **Social (§7):** `site:instagram.com "<school> <org>"` SERP discovery; handles are verified against
  official sources before storing. No authenticated Instagram crawler.
- Pure, unit-tested helpers (classification, normalization, dedupe, source ranking, confidence) live
  in `src/lib/growth-intel-extract.ts` (+ `.test.ts`).

## Running discovery

**Admin UI:** `/admin/growth/intelligence` — per-campus status, contacts, clubs, and the Instagram
priority queue (§15). "Run discovery" buttons call the server functions; they read the public web and
**send nothing**.

**Batch runner (staged, cost-controlled):**

```bash
bun run scripts/growth-intel/run.ts                      # DRY RUN (plan only, no network)
bun run scripts/growth-intel/run.ts --apply              # live, 10 test campuses, $6 cap
bun run scripts/growth-intel/run.ts --apply --only=clubs --campuses=10 --budget=6 --resume
```

Flags: `--budget` (hard USD stop), `--chapters` (chapters/campus cap), `--only=both|clubs|chapters`,
`--concurrency` (default low, to avoid contending with Campus Backfill on shared keys), `--resume`
(checkpoint file). Graceful SIGINT.

**Export deliverables:**

```bash
bun run scripts/growth-intel/export.ts   # writes the 3 sample CSVs + prints metrics
```

## Future outreach (not built here)

The data supports answering "who should we contact?" by **channel** (EMAIL / INSTAGRAM / TEXT / CALL)
and **campaign** (COUNCIL_DISTRIBUTION / CHAPTER_DISTRIBUTION / CAMPUS_REP_RECRUITMENT). Business
clubs are kept in a **separate channel** from Greek distribution (§16). Outreach automation is
deliberately out of scope — manual human sending is the intended workflow.
