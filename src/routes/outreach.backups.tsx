// /outreach/backups — admin view for the nightly R2 backup job.
// Lists the latest daily backups per group (row counts + size from the sidecar
// manifests), monthly/annual promotion counts, signed download links (15-min
// TTL), and a "Run now" button that fires the same job manually. Gated by the
// parent /outreach AdminGate.
import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Download, RefreshCw, Play, Database, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  listBackups,
  getBackupDownloadUrl,
  runBackupNow,
  type ListBackupsResult,
} from "@/lib/backups-admin.functions";

export const Route = createFileRoute("/outreach/backups")({
  component: BackupsPage,
});

function fmtBytes(n: number): string {
  if (!n) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function fmtDate(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd || "—";
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function BackupsPage() {
  const list = useServerFn(listBackups);
  const runNow = useServerFn(runBackupNow);
  const getUrl = useServerFn(getBackupDownloadUrl);

  const [data, setData] = useState<ListBackupsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setData(await list({ data: { perGroup: 10 } }));
    } catch (e) {
      toast.error(`Couldn't load backups: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [list]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onRunNow = async () => {
    if (!confirm("Run all three backups now? This dumps the DB to R2.")) return;
    setRunning(true);
    try {
      const res = await runNow({ data: {} });
      const failed = res.groups.filter((g) => !g.ok);
      if (res.ok) {
        toast.success(
          `Backup complete — ${res.groups.map((g) => `${g.group}: ${g.totalRows} rows`).join(", ")}`,
        );
      } else {
        toast.error(
          `Backup finished with errors: ${failed
            .map((g) => `${g.group}${g.failedTable ? ` (${g.failedTable})` : ""}`)
            .join(", ")}`,
        );
      }
      await refresh();
    } catch (e) {
      toast.error(`Run failed: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  };

  const onDownload = async (key: string) => {
    try {
      const { url } = await getUrl({ data: { key } });
      window.open(url, "_blank", "noopener");
    } catch (e) {
      toast.error(`Couldn't sign URL: ${(e as Error).message}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Database className="h-5 w-5" /> Backups
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Nightly at 04:00 UTC → Cloudflare R2. Daily kept 30 · monthly 12 · annual forever.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" onClick={() => void onRunNow()} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-10 flex items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : data && !data.configured ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4" /> R2 not configured yet
          </div>
          <p className="mt-1">
            Set <code>R2_ACCOUNT_ID</code>, <code>R2_ACCESS_KEY_ID</code>, and{" "}
            <code>R2_SECRET_ACCESS_KEY</code> in the Vercel project (and local <code>.env</code>).
            Optional: <code>R2_BACKUP_BUCKET</code> (defaults to{" "}
            <code>surviveaccounting-backups</code>). Cron auth uses <code>CRON_SECRET</code>. Once
            set, the nightly job and this page start working. You can still hit “Run now” to test.
          </p>
        </div>
      ) : (
        data && (
          <>
            <div className="mt-6 space-y-5">
              {data.groups.map((g) => (
                <div key={g.group} className="rounded-lg border border-border bg-card">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-4 py-3">
                    <div>
                      <h2 className="text-sm font-semibold capitalize">{g.label}</h2>
                      <p className="text-xs text-muted-foreground">{g.description}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      monthly: {g.monthlyCount}/12 · annual: {g.annualCount}
                    </div>
                  </div>
                  {g.daily.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-muted-foreground">No backups yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="px-4 py-2 font-medium">Date</th>
                            <th className="px-4 py-2 font-medium">Tables</th>
                            <th className="px-4 py-2 font-medium">Rows</th>
                            <th className="px-4 py-2 font-medium">Size</th>
                            <th className="px-4 py-2 font-medium text-right">Download</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.daily.map((b) => (
                            <tr key={b.zipKey} className="border-b border-border/60 last:border-0">
                              <td className="px-4 py-2 font-medium">{fmtDate(b.date)}</td>
                              <td className="px-4 py-2 tabular-nums">{b.tableCount}</td>
                              <td className="px-4 py-2 tabular-nums">{b.totalRows.toLocaleString()}</td>
                              <td className="px-4 py-2 tabular-nums">{fmtBytes(b.zipBytes)}</td>
                              <td className="px-4 py-2 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void onDownload(b.zipKey)}
                                >
                                  <Download className="h-4 w-4" /> .zip
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {data.unresolved.length > 0 && (
              <details className="mt-6 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <summary className="cursor-pointer font-medium">
                  Table mapping notes ({data.unresolved.length})
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {data.unresolved.map((u) => (
                    <li key={u.requested}>
                      <code>{u.requested}</code> → {u.resolution}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )
      )}
    </div>
  );
}
