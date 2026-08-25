// DB-backed cache for scraper external calls (SERP + Firecrawl), so re-runs and
// resumes don't re-pay for identical queries/fetches. Keyed by a stable hash of
// (kind, key) — the query string or URL already encodes the campus, so this is
// effectively per-(campus, stage, query) caching as the audit requested.
//
// Backed by public.scrape_cache (see migration 20260825_1200). Fails OPEN: any
// cache error (incl. table not yet migrated) falls through to a live fetch, so
// this can never break a scrape — it only ever saves work when available.

async function sha(input: string): Promise<string> {
  // Web Crypto (NOT node:crypto) — the server-fn bundle rejects node builtins.
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Kind = "serp" | "firecrawl";

async function getAdmin() {
  try { const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); return supabaseAdmin as any; } catch { return null; }
}

/**
 * Cache wrapper. Returns cached `value` when a fresh row exists; otherwise runs
 * `fetcher`, stores its result (only when non-null), and returns it.
 * @param ttlHours freshness window; older rows are ignored (and overwritten).
 */
export async function cached<T>(kind: Kind, key: string, ttlHours: number, fetcher: () => Promise<T>): Promise<T> {
  const admin = await getAdmin();
  let cacheKey = "";
  if (admin) {
    try {
      cacheKey = `${kind}:${await sha(key)}`;
      const cutoff = new Date(Date.now() - ttlHours * 3600_000).toISOString();
      const { data } = await admin.from("scrape_cache").select("value,created_at").eq("cache_key", cacheKey).gte("created_at", cutoff).maybeSingle();
      if (data && data.value !== undefined && data.value !== null) return data.value as T;
    } catch { /* fail open */ }
  }
  const fresh = await fetcher();
  if (admin && cacheKey && fresh !== null && fresh !== undefined) {
    try {
      await admin.from("scrape_cache").upsert(
        { cache_key: cacheKey, kind, value: fresh as any, created_at: new Date().toISOString() },
        { onConflict: "cache_key" },
      );
    } catch { /* fail open */ }
  }
  return fresh;
}

export const SERP_TTL_HOURS = 24 * 30;      // catalogs/greek lists change slowly
export const FIRECRAWL_TTL_HOURS = 24 * 7;  // faculty pages change more often
