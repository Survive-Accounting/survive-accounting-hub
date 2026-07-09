// Weekly digest cron entry, hit by Vercel Cron. TanStack Start server route (see
// the same pattern in api.cron.backup.tsx).
//
// SCHEDULING — the target is Sunday 08:00 America/Chicago, but Vercel Cron is
// UTC-only and has no DST awareness. So vercel.json registers TWO Sunday crons
// (13:00 and 14:00 UTC) and this handler only sends when the *current* Chicago
// hour is 8. During CDT (UTC-5) the 13:00 run matches; during CST (UTC-6) the
// 14:00 run matches — exactly one fires at 8am CT year-round.
//
// AUTH — requires `Authorization: Bearer <CRON_SECRET>` (Vercel injects it for
// cron). Fails closed if no secret is configured. POST bypasses the hour gate
// (for manual testing); GET (the cron) enforces it.
import { createFileRoute } from "@tanstack/react-router";
import { runWeeklyDigestNow } from "@/lib/weekly-digest.functions";

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

function authorize(request: Request): { ok: true } | { ok: false; res: Response } {
  const configured = process.env.CRON_SECRET || process.env.BACKUP_CRON_SECRET || "";
  if (!configured) {
    return { ok: false, res: json({ error: "Cron secret not configured. Set CRON_SECRET in Vercel." }, 503) };
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

async function handle({ request }: { request: Request }): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return auth.res;

  // GET = the cron: only proceed at 8am Chicago (dedupes the two UTC crons).
  if (request.method.toUpperCase() === "GET") {
    const hour = chicagoHour(new Date());
    if (hour !== 8) {
      return json({ ok: true, sent: false, skipped: `not 8am CT (currently ${hour}:00 CT)` });
    }
  }

  try {
    const result = await runWeeklyDigestNow({ data: {} });
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    console.error("[weekly-digest] cron handler failed:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/weekly-digest")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
