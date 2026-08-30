// The tranche ladder + the unlock gauge — the gamification surface. Front and centre,
// never buried: two bars (campuses launched, campuses with a response) with the gap
// always legible, then the ladder of 5 tranches. Locked tranches show only a count and
// a tier label — a number motivates, a list invites negotiation.
//
// Evaluate-and-unlock runs on mount (idempotent); an unlock fires a brief celebration.
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Lock, Loader2, PartyPopper } from "lucide-react";
import { toast } from "sonner";
import {
  growthEvaluateAndUnlock,
  growthPartnerTranches,
  type TrancheView,
} from "@/lib/growth-tranche.functions";
import { type TrancheProgress } from "@/lib/growth-tranche-core";
import { cn } from "@/lib/utils";

export function TranchePanel({
  partnerId,
  partnerFacing = false,
}: {
  partnerId: string;
  /** Partner view hides Lee's management chrome; the ladder + gauge are identical. */
  partnerFacing?: boolean;
}) {
  const qc = useQueryClient();
  const evaluated = useRef(false);
  const q = useQuery({
    queryKey: ["partner-tranches", partnerId],
    queryFn: () => growthPartnerTranches({ data: { partnerId } }),
    staleTime: 30_000,
  });
  const evaluate = useMutation({
    mutationFn: () => growthEvaluateAndUnlock({ data: { partnerId } }),
    onSuccess: (r) => {
      if (r.unlocked) {
        toast.success(`🎉 Tranche ${r.trancheNumber} unlocked!`, {
          description: "New campuses just landed on the board.",
        });
        qc.invalidateQueries({ queryKey: ["partner-tranches", partnerId] });
      }
    },
  });
  // Continuous evaluation: check once on mount.
  useEffect(() => {
    if (partnerId && !evaluated.current) {
      evaluated.current = true;
      evaluate.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (q.isLoading)
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading tranches…
      </div>
    );
  const tranches = q.data?.tranches ?? [];
  const active = tranches.find((t) => t.status === "active");

  if (tranches.length === 0)
    return (
      <p className="text-[12px] text-muted-foreground">
        No tranches set up yet{partnerFacing ? "." : " — create them below."}
      </p>
    );

  return (
    <div className="space-y-4">
      {active?.progress && <UnlockGauge progress={active.progress} trancheNumber={active.trancheNumber} />}
      <div className="space-y-1.5">
        {tranches.map((t) => (
          <TrancheRow key={t.id} t={t} partnerFacing={partnerFacing} />
        ))}
      </div>
    </div>
  );
}

/** The two-bar gauge — the whole point. Both bars must be met to unlock; the gap reads
 *  at a glance. Speed alone (left bar full, right bar short) visibly does NOT unlock. */
function UnlockGauge({
  progress,
  trancheNumber,
}: {
  progress: TrancheProgress;
  trancheNumber: number;
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="sa-admin-display text-xs font-semibold uppercase tracking-wider text-primary">
          Tranche {trancheNumber} → unlock next
        </span>
        {progress.unlocked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
            <PartyPopper className="size-3" /> Ready to unlock
          </span>
        )}
      </div>
      <GaugeBar
        label="Campuses launched"
        done={progress.launched}
        target={progress.launchTarget}
        hint="Launch checklist items 1–5 complete."
      />
      <GaugeBar
        label="With a response"
        done={progress.responded}
        target={progress.responseTarget}
        hint="A logged council/chapter reply, or a recruited rep with a tracked link."
      />
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        Both bars must fill. Volume alone never unlocks — a response floor is required.
      </p>
    </div>
  );
}

function GaugeBar({
  label,
  done,
  target,
  hint,
}: {
  label: string;
  done: number;
  target: number;
  hint: string;
}) {
  const pct = target > 0 ? Math.min(1, done / target) : 0;
  const met = done >= target && target > 0;
  return (
    <div className="mb-1.5 flex items-center gap-2" title={hint}>
      <span className="w-32 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", met ? "bg-emerald-500" : "bg-primary")}
          style={{ width: `${Math.max(pct * 100, done > 0 ? 5 : 0)}%` }}
        />
      </div>
      <span
        className={cn(
          "w-12 shrink-0 text-right text-[11px] font-semibold tabular-nums",
          met ? "text-emerald-400" : "text-foreground",
        )}
      >
        {done} / {target}
      </span>
    </div>
  );
}

function TrancheRow({ t, partnerFacing }: { t: TrancheView; partnerFacing: boolean }) {
  const isLocked = t.status === "locked";
  const isComplete = t.status === "complete";
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs",
        t.status === "active"
          ? "border-primary/50 bg-primary/[0.03]"
          : "border-border bg-card",
        isLocked && "opacity-70",
      )}
    >
      <span
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full text-[10px]",
          isComplete
            ? "bg-emerald-500/15 text-emerald-400"
            : t.status === "active"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
        )}
      >
        {isComplete ? <Check className="size-3" /> : isLocked ? <Lock className="size-3" /> : t.trancheNumber}
      </span>
      <span className="font-medium">Tranche {t.trancheNumber}</span>
      <span className="text-muted-foreground">· {t.campusCount} campuses</span>
      {t.tierLabel && <span className="truncate text-muted-foreground">· {t.tierLabel}</span>}
      <span
        className={cn(
          "ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
          isComplete
            ? "text-emerald-400"
            : t.status === "active"
              ? "text-primary"
              : "text-muted-foreground",
        )}
      >
        {t.status}
      </span>
    </div>
  );
}
