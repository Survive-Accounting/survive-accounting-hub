// research-campus-sections — Phase 4C: Class Schedule Intelligence.
//
// Per-family fan-out: one AI call per course family with strict
// "enumerate every section" instructions. Persists rows to
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

type Family =
  | "intro_1" | "intro_2" | "intermediate_1" | "intermediate_2"
  | "finance" | "business_stats" | "business_analytics"
  | "microeconomics" | "macroeconomics";

const ALL_FAMILIES: Family[] = [
  "intro_1", "intro_2", "intermediate_1", "intermediate_2",
  "finance", "business_stats", "business_analytics",
  "microeconomics", "macroeconomics",
];

const VALID_FAMILY = new Set<string>([...ALL_FAMILIES, "other"]);
const VALID_CONF = new Set(["high", "medium", "low"]);

const FAMILY_HINTS: Record<Family, { label: string; prefixes: string[]; examples: string }> = {
  intro_1: {
    label: "Intro / Principles of Financial Accounting",
    prefixes: ["ACCT", "ACC", "ACCY", "AC", "BUAD", "BUS", "BUSA", "BUSN", "BU", "BA"],
    examples: "e.g. ACCT 201, ACCY 200, BUAD 280, BUS 215, BA 211",
  },
  intro_2: {
    label: "Intro / Principles of Managerial Accounting",
    prefixes: ["ACCT", "ACC", "ACCY", "AC", "BUAD", "BUS", "BUSA", "BUSN", "BU", "BA"],
    examples: "e.g. ACCT 202, ACCY 201, BUAD 281, BUS 216, BA 213",
  },
  intermediate_1: {
    label: "Intermediate Accounting I",
    prefixes: ["ACCT", "ACC", "ACCY", "AC"],
    examples: "e.g. ACCT 301, ACCY 303, ACCT 370",
  },
  intermediate_2: {
    label: "Intermediate Accounting II",
    prefixes: ["ACCT", "ACC", "ACCY", "AC"],
    examples: "e.g. ACCT 302, ACCY 304, ACCT 385",
  },
  finance: {
    label: "Principles of Finance / Business Finance",
    prefixes: ["FIN", "FNCE", "BUAD", "BUS", "BA"],
    examples: "e.g. FIN 300, BUAD 306",
  },
  business_stats: {
    label: "Business Statistics",
    prefixes: ["STAT", "STATS", "BUAD", "BUS", "BA", "QBA", "OPIM", "DSCI"],
    examples: "e.g. STAT 301, BUAD 310, QBA 237",
  },
  business_analytics: {
    label: "Business Analytics",
    prefixes: ["BUAD", "BUS", "BA", "BANA", "BUSA", "DSCI", "OPIM", "ISDS", "MIS"],
    examples: "e.g. BUAD 311, BANA 200, DSCI 311",
  },
  microeconomics: {
    label: "Principles of Microeconomics",
    prefixes: ["ECON", "ECN", "EC"],
    examples: "e.g. ECON 203, ECON 201",
  },
  macroeconomics: {
    label: "Principles of Macroeconomics",
    prefixes: ["ECON", "ECN", "EC"],
    examples: "e.g. ECON 205, ECON 202",
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function buildFamilyPrompt(campus: Record<string, any>, family: Family, strict = false, overridePrefixes?: string[]): string {
  const name = campus.name ?? "";
  const state = campus.state ?? "";
  const site = campus.website_url ?? "";
  const h = FAMILY_HINTS[family];
  const prefixes = (overridePrefixes && overridePrefixes.length) ? overridePrefixes : h.prefixes;
  const prefixLine = (overridePrefixes && overridePrefixes.length)
    ? `KNOWN course prefixes at THIS school for this family: ${prefixes.join(", ")} (verified by prior research — focus on these first).`
    : `Likely course prefixes at this school: ${prefixes.join(", ")} (${h.examples}).`;
  return `You are a meticulous research assistant. Goal: find PUBLIC class
schedule / registrar / course-offerings data for "${name}"${state ? `, ${state}` : ""}, USA, for the upcoming or most recent term.

TARGET COURSE FAMILY: ${family} — ${h.label}.
${prefixLine}
Many schools list intro accounting under the business-school prefix (BUAD/BUS/BA) — do NOT skip those.
Skip any URL that requires login (sign-in walls, SSO, student portals). Public catalog and public schedule pages only.

USE GOOGLE SEARCH AGGRESSIVELY. Open the actual schedule pages. Search the
school's class schedule / registrar (e.g. classes.usc.edu, courses.<school>.edu,
schedule.<school>.edu, marshall.usc.edu/courses, business-school course pages,
banner schedule pages). Do not rely on memory.

CRITICAL — ENUMERATE EVERY SECTION ROW:
- If the schedule page lists 13 sections of the target course, return 13
  entries — one entry per unique section_number.
- DO NOT SUMMARIZE. DO NOT RETURN ONLY THE FIRST 1-3.
- Each entry must have a non-null section_number (e.g. "14505", "001", "A").
- If you cannot enumerate ALL rows from the page, return an empty array
  rather than a partial sample. Missing data is OK; a partial sample is NOT.
- Capture both lecture and discussion/lab sections if both have a distinct
  instructor + section number, but a single course with multiple sections
  means multiple entries.
${strict ? `
RETRY MODE — be even more thorough. Try alternate URLs:
- classes.<domain>, courses.<domain>, schedule.<domain>, registrar.<domain>
- the business school site directly
- "site:<domain> ${h.prefixes[0]} section" Google queries
Do NOT give up after one search. Try at least 3 different queries.
` : ""}

For EACH section, capture only what you actually see on a real public page.
NEVER hallucinate instructors, section numbers, class sizes, or meeting
times. If a field is not on the page, return null. Exclude Rate My Professors
and login-walled pages.

Known context:
- Website: ${site || "unknown"}

Respond with ONLY a single JSON object (no prose, no markdown fences):

{
  "sections": [
    {
      "course_family": "${family}",
      "course_code": string,
      "course_title": string|null,
      "term": string|null,
      "section_number": string,
      "instructor_name": string|null,
      "instructor_email": string|null,
      "meeting_days": string|null,
      "meeting_time": string|null,
      "location": string|null,
      "enrollment_current": number|null,
      "enrollment_capacity": number|null,
      "waitlist_count": number|null,
      "source_url": string,
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

function sanitize(raw: any, expectedFamily: Family) {
  const arr = Array.isArray(raw?.sections) ? raw.sections : [];
  const rows: any[] = [];
  const rejected: { reason: string; sample: any }[] = [];
  for (const s of arr) {
    if (!s || typeof s !== "object") { rejected.push({ reason: "not_object", sample: s }); continue; }
    const fam = VALID_FAMILY.has(s.course_family) ? s.course_family : expectedFamily;
    const source_url = url(s.source_url);
    const section_number = str(s.section_number);
    const course_code = str(s.course_code);
    if (!source_url) { rejected.push({ reason: "missing_source_url", sample: s }); continue; }
    if (!section_number) { rejected.push({ reason: "missing_section_number", sample: s }); continue; }
    if (!course_code) { rejected.push({ reason: "missing_course_code", sample: s }); continue; }
    rows.push({
      course_family: fam,
      course_code,
      course_title: str(s.course_title),
      term: str(s.term),
      section_number,
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

async function callAi(prompt: string): Promise<{ text: string; finishReason: string | null; usage: any; httpStatus: number; httpBody?: string }> {
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
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { text: "", finishReason: null, usage: null, httpStatus: res.status, httpBody: detail.slice(0, 2000) };
  }
  const j = await res.json();
  const choice = j?.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
    usage: j?.usage ?? null,
    httpStatus: res.status,
  };
}

async function researchFamily(campus: Record<string, any>, family: Family) {
  const debug: any = { family, attempts: [] as any[] };
  let cleaned: any[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = buildFamilyPrompt(campus, family, attempt > 0);
    const { text, finishReason, usage, httpStatus, httpBody } = await callAi(prompt);
    const att: any = { strict: attempt > 0, http_status: httpStatus, finish_reason: finishReason, usage, raw_text_chars: text.length };
    if (httpStatus === 429 || httpStatus === 402) {
      att.error = httpStatus === 429 ? "rate_limited" : "credits_exhausted";
      att.http_body = httpBody;
      debug.attempts.push(att);
      break;
    }
    if (!httpStatus || httpStatus >= 400) {
      att.error = "ai_http_error";
      att.http_body = httpBody;
      debug.attempts.push(att);
      continue;
    }
    if (!text.trim()) {
      att.note = "empty_response";
      debug.attempts.push(att);
      continue;
    }
    let parsed: any;
    try { parsed = extractJson(text); } catch (e) {
      att.parse_error = String((e as Error)?.message ?? e);
      att.raw_text_sample = text.slice(0, 1000);
      debug.attempts.push(att);
      continue;
    }
    const { rows, rejected } = sanitize(parsed, family);
    att.returned = rows.length;
    att.rejected_count = rejected.length;
    att.rejected_samples = rejected.slice(0, 3);
    att.sources = Array.from(new Set(rows.map((r) => r.source_url)));
    debug.attempts.push(att);
    if (rows.length > 0) {
      cleaned = rows;
      break;
    }
  }

  debug.final_count = cleaned.length;
  return { cleaned, debug };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);

  let body: { campus_id?: string; families?: string[] };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const requestedFamilies: Family[] = Array.isArray(body.families) && body.families.length
    ? (body.families.filter((f) => (ALL_FAMILIES as string[]).includes(f)) as Family[])
    : ALL_FAMILIES;

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, website_url")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  // Per-family fan-out (sequential to keep load + cost predictable).
  const perFamily: Record<string, any> = {};
  const allCleaned: any[] = [];
  for (const fam of requestedFamilies) {
    const { cleaned, debug } = await researchFamily(campus, fam);
    perFamily[fam] = debug;
    for (const row of cleaned) allCleaned.push(row);
  }

  // De-dupe within this run by (course_code, section_number, term).
  const seen = new Set<string>();
  const deduped: any[] = [];
  for (const r of allCleaned) {
    const key = `${(r.course_code ?? "").toLowerCase()}|${(r.section_number ?? "").toLowerCase()}|${(r.term ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  let upserted: any[] = [];
  if (deduped.length) {
    const toInsert = deduped.map((r) => ({ campus_id, ...r }));
    // Upsert against the (campus_id, course_code, section_number, term) unique index.
    const { data: ins, error: insErr } = await db
      .from("campus_course_sections")
      .upsert(toInsert, { onConflict: "campus_id,course_code,section_number,term" })
      .select();
    if (insErr) {
      return json({
        success: false, error: "insert failed", detail: insErr.message,
        debug: { model: MODEL, per_family: perFamily, attempted: toInsert.length },
      }, 500);
    }
    upserted = ins ?? [];
  }

  // ---- Link instructors to lead suggestions ----
  let leads_updated = 0;
  let leads_created = 0;

  if (upserted.length) {
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

    const byInstructor = new Map<string, any[]>();
    for (const sec of upserted) {
      if (!sec.instructor_name) continue;
      const k = normalizeName(sec.instructor_name);
      if (!k) continue;
      const arr = byInstructor.get(k) ?? [];
      arr.push(sec);
      byInstructor.set(k, arr);
    }

    for (const [normName, secs] of byInstructor) {
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
        const seenC = new Set(existingCourses.map(dedupKey));
        const merged = [...existingCourses];
        for (const c of sectionCourses) {
          if (!seenC.has(dedupKey(c))) { merged.push(c); seenC.add(dedupKey(c)); }
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

  // Per-family counts of what made it into the DB this run.
  const perFamilyCounts: Record<string, number> = {};
  for (const r of upserted) {
    const f = r.course_family ?? "other";
    perFamilyCounts[f] = (perFamilyCounts[f] ?? 0) + 1;
  }

  return json({
    success: true,
    campus_id,
    families: requestedFamilies,
    sections_inserted: upserted.length,
    leads_updated,
    leads_created,
    sections: upserted,
    debug: {
      model: MODEL,
      per_family: perFamily,
      per_family_counts: perFamilyCounts,
    },
  });
});
