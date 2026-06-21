## What you're actually seeing

**RMP is working.** Look at row "Jing Cui — ★ 3.3 (6)" in your screenshot. The Walton/Arkansas RMP scrape (school 18455) ran, matched real professors, and wrote `rmp_rating` onto their suggestions. The earlier reverse-insert + businessish-dept logic is doing its job.

**The empty RMP cells are a faculty-scrape junk problem, not an RMP problem.** Every row in your screenshot with `—` in RMP is not a person:

| Row name | What it actually is |
|---|---|
| "Sam M. Walton College of Business" | School name in a page header |
| "New & Noteworthy / View all news" | Sidebar nav link |
| "What Makes a Graduate School Application Compelling…" | News article headline |
| "2026 Graduate Outstanding Program Scholar: Sara Twining…" | Press release headline |
| "Walton College Accounting Student Awarded Prestigious FASB Assistantship" | Press release headline |
| "Show your support.\\ \\ Invest in Accounting Students" | Donation CTA block |

These came from `walton.uark.edu/departments/accounting` (the marketing landing page), which the discover step picked up alongside the actual `directory.php`. Because they have no real first/last name, **they cannot match an RMP teacher record by name**, so RMP stays `—` forever. That's what you're interpreting as "RMP not working."

The Arkansas debug bundle confirms this: 39 clean leads came from `directory.php`, but 7 junk rows came from the `/departments/accounting` landing page, and 3 more from `/directory/` (the deans page). The leads that ARE real people got RMP attached.

## Fix (single slice)

### 1. Reject non-person rows at insert time (faculty scrape)

Add a small `isLikelyPersonRow()` gate in `src/lib/faculty-scrape.functions.ts`, applied right before we insert a `campus_lead_suggestion`. A row must pass ALL of:

- `first_name` and `last_name` are both present, each ≥ 2 letters, alphabetic (apostrophes/hyphens allowed).
- Combined name is ≤ 60 chars, has ≤ 4 tokens.
- Name does NOT contain news/headline/marketing tokens: `college|school|department|news|view all|noteworthy|invest|support|application|scholar|assistantship|award|tips|game plan|click here|learn more|read more|donate`.
- Name is not a verb-led headline (starts with `Show|Invest|Learn|Read|View|Click|Apply|Submit|Get|Discover|Explore`).
- If `title` exists, it does not start with `[Dean's Office]` / `[News]` / `[Press]` style bracketed section labels, AND it is not a URL-shaped string (no `https?://`, no `.php`, no `.html`).
- Email local-part is not in `{news, info, contact, support, donate, give, hello, admin, webmaster, undergrad, grad, gradu, alumni, dean, options, integr, sbusiness}` UNLESS we also have a clean first+last (covers `peters@walton.uark.edu` legitimately).

Junk that passes the name gate but fails the email gate (like `sbusiness@uark.edu` with name "Sam M. Walton College of Business") is dropped. This is also why your `GUESSED` chip is showing up on garbage — the guesser is being asked to invent an address for a college name. Same `isLikelyPersonRow` gate disables guessing on those rows.

Record each rejection in the existing `perPage` debug array as `{ reason, name, source }` so the debug bundle shows exactly what was filtered. Add a counter `rejected_non_person` to the per-page stats.

### 2. De-prioritize marketing landing pages in discovery

In `auto-scrape.functions.ts`, when SerpAPI returns multiple faculty candidates, demote URLs that look like content pages (path doesn't contain `directory|faculty|people|staff|profiles`, OR contains `news|stories|press|noteworthy|invest|give|donate|events`). Keep them as fallbacks only if no directory-shaped URL is found. This stops the `/departments/accounting` page from being scraped at all on schools that have a real directory.

### 3. No RMP code changes needed

Once junk rows stop being inserted, the RMP column populates naturally on the rows that ARE professors. The matcher and reverse-insert path are already correct (Jing Cui proves it). I'll re-run Arkansas after the filter ships and confirm RMP coverage on real profs jumps from "1 of ~50" to expected ~40-60% (typical RMP coverage for an accounting dept).

## Cost answer for a 170-campus batch

You will NOT run out of credits. Here's the worst-case breakdown:

| Service | Per campus | × 170 | Notes |
|---|---|---|---|
| **Firecrawl** (scrape + enrich) | $0.02–$0.06 | **$3.40 – $10.20** | Arkansas test came in at $0.020. Worst case assumes deep pagination + full profile enrichment. |
| **Lovable AI Gateway** (Gemini extract) | ~$0.0024 | **~$0.40** | ~3 directory URLs × $0.0008. Covered by your monthly AI allowance — likely $0 actual. |
| **SerpAPI** (faculty + RMP discovery) | 2–3 searches | **340 – 510 searches** | One-time per campus. SerpAPI Developer plan = 5,000/mo for $50. Plenty of headroom. |
| **RateMyProfessors** | $0 | **$0** | Their public GraphQL, no key. |
| **TOTAL real $ spend** | | **~$4 – $11** | |

The `EST_COST_PER_CAMPUS_USD` constant ($0.06) × 170 = **$10.20 quoted ceiling**. The Arkansas actual was 3× cheaper than that, so realistic total is **$4–$7**.

The only "credit" service that has a hard monthly cap is SerpAPI. Check your remaining SerpAPI balance — you need ≥510 free searches before kicking off all 170. Everything else (Firecrawl, Lovable AI, RMP) is pay-as-you-go and won't fail mid-batch.

I'd also bump batch concurrency from `2` → `4` for the full 170-campus run; with Firecrawl polling dominating wall time, this cuts the run from ~3 hours to ~90 min without changing cost.

## Recommended order

1. Ship slice above (person-row gate + discovery demote + concurrency bump).
2. Reset Arkansas, re-run Batch V2 on Arkansas only, confirm junk is gone and RMP populates on real profs.
3. Kick off the 170-campus batch.

Approve and I'll build it.
