// Per-campus faculty page scraper, powered by Firecrawl.
// Two entry points:
//   - scrapeCampusFaculty: given explicit URLs, Firecrawl-scrape each, then
//     ask the AI to extract real faculty entries (no email pattern-guessing).
//   - autoDiscoverCampusFaculty: use Firecrawl Map against the campus website
//     to discover faculty/directory pages, then run the same scrape+extract.
// Results land in campus_lead_suggestions with research_mode='faculty_scrape'
// and status='pending' for human review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  detectProgramLevels,
  mergeDetections,
  EMPTY_DETECTION,
  type ProgramLevelDetection,
} from "@/lib/program-levels";

// ---- Network hardening -----------------------------------------------------
// Every outbound fetch (Firecrawl + AI gateway) has a hard timeout so a single
// hung upstream call can't pin a background scrape forever. Timeouts are tuned
// per call type: scrapes/AI are slowest, search/map are fastest.
const FIRECRAWL_SCRAPE_TIMEOUT_MS = 60_000;
const FIRECRAWL_MAP_TIMEOUT_MS = 45_000;
const FIRECRAWL_SEARCH_TIMEOUT_MS = 45_000;
const AI_TIMEOUT_MS = 90_000;
const AI_PDF_TIMEOUT_MS = 180_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") {
      throw new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new Error(`${label} failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

// Turn upstream HTTP/AI errors into short human-readable strings.
function slickHttpError(label: string, status: number, body: string): string {
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  if (status === 401 || status === 403) return `${label} auth error (${status}). Check API key.`;
  if (status === 402) return `${label} out of credits (402).`;
  if (status === 404) return `${label}: page not found (404).`;
  if (status === 408 || status === 504) return `${label} upstream timeout (${status}).`;
  if (status === 429) return `${label} rate-limited (429). Try again shortly.`;
  if (status >= 500) return `${label} server error (${status}).`;
  return `${label} ${status}${snippet ? `: ${snippet}` : ""}`;
}

const ScrapeInputSchema = z.object({
  campusId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(10),
});

const DiscoverInputSchema = z.object({
  campusId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(10).default(5),
});

const PdfInputSchema = z.object({
  campusId: z.string().uuid(),
  filename: z.string().min(1).max(200),
  // base64-encoded PDF bytes (without data: prefix). Cap ~12MB encoded.
  fileBase64: z.string().min(100).max(16_000_000),
});

type Extracted = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  profile_url: string | null;
  is_phd: boolean;
  is_cpa: boolean;
};

// Path segments (between slashes) that strongly indicate a faculty roster page.
const STRONG_PATH_TOKENS = ["faculty", "faculty-and-staff", "faculty-staff", "directory", "people", "our-people", "our-team", "team", "staff", "instructors"];
// Soft signals — used to break ties between otherwise-equal pages.
const SOFT_TOKENS = ["accountancy", "accounting", "school-of-accountancy", "soa"];
// Always-skip patterns. egrove = Ole Miss publication archive that polluted
// our earlier picks; news/blog/event/etc. are never staff rosters.
const HARD_EXCLUDE = [
  ".pdf", "/news", "/event", "/blog", "/calendar", "/alumni",
  "/donate", "/giving", "/give", "/apply", "/admission",
  "/syllabus", "egrove.olemiss.edu", "/cgi/", "viewcontent",
  "/research", "/publication", "/cite",
];
// 4-digit year in path (e.g. /2024/, /2007-2008) = archived directory PDFs.
const YEAR_RE = /\/(?:19|20)\d{2}(?:[-_/]|$)/;
const TEACHING_TITLE_RE = /\b(professor|instructor|lecturer|adjunct|clinical|teaching|faculty|dean|chair|practice|visiting)\b/i;
const PROFILE_ENRICH_LIMIT = 60;

// Credential detection — used both to flag the row and to strip trailing
// credentials from displayed names ("Jane Doe, PhD, CPA" → "Jane Doe").
const PHD_RE = /\b(Ph\.?\s?D\.?|D\.?B\.?A\.?|Ed\.?D\.?|D\.?Phil\.?|Doctorate|J\.?S\.?D\.?)\b/i;
const CPA_RE = /\bC\.?\s?P\.?\s?A\.?\b/i;
const CREDENTIAL_TAIL_RE = /[,\s]+(?:Ph\.?\s?D\.?|D\.?B\.?A\.?|Ed\.?D\.?|D\.?Phil\.?|J\.?S\.?D\.?|C\.?\s?P\.?\s?A\.?|M\.?B\.?A\.?|M\.?S\.?|M\.?Acc\.?|J\.?D\.?|Esq\.?|CFA|CMA|CIA|CFP|CFE|EA)\.?\s*$/i;

function stripCredentials(raw: string): string {
  let s = raw.trim();
  // Repeatedly strip trailing credentials separated by comma/space.
  for (let i = 0; i < 6; i++) {
    const next = s.replace(CREDENTIAL_TAIL_RE, "").trim();
    if (next === s) break;
    s = next;
  }
  return s.replace(/[,\s]+$/, "").trim();
}

function detectCredentials(...sources: Array<string | null | undefined>): { is_phd: boolean; is_cpa: boolean } {
  const haystack = sources.filter(Boolean).join(" | ");
  return { is_phd: PHD_RE.test(haystack), is_cpa: CPA_RE.test(haystack) };
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/index\.php$/i, "").replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw.trim();
  }
}

function splitName(fullName: string): { first_name: string; last_name: string } | null {
  const cleaned = stripCredentials(fullName.replace(/\s+/g, " ").trim());
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length < 2) return null;
  return { first_name: parts.slice(0, -1).join(" "), last_name: parts.at(-1) ?? "" };
}

function extractDirectoryMarkdownPeople(pageText: string): Extracted[] {
  const headingLink = /^#{2,4}\s+\[([^\]]+)]\((https?:\/\/[^)]+)\)\s*$/gim;
  const matches = Array.from(pageText.matchAll(headingLink));
  const people: Extracted[] = [];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const rawName = (match[1] ?? "").trim();
    const profileUrl = normalizeUrl(match[2] ?? "");
    const parsedName = splitName(rawName);
    if (!parsedName || !profileUrl) continue;

    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? Math.min(pageText.length, start + 800);
    const block = pageText.slice(start, end);
    const title = block.match(/^\s*-\s+(.+?)\s*$/m)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
    if (title && !TEACHING_TITLE_RE.test(title)) continue;

    const creds = detectCredentials(rawName, title);
    people.push({ ...parsedName, title, email: null, profile_url: profileUrl, ...creds });
  }

  return people;
}

function extractBestEmail(pageText: string): string | null {
  const emails = Array.from(new Set(pageText.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []))
    .map((e) => e.toLowerCase())
    .filter((e) => !/^(info|contact|admissions|support|webmaster|umaccy)@/i.test(e));
  return emails[0] ?? null;
}

function mergePeople(...groups: Extracted[][]): Extracted[] {
  const byKey = new Map<string, Extracted>();
  for (const person of groups.flat()) {
    const key = person.email ?? person.profile_url ?? `${person.first_name}|${person.last_name}`.toLowerCase();
    const existing = byKey.get(key);
    byKey.set(key, {
      first_name: existing?.first_name || person.first_name,
      last_name: existing?.last_name || person.last_name,
      title: person.title || existing?.title || null,
      email: person.email || existing?.email || null,
      profile_url: person.profile_url || existing?.profile_url || null,
      is_phd: !!(existing?.is_phd || person.is_phd),
      is_cpa: !!(existing?.is_cpa || person.is_cpa),
    });
  }
  return Array.from(byKey.values());
}

async function enrichProfileEmails(fcKey: string, people: Extracted[], sourceUrl: string): Promise<Extracted[]> {
  let enriched = 0;
  const out: Extracted[] = [];
  const sourceKey = normalizeUrl(sourceUrl);

  for (const person of people) {
    if (person.email || !person.profile_url || normalizeUrl(person.profile_url) === sourceKey || enriched >= PROFILE_ENRICH_LIMIT) {
      out.push(person);
      continue;
    }
    try {
      const profileText = await firecrawlScrape(fcKey, person.profile_url);
      const email = extractBestEmail(profileText);
      // Profile pages often disclose credentials the index page hid.
      const profileCreds = detectCredentials(profileText.slice(0, 4000));
      out.push({
        ...person,
        email: email ?? person.email,
        is_phd: person.is_phd || profileCreds.is_phd,
        is_cpa: person.is_cpa || profileCreds.is_cpa,
      });
      enriched++;
    } catch {
      out.push(person);
    }
  }

  return out;
}

function rankFacultyUrls(links: string[]): string[] {
  const scored = links
    .map((u) => {
      const normalized = normalizeUrl(u);
      const lo = normalized.toLowerCase();
      if (HARD_EXCLUDE.some((x) => lo.includes(x))) return { u, score: -999 };
      if (YEAR_RE.test(lo)) return { u, score: -999 };

      let path = "";
      try { path = new URL(normalized).pathname.toLowerCase(); } catch { return { u, score: -999 }; }
      const segments = path.split("/").filter(Boolean);

      let score = 0;
      // Big boost for an exact path segment match (e.g. /faculty/, /people/)
      for (const seg of segments) {
        if (STRONG_PATH_TOKENS.includes(seg)) score += 10;
      }
      // Soft signal for accounting/accountancy anywhere in URL
      for (const t of SOFT_TOKENS) if (lo.includes(t)) score += 2;
      if (/faculty[-/]and[-/]staff/.test(lo)) score += 8;
      // Penalize URLs that are *just* a homepage with no useful path
      if (segments.length === 0) score -= 3;
      // Penalize very deep individual profile URLs — we want roster pages
      if (segments.length > 4) score -= 2;
      return { u: normalized, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const { u } of scored) {
    try {
      const key = new URL(u).pathname.replace(/\/+$/, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(u);
    } catch { /* skip bad URL */ }
  }
  return out;
}

async function firecrawlSearch(apiKey: string, query: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 10 }),
    },
    FIRECRAWL_SEARCH_TIMEOUT_MS,
    "Firecrawl search",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl search", res.status, body));
  }
  const json = await res.json() as {
    data?: { web?: Array<{ url: string }> } | Array<{ url: string }>;
    web?: Array<{ url: string }>;
  };
  const web = Array.isArray(json.data) ? json.data : (json.data?.web ?? json.web ?? []);
  return web.map((r) => r.url).filter(Boolean);
}

async function firecrawlScrape(apiKey: string, url: string): Promise<string> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    },
    FIRECRAWL_SCRAPE_TIMEOUT_MS,
    "Firecrawl scrape",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl scrape", res.status, body));
  }
  const json = await res.json() as { data?: { markdown?: string }; markdown?: string };
  return json.data?.markdown ?? json.markdown ?? "";
}

async function firecrawlMap(apiKey: string, url: string, search: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v2/map",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ url, search, limit: 200, includeSubdomains: true }),
    },
    FIRECRAWL_MAP_TIMEOUT_MS,
    "Firecrawl map",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("Firecrawl map", res.status, body));
  }
  const json = await res.json() as { links?: Array<string | { url: string }>; data?: { links?: Array<string | { url: string }> } };
  const raw = json.links ?? json.data?.links ?? [];
  return raw.map((l) => (typeof l === "string" ? l : l.url)).filter(Boolean);
}

async function callLovableAi(apiKey: string, sourceUrl: string, pageText: string): Promise<Extracted[]> {
  const truncated = pageText.length > 60000 ? pageText.slice(0, 60000) : pageText;
  const system =
    "You extract faculty/instructor/lecturer/adjunct directory entries from accounting department web pages. " +
    "RULES: " +
    "1. ONLY emit a person if their full name appears verbatim in the provided text. " +
    "2. NEVER invent or pattern-guess an email. If no email appears in the text for that person, set email to null. " +
    "3. Capture every teaching role: Professor, Associate/Assistant Professor, Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, Visiting. " +
    "4. Exclude clearly non-accounting faculty (finance, economics, marketing, IS, etc.) unless the page explicitly lists them under accounting. " +
    "5. Exclude purely administrative staff with no teaching title (e.g. Department Coordinator, Office Manager) unless their title contains an instructional keyword. " +
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url, is_phd, is_cpa }] }. " +
    "7. profile_url should be an absolute URL when the source links to a personal profile page; otherwise null. " +
    "8. is_phd = true if the person's name, title, or bio shows a doctorate credential (PhD, Ph.D., DBA, EdD, DPhil, JSD, or 'Doctorate'). Otherwise false. " +
    "9. is_cpa = true if their name, title, or bio shows the CPA credential (CPA or C.P.A.). Otherwise false. " +
    "10. Do NOT include credentials (PhD, CPA, MBA, JD, Esq., etc.) inside first_name or last_name — return the clean human name only.";

  const user = `Source URL: ${sourceUrl}\n\nPage content (markdown):\n${truncated}`;

  const res = await fetchWithTimeout(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    },
    AI_TIMEOUT_MS,
    "AI gateway",
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("AI gateway", res.status, body));
  }

  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    throw new Error(`AI returned non-JSON: ${content.slice(0, 200)}`);
  }
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];

  const out: Extracted[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const fnRaw = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const lnRaw = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fnRaw && !lnRaw) continue;
    const title = typeof r.title === "string" ? r.title.trim() || null : null;
    // OR the AI signal with our regex against name + title (belt and suspenders).
    const regexCreds = detectCredentials(fnRaw, lnRaw, title);
    const aiPhd = r.is_phd === true;
    const aiCpa = r.is_cpa === true;
    out.push({
      first_name: stripCredentials(fnRaw),
      last_name: stripCredentials(lnRaw),
      title,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
      is_phd: aiPhd || regexCreds.is_phd,
      is_cpa: aiCpa || regexCreds.is_cpa,
    });
  }
  return out;
}

/**
 * Send a PDF directly to the Lovable AI Gateway (Gemini supports PDFs natively
 * via the OpenAI-compatible `file` content block) and ask for the same
 * { people: [...] } JSON shape that callLovableAi produces from markdown.
 */
async function callLovableAiWithPdf(
  apiKey: string,
  filename: string,
  pdfBase64: string,
): Promise<Extracted[]> {
  const system =
    "You extract faculty/instructor/lecturer/adjunct directory entries from an accounting department PDF " +
    "(typically a printout of a faculty webpage). " +
    "RULES: " +
    "1. ONLY emit a person if their full name appears verbatim in the PDF. " +
    "2. NEVER invent or pattern-guess an email. If no email appears for that person, set email to null. " +
    "3. Capture every teaching role: Professor, Associate/Assistant Professor, Instructor, Lecturer, Adjunct, Clinical, Teaching Professor, Professor of Practice, Visiting. " +
    "4. Exclude clearly non-accounting faculty (finance, economics, marketing, IS, etc.) unless the page explicitly lists them under accounting. " +
    "5. Exclude purely administrative staff with no teaching title unless their title contains an instructional keyword. " +
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url, is_phd, is_cpa }] }. " +
    "7. profile_url should be an absolute URL when the PDF clearly links to a personal profile page; otherwise null. " +
    "8. is_phd = true if the person's name, title, or bio shows a doctorate credential (PhD, Ph.D., DBA, EdD, DPhil, JSD, or 'Doctorate'). Otherwise false. " +
    "9. is_cpa = true if their name, title, or bio shows the CPA credential (CPA or C.P.A.). Otherwise false. " +
    "10. Do NOT include credentials (PhD, CPA, MBA, JD, Esq., etc.) inside first_name or last_name — return the clean human name only.";

  const res = await fetchWithTimeout(
    "https://ai.gateway.lovable.dev/v1/chat/completions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract every accounting faculty member from this PDF (source filename: ${filename}). Return JSON only.` },
              { type: "file", file: { filename, file_data: `data:application/pdf;base64,${pdfBase64}` } },
            ],
          },
        ],
      }),
    },
    AI_PDF_TIMEOUT_MS,
    "AI gateway (PDF)",
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(slickHttpError("AI gateway (PDF)", res.status, body));
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(content); } catch {
    throw new Error(`AI returned non-JSON: ${content.slice(0, 200)}`);
  }
  const people = (parsed as { people?: unknown }).people;
  if (!Array.isArray(people)) return [];
  const out: Extracted[] = [];
  for (const p of people) {
    if (!p || typeof p !== "object") continue;
    const r = p as Record<string, unknown>;
    const fnRaw = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const lnRaw = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fnRaw && !lnRaw) continue;
    const title = typeof r.title === "string" ? r.title.trim() || null : null;
    const regexCreds = detectCredentials(fnRaw, lnRaw, title);
    const aiPhd = r.is_phd === true;
    const aiCpa = r.is_cpa === true;
    out.push({
      first_name: stripCredentials(fnRaw),
      last_name: stripCredentials(lnRaw),
      title,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
      is_phd: aiPhd || regexCreds.is_phd,
      is_cpa: aiCpa || regexCreds.is_cpa,
    });
  }
  return out;
}

/**
 * Insert extracted people into campus_lead_suggestions with the standard
 * dedupe-against-active-rows rules. Shared by URL and PDF scrape paths.
 */
async function insertExtractedPeople(
  campusId: string,
  people: Extracted[],
  sourceLabel: string,
  researchLabel: string,
  options: { allowNoContact?: boolean } = {},
): Promise<{ inserted: number; skippedDuplicates: number; droppedNoContact: number }> {
  if (people.length === 0) return { inserted: 0, skippedDuplicates: 0, droppedNoContact: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rowsToInsert: Array<Record<string, unknown>> = [];
  let droppedNoContact = 0;
  for (const p of people) {
    const hasContact = !!p.email || !!p.profile_url;
    if (!hasContact && !options.allowNoContact) { droppedNoContact++; continue; }
    // Require at least a name when we have no contact info, otherwise the row is useless.
    if (!hasContact && !(p.first_name || p.last_name)) { droppedNoContact++; continue; }
    rowsToInsert.push({
      campus_id: campusId,
      first_name: p.first_name,
      last_name: p.last_name,
      title: p.title,
      email: p.email,
      source_url: p.profile_url ?? (options.allowNoContact ? sourceLabel : null),
      research_mode: "faculty_scrape",
      research_label: researchLabel,
      status: "pending",
      lead_type: "professor",
      is_phd: p.is_phd,
      is_cpa: p.is_cpa,
      notes: `Scraped from ${sourceLabel}`,
      raw_payload: { source: sourceLabel, title: p.title, profile_url: p.profile_url, is_phd: p.is_phd, is_cpa: p.is_cpa },
    });
  }
  if (rowsToInsert.length === 0) return { inserted: 0, skippedDuplicates: 0, droppedNoContact };
  const seen = new Set<string>();
  const unique = rowsToInsert.filter((r) => {
    const key = (r.email as string | null) ?? `${r.first_name}|${r.last_name}|${r.source_url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const emails = unique.map((r) => r.email).filter((e): e is string => !!e);
  let existingEmails = new Set<string>();
  if (emails.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("email")
      .eq("campus_id", campusId)
      .is("archived_at", null)
      .in("email", emails);
    existingEmails = new Set((existing ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
  }
  let skipped = 0;
  const toInsert = unique.filter((r) => {
    const e = r.email as string | null;
    if (e && existingEmails.has(e)) { skipped++; return false; }
    return true;
  });
  if (toInsert.length === 0) return { inserted: 0, skippedDuplicates: skipped, droppedNoContact };
  const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
  if (error) throw new Error(`insert failed: ${error.message}`);
  return { inserted: toInsert.length, skippedDuplicates: skipped, droppedNoContact };
}

async function processUrls(
  fcKey: string,
  aiKey: string,
  campusId: string,
  urls: string[],
): Promise<{
  perPage: Array<{ url: string; found: number; error: string | null }>;
  inserted: number;
  skippedDuplicates: number;
  programLevels: ProgramLevelDetection;
  programLevelSources: string[];
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const perPage: Array<{ url: string; found: number; error: string | null }> = [];
  const rowsToInsert: Array<Record<string, unknown>> = [];
  let programLevels: ProgramLevelDetection = EMPTY_DETECTION;
  const programLevelSources: string[] = [];

  for (const url of urls) {
    try {
      const md = await firecrawlScrape(fcKey, url);
      if (!md) {
        perPage.push({ url, found: 0, error: "empty content" });
        continue;
      }
      const pageDetection = detectProgramLevels(md);
      if (pageDetection.bachelors || pageDetection.masters || pageDetection.phd) {
        programLevels = mergeDetections(programLevels, pageDetection);
        if (!programLevelSources.includes(url)) programLevelSources.push(url);
      }
      const parsedPeople = extractDirectoryMarkdownPeople(md);
      const aiPeople = await callLovableAi(aiKey, url, md);
      const people = await enrichProfileEmails(fcKey, mergePeople(parsedPeople, aiPeople), url);
      perPage.push({ url, found: people.length, error: null });
      for (const p of people) {
        if (!p.email && !p.profile_url) continue;
        rowsToInsert.push({
          campus_id: campusId,
          first_name: p.first_name,
          last_name: p.last_name,
          title: p.title,
          email: p.email,
          source_url: p.profile_url ?? url,
          research_mode: "faculty_scrape",
          research_label: "faculty_scrape_v2_firecrawl",
          status: "pending",
          lead_type: "professor",
          is_phd: p.is_phd,
          is_cpa: p.is_cpa,
          notes: `Scraped from ${url}`,
          raw_payload: { source_page: url, title: p.title, profile_url: p.profile_url, is_phd: p.is_phd, is_cpa: p.is_cpa },
        });
      }
    } catch (e) {
      perPage.push({ url, found: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }

  let inserted = 0;
  let skippedDuplicates = 0;
  if (rowsToInsert.length > 0) {
    const seen = new Set<string>();
    const unique = rowsToInsert.filter((r) => {
      const key = (r.email as string | null) ?? `${r.first_name}|${r.last_name}|${r.source_url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const emails = unique.map((r) => r.email).filter((e): e is string => !!e);
    let existingEmails = new Set<string>();
    if (emails.length > 0) {
      // Only treat ACTIVE (non-archived) rows as duplicates. Previously-
      // archived rows (e.g. from a "Reset all leads" sweep) should NOT block
      // a fresh scrape — otherwise the new run inserts nothing and the
      // triage panel stays empty.
      const { data: existing } = await supabaseAdmin
        .from("campus_lead_suggestions")
        .select("email")
        .eq("campus_id", campusId)
        .is("archived_at", null)
        .in("email", emails);
      existingEmails = new Set((existing ?? []).map((r: { email: string | null }) => r.email).filter((e): e is string => !!e));
    }
    const toInsert = unique.filter((r) => {
      const e = r.email as string | null;
      if (e && existingEmails.has(e)) { skippedDuplicates++; return false; }
      return true;
    });
    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from("campus_lead_suggestions").insert(toInsert as never);
      if (error) throw new Error(`insert failed: ${error.message}`);
      inserted = toInsert.length;
    }
  }

  return { perPage, inserted, skippedDuplicates, programLevels, programLevelSources };
}

function requireKeys() {
  const aiKey = process.env.LOVABLE_API_KEY;
  if (!aiKey) throw new Error("LOVABLE_API_KEY is not configured on the server");
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) throw new Error("FIRECRAWL_API_KEY is not configured on the server");
  return { aiKey, fcKey };
}

export const scrapeCampusFaculty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ScrapeInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { aiKey, fcKey } = requireKeys();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await processUrls(fcKey, aiKey, data.campusId, data.urls);
    await supabaseAdmin
      .from("campuses")
      .update({ faculty_page_url: data.urls.join("\n") })
      .eq("id", data.campusId);
    return { ok: true, ...result };
  });

export const autoDiscoverCampusFaculty = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => DiscoverInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { aiKey, fcKey } = requireKeys();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus, error: campusErr } = await supabaseAdmin
      .from("campuses")
      .select("website_url,accounting_department_url,faculty_page_url,domains,name")
      .eq("id", data.campusId)
      .maybeSingle();
    if (campusErr) throw new Error(campusErr.message);
    if (!campus) throw new Error("Campus not found");

    const seeds: string[] = [];
    const accDept = campus.accounting_department_url as string | null;
    const facultyPageUrl = campus.faculty_page_url as string | null;
    const website = campus.website_url as string | null;
    const domains = (campus.domains as string[] | null) ?? [];
    const explicitFacultyUrls = (facultyPageUrl ?? "")
      .split(/\r?\n/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u))
      .map(normalizeUrl);
    if (accDept) seeds.push(accDept);
    if (website) seeds.push(website);
    for (const d of domains) {
      if (typeof d !== "string") continue;
      const u = d.startsWith("http") ? d : `https://${d}`;
      if (!seeds.includes(u)) seeds.push(u);
    }
    const derivedAccountancySeeds = seeds.flatMap((seed) => {
      try {
        const parsed = new URL(seed);
        const host = parsed.hostname.replace(/^www\./, "");
        if (host.includes("accountancy.")) return [];
        return [`${parsed.protocol}//accountancy.${host}/`];
      } catch { return []; }
    });
    for (const seed of derivedAccountancySeeds) if (!seeds.includes(seed)) seeds.unshift(seed);
    if (seeds.length === 0) {
      throw new Error("No website_url, accounting_department_url, or domains on this campus. Add one or use 'Scrape faculty' with explicit URLs.");
    }

    // Discovery strategy: combine Firecrawl `search` (Google-quality, finds
    // pages even if not in the site map) with Firecrawl `map` over each
    // seed. Search runs against each seed domain individually so we get
    // results scoped to that school, not the entire web.
    const allLinks: string[] = [];
    const discoveryErrors: string[] = [];
    allLinks.push(...explicitFacultyUrls);

    for (const seed of seeds.slice(0, 3)) {
      let host = "";
      try { host = new URL(seed).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      // 1) Site-scoped search — usually the highest-signal result.
      if (host) {
        try {
          const found = await firecrawlSearch(fcKey, `site:${host} accountancy faculty staff`);
          allLinks.push(...found);
        } catch (e) {
          discoveryErrors.push(`search ${host}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // 2) Map the seed — picks up internal links the search engine missed.
      try {
        const links = await firecrawlMap(fcKey, seed, "faculty staff");
        allLinks.push(...links);
      } catch (e) {
        discoveryErrors.push(`map ${seed}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (allLinks.length === 0) {
      throw new Error(`Firecrawl discovery found no links. ${discoveryErrors.join("; ")}`);
    }
    const mapErrors = discoveryErrors;

    const ranked = Array.from(new Set([...explicitFacultyUrls, ...rankFacultyUrls(allLinks)])).slice(0, data.maxPages);
    if (ranked.length === 0) {
      return {
        ok: true, discovered: 0, scraped: 0, inserted: 0, skippedDuplicates: 0,
        perPage: [], chosenUrls: [], mapErrors,
      };
    }

    const result = await processUrls(fcKey, aiKey, data.campusId, ranked);
    await supabaseAdmin
      .from("campuses")
      .update({ faculty_page_url: ranked.join("\n") })
      .eq("id", data.campusId);

    return {
      ok: true,
      discovered: allLinks.length,
      scraped: ranked.length,
      chosenUrls: ranked,
      mapErrors,
      ...result,
    };
  });

export const scrapeCampusFacultyPdf = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PdfInputSchema.parse(input))
  .handler(async ({ data }) => {
    const aiKey = process.env.LOVABLE_API_KEY;
    if (!aiKey) throw new Error("LOVABLE_API_KEY is not configured on the server");
    const people = await callLovableAiWithPdf(aiKey, data.filename, data.fileBase64);
    const { inserted, skippedDuplicates, droppedNoContact } = await insertExtractedPeople(
      data.campusId,
      people,
      `PDF: ${data.filename}`,
      "faculty_scrape_pdf_v1",
      { allowNoContact: true },
    );
    return { ok: true, found: people.length, inserted, skippedDuplicates, droppedNoContact };
  });
