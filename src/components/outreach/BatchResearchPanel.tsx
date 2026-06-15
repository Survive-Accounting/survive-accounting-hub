// BatchResearchPanel — kicks off background research across many campuses
// and surfaces progress while the user is away.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLatestCampusBatch,
  startCampusBatch,
  pauseCampusBatch,
  resumeCampusBatch,
  cancelCampusBatch,
  retryCampusBatchItems,
  tickCampusBatch,
  type CampusResearchJobItem,
} from "@/lib/outreach-api";
import type { Campus } from "@/lib/outreach-mock";

const FAMILY_SHORT: Record<string, string> = {
  intro_1: "I1", intro_2: "I2", intermediate_1: "IA1", intermediate_2: "IA2",
  finance: "Fin", business_stats: "Stat", business_analytics: "Anal",
  microeconomics: "Mic", macroeconomics: "Mac",
};

export function BatchResearchPanel({ campuses }: { campuses: Campus[] }) {
  const qc = useQueryClient();
  const [starting, setStarting] = useState(false);
  const [showFailed, setShowFailed] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const batchQ = useQuery({
    queryKey: ["campus-research-batch"],
    queryFn: getLatestCampusBatch,
    refetchInterval: (q) => {
      const d = q.state.data as any;
      return d?.job?.status === "running" ? 5000 : false;
    },
  });

  // Drive the worker from the client too — pg_cron handles every minute,
  // but polling here gives much snappier feedback while the tab is open.
  useEffect(() => {
    const data = batchQ.data;
    if (data?.job?.status !== "running") return;
    const t = setInterval(() => { tickCampusBatch(data.job.id).catch(() => {}); }, 20000);
    return () => clearInterval(t);
  }, [batchQ.data?.job?.id, batchQ.data?.job?.status]);

  const campusById = useMemo(() => {
    const m = new Map<string, Campus>();
    campuses.forEach((c) => m.set(c.id, c));
    return m;
  }, [campuses]);

  const data = batchQ.data;
  const items = data?.items ?? [];
  const job = data?.job;

  const running = items.filter((i) => i.status === "running");
  const done = items.filter((i) => i.status === "done");
  const failed = items.filter((i) => i.status === "failed");
  const pending = items.filter((i) => i.status === "pending");

  async function handleStartAll() {
    const candidates = campuses.filter((c) => !c.archived);
    if (!candidates.length) return;
    const estCost = (candidates.length * 0.04).toFixed(2);
    const ok = window.confirm(
      `Start batch research for ${candidates.length} campuses?\n\n` +
      `Estimated cost: ~$${estCost} in AI credits (≈ $0.04/campus).\n` +
      `Runtime: ~${Math.ceil(candidates.length / 3 * 0.5)} minutes at 3 in parallel.\n\n` +
      `You can close this tab — pg_cron will continue running every minute.`
    );
    if (!ok) return;
    setStarting(true);
    try {
      await startCampusBatch(candidates.map((c) => c.id), `All ${candidates.length} active campuses`);
      await qc.invalidateQueries({ queryKey: ["campus-research-batch"] });
    } catch (e) {
      window.alert(`Could not start batch: ${(e as Error).message}`);
    } finally {
      setStarting(false);
    }
  }

  async function handleRetryAll() {
    if (!job) return;
    await retryCampusBatchItems(job.id);
    await qc.invalidateQueries({ queryKey: ["campus-research-batch"] });
  }
  async function handleRetryOne(item: CampusResearchJobItem) {
    if (!job) return;
    await retryCampusBatchItems(job.id, [item.id]);
    await qc.invalidateQueries({ queryKey: ["campus-research-batch"] });
  }

  if (!job) {
    return (
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold">Batch AI Research</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Run the full research pipeline (profile → suggested leads → class sections) across every active campus.
              Runs 3 in parallel in the background. Safe to close this tab.
            </p>
          </div>
          <button
            onClick={handleStartAll}
            disabled={starting}
            className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {starting ? "Starting…" : `Run on all ${campuses.filter((c) => !c.archived).length} campuses`}
          </button>
        </div>
      </div>
    );
  }

  const pct = job.total_count ? Math.round((done.length + failed.length) / job.total_count * 100) : 0;
  const statusColor =
    job.status === "done" ? "bg-emerald-500"
    : job.status === "canceled" ? "bg-zinc-400"
    : job.status === "paused" ? "bg-amber-500"
    : "bg-sky-500";

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${statusColor}`} />
            <h3 className="text-sm font-semibold">
              Batch AI Research — {job.status}
            </h3>
            <span className="text-xs text-muted-foreground">
              {new Date(job.created_at).toLocaleString()}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {done.length} done · {running.length} running · {pending.length} pending · {failed.length} failed
            {job.notes ? ` · ${job.notes}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {job.status === "running" && (
            <button
              onClick={() => job && pauseCampusBatch(job.id).then(() => qc.invalidateQueries({ queryKey: ["campus-research-batch"] }))}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >Pause</button>
          )}
          {job.status === "paused" && (
            <button
              onClick={() => job && resumeCampusBatch(job.id).then(() => qc.invalidateQueries({ queryKey: ["campus-research-batch"] }))}
              className="rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
            >Resume</button>
          )}
          {(job.status === "running" || job.status === "paused") && (
            <button
              onClick={() => {
                if (!window.confirm("Cancel this batch? In-progress campuses will finish, but no new ones will start.")) return;
                cancelCampusBatch(job.id).then(() => qc.invalidateQueries({ queryKey: ["campus-research-batch"] }));
              }}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-destructive hover:bg-destructive/10"
            >Cancel</button>
          )}
          {(job.status === "done" || job.status === "canceled") && (
            <button
              onClick={handleStartAll}
              disabled={starting}
              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >New batch</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-sky-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{pct}% · {done.length + failed.length} / {job.total_count}</div>

      {/* Currently running */}
      {running.length > 0 && (
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="text-xs font-medium mb-1.5">Running now</div>
          <ul className="space-y-1 text-xs">
            {running.map((i) => (
              <li key={i.id} className="flex items-center justify-between">
                <span>{campusById.get(i.campus_id)?.school_name ?? i.campus_id.slice(0, 8)}</span>
                <span className="text-muted-foreground">{i.current_step ?? "…"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <button onClick={() => setShowFailed((v) => !v)} className="text-xs font-medium text-destructive">
              {showFailed ? "▾" : "▸"} {failed.length} failed
            </button>
            <button onClick={handleRetryAll} className="text-xs rounded border border-destructive/40 px-2 py-0.5 hover:bg-destructive/10">
              Retry all failed
            </button>
          </div>
          {showFailed && (
            <ul className="space-y-1.5 text-xs">
              {failed.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{campusById.get(i.campus_id)?.school_name ?? i.campus_id.slice(0, 8)}</div>
                    <div className="text-muted-foreground truncate" title={i.error ?? undefined}>
                      {i.failed_step}: {i.error?.slice(0, 120)}
                    </div>
                  </div>
                  <button onClick={() => handleRetryOne(i)} className="shrink-0 text-xs rounded border border-border px-2 py-0.5 hover:bg-muted">
                    Retry
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Done */}
      {done.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <button onClick={() => setShowDone((v) => !v)} className="text-xs font-medium">
            {showDone ? "▾" : "▸"} {done.length} completed
          </button>
          {showDone && (
            <ul className="mt-2 space-y-1 text-xs max-h-72 overflow-y-auto">
              {done.slice().reverse().map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{campusById.get(i.campus_id)?.school_name ?? i.campus_id.slice(0, 8)}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {i.leads_count} leads · {i.sections_count} sections
                    {i.families_with_zero.length > 0 && (
                      <span className="ml-1 text-amber-600" title={`No sections found: ${i.families_with_zero.join(", ")}`}>
                        ⚠ {i.families_with_zero.map((f) => FAMILY_SHORT[f] ?? f).join(",")}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
