// Per-campus faculty page scraper, powered by Firecrawl.
// Two entry points:
//   - scrapeCampusFaculty: given explicit URLs, Firecrawl-scrape each, then
//     ask the AI to extract real faculty entries (no email pattern-guessing).
//   - autoDiscoverCampusFaculty: use Firecrawl Map against the campus website
//     to discover faculty/directory pages, then run the same scrape+extract.
// Results land in campus_lead_suggestions with research_mode='faculty_scrape'
// and status='pending_triage' for human review.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const ScrapeInputSchema = z.object({
  campusId: z.string().uuid(),
  urls: z.array(z.string().url()).min(1).max(10),
});

const DiscoverInputSchema = z.object({
  campusId: z.string().uuid(),
  maxPages: z.number().int().min(1).max(10).default(5),
});

type Extracted = {
  first_name: string;
  last_name: string;
  title: string | null;
  email: string | null;
  profile_url: string | null;
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

function rankFacultyUrls(links: string[]): string[] {
  const scored = links
    .map((u) => {
      const lo = u.toLowerCase();
      if (HARD_EXCLUDE.some((x) => lo.includes(x))) return { u, score: -999 };
      if (YEAR_RE.test(lo)) return { u, score: -999 };

      let path = "";
      try { path = new URL(u).pathname.toLowerCase(); } catch { return { u, score: -999 }; }
      const segments = path.split("/").filter(Boolean);

      let score = 0;
      // Big boost for an exact path segment match (e.g. /faculty/, /people/)
      for (const seg of segments) {
        if (STRONG_PATH_TOKENS.includes(seg)) score += 10;
      }
      // Soft signal for accounting/accountancy anywhere in URL
      for (const t of SOFT_TOKENS) if (lo.includes(t)) score += 2;
      // Penalize URLs that are *just* a homepage with no useful path
      if (segments.length === 0) score -= 3;
      // Penalize very deep individual profile URLs — we want roster pages
      if (segments.length > 4) score -= 2;
      return { u, score };
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
  const res = await fetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, limit: 10 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`firecrawl search ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as {
    data?: { web?: Array<{ url: string }> } | Array<{ url: string }>;
    web?: Array<{ url: string }>;
  };
  const web = Array.isArray(json.data) ? json.data : (json.data?.web ?? json.web ?? []);
  return web.map((r) => r.url).filter(Boolean);
}

async function firecrawlScrape(apiKey: string, url: string): Promise<string> {
  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`firecrawl scrape ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json() as { data?: { markdown?: string }; markdown?: string };
  return json.data?.markdown ?? json.markdown ?? "";
}

async function firecrawlMap(apiKey: string, url: string, search: string): Promise<string[]> {
  const res = await fetch("https://api.firecrawl.dev/v2/map", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ url, search, limit: 200, includeSubdomains: true }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`firecrawl map ${res.status}: ${body.slice(0, 200)}`);
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
    "6. Return strict JSON with shape { people: [{ first_name, last_name, title, email, profile_url }] }. " +
    "7. profile_url should be an absolute URL when the source links to a personal profile page; otherwise null.";

  const user = `Source URL: ${sourceUrl}\n\nPage content (markdown):\n${truncated}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI gateway ${res.status}: ${body.slice(0, 300)}`);
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
    const fn = typeof r.first_name === "string" ? r.first_name.trim() : "";
    const ln = typeof r.last_name === "string" ? r.last_name.trim() : "";
    if (!fn && !ln) continue;
    out.push({
      first_name: fn,
      last_name: ln,
      title: typeof r.title === "string" ? r.title.trim() || null : null,
      email: typeof r.email === "string" && r.email.includes("@") ? r.email.trim().toLowerCase() : null,
      profile_url: typeof r.profile_url === "string" && /^https?:\/\//i.test(r.profile_url) ? r.profile_url.trim() : null,
    });
  }
  return out;
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
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const perPage: Array<{ url: string; found: number; error: string | null }> = [];
  const rowsToInsert: Array<Record<string, unknown>> = [];

  for (const url of urls) {
    try {
      const md = await firecrawlScrape(fcKey, url);
      if (!md) {
        perPage.push({ url, found: 0, error: "empty content" });
        continue;
      }
      const people = await callLovableAi(aiKey, url, md);
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
          status: "pending_triage",
          lead_type: "professors",
          notes: `Scraped from ${url}`,
          raw_payload: { source_page: url, title: p.title, profile_url: p.profile_url },
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
      const { data: existing } = await supabaseAdmin
        .from("campus_lead_suggestions")
        .select("email")
        .eq("campus_id", campusId)
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

  return { perPage, inserted, skippedDuplicates };
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
      .select("website_url,accounting_department_url,domains,name")
      .eq("id", data.campusId)
      .maybeSingle();
    if (campusErr) throw new Error(campusErr.message);
    if (!campus) throw new Error("Campus not found");

    const seeds: string[] = [];
    const accDept = campus.accounting_department_url as string | null;
    const website = campus.website_url as string | null;
    const domains = (campus.domains as string[] | null) ?? [];
    if (accDept) seeds.push(accDept);
    if (website) seeds.push(website);
    for (const d of domains) {
      if (typeof d !== "string") continue;
      const u = d.startsWith("http") ? d : `https://${d}`;
      if (!seeds.includes(u)) seeds.push(u);
    }
    if (seeds.length === 0) {
      throw new Error("No website_url, accounting_department_url, or domains on this campus. Add one or use 'Scrape faculty' with explicit URLs.");
    }

    // Discovery strategy: combine Firecrawl `search` (Google-quality, finds
    // pages even if not in the site map) with Firecrawl `map` over each
    // seed. Search runs against each seed domain individually so we get
    // results scoped to that school, not the entire web.
    const allLinks: string[] = [];
    const discoveryErrors: string[] = [];

    for (const seed of seeds.slice(0, 3)) {
      let host = "";
      try { host = new URL(seed).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
      // 1) Site-scoped search — usually the highest-signal result.
      if (host) {
        try {
          const found = await firecrawlSearch(fcKey, `site:${host} accounting faculty directory`);
          allLinks.push(...found);
        } catch (e) {
          discoveryErrors.push(`search ${host}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      // 2) Map the seed — picks up internal links the search engine missed.
      try {
        const links = await firecrawlMap(fcKey, seed, "faculty accounting directory");
        allLinks.push(...links);
      } catch (e) {
        discoveryErrors.push(`map ${seed}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    if (allLinks.length === 0) {
      throw new Error(`Firecrawl discovery found no links. ${discoveryErrors.join("; ")}`);
    }
    const mapErrors = discoveryErrors;

    const ranked = rankFacultyUrls(allLinks).slice(0, data.maxPages);
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
