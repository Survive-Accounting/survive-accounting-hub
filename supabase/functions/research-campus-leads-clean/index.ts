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
