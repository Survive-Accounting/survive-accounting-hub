// research-campus-sections — Phase 4C: Class Schedule Intelligence.
//
// Best-effort scrape of public registrar / business school class schedule
// data for accounting + business-core courses. Persists rows to
// public.campus_course_sections and links instructors to existing or new
// campus_lead_suggestions. NEVER writes to outreach_leads.
//
// Missing schedule data is NOT an error: an empty result still returns
// success:true with sections_inserted: 0.

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

const VALID_FAMILY = new Set([
  "intro_1", "intro_2", "intermediate_1", "intermediate_2",
  "finance", "business_stats", "business_analytics",
  "microeconomics", "macroeconomics", "other",
]);
const VALID_CONF = new Set(["high", "medium", "low"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function buildPrompt(campus: Record<string, any>) {
  const name = campus.name ?? "";
  const state = campus.state ?? "";
  const site = campus.website_url ?? "";
  return `You are a meticulous research assistant. Goal: find PUBLIC class
schedule / registrar / course-offerings data for "${name}"${state ? `, ${state}` : ""}, USA, for the upcoming or most recent term.

USE GOOGLE SEARCH AGGRESSIVELY. Open the actual pages. Do not rely on memory.

Search BOTH the accounting department AND the business school class schedules.
At many schools, intro accounting is listed under the business-school prefix
(BUAD, BUS, BUSA, BUSN, BU, BA, BANA) — not ACCT. Try these prefixes when
looking for intro accounting: ACCT, ACC, ACCY, AC, BUAD, BUS, BUSA, BUSN, BU.

Capture sections for these course families (only if visible on a public page):
- intro_1            (Intro / Principles of Financial Accounting)
- intro_2            (Intro / Principles of Managerial Accounting)
- intermediate_1     (Intermediate Accounting I)
- intermediate_2     (Intermediate Accounting II)
- finance            (Principles of Finance / Business Finance)
- business_stats     (Business Statistics)
- business_analytics (Business Analytics)
- microeconomics
- macroeconomics
- other              (other accounting/business-core sections worth recording)

For EACH section, capture only what you actually see on a real public page.
NEVER hallucinate instructors, section numbers, class sizes, or meeting
times. If a field is not on the page, return null. If you cannot find any
public schedule data at all, return an empty sections array — that is OK.

Known context (for grounding only):
- Website: ${site || "unknown"}

Respond with ONLY a single JSON object (no prose, no markdown fences):

{
  "sections": [
    {
      "course_family": "intro_1"|"intro_2"|"intermediate_1"|"intermediate_2"|"finance"|"business_stats"|"business_analytics"|"microeconomics"|"macroeconomics"|"other",
      "course_code": string|null,
      "course_title": string|null,
      "term": string|null,
      "section_number": string|null,
      "instructor_name": string|null,
      "instructor_email": string|null,
      "meeting_days": string|null,
      "meeting_time": string|null,
      "location": string|null,
      "enrollment_current": number|null,
      "enrollment_capacity": number|null,
      "waitlist_count": number|null,
      "source_url": string|null,
      "confidence": "high"|"medium"|"low"
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

const str = (v: any): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const url = (v: any): string | null => (typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
const intOrNull = (v: any): number | null => {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= 0 && i < 100000 ? i : null;
};
const emailOrNull = (v: any): string | null => {
  const s = str(v);
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
};

function sanitize(raw: any) {
  const arr = Array.isArray(raw?.sections) ? raw.sections : [];
  const rows: any[] = [];
  const rejected: { reason: string; sample: any }[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") { rejected.push({ reason: "not_object", sample: s }); continue; }
    const course_family = VALID_FAMILY.has(s.course_family) ? s.course_family : null;
    const source_url = url(s.source_url);
    if (!course_family || !source_url) {
      rejected.push({ reason: !course_family ? "bad_family" : "missing_source_url", sample: s });
      continue;
    }
    rows.push({
      course_family,
      course_code: str(s.course_code),
      course_title: str(s.course_title),
      term: str(s.term),
      section_number: str(s.section_number),
      instructor_name: str(s.instructor_name),
      instructor_email: emailOrNull(s.instructor_email),
      meeting_days: str(s.meeting_days),
      meeting_time: str(s.meeting_time),
      location: str(s.location),
      enrollment_current: intOrNull(s.enrollment_current),
      enrollment_capacity: intOrNull(s.enrollment_capacity),
      waitlist_count: intOrNull(s.waitlist_count),
      source_url,
      confidence: VALID_CONF.has(s.confidence) ? s.confidence : "low",
      raw_payload: s,
    });
  }
  return { rows, rejected };
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

function familyTeachKey(f: string): string | null {
  if (f === "intro_1") return "teaches_intro_1";
  if (f === "intro_2") return "teaches_intro_2";
  if (f === "intermediate_1") return "teaches_intermediate_1";
  if (f === "intermediate_2") return "teaches_intermediate_2";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, website_url")
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
        "X-Lovable-AIG-SDK": "research-campus-sections",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (res.status === 429) return json({ success: false, error: "AI is rate-limited, try again in a moment" }, 429);
    if (res.status === 402) return json({ success: false, error: "Workspace AI credits exhausted" }, 402);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ success: false, error: "AI request failed", debug: { http_status: res.status, http_body: detail.slice(0, 2000) } }, 502);
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    text = choice?.message?.content ?? "";
    finishReason = choice?.finish_reason ?? null;
    usage = j?.usage ?? null;
  } catch (e) {
    return json({ success: false, error: "AI call failed", detail: String((e as Error)?.message ?? e) }, 500);
  }

  if (!text.trim()) {
    return json({
      success: true, campus_id,
      sections_inserted: 0, leads_updated: 0, leads_created: 0,
      sections: [],
      debug: { model: MODEL, finish_reason: finishReason, usage, raw_text: "", raw_text_chars: 0, note: "empty AI response" },
    });
  }

  let parsed: any;
  try { parsed = extractJson(text); } catch (e) {
    return json({
      success: true, campus_id,
      sections_inserted: 0, leads_updated: 0, leads_created: 0,
      sections: [],
      debug: { model: MODEL, finish_reason: finishReason, usage, raw_text: text.slice(0, 60000), raw_text_chars: text.length, parse_error: String((e as Error)?.message ?? e) },
    });
  }

  const { rows: cleaned, rejected } = sanitize(parsed);
  const sources = Array.from(new Set(cleaned.map((r) => r.source_url).filter(Boolean) as string[]));

  let inserted: any[] = [];
  if (cleaned.length) {
    const toInsert = cleaned.map((r) => ({ campus_id, ...r }));
    const { data: ins, error: insErr } = await db
      .from("campus_course_sections")
      .insert(toInsert)
      .select();
    if (insErr) {
      return json({
        success: false, error: "insert failed", detail: insErr.message,
        debug: { model: MODEL, raw_text_chars: text.length, rejected_count: rejected.length, sources, attempted: toInsert.length },
      }, 500);
    }
    inserted = ins ?? [];
  }

  // ---- Link instructors to lead suggestions ----
  let leads_updated = 0;
  let leads_created = 0;

  if (inserted.length) {
    const { data: existing } = await db
      .from("campus_lead_suggestions")
      .select("id, first_name, last_name, courses_found, teaches_intro_1, teaches_intro_2, teaches_intermediate_1, teaches_intermediate_2, teaching_evidence_url, teaching_evidence_notes")
      .eq("campus_id", campus_id);

    type SuggRow = {
      id: string; first_name: string | null; last_name: string | null;
      courses_found: any[] | null;
      teaches_intro_1: boolean; teaches_intro_2: boolean;
      teaches_intermediate_1: boolean; teaches_intermediate_2: boolean;
      teaching_evidence_url: string | null; teaching_evidence_notes: string | null;
    };

    const suggestions = (existing ?? []) as SuggRow[];
    const suggByName = new Map<string, SuggRow>();
    for (const s of suggestions) {
      const key = normalizeName(`${s.first_name ?? ""} ${s.last_name ?? ""}`);
      if (key) suggByName.set(key, s);
    }

    // Group sections by instructor
    const byInstructor = new Map<string, any[]>();
    for (const sec of inserted) {
      if (!sec.instructor_name) continue;
      const k = normalizeName(sec.instructor_name);
      if (!k) continue;
      const arr = byInstructor.get(k) ?? [];
      arr.push(sec);
      byInstructor.set(k, arr);
    }

    for (const [normName, secs] of byInstructor) {
      // Try to match by full-name containment in either direction
      let match: SuggRow | null = null;
      for (const [key, s] of suggByName) {
        if (key === normName || key.includes(normName) || normName.includes(key)) { match = s; break; }
      }

      const sampleSec = secs[0];
      const sectionCourses = secs.map((s) => ({
        course_code: s.course_code,
        course_title: s.course_title,
        course_family: s.course_family,
        term: s.term,
        section_number: s.section_number,
        source_url: s.source_url,
      }));
      const teachUpdates: Record<string, boolean> = {};
      for (const s of secs) {
        const k = familyTeachKey(s.course_family);
        if (k) teachUpdates[k] = true;
      }
      const firstAcctSec = secs.find((s) => familyTeachKey(s.course_family)) ?? sampleSec;

      if (match) {
        const existingCourses = Array.isArray(match.courses_found) ? match.courses_found : [];
        const dedupKey = (c: any) => `${c.course_code ?? ""}|${c.term ?? ""}|${c.section_number ?? ""}`;
        const seen = new Set(existingCourses.map(dedupKey));
        const merged = [...existingCourses];
        for (const c of sectionCourses) {
          if (!seen.has(dedupKey(c))) { merged.push(c); seen.add(dedupKey(c)); }
        }
        const patch: Record<string, unknown> = { courses_found: merged };
        for (const k of Object.keys(teachUpdates)) {
          if (!(match as any)[k]) patch[k] = true;
        }
        if (!match.teaching_evidence_url && firstAcctSec?.source_url) patch.teaching_evidence_url = firstAcctSec.source_url;
        if (!match.teaching_evidence_notes) patch.teaching_evidence_notes = "Confirmed via public class schedule.";

        const { error: upErr } = await db.from("campus_lead_suggestions").update(patch).eq("id", match.id);
        if (!upErr) leads_updated++;
      } else {
        // Build a new pending suggestion. Split name into first/last best-effort.
        const parts = sampleSec.instructor_name.trim().split(/\s+/);
        const first_name = parts.slice(0, -1).join(" ") || parts[0];
        const last_name = parts.length > 1 ? parts[parts.length - 1] : null;
        const newRow: Record<string, unknown> = {
          campus_id,
          status: "pending",
          lead_type: "professor",
          first_name,
          last_name,
          email: sampleSec.instructor_email,
          source_url: sampleSec.source_url,
          confidence: 0.6,
          notes: sampleSec.instructor_email
            ? "Instructor found in class schedule."
            : "Instructor found in class schedule; email not visible.",
          courses_found: sectionCourses,
          teaching_evidence_url: firstAcctSec?.source_url ?? null,
          teaching_evidence_notes: "Confirmed via public class schedule.",
          teaches_intro_1: !!teachUpdates.teaches_intro_1,
          teaches_intro_2: !!teachUpdates.teaches_intro_2,
          teaches_intermediate_1: !!teachUpdates.teaches_intermediate_1,
          teaches_intermediate_2: !!teachUpdates.teaches_intermediate_2,
        };
        const { error: insSuggErr } = await db.from("campus_lead_suggestions").insert(newRow);
        if (!insSuggErr) leads_created++;
      }
    }
  }

  return json({
    success: true,
    campus_id,
    sections_inserted: inserted.length,
    leads_updated,
    leads_created,
    sections: inserted,
    debug: {
      model: MODEL,
      finish_reason: finishReason,
      usage,
      raw_text_chars: text.length,
      raw_text: text.length > 60000 ? text.slice(0, 60000) + "…[truncated]" : text,
      rejected_count: rejected.length,
      rejected_samples: rejected.slice(0, 5),
      sources,
    },
  });
});
