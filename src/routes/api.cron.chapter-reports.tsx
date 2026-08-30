// CHAPTER SIGNUP REPORTS — cron entry (K5, 2026-08-29).
//
// ONE ROUTE, TWO JOBS, chosen by ?kind=:
//   ?kind=surge  (default) — the hourly sweep for chapters whose signups just spiked.
//   ?kind=weekly           — the Sunday digest, gated to 8am Chicago like the other weekly cron.
//
// AUTH is the shared CRON_SECRET bearer, failing closed when no secret is configured — same
// pattern as api.cron.weekly-digest and api.cron.backup.
//
// ── IT DOES NOT SEND UNTIL LEE TURNS IT ON ───────────────────────────────────────────────────
// CHAPTER_REPORTS_ENABLED=1 is the switch. Without it every run is a DRY RUN: real counts, real
// dedupe checks, real logging of what WOULD have gone out — and no email to anybody. The
// response says which mode it ran in, so a dry run can never be mistaken for a live one.
import { createFileRoute } from "@tanstack/react-router";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

  const kind = new URL(request.url).searchParams.get("kind") === "weekly" ? "weekly" : "surge";

  // The weekly run is hour-gated on GET for the same reason the digest is: Vercel Cron is UTC and
  // DST-blind, so two crons are registered and only the 8am-Chicago one does the work. POST
  // bypasses it for manual testing.
  if (kind === "weekly" && request.method.toUpperCase() === "GET") {
    const hour = chicagoHour(new Date());
    if (hour !== 8) return json({ ok: true, ran: false, skipped: `not 8am CT (currently ${hour}:00 CT)` });
  }

  try {
    const mod = await import("@/lib/chapter-reports.server");
    const results = kind === "weekly" ? await mod.runWeeklyChapterReports() : await mod.runSurgeReports();
    const tally = results.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
    return json({
      ok: true,
      kind,
      mode: mod.reportsEnabled() ? "live" : "dry_run",
      considered: results.length,
      tally,
      // The per-chapter detail, so a dry run is inspectable before anyone flips the switch.
      results: results.map((r) => ({ chapter: r.chapterName, status: r.status, signups: r.signups, reason: r.reason ?? null })),
    });
  } catch (err) {
    console.error("[chapter-reports] cron handler failed:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/chapter-reports")({
  // `server.handlers` is a runtime feature not present in this version's route-option types.
  server: { handlers: { GET: handle, POST: handle } },
} as never);
