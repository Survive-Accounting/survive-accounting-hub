// ✨ ENRICHMENT — what research is missing for this campus, and the button that goes and gets it.
//
// V2 fixes two things. First, it opens as a panel BELOW the button rather than an absolutely
// positioned popover: the V1 dropdown was being clipped to nothing by an overflow:hidden
// ancestor, so it looked like the button did nothing. Second, every runnable row now carries
// an estimated cost in provider units and dollars, off published list prices, so nobody
// clicks Run without knowing roughly what it spends.
//
// One campus at a time, by design. Stages feed each other (course code → docs → parse;
// faculty needs the department URL first), so a queue would mostly buy wasted spend.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Minus, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import {
  growthEnrichmentStatus,
  growthRunEnrichment,
  type EnrichmentRow,
} from "@/lib/growth-enrichment.functions";
import { estMoney } from "@/components/growth/v2";
import { Hint } from "@/components/growth/v2";
import { HINTS } from "@/components/growth/hints";
import { cn } from "@/lib/utils";

const STATE_ICON = {
  COMPLETE: <Check className="size-3.5 text-emerald-400" />,
  PARTIAL: <Minus className="size-3.5 text-amber-400" />,
  MISSING: <X className="size-3.5 text-rose-400" />,
  NEEDS_REVIEW: <TriangleAlert className="size-3.5 text-amber-400" />,
} as const;

export function EnrichmentPanel({ campusId }: { campusId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["growth-enrichment", campusId],
    queryFn: () => growthEnrichmentStatus({ data: { campusId } }),
    enabled: open,
  });
  const run = useMutation({
    mutationFn: (category: string) =>
      growthRunEnrichment({ data: { campusId, category: category as never } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.summary);
      else toast.error(res.summary);
      qc.invalidateQueries({ queryKey: ["growth-enrichment", campusId] });
      qc.invalidateQueries({ queryKey: ["growth-campus-detail", campusId] });
      qc.invalidateQueries({ queryKey: ["growth-docs", campusId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enrichment failed"),
  });

  const rows = status.data?.rows ?? [];
  const missing = rows.filter((r) => r.state === "MISSING" || r.state === "PARTIAL");
  const runnableMissing = missing.filter((r) => r.runnable);
  const totalUsd = runnableMissing.reduce((n, r) => n + (r.cost?.usd ?? 0), 0);

  return (
    <div className="w-full">
      <Hint text={HINTS.enrichment}>
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
            open
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-card hover:bg-muted",
          )}
        >
          <Sparkles className="size-3.5 text-primary" /> Enrichment
          {rows.length > 0 && missing.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-400">
              {missing.length}
            </span>
          )}
        </button>
      </Hint>

      {open && (
        <div className="mt-2 rounded-lg border border-border bg-card p-2">
          {status.isLoading && (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking what we have…
            </div>
          )}
          {status.data?.running && (
            <div className="mb-1 flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
              <Loader2 className="size-3 animate-spin" /> {status.data.running} is running for this
              campus
            </div>
          )}

          <div className="divide-y divide-border/60">
            {rows.map((r) => (
              <EnrichRow
                key={r.key}
                row={r}
                busy={run.isPending && run.variables === r.key}
                anyBusy={run.isPending || !!status.data?.running}
                onRun={() => run.mutate(r.key)}
              />
            ))}
          </div>

          {runnableMissing.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
              <Hint text={HINTS.enrichCost}>
                <span className="text-[10px] text-muted-foreground">
                  {runnableMissing.length} to run · {estMoney(totalUsd)} total
                </span>
              </Hint>
              <button
                disabled={run.isPending}
                onClick={async () => {
                  // Sequential on purpose: one lease per campus, visible progress, no burst spend.
                  for (const r of runnableMissing) {
                    await run.mutateAsync(r.key).catch(() => undefined);
                  }
                }}
                className="ml-auto rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                {run.isPending ? "Running…" : "Run everything missing"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EnrichRow({
  row,
  busy,
  anyBusy,
  onRun,
}: {
  row: EnrichmentRow;
  busy: boolean;
  anyBusy: boolean;
  onRun: () => void;
}) {
  const canRun = (row.state === "MISSING" || row.state === "PARTIAL") && row.runnable;
  return (
    <div
      className={cn("flex items-center gap-2 py-1.5 text-xs", row.quarantined && "bg-amber-500/5")}
    >
      <Hint text={HINTS.enrichState[row.state]}>{STATE_ICON[row.state]}</Hint>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-medium">
          {row.label}
          {row.quarantined && (
            <Hint text="This campus's numbers for this look wrong (probably data from a different school). Shown, but never used for ranking.">
              <AlertTriangle className="size-3 text-amber-400" />
            </Hint>
          )}
        </div>
        <div className="truncate text-[11px] text-muted-foreground">{row.detail}</div>
      </div>
      {canRun && row.cost && (
        <Hint text={`${row.cost.summary}. ${HINTS.enrichCost}`}>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {row.cost.usd > 0 ? estMoney(row.cost.usd) : "free"}
          </span>
        </Hint>
      )}
      {canRun && (
        <button
          onClick={onRun}
          disabled={anyBusy}
          className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] font-medium hover:bg-muted disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : "Run"}
        </button>
      )}
    </div>
  );
}
