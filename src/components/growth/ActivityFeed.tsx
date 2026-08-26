// ACTIVITY FEED — what happened, in sentences, newest first.
//
// Used three ways: inside a campus ("what happened here"), inside a metric ("show me the
// 68 questions"), and as the global Activity tab ("where is anything happening at all").
// Same component, same reading experience, different filter.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  activityKindLabel,
  growthActivity,
  growthActivityCsv,
  type ActivityItem,
  type ActivityKind,
} from "@/lib/growth-activity.functions";
import { Chip, when } from "@/components/growth/v2";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<ActivityKind, "neutral" | "good" | "warn" | "bad" | "info"> = {
  practice: "info",
  waitlist: "good",
  outreach: "neutral",
  reply: "good",
  map: "warn",
  claim: "good",
  seat: "good",
  enrichment: "neutral",
  submission: "info",
};

const ALL_KINDS: ActivityKind[] = [
  "practice",
  "waitlist",
  "outreach",
  "reply",
  "map",
  "claim",
  "seat",
  "submission",
];

export function ActivityFeed({
  campusId,
  entityId,
  kinds,
  compact,
  showFilters,
}: {
  campusId?: string | null;
  entityId?: string | null;
  kinds?: string[];
  compact?: boolean;
  showFilters?: boolean;
}) {
  const [filter, setFilter] = useState<ActivityKind | null>(null);
  const effectiveKinds = kinds ?? (filter ? [filter] : undefined);

  const q = useQuery({
    queryKey: [
      "growth-activity",
      campusId ?? "all",
      entityId ?? "",
      effectiveKinds?.join(",") ?? "all",
    ],
    queryFn: () =>
      growthActivity({
        data: { campusId: campusId ?? null, kinds: effectiveKinds, limit: compact ? 40 : 200 },
      }),
  });

  const items = useMemo(() => q.data?.items ?? [], [q.data]);

  const exportCsv = async () => {
    try {
      const res = await growthActivityCsv({
        data: { campusId: campusId ?? null, kinds: effectiveKinds, limit: 2000 },
      });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `survive-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.rows} rows.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    }
  };

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading activity…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showFilters && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              "rounded-full border px-2 py-0.5 text-[11px]",
              filter == null
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            Everything
          </button>
          {ALL_KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setFilter((cur) => (cur === k ? null : k))}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px]",
                filter === k
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {activityKindLabel(k)}
            </button>
          ))}
          <button
            onClick={exportCsv}
            className="ml-auto inline-flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-muted"
          >
            <Download className="size-3" /> Export CSV
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-2 text-[11px] text-muted-foreground">
          Nothing has happened here yet. Student activity, outreach and map approvals all show up in
          this feed.
        </p>
      ) : (
        <div className={cn("space-y-0.5 overflow-y-auto", compact ? "max-h-64" : "max-h-[70vh]")}>
          {items.map((i) => (
            <Row key={i.id} item={i} showCampus={!campusId} />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ item, showCampus }: { item: ActivityItem; showCampus: boolean }) {
  return (
    <div className="flex items-baseline gap-2 rounded px-1 py-1 text-[11px] hover:bg-muted/50">
      <span
        className="w-16 shrink-0 tabular-nums text-muted-foreground"
        title={new Date(item.at).toLocaleString()}
      >
        {when(item.at)}
      </span>
      <Chip tone={KIND_TONE[item.kind]}>{activityKindLabel(item.kind)}</Chip>
      <span className="min-w-0 flex-1">
        {showCampus && item.campusName && <span className="font-medium">{item.campusName} · </span>}
        {item.text}
        {item.who && <span className="text-muted-foreground"> — {item.who}</span>}
        {item.detail && <span className="text-muted-foreground"> ({item.detail})</span>}
      </span>
    </div>
  );
}
