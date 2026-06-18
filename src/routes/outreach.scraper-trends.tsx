// /outreach/scraper-trends — long-term scraper performance dashboard.
// Charts daily aggregates from scrape_debug_bundles, overlays fix milestones,
// and shows the latest AI verdict (cross-vertical applicability included).
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, BarChart3, Loader2, Sparkles, Trash2, Lightbulb,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  ReferenceLine, Legend,
} from "recharts";
import {
  getScraperTrends, listFixMilestones, deleteFixMilestone,
  listPerformanceVerdicts, generatePerformanceVerdict,
} from "@/lib/scraper-trends.functions";

export const Route = createFileRoute("/outreach/scraper-trends")({
  head: () => ({
    meta: [
      { title: "Scraper Trends — Survive Accounting" },
      { name: "description", content: "Long-term scraper performance with AI verdicts and cross-vertical applicability." },
    ],
  }),
  component: ScraperTrendsPage,
});

const RANGES = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "1y", days: 365 },
] as const;

type Verdict = {
  id: string;
  created_at: string;
  window_start: string;
  window_end: string;
  summary: string | null;
  what_changed: { improved?: Array<{ metric: string; delta_pct: number; note: string }>; regressed?: Array<{ metric: string; delta_pct: number; note: string }> } | null;
  fix_attribution: Array<{ milestone_name: string; metric: string; impact_summary: string; confidence: string }> | null;
  vertical_applicability: Array<{ vertical: string; applicable_patterns: string[]; notes: string }> | null;
};

function ScraperTrendsPage() {
  const [days, setDays] = useState<number>(30);
  const qc = useQueryClient();

  const trendsQuery = useQuery({
    queryKey: ["scraper-trends", days],
    queryFn: () => getScraperTrends({ data: { days } }),
  });
  const milestonesQuery = useQuery({
    queryKey: ["scraper-milestones"],
    queryFn: () => listFixMilestones({ data: { limit: 100 } }),
  });
  const verdictsQuery = useQuery({
    queryKey: ["scraper-verdicts"],
    queryFn: () => listPerformanceVerdicts({ data: { limit: 5 } }),
  });

  const genVerdict = useMutation({
    mutationFn: () => generatePerformanceVerdict({ data: { days } }),
    onSuccess: () => {
      toast.success("New AI verdict generated");
      void qc.invalidateQueries({ queryKey: ["scraper-verdicts"] });
    },
    onError: (e) => toast.error(`Verdict failed: ${e instanceof Error ? e.message : String(e)}`),
  });

  const delMilestone = useMutation({
    mutationFn: (id: string) => deleteFixMilestone({ data: { id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["scraper-milestones"] });
      void qc.invalidateQueries({ queryKey: ["scraper-trends"] });
    },
  });

  const series = trendsQuery.data?.series ?? [];
  const milestonesInWindow = trendsQuery.data?.milestones ?? [];
  const latestVerdict = (verdictsQuery.data?.verdicts?.[0] ?? null) as Verdict | null;

  const milestoneByDay = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const m of milestonesInWindow as Array<{ deployed_at: string; name: string }>) {
      const day = m.deployed_at.slice(0, 10);
      const arr = map.get(day) ?? [];
      arr.push(m.name);
      map.set(day, arr);
    }
    return map;
  }, [milestonesInWindow]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/outreach" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Outreach
          </Link>
          <div className="h-4 w-px bg-border" />
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="h-4 w-4 text-primary" />
            Scraper Trends
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded border border-border bg-card">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setDays(r.days)}
                className={`px-2.5 py-1 text-xs ${days === r.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => genVerdict.mutate()}
            disabled={genVerdict.isPending}
            className="inline-flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {genVerdict.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Generate AI verdict
          </button>
        </div>
      </div>

      {/* AI Verdict card */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-amber-500" />
          Latest AI Verdict
          {latestVerdict && (
            <span className="text-xs font-normal text-muted-foreground">
              · {new Date(latestVerdict.created_at).toLocaleString()} · window {Math.round((new Date(latestVerdict.window_end).getTime() - new Date(latestVerdict.window_start).getTime()) / 86400000)}d
            </span>
          )}
        </div>
        {verdictsQuery.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
        ) : latestVerdict ? (
          <div className="space-y-3 text-sm">
            <p className="leading-relaxed text-foreground">{latestVerdict.summary ?? "—"}</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <VerdictBlock title="Improved" color="text-emerald-600">
                {latestVerdict.what_changed?.improved?.length
                  ? latestVerdict.what_changed.improved.map((x, i) => (
                      <li key={i}>
                        <span className="font-mono text-xs">{x.metric}</span>
                        <span className="ml-1 text-emerald-600">+{x.delta_pct}%</span>
                        <div className="text-xs text-muted-foreground">{x.note}</div>
                      </li>
                    ))
                  : <li className="text-xs italic text-muted-foreground">No improvements detected.</li>}
              </VerdictBlock>
              <VerdictBlock title="Regressed" color="text-rose-600">
                {latestVerdict.what_changed?.regressed?.length
                  ? latestVerdict.what_changed.regressed.map((x, i) => (
                      <li key={i}>
                        <span className="font-mono text-xs">{x.metric}</span>
                        <span className="ml-1 text-rose-600">{x.delta_pct}%</span>
                        <div className="text-xs text-muted-foreground">{x.note}</div>
                      </li>
                    ))
                  : <li className="text-xs italic text-muted-foreground">No regressions detected.</li>}
              </VerdictBlock>
              <VerdictBlock title="Fix attribution" color="text-sky-600">
                {latestVerdict.fix_attribution?.length
                  ? latestVerdict.fix_attribution.map((x, i) => (
                      <li key={i}>
                        <span className="font-medium">{x.milestone_name}</span>
                        <span className="ml-1 text-xs text-muted-foreground">({x.confidence})</span>
                        <div className="text-xs text-muted-foreground">{x.impact_summary}</div>
                      </li>
                    ))
                  : <li className="text-xs italic text-muted-foreground">No milestones to attribute yet.</li>}
              </VerdictBlock>
            </div>
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs font-medium text-purple-600">
                <Lightbulb className="h-3 w-3" /> Cross-vertical applicability
              </div>
              {latestVerdict.vertical_applicability?.length ? (
                <ul className="space-y-1.5">
                  {latestVerdict.vertical_applicability.map((v, i) => (
                    <li key={i} className="rounded border border-border bg-muted/30 px-2 py-1.5 text-xs">
                      <div className="font-medium capitalize">{v.vertical.replace(/_/g, " ")}</div>
                      <div className="text-muted-foreground">{v.notes}</div>
                      {v.applicable_patterns?.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {v.applicable_patterns.map((p) => (
                            <span key={p} className="rounded bg-background px-1 py-0.5 font-mono text-[10px]">{p}</span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs italic text-muted-foreground">No cross-vertical signals yet.</div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No verdicts yet. Click <strong className="text-foreground">Generate AI verdict</strong> to create your first rollup analysis.
          </div>
        )}
      </section>

      {/* Charts */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Emails found per run" data={series} dataKey="emailsPerRun" color="#10b981" milestoneByDay={milestoneByDay} />
        <ChartCard title="Contacts inserted per run" data={series} dataKey="contactsPerRun" color="#3b82f6" milestoneByDay={milestoneByDay} />
        <ChartCard title="Success rate (%)" data={series} dataKey="successRatePct" color="#0ea5e9" milestoneByDay={milestoneByDay} suffix="%" />
        <ChartCard title="Cost per contact (USD)" data={series} dataKey="costPerContactUsd" color="#f59e0b" milestoneByDay={milestoneByDay} prefix="$" />
        <ChartCard title="% runs using JS-pagination walker" data={series} dataKey="paginationRunsPct" color="#a855f7" milestoneByDay={milestoneByDay} suffix="%" />
        <ChartCard title="% runs needing map fallback" data={series} dataKey="mapFallbackPct" color="#ef4444" milestoneByDay={milestoneByDay} suffix="%" />
        <ChartCard title="Avg duration (seconds)" data={series} dataKey="avgDurationSec" color="#6366f1" milestoneByDay={milestoneByDay} suffix="s" />
        <ChartCard title="Runs per day" data={series} dataKey="runs" color="#64748b" milestoneByDay={milestoneByDay} />
      </section>

      {/* Milestones list */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Fix Milestones</h2>
          <span className="text-xs text-muted-foreground">{milestonesQuery.data?.milestones?.length ?? 0} total</span>
        </div>
        {milestonesQuery.data?.milestones?.length ? (
          <ul className="divide-y divide-border">
            {milestonesQuery.data.milestones.map((m) => (
              <li key={m.id} className="group flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {new Date(m.deployed_at).toLocaleDateString()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.name}</div>
                  {m.description && <div className="line-clamp-1 text-xs text-muted-foreground">{m.description}</div>}
                  {m.tags?.length > 0 && (
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {m.tags.map((t) => (
                        <span key={t} className="rounded bg-muted px-1 py-0 font-mono text-[10px] text-muted-foreground">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => delMilestone.mutate(m.id)}
                  className="rounded p-1 text-muted-foreground opacity-0 transition hover:bg-muted hover:text-rose-600 group-hover:opacity-100"
                  title="Delete milestone"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded border border-dashed border-border px-4 py-4 text-center text-xs text-muted-foreground">
            No milestones logged yet. Open the AI Suggestions panel in the sidebar and click the green check on a suggestion you've shipped.
          </div>
        )}
      </section>
    </div>
  );
}

function VerdictBlock({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={`mb-1 text-xs font-medium ${color}`}>{title}</div>
      <ul className="space-y-1.5 text-sm">{children}</ul>
    </div>
  );
}

function ChartCard({
  title, data, dataKey, color, milestoneByDay, prefix = "", suffix = "",
}: {
  title: string;
  data: Array<Record<string, number | string | null>>;
  dataKey: string;
  color: string;
  milestoneByDay: Map<string, string[]>;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{title}</div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="day" tick={{ fontSize: 10 }} tickFormatter={(d) => String(d).slice(5)} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${prefix}${v}${suffix}`} />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(v: number | string) => `${prefix}${v}${suffix}`}
            labelFormatter={(label) => {
              const ms = milestoneByDay.get(String(label)) ?? [];
              return ms.length ? `${label} — shipped: ${ms.join(", ")}` : String(label);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 10 }} />
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
          {Array.from(milestoneByDay.entries()).map(([day]) => (
            <ReferenceLine key={day} x={day} stroke="#64748b" strokeDasharray="2 2" />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
