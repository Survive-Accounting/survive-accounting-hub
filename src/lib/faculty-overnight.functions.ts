// Server fns to seed and inspect the overnight faculty auto-import queue.
// Called from the Lead Finder UI.
import { createServerFn } from "@tanstack/react-start";

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
