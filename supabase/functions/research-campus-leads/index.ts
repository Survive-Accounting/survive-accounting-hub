// research-campus-leads — AI-assisted lead discovery for a campus.
//
// Mirrors research-campus: Lovable AI Gateway + Gemini with google_search
// grounding. Persists results to public.campus_lead_suggestions with
// status='pending'. NEVER writes to outreach_leads.

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

const VALID_LEAD_TYPES = new Set([
  "professor",
  "admin_staff",
  "bap_advisor",
  "tutoring_center",
  "other",
]);
const VALID_CONF = new Set(["high", "medium", "low"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function buildPrompt(campus: Record<string, any>) {
  const name = campus.name ?? campus.campus_name ?? "";
  const state = campus.state ?? "";
  const dept = campus.accounting_department_name ?? "";
  const site = campus.website_url ?? "";
  const domain = campus.email_domain ?? (Array.isArray(campus.domains) ? campus.domains[0] : "") ?? "";

  return `You are researching the accounting department at "${name}"${state ? `, ${state}` : ""}, USA, to find faculty and staff a tutoring business should contact. USE GOOGLE SEARCH AGGRESSIVELY — open the actual department, faculty directory, course schedule, registrar class search, public syllabi, and Beta Alpha Psi pages. Do NOT rely on memory.

Known context:
- Department name (if known): ${dept || "unknown"}
- Website: ${site || "unknown"}
- Email domain: ${domain || "unknown"}

FIND these kinds of people (only if they have a real accounting/business-school connection):
- Accounting professors, lecturers, instructors, clinical faculty, professors of practice
- Department chair, accounting program director, undergraduate accounting coordinator
- Accounting academic advisors
- Beta Alpha Psi advisor (if the chapter exists)
- Tutoring/academic-support contact ONLY if clearly accounting or business-school related

DO NOT include:
- Students, alumni, generic admissions staff, unrelated university staff
- Anyone without a clear accounting / business-school connection

Map each person to one of these "lead_type" values:
- "professor"        — any teaching faculty (prof, lecturer, instructor, clinical, etc.)
- "admin_staff"      — chair, program director, coordinator, advisor (non-BAP)
- "bap_advisor"      — Beta Alpha Psi faculty advisor
- "tutoring_center"  — accounting/business tutoring or academic support contact
- "other"            — anything else that still qualifies

TEACHING-ASSIGNMENT ENRICHMENT (HIGH PRIORITY):
For each professor / instructor, try to determine whether they teach any of these
four course families. Search PUBLIC pages only: faculty profile, accounting
department, course schedule, registrar class search, public syllabi, business-school
pages. Do NOT use Rate My Professors. Do NOT scrape pages requiring login.

Course families:
- "intro_1"          — Intro / Principles of Financial Accounting (ACCT 200/201/2010/2110 style)
- "intro_2"          — Intro / Principles of Managerial Accounting (ACCT 202/2120 style)
- "intermediate_1"   — Intermediate Accounting I (first semester intermediate financial)
- "intermediate_2"   — Intermediate Accounting II (second semester intermediate financial)

Rules for teaching assignment:
- DO NOT GUESS. If you cannot confirm from a public page, leave the four booleans
  false and explain the uncertainty in "teaching_evidence_notes".
- Set "teaching_evidence_url" to the public page where the assignment was found.
- "courses_found" is an array of objects you actually saw on a public page:
    { "course_code": "ACCT 2010", "course_title": "Financial Accounting",
      "course_family": "intro_1"|"intro_2"|"intermediate_1"|"intermediate_2"|"other",
      "term": "Fall 2025"|null, "source_url": "https://..." }
  Use "other" for accounting courses outside the four families.

GENERAL RULES (a careful blank beats a confident fabrication):
1. NEVER invent an email. If you can't see the actual email on a real source, leave email null and explain in "notes".
2. Every non-null field MUST be supported by "source_url" (a URL you actually opened). No source => null + a note.
3. is_phd / is_cpa: if uncertain, return false and say why in "notes".
4. confidence: "high" = stated on an official department/faculty page; "medium" = secondary but plausible; "low" = weak/ambiguous, human must verify.
5. Return AT MOST 25 people. Quality over quantity.

Respond with ONLY a single JSON object (no prose, no markdown fences) in EXACTLY this shape:

{
  "suggestions": [
    {
      "first_name": string|null,
      "last_name": string|null,
      "email": string|null,
      "title": string|null,
      "department": string|null,
      "lead_type": "professor"|"admin_staff"|"bap_advisor"|"tutoring_center"|"other",
      "is_phd": boolean,
      "is_cpa": boolean,
      "source_url": string|null,
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
  return JSON.parse(cleaned.slice(start, end + 1));
}

function str(v: any): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function urlOrNull(v: any): string | null {
  return typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
}

const CONF_TO_NUMERIC: Record<string, number> = { high: 0.9, medium: 0.6, low: 0.3 };

function sanitize(raw: any): { rows: any[]; rejected: { reason: string; sample: any }[] } {
  const arr = Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  const rows: any[] = [];
  const rejected: { reason: string; sample: any }[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") { rejected.push({ reason: "not_object", sample: s }); continue; }
    const lead_type = VALID_LEAD_TYPES.has(s.lead_type) ? s.lead_type : "other";
    const confLabel = VALID_CONF.has(s.confidence) ? s.confidence : "low";
    const confidence = CONF_TO_NUMERIC[confLabel];
    const first_name = str(s.first_name);
    const last_name = str(s.last_name);
    const emailRaw = str(s.email);
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.toLowerCase() : null;
    if (!first_name && !last_name && !email) {
      rejected.push({ reason: "no_identity_fields", sample: { first_name: s.first_name, last_name: s.last_name, email: s.email } });
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
      lead_type,
      is_phd: !!s.is_phd,
      is_cpa: !!s.is_cpa,
      source_url: urlOrNull(s.source_url),
      confidence,
      notes: str(s.notes),
      teaches_intro_1: !!s.teaches_intro_1,
      teaches_intro_2: !!s.teaches_intro_2,
      teaches_intermediate_1: !!s.teaches_intermediate_1,
      teaches_intermediate_2: !!s.teaches_intermediate_2,
      courses_found: courses_found.length ? courses_found : null,
      teaching_evidence_url: urlOrNull(s.teaching_evidence_url),
      teaching_evidence_notes: str(s.teaching_evidence_notes),
      raw_payload: { ...s, _confidence_label: confLabel },
    });
  }
  return { rows, rejected };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const campus_id = (body.campus_id ?? "").trim();
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, accounting_department_name, website_url, email_domain, domains")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  // Call Lovable AI
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
        "X-Lovable-AIG-SDK": "research-campus-leads",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (res.status === 429)
      return json({ success: false, error: "AI is rate-limited, try again in a moment", debug: { model: MODEL, prompt_chars: prompt.length, http_status: 429 } }, 429);
    if (res.status === 402)
      return json({ success: false, error: "Workspace AI credits exhausted — add credits in Settings → Workspace → Usage", debug: { model: MODEL, prompt_chars: prompt.length, http_status: 402 } }, 402);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ success: false, error: "AI request failed", debug: { model: MODEL, prompt_chars: prompt.length, http_status: res.status, http_body: detail.slice(0, 2000) } }, 502);
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    text = choice?.message?.content ?? "";
    finishReason = choice?.finish_reason ?? null;
    usage = j?.usage ?? null;
    console.log("[research-campus-leads] finish_reason=", finishReason, "chars=", text.length, "usage=", usage);
    if (!text.trim()) {
      return json({
        success: false,
        error: finishReason === "length"
          ? "AI hit output token limit before producing any text — try again or shorten the campus context"
          : `Empty AI response (finish_reason=${finishReason ?? "unknown"})`,
        debug: { model: MODEL, prompt_chars: prompt.length, finish_reason: finishReason, usage, raw_text: "", raw_text_chars: 0 },
      }, 502);
    }
  } catch (e) {
    return json({ success: false, error: "AI call failed", detail: String((e as Error)?.message ?? e), debug: { model: MODEL, prompt_chars: prompt.length } }, 500);
  }

  let parsed: any;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return json({
      success: false,
      error: "AI returned malformed JSON — try again",
      detail: String((e as Error)?.message ?? e),
      debug: { model: MODEL, prompt_chars: prompt.length, finish_reason: finishReason, usage, raw_text: text.slice(0, 60000), raw_text_chars: text.length, parse_error: String((e as Error)?.message ?? e) },
    }, 502);
  }

  const { rows: cleaned, rejected } = sanitize(parsed);
  const rawSuggestionCount = Array.isArray(parsed?.suggestions) ? parsed.suggestions.length : 0;
  const sources = Array.from(new Set(cleaned.map((s: any) => s.source_url).filter((u: any) => typeof u === "string")));
  const debug: any = {
    model: MODEL,
    prompt_chars: prompt.length,
    finish_reason: finishReason,
    usage,
    raw_text: text.length > 60000 ? text.slice(0, 60000) + "…[truncated]" : text,
    raw_text_chars: text.length,
    raw_suggestion_count: rawSuggestionCount,
    parsed_lead_count: cleaned.length,
    rejected_count: rejected.length,
    rejected_samples: rejected.slice(0, 5),
    sources,
  };
  console.log("[research-campus-leads] parsed=", { rawSuggestionCount, cleaned: cleaned.length, rejected: rejected.length });

  if (cleaned.length === 0) {
    return json({
      success: true,
      campus_id,
      inserted_count: 0,
      skipped_duplicate_count: 0,
      suggestions: [],
      debug: { ...debug, note: rawSuggestionCount === 0 ? "AI returned a valid JSON object but with zero suggestions — the model could not find people on the sources it visited." : "All suggestions were rejected by sanitize() — see rejected_samples." },
    });
  }

  // Load existing suggestions for this campus to dedupe.
  const { data: existing, error: existingErr } = await db
    .from("campus_lead_suggestions")
    .select("email, first_name, last_name")
    .eq("campus_id", campus_id);
  if (existingErr)
    return json({ success: false, error: "existing lookup failed", detail: existingErr.message, debug }, 500);

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
  const insertErrors: string[] = [];
  if (toInsert.length) {
    const { data: ins, error: insErr } = await db
      .from("campus_lead_suggestions")
      .insert(toInsert)
      .select();
    if (insErr) {
      console.error("[research-campus-leads] batch insert failed:", insErr.message);
      insertErrors.push(`batch: ${insErr.message}`);
      // Partial save: try one-by-one so a single bad row doesn't kill the batch.
      const okRows: any[] = [];
      for (const row of toInsert) {
        const { data: one, error: oneErr } = await db
          .from("campus_lead_suggestions")
          .insert(row)
          .select()
          .maybeSingle();
        if (!oneErr && one) okRows.push(one);
        else if (oneErr) insertErrors.push(`row(${row.email ?? row.first_name ?? "?"}): ${oneErr.message}`);
      }
      return json({
        success: okRows.length > 0,
        campus_id,
        inserted_count: okRows.length,
        skipped_duplicate_count: skipped,
        partial: true,
        insert_error: insErr.message,
        suggestions: okRows,
        debug: { ...debug, insert_attempted: toInsert.length, insert_errors: insertErrors.slice(0, 10), insert_error_sample_row: toInsert[0] },
      });
    }
    inserted = ins ?? [];
  }

  return json({
    success: true,
    campus_id,
    inserted_count: inserted.length,
    skipped_duplicate_count: skipped,
    suggestions: inserted,
    debug: { ...debug, insert_attempted: toInsert.length, inserted: inserted.length },
  });
});
