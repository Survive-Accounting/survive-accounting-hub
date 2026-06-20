# Survive Accounting — Lead Scraper: Full Context

> Paste this whole file into a new Claude chat to bring it fully up to speed on
> the scraper tool — what it does, why it exists, how it's built, and how to
> extend it. It covers both the **technical** system and the **business vision**.
> (You can always re-download the latest copy from the app: **Lead Finder →
> Batch scrape → "Download context (.md)"**.)

---

## 1. What this is, in one paragraph

This is an internal tool that finds **leads** for SurviveAccounting.com. Today a
"lead" is a US **accounting professor**: their name, title, email, RateMyProfessor
(RMP) rating, and whether they're a CPA/PhD. The tool crawls university websites,
extracts faculty, enriches each person from their profile page, cross-references
RateMyProfessor, and drops the results into a review queue where a human approves
and imports them for outreach. It's built to generalize beyond accounting (Greek
organizations are next) and is being shaped into a **product we can sell**: pick
a batch of campuses, describe a target, get an instant quote, run it, and buy the
resulting leads.

---

## 2. The business vision (why this exists)

**The thesis.** SurviveAccounting sells tutoring to accounting students. The
people with the most influence over struggling students are the **professors who
teach the hard gateway courses** (Intro Financial, Intermediate, Cost, Audit).
Reaching those professors — especially ones whose classes students find difficult
— is a high-leverage channel: a single professor can funnel many students.

**The signal.** Not all professors are equal targets. The strongest are those who
(a) teach **intro/gateway courses**, and (b) have **low RateMyProfessor ratings**
or "tough grader" reputations — a proxy for classes where students are most likely
to need outside help. That's why we capture RMP data alongside contact info, and
why the app auto-tags likely "Intro Target" professors.

**The product.** The same machine that builds our accounting list can build lists
for *anyone*. The roadmap is to sell lead packages: a buyer picks campuses,
describes who they want (a "vertical"), sees an instant cost + delivery estimate,
runs the scrape (or we run it), previews the leads, and pays. The **Batch Scrape**
screen is the first version of that experience (minus the storefront/payment,
which is a later phase).

**The expansion (verticals).** New target types are added as **configs**, not as
forked copies of the tool. First new vertical: **Greek Organizations** (fraternity
& sorority chapter contacts and advisors). After that, anything with a public
web directory — athletics staff, admin offices, professional associations, etc.

---

## 3. How the scraper works (pipeline)

A run for one campus moves through these stages:

1. **Discover URLs** (`auto-scrape.functions.ts` → `autoDiscoverCampusUrls`).
   Uses SerpAPI to find the campus's faculty/directory page(s) and its RMP school
   page. Returns `{ facultyUrls, rmpUrl }`.

2. **Scrape the faculty roster** (`faculty-scrape.functions.ts` →
   `scrapeCampusFaculty`). For each roster URL:
   - **Firecrawl** fetches the page (markdown + raw HTML + links).
   - A deterministic **directory-card parser** (`directory-cards.ts`) and a
     **Gemini AI extractor** pull out people: name, title, email, profile link.
   - **Pagination walker** clicks/scrolls "next" pages when the roster is paged.
   - If too few emails are found, a **Firecrawl `map` fallback** discovers the
     real roster page and re-scrapes.

3. **Enrich each person from their profile page** (the coverage workhorse).
   For anyone still missing an **email or a title**, the engine opens their
   individual profile page and extracts the email, the title, CPA/PhD flags, and
   ancillary links (LinkedIn/CV). Matching names → profile URLs is done by slug
   matching with several name formats plus a "contains both names" fallback.

4. **Cross-reference RateMyProfessor** (`rmp-scrape.functions.ts` →
   `scrapeCampusRmp`). Pulls the campus's RMP professors via their GraphQL API and
   fuzzy-matches them to the scraped faculty (and reverse-looks-up extras).

5. **Triage & import.** Results land in `campus_lead_suggestions` as a review
   queue. A human approves/edits in **Lead Finder**, and approved rows become
   `outreach_leads` for campaigns.

6. **Self-diagnosis.** Every run records a **debug bundle** (`scrape-debug.server.ts`)
   and asks Gemini for one generalizable improvement suggestion, surfaced in the
   **Scraper Trends** dashboard. This is how the tool tells us where it's weak.

**The known hard part:** the bottleneck is *field-level extraction quality* —
finding emails and titles on profile pages — not finding names. The V2 work
focused enrichment on exactly that (open profiles for missing email **or** title,
read the title off the same page, and recover more profile URLs).

---

## 4. Data model (key tables)

- **`campuses`** — the universities. Approval status, program levels, course data.
- **`campus_lead_suggestions`** — the scrape review queue. Each row is a candidate
  person (`research_mode` = `faculty_scrape` or `rmp_scrape`). `raw_payload` holds
  extras (title, profile_url, CPA/PhD, **links**, email confidence).
- **`outreach_leads`** — approved leads promoted from suggestions (`source` =
  `faculty_scrape`/`rmp_scrape`). Feed campaigns.
- **`outreach_campaign_leads`** — membership of a lead in a campaign sequence.
- **`scrape_jobs`** — live job HUD (realtime status of running scrapes).
- **`scrape_debug_bundles`** — per-run diagnostics + `credits_estimate_usd` (the
  real operation-counted cost; the metrics panel sums these for "Total spent").
- **`scrape_improvement_suggestions`** — the AI's per-run improvement ideas.
- **`scrape_batches`** *(new)* — one row per batch "order" (campuses, quote,
  actual cost, leads, status).
- **`scraper_projects`** *(new)* — VA project tracker (name, vertical, assignee,
  status, links) — e.g. the Greek project.

---

## 5. Cost model

All costs flow through **`src/lib/scrape-cost.ts`** — the single place to calibrate
dollars. A finished run's cost is **operation-counted**: directory scrapes +
profile scrapes + pagination pages + map calls + AI extractions, each at a
configurable USD rate. Tune `SCRAPE_UNIT_COSTS_USD` to your real Firecrawl/Lovable
billing. `EST_COST_PER_CAMPUS_USD` is the a-priori per-campus number used for batch
quotes before a run. The **Scrape Metrics** panel shows real total spend (summed
from `scrape_debug_bundles`), and the **Batch Scrape** quote shows cost vs. sell
price vs. margin.

The main **coverage ↔ cost dial** is `PROFILE_ENRICH_LIMIT` in
`faculty-scrape.functions.ts`: more profile fetches = better email/title coverage =
more spend. Watch the cost meter when you change it.

---

## 6. Adding a vertical (how Greek gets built)

Verticals live in **`src/lib/verticals.ts`**. Each is a config:

```
{
  id, label, status: "live" | "in_development",
  description, searchQueryTemplate, deptFilterTerms, leadType, deliveryNote
}
```

- `accounting` is **live** (fully tuned).
- `greek` is **in_development** — the config exists, but the engine's extraction
  logic is still accounting-tuned. Making Greek produce good leads is **King's
  first project**: tune the search query, the page selection, and the
  person-extraction so chapter contacts/advisors come through cleanly.
- The vertical's `status` drives the Batch Scrape quote's delivery promise
  ("instant" vs. "needs tuning ~2 weeks").

**Important:** add and tune a vertical as a **config + targeted engine tweaks**.
Do **not** fork the whole pipeline — that creates two codebases that drift. The
goal is one shared engine that gets better for everyone.

---

## 7. Codebase map (where things live)

- `src/lib/auto-scrape.functions.ts` — URL discovery (SerpAPI).
- `src/lib/faculty-scrape.functions.ts` — the core scraper + profile enrichment.
- `src/lib/directory-cards.ts` — deterministic directory-card parser.
- `src/lib/rmp-scrape.functions.ts` — RateMyProfessor matching + `resetCampusLeads`.
- `src/lib/scrape-cost.ts` — the cost model (calibrate here).
- `src/lib/verticals.ts` — the vertical config seam.
- `src/lib/batch-scrape.functions.ts` — global reset of scraped leads.
- `src/lib/scrape-debug.server.ts` — per-run diagnostics + AI suggestions.
- `src/lib/role-keywords.ts` — accounting role/title keywords + "Intro Target" tag.
- `src/components/outreach/BatchScrapePanel.tsx` — the Batch Scrape UI.
- `src/components/outreach/ScrapeMetricsPanel.tsx` — cost/coverage metrics.
- `src/routes/outreach.leadfinder.$campusId.tsx` — single-campus Lead Finder.
- `src/routes/outreach.leadfinder-batch.tsx` — the Batch Scrape route.
- `migration/supabase-migrations/` — hand-written SQL migrations.

**Stack:** TanStack Start (`createServerFn` for server logic) + React + Tailwind +
shadcn/ui, Supabase (Postgres), Firecrawl (scraping), SerpAPI (discovery), Gemini
via the Lovable AI gateway (extraction). Runtime: Bun. Frontend is also editable in
Lovable, which previews/syncs the `main` branch.

---

## 8. How to work on it

- The engine is plain TypeScript. Server-side logic uses `createServerFn`; it runs
  on the server and talks to Supabase via the **service-role** client
  (`@/integrations/supabase/client.server`). UI uses the **anon** client.
- To change extraction behavior, edit `faculty-scrape.functions.ts` (or add a
  vertical config + targeted tweaks).
- To change costs, edit `scrape-cost.ts`.
- New database tables need a SQL migration in `migration/supabase-migrations/`,
  applied through Lovable (Lovable does **not** auto-apply committed SQL — ask it
  to run the migration explicitly).
- Keys (Firecrawl, SerpAPI, Lovable, Supabase) live in server env vars — never
  commit them, never put secrets in the repo.

**Collaboration (King + founder):** work on **feature branches**, open **pull
requests**, and the founder reviews + merges to `main`. `main` is protected and
auto-publishes via Lovable. Branch previews come from Vercel. Code with **Claude
Code** using your own GitHub account. (Full setup instructions were provided
separately.)

---

## 9. Current state & roadmap

**Shipped (V2):**
- Profile enrichment now backfills **titles** (not just emails) and recovers more
  profile URLs — the big coverage fix.
- **Operation-counted cost** meter + total spend + batch margins.
- **Batch Scrape** screen (pick campuses → quote → run → preview).
- **Vertical seam** (accounting live; Greek scaffolded).
- LinkedIn/CV link capture; reset-all-leads; downloadable context (this file).

**Next / deferred:**
- Academic enrichment APIs: **ORCID**, **OpenAlex**, **Google Scholar** (free/
  cheap publication + citation data per professor).
- **Firecrawl FIRE-1 agent** fallback for the hardest JS-paginated directories.
- **Greek vertical** tuning (King's first project).
- In-app **Projects** panel (the `scraper_projects` table is already provisioned).
- Customer-facing storefront: accounts, payment, automated delivery.

---

## 10. Using this in a new Claude chat

Start your message with something like:

> "Here's the full context for a lead-scraper tool I'm working on. Read it, then
> help me with **[your task — e.g. 'tune the Greek vertical so it extracts
> fraternity chapter advisors']**. Ask me anything you need."

…then paste this whole file. Claude will have everything above and can dive in.
