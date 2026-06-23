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

    // --- Faculty URL discovery (ACCOUNTING-ONLY) ---------------------------
    // Scope to accounting/accountancy departments. Cross-discipline "all
    // faculty" pages caused most Batch V2 failures (huge payloads, generic
    // dept emails, Buildings/Locations bleed-through). If we can't find an
    // accounting-specific page, SKIP the campus — no generic fallback.
    const ACCOUNTING_SIGNAL_RE =
      /(accounting|accountancy|\baccy\b|\bacct\b|taxation|\baudit(ing)?\b)/i;
    const ACCOUNTING_PATH_RE = /(\/|-|_)(accounting|accountancy|accy|acct|soa)(\/|-|_|\.|$)/i;

    const facultyQueries: string[] = domains.length
      ? [
          `site:${domains[0]} "accounting" faculty directory`,
          `site:${domains[0]} "school of accountancy" faculty`,
          `site:${domains[0]} "department of accounting" people`,
          // Surfaces individual accounting-professor profile pages on small
          // colleges that have no dedicated accounting directory.
          `site:${domains[0]} accounting professor`,
        ]
      : [
          `"${name}" accounting faculty directory`,
          `"${name}" "school of accountancy" faculty`,
          `"${name}" accounting professor`,
        ];
    const facultyQuery = facultyQueries[0];

    let facultyResults: Array<{ title: string; link: string }> = [];
    const facultyStart = Date.now();
    let facultyMs = 0;
    try {
      for (const q of facultyQueries) {
        const batch = await serpSearch(serpKey, q, 10);
        facultyResults = facultyResults.concat(batch);
        if (batch.some((r) => ACCOUNTING_PATH_RE.test(r.link))) break;
      }
    } catch (e) {
      notes.push(`faculty serp: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      facultyMs = Date.now() - facultyStart;
    }

    // Non-directory hosts/paths that frequently sneak past an "accounting"
    // signal: institutional repositories (scholarship.*, digitalcommons.*),
    // libraries/archives (uflib, findingaids, /spec/, /archives/), CGI
    // viewers (/cgi/viewcontent), PDFs, journals, news, courses/syllabi.
    const NON_DIRECTORY_HOST_RE =
      /^(scholarship|digitalcommons|commons|repository|repositories|library|libraries|lib|uflib|archives|archive|journals|journal|news|newsroom|blog|today|magazine|press|catalog|catalogue|registrar|bulletin|courses)$/i;
    const NON_DIRECTORY_PATH_RE =
      /(\/cgi\/|\/viewcontent|\/spec\/|\/archives?\/|\/findingaids?|\/repositor(y|ies)\/|\/journals?\/|\/proceedings?\/|\/papers?\/|\/publications?\/|\/research-?papers?\/|\/abstract\/|\/article\/|\/issues?\/|\/volumes?\/|\.pdf(\?|$)|\.docx?(\?|$))/i;
    const DIRECTORY_PATH_RE =
      /\/(directory|faculty|people|staff|profiles|faculty-staff|faculty-directory|faculty-and-staff|our-(people|faculty)|meet-(the-)?(faculty|team))(\/|\.|$)/i;
    // Social / aggregator hosts are never faculty rosters and break Firecrawl
    // (403). They slip through when the campus domain list is empty (name-based
    // query), so this is checked independently of the campus-domain filter.
    const SOCIAL_HOST_RE =
      /(facebook|instagram|twitter|youtube|tiktok|linkedin|zoominfo|wikipedia|crunchbase|glassdoor|indeed|reddit)\.|(^|\.)x\.com$/i;
    const keep = (link: string, title: string) => {
      const h = hostOf(link);
      if (SOCIAL_HOST_RE.test(h)) return false;
      const domainOk = domains.length === 0 || domains.some((d) => h === d || h.endsWith(`.${d}`));
      if (!domainOk) return false;
      if (BLOG_DATE_RE.test(link)) return false;
      // Hard-exclude non-directory hosts (library, scholarship repos, news…).
      const leftmostHostLabel = (h.split(".")[0] ?? "");
      if (NON_DIRECTORY_HOST_RE.test(leftmostHostLabel)) {
        notes.push(`faculty: dropped non-directory host ${h}`);
        return false;
      }
      let pathname = link.toLowerCase();
      try { pathname = new URL(link).pathname.toLowerCase(); } catch { /* keep raw */ }
      if (NON_DIRECTORY_PATH_RE.test(pathname)) {
        notes.push(`faculty: dropped non-directory path ${pathname}`);
        return false;
      }
      const txt = `${link} ${title}`;
      // HARD requirements:
      //  (1) accounting signal in URL path or title, AND
      //  (2) a directory-shape path token — otherwise we accept random
      //      scholarship/library hits that just happen to mention accounting.
      if (!ACCOUNTING_PATH_RE.test(link) && !ACCOUNTING_SIGNAL_RE.test(txt)) return false;
      if (!DIRECTORY_PATH_RE.test(pathname) && !ACCOUNTING_PATH_RE.test(pathname)) {
        return false;
      }
      const labels = h.split(".");
      const leftmost = labels[0] ?? "";
      if (labels.length >= 3 && /(blog|news|newsroom)/i.test(leftmost)) {
        notes.push(`faculty: dropped blog/news subdomain ${h}`);
        return false;
      }
      const lower = txt.toLowerCase();
      const badHints = ["/news", "/event", "/podcast", "/award", "/spotlight", "/story", "/stories"];
      if (badHints.some((b) => lower.includes(b))) return false;
      return true;
    };
    // Fallback acceptor — used ONLY when the strict accounting-first pass finds
    // nothing. Drops the "accounting word must appear" requirement (small
    // colleges list accounting faculty on a shared business page; big schools
    // bury accounting under a College-of-Business directory) but still requires
    // a directory-shape path plus either a business-school signal or an
    // individual person profile. Per-person ACCOUNTING scoping then happens in
    // the AI extractor, so a cross-discipline business directory stays clean.
    const BUSINESS_SIGNAL_RE =
      /(business|warrington|accountanc|accounting|b-school|college[-\s]?of[-\s]?business|school[-\s]?of[-\s]?business|\bcob\b|\bsba\b)/i;
    // A directory path ending in a person slug, e.g. /people/jane-doe or
    // /faculty/gomer-jeffrey — a single-person profile.
    const PROFILE_SLUG_RE =
      /\/(?:people|person|faculty|faculty-and-staff|faculty-staff|profiles?|staff|directory)\/[a-z0-9][a-z0-9._-]{2,}\/?$/i;
    const fallbackKeep = (link: string, title: string) => {
      const h = hostOf(link);
      if (SOCIAL_HOST_RE.test(h)) return false;
      const domainOk = domains.length === 0 || domains.some((d) => h === d || h.endsWith(`.${d}`));
      if (!domainOk) return false;
      if (BLOG_DATE_RE.test(link)) return false;
      if (NON_DIRECTORY_HOST_RE.test(h.split(".")[0] ?? "")) return false;
      let pathname = link.toLowerCase();
      try { pathname = new URL(link).pathname.toLowerCase(); } catch { /* keep raw */ }
      if (NON_DIRECTORY_PATH_RE.test(pathname)) return false;
      const lower = `${link} ${title}`.toLowerCase();
      if (["/news", "/event", "/podcast", "/award", "/spotlight", "/story", "/stories"].some((b) => lower.includes(b))) return false;
      // Individual person profile (low cross-discipline risk — SerpAPI already
      // ranked it for the accounting query) …
      if (PROFILE_SLUG_RE.test(pathname)) return true;
      // … or a department directory carrying a business-school / accounting signal.
      if (DIRECTORY_PATH_RE.test(pathname) && (BUSINESS_SIGNAL_RE.test(`${h}${pathname}`) || BUSINESS_SIGNAL_RE.test(title))) return true;
      return false;
    };

    const rawKept = Array.from(
      new Set(facultyResults.filter((r) => keep(r.link, r.title)).map((r) => r.link)),
    );
    const facultyUrls: string[] = [];
    for (const link of rawKept) {
      for (const parent of deriveDirectoryParents(link)) {
        if (!facultyUrls.includes(parent)) facultyUrls.push(parent);
      }
      if (!facultyUrls.includes(link)) facultyUrls.push(link);
    }
    const score = (u: string): number => {
      const p = (() => { try { return new URL(u).pathname.toLowerCase(); } catch { return u.toLowerCase(); } })();
      let s = 0;
      if (ACCOUNTING_PATH_RE.test(p)) s += 20;
      if (DIRECTORY_PATH_RE.test(p)) s += 10;
      return s;
    };
    facultyUrls.sort((a, b) => score(b) - score(a));
    let facultyUrlsCapped = facultyUrls.slice(0, 3);

    // Tier 2 — if the strict accounting pass found nothing, fall back to
    // business-school directories / individual profiles instead of skipping the
    // campus. Profiles are scraped as-is (NOT parent-derived — that would climb
    // to a giant all-faculty page).
    let usedFallback = false;
    if (facultyUrlsCapped.length === 0) {
      const fb = Array.from(
        new Set(facultyResults.filter((r) => fallbackKeep(r.link, r.title)).map((r) => r.link)),
      );
      // Prefer directory pages (more leads/page) over single profiles; cap to
      // keep Firecrawl spend bounded.
      fb.sort((a, b) => score(b) - score(a));
      facultyUrlsCapped = fb.slice(0, 3);
      usedFallback = facultyUrlsCapped.length > 0;
    }

    const noAccountingDept = facultyUrlsCapped.length === 0;
    if (usedFallback) {
      notes.push(`faculty: no accounting-specific page — using ${facultyUrlsCapped.length} fallback directory/profile URL(s)`);
    } else if (noAccountingDept) {
      notes.push("faculty: no accounting-specific directory URL found — skipping campus");
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
      noAccountingDept,
      usedFallback,
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

