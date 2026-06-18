
# Data Expansion Strategy — Research Brief + Data Catalog Page

Two deliverables:
1. **Written brief** (below) — what's marketable, who buys it, ballpark cost/lead, ballpark resale.
2. **New internal route** `/outreach/data-catalog` — a living table of every data type we could collect, with source, tool, status (Have / Could add / Researching), cost tier, and target buyer segments. You edit it as we learn; it becomes the roadmap.

---

## Part 1 — Research Brief (ballpark, not quotes)

### The three buyer segments you picked, and what they actually pay for

**A. EdTech / textbook / SaaS vendors → sell to professors**
Highest-value fields, in order:
- Verified work email (the whole game — without it, nothing else matters)
- Department + sub-discipline (Accounting vs. Finance vs. Tax)
- Courses currently taught + enrollment size (= seat count = deal size)
- Textbook currently adopted (massive — competitive displacement signal)
- Title / rank (Adjunct ≠ Full Prof ≠ Dept Chair; chairs make adoption decisions)
- Syllabus PDFs (gold — shows tools, textbooks, LMS, assessment style)
- LMS in use (Canvas / Blackboard / D2L) — integration-dependent products care a lot
- RateMyProfessors signal (you already have this — proxy for student volume)
- Years at institution / tenure status

Comparable products: Lead411, MDR (Market Data Retrieval), Agilix, Higher Ed Direct. They sell faculty lists at roughly **$0.30–$1.50 per verified contact** in bulk, **$2–$5/lead** for enriched (course + textbook) records, and **$15k–$60k/yr** for subscription access to a vertical (e.g., "all US accounting faculty, refreshed quarterly").

**B. Recruiters / executive search / talent**
- LinkedIn URL (table stakes)
- Publications + h-index (Google Scholar)
- Research areas / keywords
- Tenure status + years in rank (proxy for "movable")
- Prior institutions (career trajectory)
- Grants received (NIH/NSF RePORTER — public)
- Personal website / CV PDF

Comparable: AcademicJobsOnline, HigherEdJobs data feeds, Interfolio. Recruiters pay **$5–$25 per enriched academic profile** and **$500–$2,000/seat/month** for search platforms.

**C. Greek life vendors (apparel, insurance, housing, events, jewelry, composites)**
- Chapter name + national org + campus
- Chapter president / recruitment chair / treasurer / house manager (the 4 roles that buy things)
- Officer email + phone
- House address (for shipping)
- Member count (deal size)
- Recruitment dates (timing for apparel orders)
- Philanthropy events (sponsorship opportunities)
- Instagram handle (verification + outreach channel)
- Nationals HQ contact (for multi-chapter deals)

Comparable: there is **no dominant data broker** here — it's a fragmented market. Vendors mostly buy lists from defunct competitors or scrape themselves. This is an opportunity: a clean, refreshed Greek-officer database could sell at **$1–$3 per officer-contact** or **$200–$800/mo per vendor** for filtered access (e.g., "all SEC sorority recruitment chairs").

### Other high-value data classes worth scraping later

| Class | Why marketable | Buyer |
|---|---|---|
| **Procurement / AP staff** (Director of Procurement, Buyer II, AP Manager) | RFP gatekeepers — anything sold to universities ($50k+ deals) goes through them | Furniture, software, food service, uniforms, lab equipment vendors |
| **IT directors / CIOs / Instructional Designers** | LMS, SaaS, EdTech buying committee | EdTech, cybersecurity, cloud |
| **Athletics staff** (compliance, equipment, nutrition) | Niche but high-ticket | Sports nutrition, apparel, video analysis |
| **Research lab PIs + lab websites** | Equipment + reagent buyers | Lab supply, scientific instruments |
| **Career services directors** | Employer relations | Recruiting platforms, assessment tools |
| **Student org presidents (non-Greek)** — clubs, business orgs | Sponsorship, recruiting | Banks, consulting firms, CPG |
| **Course catalogs + syllabi at scale** | Curriculum intelligence | Publishers, EdTech, accreditation consultants |
| **Enrollment by program** (IPEDS — free) | Sizing & territory planning | Everyone |
| **Endowment + budget data** (IPEDS, 990s — free) | Qualifying schools | Big-ticket vendors |

### Tools you'd add (ballpark cost, "good enough" tier)

| Tool | What it adds | Ballpark |
|---|---|---|
| Firecrawl (have) | HTML → markdown, JS rendering | ~$0.001–0.005/page |
| SerpAPI (have) | Google results for URL discovery | ~$0.005/query |
| Hunter.io or Apollo | Email pattern + verification | $0.01–0.04/verified email |
| RocketReach | LinkedIn → email | ~$0.10/lookup |
| PhantomBuster / Bright Data | LinkedIn profile scraping at scale | $0.03–0.15/profile (TOS-risky) |
| Proxycurl | LinkedIn profile API (cleaner legally) | ~$0.05–0.10/profile |
| Google Scholar (free, rate-limited) or SerpAPI Scholar | Publications, h-index | $0.02/query via SerpAPI |
| NIH RePORTER / NSF Awards (free APIs) | Grants | $0 |
| IPEDS (free) | Enrollment, budgets | $0 |
| Lovable AI Gateway | LLM extraction from messy HTML | ~$0.001–0.01/page |

### Ballpark unit economics

**Faculty lead, enriched (email + dept + courses + LinkedIn + RMP):**
- SerpAPI discovery: $0.01
- Firecrawl directory + profile pages: $0.01–0.03
- Email verify: $0.02
- LinkedIn enrichment: $0.05–0.10
- LLM parsing: $0.005
- **Total: ~$0.10–0.20 per enriched faculty lead**

**Per campus** (one department, ~20 profs): **~$3–5 all-in.**
**Whole campus, all depts** (~800 profs): **~$80–160.**

**Greek chapter officers** (4 officers/chapter, ~30 chapters/campus = 120 contacts):
- Per campus: **~$15–30** with IG enrichment.

### Resale ballpark

- **One-time list sale**: $1–$3/contact for faculty, $1–$2/contact for Greek officers.
- **SaaS subscription**: $300–$1,500/mo per vendor for filtered, refreshed access to a slice (e.g., "all R1 accounting faculty" or "all SEC fraternity recruitment chairs").
- **Enterprise / annual seat**: $15k–$60k/yr for a vertical with quarterly refresh + API.
- **Margin** at $0.15 cost / $2 sale = ~92% gross — the moat is *coverage + freshness*, not the scrape itself.

### What I'd actually build next (priority order)
1. **Textbook adoption + syllabus extraction** from existing faculty profile scrapes — biggest EdTech-buyer lift, near-zero added cost.
2. **LinkedIn URL enrichment** via Proxycurl — unlocks recruiter segment.
3. **Procurement staff scraping** as a parallel pipeline (different directory pages, same toolchain).
4. **Greek officer scraper** cloned from the faculty pipeline — different sources (chapter sites, IG, campus Greek life pages, nationals directories).
5. **IPEDS bulk import** — free, makes every campus row 10x more sellable.

---

## Part 2 — `/outreach/data-catalog` page (what I'd build when you say go)

A single internal route, link from the outreach nav. Three things:

**a) Data Types table** — seeded with every field above, columns:
`Category | Field | Source | Tool(s) | Status | Cost tier | Buyer segment(s) | Notes`

Status values: `Have it` / `Partial` / `Could add` / `Researching` / `Won't do`.
Cost tiers: `Free` / `$` / `$$` / `$$$`.
You edit inline; persists to a new `data_catalog_entries` table.

**b) Buyer Segments panel** — three cards (EdTech, Recruiters, Greek vendors) each listing the fields they care about most + ballpark resale price. Editable.

**c) Cost Model widget** — small calculator: pick a campus size + which fields to include → outputs estimated cost/lead and cost/campus using the per-tool ballparks above. Pure client-side math, no backend calls.

No scraping logic changes. No new pipelines. Just the catalog + the math, so we have a shared map before committing to new tools.

### Technical sketch
- New route: `src/routes/_authenticated.outreach.data-catalog.tsx`
- New table: `data_catalog_entries` (id, category, field, source, tools[], status, cost_tier, buyer_segments[], notes, sort_order)
- New table: `data_catalog_buyer_segments` (id, name, description, target_price_per_lead, target_price_subscription, key_fields[])
- Seeded via migration from the brief above.
- Cost calc lives in `src/lib/data-catalog-pricing.ts` as a pure function — no server calls.

---

Nothing gets built until you say go. When you're ready, tell me whether to ship just the catalog page, or also start one of the new pipelines (my vote: #1 textbook/syllabus extraction — cheapest, biggest immediate EdTech value).
