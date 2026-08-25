// Campus Backfill — Greek-org discovery (the missing stage).
// Finds a campus's fraternities & sororities from GreekRank.com (public
// listings), with an FSL-page fallback, and upserts them into greek_orgs +
// campus_greek_chapters. Public listing data only (org names + type) — no
// member/roster data.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { classifyOrgType } from "@/lib/campus-classify";
import { cached, SERP_TTL_HOURS, FIRECRAWL_TTL_HOURS } from "@/lib/scrape-cache";

const SERP_BASE = "https://serpapi.com/search.json";
const AI_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

async function serp(key: string, q: string, num = 8): Promise<Array<{ title: string; link: string }>> {
  return cached("serp", `greek|${num}|${q}`, SERP_TTL_HOURS, async () => {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 20_000);
    try {
      const r = await fetch(`${SERP_BASE}?engine=google&num=${num}&q=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
      if (!r.ok) return [];
      const j = (await r.json()) as { organic_results?: Array<{ title?: string; link?: string }> };
      return (j.organic_results ?? []).filter((x) => x.link).map((x) => ({ title: x.title ?? "", link: x.link as string }));
    } catch { return []; } finally { clearTimeout(timer); }
  });
}
async function firecrawlMd(key: string, url: string): Promise<string | null> {
  return cached("firecrawl", url, FIRECRAWL_TTL_HOURS, async () => {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const r = await fetch("https://api.firecrawl.dev/v2/scrape", {
        method: "POST", signal: ctrl.signal,
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, waitFor: 2000 }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { data?: { markdown?: string } };
      return j.data?.markdown ?? null;
    } catch { return null; } finally { clearTimeout(timer); }
  });
}
// Verify a GreekRank result actually belongs to THIS campus before trusting its
// uni id — GreekRank ids for same-named/nearby schools bleed (e.g. Cornell
// College picking up Cornell University's 60+ chapters). Require every
// significant campus-name token — INCLUDING the type word (College vs
// University) — to appear in the result title.
function titleMatchesCampus(title: string, campusName: string): boolean {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const nt = norm(title);
  const stop = new Set(["the", "of", "at", "and", "a"]);
  const toks = norm(campusName).split(" ").filter((t) => t.length >= 3 && !stop.has(t));
  if (toks.length === 0) return false;
  return toks.every((t) => nt.includes(t));
}
async function aiGreek(aiKey: string, md: string): Promise<{ fraternities: string[]; sororities: string[] } | null> {
  const prompt = `From this public Greek-life listing page, extract the fraternity and sorority CHAPTER/ORG NAMES for this ONE campus. Return ONLY JSON: {"fraternities":["Alpha Tau Omega",...],"sororities":["Chi Omega",...]}. Use full names (expand Greek letters to English names where shown). Exclude honor societies, professional/business fraternities are OK to include. Exclude navigation/ads. The page has a FRATERNITIES section then a SORORITIES section — classify by section. Page:\n\n${md.slice(0, 32000)}`;
  const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const r = await fetch(AI_URL, { method: "POST", signal: ctrl.signal, headers: { Authorization: `Bearer ${aiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, temperature: 0, messages: [{ role: "user", content: prompt }] }) });
    if (!r.ok) return null;
    const j = (await r.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const m = (j.choices?.[0]?.message?.content ?? "").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]);
    return { fraternities: Array.isArray(p.fraternities) ? p.fraternities : [], sororities: Array.isArray(p.sororities) ? p.sororities : [] };
  } catch { return null; } finally { clearTimeout(timer); }
}

const normName = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

export const scrapeCampusGreek = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const serpKey = process.env.SERPAPI_API_KEY, fcKey = process.env.FIRECRAWL_API_KEY, aiKey = process.env.AI_GATEWAY_API_KEY;
    if (!serpKey || !fcKey || !aiKey) throw new Error("SERPAPI/FIRECRAWL/AI_GATEWAY keys not configured");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: campus } = await (supabaseAdmin.from("campuses") as any).select("id,name,state,domains,website_url").eq("id", data.campusId).maybeSingle();
    if (!campus) throw new Error("Campus not found");
    const name = (campus.name as string) ?? "";

    // 1) Find the GreekRank uni id for this campus. GreekRank's live site is
    //    greekrank.NET (the .com pages error out); org lists live on the
    //    /uni/<id>/fraternities/ and /sororities/ sub-pages.
    let uniId: string | null = null;
    let identityVerified = false;
    for (const q of [`site:greekrank.com "${name}" fraternities`, `site:greekrank.net "${name}"`, `${name} greekrank fraternities`]) {
      const hits = await serp(serpKey, q, 8);
      // Only accept a /uni/<id> hit whose TITLE matches this campus (guards the
      // College-vs-University bleed). Prefer a verified hit over any hit.
      const uniHits = hits.filter((h) => /greekrank\.(com|net)\/uni\/\d+/i.test(h.link));
      const verified = uniHits.find((h) => titleMatchesCampus(h.title, name));
      const chosen = verified ?? null;
      if (chosen) { uniId = (chosen.link.match(/\/uni\/(\d+)/i) || [])[1] || null; identityVerified = true; if (uniId) break; }
    }
    // If we found GreekRank hits but none passed campus-identity verification,
    // do NOT use GreekRank (wrong-campus risk) — fall through to the FSL page,
    // which is scoped to the campus's own domain.
    if (uniId && !identityVerified) uniId = null;

    // 2) Fetch the fraternities + sororities listings (greekrank.net).
    let md: string | null = null;
    let source = "greekrank";
    let uniUrl: string | null = null;
    if (uniId) {
      uniUrl = `https://www.greekrank.net/uni/${uniId}`;
      const [fr, so] = await Promise.all([firecrawlMd(fcKey, `${uniUrl}/fraternities/`), firecrawlMd(fcKey, `${uniUrl}/sororities/`)]);
      if (fr || so) md = `FRATERNITIES:\n${fr ?? ""}\n\nSORORITIES:\n${so ?? ""}`;
    }
    if (!md) {
      // FSL fallback: the campus's own fraternity & sorority life page.
      const domain = (Array.isArray(campus.domains) ? campus.domains[0] : String(campus.domains || "").replace(/[{}"]/g, "").split(",")[0]) || hostOf(campus.website_url || "");
      const fslHits = await serp(serpKey, domain ? `site:${domain} fraternity sorority life chapters` : `${name} fraternity and sorority life chapters`, 6);
      const fsl = fslHits[0]?.link;
      if (fsl) { md = await firecrawlMd(fcKey, fsl); source = "fsl:" + hostOf(fsl); }
    }
    if (!md) return { ok: false, reason: "no_listing_found", uniUrl, inserted: 0, fraternities: 0, sororities: 0 };

    const extracted = await aiGreek(aiKey, md);
    if (!extracted) return { ok: false, reason: "extract_failed", uniUrl, source, inserted: 0, fraternities: 0, sororities: 0 };

    const orgs: Array<{ name: string; type: "fraternity" | "sorority" }> = [
      ...extracted.fraternities.map((n) => ({ name: n.trim(), type: "fraternity" as const })),
      ...extracted.sororities.map((n) => ({ name: n.trim(), type: "sorority" as const })),
    ].filter((o) => o.name.length > 2 && o.name.length < 80);

    // Existing greek_orgs (find-or-create by normalized name) + existing links for this campus.
    const { data: allOrgs } = await (supabaseAdmin.from("greek_orgs") as any).select("id,name").limit(5000);
    const orgByNorm = new Map<string, string>(((allOrgs ?? []) as Array<{ id: string; name: string }>).map((o) => [normName(o.name), o.id]));
    const { data: existingLinks } = await (supabaseAdmin.from("campus_greek_chapters") as any).select("greek_org_id").eq("campus_id", data.campusId);
    const linked = new Set(((existingLinks ?? []) as Array<{ greek_org_id: string }>).map((l) => l.greek_org_id));

    let inserted = 0, createdOrgs = 0;
    for (const o of orgs) {
      const key = normName(o.name);
      if (!key) continue;
      let orgId = orgByNorm.get(key);
      if (!orgId) {
        // Classify by NAME so professional/honor/service orgs aren't miscounted
        // as social Greek from the listing section they appeared under.
        const orgType = classifyOrgType(o.name, o.type);
        const { data: newOrg } = await (supabaseAdmin.from("greek_orgs") as any)
          .insert({ name: o.name, org_type: orgType, is_active: true, enrichment_status: "discovered" }).select("id").maybeSingle();
        orgId = newOrg?.id;
        if (orgId) { orgByNorm.set(key, orgId); createdOrgs++; }
      }
      if (!orgId || linked.has(orgId)) continue;
      const { error } = await (supabaseAdmin.from("campus_greek_chapters") as any).insert({
        campus_id: data.campusId, greek_org_id: orgId, status: "discovered", confidence: source.startsWith("greekrank") ? 80 : 60,
        is_national_org: true, enrichment_status: "discovered", notes: `discovered via ${source}`,
      });
      if (!error) { inserted++; linked.add(orgId); }
    }
    return { ok: true, source, uniUrl, fraternities: extracted.fraternities.length, sororities: extracted.sororities.length, createdOrgs, inserted };
  });
