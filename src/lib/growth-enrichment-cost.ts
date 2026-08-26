// ENRICHMENT COST — what a run is likely to cost, in provider units and dollars.
//
// EVERY NUMBER HERE IS AN ESTIMATE off PUBLISHED LIST PRICES (Aug 2026), which is why the
// UI prefixes all of it with "~". We are not metering the providers; we are giving whoever
// is about to click Run enough information to decide. If we move onto different plans, the
// rates below are the only thing to change.
//
// Client-safe: pure data + pure functions.

/** Published list prices, Aug 2026. */
export const RATES = {
  /** SerpAPI Developer plan: $75 / 5,000 searches. */
  serpPerSearch: 75 / 5000,
  /** Firecrawl Hobby: $16 / 3,000 credits. A /scrape of one page is 1 credit; a PDF parse ~24. */
  firecrawlPerCredit: 16 / 3000,
  /** Gemini 2.5 Flash via the AI gateway, blended in+out on the short extraction prompts we send. */
  geminiPerCall: 0.002,
} as const;

export interface CostEstimate {
  serp: number;
  firecrawl: number; // credits
  ai: number; // model calls
  usd: number;
  /** One line for the tooltip: "~4 searches · ~2 Firecrawl credits · 1 AI call". */
  summary: string;
}

/** Typical provider usage per category, from the runners' own documented behaviour. */
const USAGE: Record<string, { serp: number; firecrawl: number; ai: number }> = {
  course_code: { serp: 4, firecrawl: 2, ai: 1 },
  greek_chapters: { serp: 3, firecrawl: 2, ai: 1 },
  // The expensive one: council discovery is SERP-dominated (~10–20 searches).
  council_contacts: { serp: 15, firecrawl: 4, ai: 3 },
  // Firecrawl-heavy: faculty directories paginate, capped at 3 pages by the runner.
  professors: { serp: 3, firecrawl: 12, ai: 2 },
  // RateMyProfessors' GraphQL endpoint — free.
  rmp_qualify: { serp: 0, firecrawl: 0, ai: 0 },
  syllabi_docs: { serp: 8, firecrawl: 0, ai: 0 },
  parse_document: { serp: 0, firecrawl: 24, ai: 1 },
};

export function estimateCost(category: string): CostEstimate {
  const u = USAGE[category] ?? { serp: 0, firecrawl: 0, ai: 0 };
  const usd =
    u.serp * RATES.serpPerSearch +
    u.firecrawl * RATES.firecrawlPerCredit +
    u.ai * RATES.geminiPerCall;
  const parts: string[] = [];
  if (u.serp) parts.push(`~${u.serp} SERP search${u.serp === 1 ? "" : "es"}`);
  if (u.firecrawl) parts.push(`~${u.firecrawl} Firecrawl credit${u.firecrawl === 1 ? "" : "s"}`);
  if (u.ai) parts.push(`~${u.ai} AI call${u.ai === 1 ? "" : "s"}`);
  return {
    serp: u.serp,
    firecrawl: u.firecrawl,
    ai: u.ai,
    usd,
    summary: parts.length ? parts.join(" · ") : "free — no paid provider",
  };
}

export const sumCost = (categories: string[]): CostEstimate => {
  const totals = categories.reduce(
    (acc, c) => {
      const e = estimateCost(c);
      return {
        serp: acc.serp + e.serp,
        firecrawl: acc.firecrawl + e.firecrawl,
        ai: acc.ai + e.ai,
        usd: acc.usd + e.usd,
      };
    },
    { serp: 0, firecrawl: 0, ai: 0, usd: 0 },
  );
  const parts: string[] = [];
  if (totals.serp) parts.push(`~${totals.serp} SERP searches`);
  if (totals.firecrawl) parts.push(`~${totals.firecrawl} Firecrawl credits`);
  if (totals.ai) parts.push(`~${totals.ai} AI calls`);
  return { ...totals, summary: parts.length ? parts.join(" · ") : "free — no paid provider" };
};
