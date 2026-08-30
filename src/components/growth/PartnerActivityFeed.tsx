// The partner activity feed — Lee's skim surface. One chronological stream across all
// partners (campaigns launched/sent, tranches unlocked, pauses), filterable by partner.
// Designed for 30 seconds a day, not analysis.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Rocket, Send, Trophy, Pause, Play, Circle } from "lucide-react";
import { growthPartnerActivity, growthPartners } from "@/lib/growth-tranche.functions";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Circle> = {
  campaign_launched: Rocket,
  campaign_sent: Send,
  campaign_canceled: Circle,
  tranche_unlocked: Trophy,
  paused_all: Pause,
  resumed_all: Play,
};

function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function PartnerActivityFeed() {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const partners = useQuery({ queryKey: ["growth-partners"], queryFn: () => growthPartners() });
  const feed = useQuery({
    queryKey: ["partner-activity", partnerId],
    queryFn: () => growthPartnerActivity({ data: { partnerId } }),
    staleTime: 20_000,
  });
  const items = feed.data?.items ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="sa-admin-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Partner activity
        </h2>
        <select
          value={partnerId ?? ""}
          onChange={(e) => setPartnerId(e.target.value || null)}
          className="ml-auto rounded-md border border-border bg-card px-2 py-1 text-[11px]"
        >
          <option value="">All partners</option>
          {(partners.data?.partners ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {feed.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Nothing yet.</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const Icon = ICON[it.kind] ?? Circle;
            const alert = it.kind === "paused_all";
            return (
              <div key={it.id} className="flex items-start gap-2 py-1 text-[11px]">
                <Icon
                  className={cn(
                    "mt-0.5 size-3 shrink-0",
                    alert ? "text-red-400" : it.kind === "tranche_unlocked" ? "text-emerald-400" : "text-muted-foreground",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn(alert && "font-semibold text-red-400")}>{it.summary}</span>
                  {(it.partnerName || it.campusName) && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {[it.partnerName, it.campusName].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-muted-foreground">{ago(it.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
