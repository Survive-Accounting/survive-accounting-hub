// research-campus-program-courses — fills, for ONE campus, the accounting
// program name + the course CODE and TITLE for the four course families
// (Intro 1/2, Intermediate I/II).
//
// PORTED off the dead Lovable `google_search` path onto the same AI-Gateway
// retrieval pipeline the Vercel server fn uses (src/lib/program-courses.functions.ts):
//   1. SerpAPI   — find registrar/catalog/course-bulletin pages.
//   2. Firecrawl — scrape those pages to markdown (real source text).
//   3. AI Gateway (google/gemini-2.5-flash) — extract codes/titles ONLY from the
//      scraped text, never guessing.
// Invoked by run-campus-batch (research_mode = program_and_courses) with a
// service-role bearer and body { campus_id }. Safe to re-run: only fills blank
// fields unless { force: true }.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY") ?? "";
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const AI_GATEWAY_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const MODEL = Deno.env.get("RESEARCH_MODEL") ?? "google/gemini-2.5-flash";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const SERP_TIMEOUT_MS = 20_000;
const FIRECRAWL_TIMEOUT_MS = 30_000;
const AI_TIMEOUT_MS = 60_000;
const MAX_DOC_CHARS = 14_000;
const MAX_TOTAL_CHARS = 30_000;

const FAMILIES = [
  { key: "intro_1", label: "Intro 1 — Principles of / Introduction to Financial Accounting" },
  { key: "intro_2", label: "Intro 2 — Principles of / Introduction to Managerial (Management) Accounting" },
  { key: "intermediate_1", label: "Intermediate Accounting I" },
  { key: "intermediate_2", label: "Intermediate Accounting II" },
] as const;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

async function serpSearch(query: string, num = 10): Promise<Array<{ title: string; link: string }>> {
  const url = `${SERPAPI_BASE}?engine=google&num=${num}&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(SERPAPI_KEY)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERP_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return [];
    const j = (await res.json()) as { organic_results?: Array<{ title?: string; link?: string }> };
    return (j.organic_results ?? []).filter((r) => typeof r.link === "string").map((r) => ({ title: r.title ?? "", link: r.link as string }));
  } catch { return []; } finally { clearTimeout(timer); }
}

async function firecrawlScrape(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRECRAWL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    return (j.data?.markdown ?? j.markdown ?? "").slice(0, MAX_DOC_CHARS);
  } catch { return ""; } finally { clearTimeout(timer); }
}

const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("no JSON object in model output");
  const slice = cleaned.slice(a, b + 1);
  try { return JSON.parse(slice) as Record<string, unknown>; }
  catch { return JSON.parse(slice.replace(CONTROL_CHARS, "")) as Record<string, unknown>; }
}

const CATALOG_HINT_RE = /(catalog|catalogue|bulletin|courses?|registrar|curriculum|course-descriptions|class-schedule)/i;

function buildPrompt(school: string, state: string, doc: string): string {
  const lines = FAMILIES.map((f) => `  - "${f.key}" = ${f.label}`).join("\n");
  return `You are reading official catalog / registrar / course text for the undergraduate accounting program at "${school}"${state ? `, ${state}` : ""}, USA. Extract ONLY what is present in the SOURCE TEXT below. NEVER guess or invent a code or title.

Return THREE things:

1) "program_name": the full official name of the accounting department / program if the text states it (e.g. "School of Accountancy", "Department of Accounting", "Patterson School of Accountancy"). If only a business school is named, return that. If not stated, null.

2) For EACH of these four course families, the local course CODE exactly as written in the source (e.g. "ACCT 2101", "ACG 2021", "ACCY 201"):
${lines}

3) For EACH family, the official course TITLE exactly as printed (e.g. "Introduction to Financial Accounting", "Intermediate Accounting I").

RULES:
- Use ONLY codes/titles that literally appear in the SOURCE TEXT. If a family is not present, return null for it.
- Keep the prefix + number exactly as written ("ACG 2021", "ACCY 201"). No leading zeros added/removed, no extra punctuation.
- Intro 1 = first/financial principles course; Intro 2 = managerial principles course; Intermediate I/II are the intermediate financial sequence.

Respond with ONLY a single JSON object, no prose, no markdown fences:
{
  "program_name": string | null,
  "families": {
    "intro_1":        { "code": string | null, "title": string | null } | null,
    "intro_2":        { "code": string | null, "title": string | null } | null,
    "intermediate_1": { "code": string | null, "title": string | null } | null,
    "intermediate_2": { "code": string | null, "title": string | null } | null
  }
}

SOURCE TEXT:
${doc}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SERPAPI_KEY) return json({ error: "SERPAPI_API_KEY not configured" }, 500);
  if (!FIRECRAWL_KEY) return json({ error: "FIRECRAWL_API_KEY not configured" }, 500);
  if (!AI_GATEWAY_KEY) return json({ error: "AI_GATEWAY_API_KEY not configured" }, 500);

  let body: { campus_id?: string; campusId?: string; force?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const campusId = body.campus_id ?? body.campusId;
  const force = body.force === true;
  if (!campusId) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error } = await db
    .from("campuses")
    .select("id,name,state,website_url,accounting_department_url,accounting_department_name,course_family_codes_json,course_family_titles_json")
    .eq("id", campusId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!campus) return json({ error: "Campus not found" }, 404);

  const school = (campus.name as string | null) ?? "";
  const state = (campus.state as string | null) ?? "";
  if (!school) return json({ error: "Campus has no name" }, 400);

  const deptHost = hostOf((campus.accounting_department_url as string | null) ?? "") || hostOf((campus.website_url as string | null) ?? "");
  const siteScope = deptHost ? `site:${deptHost} ` : "";
  const queries = [
    `${siteScope}"${school}" accounting course catalog "Intermediate Accounting"`,
    `"${school}" accounting "principles of accounting" course catalog managerial financial`,
    `${siteScope}"${school}" "ACCT" OR "ACCY" OR "ACG" OR "ACCTG" intermediate accounting catalog`,
  ];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const q of queries) {
    const results = await serpSearch(q, 10);
    for (const r of results) {
      if (!r.link || seen.has(r.link)) continue;
      seen.add(r.link);
      candidates.push(r.link);
    }
    if (candidates.filter((u) => CATALOG_HINT_RE.test(u)).length >= 3) break;
  }
  const ranked = [
    ...candidates.filter((u) => CATALOG_HINT_RE.test(u)),
    ...candidates.filter((u) => !CATALOG_HINT_RE.test(u)),
  ].slice(0, 4);
  if (ranked.length === 0) return json({ success: false, campus_id: campusId, reason: "no_catalog_pages_found", families_added: [] });

  const docs: string[] = [];
  let total = 0;
  for (const url of ranked) {
    if (total >= MAX_TOTAL_CHARS) break;
    const md = await firecrawlScrape(url);
    if (md.length < 200) continue;
    const block = `## SOURCE: ${url}\n${md}`;
    docs.push(block);
    total += block.length;
  }
  if (docs.length === 0) return json({ success: false, campus_id: campusId, reason: "scrape_empty", families_added: [] });
  const doc = docs.join("\n\n").slice(0, MAX_TOTAL_CHARS);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  let parsed: Record<string, unknown>;
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_GATEWAY_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: buildPrompt(school, state, doc) }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ success: false, campus_id: campusId, reason: `ai_gateway_${res.status}`, detail: t.slice(0, 200) }, 502);
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    parsed = extractJson(j.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    return json({ success: false, campus_id: campusId, reason: "ai_error", detail: (e as Error).message }, 502);
  } finally {
    clearTimeout(timer);
  }

  const codesIn: Record<string, string> = (campus.course_family_codes_json && typeof campus.course_family_codes_json === "object")
    ? { ...(campus.course_family_codes_json as Record<string, string>) } : {};
  const titlesIn: Record<string, string> = (campus.course_family_titles_json && typeof campus.course_family_titles_json === "object")
    ? { ...(campus.course_family_titles_json as Record<string, string>) } : {};

  const fams = (parsed.families && typeof parsed.families === "object" ? parsed.families : {}) as Record<string, { code?: unknown; title?: unknown } | null>;
  const familiesAdded: string[] = [];
  for (const f of FAMILIES) {
    const v = fams[f.key];
    if (!v || typeof v !== "object") continue;
    const code = str(v.code);
    const title = str(v.title);
    if (!code && !title) continue;
    if (!force && (str(codesIn[f.key]) || str(titlesIn[f.key]))) continue;
    if (code) codesIn[f.key] = code;
    if (title) titlesIn[f.key] = title;
    familiesAdded.push(f.key);
  }

  const programName = str(parsed.program_name);
  const patch: Record<string, unknown> = {
    course_family_codes_json: codesIn,
    course_family_titles_json: titlesIn,
  };
  const programWritten = !!programName && (force || !str(campus.accounting_department_name as string | null));
  if (programWritten) patch.accounting_department_name = programName;

  const { error: upErr } = await db.from("campuses").update(patch).eq("id", campusId);
  if (upErr) return json({ error: upErr.message }, 500);

  return json({
    success: true,
    campus_id: campusId,
    program_name: programName,
    program_written: programWritten,
    families_added: familiesAdded,
    sources: ranked,
  });
});
