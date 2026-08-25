// Growth Contact Intelligence — admin server functions (thin wrappers over core).
//
// Auth + env + service-role client live here; all real work is in growth-intel-core.ts
// (also used by the CLI batch runner). Mirrors growth-contacts.functions.ts:
//   admin() -> assertAdmin() -> dynamic import of supabaseAdmin (service role).
// Reads degrade gracefully (storageReady:false) until the migration is applied.
// DISCOVERY ONLY — nothing here sends outreach.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/* eslint-disable @typescript-eslint/no-explicit-any */
type DB = any;

const admin = async (): Promise<DB> => {
  const { assertAdmin } = await import("@/lib/admin-session.functions");
  await assertAdmin();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as DB;
};

const keysFromEnv = () => {
  const serp = process.env.SERPAPI_API_KEY,
    firecrawl = process.env.FIRECRAWL_API_KEY,
    ai = process.env.AI_GATEWAY_API_KEY;
  if (!serp || !firecrawl || !ai) throw new Error("SERPAPI/FIRECRAWL/AI_GATEWAY keys not configured on the server");
  return { serp, firecrawl, ai };
};

const isMissingTable = (e: any) => e && (e.code === "42P01" || /relation .* does not exist/i.test(e.message || ""));

// ── Reads ──────────────────────────────────────────────────────────────────
export const getCampusIntel = createServerFn({ method: "GET" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    try {
      const { readCampusIntel } = await import("@/lib/growth-intel-core");
      const intel = await readCampusIntel(db, data.campusId);
      return { storageReady: true, ...intel };
    } catch (e: any) {
      if (isMissingTable(e)) return { storageReady: false, clubs: [], chapterContacts: [], councilContacts: [], councilStatus: [], statuses: [] };
      throw e;
    }
  });

/** Overview list: campuses that have any intel rows, with per-category status rollup. */
export const listIntelCampuses = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ campusIds: z.array(z.string().uuid()).max(200).optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    try {
      let q = db.from("growth_discovery_status").select("campus_id,category,entity_id,status,results_found,last_attempted_at");
      if (data.campusIds?.length) q = q.in("campus_id", data.campusIds);
      const { data: rows, error } = await q;
      if (error && isMissingTable(error)) return { storageReady: false, rows: [] };
      return { storageReady: true, rows: rows ?? [] };
    } catch (e: any) {
      if (isMissingTable(e)) return { storageReady: false, rows: [] };
      throw e;
    }
  });

/**
 * §15 Instagram priority queue — outreach-ready IG accounts (chapters + clubs +
 * councils), ranked. Ranking is a transparent, data-only score; NOTHING is sent.
 */
export const getInstagramQueue = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ limit: z.number().int().min(1).max(300).default(100) }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const db = await admin();
    try {
      const [chapters, clubs, councils] = await Promise.all([
        db.from("growth_public_contacts").select("campus_id,entity_type,entity_id,name,role,instagram_url,confidence,category").not("instagram_url", "is", null),
        db.from("growth_business_clubs").select("campus_id,category,name,instagram_url,confidence").not("instagram_url", "is", null),
        db.from("campus_council_contacts").select("campus_id,council_type,instagram_url,confidence").not("instagram_url", "is", null),
      ]);
      const score = (conf: string) => (conf === "high" ? 3 : conf === "medium" ? 2 : 1);
      const items = [
        ...((chapters.data ?? []) as any[]).map((r) => ({ kind: "chapter", campaign: "CHAPTER_DISTRIBUTION", campus_id: r.campus_id, label: r.name || r.role || "chapter", instagram_url: r.instagram_url, confidence: r.confidence, rank: score(r.confidence) })),
        ...((clubs.data ?? []) as any[]).map((r) => ({ kind: "club", campaign: "CAMPUS_REP_RECRUITMENT", campus_id: r.campus_id, label: r.name, instagram_url: r.instagram_url, confidence: r.confidence, rank: score(r.confidence) })),
        ...((councils.data ?? []) as any[]).map((r) => ({ kind: "council", campaign: "COUNCIL_DISTRIBUTION", campus_id: r.campus_id, label: r.council_type, instagram_url: r.instagram_url, confidence: r.confidence, rank: score(r.confidence) })),
      ].sort((a, b) => b.rank - a.rank);
      return { storageReady: true, items: items.slice(0, data.limit) };
    } catch (e: any) {
      if (isMissingTable(e)) return { storageReady: false, items: [] };
      throw e;
    }
  });

// ── Discovery (mutating; still no outreach) ─────────────────────────────────
export const discoverBusinessClubs = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string }) => z.object({ campusId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const keys = keysFromEnv();
    const { runBusinessClubDiscovery, newCounters, estCost } = await import("@/lib/growth-intel-core");
    const { data: campus } = await db.from("campuses").select("id,name,domains,email_domain,website_url").eq("id", data.campusId).maybeSingle();
    if (!campus) throw new Error("Campus not found");
    const counters = newCounters();
    const result = await runBusinessClubDiscovery(db, campus, keys, { counters });
    return { ok: true, result, cost: estCost(counters), counters };
  });

export const discoverChapterContacts = createServerFn({ method: "POST" })
  .inputValidator((d: { campusId: string; limit?: number }) => z.object({ campusId: z.string().uuid(), limit: z.number().int().min(1).max(50).default(5) }).parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const keys = keysFromEnv();
    const { runChapterDiscovery, newCounters, estCost } = await import("@/lib/growth-intel-core");
    const { data: campus } = await db.from("campuses").select("id,name,domains,email_domain,website_url").eq("id", data.campusId).maybeSingle();
    if (!campus) throw new Error("Campus not found");
    const counters = newCounters();
    const result = await runChapterDiscovery(db, campus, keys, { limit: data.limit, counters });
    return { ok: true, result, cost: estCost(counters), counters };
  });
