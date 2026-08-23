// RepsKit — shared bits for the /admin/reps pages: the test-mode toggle, copy button, KPI row,
// money/badge helpers. Keeps each page focused on its table.
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PARTNER_TYPE_LABEL,
  formatCents,
  type CommissionStatus,
  type FunnelStats,
  type PartnerStatus,
  type PartnerType,
} from "@/lib/referral-shared";

const SHOW_TEST_KEY = "sa-reps-show-test";

/** Shared "show test data" preference (per-browser). Test rows are hidden from real totals by default. */
export function useShowTest(): [boolean, (v: boolean) => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(localStorage.getItem(SHOW_TEST_KEY) === "yes");
    } catch {
      /* ignore */
    }
  }, []);
  const set = (v: boolean) => {
    setShow(v);
    try {
      localStorage.setItem(SHOW_TEST_KEY, v ? "yes" : "no");
    } catch {
      /* ignore */
    }
  };
  return [show, set];
}

export function TestToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
      <span
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
          value ? "bg-amber-500" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
            value ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
      Show test data
    </label>
  );
}

export function CopyButton({
  text,
  label = "Copy",
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          toast.success("Copied");
          setTimeout(() => setDone(false), 1400);
        } catch {
          toast.error("Copy failed");
        }
      }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted",
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

export function Money({ cents }: { cents: number }) {
  return <span className="tabular-nums">{formatCents(cents ?? 0)}</span>;
}

const KPIS: { key: keyof FunnelStats; label: string; money?: boolean }[] = [
  { key: "clicks", label: "Clicks" },
  { key: "signups", label: "Signups" },
  { key: "purchases", label: "Purchases" },
  { key: "revenueCents", label: "Revenue", money: true },
  { key: "commissionCents", label: "Commission", money: true },
];

export function KpiRow({ stats }: { stats: FunnelStats }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {KPIS.map((k) => (
        <div key={k.key} className="rounded-lg border border-border bg-card px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{k.label}</div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums">
            {k.money ? formatCents((stats[k.key] as number) ?? 0) : ((stats[k.key] as number) ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TypeBadge({ type }: { type: PartnerType | null | undefined }) {
  if (!type) return null;
  return (
    <Badge variant="secondary" className="font-normal">
      {PARTNER_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}

export function PartnerStatusBadge({ status }: { status: PartnerStatus }) {
  const cls =
    status === "active"
      ? "bg-emerald-100 text-emerald-800"
      : status === "paused"
        ? "bg-amber-100 text-amber-800"
        : "bg-muted text-muted-foreground";
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{status}</span>
  );
}

const COMMISSION_STATUS_CLS: Record<CommissionStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  paid: "bg-emerald-100 text-emerald-800",
  void: "bg-muted text-muted-foreground line-through",
};

export function CommissionStatusBadge({ status }: { status: CommissionStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        COMMISSION_STATUS_CLS[status],
      )}
    >
      {status}
    </span>
  );
}
