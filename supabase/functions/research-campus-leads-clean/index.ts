// research-campus-leads-clean — STRICT professor-only AI lead discovery.
//
// Phase 3 companion to research-campus-leads. Quality-first rules:
//   - Only accounting professors / lecturers / instructors / clinical /
//     professors of practice / accounting dept chair / BAP advisor (if
//     explicitly accounting/BAP-related).
//   - Source MUST be an official accounting / school of accountancy /
//     business school faculty page, accounting dept contact page, or
//     university directory entry that clearly says "accounting".
//   - NO LinkedIn, NO Rate My Professors, NO class-schedule-only names,
//     NO generic business/admin/dean/career/admissions/finance/econ/stat.
//   - Every row MUST have either a working email OR an official profile URL.
//     If neither is found on a public official page, DO NOT emit the row.
//
// All inserted rows are tagged:
//   research_mode  = 'clean_professor_only'
//   research_label = 'Clean Professor Run 1'
//
// Inserts into public.campus_lead_suggestions with status='pending'.
// NEVER writes to outreach_leads.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Non-Lovable pipeline (mirrors research-campus-bap-advisor): SerpAPI discovery
// -> Firecrawl page fetch -> Vercel AI Gateway strict-JSON extraction over the
// REAL scraped pages. The old Lovable path relied on the model's built-in
// google_search grounding (which the Vercel gateway doesn't expose), so we feed
// the model actual scraped directory text instead — grounded, not hallucinated.
const AI_GATEWAY_KEY = Deno.env.get("AI_GATEWAY_API_KEY") ?? "";
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const SERPAPI_KEY = Deno.env.get("SERPAPI_API_KEY") ?? "";
const MODEL = Deno.env.get("RESEARCH_MODEL") ?? "google/gemini-2.5-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const MAX_DOC_CHARS = 18000;
const MAX_TOTAL_CHARS = 60000;
const FIRECRAWL_TIMEOUT_MS = 25000;
const AI_TIMEOUT_MS = 60000;

const RESEARCH_MODE = "clean_professor_only";
const RESEARCH_LABEL = "Clean Professor Run 1";

// Allowed lead_type values for the clean run. Note: tutoring_center and
// generic admin_staff are NOT allowed unless explicitly accounting/BAP.
const VALID_LEAD_TYPES = new Set(["professor", "admin_staff", "bap_advisor"]);
const VALID_CONF = new Set(["high", "medium", "low"]);
const CONF_TO_NUMERIC: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function commonContext(campus: Record<string, any>) {
  const name = campus.name ?? "";
  const state = campus.state ?? "";
  const dept = campus.accounting_department_name ?? "";
  const site = campus.website_url ?? "";
  const domain = campus.email_domain ?? (Array.isArray(campus.domains) ? campus.domains[0] : "") ?? "";
  return { name, state, dept, site, domain };
}

const RESPONSE_SHAPE = `Respond with ONLY a single JSON object (no prose, no markdown fences) in EXACTLY this shape:

{
  "suggestions": [
    {
      "first_name": string|null,
      "last_name": string|null,
      "email": string|null,
      "title": string|null,
      "department": string|null,
      "lead_type": "professor"|"admin_staff"|"bap_advisor",
      "is_phd": boolean,
      "is_cpa": boolean,
      "source_url": string,
      "confidence": "high"|"medium"|"low",
      "notes": string|null,
      "teaches_intro_1": boolean,
      "teaches_intro_2": boolean,
      "teaches_intermediate_1": boolean,
      "teaches_intermediate_2": boolean,
      "courses_found": [
        { "course_code": string|null, "course_title": string|null,
          "course_family": "intro_1"|"intro_2"|"intermediate_1"|"intermediate_2"|"other",
          "term": string|null, "source_url": string|null }
      ],
      "teaching_evidence_url": string|null,
      "teaching_evidence_notes": string|null
    }
  ]
}`;

const HARD_RULES = `================== HARD RULES ==================
1. EVERY row MUST be supported by "source_url" — an official URL you actually opened. No source ⇒ DO NOT emit the row.
2. EVERY row MUST have at least one of: (a) a real "email" printed on the source page (NEVER invent or pattern-guess), OR (b) an official faculty profile URL in "source_url". If neither, DO NOT emit the row.
3. NEVER emit a row whose ONLY evidence is a course-schedule instructor name.
4. is_phd / is_cpa — only true if literally shown on the source page.
5. NO LinkedIn, NO RateMyProfessors, NO Wikipedia, NO social media as a source.
6. Exclude finance, economics, statistics, marketing, management, IS, supply-chain, or any other non-accounting faculty.`;

function buildPromptFaculty(campus: Record<string, any>, forceUrls: string[] = []) {
  const { name, state, dept, site, domain } = commonContext(campus);
  const forceBlock = forceUrls.length
    ? `\n\nMANDATORY URLS — open ALL of these before searching:\n${forceUrls.map((u) => `- ${u}`).join("\n")}\n`
    : "";
  return `PASS 1 of 2 — TENURE-TRACK / SENIOR ACCOUNTING FACULTY ONLY at "${name}"${state ? `, ${state}` : ""}, USA.

Known context:
- Department name: ${dept || "unknown"}
- Website: ${site || "unknown"}
- Email domain: ${domain || "unknown"}${forceBlock}

Use Google Search to open the official accounting / school of accountancy / business school faculty page. NEVER guess. A careful blank beats a confident fabrication.

INCLUDE only these titles:
- Full / Associate / Assistant Professor of Accounting (any rank, tenure-track or tenured)
- Clinical Professor / Clinical Assistant or Associate Professor (accounting)
- Professor of Practice / Practitioner Faculty / Executive in Residence (accounting)
- Accounting department chair / school of accountancy director
- Beta Alpha Psi faculty advisor (only if explicitly listed as BAP advisor)

DO NOT INCLUDE in this pass (Pass 2 will handle them):
- Instructors, Lecturers, Adjuncts, Visiting faculty, Teaching Professors, Post-docs
- These are covered by Pass 2, so leaving them out here is correct.

lead_type mapping:
- "professor"   — teaching faculty above
- "admin_staff" — chair / director / accounting advisor
- "bap_advisor" — Beta Alpha Psi accounting advisor

${HARD_RULES}

${RESPONSE_SHAPE}`;
}

function buildPromptInstructors(
  campus: Record<string, any>,
  forceUrls: string[] = [],
  retry = false,
) {
  const { name, state, dept, site, domain } = commonContext(campus);
  const forceBlock = forceUrls.length
    ? `\n\nMANDATORY URLS — open ALL of these before searching:\n${forceUrls.map((u) => `- ${u}`).join("\n")}\n`
    : "";
  const retryBlock = retry
    ? `\n\n*** YOUR PREVIOUS RESPONSE LISTED ZERO INSTRUCTORS. ***
The department almost certainly employs instructors, lecturers, or adjuncts who teach the high-enrollment intro courses. Open the staff/instructor tab now (likely "?role=instructor", "?role=staff", "/instructors", or "/adjunct-faculty") and enumerate every person whose title contains Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, or Visiting. Then open each individual profile page to confirm email.\n`
    : "";

  return `PASS 2 of 2 — NON-TENURE-TRACK ACCOUNTING TEACHING STAFF at "${name}"${state ? `, ${state}` : ""}, USA.

Known context:
- Department name: ${dept || "unknown"}
- Website: ${site || "unknown"}
- Email domain: ${domain || "unknown"}${forceBlock}${retryBlock}

Your ONLY job in this pass is to enumerate EVERY person at this accounting department whose title contains ANY of:
- Instructor / Senior Instructor / Instructional Assistant Professor
- Lecturer / Senior Lecturer / Principal Lecturer / Teaching Professor
- Adjunct Professor / Adjunct Instructor / Adjunct Lecturer / Adjunct Faculty
- Visiting Professor / Visiting Assistant Professor / Visiting Lecturer
- Clinical Professor / Clinical Assistant or Associate Professor
- Professor of Practice / Practitioner Faculty / Executive in Residence
- Post-doctoral teaching fellow (only if teaching accounting)

These people TEACH THE INTRO COURSES — they are the highest-value targets for this campaign. Missing them is the #1 failure of this research run.

CRITICAL — HOW TO FIND THEM:
Many schools list non-tenure-track faculty on a SEPARATE page, OR on the SAME faculty-and-staff page behind filter tabs / role chips (e.g. "Faculty | Instructor | Staff | Adjunct"). When you see ANY such filter UI, treat each filter value as its own page — they are usually query strings like "?role=instructor", "?type=adjunct", "?category=staff", or fragment anchors like "#instructors". OPEN EACH ONE EXPLICITLY.

Also search for and open these page patterns:
- "Instructors", "Lecturers", "Teaching Faculty"
- "Adjunct Faculty", "Adjunct Professors", "Affiliated Faculty"
- "Non-Tenure-Track Faculty", "Clinical Faculty"
- Department staff directory pages
- Individual faculty profile pages linked from the directory (often "/faculty-and-staff/<slug>/", "/profiles/<username>.php") — OPEN THEM to confirm titles and find emails the directory hides.

Concrete example: at the University of Mississippi, https://accountancy.olemiss.edu/about/faculty-and-staff/ has tabs "Faculty | Instructor | Staff". A run that only enumerates the default "Faculty" tab misses Whitney Barton (Instructor in Accountancy, wfbarton@olemiss.edu), Katy Mullinax, Sandi Goodwin, Evelyn Farmer, Grace Herrington, Jennifer Burchfield, and Cere Muscarella entirely. That is unacceptable output. Always enumerate every tab.

EXCLUDE in this pass:
- Tenure-track Professors / Assoc / Asst Professors of Accounting (Pass 1 already covered them)
- Anyone whose title is just "Professor of Accounting" without a "Clinical" / "Practice" / "Adjunct" / "Visiting" qualifier
- Non-accounting faculty of any kind
- Pure admin/staff with no teaching role

lead_type for every row in this pass: "professor"

${HARD_RULES}

AUDIT YOURSELF BEFORE RESPONDING: if your suggestions array has zero entries whose title contains "Instructor", "Lecturer", "Adjunct", "Clinical", "Practice", or "Visiting", you have failed — search again and open the role/staff tabs explicitly.

${RESPONSE_SHAPE}`;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object in model output");
  const slice = cleaned.slice(start, end + 1);
  try { return JSON.parse(slice); }
  catch {
    const fixed = slice.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
    try { return JSON.parse(fixed); }
    catch {
      const stripped = fixed.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
      return JSON.parse(stripped);
    }
  }
}

const str = (v: any): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const urlOrNull = (v: any): string | null =>
  typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Disallowed source-host hints — anything matching here is rejected outright.
const DISALLOWED_HOSTS = [
  "linkedin.com",
  "ratemyprofessors.com",
  "ratemyprofessor.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "wikipedia.org",
  "youtube.com",
];

function hostBlocked(u: string | null): boolean {
  if (!u) return false;
  try {
    const h = new URL(u).hostname.toLowerCase();
    return DISALLOWED_HOSTS.some((bad) => h === bad || h.endsWith("." + bad));
  } catch { return false; }
}

function sanitize(raw: any): { rows: any[]; rejected: { reason: string; sample: any }[] } {
  const arr = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  const rows: any[] = [];
  const rejected: { reason: string; sample: any }[] = [];

  for (const s of arr) {
    if (!s || typeof s !== "object") { rejected.push({ reason: "not_object", sample: s }); continue; }

    const lead_type_raw = typeof s.lead_type === "string" ? s.lead_type : "";
    if (!VALID_LEAD_TYPES.has(lead_type_raw)) {
      rejected.push({ reason: `disallowed_lead_type:${lead_type_raw}`, sample: { name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), lead_type: lead_type_raw } });
      continue;
    }

    const confLabel = VALID_CONF.has(s.confidence) ? s.confidence : "low";
    const first_name = str(s.first_name);
    const last_name = str(s.last_name);
    const emailRaw = str(s.email);
    const email = emailRaw && EMAIL_RE.test(emailRaw) ? emailRaw.toLowerCase() : null;
    const source_url = urlOrNull(s.source_url);

    if (!first_name && !last_name) {
      rejected.push({ reason: "missing_name", sample: { email, source_url } });
      continue;
    }
    if (!source_url) {
      rejected.push({ reason: "missing_source_url", sample: { name: `${first_name ?? ""} ${last_name ?? ""}`.trim() } });
      continue;
    }
    if (hostBlocked(source_url)) {
      rejected.push({ reason: "blocked_source_host", sample: { name: `${first_name ?? ""} ${last_name ?? ""}`.trim(), source_url } });
      continue;
    }
    // Phase 3 rule 2: need email OR official profile URL. source_url IS the
    // profile URL when it points to that person's faculty page.
    if (!email && !source_url) {
      rejected.push({ reason: "no_email_or_profile", sample: { name: `${first_name ?? ""} ${last_name ?? ""}`.trim() } });
      continue;
    }

    const VALID_FAMILY = new Set(["intro_1", "intro_2", "intermediate_1", "intermediate_2", "other"]);
    const coursesRaw = Array.isArray(s.courses_found) ? s.courses_found : [];
    const courses_found = coursesRaw
      .filter((c: any) => c && typeof c === "object")
      .map((c: any) => ({
        course_code: str(c.course_code),
        course_title: str(c.course_title),
        course_family: VALID_FAMILY.has(c.course_family) ? c.course_family : "other",
        term: str(c.term),
        source_url: urlOrNull(c.source_url),
      }));

    rows.push({
      first_name, last_name, email,
      title: str(s.title),
      department: str(s.department),
      lead_type: lead_type_raw,
      is_phd: !!s.is_phd,
      is_cpa: !!s.is_cpa,
      source_url,
      confidence: CONF_TO_NUMERIC[confLabel],
      notes: str(s.notes),
      teaches_intro_1: !!s.teaches_intro_1,
      teaches_intro_2: !!s.teaches_intro_2,
      teaches_intermediate_1: !!s.teaches_intermediate_1,
      teaches_intermediate_2: !!s.teaches_intermediate_2,
      courses_found: courses_found.length ? courses_found : null,
      teaching_evidence_url: urlOrNull(s.teaching_evidence_url),
      teaching_evidence_notes: str(s.teaching_evidence_notes),
      raw_payload: { ...s, _confidence_label: confLabel, _research_mode: RESEARCH_MODE },
      research_mode: RESEARCH_MODE,
      research_label: RESEARCH_LABEL,
    });
  }
  return { rows, rejected };
}

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
  } catch { return []; }
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
  } catch { return ""; }
  finally { clearTimeout(timer); }
}

// Extraction prompt — reads the REAL scraped pages (each under a "## SOURCE:"
// header) and enumerates accounting teaching faculty with per-course-family
// teaching flags. Reuses the strict HARD_RULES + RESPONSE_SHAPE contract so the
// downstream sanitize()/insert path is unchanged.
function buildExtractPrompt(campus: Record<string, any>, doc: string): string {
  const { name, state, dept, domain } = commonContext(campus);
  return `You are reading REAL, already-fetched web pages (below, each under a "## SOURCE: <url>" header) to enumerate the ACCOUNTING teaching faculty at "${name}"${state ? `, ${state}` : ""}, USA.

Known context:
- Department: ${dept || "unknown"}
- Email domain: ${domain || "unknown"}

Use ONLY what is literally present in the SOURCE TEXT. Do NOT use outside knowledge. A careful blank beats a confident fabrication.

Enumerate EVERY accounting teaching person visible across ALL sources, of ANY rank:
- Full / Associate / Assistant Professor of Accounting
- Instructor / Senior Instructor / Lecturer / Senior Lecturer / Teaching Professor
- Adjunct / Visiting / Clinical / Professor of Practice (accounting)
- Accounting department chair / school of accountancy director
- Beta Alpha Psi faculty advisor (only if explicitly accounting/BAP)
Instructors, lecturers, and adjuncts teach the high-enrollment intro courses — do NOT skip them.

For each person set teaches_intro_1 / teaches_intro_2 / teaches_intermediate_1 / teaches_intermediate_2 to true ONLY when the source shows evidence they teach that course family (a listed course, schedule, or profile statement); otherwise false. List any specific courses you see in "courses_found".

lead_type: "professor" for teaching faculty; "admin_staff" for chair/director/advising; "bap_advisor" for an explicit BAP advisor.

For "source_url", use the "## SOURCE:" URL the person appears on, or their individual profile URL if one is printed in the source text.

${HARD_RULES}

${RESPONSE_SHAPE}

==================== SOURCE TEXT ====================
${doc}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!AI_GATEWAY_KEY) return json({ error: "AI_GATEWAY_API_KEY not set" }, 500);
  if (!FIRECRAWL_KEY) return json({ error: "FIRECRAWL_API_KEY not set" }, 500);
  if (!SERPAPI_KEY) return json({ error: "SERPAPI_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string; test_mode?: boolean; force_urls?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  const test_mode = body.test_mode === true;
  const force_urls = Array.isArray(body.force_urls)
    ? body.force_urls.filter((u) => typeof u === "string" && /^https?:\/\//i.test(u))
    : [];
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, accounting_department_name, website_url, email_domain, domains")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  // --- 1. Discover real accounting faculty/directory pages via SerpAPI ---
  const { name: schoolName, dept, domain } = commonContext(campus);
  const queries = [
    `"${schoolName}" accounting faculty directory`,
    `"${schoolName}" department of accountancy faculty`,
    `"${schoolName}" school of accountancy faculty profiles`,
    dept ? `"${dept}" "${schoolName}" faculty` : `"${schoolName}" accounting professors`,
    domain ? `site:${domain} accounting faculty` : `"${schoolName}" accounting instructors lecturers`,
  ];
  const seenUrl = new Set<string>();
  const candidates: string[] = [];
  for (const u of force_urls) { if (!seenUrl.has(u)) { seenUrl.add(u); candidates.push(u); } }
  for (const q of queries) {
    for (const link of await serpSearch(SERPAPI_KEY, q)) {
      if (hostBlocked(link)) continue;
      if (!seenUrl.has(link)) { seenUrl.add(link); candidates.push(link); }
    }
    if (candidates.length >= 8) break;
  }

  // --- 2. Scrape the top candidates to markdown (real, grounded source text) ---
  const docs: string[] = [];
  const scrapedUrls: string[] = [];
  let totalChars = 0;
  for (const url of candidates.slice(0, 6)) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    const md = await firecrawlScrape(FIRECRAWL_KEY, url);
    if (md.length < 150) continue;
    const block = `## SOURCE: ${url}\n${md}`;
    docs.push(block);
    scrapedUrls.push(url);
    totalChars += block.length;
  }
  const doc = docs.join("\n\n").slice(0, MAX_TOTAL_CHARS);

  // --- 3. AI extraction over the REAL scraped pages (Vercel AI Gateway) ---
  let mergedParsed: any = { suggestions: [] };
  let aiText = "";
  let aiError: string | null = null;
  let finishReason: string | null = null;
  if (doc.trim().length >= 150) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AI_TIMEOUT_MS);
    try {
      const res = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${AI_GATEWAY_KEY}` },
        body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: buildExtractPrompt(campus, doc) }] }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        aiError = `AI gateway ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`;
      } else {
        const j = await res.json();
        const choice = j?.choices?.[0];
        aiText = choice?.message?.content ?? "";
        finishReason = choice?.finish_reason ?? null;
        try { mergedParsed = extractJson(aiText); }
        catch (e) { aiError = `parse: ${String((e as Error)?.message ?? e)}`; }
      }
    } catch (e) {
      aiError = `AI call failed: ${String((e as Error)?.message ?? e)}`;
    } finally {
      clearTimeout(timer);
    }
  } else {
    aiError = "no_source_text_scraped";
  }

  const mergedRaw: any[] = Array.isArray(mergedParsed?.suggestions) ? mergedParsed.suggestions : [];
  const { rows: cleaned, rejected } = sanitize({ suggestions: mergedRaw });
  const debug = {
    model: MODEL,
    research_mode: RESEARCH_MODE,
    research_label: test_mode ? `Clean Professor Test — ${campus.name}` : RESEARCH_LABEL,
    pipeline: "serpapi+firecrawl+ai_gateway",
    queries,
    candidate_count: candidates.length,
    scraped_urls: scrapedUrls,
    scraped_chars: doc.length,
    finish_reason: finishReason,
    ai_error: aiError,
    force_urls,
    raw_suggestion_count: mergedRaw.length,
    parsed_lead_count: cleaned.length,
    rejected_count: rejected.length,
    rejected_samples: rejected.slice(0, 20),
    test_mode,
    raw_response_preview: aiText.slice(0, 4000),
    accepted_preview: cleaned.slice(0, 60),
    parsed_suggestions: test_mode ? mergedRaw : undefined,
  };
  console.log("[research-campus-leads-clean]", { campus_id, test_mode, scraped: scrapedUrls.length, raw: mergedRaw.length, parsed: cleaned.length, rejected: rejected.length, ai_error: aiError });


  // Tag test runs with a distinct label so they're easy to find / archive.
  const labelForRun = test_mode
    ? `Clean Professor Test — ${campus.name} ${new Date().toISOString().slice(0,16).replace("T"," ")}`
    : RESEARCH_LABEL;
  for (const r of cleaned) r.research_label = labelForRun;

  if (cleaned.length === 0) {
    return json({ success: true, campus_id, inserted_count: 0, skipped_duplicate_count: 0, suggestions: [], debug });
  }

  // Dedupe against existing clean-run suggestions for this campus.
  const { data: existing, error: existingErr } = await db
    .from("campus_lead_suggestions")
    .select("email, first_name, last_name, research_mode")
    .eq("campus_id", campus_id)
    .eq("research_mode", RESEARCH_MODE);
  if (existingErr) return json({ success: false, error: "existing lookup failed", detail: existingErr.message, debug }, 500);

  const seenEmail = new Set<string>();
  const seenName = new Set<string>();
  for (const r of existing ?? []) {
    if (r.email) seenEmail.add(r.email.toLowerCase());
    else if (r.first_name || r.last_name)
      seenName.add(`${(r.first_name ?? "").toLowerCase()}|${(r.last_name ?? "").toLowerCase()}`);
  }

  const toInsert: any[] = [];
  let skipped = 0;
  for (const s of cleaned) {
    if (s.email) {
      if (seenEmail.has(s.email)) { skipped++; continue; }
      seenEmail.add(s.email);
    } else {
      const key = `${(s.first_name ?? "").toLowerCase()}|${(s.last_name ?? "").toLowerCase()}`;
      if (!key.replace("|", "") || seenName.has(key)) { skipped++; continue; }
      seenName.add(key);
    }
    toInsert.push({ campus_id, status: "pending", ...s });
  }

  let inserted: any[] = [];
  if (toInsert.length) {
    const { data: ins, error: insErr } = await db
      .from("campus_lead_suggestions")
      .insert(toInsert)
      .select();
    if (insErr) {
      console.error("[research-campus-leads-clean] insert failed:", insErr.message);
      return json({ success: false, error: insErr.message, debug }, 500);
    }
    inserted = ins ?? [];
  }

  return json({
    success: true,
    campus_id,
    inserted_count: inserted.length,
    skipped_duplicate_count: skipped,
    suggestions: inserted,
    debug,
  });
});
