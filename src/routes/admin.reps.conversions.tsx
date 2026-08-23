// /admin/reps/conversions — the funnel truth. Overall KPI row, the conversion event feed, and the
// commission ledger (status is admin-editable: pending → approved → paid, or void). "Sync order
// purchases" turns attributed order leads into purchases + commissions from real order revenue.
// Payouts are NOT automated here — this is the ledger, not a disbursement tool.
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { getAdminWho } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CommissionStatusBadge,
  KpiRow,
  Money,
  TestToggle,
  useShowTest,
} from "@/components/reps/RepsKit";
import {
  getAttributionKpis,
  listCommissions,
  listConversions,
  reconcileOrderPurchases,
  setCommissionStatus,
} from "@/lib/referral-admin.functions";
import { COMMISSION_STATUSES, ruleLabel, type CommissionStatus } from "@/lib/referral-shared";

export const Route = createFileRoute("/admin/reps/conversions")({
  component: ConversionsPage,
});

function ConversionsPage() {
  const kpiFn = useServerFn(getAttributionKpis);
  const convFn = useServerFn(listConversions);
  const commFn = useServerFn(listCommissions);
  const statusFn = useServerFn(setCommissionStatus);
  const reconcileFn = useServerFn(reconcileOrderPurchases);
  const qc = useQueryClient();
  const [showTest, setShowTest] = useShowTest();

  const kpiQ = useQuery({
    queryKey: ["reps-kpis", showTest],
    queryFn: () => kpiFn({ data: { includeTest: showTest } }),
  });
  const convQ = useQuery({
    queryKey: ["reps-conversions", showTest],
    queryFn: () => convFn({ data: { includeTest: showTest, limit: 200 } }),
  });
  const commQ = useQuery({
    queryKey: ["reps-commissions", showTest],
    queryFn: () => commFn({ data: { includeTest: showTest, limit: 200 } }),
  });

  const reconcile = useMutation({
    mutationFn: async () => reconcileFn({ data: { limit: 500 } }),
    onSuccess: (r) => {
      toast.success(
        `Synced: ${r.created} new purchase${r.created === 1 ? "" : "s"} from ${r.checked} order lead${r.checked === 1 ? "" : "s"}`,
      );
      qc.invalidateQueries({ queryKey: ["reps-conversions"] });
      qc.invalidateQueries({ queryKey: ["reps-commissions"] });
      qc.invalidateQueries({ queryKey: ["reps-kpis"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Sync failed"),
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: CommissionStatus }) =>
      statusFn({ data: { id: v.id, status: v.status, who: getAdminWho() ?? undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reps-commissions"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const convs = convQ.data ?? [];
  const comms = commQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Conversions</h1>
        <div className="flex items-center gap-4">
          <TestToggle value={showTest} onChange={setShowTest} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => reconcile.mutate()}
            disabled={reconcile.isPending}
          >
            {reconcile.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-4 w-4" />
            )}
            Sync order purchases
          </Button>
        </div>
      </div>

      {kpiQ.data && <KpiRow stats={kpiQ.data} />}

      {/* Commission ledger */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Commission ledger</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Partner</th>
                <th className="px-3 py-2 text-left font-medium">Rule</th>
                <th className="px-3 py-2 text-right font-medium">Basis</th>
                <th className="px-3 py-2 text-right font-medium">Commission</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Set</th>
              </tr>
            </thead>
            <tbody>
              {commQ.isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!commQ.isLoading && comms.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No commissions yet. They appear when an attributed purchase is recorded.
                  </td>
                </tr>
              )}
              {comms.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {c.partner_name ?? "—"}
                      {c.is_test && (
                        <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">
                          TEST
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {ruleLabel({ type: c.commission_type, rate: c.commission_rate })}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money cents={c.basis_cents} />
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    <Money cents={c.commission_cents} />
                  </td>
                  <td className="px-3 py-2">
                    <CommissionStatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={c.status}
                      onValueChange={(v) =>
                        setStatus.mutate({ id: c.id, status: v as CommissionStatus })
                      }
                    >
                      <SelectTrigger className="h-7 w-[110px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMISSION_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Conversion feed */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Recent conversions</h2>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">When</th>
                <th className="px-3 py-2 text-left font-medium">Kind</th>
                <th className="px-3 py-2 text-left font-medium">Partner</th>
                <th className="px-3 py-2 text-left font-medium">Who</th>
                <th className="px-3 py-2 text-left font-medium">Source</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {convQ.isLoading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                  </td>
                </tr>
              )}
              {!convQ.isLoading && convs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                    No conversions yet.
                  </td>
                </tr>
              )}
              {convs.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(c.occurred_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.kind}</span>
                  </td>
                  <td className="px-3 py-2">{c.partner_name ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {c.subject_type ?? "—"}
                    {c.is_test && (
                      <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">
                        TEST
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Money cents={c.amount_cents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
