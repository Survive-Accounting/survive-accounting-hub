// Launch-campaign send cron — fires due pending campaigns at 9am CT.
//
// Campaigns schedule themselves for 9:00 AM CT the next business day. This runs daily at
// 9am CT (DST pair in vercel.json: 14:00 + 15:00 UTC, handler gates on chicagoHour===9)
// and sends every pending campaign whose time has arrived — unless outbound is paused
// globally, or the campaign's partner has auto-approve off (then it waits for Lee).
//
// AUTH — `Authorization: Bearer <CRON_SECRET>`; fails closed when unset. POST bypasses
// the hour gate (manual testing); GET enforces it.
import { createFileRoute } from "@tanstack/react-router";
import { runDueCampaigns } from "@/lib/growth-campaign.functions";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function chicagoHour(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    hour12: false,
  }).format(now);
  return Number(s) % 24;
}

async function handle({ request }: { request: Request }): Promise<Response> {
  const configured = process.env.CRON_SECRET || "";
  if (!configured) return json({ error: "CRON_SECRET not configured" }, 503);
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return json({ error: "Unauthorized" }, 401);

  const manual = request.method === "POST";
  if (!manual && chicagoHour(new Date()) !== 9) return json({ skipped: "not 9am Chicago" });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as { from: (t: string) => any };
  const result = await runDueCampaigns(db);
  return json({ ok: true, ...result });
}

export const Route = createFileRoute("/api/cron/growth-campaigns")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
