// Shared load/error rendering for growth data pages. Before this, every page guarded only on
// isLoading — a failed fetch then rendered a fake "nothing here" empty state or spun forever.
// renderQueryState returns an error card (with Retry) or a spinner, or null to render content.
import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

export function renderQueryState(
  q: { isLoading: boolean; isError: boolean; refetch?: () => void },
  opts?: { compact?: boolean; label?: string },
): ReactNode | null {
  const compact = opts?.compact;
  if (q.isError) {
    return (
      <div className={compact ? "flex items-center gap-2 p-2 text-[11px] text-amber-400" : "flex flex-col items-center gap-2 p-8 text-center text-sm text-amber-400"}>
        <AlertTriangle className="size-4 shrink-0" />
        <span>Couldn't load{opts?.label ? ` ${opts.label}` : " this"} — check your connection.</span>
        {q.refetch && (
          <button onClick={() => q.refetch?.()} className="rounded border border-border px-2 py-0.5 text-xs text-foreground hover:bg-muted">
            Retry
          </button>
        )}
      </div>
    );
  }
  if (q.isLoading) {
    return (
      <div className={compact ? "flex items-center gap-2 p-2 text-muted-foreground" : "flex h-40 items-center justify-center text-muted-foreground"}>
        <Loader2 className={compact ? "size-4 animate-spin" : "size-5 animate-spin"} />
      </div>
    );
  }
  return null;
}
