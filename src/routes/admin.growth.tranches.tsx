// /admin/growth/tranches — Lee's tranche control room.
//
// Pick a partner, set up their 5 tranches (one click fills them from the ranked launch
// list), and watch the unlock gauge. The gauge is the same one the partner sees; there
// is one version of the truth. Unlock is automatic — this page just makes it visible and
// lets Lee seed the campus lists ahead of time so an unlock is instant.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Layers, Wand2 } from "lucide-react";
import { toast } from "sonner";
import {
  growthAutoAssignTranches,
  growthEnsurePartnerTranches,
  growthPartners,
} from "@/lib/growth-tranche.functions";
import { TranchePanel } from "@/components/growth/TranchePanel";

export const Route = createFileRoute("/admin/growth/tranches")({
  component: TranchesPage,
});

function TranchesPage() {
  const qc = useQueryClient();
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const partners = useQuery({ queryKey: ["growth-partners"], queryFn: () => growthPartners() });

  // Default to King (or the first partner) once the list loads.
  useEffect(() => {
    if (!partnerId && partners.data) {
      setPartnerId(partners.data.kingPartnerId ?? partners.data.partners[0]?.id ?? null);
    }
  }, [partners.data, partnerId]);

  const ensure = useMutation({
    mutationFn: () => growthEnsurePartnerTranches({ data: { partnerId: partnerId! } }),
    onSuccess: (r) => {
      toast.success(r.created ? `Created ${r.created} tranches` : "Tranches already exist");
      qc.invalidateQueries({ queryKey: ["partner-tranches", partnerId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const autoAssign = useMutation({
    mutationFn: () => growthAutoAssignTranches({ data: { partnerId: partnerId! } }),
    onSuccess: (r) => {
      toast.success(`Assigned ${r.assigned} campuses from the launch list`);
      qc.invalidateQueries({ queryKey: ["partner-tranches", partnerId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="size-5 text-primary" />
        <h1 className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Tranches</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={partnerId ?? ""}
          onChange={(e) => setPartnerId(e.target.value || null)}
          className="rounded-md border border-border bg-card px-2 py-1.5 text-xs"
        >
          {(partners.data?.partners ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === partners.data?.kingPartnerId ? " (King)" : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => ensure.mutate()}
          disabled={!partnerId || ensure.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
        >
          {ensure.isPending ? <Loader2 className="size-3 animate-spin" /> : null} Create tranches
        </button>
        <button
          onClick={() => autoAssign.mutate()}
          disabled={!partnerId || autoAssign.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {autoAssign.isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Wand2 className="size-3" />
          )}{" "}
          Auto-assign from launch list
        </button>
      </div>

      {partnerId ? (
        <TranchePanel partnerId={partnerId} />
      ) : (
        <p className="text-xs text-muted-foreground">Select a partner to manage their tranches.</p>
      )}

      <p className="text-[11px] text-muted-foreground">
        Tranches unlock automatically when the active tranche clears both bars — 15 campuses
        launched and 5 with a response. Locked tranches can be seeded ahead of time so the unlock is
        instant. Per-campus reshuffle of a locked tranche is coming next.
      </p>
    </div>
  );
}
