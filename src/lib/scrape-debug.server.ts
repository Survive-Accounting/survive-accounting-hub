// Server-only helper that records a debug bundle for every scrape and then
// asks Lovable AI Gateway for a generalizable improvement suggestion.
// Called inline from scrapeCampusFaculty after the scrape completes.

type PerPage = {
  url: string;
  found: number;
  extracted: number;
  withEmail: number;
  withProfileUrl: number;
  slugMatched: number;
  enriched: number;
  droppedNoContact: number;
  links: number;
  error: string | null;
  enrichOutcomes?: Array<{ url: string; name: string; result: string; mdLen: number; htmlLen: number }>;
  pagination?: { paginated: boolean; signal?: string; pagesWalked: number; clickMissed: boolean; gained: number };
  /** Number of "card blocks" the deterministic directory parser found. */
  cardBlocks?: number;
  /** Of those cards, how many had an email paired inside the same block. */
  cardEmailsPaired?: number;
  /** Times the card email overrode the AI-extractor's email (mis-pair fix). */
  aiEmailOverridden?: number;
  /** RMP reverse-lookup hits resolved via the card parser (cross-vertical). */
  reverseLookupCardHits?: number;
};

export type ScrapeBundleInput = {
  campusId: string;
  campusName: string | null;
  kind: "faculty" | "rmp";
  scrapeJobId?: string | null;
  durationMs: number;
  inputUrls: string[];
  perPage: PerPage[];
  inserted: number;
  skippedDuplicates: number;
  droppedNoContact: number;
  mapFallbackUsed: boolean;
  costEstimateUsd: number;
};

const NEWS_HINT = /\b(news|blog|spotlight|stories?|press|event)\b/i;

function summarize(input: ScrapeBundleInput) {
  const totalEmails = input.perPage.reduce((s, p) => s + p.withEmail, 0);
  const hostFails = input.perPage.filter((p) => p.error).length;
  const newsHits = input.perPage.filter((p) => NEWS_HINT.test(p.url)).length;
  const paginationWalked = input.perPage.filter((p) => p.pagination && p.pagination.pagesWalked > 1).length;
  const mdZero = input.perPage.filter((p) => p.error === "empty content").length;
  return {
    totalEmails,
    hostFails,
    newsHits,
    paginationWalked,
    mdZero,
  };
}

async function callGemini(apiKey: string, bundle: ScrapeBundleInput): Promise<{
  pattern_tag: string;
  severity: string;
  title: string;
  suggestion: string;
  applies_to_verticals: string[];
  raw: unknown;
} | null> {
  const stats = summarize(bundle);
  // Compact payload — keep tokens small.
  const compactPages = bundle.perPage.map((p) => ({
    url: p.url,
    found: p.found,
    extracted: p.extracted,
    withEmail: p.withEmail,
    error: p.error,
    pagination: p.pagination,
    enrichOutcomes: (p.enrichOutcomes ?? []).slice(0, 6).map((o) => ({
      result: o.result,
      mdLen: o.mdLen,
    })),
  }));
  const userPayload = {
    campus: bundle.campusName,
    kind: bundle.kind,
    durationMs: bundle.durationMs,
    inserted: bundle.inserted,
    skippedDuplicates: bundle.skippedDuplicates,
    droppedNoContact: bundle.droppedNoContact,
    mapFallbackUsed: bundle.mapFallbackUsed,
    stats,
    pages: compactPages,
  };

  const system = `You analyze faculty-scrape debug bundles from a US university scraper.
Your job is to suggest ONE generalizable improvement that would help across ANY university
AND to flag which OTHER verticals would benefit from the same fix (accounting_firms,
law_firms, investment_banks, consultancies, hospitals, government, nonprofits, other).
Avoid school-specific advice; focus on patterns (WordPress directories, JS pagination,
mailto obfuscation, news-page false positives, mdLen=0 hosts, hidden emails, profile-URL
ambiguity, etc.).
Return strict JSON with keys: pattern_tag (short snake_case like "wp_directory_mdlen_zero"),
severity ("low"|"med"|"high"), title (<=80 chars), suggestion (<=600 chars, actionable),
applies_to_verticals (array of vertical strings from the list above, [] if university-specific).`;

  const body = {
    model: "google/gemini-3-flash-preview",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn(`[scrape-debug] AI gateway ${res.status}`);
      return null;
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    let parsed: Record<string, unknown>;
    try { parsed = JSON.parse(content); } catch { return null; }
    return {
      pattern_tag: String(parsed.pattern_tag ?? "unknown").slice(0, 80),
      severity: String(parsed.severity ?? "low").slice(0, 12),
      title: String(parsed.title ?? "").slice(0, 200),
      suggestion: String(parsed.suggestion ?? "").slice(0, 2000),
      applies_to_verticals: Array.isArray(parsed.applies_to_verticals)
        ? (parsed.applies_to_verticals as unknown[]).filter((v): v is string => typeof v === "string").slice(0, 12)
        : [],
      raw: parsed,
    };
  } catch (e) {
    console.warn(`[scrape-debug] AI call failed:`, e instanceof Error ? e.message : String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function recordAndAnalyzeBundle(input: ScrapeBundleInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stats = summarize(input);
    const totalContacts = input.inserted;
    const summaryLine = `${input.kind}/${input.perPage.length}url · ins ${totalContacts} · email ${stats.totalEmails} · fail ${stats.hostFails} · news ${stats.newsHits} · pg ${stats.paginationWalked} · ${Math.round(input.durationMs / 1000)}s · ~$${input.costEstimateUsd.toFixed(3)}`;

    const { data: bundleRow, error } = await supabaseAdmin
      .from("scrape_debug_bundles")
      .insert({
        campus_id: input.campusId,
        campus_name: input.campusName,
        kind: input.kind,
        scrape_job_id: input.scrapeJobId ?? null,
        duration_ms: input.durationMs,
        credits_estimate_usd: input.costEstimateUsd,
        urls_attempted: input.perPage.length,
        contacts_inserted: input.inserted,
        contacts_with_email: stats.totalEmails,
        host_fail_count: stats.hostFails,
        news_filter_hits: stats.newsHits,
        pagination_walked: stats.paginationWalked,
        map_fallback_used: input.mapFallbackUsed,
        summary: summaryLine,
        payload: {
          inputUrls: input.inputUrls,
          perPage: input.perPage,
          skippedDuplicates: input.skippedDuplicates,
          droppedNoContact: input.droppedNoContact,
          stats,
        },
      } as never)
      .select("id")
      .single();
    if (error || !bundleRow) {
      console.warn("[scrape-debug] bundle insert failed:", error?.message);
      return;
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.warn("[scrape-debug] LOVABLE_API_KEY missing — skipping AI analysis");
      return;
    }
    const ai = await callGemini(apiKey, input);
    if (!ai) return;

    await supabaseAdmin.from("scrape_improvement_suggestions").insert({
      bundle_id: (bundleRow as { id: string }).id,
      campus_id: input.campusId,
      campus_name: input.campusName,
      model: "google/gemini-3-flash-preview",
      pattern_tag: ai.pattern_tag,
      severity: ai.severity,
      title: ai.title,
      suggestion: ai.suggestion,
      applies_to_verticals: ai.applies_to_verticals,
      raw: ai.raw as never,
    } as never);
  } catch (e) {
    // Never fail the parent scrape because of debug-bundle issues.
    console.warn("[scrape-debug] recordAndAnalyzeBundle failed:", e instanceof Error ? e.message : String(e));
  }
}
