// /admin/growth/campaigns — Lee's campaign monitor + review, and the kill switch.
//
// Auto-approve means Lee never has to act for a campaign to send — this page is where he
// CAN act inside the window: review the exact outgoing messages, send now, hold, or
// cancel. "Pause all outbound" freezes every pending campaign at once. Deep links from
// the launch notification open straight to a campaign's rendered messages.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pause, Play, Rocket, Send, X } from "lucide-react";
import { toast } from "sonner";
import {
  growthCampaignAction,
  growthCampaignsList,
  growthPauseAllOutbound,
  type CampaignView,
} from "@/lib/growth-campaign.functions";
import { growthQueueList } from "@/lib/growth-queue.functions";
import { PartnerActivityFeed } from "@/components/growth/PartnerActivityFeed";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/campaigns")({
  validateSearch: (s: Record<string, unknown>) => ({
    open: typeof s.open === "string" ? s.open : undefined,
  }),
  component: CampaignsPage,
});

function CampaignsPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(search.open ?? null);
  useEffect(() => setOpenId(search.open ?? null), [search.open]);

  const list = useQuery({ queryKey: ["growth-campaigns"], queryFn: () => growthCampaignsList({ data: {} }) });
  const pause = useMutation({
    mutationFn: (paused: boolean) => growthPauseAllOutbound({ data: { paused } }),
    onSuccess: (_r, paused) => {
      toast[paused ? "error" : "success"](paused ? "All outbound PAUSED" : "Outbound resumed");
      qc.invalidateQueries({ queryKey: ["growth-campaigns"] });
    },
  });
  const act = useMutation({
    mutationFn: (v: { campaignId: string; action: "approve_now" | "hold" | "resume" | "cancel" }) =>
      growthCampaignAction({ data: v }),
    onSuccess: (r, v) => {
      toast.success(
        v.action === "approve_now" ? `Sent ${r.sent ?? 0} emails` : `Campaign ${v.action}`,
      );
      qc.invalidateQueries({ queryKey: ["growth-campaigns"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed"),
  });

  const campaigns = list.data?.campaigns ?? [];
  const paused = list.data?.paused ?? false;
  const pending = campaigns.filter((c) => c.status === "pending" || c.status === "held");
  const openCampaign = campaigns.find((c) => c.id === openId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Rocket className="size-5 text-primary" />
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Campaigns</h1>
        <button
          onClick={() => {
            if (paused) pause.mutate(false);
            else if (window.confirm("Pause ALL pending campaigns across every partner? Nothing sends until you resume."))
              pause.mutate(true);
          }}
          disabled={pause.isPending}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold",
            paused
              ? "bg-emerald-600 text-white hover:opacity-90"
              : "border border-red-500/50 text-red-400 hover:bg-red-500/10",
          )}
        >
          {pause.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : paused ? (
            <Play className="size-3.5" />
          ) : (
            <Pause className="size-3.5" />
          )}
          {paused ? "Resume outbound" : "Pause all outbound"}
        </button>
      </div>

      {paused && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400">
          Outbound is paused — no campaign will send until you resume, regardless of schedule.
        </div>
      )}

      {list.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading campaigns…
        </div>
      ) : campaigns.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No campaigns yet. Launch one from a campus's Add-contacts drawer.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {pending.length} pending
          </div>
          {campaigns.map((c) => (
            <CampaignRow
              key={c.id}
              c={c}
              open={openId === c.id}
              onToggle={() => setOpenId((v) => (v === c.id ? null : c.id))}
              onAction={(action) => {
                if (action === "cancel" && !window.confirm("Cancel this campaign? Its queued emails are discarded.")) return;
                if (action === "approve_now" && !window.confirm(`Send now? ${c.emailCount} emails + ${c.dmCount} DMs go out for ${c.campusName ?? "this campus"}. This can't be undone.`)) return;
                act.mutate({ campaignId: c.id, action });
              }}
              busy={act.isPending}
            />
          ))}
        </div>
      )}

      {openCampaign && <ReviewMessages campaignTag={openCampaign.campaignTag} campusId={openCampaign.campusId} />}

      <PartnerActivityFeed />
    </div>
  );
}

function CampaignRow({
  c,
  open,
  onToggle,
  onAction,
  busy,
}: {
  c: CampaignView;
  open: boolean;
  onToggle: () => void;
  onAction: (a: "approve_now" | "hold" | "resume" | "cancel") => void;
  busy: boolean;
}) {
  const done = c.status === "sent" || c.status === "canceled";
  return (
    <div className={cn("rounded-md border p-3", open ? "border-primary/50" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button onClick={onToggle} className="font-medium hover:underline">
          {c.campusName ?? c.campusId.slice(0, 8)}
        </button>
        <span className="text-muted-foreground">
          {c.emailCount} emails, {c.dmCount} DMs · {c.templateKey}
        </span>
        <StatusPill status={c.status} />
        <span className="ml-auto text-[11px] text-muted-foreground">
          {c.status === "sent" ? "sent" : `sends ${c.scheduledLabel}`}
        </span>
      </div>
      {!done && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => onAction("approve_now")}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-40"
          >
            <Send className="size-3" /> Send now
          </button>
          <button onClick={onToggle} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted">
            {open ? "Hide messages" : "Review messages"}
          </button>
          {c.status === "held" ? (
            <button onClick={() => onAction("resume")} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted">
              Resume
            </button>
          ) : (
            <button onClick={() => onAction("hold")} className="rounded border border-border px-2 py-1 text-[11px] hover:bg-muted">
              Hold
            </button>
          )}
          <button
            onClick={() => onAction("cancel")}
            className="inline-flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10"
          >
            <X className="size-3" /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "sent"
      ? "bg-emerald-500/15 text-emerald-400"
      : status === "canceled"
        ? "bg-muted text-muted-foreground"
        : status === "held"
          ? "bg-amber-500/15 text-amber-400"
          : "bg-primary/15 text-primary";
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase", tone)}>
      {status}
    </span>
  );
}

/** The rendered outgoing messages — what a deep link opens straight to. */
function ReviewMessages({ campaignTag, campusId }: { campaignTag: string; campusId: string }) {
  const q = useQuery({
    queryKey: ["campaign-review", campaignTag],
    queryFn: () => growthQueueList({ data: { campaignId: campaignTag, campusId } }),
  });
  const items = q.data?.items ?? [];
  return (
    <div className="rounded-md border border-primary/40 bg-card p-3">
      <div className="mb-2 text-xs font-semibold">Outgoing messages · {items.length}</div>
      {q.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No rendered messages found.</p>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="rounded border border-border p-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="font-medium">To: {it.to}</span>
                <span className="text-muted-foreground">· {it.entityLabel ?? it.entityType}</span>
              </div>
              <div className="mt-1 font-medium">{it.subject}</div>
              <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted-foreground">
                {it.body}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
