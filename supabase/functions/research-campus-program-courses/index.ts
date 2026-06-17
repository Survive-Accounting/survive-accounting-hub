// research-campus-program-courses — narrow AI run for ONE campus.
// Fills only:
//   • campuses.accounting_department_name (program / school name)
//   • campuses.course_family_codes_json  ({ intro_1, intro_2, intermediate_1, intermediate_2 })
//   • campuses.course_family_titles_json ({ intro_1, intro_2, intermediate_1, intermediate_2 })
// No leads, no textbooks, no terms. Safe to re-run; only fills blank fields
// (pass `force: true` to overwrite).
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

const FAMILIES = [
  { key: "intro_1", label: "Intro 1 — Principles / Introduction to Financial Accounting" },
  { key: "intro_2", label: "Intro 2 — Principles / Introduction to Managerial Accounting" },
  { key: "intermediate_1", label: "Intermediate Accounting I" },
  { key: "intermediate_2", label: "Intermediate Accounting II" },
] as const;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function buildPrompt(school: string, state: string) {
  const lines = FAMILIES.map((f) => `  - "${f.key}" = ${f.label}`).join("\n");
  return `You are researching the undergraduate accounting program at "${school}"${state ? `, ${state}` : ""}, USA. USE GOOGLE SEARCH AGGRESSIVELY — open the actual accounting department / school of accountancy page, the registrar / catalog, and course schedule. NEVER guess.

Return THREE things:

1) The full official name of the accounting department / program. Examples:
   "School of Accountancy", "Department of Accounting", "Patterson School of Accountancy".
   If only the business school is named (no separate accounting unit), return the business school name.

2) For EACH of these four course families, the local course CODE used at this school (e.g. "ACCT 2101", "ACG 2021"):
${lines}

3) For EACH family, the official course TITLE as printed in the catalog (e.g. "Introduction to Financial Accounting", "Intermediate Accounting I").

RULES:
- Every non-null value must come from a real URL you actually opened.
- Course code formatting: keep the prefix and number exactly as the school writes it ("ACG 2021", "ACCT 2101", "ACCY 201"). No leading zeros, no extra punctuation.
- If you cannot confirm a family from a real source, return null for that family — do not guess.
- The program name is required; if you cannot find any accounting department / school name, set it to null.

Respond with ONLY a single JSON object, no prose, no markdown fences:

{
  "program_name": string | null,
  "program_source": string | null,
  "families": {
    "intro_1":        { "code": string | null, "title": string | null, "source": string | null } | null,
    "intro_2":        { "code": string | null, "title": string | null, "source": string | null } | null,
    "intermediate_1": { "code": string | null, "title": string | null, "source": string | null } | null,
    "intermediate_2": { "code": string | null, "title": string | null, "source": string | null } | null
  }
}`;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const a = cleaned.indexOf("{"), b = cleaned.lastIndexOf("}");
  if (a === -1 || b === -1 || b <= a) throw new Error("no JSON object in model output");
  const slice = cleaned.slice(a, b + 1);
  try { return JSON.parse(slice); }
  catch {
    return JSON.parse(slice.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""));
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: "Supabase env not configured" }, 500);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

  let body: { campus_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  const force = body.force === true;
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, accounting_department_name, course_family_codes_json, course_family_titles_json")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  const prompt = buildPrompt(campus.name ?? "", campus.state ?? "");

  let aiText = "";
  let parsed: any = null;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "research-campus-program-courses",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return json({ error: `AI HTTP ${res.status}`, detail: errText.slice(0, 400) }, 502);
    }
    const j = await res.json();
    aiText = j?.choices?.[0]?.message?.content ?? "";
    parsed = extractJson(aiText);
  } catch (e) {
    return json({ error: "AI call/parse failed", detail: String((e as Error)?.message ?? e), raw: aiText.slice(0, 400) }, 502);
  }

  const codesIn: Record<string, any> = (campus.course_family_codes_json && typeof campus.course_family_codes_json === "object")
    ? { ...(campus.course_family_codes_json as any) } : {};
  const titlesIn: Record<string, any> = (campus.course_family_titles_json && typeof campus.course_family_titles_json === "object")
    ? { ...(campus.course_family_titles_json as any) } : {};

  const familiesAdded: string[] = [];
  const familiesSkipped: string[] = [];
  const fams = parsed?.families && typeof parsed.families === "object" ? parsed.families : {};
  for (const f of FAMILIES) {
    const v = fams[f.key];
    if (!v || typeof v !== "object") { familiesSkipped.push(f.key); continue; }
    const code = str(v.code);
    const title = str(v.title);
    if (!code && !title) { familiesSkipped.push(f.key); continue; }
    if (!force && (str(codesIn[f.key]) || str(titlesIn[f.key]))) {
      // already set — leave alone unless force
      familiesSkipped.push(f.key);
      continue;
    }
    if (code) codesIn[f.key] = code;
    if (title) titlesIn[f.key] = title;
    familiesAdded.push(f.key);
  }

  const programName = str(parsed?.program_name);
  const patch: Record<string, unknown> = {
    course_family_codes_json: codesIn,
    course_family_titles_json: titlesIn,
  };
  const programWritten =
    !!programName && (force || !str(campus.accounting_department_name));
  if (programWritten) patch.accounting_department_name = programName;

  const { error: upErr } = await db.from("campuses").update(patch).eq("id", campus_id);
  if (upErr) return json({ error: "campus update failed", detail: upErr.message }, 500);

  return json({
    success: true,
    campus_id,
    program_name: programName,
    program_written: programWritten,
    families_added: familiesAdded,
    families_skipped: familiesSkipped,
    course_family_codes_json: codesIn,
    course_family_titles_json: titlesIn,
  });
});
