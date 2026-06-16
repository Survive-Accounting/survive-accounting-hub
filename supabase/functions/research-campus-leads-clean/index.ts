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

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = Deno.env.get("RESEARCH_MODEL") ?? "google/gemini-3-flash-preview";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

function buildPrompt(campus: Record<string, any>) {
  const name = campus.name ?? "";
  const state = campus.state ?? "";
  const dept = campus.accounting_department_name ?? "";
  const site = campus.website_url ?? "";
  const domain = campus.email_domain ?? (Array.isArray(campus.domains) ? campus.domains[0] : "") ?? "";

  return `You are running a STRICT, quality-first research pass at "${name}"${state ? `, ${state}` : ""}, USA, to find ACCOUNTING-FACULTY contacts for a cold email campaign. Use Google Search to actually open the official accounting department / school of accountancy / business school faculty pages. NEVER guess. A careful blank beats a confident fabrication.

Known context:
- Department name (if known): ${dept || "unknown"}
- Website: ${site || "unknown"}
- Email domain: ${domain || "unknown"}

================== ALLOWED LEAD SOURCES ==================
Only use these kinds of pages as evidence:
1. Official accounting department faculty page
2. Official school of accountancy faculty page
3. Official business school faculty page FILTERED to accounting faculty
4. Official university directory entry that clearly identifies accounting department
5. Accounting department contact page
6. Beta Alpha Psi advisor page, ONLY if it is explicitly accounting/BAP-related

================== DISALLOWED SOURCES ==================
NEVER use these as the basis to emit a lead:
- Generic business school staff/admin/dean/career/admissions pages
- Class schedule / registrar instructor names WITHOUT a confirmed email or official profile URL
- LinkedIn
- Rate My Professors
- Random third-party directories, scraper sites, Wikipedia
- Any login-walled page

================== ALLOWED LEAD TYPES (BE INCLUSIVE) ==================
Include ANYONE who could realistically teach an accounting course at this
school. Rank, tenure status, and seniority DO NOT matter — an adjunct who
teaches one section of Intro Financial is just as valuable as a tenured
full professor. Specifically include ALL of the following, not just the
senior names:

- Full / Associate / Assistant Professor of Accounting
- Instructor / Senior Instructor / Instructional Assistant Professor
- Lecturer / Senior Lecturer / Principal Lecturer / Teaching Professor
- Clinical Professor / Clinical Assistant or Associate Professor
- Professor of Practice / Practitioner Faculty / Executive in Residence
- Adjunct Professor / Adjunct Instructor / Adjunct Lecturer / Adjunct Faculty
- Visiting Professor / Visiting Assistant Professor / Visiting Lecturer
- Post-doctoral teaching fellow (only if teaching accounting)
- Accounting department chair / school of accountancy director
- Beta Alpha Psi faculty advisor (only if explicitly listed as BAP)

CRITICAL — DO NOT STOP AT THE TENURED FACULTY PAGE. Many schools list
adjuncts, instructors, and lecturers on a SEPARATE page from tenure-track
faculty. Search for and open additional pages such as:
  - "Instructors", "Lecturers", "Teaching Faculty"
  - "Adjunct Faculty", "Adjunct Professors", "Affiliated Faculty"
  - "Non-Tenure-Track Faculty", "Clinical Faculty"
  - Department staff directory pages
  - University-wide people directory filtered to the accounting department
A school with only 4 tenured professors often has 10+ adjuncts and
instructors who actually teach the intro courses we care about. MISSING
THEM IS THE #1 FAILURE MODE of this research run. If you only find
tenured professors, you have not searched hard enough — try again.

================== EXCLUDED LEAD TYPES ==================
DO NOT emit:
- Students or alumni
- Generic admissions or career-services staff
- Finance, economics, statistics, marketing, management, IS, supply-chain, or
  any other non-accounting business faculty
- Anyone whose accounting connection is unclear

Map each person to one of these "lead_type" values:
- "professor"   — ANY teaching faculty: professor (any rank), lecturer,
                  instructor, clinical, professor of practice, adjunct,
                  visiting. Rank and tenure status are irrelevant.
- "admin_staff" — accounting dept chair / accounting program director / accounting advisor
- "bap_advisor" — explicitly listed Beta Alpha Psi accounting advisor

================== HARD RULES ==================
1. EVERY row MUST be supported by "source_url" — an official URL you actually opened. No source ⇒ DO NOT emit the row.
2. EVERY row MUST have at least one of:
   (a) a real "email" you actually saw printed on the source page (NEVER invent or pattern-guess), OR
   (b) an official faculty profile URL recorded in "source_url".
   If you have neither, DO NOT emit the row.
3. NEVER emit a row whose ONLY evidence is a course-schedule instructor name. Class schedule data may inform teaches_intro_1 / teaches_intro_2 / etc, but the row itself requires an official email or profile.
4. is_phd / is_cpa — only true if literally shown on the source page. Otherwise false. Explain in "notes".
5. confidence: "high" = name + title + (email OR official profile URL) on an official accounting/business-school faculty page; "medium" = official source but missing email AND profile URL (do NOT emit per rule 2); "low" = weak/ambiguous (do NOT emit).
6. Return AT MOST 40 people. Include every accounting-teaching adjunct, instructor, lecturer, and professor (any rank) that meets rules 1–5. Do not artificially cap to "top names" — completeness across all ranks matters.

================== TEACHING ENRICHMENT (OPTIONAL) ==================
For each professor, OPTIONALLY add teaching assignment if you can confirm it
from public pages (faculty profile, accounting dept page, registrar class
search, public syllabi):
- "intro_1"        — Intro / Principles of Financial Accounting
- "intro_2"        — Intro / Principles of Managerial Accounting
- "intermediate_1" — Intermediate Accounting I
- "intermediate_2" — Intermediate Accounting II

Rules: If unsure, leave the four booleans false and explain in
"teaching_evidence_notes". Set "teaching_evidence_url" to the public page.
"courses_found" is an array of courses actually seen on a public page.

Respond with ONLY a single JSON object (no prose, no markdown fences) in EXACTLY this shape:

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string; test_mode?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  const test_mode = body.test_mode === true;
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, accounting_department_name, website_url, email_domain, domains")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  let text = "";
  let finishReason: string | null = null;
  let usage: any = null;
  const prompt = buildPrompt(campus);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "research-campus-leads-clean",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (res.status === 429)
      return json({ success: false, error: "AI is rate-limited, try again in a moment" }, 429);
    if (res.status === 402)
      return json({ success: false, error: "Workspace AI credits exhausted" }, 402);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ success: false, error: "AI request failed", debug: { http_status: res.status, http_body: detail.slice(0, 2000) } }, 502);
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    text = choice?.message?.content ?? "";
    finishReason = choice?.finish_reason ?? null;
    usage = j?.usage ?? null;
    if (!text.trim()) {
      return json({ success: false, error: `Empty AI response (finish_reason=${finishReason ?? "unknown"})`, debug: { finish_reason: finishReason, usage } }, 502);
    }
  } catch (e) {
    return json({ success: false, error: "AI call failed", detail: String((e as Error)?.message ?? e) }, 500);
  }

  let parsed: any;
  try { parsed = extractJson(text); }
  catch (e) {
    return json({ success: false, error: "AI returned malformed JSON", detail: String((e as Error)?.message ?? e), debug: { raw_text: text.slice(0, 30000) } }, 502);
  }

  const { rows: cleaned, rejected } = sanitize(parsed);
  const rawCount = Array.isArray(parsed?.suggestions) ? parsed.suggestions.length : 0;
  const debug = {
    model: MODEL,
    research_mode: RESEARCH_MODE,
    research_label: test_mode ? `Clean Professor Test — ${campus.name}` : RESEARCH_LABEL,
    finish_reason: finishReason,
    usage,
    raw_suggestion_count: rawCount,
    parsed_lead_count: cleaned.length,
    rejected_count: rejected.length,
    rejected_samples: rejected.slice(0, 20),
    test_mode,
    prompt_preview: prompt.slice(0, 4000),
    raw_response_preview: text.slice(0, 8000),
    accepted_preview: cleaned.slice(0, 30),
    parsed_suggestions: test_mode ? parsed?.suggestions ?? [] : undefined,
  };
  console.log("[research-campus-leads-clean]", { campus_id, test_mode, parsed: cleaned.length, rejected: rejected.length });

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
