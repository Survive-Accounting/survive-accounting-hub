// List campaigns with status, metrics, and "Schedule Campaign" action.
import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Loader2, ListChecks, Megaphone, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchCampaigns,
  fetchCampaignMetrics,
  scheduleCampaign,
  type CampaignSummary,
  type CampaignMetrics,
} from "@/lib/outreach-api";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  running: "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-50 text-rose-700 border-rose-200",
};

export function CampaignsListPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["outreach-campaigns"], queryFn: fetchCampaigns });
  const campaigns = q.data ?? [];

  const metricQueries = useQueries({
    queries: campaigns.map((c) => ({
      queryKey: ["campaign-metrics", c.id],
      queryFn: () => fetchCampaignMetrics(c.id),
      staleTime: 30_000,
    })),
  });
  const metricsById = useMemo(() => {
    const m = new Map<string, CampaignMetrics>();
    campaigns.forEach((c, i) => {
      const data = metricQueries[i]?.data;
      if (data) m.set(c.id, data);
    });
    return m;
  }, [campaigns, metricQueries]);

  const [scheduling, setScheduling] = useState<string | null>(null);
  const scheduleMut = useMutation({
    mutationFn: (id: string) => scheduleCampaign(id),
    onMutate: (id) => setScheduling(id),
    onSuccess: (res) => {
      toast.success(
        `Scheduled ${res.scheduled} email${res.scheduled === 1 ? "" : "s"}.` +
          (res.skipped_conflicts ? ` Skipped ${res.skipped_conflicts} conflicts.` : "") +
          (res.first_send_at ? ` First send: ${new Date(res.first_send_at).toLocaleDateString()}.` : ""),
      );
      qc.invalidateQueries({ queryKey: ["outreach-campaigns"] });
      qc.invalidateQueries({ queryKey: ["campaign-metrics"] });
      qc.invalidateQueries({ queryKey: ["outreach-leads"] });
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setScheduling(null),
  });

  if (q.isLoading) {
    return <Card className="p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading campaigns…</Card>;
  }
  if (!campaigns.length) {
    return (
      <Card className="p-6 text-center">
        <Megaphone className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
        <div className="text-sm font-medium">No campaigns yet</div>
        <div className="text-xs text-muted-foreground mt-1">
          Use the Campaign Builder above to create a draft, then schedule it here.
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <ListChecks className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Campaigns</h3>
        <span className="text-[11px] text-muted-foreground">{campaigns.length} total</span>
      </div>
      <div className="divide-y divide-border">
        {campaigns.map((c) => (
          <CampaignRow
            key={c.id}
            campaign={c}
            metrics={metricsById.get(c.id) ?? null}
            isScheduling={scheduling === c.id}
            onSchedule={() => scheduleMut.mutate(c.id)}
          />
        ))}
      </div>
    </Card>
  );
}

function CampaignRow({
  campaign, metrics, isScheduling, onSchedule,
}: {
  campaign: CampaignSummary;
  metrics: CampaignMetrics | null;
  isScheduling: boolean;
  onSchedule: () => void;
}) {
  const [open, setOpen] = useState(false);
  const canSchedule = ["draft", "paused"].includes(campaign.status);
  const remaining = metrics ? metrics.remaining : Math.max(0, campaign.total_leads - 0);
  const estDays = campaign.daily_limit > 0 ? Math.ceil(remaining / campaign.daily_limit) : null;

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        <button onClick={() => setOpen((v) => !v)} className="text-muted-foreground hover:text-foreground">
          <ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{campaign.name}</span>
            <Badge variant="outline" className={`text-[10px] ${STATUS_COLORS[campaign.status] ?? ""}`}>
              {campaign.status}
            </Badge>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {campaign.total_leads.toLocaleString()} leads · {campaign.total_campuses} campuses ·
            limit {campaign.daily_limit}/day
            {estDays != null && ` · ~${estDays} day${estDays === 1 ? "" : "s"} remaining`}
          </div>
        </div>
        <Button
          size="sm"
          onClick={onSchedule}
          disabled={!canSchedule || isScheduling}
          variant={canSchedule ? "default" : "outline"}
        >
          {isScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
          {campaign.status === "scheduled" ? "Re-schedule new" : "Schedule"}
        </Button>
      </div>

      {open && metrics && (
        <div className="mt-3 ml-7 grid grid-cols-3 sm:grid-cols-6 gap-3 text-xs">
          <Stat label="Scheduled" value={metrics.scheduled} />
          <Stat label="Sent" value={metrics.sent} />
          <Stat label="Opened" value={metrics.opened} />
          <Stat label="Clicked" value={metrics.clicked} />
          <Stat label="Replied" value={metrics.replied} />
          <Stat label="Bounced" value={metrics.bounced} />
          <Stat label="Complained" value={metrics.complained} />
          <Stat label="Stopped" value={metrics.stopped} />
          <Stat label="Remaining" value={metrics.remaining} />
          <div className="col-span-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Est. completion</div>
            <div className="text-sm">
              {metrics.estimated_completion
                ? new Date(metrics.estimated_completion).toLocaleDateString()
                : "—"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value.toLocaleString()}</div>
    </div>
  );
}

export default CampaignsListPanel;
