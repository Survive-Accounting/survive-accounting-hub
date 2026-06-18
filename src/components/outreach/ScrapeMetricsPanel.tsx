// Aggregate metrics for all scrape jobs ever run on this workspace, shown as
// a collapsible button at the top of the Scrape Queue HUD. Persists across
// reloads (data lives in `scrape_jobs` + `campus_lead_suggestions`) and
// refreshes whenever a job finishes (the queue component already subscribes
// to realtime; we just re-query on visibility changes + a slow timer).
import { useEffect, useState } from "react";
import { ChevronDown, BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

// Rough per-scrape cost estimates (USD). Tune as real billing data comes in.
//  - Faculty: SerpAPI discovery (~$0.005) + Firecrawl scrape×~2 + AI extract
//    (~$0.030) + occasional profile enrichment (~$0.005) ≈ $0.04
//  - RMP: free GraphQL (~$0); reverse-lookup DB writes are negligible.
const COST_FACULTY_SCRAPE_USD = 0.04;
const COST_RMP_SCRAPE_USD = 0.005;

type Metrics = {
  totalJobs: number;
  successJobs: number;
  errorJobs: number;
  facultySuccess: number;
  rmpSuccess: number;
  uniqueDepts: number;        // unique campuses with a successful faculty scrape
  totalLeads: number;         // active campus_lead_suggestions from scrapes
  avgDurationMs: number | null;
  totalCostUsd: number;
  avgCostUsd: number | null;
  costPerDeptUsd: number | null;
  costPerLeadUsd: number | null;
};

const EMPTY: Metrics = {
  totalJobs: 0, successJobs: 0, errorJobs: 0,
  facultySuccess: 0, rmpSuccess: 0, uniqueDepts: 0, totalLeads: 0,
  avgDurationMs: null, totalCostUsd: 0, avgCostUsd: null,
  costPerDeptUsd: null, costPerLeadUsd: null,
};

async function loadMetrics(): Promise<Metrics> {
  // Pull every finished job — payload is small (~9 cols, finished jobs only)
  // and we need durations + per-campus uniqueness. Cap to a generous limit.
  const [{ data: jobs }, { count: leadsCount }] = await Promise.all([
    supabase
      .from("scrape_jobs")
      .select("campus_id,kind,status,started_at,finished_at")
      .in("status", ["success", "error"])
      .order("started_at", { ascending: false })
      .limit(5000),
    supabase
      .from("campus_lead_suggestions")
      .select("id", { count: "exact", head: true })
      .eq("research_mode", "faculty_scrape")
      .is("archived_at", null),
  ]);

  const rows = (jobs ?? []) as Array<{
    campus_id: string;
    kind: "faculty" | "rmp";
    status: "success" | "error";
    started_at: string;
    finished_at: string | null;
  }>;

  let successJobs = 0;
  let errorJobs = 0;
  let facultySuccess = 0;
  let rmpSuccess = 0;
  let totalDurationMs = 0;
  let durationCount = 0;
  const facultyCampuses = new Set<string>();

  for (const r of rows) {
    if (r.status === "error") { errorJobs++; continue; }
    successJobs++;
    if (r.kind === "faculty") {
      facultySuccess++;
      facultyCampuses.add(r.campus_id);
    } else {
      rmpSuccess++;
    }
    if (r.finished_at) {
      const d = new Date(r.finished_at).getTime() - new Date(r.started_at).getTime();
      if (d > 0 && d < 30 * 60 * 1000) { totalDurationMs += d; durationCount++; }
    }
  }

  const totalCostUsd =
    facultySuccess * COST_FACULTY_SCRAPE_USD + rmpSuccess * COST_RMP_SCRAPE_USD;
  const avgCostUsd = successJobs > 0 ? totalCostUsd / successJobs : null;
  const avgDurationMs = durationCount > 0 ? totalDurationMs / durationCount : null;
  const totalLeads = leadsCount ?? 0;

  return {
    totalJobs: successJobs + errorJobs,
    successJobs,
    errorJobs,
    facultySuccess,
    rmpSuccess,
    uniqueDepts: facultyCampuses.size,
    totalLeads,
    avgDurationMs,
    totalCostUsd,
    avgCostUsd,
    // Cost-per-dept only counts faculty cost (RMP is per-campus anyway and
    // cheap enough not to muddy the per-department number).
    costPerDeptUsd: facultyCampuses.size > 0
      ? (facultySuccess * COST_FACULTY_SCRAPE_USD) / facultyCampuses.size
      : null,
    costPerLeadUsd: totalLeads > 0 ? totalCostUsd / totalLeads : null,
  };
}

function fmtUsd(n: number | null, digits = 4): string {
  if (n == null) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(digits)}`;
}
function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s - m * 60);
  return `${m}m ${rem}s`;
}

export function ScrapeMetricsPanel({ refreshKey }: { refreshKey?: number }) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const m = await loadMetrics();
      setMetrics(m);
      setLoadedAt(Date.now());
    } finally {
      setLoading(false);
    }
  };

  // Load on mount + whenever the queue says a job state changed (refreshKey)
  // + every 60s as a safety net while the panel is open.
  useEffect(() => { void refresh(); }, [refreshKey]);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => { void refresh(); }, 60_000);
    return () => clearInterval(t);
  }, [open]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="px-1 pb-1.5">
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10.5px] font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent">
        <BarChart3 className="h-3 w-3 text-sidebar-foreground/60" />
        <span className="uppercase tracking-wide">Scrape Metrics</span>
        <span className="ml-1 font-mono tabular-nums text-sidebar-foreground/55">
          {metrics.uniqueDepts}d · {fmtUsd(metrics.totalCostUsd, 2)}
        </span>
        <ChevronDown
          className={`ml-auto h-3 w-3 text-sidebar-foreground/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 rounded border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-1.5 text-[10.5px] text-sidebar-foreground/90">
          <Row k="ACCY depts scraped" v={`${metrics.uniqueDepts}`} />
          <Row k="Total leads" v={`${metrics.totalLeads}`} />
          <div className="my-1 border-t border-sidebar-border/50" />
          <Row k="Avg time / scrape" v={fmtMs(metrics.avgDurationMs)} />
          <Row k="Avg cost / scrape" v={fmtUsd(metrics.avgCostUsd)} />
          <div className="my-1 border-t border-sidebar-border/50" />
          <Row k="Total scrape cost" v={fmtUsd(metrics.totalCostUsd, 2)} strong />
          <Row k="~ Cost / dept" v={fmtUsd(metrics.costPerDeptUsd)} />
          <Row k="~ Cost / lead" v={fmtUsd(metrics.costPerLeadUsd)} />
          <div className="mt-1.5 flex items-center justify-between gap-1 pt-1 text-[9.5px] text-sidebar-foreground/50">
            <span>
              {metrics.successJobs} ok · {metrics.errorJobs} err
              {" · "}f:{metrics.facultySuccess} r:{metrics.rmpSuccess}
            </span>
            <button
              type="button"
              onClick={() => { void refresh(); }}
              disabled={loading}
              title={loadedAt ? `Refreshed ${new Date(loadedAt).toLocaleTimeString()}` : "Refresh"}
              className="rounded p-0.5 hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-50"
            >
              <RefreshCw className={`h-2.5 w-2.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="text-[9px] italic text-sidebar-foreground/45">
            Est. ${COST_FACULTY_SCRAPE_USD.toFixed(3)}/faculty, ${COST_RMP_SCRAPE_USD.toFixed(3)}/RMP scrape.
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Row({ k, v, strong = false }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sidebar-foreground/70">{k}</span>
      <span className={`font-mono tabular-nums ${strong ? "font-semibold text-sidebar-foreground" : ""}`}>{v}</span>
    </div>
  );
}

export default ScrapeMetricsPanel;
