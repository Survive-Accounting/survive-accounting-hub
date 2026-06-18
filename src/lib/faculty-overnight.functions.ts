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

    const { data: campus, error: campusErr } = await supabaseAdmin
      .from("campuses")
      .select("faculty_page_url,website_url,accounting_department_url,domains")
      .eq("id", data.campusId)
      .maybeSingle();
    if (campusErr) throw new Error(`campus read: ${campusErr.message}`);
    if (!campus) throw new Error("campus not found");

    const existingUrls = ((campus.faculty_page_url as string | null) ?? "")
      .split(/\r?\n/).map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    const hasSeed = !!(campus.website_url || campus.accounting_department_url
      || ((campus.domains as string[] | null) ?? []).length > 0);

    // If we already have URLs cached, just return them — discovery is the
    // expensive step. Otherwise run discovery (search + map only, no scrape)
    // and save the ranked URLs back to faculty_page_url.
    if (existingUrls.length > 0) {
      return {
        ok: true,
        discovered: existingUrls.length,
        chosenUrls: existingUrls,
        cached: true,
        message: `Using ${existingUrls.length} cached URL${existingUrls.length === 1 ? "" : "s"} — click "Scrape faculty" to extract leads.`,
      };
    }
    if (!hasSeed) {
      throw new Error("No faculty URL, website, or domains on this campus. Add one of those first.");
    }

    const { autoDiscoverCampusFaculty } = await import("@/lib/faculty-scrape.functions");
    const disc = await autoDiscoverCampusFaculty({
      data: { campusId: data.campusId, maxPages: 5, discoverOnly: true },
    }) as { chosenUrls?: string[]; discovered?: number; mapErrors?: string[] };

    const chosen = disc.chosenUrls ?? [];
    return {
      ok: true,
      discovered: disc.discovered ?? 0,
      chosenUrls: chosen,
      cached: false,
      message: chosen.length > 0
        ? `Found ${chosen.length} faculty URL${chosen.length === 1 ? "" : "s"} — click "Scrape faculty" to extract leads.`
        : `Discovery ran but found no faculty pages. ${(disc.mapErrors ?? []).join("; ")}`,
    };
  });


/** Enqueue every non-archived campus that EITHER has a faculty_page_url OR
 *  has a website/domain/accounting URL we can auto-discover from. Skips any
 *  campus that already has imported leads. Idempotent. */
export const enqueueAllPendingCampuses = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: candidates, error: e1 } = await supabaseAdmin
    .from("campuses")
    .select("id,faculty_page_url,website_url,accounting_department_url,domains,archived_at")
    .is("archived_at", null);
  if (e1) throw new Error(e1.message);
  const eligible = (candidates ?? []).filter((c: {
    faculty_page_url: string | null;
    website_url: string | null;
    accounting_department_url: string | null;
    domains: string[] | null;
  }) => {
    const v = (c.faculty_page_url ?? "").trim();
    if (v.length > 0 && /^https?:\/\//im.test(v)) return true;
    return !!(c.website_url || c.accounting_department_url || (c.domains ?? []).length > 0);
  });

  const ids = eligible.map((c: { id: string }) => c.id);
  if (ids.length === 0) return { queued: 0, scanned: 0 };

  const { data: withLeads } = await supabaseAdmin
    .from("outreach_leads")
    .select("campus_id")
    .in("campus_id", ids);
  const haveLeads = new Set((withLeads ?? []).map((r: { campus_id: string | null }) => r.campus_id));
  const target = ids.filter((id) => !haveLeads.has(id));

  if (target.length === 0) return { queued: 0, scanned: eligible.length };

  // Insert; unique constraint on campus_id makes this safely idempotent.
  const rows = target.map((campus_id) => ({ campus_id, status: "pending" }));
  const { error: e2, count } = await supabaseAdmin
    .from("outreach_faculty_batch_queue")
    .upsert(rows as never, { onConflict: "campus_id", ignoreDuplicates: true, count: "exact" });
  if (e2) throw new Error(e2.message);
  return { queued: count ?? target.length, scanned: eligible.length };

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
