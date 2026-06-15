// discover-campus-prefixes — one cheap Gemini call per campus to learn
// the school's actual course prefixes for each family, then cache the
// answer on campuses.discovered_course_prefixes. Used by
// research-campus-sections to make the per-family prompts much more
// accurate at non-USC schools.
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
  "intro_1", "intro_2", "intermediate_1", "intermediate_2",
  "finance", "business_stats", "business_analytics",
  "microeconomics", "macroeconomics",
];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function extractJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("no JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);

  let body: { campus_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: campus } = await db
    .from("campuses")
    .select("id, name, state, website_url, discovered_course_prefixes")
    .eq("id", campus_id)
    .maybeSingle();
  if (!campus) return json({ error: "campus not found" }, 404);

  if (!body.force && campus.discovered_course_prefixes && Object.keys(campus.discovered_course_prefixes).length) {
    return json({ success: true, cached: true, prefixes: campus.discovered_course_prefixes });
  }

  const prompt = `At "${campus.name}"${campus.state ? `, ${campus.state}` : ""} (USA), what course prefix(es) (department codes) does the school use for each of these course families? Use Google Search to verify on the actual school catalog or schedule.

Return ONLY this JSON object (no prose, no markdown):
{
  "intro_1": ["ACCT", "BUAD"],                  // Intro / Principles of Financial Accounting
  "intro_2": [...],                             // Intro / Principles of Managerial Accounting
  "intermediate_1": [...],                      // Intermediate Accounting I
  "intermediate_2": [...],                      // Intermediate Accounting II
  "finance": [...],                             // Principles of Finance / Business Finance
  "business_stats": [...],                      // Business Statistics
  "business_analytics": [...],                  // Business Analytics
  "microeconomics": [...],                      // Principles of Microeconomics
  "macroeconomics": [...]                       // Principles of Macroeconomics
}

Rules:
- Each value is an array of 1-3 most likely prefixes for THIS school. Empty array if the school clearly does not offer the family.
- Use the school's actual codes (e.g. ACCY, ACC, ACCT, BUAD, BUS, BA, FIN, FNCE, ECON, ECN, STAT, BANA, QBA, DSCI).
- Do not include the course number — just the letter prefix.
- Known context: website ${campus.website_url ?? "unknown"}.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Lovable-API-Key": LOVABLE_API_KEY,
      "Content-Type": "application/json",
      "X-Lovable-AIG-SDK": "discover-campus-prefixes",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      tools: [{ type: "google_search" }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return json({ success: false, error: "ai_http_error", status: res.status, detail: detail.slice(0, 500) }, 200);
  }
  const j = await res.json();
  const text = j?.choices?.[0]?.message?.content ?? "";
  let parsed: any;
  try { parsed = extractJson(text); } catch (e) {
    return json({ success: false, error: "parse_failed", detail: String(e), raw: text.slice(0, 500) }, 200);
  }

  const clean: Record<string, string[]> = {};
  for (const f of FAMILIES) {
    const arr = parsed?.[f];
    if (Array.isArray(arr)) {
      clean[f] = arr
        .filter((s: unknown): s is string => typeof s === "string")
        .map((s) => s.trim().toUpperCase().replace(/[^A-Z]/g, ""))
        .filter((s) => s.length >= 1 && s.length <= 6);
    }
  }

  await db.from("campuses").update({ discovered_course_prefixes: clean }).eq("id", campus_id);

  return json({ success: true, cached: false, prefixes: clean });
});
