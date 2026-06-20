// Central cost model for the scraper. This is the ONE place to calibrate
// dollars against your Firecrawl + Lovable AI plans. Every per-run cost and
// every batch quote flows through here, so updating these rates updates the
// whole app (the metrics panel, the batch quote, the saved per-run cost).
//
// HOW TO CALIBRATE: Firecrawl bills in "credits". If you know your plan's
// $/credit and roughly how many credits each operation costs, set each rate to
// (credits-per-op × $/credit). Until then these are sensible estimates — the
// numbers will be in the right ballpark, and you can tighten them once you
// compare the app's "Total spent" against your real Firecrawl/Lovable invoices.

export type ScrapeCostUnit =
  | "directoryScrape" // Firecrawl scrape of a roster / listing page
  | "profileScrape" // Firecrawl scrape of one individual profile page
  | "paginationPage" // each EXTRA page loaded by the click/scroll walker
  | "mapCall" // Firecrawl /map URL-discovery call
  | "aiExtract"; // one Gemini extraction call (via the Lovable gateway)

/** USD per operation. Estimates — calibrate to your real billing. */
export const SCRAPE_UNIT_COSTS_USD: Record<ScrapeCostUnit, number> = {
  directoryScrape: 0.0015,
  profileScrape: 0.0012,
  paginationPage: 0.002,
  mapCall: 0.0015,
  aiExtract: 0.0008,
};

/**
 * A-priori per-campus estimate used for BATCH QUOTES (shown before a run, when
 * we don't yet have operation counts). Assumes a typical accounting department:
 * ~1 roster page + AI extract + full profile enrichment on the faculty.
 * Tune as your real averages come in (the metrics panel shows the true number).
 */
export const EST_COST_PER_CAMPUS_USD = 0.06;

export type RunCounts = {
  directoryScrapes: number;
  profileScrapes: number;
  paginationPages: number;
  mapCalls: number;
  aiExtracts: number;
};

export type CostBreakdown = RunCounts & { totalUsd: number };

/**
 * Loose shape of each `perPage` entry we read counts off. Kept intentionally
 * decoupled from the scraper's internal types so this module stays portable.
 */
type PerPageLike = {
  enrichOutcomes?: Array<{ result: string }>;
  pagination?: { pagesWalked?: number } | undefined;
};

/** Count the real Firecrawl + AI operations a finished run performed. */
export function countRunOps(
  perPage: PerPageLike[],
  opts: { mapFallbackUsed?: boolean } = {},
): RunCounts {
  let directoryScrapes = 0;
  let profileScrapes = 0;
  let paginationPages = 0;
  let aiExtracts = 0;
  for (const p of perPage) {
    directoryScrapes += 1; // one roster scrape per URL processed
    aiExtracts += 1; // one AI extraction per URL
    // Every enrich outcome that actually hit the network = one profile scrape.
    // "skipped_host" outcomes were short-circuited and cost nothing.
    for (const o of p.enrichOutcomes ?? []) {
      if (o.result !== "skipped_host") profileScrapes += 1;
    }
    const walked = p.pagination?.pagesWalked ?? 0;
    if (walked > 1) paginationPages += walked - 1;
  }
  return {
    directoryScrapes,
    profileScrapes,
    paginationPages,
    mapCalls: opts.mapFallbackUsed ? 1 : 0,
    aiExtracts,
  };
}

export function costFromCounts(c: RunCounts): number {
  return (
    c.directoryScrapes * SCRAPE_UNIT_COSTS_USD.directoryScrape +
    c.profileScrapes * SCRAPE_UNIT_COSTS_USD.profileScrape +
    c.paginationPages * SCRAPE_UNIT_COSTS_USD.paginationPage +
    c.mapCalls * SCRAPE_UNIT_COSTS_USD.mapCall +
    c.aiExtracts * SCRAPE_UNIT_COSTS_USD.aiExtract
  );
}

/** Operation-counted USD estimate for a single finished run. */
export function estimateRunCostUsd(
  perPage: PerPageLike[],
  opts: { mapFallbackUsed?: boolean } = {},
): number {
  return costFromCounts(countRunOps(perPage, opts));
}

/** Same, but returns the per-operation breakdown alongside the total. */
export function estimateRunCostBreakdown(
  perPage: PerPageLike[],
  opts: { mapFallbackUsed?: boolean } = {},
): CostBreakdown {
  const counts = countRunOps(perPage, opts);
  return { ...counts, totalUsd: costFromCounts(counts) };
}

/** Batch quote: campus count × the per-campus estimate. */
export function estimateBatchQuoteUsd(campusCount: number): number {
  return campusCount * EST_COST_PER_CAMPUS_USD;
}

export function formatUsd(n: number, digits = 4): string {
  if (!isFinite(n)) return "—";
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(digits)}`;
}
