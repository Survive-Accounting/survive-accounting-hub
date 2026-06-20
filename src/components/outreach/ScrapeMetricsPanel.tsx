// Aggregate metrics for all scrape jobs ever run on this workspace, shown as
// a collapsible button at the top of the Scrape Queue HUD. Persists across
// reloads (data lives in `scrape_jobs` + `campus_lead_suggestions`) and
// refreshes whenever a job finishes (the queue component already subscribes
// to realtime; we just re-query on visibility changes + a slow timer).
import { useEffect, useState } from "react";
import { ChevronDown, BarChart3, RefreshCw, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listRecentDebugBundles } from "@/lib/scrape-debug.functions";
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
  avgDurationMs: number | null;
  avgContactsPerDept: number | null;
  avgCostPerDeptUsd: number | null;
  avgCostPerContactUsd: number | null;
  successRatePct: number | null;
  totalDepts: number;       // unique campuses with a successful faculty scrape
  totalContacts: number;    // active campus_lead_suggestions from scrapes
  totalCostUsd: number;
  successJobs: number;
  errorJobs: number;
};

const EMPTY: Metrics = {
  avgDurationMs: null, avgContactsPerDept: null, avgCostPerDeptUsd: null,
  avgCostPerContactUsd: null, successRatePct: null,
  totalDepts: 0, totalContacts: 0, totalCostUsd: 0,
  successJobs: 0, errorJobs: 0,
};

async function loadMetrics(): Promise<Metrics> {
  const [{ data: jobs }, { count: leadsCount }, { data: bundles }] = await Promise.all([
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
    // Real, operation-counted per-run costs — the source of truth for spend.
    supabase
      .from("scrape_debug_bundles")
      .select("credits_estimate_usd")
      .limit(10000),
  ]);

  const realTotalCostUsd = ((bundles ?? []) as Array<{ credits_estimate_usd: number | null }>)
    .reduce((s, b) => s + (Number(b.credits_estimate_usd) || 0), 0);

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

  // Prefer the real summed per-run costs; fall back to the flat estimate only
  // when no debug bundles exist yet (e.g. right after a reset).
  const totalCostUsd = realTotalCostUsd > 0
    ? realTotalCostUsd
    : facultySuccess * COST_FACULTY_SCRAPE_USD + rmpSuccess * COST_RMP_SCRAPE_USD;
  const totalDepts = facultyCampuses.size;
  const totalContacts = leadsCount ?? 0;
  const totalJobs = successJobs + errorJobs;

  return {
    avgDurationMs: durationCount > 0 ? totalDurationMs / durationCount : null,
    avgContactsPerDept: totalDepts > 0 ? totalContacts / totalDepts : null,
    avgCostPerDeptUsd: totalDepts > 0 ? totalCostUsd / totalDepts : null,
    avgCostPerContactUsd: totalContacts > 0 ? totalCostUsd / totalContacts : null,
    successRatePct: totalJobs > 0 ? (successJobs / totalJobs) * 100 : null,
    totalDepts,
    totalContacts,
    totalCostUsd,
    successJobs,
    errorJobs,
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
function fmtInt(n: number | null): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString();
}
function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}

export function ScrapeMetricsPanel({ refreshKey }: { refreshKey?: number }) {
  const [open, setOpen] = useState(true);
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
          {fmtInt(metrics.totalDepts)}d · {fmtInt(metrics.totalContacts)}c
        </span>
        <ChevronDown
          className={`ml-auto h-3 w-3 text-sidebar-foreground/50 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 space-y-1 rounded border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-1.5 text-[10.5px] text-sidebar-foreground/90">
          <Row k="Average time" v={fmtMs(metrics.avgDurationMs)} />
          <Row k="Average contacts per dept" v={fmtInt(metrics.avgContactsPerDept)} />
          <Row k="Average cost per dept" v={fmtUsd(metrics.avgCostPerDeptUsd)} />
          <Row k="Average cost per contact" v={fmtUsd(metrics.avgCostPerContactUsd)} />
          <Row k="Success rate" v={fmtPct(metrics.successRatePct)} />
          <div className="my-1 border-t border-sidebar-border/50" />
          <Row k="Total departments scraped" v={fmtInt(metrics.totalDepts)} strong />
          <Row k="Total contacts found" v={fmtInt(metrics.totalContacts)} strong />
          <Row k="Total spent (est.)" v={fmtUsd(metrics.totalCostUsd, 2)} strong />
          <div className="mt-1.5 flex items-center justify-between gap-1 pt-1 text-[9.5px] text-sidebar-foreground/50">
            <span>
              {metrics.successJobs} ok · {metrics.errorJobs} err · total {fmtUsd(metrics.totalCostUsd, 2)}
            </span>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const { bundles } = await listRecentDebugBundles({ data: { limit: 5 } });
                    if (!bundles.length) { toast.info("No debug bundles yet"); return; }
                    const text = bundles.map((b) => {
                      return `=== ${b.campus_name ?? b.campus_id} · ${b.kind} · ${new Date(b.created_at).toLocaleString()} ===\n${b.summary ?? ""}\n${JSON.stringify(b.payload, null, 2)}`;
                    }).join("\n\n");
                    await navigator.clipboard.writeText(text);
                    toast.success(`Copied last ${bundles.length} debug bundle${bundles.length === 1 ? "" : "s"} — paste into chat for analysis`);
                  } catch (e) {
                    toast.error(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
                  }
                }}
                title="Copy last 5 debug bundles to clipboard"
                className="rounded p-0.5 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              >
                <Copy className="h-2.5 w-2.5" />
              </button>
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
          </div>
          <div className="text-[9px] italic text-sidebar-foreground/45">
            Costs are operation-counted per run (profile/directory scrapes, pagination, AI). Calibrate rates in scrape-cost.ts to your Firecrawl plan.
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
