// research-campus-bap-advisor — per-campus Beta Alpha Psi (BAP) advisor enrichment.
//
// Non-Lovable path (per CONTEXT/the BAP prompt): SerpAPI discovery -> Firecrawl
// page fetch -> Vercel AI Gateway (Gemini) strict-JSON extraction. Mirrors
// research-campus-leads' email discipline EXACTLY: NEVER invent an email; only
// keep one that the model actually saw on a real source and that passes format
// validation.
//
// Behavior per campus:
//   1. Find the BAP chapter + faculty advisor (school accounting/BAP page, bap.org).
//   2. MATCH an existing outreach_leads row first (normalized last name + first
//      initial) -> flag it is_bap_advisor (reuse its confirmed email). Only INSERT
//      a new lead if the advisor isn't already there.
//   3. Record has_bap_chapter / bap_chapter_designation / bap_checked_at on campus.
//
// Invoke per-campus: POST { "campus_id": "<uuid>", "force": false }.
// Idempotent: skips a campus checked within RECHECK_DAYS unless force=true.
// Wiring into run-campus-batch (sweep all campuses, highest priority_score first)
// is a follow-up — this is the per-campus worker.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AI_GATEWAY_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY") ?? "";
const MODEL = Deno.env.get("RESEARCH_MODEL") ?? "google/gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const RECHECK_DAYS = 60;
const MAX_DOC_CHARS = 18000;
const MAX_TOTAL_CHARS = 42000;
const FIRECRAWL_TIMEOUT_MS = 25000;
const AI_TIMEOUT_MS = 45000;

// Generic (non-person) mailbox local-parts — store but flag email_is_generic.
const GENERIC_LOCALS = new Set([
  "bap", "betaalphapsi", "beta-alpha-psi", "accounting", "accountancy",
  "soa", "info", "contact", "dept", "department", "business", "advising",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const urlOrNull = (v: unknown): string | null =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
const isValidEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const isGenericEmail = (e: string): boolean =>
  GENERIC_LOCALS.has((e.split("@")[0] ?? "").toLowerCase());
// Normalized match key: lowercased last name + first initial.
const matchKey = (first: string | null, last: string | null): string =>
  `${(last ?? "").toLowerCase().replace(/[^a-z]/g, "")}|${(first ?? "").trim().charAt(0).toLowerCase()}`;

async function serpSearch(key: string, q: string, num = 8): Promise<string[]> {
  try {
    const u = new URL("https://serpapi.com/search.json");
    u.searchParams.set("engine", "google");
    u.searchParams.set("q", q);
    u.searchParams.set("num", String(num));
    u.searchParams.set("api_key", key);
    const res = await fetch(u.toString());
    if (!res.ok) return [];
    const j = await res.json();
    return (Array.isArray(j.organic_results) ? j.organic_results : [])
      .map((r: any) => r?.link)
      .filter((l: any): l is string => typeof l === "string");
  } catch {
    return [];
  }
}

async function firecrawlScrape(key: string, url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FIRECRAWL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 1500 }),
      signal: ctrl.signal,
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { data?: { markdown?: string }; markdown?: string };
    return (j.data?.markdown ?? j.markdown ?? "").slice(0, MAX_DOC_CHARS);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

const CONTROL_CHARS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "g");
function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("no JSON object in model output");
  const slice = cleaned.slice(a, b + 1);
  try { return JSON.parse(slice) as Record<string, unknown>; }
  catch {
    const fixed = slice.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try { return JSON.parse(fixed) as Record<string, unknown>; }
    catch { return JSON.parse(fixed.replace(CONTROL_CHARS, "")) as Record<string, unknown>; }
  }
}

function buildPrompt(school: string, state: string, doc: string): string {
  return `You are reading official web pages to find the Beta Alpha Psi (BAP) chapter and its FACULTY ADVISOR at "${school}"${state ? `, ${state}` : ""}, USA. Beta Alpha Psi is the honors org for accounting/finance students; its faculty advisor is an accounting professor.

Use ONLY what is present in the SOURCE TEXT below. A careful blank beats a confident fabrication.

Extract:
- "has_chapter": true ONLY if the text shows this school has a Beta Alpha Psi chapter; false if the text indicates no chapter; null if unknown.
- "chapter_designation": the Greek chapter name if stated (e.g. "Theta Chi chapter"); else null.
- "advisor_first_name", "advisor_last_name": the faculty advisor's name if stated; else null.
- "advisor_title": their BAP role if stated (e.g. "Faculty Advisor", "Reporting Advisor"); else null.
- "advisor_email": ONLY if a real email for the advisor is literally visible in the source text. NEVER invent or guess an email. If you can't see it, return null.
- "source_url": the URL (from a "## SOURCE:" line) where you found the advisor; else null.
- "notes": short note on what you found / uncertainty.

RULES:
1. NEVER invent an email. No visible email => null.
2. Only return an advisor you can actually see named in the source.
3. If the source is a generic chapter inbox (e.g. bap@school.edu) rather than a person, still put it in advisor_email but say so in notes.

Respond with ONLY a single JSON object, no prose, no markdown fences:
{
  "has_chapter": true | false | null,
  "chapter_designation": string | null,
  "advisor_first_name": string | null,
  "advisor_last_name": string | null,
  "advisor_title": string | null,
  "advisor_email": string | null,
  "source_url": string | null,
  "notes": string | null
}

SOURCE TEXT:
${doc}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!AI_GATEWAY_KEY) return json({ error: "AI_GATEWAY_API_KEY not set" }, 500);
  if (!FIRECRAWL_KEY) return json({ error: "FIRECRAWL_API_KEY not set" }, 500);
  if (!SERPAPI_KEY) return json({ error: "SERPAPI_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  const force = body.force === true;
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, website_url, accounting_department_url, email_domain, bap_checked_at")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  // Idempotency: skip recently-checked campuses unless forced.
  if (!force && campus.bap_checked_at) {
    const ageDays = (Date.now() - new Date(campus.bap_checked_at as string).getTime()) / 86400000;
    if (ageDays < RECHECK_DAYS) {
      return json({ success: true, campus_id, skipped: true, reason: `checked ${Math.round(ageDays)}d ago` });
    }
  }

  const school = (campus.name as string | null) ?? "";
  const state = (campus.state as string | null) ?? "";
  if (!school) return json({ error: "campus has no name" }, 400);

  // --- 1. Discover candidate pages (school BAP/accounting page + bap.org) ---
  const queries = [
    `"${school}" "Beta Alpha Psi" faculty advisor`,
    `"${school}" "Beta Alpha Psi" accounting chapter advisor email`,
    `site:bap.org "${school}"`,
  ];
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const q of queries) {
    for (const link of await serpSearch(SERPAPI_KEY, q)) {
      if (!seen.has(link)) { seen.add(link); candidates.push(link); }
    }
    if (candidates.length >= 6) break;
  }
  if (candidates.length === 0) {
    // No discoverable page — record as checked so we don't loop forever, leave has_bap_chapter null.
    await db.from("campuses").update({ bap_checked_at: new Date().toISOString() }).eq("id", campus_id);
    return json({ success: true, campus_id, has_chapter: null, reason: "no_pages_found", matched: false, inserted: false });
  }

  // --- 2. Scrape top candidates to markdown ---
  const docs: string[] = [];
  let total = 0;
  for (const url of candidates.slice(0, 4)) {
    if (total >= MAX_TOTAL_CHARS) break;
    const md = await firecrawlScrape(FIRECRAWL_KEY, url);
    if (md.length < 150) continue;
    const block = `## SOURCE: ${url}\n${md}`;
    docs.push(block);
    total += block.length;
  }
  if (docs.length === 0) {
    await db.from("campuses").update({ bap_checked_at: new Date().toISOString() }).eq("id", campus_id);
    return json({ success: true, campus_id, has_chapter: null, reason: "scrape_empty", matched: false, inserted: false });
  }
  const doc = docs.join("\n\n").slice(0, MAX_TOTAL_CHARS);

  // --- 3. AI extraction (Vercel AI Gateway, strict JSON) ---
  let parsed: Record<string, unknown>;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_GATEWAY_KEY}` },
      body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: buildPrompt(school, state, doc) }] }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return json({ success: false, error: `AI gateway ${res.status}`, detail: t.slice(0, 500) }, 502);
    }
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    parsed = extractJson(j.choices?.[0]?.message?.content ?? "{}");
  } catch (e) {
    return json({ success: false, error: "AI call failed", detail: String((e as Error)?.message ?? e) }, 502);
  } finally {
    clearTimeout(timer);
  }

  const hasChapter =
    parsed.has_chapter === true ? true : parsed.has_chapter === false ? false : null;
  const designation = str(parsed.chapter_designation);
  const advFirst = str(parsed.advisor_first_name);
  const advLast = str(parsed.advisor_last_name);
  const advTitle = str(parsed.advisor_title) ?? "Faculty Advisor";
  const emailRaw = str(parsed.advisor_email);
  const advEmail = emailRaw && isValidEmail(emailRaw) ? emailRaw.toLowerCase() : null;
  const emailGeneric = advEmail ? isGenericEmail(advEmail) : false;
  const sourceUrl = urlOrNull(parsed.source_url);
  const notes = str(parsed.notes);

  // Always record the campus check result.
  await db.from("campuses").update({
    has_bap_chapter: hasChapter,
    bap_chapter_designation: designation,
    bap_checked_at: new Date().toISOString(),
  }).eq("id", campus_id);

  // No real advisor identity -> nothing to add as a lead.
  if (!advFirst && !advLast && !advEmail) {
    return json({ success: true, campus_id, has_chapter: hasChapter, chapter_designation: designation, matched: false, inserted: false, note: notes ?? "no advisor identity found" });
  }

  // --- 4. Match an existing lead FIRST (normalized last + first initial) ---
  const { data: existing } = await db
    .from("outreach_leads")
    .select("id, first_name, last_name, email")
    .eq("campus_id", campus_id);

  let matchedId: string | null = null;
  if (advLast) {
    const wantKey = matchKey(advFirst, advLast);
    for (const l of existing ?? []) {
      if (matchKey(l.first_name as string | null, l.last_name as string | null) === wantKey) {
        matchedId = l.id as string; break;
      }
    }
  }
  // Also match by email if we have one and a row already carries it.
  if (!matchedId && advEmail) {
    for (const l of existing ?? []) {
      if ((l.email as string | null)?.toLowerCase() === advEmail) { matchedId = l.id as string; break; }
    }
  }

  if (matchedId) {
    const { error: upErr } = await db.from("outreach_leads")
      .update({ is_bap_advisor: true, bap_advisor_title: advTitle, email_is_generic: emailGeneric })
      .eq("id", matchedId);
    if (upErr) return json({ success: false, error: "lead update failed", detail: upErr.message }, 500);
    return json({
      success: true, campus_id, has_chapter: hasChapter, chapter_designation: designation,
      matched: true, inserted: false, lead_id: matchedId,
      advisor: { first: advFirst, last: advLast, title: advTitle, email_known: !!advEmail },
    });
  }

  // --- 5. Not matched: insert a new BAP-advisor lead. Dedupe by email. ---
  if (advEmail) {
    const dupe = (existing ?? []).some((l) => (l.email as string | null)?.toLowerCase() === advEmail);
    if (dupe) {
      return json({ success: true, campus_id, has_chapter: hasChapter, matched: false, inserted: false, note: "email already present on another lead" });
    }
  }
  const insertRow = {
    campus_id,
    first_name: advFirst,
    last_name: advLast,
    email: advEmail,                 // may be null — name-only lead for follow-up
    affiliation: "BAP advisor",
    source: "bap_enrichment",
    status: "pending",
    is_bap_advisor: true,
    bap_advisor_title: advTitle,
    email_is_generic: emailGeneric,
    notes: [notes, sourceUrl ? `source: ${sourceUrl}` : null].filter(Boolean).join(" | ") || null,
  };
  const { data: ins, error: insErr } = await db.from("outreach_leads").insert(insertRow).select("id").maybeSingle();
  if (insErr) return json({ success: false, error: "lead insert failed", detail: insErr.message }, 500);

  return json({
    success: true, campus_id, has_chapter: hasChapter, chapter_designation: designation,
    matched: false, inserted: true, lead_id: ins?.id ?? null,
    advisor: { first: advFirst, last: advLast, title: advTitle, email_known: !!advEmail, email_generic: emailGeneric },
  });
});
