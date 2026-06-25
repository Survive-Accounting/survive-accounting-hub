// /outreach/campaign-metrics — campaign outcomes that actually matter: sends,
// opens, clicks, replies, bounces (per campaign + aggregate), plus booked intakes.
// Replaces the old scrape-metrics noise. Reads live data via the same helpers the
// per-campaign metrics modal uses.
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueries } from "@tanstack/react-query";
import { Loader2, Mail, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCampaigns,
  fetchCampaignMetrics,
  type CampaignMetrics,
} from "@/lib/outreach-api";

export const Route = createFileRoute("/outreach/campaign-metrics")({
  head: () => ({ meta: [{ title: "Campaign Metrics — Survive Accounting" }] }),
  component: CampaignMetricsPage,
});

// Booked intakes — defensive: if the column/table differs, fall back to null
// rather than breaking the page.
async function fetchBookedIntakes(): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("student_intake_submissions")
      .select("id", { count: "exact", head: true })
      .not("onboarding_finished_at", "is", null);
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

function CampaignMetricsPage() {
  const campaignsQ = useQuery({ queryKey: ["campaigns"], queryFn: fetchCampaigns, retry: 1 });
  const bookedQ = useQuery({ queryKey: ["booked-intakes"], queryFn: fetchBookedIntakes, retry: 0 });
  const campaigns = campaignsQ.data ?? [];

  const metricsQs = useQueries({
    queries: campaigns.map((c) => ({
      queryKey: ["campaign-metrics-detail", c.id],
      queryFn: () => fetchCampaignMetrics(c.id),
      enabled: campaigns.length > 0,
    })),
  });

  const allMetrics = metricsQs.map((q) => q.data).filter(Boolean) as CampaignMetrics[];
  const loadingMetrics = metricsQs.some((q) => q.isLoading);

  const agg = allMetrics.reduce(
    (a, m) => ({
      sent: a.sent + m.sent,
      opened: a.opened + m.opened,
      clicked: a.clicked + m.clicked,
      replied: a.replied + m.replied,
      bounced: a.bounced + m.bounced,
      complained: a.complained + m.complained,
    }),
    { sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, complained: 0 },
  );

  const refresh = () => {
    campaignsQ.refetch();
    bookedQ.refetch();
    metricsQs.forEach((q) => q.refetch());
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-lg font-semibold">Campaign Metrics</h1>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto gap-1.5"
          onClick={refresh}
          disabled={campaignsQ.isLoading || loadingMetrics}
        >
          <RotateCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Aggregate cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Sent" value={agg.sent} large />
        <Stat label="Opens" value={agg.opened} sub={pct(agg.opened, agg.sent) + " rate"} />
        <Stat label="Clicks" value={agg.clicked} sub={pct(agg.clicked, agg.sent) + " rate"} />
        <Stat label="Replies" value={agg.replied} sub={pct(agg.replied, agg.sent) + " rate"} />
        <Stat label="Bounced" value={agg.bounced} />
        <Stat
          label="Booked intakes"
          value={bookedQ.data == null ? "—" : bookedQ.data}
          sub="onboarding finished"
        />
      </div>

      {/* Per-campaign breakdown */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Campaign</th>
              <th className="px-2 py-2 text-right">Sent</th>
              <th className="px-2 py-2 text-right">Opens</th>
              <th className="px-2 py-2 text-right">Clicks</th>
              <th className="px-2 py-2 text-right">Replies</th>
              <th className="px-2 py-2 text-right">Bounced</th>
              <th className="px-2 py-2 text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {campaignsQ.isLoading ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : campaigns.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <Mail className="mx-auto mb-2 h-5 w-5 opacity-50" />
                  No campaigns yet. Build a Priority Queue and start a send to see results here.
                </td>
              </tr>
            ) : (
              campaigns.map((c, i) => {
                const m = metricsQs[i]?.data;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-accent/40">
                    <td className="px-3 py-1.5">
                      <span className="font-medium">{c.name}</span>
                      <span className="ml-1.5 text-[11px] text-muted-foreground">{c.status}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.sent.toLocaleString() : "…"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.opened.toLocaleString() : "…"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.clicked.toLocaleString() : "…"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.replied.toLocaleString() : "…"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.bounced.toLocaleString() : "…"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{m ? m.remaining.toLocaleString() : "…"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Open/click/reply rates are a share of <strong>Sent</strong>. Booked intakes counts students who
        finished onboarding via their booking link.
      </p>
    </div>
  );
}

function Stat({
  label, value, large, sub,
}: { label: string; value: number | string; large?: boolean; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={large ? "text-xl font-semibold tabular-nums" : "text-base font-medium tabular-nums"}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
