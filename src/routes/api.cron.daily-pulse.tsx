// Daily pulse cron entry, hit by Vercel Cron — the chapter and campus emails (2026-09-11).
//
// SCHEDULING — the target is 07:00 America/Chicago every day, but Vercel Cron is UTC-only with
// no DST awareness, so vercel.json registers TWO daily crons (12:00 and 13:00 UTC) and this
// handler only sends when the current Chicago hour is 7. Same pattern as weekly-digest.
//
// AUTH — `Authorization: Bearer <CRON_SECRET>` (Vercel injects it for cron). Fails closed with no
// secret. POST bypasses the hour gate (manual runs; add {"dryRun":true} to preview without
// sending); GET (the cron) enforces it.
import { createFileRoute } from "@tanstack/react-router";
import { runDailyPulseNow } from "@/lib/daily-pulse.functions";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function chicagoHour(now: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(now)) % 24;
}

function authorize(request: Request): { ok: true } | { ok: false; res: Response } {
  const configured = process.env.CRON_SECRET || process.env.BACKUP_CRON_SECRET || "";
  if (!configured) return { ok: false, res: json({ error: "Cron secret not configured. Set CRON_SECRET in Vercel." }, 503) };
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

async function handle({ request }: { request: Request }): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return auth.res;
  if (request.method.toUpperCase() === "GET") {
    const hour = chicagoHour(new Date());
    if (hour !== 7) return json({ ok: true, sent: 0, skipped: `not 7am CT (currently ${hour}:00 CT)` });
  }
  let dryRun = false;
  if (request.method.toUpperCase() === "POST") {
    try { dryRun = !!((await request.json()) as { dryRun?: boolean })?.dryRun; } catch { /* no body */ }
  }
  try {
    const result = await runDailyPulseNow({ data: { dryRun } });
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    console.error("[daily-pulse] cron handler failed:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/daily-pulse")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
