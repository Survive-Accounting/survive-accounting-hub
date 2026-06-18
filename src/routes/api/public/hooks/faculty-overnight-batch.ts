// Overnight worker: pg_cron POSTs here every 2 minutes. Claims up to 3 pending
// queue rows, processes each in parallel, logs results. Idempotent and safe to
// re-run. Authenticated by the project anon API key in the `apikey` header.
import { createFileRoute } from "@tanstack/react-router";

const BATCH_SIZE = 3;
const STUCK_AFTER_MS = 10 * 60_000;

export const Route = createFileRoute("/api/public/hooks/faculty-overnight-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-apikey") ?? "";
        const expected = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processOneCampus } = await import("@/lib/faculty-overnight.server");

        // 1. Reset stuck "running" rows older than the watchdog window.
        const staleCutoff = new Date(Date.now() - STUCK_AFTER_MS).toISOString();
        await supabaseAdmin
          .from("outreach_faculty_batch_queue")
          .update({ status: "pending", started_at: null })
          .eq("status", "running")
          .lt("started_at", staleCutoff);

        // 2. Pick up to N pending campuses.
        const { data: pending, error: pickErr } = await supabaseAdmin
          .from("outreach_faculty_batch_queue")
          .select("id,campus_id")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (pickErr) {
          return Response.json({ ok: false, error: pickErr.message }, { status: 500 });
        }
        const items = (pending ?? []) as Array<{ id: string; campus_id: string }>;
        if (items.length === 0) {
          return Response.json({ ok: true, picked: 0, message: "queue empty" });
        }

        // 3. Claim them.
        const claimIds = items.map((i) => i.id);
        await supabaseAdmin
          .from("outreach_faculty_batch_queue")
          .update({ status: "running", started_at: new Date().toISOString() })
          .in("id", claimIds)
          .eq("status", "pending");

        // 4. Process in parallel.
        const settled = await Promise.allSettled(
          items.map(async (item) => {
            const r = await processOneCampus(item.campus_id);
            await supabaseAdmin.from("outreach_faculty_batch_runs").insert({
              campus_id: item.campus_id,
              scraped: r.scraped,
              tagged: r.tagged,
              imported: r.imported,
              skipped: r.skipped,
              error: r.error,
            } as never);
            await supabaseAdmin
              .from("outreach_faculty_batch_queue")
              .update({
                status: r.error ? "failed" : "done",
                finished_at: new Date().toISOString(),
                error: r.error,
              })
              .eq("id", item.id);
            return { campus_id: item.campus_id, ...r };
          }),
        );

        return Response.json({
          ok: true,
          picked: items.length,
          results: settled.map((s) =>
            s.status === "fulfilled"
              ? s.value
              : { error: s.reason instanceof Error ? s.reason.message : String(s.reason) },
          ),
        });
      },
    },
  },
});
