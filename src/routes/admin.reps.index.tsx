// /admin/reps — the Scratch Link Lab. Create a trackable link in seconds: pick or create a
// partner, paste a destination, name the campaign, keep the default commission or set a custom one,
// hit Create. Out comes a short /r/<code> URL + QR, ready to copy or download. No wizard.
import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { getAdminWho } from "@/components/AdminGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CopyButton, TestToggle, TypeBadge, useShowTest } from "@/components/reps/RepsKit";
import { createLink, searchPartners } from "@/lib/referral-admin.functions";
import {
  COMMISSION_TYPES,
  PARTNER_TYPES,
  PARTNER_TYPE_LABEL,
  ruleLabel,
  type CommissionType,
  type PartnerRow,
  type PartnerType,
} from "@/lib/referral-shared";

export const Route = createFileRoute("/admin/reps/")({
  component: LinkLab,
});

function LinkLab() {
  const searchFn = useServerFn(searchPartners);
  const createFn = useServerFn(createLink);
  const [showTest, setShowTest] = useShowTest();

  // partner selection
  const [partnerQuery, setPartnerQuery] = useState("");
  const [selected, setSelected] = useState<PartnerRow | null>(null);
  const [newType, setNewType] = useState<PartnerType>("influencer");

  // link fields
  const [destination, setDestination] = useState("");
  const [campaign, setCampaign] = useState("Fall 2026 Launch");
  const [label, setLabel] = useState("");
  const [commissionMode, setCommissionMode] = useState<"default" | "custom">("default");
  const [customType, setCustomType] = useState<CommissionType>("percent");
  const [customRate, setCustomRate] = useState<string>("10");
  const [isTest, setIsTest] = useState(false);

  const [result, setResult] = useState<{
    shortUrl: string;
    qrDataUri: string;
    code: string;
  } | null>(null);

  const partnersQ = useQuery({
    queryKey: ["reps-partner-search", partnerQuery],
    queryFn: () => searchFn({ data: { q: partnerQuery.trim() || undefined } }),
    enabled: !selected,
  });

  const canCreate = useMemo(() => {
    const hasPartner = !!selected || partnerQuery.trim().length > 0;
    return hasPartner && destination.trim().length > 0;
  }, [selected, partnerQuery, destination]);

  const create = useMutation({
    mutationFn: async () => {
      const who = getAdminWho() ?? undefined;
      const commission =
        commissionMode === "custom"
          ? {
              type: customType,
              rate:
                customType === "flat"
                  ? Math.round(Number(customRate || "0") * 100)
                  : Number(customRate || "0"),
            }
          : null;
      return createFn({
        data: {
          partnerId: selected?.id,
          newPartnerName: selected ? undefined : partnerQuery.trim(),
          newPartnerType: selected ? undefined : newType,
          destinationUrl: destination.trim(),
          campaign: campaign.trim() || undefined,
          label: label.trim() || undefined,
          commission,
          isTest,
          who,
        },
      });
    },
    onSuccess: (r) => {
      setResult({ shortUrl: r.shortUrl, qrDataUri: r.qrDataUri, code: r.link.code });
      toast.success("Link created");
    },
    onError: (e: unknown) => toast.error((e as Error).message || "Could not create link"),
  });

  function reset() {
    setResult(null);
    setDestination("");
    setLabel("");
    setSelected(null);
    setPartnerQuery("");
    setIsTest(false);
    setCommissionMode("default");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* ── the form ─────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-4.5 w-4.5 text-primary" /> Create trackable link
          </h1>
          <TestToggle value={showTest || isTest} onChange={(v) => setShowTest(v)} />
        </div>

        {/* Partner */}
        <div className="space-y-2">
          <Label>Partner / source</Label>
          {selected ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
              <span className="font-medium">{selected.name}</span>
              <TypeBadge type={selected.type} />
              <button
                className="ml-auto text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={partnerQuery}
                  onChange={(e) => setPartnerQuery(e.target.value)}
                  placeholder="Search partners, or type a new name…"
                  className="pl-8"
                />
              </div>
              {partnerQuery.trim() && (
                <div className="rounded-lg border border-border">
                  {(partnersQ.data ?? []).slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelected(p);
                        setIsTest(p.is_test);
                      }}
                      className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    >
                      <span className="font-medium">{p.name}</span>
                      <TypeBadge type={p.type} />
                      <span className="ml-auto text-xs text-muted-foreground">
                        {ruleLabel({
                          type: p.default_commission_type,
                          rate: p.default_commission_rate,
                        })}
                      </span>
                    </button>
                  ))}
                  {/* Create-new affordance */}
                  <div className="flex items-center gap-2 px-3 py-2">
                    <Plus className="h-4 w-4 text-primary" />
                    <span className="text-sm">
                      New partner “<span className="font-medium">{partnerQuery.trim()}</span>” as
                    </span>
                    <Select value={newType} onValueChange={(v) => setNewType(v as PartnerType)}>
                      <SelectTrigger className="h-7 w-[170px]">
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="space-y-2">
          <Label>Destination</Label>
          <Input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Paste a Survive URL, e.g. /ole-miss or /go/ole-miss/adpi"
          />
          <p className="text-xs text-muted-foreground">
            Any Survive URL or path. A chapter link is just{" "}
            <code>/go/&lt;school&gt;/&lt;chapter&gt;</code>.
          </p>
        </div>

        {/* Campaign + label */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Campaign</Label>
            <Input
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder="Fall 2026 Launch"
            />
          </div>
          <div className="space-y-2">
            <Label>Label (optional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="IG story swipe-up"
            />
          </div>
        </div>

        {/* Commission */}
        <div className="space-y-2">
          <Label>Commission</Label>
          <div className="flex flex-wrap items-center gap-2">
            <ModeChip
              active={commissionMode === "default"}
              onClick={() => setCommissionMode("default")}
            >
              Use partner default
            </ModeChip>
            <ModeChip
              active={commissionMode === "custom"}
              onClick={() => setCommissionMode("custom")}
            >
              Custom
            </ModeChip>
            {commissionMode === "custom" && (
              <div className="flex items-center gap-2">
                <Select
                  value={customType}
                  onValueChange={(v) => setCustomType(v as CommissionType)}
                >
                  <SelectTrigger className="h-8 w-[130px]">
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
                {customType !== "none" && (
                  <div className="flex items-center gap-1">
                    <Input
                      value={customRate}
                      onChange={(e) => setCustomRate(e.target.value)}
                      inputMode="decimal"
                      className="h-8 w-20"
                    />
                    <span className="text-sm text-muted-foreground">
                      {customType === "percent" ? "%" : "$"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            onClick={() => create.mutate()}
            disabled={!canCreate || create.isPending}
            size="lg"
          >
            {create.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create link
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={isTest}
              onChange={(e) => setIsTest(e.target.checked)}
              className="h-4 w-4"
            />
            Test link (excluded from real totals)
          </label>
        </div>
      </div>

      {/* ── output panel ─────────────────────────────────────────── */}
      <div className="lg:sticky lg:top-20 lg:self-start">
        {result ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Your link is ready</span>
              <button
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Create another
              </button>
            </div>
            <div className="space-y-1.5">
              <div className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm">
                {result.shortUrl}
              </div>
              <CopyButton
                text={result.shortUrl}
                label="Copy link"
                className="w-full justify-center"
              />
            </div>
            <div className="flex flex-col items-center gap-2 border-t border-border pt-4">
              <img
                src={result.qrDataUri}
                alt="QR code"
                className="h-44 w-44 rounded-lg border border-border"
              />
              <div className="flex w-full gap-2">
                <CopyButton
                  text={result.shortUrl}
                  label="Copy URL"
                  className="flex-1 justify-center"
                />
                <a
                  href={result.qrDataUri}
                  download={`survive-${result.code}-qr.png`}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Download className="h-3.5 w-3.5" /> Download QR
                </a>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            <Sparkles className="mx-auto mb-2 h-5 w-5" />
            Your short link and QR code will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

function ModeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
