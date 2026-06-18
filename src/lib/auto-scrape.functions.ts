// Auto-discovers faculty + RMP URLs for a campus via SerpAPI, so the user
// doesn't have to copy/paste Google links. Returns URL lists the caller
// then feeds into the existing scrapeCampusFaculty / scrapeCampusRmp
// server fns. Keeps the manual flow untouched.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SERPAPI_BASE = "https://serpapi.com/search.json";
const SERP_TIMEOUT_MS = 20_000;

async function serpSearch(apiKey: string, query: string, num = 10): Promise<Array<{ title: string; link: string }>> {
  const url = `${SERPAPI_BASE}?engine=google&num=${num}&q=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SERP_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if ((e as { name?: string } | null)?.name === "AbortError") throw new Error(`SerpAPI timed out after ${SERP_TIMEOUT_MS / 1000}s`);
    throw new Error(`SerpAPI fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpAPI ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { organic_results?: Array<{ title?: string; link?: string }>; error?: string };
  if (json.error) throw new Error(`SerpAPI error: ${json.error}`);
  return (json.organic_results ?? [])
    .filter((r) => typeof r.link === "string")
    .map((r) => ({ title: r.title ?? "", link: r.link as string }));
}

function hostOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

const Input = z.object({ campusId: z.string().uuid() });

export const autoDiscoverCampusUrls = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const serpKey = process.env.SERPAPI_API_KEY;
    if (!serpKey) throw new Error("SERPAPI_API_KEY is not configured on the server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus, error } = await supabaseAdmin
      .from("campuses")
      .select("id,name,website_url,accounting_department_url,domains")
      .eq("id", data.campusId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!campus) throw new Error("Campus not found");

    const name = (campus.name as string | null) ?? "";
    const domains: string[] = [];
    const rawDomains = (campus.domains as unknown[] | null) ?? [];
    for (const d of rawDomains) if (typeof d === "string" && d.trim()) domains.push(d.trim().toLowerCase());
    for (const u of [campus.website_url, campus.accounting_department_url]) {
      const h = hostOf((u as string | null) ?? "");
      if (h && !domains.some((d) => h.endsWith(d) || d.endsWith(h))) domains.push(h);
    }

    const notes: string[] = [];

    // --- Faculty URL discovery ----------------------------------------------
    const facultyQuery = domains.length
      ? `site:${domains[0]} accounting faculty`
      : `"${name}" accounting faculty directory`;
    let facultyResults: Array<{ title: string; link: string }> = [];
    try {
      facultyResults = await serpSearch(serpKey, facultyQuery, 10);
    } catch (e) {
      notes.push(`faculty serp: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Prefer results on the campus domain whose URL/title look like a directory
    const keep = (link: string, title: string) => {
      const h = hostOf(link);
      const domainOk = domains.length === 0 || domains.some((d) => h === d || h.endsWith(`.${d}`));
      if (!domainOk) return false;
      const txt = `${link} ${title}`.toLowerCase();
      const badHints = ["/news", "/event", "/blog", "/podcast", "/profile/", "/people/", "/award"];
      if (badHints.some((b) => txt.includes(b)) && !txt.includes("faculty") && !txt.includes("staff") && !txt.includes("directory")) return false;
      return true;
    };
    const facultyUrls = Array.from(
      new Set(facultyResults.filter((r) => keep(r.link, r.title)).map((r) => r.link)),
    ).slice(0, 2);
    if (facultyUrls.length === 0 && facultyResults[0]) {
      // Fall back to the first organic result even if heuristics dropped it.
      facultyUrls.push(facultyResults[0].link);
      notes.push("faculty: heuristic dropped all results; using top organic result");
    }

    // --- RMP URL discovery --------------------------------------------------
    const rmpQuery = `site:ratemyprofessors.com/school "${name}"`;
    let rmpUrl: string | null = null;
    try {
      const rmpResults = await serpSearch(serpKey, rmpQuery, 5);
      const schoolHit = rmpResults.find((r) => /ratemyprofessors\.com\/school\/\d+/i.test(r.link));
      if (schoolHit) rmpUrl = schoolHit.link;
      else if (rmpResults[0]) {
        // Try a looser query that doesn't require /school/ in the URL
        const loose = await serpSearch(serpKey, `site:ratemyprofessors.com "${name}"`, 5);
        const hit2 = loose.find((r) => /ratemyprofessors\.com\/school\/\d+/i.test(r.link));
        if (hit2) rmpUrl = hit2.link;
      }
      if (!rmpUrl) notes.push("rmp: no /school/<id> URL found in top results");
    } catch (e) {
      notes.push(`rmp serp: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      ok: true,
      campusName: name,
      facultyUrls,
      rmpUrl,
      facultyQuery,
      rmpQuery,
      notes,
    };
  });
