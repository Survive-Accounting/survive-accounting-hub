// Follow-up sequences cron (spec §4) — hit by Vercel Cron once a day. Same auth pattern as the
// weekly digest: `Authorization: Bearer <CRON_SECRET>`, fails closed without a secret.
// GET = the daily run. POST with {"dryRun":true} reports what WOULD send without sending.
// Two UTC crons (14:00 / 15:00) bracket 9am Chicago across DST; the hour gate picks one.
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}
function chicagoHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(now)) % 24;
}

async function handle({ request }: { request: Request }): Promise<Response> {
  const configured = process.env.CRON_SECRET || "";
  if (!configured) return json({ error: "Cron secret not configured. Set CRON_SECRET in Vercel." }, 503);
  const header = request.headers.get("authorization") || "";
  if ((header.startsWith("Bearer ") ? header.slice(7) : "") !== configured) return json({ error: "Unauthorized" }, 401);

  let dryRun = false;
  if (request.method.toUpperCase() === "GET") {
    const hour = chicagoHour(new Date());
    if (hour !== 9) return json({ ok: true, ran: false, skipped: `not 9am CT (currently ${hour}:00 CT)` });
  } else {
    try { dryRun = !!((await request.json()) as { dryRun?: boolean })?.dryRun; } catch { /* no body */ }
  }
  try {
    const { runSequences } = await import("@/lib/comms/sequences.server");
    return json({ ok: true, ...(await runSequences({ dryRun })) });
  } catch (err) {
    console.error("[comms-sequences] cron failed:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/comms-sequences")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
