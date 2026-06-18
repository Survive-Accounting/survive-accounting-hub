// Server fns to seed and inspect the overnight faculty auto-import queue.
// Called from the Lead Finder UI.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Run the overnight worker's scrape + auto-tag steps for a single campus —
 *  WITHOUT importing into outreach_leads. Used by the "Test Automated Scrape"
 *  button so Lee can sanity-check the pipeline before turning it loose. */
export const testAutoScrapeCampus = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ campusId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scrapeCampusFaculty } = await import("@/lib/faculty-scrape.functions");

    const TITLE_MATCH_RE = /\b(instructor|adjunct|associate|assistant|lecturer|teaching)\b/i;
    const AUTO_TAG = "Intro Target";
    const uniq = (arr: string[]) => {
      const seen = new Set<string>(); const out: string[] = [];
      for (const raw of arr) {
        const t = (raw ?? "").trim(); if (!t) continue;
        const k = t.toLowerCase(); if (seen.has(k)) continue;
        seen.add(k); out.push(t);
      }
      return out;
    };

    const { data: campus, error: campusErr } = await supabaseAdmin
      .from("campuses").select("faculty_page_url,website_url,accounting_department_url,domains").eq("id", data.campusId).maybeSingle();
    if (campusErr) throw new Error(`campus read: ${campusErr.message}`);
    if (!campus) throw new Error("campus not found");
    const urls = ((campus.faculty_page_url as string | null) ?? "")
      .split(/\r?\n/).map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u)).slice(0, 10);

    let scraped = 0;
    let discoveredUrls: string[] = [];
    if (urls.length === 0) {
      const hasSeed = !!(campus.website_url || campus.accounting_department_url
        || ((campus.domains as string[] | null) ?? []).length > 0);
      if (!hasSeed) throw new Error("No faculty_page_url and no website/domains on this campus to auto-discover from.");
      const { autoDiscoverCampusFaculty } = await import("@/lib/faculty-scrape.functions");
      const disc = await autoDiscoverCampusFaculty({ data: { campusId: data.campusId, maxPages: 5 } }) as {
        perPage?: Array<{ inserted?: number }>;
        chosenUrls?: string[];
      };
      scraped = (disc.perPage ?? []).reduce((n, p) => n + (p.inserted ?? 0), 0);
      discoveredUrls = disc.chosenUrls ?? [];
    } else {
      const scrape = await scrapeCampusFaculty({ data: { campusId: data.campusId, urls } }) as {
        perPage?: Array<{ inserted?: number }>;
      };
      scraped = (scrape.perPage ?? []).reduce((n, p) => n + (p.inserted ?? 0), 0);
    }


    const { data: sugs } = await supabaseAdmin
      .from("campus_lead_suggestions")
      .select("id,title,title_tags")
      .eq("campus_id", data.campusId)
      .eq("research_mode", "faculty_scrape")
      .is("archived_at", null);
    const matches = (sugs ?? []).filter((r: { title: string | null }) =>
      TITLE_MATCH_RE.test(r.title ?? ""),
    ) as Array<{ id: string; title_tags: string[] | null }>;
    for (const r of matches) {
      const next = uniq([...(r.title_tags ?? []), AUTO_TAG]);
      await supabaseAdmin
        .from("campus_lead_suggestions")
        .update({ title_tags: next, status: "accepted" })
        .eq("id", r.id);
    }
    return { scraped, tagged: matches.length, urls: urls.length };
  });


/** Enqueue every non-archived campus that has a faculty_page_url and zero
 *  existing outreach_leads. Idempotent — already-queued campuses are skipped
 *  by the unique constraint on (campus_id). */
export const enqueueAllPendingCampuses = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Active campuses with a faculty URL.
  const { data: candidates, error: e1 } = await supabaseAdmin
    .from("campuses")
    .select("id,faculty_page_url,archived_at")
    .is("archived_at", null);
  if (e1) throw new Error(e1.message);
  const withUrl = (candidates ?? []).filter((c: { faculty_page_url: string | null }) => {
    const v = (c.faculty_page_url ?? "").trim();
    return v.length > 0 && /^https?:\/\//im.test(v);
  });

  // Drop any campus that already has imported leads.
  const ids = withUrl.map((c: { id: string }) => c.id);
  if (ids.length === 0) return { queued: 0, scanned: 0 };
  const { data: withLeads } = await supabaseAdmin
    .from("outreach_leads")
    .select("campus_id")
    .in("campus_id", ids);
  const haveLeads = new Set((withLeads ?? []).map((r: { campus_id: string | null }) => r.campus_id));
  const target = ids.filter((id) => !haveLeads.has(id));

  if (target.length === 0) return { queued: 0, scanned: withUrl.length };

  // Insert; unique constraint on campus_id makes this safely idempotent.
  const rows = target.map((campus_id) => ({ campus_id, status: "pending" }));
  const { error: e2, count } = await supabaseAdmin
    .from("outreach_faculty_batch_queue")
    .upsert(rows as never, { onConflict: "campus_id", ignoreDuplicates: true, count: "exact" });
  if (e2) throw new Error(e2.message);
  return { queued: count ?? target.length, scanned: withUrl.length };
});

/** Lightweight status summary for the morning report card. */
export const getFacultyBatchStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: queue } = await supabaseAdmin
    .from("outreach_faculty_batch_queue")
    .select("status");
  const counts: Record<string, number> = { pending: 0, running: 0, done: 0, failed: 0 };
  for (const r of (queue ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const { data: runs } = await supabaseAdmin
    .from("outreach_faculty_batch_runs")
    .select("imported,skipped,error,finished_at")
    .gte("finished_at", new Date(Date.now() - 12 * 3600_000).toISOString());
  let imported = 0, skipped = 0, failed = 0;
  for (const r of (runs ?? []) as Array<{ imported: number; skipped: number; error: string | null }>) {
    imported += r.imported ?? 0;
    skipped += r.skipped ?? 0;
    if (r.error) failed += 1;
  }
  return { queue: counts, last12h: { imported, skipped, failed } };
});
