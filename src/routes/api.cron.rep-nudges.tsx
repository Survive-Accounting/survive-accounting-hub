// REP NUDGES — cron entry. Same auth as the other crons (CRON_SECRET bearer, fails closed when
// unset). Every run sends the 24h / 72h onboarding reminders that are due; the daily one-line
// summary to Lee goes only in the 8am-Chicago hour (Vercel Cron is UTC and DST-blind, so the
// hour is checked here, not in vercel.json). POST bypasses the hour gate for manual testing.
//
// SCHEDULE (2026-09-06): this shipped as hourly ("0 * * * *") and Vercel refused every deploy
// from that commit on — the plan only allows a cron to run once a day (the failure links to
// docs/cron-jobs/usage-and-pricing). Now 13:00 and 14:00 UTC like the other 8am-CT crons: one
// of the two lands in the 8am hour whichever side of DST it is, and the other only runs the
// reminders (idempotent — stamped on send). A reminder is "at least 24h / 72h", not "exactly",
// so a daily run still sends every one, at most a day late.
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function chicagoHour(now: Date): number {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hour12: false }).format(now);
  return Number(s) % 24;
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
  const now = new Date();
  const manual = request.method.toUpperCase() === "POST";
  try {
    const mod = await import("@/lib/rep-nudges.server");
    const reminders = await mod.runRepReminders(now);
    const hour = chicagoHour(now);
    const summary = manual || hour === 8 ? await mod.runRepDailySummary(now) : { sent: false, counts: null, reason: `not 8am CT (currently ${hour}:00 CT)` };
    const tally = reminders.reduce<Record<string, number>>((a, r) => ({ ...a, [`${r.which}_${r.status}`]: (a[`${r.which}_${r.status}`] ?? 0) + 1 }), {});
    return json({ ok: true, reminders: { considered: reminders.length, tally }, summary });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/rep-nudges")({
  server: { handlers: { GET: handle, POST: handle } },
} as never);
