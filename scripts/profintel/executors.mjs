/**
 * ProfIntel batch executors
 * =================================================================
 * The batch-runner is provider-agnostic: it calls `scrapeOne(campus, ctx)` and
 * only cares about the returned { costUsd, requests, contactsInserted,
 * contactsWithEmail, error? }. This file holds executor implementations.
 *
 * SAFETY: the live executor is a STUB that THROWS. Wiring it to the real
 * pipeline is a deliberate, reviewed step (see AUDIT §"Wiring live execution").
 * Nothing here can spend money as written.
 */

/**
 * DRY-RUN executor — zero network. Mirrors the runner's built-in simulator but
 * lives here so you can `--executor executors.mjs` explicitly if you want the
 * simulated path to be obvious in logs. Cost/yield come from the CSV row.
 */
export async function scrapeOneDry(campus) {
  const cost = campus.estCostUsd ?? 0.05;
  const m = String(campus.yield || "").match(/(\d+)\s*-\s*(\d+)/);
  const mid = m ? Math.round((+m[1] + +m[2]) / 2) : 10;
  return { costUsd: cost, requests: 12, contactsInserted: mid, contactsWithEmail: Math.round(mid * 1.1), simulated: true };
}

/**
 * LIVE executor — NOT wired. This is where a future, reviewed change connects
 * the runner to the existing ProfIntel pipeline. There are two viable ways to
 * do it; both require the provider keys (FIRECRAWL_API_KEY, SERPAPI_API_KEY,
 * AI_GATEWAY_API_KEY) which live server-side, NOT in the local repo .env.
 *
 *   OPTION A — call the deployed app's server functions over HTTP (recommended):
 *     The app already exposes autoDiscoverCampusUrls -> scrapeCampusFaculty ->
 *     scrapeCampusRmp as TanStack server fns. Resolve the campus row to its UUID
 *     (query Supabase by name/state), then POST the three endpoints in order,
 *     exactly as BatchScrapePanel.runOne does (faculty MUST precede rmp so the
 *     directory markdown is cached). Read the returned perPage + mapFallbackUsed
 *     and compute costUsd via src/lib/scrape-cost.ts estimateRunCostUsd(); count
 *     requests from urls_attempted + enrich outcomes + serp calls.
 *
 *   OPTION B — run inside the app/server runtime and import the server fns
 *     directly. Only works where import.meta env has the provider keys.
 *
 * IMPORTANT: whichever option, the campus->UUID resolution and the Supabase
 * writes are handled BY THE EXISTING PIPELINE (which already dedupes by email
 * against active suggestions). The runner must NOT write professor rows itself.
 */
export async function scrapeOne(/* campus, ctx */) {
  throw new Error(
    "LIVE executor is not wired. This is intentional: it prevents accidental paid " +
    "scraping. To enable a real run, implement scrapeOne() per the OPTION A notes " +
    "in scripts/profintel/executors.mjs, confirm provider credit balances first " +
    "(SerpAPI GET /account.json, Firecrawl GET /v2/team/credit-usage), then invoke " +
    "the runner with --execute --executor scripts/profintel/executors.mjs."
  );
}
