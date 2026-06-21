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

// Dated blog posts (e.g. /2025/12/01/foo) are news, never faculty rosters.
const BLOG_DATE_RE = /\/(?:19|20)\d{2}\/\d{1,2}\/\d{1,2}\//;
// Faculty-directory-parent path tokens used to climb from profile → directory.
const FACULTY_PARENT_TOKENS = new Set([
  "people", "faculty", "faculty-directory", "faculty-and-staff",
  "faculty-staff", "profiles", "directory", "staff", "instructors",
]);

/**
 * Given a profile-detail URL (e.g. `…/profile.html?id=kenmerk` or
 * `…/people/jane-doe`), derive the parent directory listing URL(s). The
 * roster is almost always where the rest of the dept lives — one extra
 * Firecrawl call is far cheaper than missing 30 profs.
 */
function deriveDirectoryParents(rawUrl: string): string[] {
  const out: string[] = [];
  try {
    const u = new URL(rawUrl);
    const base = `${u.protocol}//${u.host}`;
    // Case A: query like ?id=… / ?profile=… / ?person=… → strip query, and
    // strip a trailing /xxx.html file segment to expose the directory dir.
    if (u.search && /[?&](id|profile|person|username)=/i.test(u.search)) {
      const pathNoFile = u.pathname.replace(/\/[^/]*\.html?$/i, "/");
      const parent = pathNoFile !== u.pathname ? pathNoFile : u.pathname.replace(/\/+$/, "/");
      out.push(`${base}${parent.endsWith("/") ? parent : parent + "/"}`);
    }
    // Case B: /<faculty-dir>/<slug>(.html)? → climb to /<faculty-dir>/
    const segs = u.pathname.split("/").filter(Boolean);
    if (segs.length >= 2) {
      const parentSeg = segs.at(-2)!.toLowerCase();
      const lastSeg = segs.at(-1)!.toLowerCase().replace(/\.html?$/, "");
      if (FACULTY_PARENT_TOKENS.has(parentSeg) && !FACULTY_PARENT_TOKENS.has(lastSeg)) {
        const dirPath = "/" + segs.slice(0, -1).join("/") + "/";
        out.push(`${base}${dirPath}`);
      }
    }
  } catch { /* ignore bad URLs */ }
  return Array.from(new Set(out));
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
    const facultyStart = Date.now();
    let facultyMs = 0;
    try {
      facultyResults = await serpSearch(serpKey, facultyQuery, 10);
    } catch (e) {
      notes.push(`faculty serp: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      facultyMs = Date.now() - facultyStart;
    }
    const keep = (link: string, title: string) => {
      const h = hostOf(link);
      const domainOk = domains.length === 0 || domains.some((d) => h === d || h.endsWith(`.${d}`));
      if (!domainOk) return false;
      // Hard-drop dated blog post URLs — they're news, never rosters.
      if (BLOG_DATE_RE.test(link)) return false;
      const txt = `${link} ${title}`.toLowerCase();
      // Drop blog/news subdomains (e.g. accountingblog.kelley.iu.edu,
      // news.school.edu) unless the title/path explicitly signals a roster.
      // These pages mostly contain dated posts and dilute extraction signal.
      const labels = h.split(".");
      const leftmost = labels[0] ?? "";
      const isBlogOrNewsSub =
        labels.length >= 3 && /(blog|news|newsroom)/i.test(leftmost);
      const rosterSignal = /faculty|staff|directory|people/.test(txt);
      if (isBlogOrNewsSub && !rosterSignal) {
        notes.push(`faculty: dropped blog/news subdomain ${h}`);
        return false;
      }
      const badHints = ["/news", "/event", "/blog", "/podcast", "/profile/", "/people/", "/award", "/spotlight", "/story", "/stories"];
      if (badHints.some((b) => txt.includes(b)) && !txt.includes("faculty") && !txt.includes("staff") && !txt.includes("directory")) return false;
      return true;
    };
    const rawKept = Array.from(
      new Set(facultyResults.filter((r) => keep(r.link, r.title)).map((r) => r.link)),
    );
    // Canonicalize: when a kept URL is a profile-detail page, prepend its
    // parent directory so the actual roster gets scraped too.
    const facultyUrls: string[] = [];
    for (const link of rawKept) {
      for (const parent of deriveDirectoryParents(link)) {
        if (!facultyUrls.includes(parent)) facultyUrls.push(parent);
      }
      if (!facultyUrls.includes(link)) facultyUrls.push(link);
    }
    // Rank: real directory paths first, marketing/news landing pages last.
    // Stops the `/departments/accounting` marketing page from being scraped
    // ahead of the actual `/directory.php` roster on schools that have both.
    const DIRECTORY_PATH_RE = /\/(directory|faculty|people|staff|profiles|faculty-staff|faculty-directory|faculty-and-staff)(\/|\.|$)/i;
    const MARKETING_PATH_RE = /\/(news|stories|story|press|noteworthy|invest|give|donate|events|spotlight|departments)(\/|\.|$)/i;
    const score = (u: string): number => {
      const p = (() => { try { return new URL(u).pathname.toLowerCase(); } catch { return u.toLowerCase(); } })();
      let s = 0;
      if (DIRECTORY_PATH_RE.test(p)) s += 10;
      if (MARKETING_PATH_RE.test(p)) s -= 5;
      return s;
    };
    facultyUrls.sort((a, b) => score(b) - score(a));
    const facultyUrlsCapped = facultyUrls.slice(0, 3);
    if (facultyUrlsCapped.length === 0 && facultyResults[0]) {
      // Last-ditch fallback. Still avoid obvious blog posts.
      const first = facultyResults.find((r) => !BLOG_DATE_RE.test(r.link)) ?? facultyResults[0];
      facultyUrlsCapped.push(first.link);
      notes.push("faculty: heuristic dropped all results; using top organic result");
    }
    if (facultyUrlsCapped.length > rawKept.length) {
      notes.push(`faculty: added ${facultyUrlsCapped.length - rawKept.length} parent directory URL(s)`);
    }

    // --- RMP URL discovery --------------------------------------------------
    // Strategy: ask RMP's own GraphQL search first (free, no SerpAPI quota,
    // and ground truth). Fall back to SerpAPI only if that returns nothing.
    const { findRmpSchoolUrlByName } = await import("@/lib/rmp-scrape.functions");
    const rmpStart = Date.now();
    let rmpUrl: string | null = null;
    let rmpResults: Array<{ title: string; link: string }> = [];
    const rmpQuery = `RMP GraphQL: schools(text: "${name}")`;
    let rmpMs = 0;
    try {
      rmpUrl = await findRmpSchoolUrlByName(name);
      if (!rmpUrl) {
        notes.push("rmp: GraphQL school search returned no match; trying SerpAPI fallback");
        const fallbackQuery = `site:ratemyprofessors.com/school "${name}"`;
        rmpResults = await serpSearch(serpKey, fallbackQuery, 5);
        const schoolHit = rmpResults.find((r) => /ratemyprofessors\.com\/school\/\d+/i.test(r.link));
        if (schoolHit) rmpUrl = schoolHit.link;
        else if (rmpResults[0]) {
          const loose = await serpSearch(serpKey, `site:ratemyprofessors.com "${name}"`, 5);
          rmpResults = rmpResults.concat(loose);
          const hit2 = loose.find((r) => /ratemyprofessors\.com\/school\/\d+/i.test(r.link));
          if (hit2) rmpUrl = hit2.link;
        }
      }
      if (!rmpUrl) notes.push("rmp: no /school/<id> URL found in RMP or SerpAPI");
    } catch (e) {
      notes.push(`rmp discover: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      rmpMs = Date.now() - rmpStart;
    }

    // Persist the discovered RMP URL so subsequent batch runs skip discovery.
    if (rmpUrl) {
      await supabaseAdmin
        .from("campuses")
        .update({ rmp_school_url: rmpUrl } as never)
        .eq("id", data.campusId);
    }

    return {
      ok: true,
      campusName: name,
      domains,
      facultyUrls: facultyUrlsCapped,
      rmpUrl,
      facultyQuery,
      rmpQuery,
      facultyMs,
      rmpMs,
      facultyResults: facultyResults.slice(0, 10),
      rmpResults: rmpResults.slice(0, 10),
      notes,
    };
  });

