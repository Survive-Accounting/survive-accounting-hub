// /admin/reps/partners — the partner registry. One generic list for every source type. Add/edit a
// partner in a dialog; the table shows each partner's funnel (clicks → signups → purchases →
// revenue → commission).
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { getAdminWho } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  KpiRow,
  Money,
  PartnerStatusBadge,
  TestToggle,
  TypeBadge,
  useShowTest,
} from "@/components/reps/RepsKit";
import { getAttributionKpis, listPartners, upsertPartner } from "@/lib/referral-admin.functions";
import {
  COMMISSION_TYPES,
  PARTNER_STATUSES,
  PARTNER_TYPES,
  PARTNER_TYPE_LABEL,
  ruleLabel,
  type CommissionType,
  type PartnerRow,
  type PartnerStatus,
  type PartnerType,
} from "@/lib/referral-shared";

export const Route = createFileRoute("/admin/reps/partners")({
  component: PartnersPage,
});

type Draft = {
  id?: string;
  name: string;
  type: PartnerType;
  email: string;
  phone: string;
  socialHandle: string;
  status: PartnerStatus;
  defaultCommissionType: CommissionType;
  defaultCommissionRate: string;
  notes: string;
  isTest: boolean;
};

const blankDraft = (): Draft => ({
  name: "",
  type: "influencer",
  email: "",
  phone: "",
  socialHandle: "",
  status: "active",
  defaultCommissionType: "percent",
  defaultCommissionRate: "10",
  notes: "",
  isTest: false,
});

function PartnersPage() {
  const listFn = useServerFn(listPartners);
  const kpiFn = useServerFn(getAttributionKpis);
  const upsertFn = useServerFn(upsertPartner);
  const qc = useQueryClient();
  const [showTest, setShowTest] = useShowTest();
  const [draft, setDraft] = useState<Draft | null>(null);

  const partnersQ = useQuery({
    queryKey: ["reps-partners", showTest],
    queryFn: () => listFn({ data: { includeTest: showTest } }),
  });
  const kpiQ = useQuery({
    queryKey: ["reps-kpis", showTest],
    queryFn: () => kpiFn({ data: { includeTest: showTest } }),
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const rate =
        d.defaultCommissionType === "flat"
          ? Math.round(Number(d.defaultCommissionRate || "0") * 100)
          : Number(d.defaultCommissionRate || "0");
      return upsertFn({
        data: {
          id: d.id,
          name: d.name.trim(),
          type: d.type,
          email: d.email.trim() || null,
          phone: d.phone.trim() || null,
          socialHandle: d.socialHandle.trim() || null,
          status: d.status,
          defaultCommissionType: d.defaultCommissionType,
          defaultCommissionRate: rate,
          notes: d.notes.trim() || null,
          isTest: d.isTest,
          who: getAdminWho() ?? undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Partner saved");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["reps-partners"] });
      qc.invalidateQueries({ queryKey: ["reps-kpis"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Save failed"),
  });

  const rows = partnersQ.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Partners</h1>
        <div className="flex items-center gap-4">
          <TestToggle value={showTest} onChange={setShowTest} />
          <Button onClick={() => setDraft(blankDraft())} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> New partner
          </Button>
        </div>
      </div>

      {kpiQ.data && <KpiRow stats={kpiQ.data} />}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Partner</th>
              <th className="px-3 py-2 text-left font-medium">Type</th>
              <th className="px-3 py-2 text-left font-medium">Default</th>
              <th className="px-3 py-2 text-right font-medium">Clicks</th>
              <th className="px-3 py-2 text-right font-medium">Signups</th>
              <th className="px-3 py-2 text-right font-medium">Purch.</th>
              <th className="px-3 py-2 text-right font-medium">Revenue</th>
              <th className="px-3 py-2 text-right font-medium">Commission</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {partnersQ.isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            )}
            {!partnersQ.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  No partners yet. Create your first with “New partner”, or just make a link in the
                  Lab.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr
                key={p.id}
                className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
                onClick={() =>
                  setDraft({
                    id: p.id,
                    name: p.name,
                    type: p.type,
                    email: p.email ?? "",
                    phone: p.phone ?? "",
                    socialHandle: p.social_handle ?? "",
                    status: p.status,
                    defaultCommissionType: p.default_commission_type,
                    defaultCommissionRate:
                      p.default_commission_type === "flat"
                        ? String((p.default_commission_rate ?? 0) / 100)
                        : String(p.default_commission_rate ?? 0),
                    notes: p.notes ?? "",
                    isTest: p.is_test,
                  })
                }
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 font-medium">
                    {p.name}
                    {p.is_test && (
                      <span className="rounded bg-amber-100 px-1.5 text-[10px] text-amber-700">
                        TEST
                      </span>
                    )}
                  </div>
                  {p.social_handle && (
                    <div className="text-xs text-muted-foreground">{p.social_handle}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <TypeBadge type={p.type} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {ruleLabel({ type: p.default_commission_type, rate: p.default_commission_rate })}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{p.stats.clicks}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.stats.signups}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.stats.purchases}</td>
                <td className="px-3 py-2 text-right">
                  <Money cents={p.stats.revenueCents} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Money cents={p.stats.commissionCents} />
                </td>
                <td className="px-3 py-2 text-right">
                  <PartnerStatusBadge status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PartnerDialog
        draft={draft}
        onChange={setDraft}
        onSave={(d) => save.mutate(d)}
        saving={save.isPending}
      />
    </div>
  );
}

function PartnerDialog({
  draft,
  onChange,
  onSave,
  saving,
}: {
  draft: Draft | null;
  onChange: (d: Draft | null) => void;
  onSave: (d: Draft) => void;
  saving: boolean;
}) {
  const open = draft !== null;
  const set = (patch: Partial<Draft>) => onChange({ ...(draft as Draft), ...patch });
  const valid = useMemo(() => !!draft && draft.name.trim().length > 0, [draft]);
  if (!draft) return <Dialog open={false} onOpenChange={() => onChange(null)} />;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onChange(null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit partner" : "New partner"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Jane Athlete"
              />
            </Field>
            <Field label="Type">
              <Select value={draft.type} onValueChange={(v) => set({ type: v as PartnerType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {PARTNER_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input value={draft.email} onChange={(e) => set({ email: e.target.value })} />
            </Field>
            <Field label="Phone">
              <Input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Social handle">
              <Input
                value={draft.socialHandle}
                onChange={(e) => set({ socialHandle: e.target.value })}
                placeholder="@handle"
              />
            </Field>
            <Field label="Status">
              <Select
                value={draft.status}
                onValueChange={(v) => set({ status: v as PartnerStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Default commission">
              <Select
                value={draft.defaultCommissionType}
                onValueChange={(v) => set({ defaultCommissionType: v as CommissionType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMISSION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "percent" ? "Percent" : t === "flat" ? "Flat $" : "None"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {draft.defaultCommissionType !== "none" && (
              <Field label={draft.defaultCommissionType === "percent" ? "Rate (%)" : "Amount ($)"}>
                <Input
                  value={draft.defaultCommissionRate}
                  onChange={(e) => set({ defaultCommissionRate: e.target.value })}
                  inputMode="decimal"
                />
              </Field>
            )}
          </div>
          <Field label="Notes">
            <Textarea
              value={draft.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
            />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.isTest}
              onChange={(e) => set({ isTest: e.target.checked })}
              className="h-4 w-4"
            />
            Test partner (excluded from real totals)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange(null)}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => onSave(draft)}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
