// "View metrics" popup for a single campaign on the Home dashboard.
// Two big cards: Audience (lead funnel) and Emails (delivery + engagement).
import { useQuery } from "@tanstack/react-query";
import { Loader2, Users, Mail } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { fetchCampaignMetrics, type CampaignMetrics } from "@/lib/outreach-api";

interface Campaign {
  id: string;
  name: string;
  total_leads: number;
  total_campuses: number;
  daily_limit: number;
  status: string;
}

export function CampaignMetricsModal({
  open,
  onOpenChange,
  campaign,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign | null;
}) {
  const q = useQuery({
    queryKey: ["campaign-metrics-detail", campaign?.id],
    queryFn: () => fetchCampaignMetrics(campaign!.id),
    enabled: open && !!campaign,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{campaign?.name ?? "Campaign metrics"}</DialogTitle>
        </DialogHeader>

        {!campaign ? null : q.isLoading || !q.data ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-4 w-4 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <AudienceCard campaign={campaign} m={q.data} />
            <EmailsCard m={q.data} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AudienceCard({ campaign, m }: { campaign: Campaign; m: CampaignMetrics }) {
  const estDays = campaign.daily_limit > 0 ? Math.ceil(m.remaining / campaign.daily_limit) : null;
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Audience</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Total leads" value={m.total} large />
        <Stat label="Campuses" value={campaign.total_campuses} large />
        <Stat label="Scheduled" value={m.scheduled} />
        <Stat label="Queued" value={m.queued} />
        <Stat label="Remaining" value={m.remaining} />
        <Stat label="Stopped" value={m.stopped} />
        <Stat label="Daily cap" value={campaign.daily_limit} />
        <Stat label="Days to finish" value={estDays ?? "—"} />
      </div>
      {m.next_send_at && (
        <div className="mt-3 text-[11px] text-muted-foreground">
          Next send: {new Date(m.next_send_at).toLocaleString()}
        </div>
      )}
    </Card>
  );
}

function EmailsCard({ m }: { m: CampaignMetrics }) {
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Emails</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sent" value={m.sent} large />
        <Stat label="Replied" value={m.replied} large />
        <Stat label="Opens" value={m.opened} sub={pct(m.opened, m.sent) + " open rate"} />
        <Stat label="Clicks" value={m.clicked} sub={pct(m.clicked, m.sent) + " click rate"} />
        <Stat label="Reply rate" value={pct(m.replied, m.sent)} />
        <Stat label="Bounced" value={m.bounced} />
        <Stat label="Complaints" value={m.complained} />
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  large,
  sub,
}: {
  label: string;
  value: number | string;
  large?: boolean;
  sub?: string;
}) {
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

export default CampaignMetricsModal;
