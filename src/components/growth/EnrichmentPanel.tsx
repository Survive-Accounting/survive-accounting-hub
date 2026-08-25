// ✨ Enrichment — compact per-campus research checklist + targeted runners.
// A utility, not magic: each row shows derived state + provenance; MISSING/PARTIAL
// rows with a safe targeted function get [Run]. Debounced via a server-side
// per-campus lease; cost warnings shown before paid providers fire.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Minus, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import {
  growthEnrichmentStatus,
  growthRunEnrichment,
  type EnrichmentRow,
} from "@/lib/growth-enrichment.functions";
import { cn } from "@/lib/utils";

const STATE_ICON = {
  COMPLETE: <Check className="size-3.5 text-emerald-500" />,
  PARTIAL: <Minus className="size-3.5 text-amber-500" />,
  MISSING: <X className="size-3.5 text-rose-500" />,
  NEEDS_REVIEW: <TriangleAlert className="size-3.5 text-amber-500" />,
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
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Enrichment failed"),
  });

  const rows = status.data?.rows ?? [];
  const missing = rows.filter((r) => r.state === "MISSING" || r.state === "PARTIAL");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <Sparkles className="size-3.5 text-primary" /> Enrichment
        {rows.length > 0 && missing.length > 0 && (
          <span className="rounded-full bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-600">
            {missing.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1.5 w-[26rem] max-w-[90vw] rounded-lg border border-border bg-background p-2 shadow-xl">
          {status.isLoading && (
            <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Checking research state…
            </div>
          )}
          {status.data?.running && (
            <div className="mb-1 flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-[11px] text-primary">
              <Loader2 className="size-3 animate-spin" /> {status.data.running} is running for this
              campus
            </div>
          )}
          {rows.map((r) => (
            <EnrichRow
              key={r.key}
              row={r}
              busy={run.isPending && run.variables === r.key}
              anyBusy={run.isPending || !!status.data?.running}
              onRun={() => run.mutate(r.key)}
            />
          ))}
          {rows.length > 0 && (
            <div className="mt-1 border-t border-border pt-1.5 text-right">
              <button
                disabled={run.isPending || missing.filter((r) => r.runnable).length === 0}
                onClick={async () => {
                  for (const r of missing.filter((x) => x.runnable)) {
                    // sequential on purpose: one lease, visible progress, no burst spend

                    await run.mutateAsync(r.key).catch(() => undefined);
                  }
                }}
                className="rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-40"
              >
                Run missing enrichment
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
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
        row.quarantined && "bg-amber-500/5",
      )}
    >
      {STATE_ICON[row.state]}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 font-medium">
          {row.label}
          {row.quarantined && (
            <AlertTriangle className="size-3 text-amber-500" aria-label="quarantined" />
          )}
        </div>
        <div
          className="truncate text-[11px] text-muted-foreground"
          title={row.costNote ?? undefined}
        >
          {row.detail}
          {row.runnable && row.costNote ? ` · ${row.costNote}` : ""}
        </div>
      </div>
      {(row.state === "MISSING" || row.state === "PARTIAL") && row.runnable && (
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
