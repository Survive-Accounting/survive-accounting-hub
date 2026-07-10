// HTTP entry point for the nightly backup, hit by Vercel Cron at 04:00 UTC
// (see vercel.json). This is a TanStack Start *server route*: a file route whose
// `server.handlers` run on the server and return a Response directly (no React
// component). The `server` option is supported at runtime by createStartHandler
// but isn't in this version's route-option types, so the options object is cast.
//
// AUTH: Vercel Cron automatically sends `Authorization: Bearer <CRON_SECRET>`
// when a CRON_SECRET env var is set on the project. We require a match against
// CRON_SECRET (or BACKUP_CRON_SECRET if you keep it separate from the Supabase
// edge-cron secret). If neither is configured we fail CLOSED — the endpoint is
// never left open, since it triggers a heavy privileged job.
import { createFileRoute } from "@tanstack/react-router";
import { runBackupNow } from "@/lib/backups-admin.functions";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function authorize(request: Request): { ok: true } | { ok: false; res: Response } {
  const configured = process.env.CRON_SECRET || process.env.BACKUP_CRON_SECRET || "";
  if (!configured) {
    return {
      ok: false,
      res: json(
        { error: "Backup cron secret not configured. Set CRON_SECRET in Vercel." },
        503,
      ),
    };
  }
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token !== configured) return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  return { ok: true };
}

async function handleCron({ request }: { request: Request }): Promise<Response> {
  const auth = authorize(request);
  if (!auth.ok) return auth.res;

  try {
    // Delegate to the server function so the heavy backup/R2/aws-sdk graph is
    // reachable only through a createServerFn (stripped from the client bundle),
    // never statically imported by this client-shipped route file.
    const result = await runBackupNow({ data: {} });
    return json(result, result.ok ? 200 : 500);
  } catch (err) {
    // A throw here means the job couldn't even start (e.g. missing R2 env). The
    // per-group SMS handles table-level failures; this is the last-resort guard.
    console.error("[backup] cron handler failed:", err);
    return json({ ok: false, error: (err as Error).message }, 500);
  }
}

export const Route = createFileRoute("/api/cron/backup")({
  // `server.handlers` is a runtime feature not present in this version's types.
  server: { handlers: { GET: handleCron, POST: handleCron } },
} as never);
