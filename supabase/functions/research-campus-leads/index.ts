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

  return `You are researching the accounting department at "${name}"${state ? `, ${state}` : ""}, USA, to find faculty and staff a tutoring business should contact. USE GOOGLE SEARCH AGGRESSIVELY — open the actual department, faculty directory, and Beta Alpha Psi pages. Do NOT rely on memory.

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

RULES (these matter — a careful blank beats a confident fabrication):
1. NEVER invent an email. If you can't see the actual email on a real source, leave email null and explain in "notes".
2. Every non-null field MUST be supported by "source_url" (a URL you actually opened). No source => null + a note.
3. is_phd / is_cpa: if uncertain, return false and say why in "notes".
4. confidence: "high" = stated on an official department/faculty page; "medium" = secondary but plausible; "low" = weak/ambiguous, human must verify.
5. Return AT MOST 25 people. Quality over quantity. Skip people you can't reasonably justify.

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
      "notes": string|null
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
        messages: [{ role: "user", content: buildPrompt(campus) }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (res.status === 429) return json({ error: "AI is rate-limited, try again in a moment" }, 429);
    if (res.status === 402)
      return json({ error: "Workspace AI credits exhausted — add credits in Settings → Workspace → Usage" }, 402);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: "AI request failed", status: res.status, detail: detail.slice(0, 800) }, 502);
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    text = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length") {
      return json({ error: "AI response was truncated — try again" }, 502);
    }
    if (!text.trim()) return json({ error: "empty model response" }, 502);
  } catch (e) {
    return json({ error: "AI call failed", detail: String((e as Error)?.message ?? e) }, 500);
  }

  let parsed: any;
  try {
    parsed = extractJson(text);
  } catch (e) {
    return json({ error: "AI returned malformed JSON — try again", detail: String((e as Error)?.message ?? e) }, 502);
  }

  const cleaned = sanitize(parsed);
  const sources = Array.from(new Set(cleaned.map((s: any) => s.source_url).filter((u: any) => typeof u === "string")));
  const debug = {
    model: MODEL,
    raw_text: text.length > 60000 ? text.slice(0, 60000) + "…[truncated]" : text,
    raw_text_chars: text.length,
    parsed_lead_count: cleaned.length,
    sources,
  };
  if (cleaned.length === 0) {
    return json({ success: true, campus_id, inserted_count: 0, skipped_duplicate_count: 0, suggestions: [], debug });
  }

  // Load existing suggestions for this campus to dedupe.
  const { data: existing, error: existingErr } = await db
    .from("campus_lead_suggestions")
    .select("email, first_name, last_name")
    .eq("campus_id", campus_id);
  if (existingErr) return json({ error: "existing lookup failed", detail: existingErr.message }, 500);

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
      if (seenEmail.has(s.email)) {
        skipped++;
        continue;
      }
      seenEmail.add(s.email);
    } else {
      const key = `${(s.first_name ?? "").toLowerCase()}|${(s.last_name ?? "").toLowerCase()}`;
      if (!key.replace("|", "") || seenName.has(key)) {
        skipped++;
        continue;
      }
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
      // Partial save: try one-by-one so a single bad row doesn't kill the batch.
      let partial = 0;
      const okRows: any[] = [];
      for (const row of toInsert) {
        const { data: one, error: oneErr } = await db
          .from("campus_lead_suggestions")
          .insert(row)
          .select()
          .maybeSingle();
        if (!oneErr && one) {
          okRows.push(one);
          partial++;
        }
      }
      return json({
        success: partial > 0,
        campus_id,
        inserted_count: partial,
        skipped_duplicate_count: skipped,
        partial: true,
        insert_error: insErr.message,
        suggestions: okRows,
        debug,
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
    debug,
  });
});
