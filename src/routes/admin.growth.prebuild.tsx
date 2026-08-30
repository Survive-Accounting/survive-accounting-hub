// /admin/growth/prebuild — the full-semester tranche proposal, side by side so the balance
// is visibly fair rather than asserted. King T1–5 vs Unassigned A–E in matched pairs, each
// with its seat / readiness / zero-contact totals; Founder listed separately. Nothing is
// written until Lee approves.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Crown, Users } from "lucide-react";
import { renderQueryState } from "@/components/growth/QueryState";
import { toast } from "sonner";
import { growthCommitPreBuild, growthPreBuildProposal } from "@/lib/growth-tranche.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/growth/prebuild")({
  component: PreBuildPage,
});

const pct = (a: number, b: number) => {
  const hi = Math.max(a, b);
  return hi === 0 ? 0 : Math.round((100 * Math.abs(a - b)) / hi);
};

function PreBuildPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["prebuild-proposal"], queryFn: () => growthPreBuildProposal() });
  const commit = useMutation({
    mutationFn: () => growthCommitPreBuild(),
    onSuccess: (r) => {
      toast.success(`Committed · King ${r.king} + Unassigned ${r.unassigned} + Founder ${r.founder} · ${r.promoted} flagships live`);
      qc.invalidateQueries({ queryKey: ["partner-tranches"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Commit failed"),
  });

  const gate = renderQueryState(q, { label: "the pre-build" });
  if (gate || !q.data) return <div className="py-10">{gate}</div>;
  const { king, unassigned, founder, eligibleCount } = q.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Crown className="size-5 text-primary" />
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">
          Semester pre-build
        </h1>
        <span className="ml-auto text-xs text-muted-foreground">{eligibleCount} eligible</span>
      </div>
      <p className="text-[12px] text-muted-foreground">
        Flagship tranches (T1 / A) seeded with the most recognizable schools; the rest snake-drafted
        by Greek priority, alternating pools. Each matched pair is balanced within 10% on seats, mean
        readiness, and zero-contact count. Proposal only — nothing is written until you approve.
      </p>

      {/* founder */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Founder · Lee ({founder.length}) — excluded from partner tranches
        </div>
        <div className="flex flex-wrap gap-1.5">
          {founder.map((f) => (
            <span key={f.campusId} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
              {f.name}
            </span>
          ))}
        </div>
      </div>

      {/* matched pairs */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1">
            <Crown className="size-3 text-primary" /> King
          </span>
          <span className="flex items-center gap-1">
            <Users className="size-3" /> Unassigned
          </span>
        </div>
        {king.map((kt, i) => {
          const ut = unassigned[i];
          const seatGap = pct(kt.totals.seats, ut.totals.seats);
          const readGap = pct(kt.totals.meanReadiness, ut.totals.meanReadiness);
          const zcGap = pct(kt.totals.zeroContacts, ut.totals.zeroContacts);
          const balanced = seatGap <= 10 && readGap <= 10 && zcGap <= 10;
          return (
            <div key={i} className="rounded-lg border border-border">
              <div className="grid grid-cols-2 gap-px bg-border">
                <TrancheCol label={kt.label} campuses={kt.campuses} totals={kt.totals} flagship={i === 0} />
                <TrancheCol label={ut.label} campuses={ut.campuses} totals={ut.totals} flagship={i === 0} />
              </div>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-1.5 text-[10px]",
                  balanced ? "text-emerald-400" : "text-amber-400",
                )}
              >
                {balanced ? <Check className="size-3" /> : null}
                <span>seats Δ{seatGap}%</span>
                <span>readiness Δ{readGap}%</span>
                <span>zero-contact Δ{zcGap}%</span>
                {!balanced && <span className="ml-auto">outside 10% — best achievable</span>}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => {
          if (window.confirm("Commit this split? Writes all tranches and promotes the flagships to live."))
            commit.mutate();
        }}
        disabled={commit.isPending}
        className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
      >
        {commit.isPending ? "Committing…" : "Approve & commit the semester"}
      </button>
    </div>
  );
}

function TrancheCol({
  label,
  campuses,
  totals,
  flagship,
}: {
  label: string;
  campuses: { campusId: string; name: string; seats: number | null; greekStatus: string }[];
  totals: { seats: number; meanReadiness: number; zeroContacts: number };
  flagship: boolean;
}) {
  return (
    <div className="bg-card p-2.5">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="sa-admin-display text-sm font-semibold">{label}</span>
        {flagship && (
          <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
            Flagship
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">{campuses.length} campuses</span>
      </div>
      <div className="mb-1.5 flex gap-2 text-[10px] text-muted-foreground">
        <span>{totals.seats.toLocaleString()} seats</span>
        <span>· {Math.round(totals.meanReadiness)} rdy</span>
        <span>· {totals.zeroContacts} no-contact</span>
      </div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto">
        {campuses.map((c) => (
          <div key={c.campusId} className="flex items-baseline gap-1 text-[11px]">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                c.greekStatus === "strong"
                  ? "bg-emerald-400"
                  : c.greekStatus === "present"
                    ? "bg-primary"
                    : "bg-muted-foreground/50",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{c.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {(c.seats ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
