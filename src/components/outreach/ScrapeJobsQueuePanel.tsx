// Sidebar HUD showing recent faculty + RMP scrape jobs across campuses so Lee
// can fire off many in parallel and still see which succeeded / failed / are
// still running. Clicking a row jumps to that campus's leadfinder page.
// Jobs are persisted in the `scrape_jobs` table and streamed via realtime, so
// the HUD survives reloads and a server-side watchdog auto-fails stuck rows.
import { Landmark, GraduationCap, Loader2, CheckCircle2, XCircle, X, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  useScrapeJobs,
  clearFinishedScrapeJobs,
  runScrapeJobsWatchdog,
  type ScrapeJob,
} from "@/lib/scrape-jobs";


function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h`;
}

function JobIcon({ kind }: { kind: ScrapeJob["kind"] }) {
  return kind === "faculty"
    ? <Landmark className="h-3.5 w-3.5 text-sky-600" />
    : <GraduationCap className="h-3.5 w-3.5 text-amber-600" />;
}

function StatusIcon({ status }: { status: ScrapeJob["status"] }) {
  if (status === "running") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (status === "success") return <CheckCircle2 className="h-3 w-3 text-emerald-600" />;
  return <XCircle className="h-3 w-3 text-rose-600" />;
}

export function ScrapeJobsQueuePanel() {
  const jobs = useScrapeJobs();
  if (jobs.length === 0) return null;

  const running = jobs.filter((j) => j.status === "running").length;
  const finished = jobs.length - running;

  return (
    <div className="border-t border-sidebar-border px-2 py-2 group-data-[collapsible=icon]:hidden">
      <div className="flex items-center justify-between px-1 pb-1">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/60">
          Scrape Queue {running > 0 && <span className="text-amber-600">· {running} running</span>}
        </div>
        <div className="flex items-center gap-0.5">
          {running > 0 && (
            <button
              type="button"
              onClick={async () => {
                const n = await runScrapeJobsWatchdog();
                toast.success(
                  n > 0 ? `Force-failed ${n} stuck job${n === 1 ? "" : "s"}` : "No stuck jobs (>8m old)",
                );
              }}
              title="Force-fail any job stuck running for more than 8 minutes"
              className="rounded p-0.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <ShieldAlert className="h-3 w-3" />
            </button>
          )}
          {finished > 0 && (
            <button
              type="button"
              onClick={() => { void clearFinishedScrapeJobs(); }}
              title="Clear finished jobs"
              className="rounded p-0.5 text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

      </div>
      <ul className="max-h-64 space-y-0.5 overflow-y-auto">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link
              to="/outreach/leadfinder/$campusId"
              params={{ campusId: j.campusId }}
              title={
                j.message
                  ? `${j.kind === "faculty" ? "Faculty" : "RMP"} · ${j.status} · ${j.message}`
                  : `${j.kind === "faculty" ? "Faculty" : "RMP"} · ${j.status}`
              }
              className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] hover:bg-sidebar-accent"
            >
              <JobIcon kind={j.kind} />
              <span className="flex-1 truncate text-sidebar-foreground">{j.campusName}</span>
              <StatusIcon status={j.status} />
              <span className="font-mono text-[9px] tabular-nums text-sidebar-foreground/50">
                {timeAgo(j.endedAt ?? j.startedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ScrapeJobsQueuePanel;
