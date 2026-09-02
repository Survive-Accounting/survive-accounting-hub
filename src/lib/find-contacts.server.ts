// IN-APP CONTACT FINDING — the gateway half. Two model calls and a URL probe, nothing else.
//
// WHY perplexity/sonar AND NOT THE EXISTING SERP+FIRECRAWL PIPELINE: council-contacts.functions.ts
// already discovers council contacts by chaining SerpAPI → Firecrawl → Gemini, and it AUTO-SAVES.
// This flow is a different product: two calls, one human review, nothing written until someone
// says so. Sonar has web search built in, so "search the web then read the pages" is one call
// instead of three services, and the gateway returns the real dollar cost per call — which is
// what makes the running total in the header a fact rather than an estimate.
//
// Server-only: imported from *.functions.ts handler bodies (never at a route's module scope).
import {
  COUNCIL_KEYS, councilPrompt, officerPrompt,
  type CouncilKey, type CouncilPage, type UrlProbe,
} from "@/lib/find-contacts-shared";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
/** Web search is the whole point of this model choice; sonar does it natively. */
export const FIND_MODEL = process.env.AI_MODEL_FINDCONTACTS || "perplexity/sonar";

export type GatewayUsage = { promptTokens: number; completionTokens: number; costUsd: number; model: string };
export type GatewayResult<T> = { data: T; usage: GatewayUsage };

const JSON_SYSTEM = "You return ONLY valid JSON matching the requested shape. No markdown fences, no prose, no commentary. Use null for anything you cannot verify.";

/** Models wrap JSON in fences often enough that not handling it is a bug, not strictness. */
export function extractJson(text: string): unknown {
  const t = (text ?? "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : t).trim();
  try { return JSON.parse(body); } catch { /* fall through to brace scan */ }
  const first = body.search(/[[{]/);
  const last = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (first >= 0 && last > first) {
    try { return JSON.parse(body.slice(first, last + 1)); } catch { /* give up */ }
  }
  throw new Error("model did not return parseable JSON");
}

async function callGateway(user: string, maxTokens: number): Promise<GatewayResult<unknown>> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured on the server");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: FIND_MODEL,
      messages: [{ role: "system", content: JSON_SYSTEM }, { role: "user", content: user }],
      max_tokens: maxTokens,
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("empty completion");
  return {
    data: extractJson(text),
    // The gateway reports the real charge; we never recompute it from a local price table that
    // would silently drift from the invoice.
    usage: {
      promptTokens: body.usage?.prompt_tokens ?? 0,
      completionTokens: body.usage?.completion_tokens ?? 0,
      costUsd: body.usage?.cost ?? 0,
      model: FIND_MODEL,
    },
  };
}

// ── STEP 1 — find the council pages ──────────────────────────────────────────────────────────
const isCouncil = (v: unknown): v is CouncilKey => COUNCIL_KEYS.includes(v as CouncilKey);

export async function findCouncilPages(campusName: string): Promise<GatewayResult<CouncilPage[]>> {
  const user = [
    councilPrompt(campusName),
    "",
    'Respond as JSON: {"councils":[{"council":"ifc|panhellenic|nphc|mgc|fsl|wib","url":"https://...","confidence":"high|low"}]}',
    "Omit any council with no official page — do not guess a URL.",
  ].join("\n");
  const r = await callGateway(user, 900);
  const raw = (r.data as { councils?: unknown[] })?.councils ?? [];
  const seen = new Set<string>();
  const pages: CouncilPage[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const o = c as { council?: unknown; url?: unknown; confidence?: unknown };
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!isCouncil(o.council) || !/^https?:\/\//i.test(url) || seen.has(o.council)) continue;
    seen.add(o.council);
    pages.push({ council: o.council, url, confidence: o.confidence === "high" ? "high" : "low" });
  }
  return { data: pages, usage: r.usage };
}

// ── STEP 2 — scrape the officers ─────────────────────────────────────────────────────────────
export type OfficerDraft = {
  council: CouncilKey;
  position: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  instagram: string | null;
  instagramSource: "listed" | "found" | null;
  instagramConfidence: "high" | "low" | null;
  chapter: string | null;
  sourceUrl: string | null;
};

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  // Models say "null"/"N/A"/"unknown" in a string field more often than they return null.
  return /^(null|n\/?a|none|unknown|not found|not available|-|—)$/i.test(s) ? null : s;
};

export async function scrapeOfficers(campusName: string, urls: Array<{ council: CouncilKey; url: string }>): Promise<GatewayResult<OfficerDraft[]>> {
  const user = [
    officerPrompt(campusName, urls),
    "",
    'Respond as JSON: {"officers":[{"council":"ifc|panhellenic|nphc|mgc|fsl|wib","position":"...","name":"...","email":null,"phone":null,"instagram":null,"instagram_source":"listed|found|null","instagram_confidence":"high|low|null","chapter":null,"source_url":"https://..."}]}',
  ].join("\n");
  const r = await callGateway(user, 4000);
  const raw = (r.data as { officers?: unknown[] })?.officers ?? [];
  const out: OfficerDraft[] = [];
  for (const c of Array.isArray(raw) ? raw : []) {
    const o = c as Record<string, unknown>;
    if (!isCouncil(o.council)) continue;
    const igSourceRaw = str(o.instagram_source);
    const instagram = str(o.instagram);
    out.push({
      council: o.council,
      position: str(o.position),
      name: str(o.name),
      email: str(o.email)?.toLowerCase() ?? null,
      phone: str(o.phone),
      instagram,
      // A handle with no stated provenance is treated as SEARCHED, never as listed — the
      // benefit of the doubt always goes to "a person still has to look at this".
      instagramSource: instagram ? (igSourceRaw === "listed" ? "listed" : "found") : null,
      instagramConfidence: instagram ? (str(o.instagram_confidence) === "high" ? "high" : "low") : null,
      chapter: str(o.chapter),
      sourceUrl: str(o.source_url),
    });
  }
  return { data: out, usage: r.usage };
}

// ── SerpAPI personal-Instagram prefill (§step 3) ─────────────────────────────────────────────
// The scrape is good at emails and org accounts, unreliable at personal handles. So for a person
// with no handle listed on the page, we run one Google search — "<name> <university> instagram",
// the query that finds a personal account far more often than adding a role or council — and take
// the first real instagram.com/<handle>. It's a PREFILL for a human to confirm, never truth: the
// row still comes back as source "found", low confidence, unverified.
const IG_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts", "about", "directory", "developer", "legal", "privacy"]);

export function extractIgHandle(url: string): string | null {
  const m = (url ?? "").match(/instagram\.com\/([A-Za-z0-9._]{2,40})\/?/i);
  if (!m) return null;
  const h = m[1].toLowerCase().replace(/\.$/, "");
  return IG_RESERVED.has(h) ? null : h;
}

const SERP = "https://serpapi.com/search.json";

/** One cached Google search for a person's Instagram. Returns a bare handle or null. */
export async function searchPersonalInstagram(name: string, campusName: string): Promise<string | null> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key || !name.trim()) return null;
  const query = `${name} ${campusName} instagram`;
  try {
    const { cached } = await import("@/lib/scrape-cache");
    return await cached("serp", `personig:v1:${query.toLowerCase()}`, 24 * 30, async () => {
      const url = `${SERP}?engine=google&num=8&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(key)}`;
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 15_000);
      try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) return null;
        const j = await res.json() as { organic_results?: Array<{ link?: string; title?: string }> };
        for (const r of j.organic_results ?? []) {
          const h = extractIgHandle(typeof r.link === "string" ? r.link : "");
          if (h) return h;
        }
        return null;
      } catch { return null; } finally { clearTimeout(t); }
    });
  } catch { return null; }
}

// ── the URL probe ────────────────────────────────────────────────────────────────────────────
/** A dead or blocked link is the most common failure and it is cheap to catch HERE rather than
 *  after a scrape comes back empty. HEAD first, GET fallback — some hosts refuse HEAD. */
export async function probeUrl(url: string, timeoutMs = 8000): Promise<UrlProbe> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  const attempt = async (method: "HEAD" | "GET"): Promise<number | null> => {
    try {
      const res = await fetch(url, {
        method, redirect: "follow", signal: ctl.signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; SurviveAccountingBot/1.0)" },
      });
      return res.status;
    } catch { return null; }
  };
  try {
    let status = await attempt("HEAD");
    if (status === null || status === 405 || status === 403) {
      const g = await attempt("GET");
      if (g !== null) status = g;
    }
    return { url, status, ok: status !== null && status >= 200 && status < 400 };
  } finally { clearTimeout(t); }
}

export async function probeUrls(urls: string[]): Promise<UrlProbe[]> {
  // Small, bounded fan-out: these are a handful of URLs per campus.
  return Promise.all(urls.map((u) => probeUrl(u)));
}
