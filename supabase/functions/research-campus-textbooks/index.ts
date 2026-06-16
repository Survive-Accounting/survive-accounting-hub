// research-campus-textbooks — fills `campuses.course_family_textbooks_json`
// for ONE campus across the four core families. Two-stage:
//
//   1. ISBN → metadata enrichment via Google Books (free, no key).
//      Repairs UF-style entries where the AI only captured an ISBN and
//      left title / authors / publisher blank. Runs BEFORE and AFTER the
//      AI call so we never persist empty-shell entries again.
//   2. AI research (Lovable AI Gateway + google_search) for any family
//      that still has no signal after stage 1.
//
// Writes the MERGED json back to `campuses.course_family_textbooks_json`
// — never erases an existing family entry. Safe to run repeatedly.

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
  { key: "intro_1", label: "Intro 1 — Principles of Financial Accounting" },
  { key: "intro_2", label: "Intro 2 — Principles of Managerial Accounting" },
  { key: "intermediate_1", label: "Intermediate Accounting I" },
  { key: "intermediate_2", label: "Intermediate Accounting II" },
];

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

interface FamilyTextbook {
  title?: string | null;
  authors?: string | null;
  publisher?: string | null;
  isbn13?: string | null;
  source?: string | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

function hasMetadata(tb: FamilyTextbook | null | undefined): boolean {
  if (!tb) return false;
  return !!(str(tb.title) || str(tb.authors) || str(tb.publisher));
}
function hasAnySignal(tb: FamilyTextbook | null | undefined): boolean {
  if (!tb) return false;
  return !!(str(tb.title) || str(tb.authors) || str(tb.publisher) || str(tb.isbn13));
}
function normIsbn(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/[^0-9Xx]/g, "");
  return d.length >= 10 ? d : null;
}

/** Free Google Books lookup. Returns title/authors/publisher or null. */
async function lookupIsbn(isbn: string): Promise<{ title: string | null; authors: string | null; publisher: string | null; source: string } | null> {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = await res.json();
    const v = j?.items?.[0]?.volumeInfo;
    if (!v) return null;
    return {
      title: str(v.title) ?? null,
      authors: Array.isArray(v.authors) && v.authors.length ? v.authors.join(", ") : null,
      publisher: str(v.publisher) ?? null,
      source: `https://books.google.com/books?isbn=${isbn}`,
    };
  } catch {
    return null;
  }
}

async function enrichIsbnOnlyEntries(tb: Record<string, FamilyTextbook>): Promise<{ tb: Record<string, FamilyTextbook>; enriched: string[] }> {
  const enriched: string[] = [];
  for (const fam of FAMILIES.map((f) => f.key)) {
    const entry = tb[fam];
    if (!entry) continue;
    if (hasMetadata(entry)) continue;
    const isbn = normIsbn(entry.isbn13);
    if (!isbn) continue;
    const meta = await lookupIsbn(isbn);
    if (!meta) continue;
    tb[fam] = {
      ...entry,
      title: entry.title || meta.title,
      authors: entry.authors || meta.authors,
      publisher: entry.publisher || meta.publisher,
      isbn13: entry.isbn13,
      source: entry.source || meta.source,
    };
    enriched.push(fam);
  }
  return { tb, enriched };
}

function buildPrompt(school: string, state: string, knownCodes: string[], missing: string[]) {
  const familyLines = FAMILIES.filter((f) => missing.includes(f.key))
    .map((f) => `  - "${f.key}" = ${f.label}`)
    .join("\n");
  const known = knownCodes.length ? `\nCourse codes already on file: ${knownCodes.join(", ")}` : "";

  return `You are researching the required textbook for these undergraduate accounting course families at "${school}"${state ? `, ${state}` : ""}, USA. USE GOOGLE SEARCH AGGRESSIVELY — open the actual campus bookstore (e.g. bkstr.com), registrar / catalog, syllabi, and accounting department pages. NEVER guess.${known}

Find the CURRENT required textbook for each of these families:
${familyLines}

For EACH family you can confirm, return ALL FOUR fields: title, authors, publisher, AND isbn13. If you can only find an ISBN with no title/authors/publisher, that is acceptable — return the ISBN with empty strings for the other fields, and we will enrich it. But if you cannot find ANYTHING at all from a real source, return null for that family.

RULES:
1. NEVER fabricate. Every non-null family entry MUST have a "source" URL you actually opened.
2. Prefer campus bookstore listings (most current). Then catalog / syllabi.
3. Edition does not matter — report whichever edition the school currently uses.
4. Authors as a comma-separated string ("Wild, Shaw" or "Hanlon, Magee, Pfeiffer").
5. Publisher as the publisher name ("McGraw-Hill", "Wiley", "Cambridge Business Publishers").
6. isbn13 must be 13 digits, no dashes.

Respond with ONLY a single JSON object, no prose, no markdown fences:

{
  "families": {
${FAMILIES.filter((f) => missing.includes(f.key)).map((f) => `    "${f.key}": { "title": string|null, "authors": string|null, "publisher": string|null, "isbn13": string|null, "source": string|null } | null`).join(",\n")}
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

  let body: { campus_id?: string; force?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid JSON body" }, 400); }
  const campus_id = (body.campus_id ?? "").trim();
  const force = body.force === true;
  if (!campus_id) return json({ error: "campus_id required" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: campus, error: campusErr } = await db
    .from("campuses")
    .select("id, name, state, course_codes_json, course_family_textbooks_json")
    .eq("id", campus_id)
    .maybeSingle();
  if (campusErr) return json({ error: "campus lookup failed", detail: campusErr.message }, 500);
  if (!campus) return json({ error: "campus not found" }, 404);

  const current: Record<string, FamilyTextbook> =
    (campus.course_family_textbooks_json && typeof campus.course_family_textbooks_json === "object")
      ? { ...(campus.course_family_textbooks_json as any) }
      : {};

  // STAGE 1: enrich any ISBN-only entries already on file (fixes UF).
  const stage1 = await enrichIsbnOnlyEntries(current);
  const enrichedFromExisting = stage1.enriched;

  // Decide which families still need AI research.
  // Skip families that already have any signal (unless `force`).
  const missing = FAMILIES
    .map((f) => f.key)
    .filter((k) => force || !hasAnySignal(current[k]));

  let aiAttempted = false;
  let aiFamiliesAdded: string[] = [];
  let aiFailed: string | null = null;
  let enrichedFromAi: string[] = [];

  if (missing.length && LOVABLE_API_KEY) {
    aiAttempted = true;
    const codes: string[] = [];
    const cj = (campus.course_codes_json ?? {}) as Record<string, any>;
    for (const k of Object.keys(cj)) {
      const v = cj[k]?.local_course_code;
      if (typeof v === "string" && v.trim()) codes.push(v.trim());
    }
    const prompt = buildPrompt(campus.name ?? "", campus.state ?? "", codes, missing);
    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Lovable-API-Key": LOVABLE_API_KEY,
          "Content-Type": "application/json",
          "X-Lovable-AIG-SDK": "research-campus-textbooks",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          tools: [{ type: "google_search" }],
        }),
      });
      if (!res.ok) {
        aiFailed = `HTTP ${res.status}`;
      } else {
        const j = await res.json();
        const text = j?.choices?.[0]?.message?.content ?? "";
        const parsed = extractJson(text);
        const fams = parsed?.families && typeof parsed.families === "object" ? parsed.families : {};
        for (const key of missing) {
          const v = fams[key];
          if (!v || typeof v !== "object") continue;
          const entry: FamilyTextbook = {
            title: str(v.title),
            authors: str(v.authors),
            publisher: str(v.publisher),
            isbn13: str(v.isbn13),
            source: str(v.source),
          };
          if (!hasAnySignal(entry)) continue;
          current[key] = entry;
          aiFamiliesAdded.push(key);
        }
        // STAGE 1b: enrich any ISBN-only entries the AI just produced.
        const stage2 = await enrichIsbnOnlyEntries(current);
        enrichedFromAi = stage2.enriched;
      }
    } catch (e) {
      aiFailed = String((e as Error)?.message ?? e);
    }
  }

  // Persist merged JSON.
  const { error: upErr } = await db
    .from("campuses")
    .update({ course_family_textbooks_json: current })
    .eq("id", campus_id);
  if (upErr) return json({ error: "campus update failed", detail: upErr.message }, 500);

  return json({
    success: true,
    campus_id,
    families_now_present: Object.keys(current).filter((k) => hasAnySignal(current[k])),
    enriched_from_existing_isbn: enrichedFromExisting,
    ai_attempted: aiAttempted,
    ai_families_added: aiFamiliesAdded,
    ai_enriched_after: enrichedFromAi,
    ai_failed: aiFailed,
    textbooks: current,
  });
});
