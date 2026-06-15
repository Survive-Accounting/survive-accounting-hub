// research-campus — AI-assisted campus research for the Approve Campus modal.
//
// Calls Lovable AI Gateway (google/gemini-3-flash-preview) with the
// google_search grounding tool so the model can actually browse the catalog,
// department, and bookstore pages instead of hallucinating from training data.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = Deno.env.get("RESEARCH_MODEL") ?? "google/gemini-3-flash-preview";

type Confidence = "high" | "medium" | "low";

const FAMILIES = [
  { key: "intro_1", label: "Intro 1 — Financial Accounting Principles", ourBook: "McGraw Hill — Financial and Managerial Accounting (Wild/Shaw)" },
  { key: "intro_2", label: "Intro 2 — Managerial Accounting Principles", ourBook: "McGraw Hill — Financial and Managerial Accounting (Wild/Shaw)" },
  { key: "intermediate_1", label: "Intermediate Accounting I", ourBook: "Wiley — Intermediate Accounting, Kieso/Weygandt/Warfield" },
  { key: "intermediate_2", label: "Intermediate Accounting II", ourBook: "Wiley — Intermediate Accounting, Kieso/Weygandt/Warfield" },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function buildPrompt(school: string, state: string, knownCodes: string[]) {
  const familyLines = FAMILIES.map(
    (f) => `  - "${f.key}" = ${f.label}. The textbook WE support for this course is: ${f.ourBook}`,
  ).join("\n");
  const known = knownCodes.length ? `\nCourse codes already on file (may be partial/unverified): ${knownCodes.join(", ")}` : "";

  return `You are researching the undergraduate accounting program at "${school}" in ${state}, USA, to help a tutoring business decide how to reach its students. USE GOOGLE SEARCH AGGRESSIVELY — open the actual catalog, registrar, department, and bookstore pages. Do not rely on memory.${known}

Find these four course families and, for each, the catalog course code, the official course title, the REQUIRED textbook currently used, AND which academic terms the course is typically offered in (Fall / Spring / Summer):

${familyLines}

For the textbook of each family, decide a status by comparing what the school uses to the textbook WE support (shown above):
  - "matches"   = the school uses the same textbook (same publisher + author family; edition differences still count as a match)
  - "different"  = the school uses a clearly different textbook
  - "not_found"  = you could not determine the textbook from any source

For COURSE OFFERING TERMS, look at the course catalog / degree plan / registrar / accounting department / business school pages. Catalogs often state phrases like "Fall or Spring", "Fall, Spring, and Summer", "Offered Irregularly", "Every Other Spring", etc. Capture the literal phrasing in terms_text AND set the three booleans (offered_fall / offered_spring / offered_summer). If you cannot confidently determine offering terms, return null for terms_text and null for all three booleans — do NOT guess.

Prefer, in order: the university's official course catalog / bulletin / registrar, the academic department page, the campus bookstore (e.g. bkstr.com / school store), then verified syllabi. ISBNs: only report an ISBN-13 you actually have a source for; default their confidence to "low" or "medium" unless it came straight from the bookstore listing.

ABSOLUTE RULES:
1. NEVER guess or fabricate. If you do not have a real source for a value, return null. A blank is correct and useful; an invented value is harmful.
2. Confidence reflects SOURCE QUALITY, not your feeling:
   - "high"   = stated explicitly on an official/authoritative source (catalog, registrar, department, bookstore).
   - "medium" = found, but on a secondary source, an older page, or requiring light inference.
   - "low"    = found something weak/ambiguous/conflicting that a human must verify.
3. Every non-null value MUST include a "source" URL. No URL => return null instead.
4. Do not assume all four families exist or are numbered like a template. Report only what the catalog shows.

Respond with ONLY a single JSON object, no prose and no markdown fences, in EXACTLY this shape (use null for any value not found; confidence is always one of "high"|"medium"|"low"):

{
  "program": { "value": string|null, "confidence": "high"|"medium"|"low", "source": string|null },
  "families": {
    "intro_1":        { "code": {"value":string|null,"confidence":...,"source":string|null}, "title": {"value":string|null,"confidence":...,"source":string|null}, "textbook_status": {"value":"matches"|"different"|"not_found"|null,"confidence":...,"source":string|null}, "book": {"isbn13":string|null,"title":string|null,"authors":string|null,"publisher":string|null,"confidence":...,"source":string|null}, "terms": {"terms_text":{"value":string|null,"confidence":...,"source":string|null}, "offered_fall": true|false|null, "offered_spring": true|false|null, "offered_summer": true|false|null} },
    "intro_2":        { ...same shape... },
    "intermediate_1": { ...same shape... },
    "intermediate_2": { ...same shape... }
  }
}`;
}

const VALID_CONF = new Set<Confidence>(["high", "medium", "low"]);
const VALID_STATUS = new Set(["matches", "different", "not_found"]);

function sanitize(raw: any) {
  const conf = (c: any): Confidence => (VALID_CONF.has(c) ? c : "low");
  const field = (f: any) =>
    f && typeof f === "object"
      ? { value: typeof f.value === "string" && f.value.trim() ? f.value.trim() : null, confidence: conf(f.confidence), source: typeof f.source === "string" && f.source.startsWith("http") ? f.source : null }
      : { value: null, confidence: "low" as Confidence, source: null };

  const families: Record<string, unknown> = {};
  for (const f of FAMILIES) {
    const r = raw?.families?.[f.key] ?? {};
    const status = r?.textbook_status ?? {};
    const book = r?.book ?? {};
    const str = (v: any) => (typeof v === "string" && v.trim() ? v.trim() : null);
    families[f.key] = {
      code: field(r.code),
      title: field(r.title),
      textbook_status: {
        value: VALID_STATUS.has(status?.value) ? status.value : null,
        confidence: conf(status?.confidence),
        source: typeof status?.source === "string" && status.source.startsWith("http") ? status.source : null,
      },
      book: {
        isbn13: str(book?.isbn13),
        title: str(book?.title),
        authors: str(book?.authors),
        publisher: str(book?.publisher),
        confidence: conf(book?.confidence),
        source: typeof book?.source === "string" && book.source.startsWith("http") ? book.source : null,
      },
    };
  }
  return { program: field(raw?.program), families };
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not set" }, 500);

  let body: { school_name?: string; state?: string; course_codes?: string[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const school = (body.school_name ?? "").trim();
  const state = (body.state ?? "").trim() || "the United States";
  const knownCodes = Array.isArray(body.course_codes) ? body.course_codes.filter((c) => typeof c === "string" && c.trim()) : [];
  if (!school) return json({ error: "school_name required" }, 400);

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Lovable-API-Key": LOVABLE_API_KEY,
        "Content-Type": "application/json",
        "X-Lovable-AIG-SDK": "research-campus",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: buildPrompt(school, state, knownCodes) }],
        tools: [{ type: "google_search" }],
      }),
    });
    if (res.status === 429) {
      return json({ error: "AI is rate-limited, try again in a moment" }, 429);
    }
    if (res.status === 402) {
      return json({ error: "Workspace AI credits exhausted — add credits in Settings → Workspace → Usage" }, 402);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return json({ error: "AI request failed", status: res.status, detail: detail.slice(0, 800) }, 502);
    }
    const j = await res.json();
    const choice = j?.choices?.[0];
    const text: string = choice?.message?.content ?? "";
    const finishReason: string | undefined = choice?.finish_reason;
    if (!text.trim()) return json({ error: "empty model response" }, 502);
    if (finishReason === "length") {
      return json({ error: "AI response was truncated — try again" }, 502);
    }
    let parsed: any;
    try {
      parsed = extractJson(text);
    } catch (e) {
      return json({ error: "AI returned malformed JSON — try again", detail: String((e as Error)?.message ?? e) }, 502);
    }
    const result = sanitize(parsed);
    return json({ ok: true, school_name: school, result });
  } catch (e) {
    return json({ error: "research failed", detail: String((e as Error)?.message ?? e) }, 500);
  }
});
