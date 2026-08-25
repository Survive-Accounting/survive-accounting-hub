/**
 * Course Intel harvest — provider clients (SerpAPI, Firecrawl, AI Gateway).
 * Ported verbatim from the conventions in src/lib/syllabus-intel.functions.ts and
 * src/lib/faculty-scrape.functions.ts so the batch harvest behaves identically to
 * the app pipeline, minus the TanStack runtime. Keys come from process.env.
 *
 * Every call is timeout-guarded and error-swallowing (returns null/[]), so one bad
 * URL can never crash a campus. Callers count requests for the cost guard.
 */

const SERP_BASE = "https://serpapi.com/search.json";
const FIRECRAWL_SCRAPE = "https://api.firecrawl.dev/v2/scrape";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

// Measured unit costs (ProfIntel bundles): SerpAPI ~$0.015/search, Firecrawl
// ~$0.0015/scrape, Gemini-2.5-flash ~$0.005/parse. Conservative, for the guard.
export const UNIT_COST = { serp: 0.015, firecrawl: 0.0015, ai: 0.005 };

const timeoutFetch = async (url, opts = {}, ms = 20_000) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
};

/** SerpAPI Google search → [{title, link, snippet}]. Never throws. */
export async function serpSearch(key, q, num = 8) {
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

/** Firecrawl v2 scrape → markdown string, or null. Never throws. */
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

/** AI Gateway extraction of curriculum metadata from a doc's markdown. */
export async function aiExtract(key, markdown) {
  const prompt = `You are extracting CURRICULUM METADATA from a public college accounting course document. Return ONLY compact JSON, no prose. Extract:
{"course_title":"","instructors":["Prof Name"],"textbook":{"title":"","authors":"","edition":""},"term":"Fall/Spring/Summer or null","year":2025,"exams":[{"label":"Exam 1","chapters":[1,2,3]}]}
Rules: chapters are integers from stated exam coverage ("Exam 1 covers Ch 1-3"). instructors = any professor/instructor names printed in the document. If a field is unknown use null/empty. Do NOT copy any prose, questions, or assignments. Document:\n\n${String(markdown).slice(0, 24000)}`;
  try {
    const r = await timeoutFetch(AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }),
    }, 60_000);
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
