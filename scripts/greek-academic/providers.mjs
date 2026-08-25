/**
 * Greek Academic Intelligence — provider clients (SerpAPI, Firecrawl, AI Gateway).
 * Ported from scripts/course-intel-harvest/providers.mjs so the harvest behaves
 * identically to the app pipeline, minus the TanStack runtime. Keys come from
 * process.env. Every call is timeout-guarded and error-swallowing (returns
 * null/[]), so one bad URL can never crash a campus.
 */
const SERP_BASE = "https://serpapi.com/search.json";
const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v2/scrape";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// Measured unit costs (conservative, for the guard): SerpAPI ~$0.015/search,
// Firecrawl ~$0.0015/scrape, Gemini-2.5-flash ~$0.005/parse.
export const UNIT_COST = { serp: 0.015, firecrawl: 0.0015, ai: 0.005 };

const timeoutFetch = async (url, opts = {}, ms = 20_000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
};

/** SerpAPI Google search → {ok, results:[{title,link,snippet}], status}. Never throws. */
export async function serpSearch(key, q, num = 10) {
  const url = `${SERP_BASE}?engine=google&num=${num}&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`;
  try {
    const r = await timeoutFetch(url, {}, 20_000);
    if (!r.ok) return { ok: false, results: [], status: r.status };
    const j = await r.json();
    const results = (j.organic_results ?? [])
      .filter((x) => x.link)
      .map((x) => ({ title: x.title ?? "", link: x.link, snippet: x.snippet ?? "" }));
    return { ok: true, results, status: 200 };
  } catch (e) { return { ok: false, results: [], status: 0, error: String(e?.message || e) }; }
}

/** Firecrawl v2 scrape → markdown string, or null. Handles HTML and PDF (rendered
 *  to markdown by Firecrawl). Never throws. */
export async function firecrawlMarkdown(key, url) {
  try {
    const r = await timeoutFetch(FIRECRAWL_SCRAPE, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2500 }),
    }, 60_000);
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.markdown ?? null;
  } catch { return null; }
}

/** Firecrawl scrape that also returns discovered links (for archive-page crawling).
 *  onlyMainContent:false so report-list links in page chrome/side regions survive. */
export async function firecrawlWithLinks(key, url) {
  try {
    const r = await timeoutFetch(FIRECRAWL_SCRAPE, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown", "links"], onlyMainContent: false, waitFor: 3000 }),
    }, 60_000);
    if (!r.ok) return null;
    const j = await r.json();
    return { markdown: j?.data?.markdown ?? null, links: Array.isArray(j?.data?.links) ? j.data.links : [] };
  } catch { return null; }
}

const MAX_MD = 48_000; // grade-report chapter tables are the payload — allow generous slice

/**
 * AI Gateway extraction of a Greek/FSL ACADEMIC report into structured JSON.
 * Aggregate chapter/community data ONLY. Never infer values; unknown → null.
 * Returns parsed object or null. Never throws.
 */
export async function aiExtractReport(key, markdown, hint = {}) {
  const prompt = `You are extracting AGGREGATE data from a PUBLIC university Fraternity & Sorority Life (FSL) ACADEMIC / GRADE report. These reports list, per Greek chapter, the chapter's average GPA and often membership counts, and give council/community averages. Return ONLY compact JSON, no prose, no markdown fences.

Extract this shape:
{
 "report_title": "",
 "term": "fall|spring|summer|winter or null",
 "year": 2025,
 "council_scope": "all_greek|ifc|panhellenic|nphc|mgc|mixed|unknown",
 "gpa_scale": 4.0,
 "all_men_gpa": null, "all_women_gpa": null, "all_greek_gpa": null, "all_undergraduate_gpa": null,
 "council_averages": [{"council":"ifc|panhellenic|nphc|mgc","gpa":null,"member_count":null,"chapter_count":null}],
 "business_students_count": null, "business_students_percent": null, "accounting_students_count": null,
 "chapters": [
   {"name":"chapter/organization name AS PRINTED",
    "council":"ifc|panhellenic|nphc|mgc or null",
    "gpa":null, "active_member_gpa":null, "new_member_gpa":null,
    "member_count":null, "active_member_count":null, "new_member_count":null,
    "deans_list_count":null, "deans_list_percent":null, "academic_probation_count":null,
    "rank_within_council":null, "council_average_gpa":null,
    "business_students_count":null}
 ]
}
Rules:
- GPAs are decimals (e.g. 3.14). Copy exactly; do NOT round or invent. If a value is not printed, use null.
- Preserve each chapter name EXACTLY as printed (letters/abbreviations included).
- Council: infer from section headers only if the report groups chapters by council; else null.
- If the document is NOT a Greek academic/GPA report (e.g. a directory, event page, membership form), return {"chapters":[],"not_a_report":true}.
- Do NOT include any individual student names or individual student GPAs.
${hint.term || hint.year ? `Context hint (may be wrong): term=${hint.term || "?"} year=${hint.year || "?"}.` : ""}
Document:\n\n${String(markdown).slice(0, MAX_MD)}`;
  try {
    const r = await timeoutFetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }),
    }, 90_000);
    if (!r.ok) return null;
    const j = await r.json();
    const txt = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  } catch { return null; }
}

/** Read-only balance checks (free). */
export async function serpBalance(key) {
  try {
    const r = await timeoutFetch(`${SERP_BASE.replace("search.json", "account.json")}?api_key=${encodeURIComponent(key)}`, {}, 15_000);
    if (!r.ok) return null;
    const j = await r.json();
    return { plan: j.plan_name, left: j.total_searches_left, usedThisMonth: j.this_month_usage, ratePerHour: j.account_rate_limit_per_hour };
  } catch { return null; }
}
export async function firecrawlBalance(key) {
  try {
    const r = await timeoutFetch("https://api.firecrawl.dev/v2/team/credit-usage", { headers: { Authorization: `Bearer ${key}` } }, 15_000);
    if (!r.ok) return null;
    const j = await r.json();
    return { remaining: j?.data?.remainingCredits, plan: j?.data?.planCredits };
  } catch { return null; }
}
