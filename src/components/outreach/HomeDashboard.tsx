// Outreach Home — simplified command center.
// Only two sections: student requests (incoming texts + syllabus uploads)
// and active campaigns with per-card "View metrics".
import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Megaphone, PlusCircle, BarChart3 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchCampaigns,
  fetchCampaignMetrics,
  type CampaignMetrics,
} from "@/lib/outreach-api";
import { StudentRequestsPanel } from "./StudentRequestsPanel";
import { CampaignMetricsModal } from "./CampaignMetricsModal";

interface HomeDashboardProps {
  onCreateCampaign: () => void;
}

export function HomeDashboard({ onCreateCampaign }: HomeDashboardProps) {
  const campaignsQ = useQuery({ queryKey: ["outreach-campaigns"], queryFn: fetchCampaigns });
  const activeCampaigns = (campaignsQ.data ?? []).filter((c) =>
    ["scheduled", "running", "paused"].includes(c.status),
  );

  const metricsQs = useQueries({
    queries: activeCampaigns.map((c) => ({
      queryKey: ["campaign-metrics", c.id],
      queryFn: () => fetchCampaignMetrics(c.id),
      staleTime: 60_000,
    })),
  });
  const metricsById = useMemo(() => {
    const m = new Map<string, CampaignMetrics>();
    activeCampaigns.forEach((c, i) => {
      const d = metricsQs[i]?.data;
      if (d) m.set(c.id, d);
    });
    return m;
  }, [activeCampaigns, metricsQs]);

  const [metricsCampaign, setMetricsCampaign] = useState<(typeof activeCampaigns)[number] | null>(null);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateCampaign} className="gap-1.5">
          <PlusCircle className="h-4 w-4" /> Create Campaign
        </Button>
      </div>

      <StudentRequestsPanel />

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Active campaigns</h2>
        </div>
        {activeCampaigns.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No active campaigns. Create one to start outreach.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {activeCampaigns.map((c) => {
              const m = metricsById.get(c.id);
              const remaining = m ? m.remaining : c.total_leads;
              const estDays = c.daily_limit > 0 ? Math.ceil(remaining / c.daily_limit) : null;
              return (
                <Card key={c.id} className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {c.total_leads.toLocaleString()} leads · {c.total_campuses} campuses ·{" "}
                        {c.daily_limit}/day
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs">
                    <MiniStat label="Sent" value={m?.sent ?? 0} />
                    <MiniStat label="Replied" value={m?.replied ?? 0} />
                    <MiniStat label="Remaining" value={remaining} />
                    <MiniStat label="Days left" value={estDays ?? 0} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="outline" onClick={() => setMetricsCampaign(c)} className="gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" /> View metrics
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <CampaignMetricsModal
        open={!!metricsCampaign}
        onOpenChange={(v) => !v && setMetricsCampaign(null)}
        campaign={metricsCampaign}
      />
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

export default HomeDashboard;
