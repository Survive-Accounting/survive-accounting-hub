// Shared UI kit for /admin/growth. Matches the /outreach house style:
// raw <table>, hand-rolled drawer, Tile KPI, sonner toasts. Don't Make Me Think —
// visual status, icons, obvious actions, no explanatory prose.
import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, Info, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAdminWho, adminEmailFor, type AdminWho } from "@/components/AdminGate";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ---- formatting --------------------------------------------------------------
export const money = (c: number | null | undefined): string => {
  const n = Math.round((c ?? 0) / 100);
  return n >= 1000 ? `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k` : `$${n}`;
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
}

export function relTime(d: string | null | undefined): string {
  if (!d) return "never";
  const dt = new Date(d).getTime();
  if (Number.isNaN(dt)) return "—";
  const diff = Date.now() - dt;
  const day = 86_400_000;
  const abs = Math.abs(diff);
  const fut = diff < 0;
  if (abs < day) return fut ? "today" : "today";
  const days = Math.round(abs / day);
  if (days < 7) return fut ? `in ${days}d` : `${days}d ago`;
  if (days < 30) return fut ? `in ${Math.round(days / 7)}w` : `${Math.round(days / 7)}w ago`;
  return fmtDate(d);
}

// ---- admin identity (for created_by attribution) -----------------------------
export function useGrowthWho(): { who: AdminWho | null; email: string | null } {
  const [who, setWho] = useState<AdminWho | null>(null);
  useEffect(() => setWho(getAdminWho()), []);
  return { who, email: who ? adminEmailFor(who) : null };
}

// ---- KPI tile ----------------------------------------------------------------
export function Tile({
  label,
  value,
  hint,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  accent?: "emerald" | "amber" | "sky" | "rose" | "default";
  onClick?: () => void;
  active?: boolean;
}) {
  const accentClass =
    accent === "emerald"
      ? "text-emerald-600"
      : accent === "amber"
        ? "text-amber-600"
        : accent === "rose"
          ? "text-rose-600"
          : accent === "sky"
            ? "text-sky-600"
            : "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "rounded-lg border bg-card p-3 text-left transition-colors",
        onClick && "cursor-pointer hover:border-primary/50 hover:bg-accent/30",
        !onClick && "cursor-default",
        active && "border-primary ring-1 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <span className="truncate">{label}</span>
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 shrink-0 opacity-60" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <div className={cn("mt-1 text-2xl font-semibold tabular-nums", accentClass)}>{value}</div>
    </button>
  );
}

// ---- readiness dots (derived heuristic; canonical model owned by campus session)
export function ReadinessDots({
  student,
  greek,
  outreach,
}: {
  student: boolean;
  greek: boolean;
  outreach: boolean;
}) {
  const items: [string, boolean][] = [
    ["Student-ready — has an Intro 1 course code", student],
    ["Greek-ready — has chapters imported", greek],
    ["Outreach-ready — has at least one contact", outreach],
  ];
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {items.map(([label, on]) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span>
                {on ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground/30" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// ---- data-quality flag icons -------------------------------------------------
export function QualityFlags({
  flags,
}: {
  flags: {
    needsGreekData?: boolean;
    needsContact?: boolean;
    courseNeedsReview?: boolean;
    routeIssue?: boolean;
  };
}) {
  const items: [boolean | undefined, string][] = [
    [flags.needsGreekData, "Missing Greek data"],
    [flags.needsContact, "Missing contact"],
    [flags.courseNeedsReview, "Course needs review"],
    [flags.routeIssue, "Route issue (no public page)"],
  ];
  const active = items.filter(([on]) => on);
  if (!active.length) return <span className="text-muted-foreground/40">—</span>;
  return (
    <TooltipProvider>
      <div className="flex items-center gap-1">
        {active.map(([, label]) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <span>
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="text-xs">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}

// ---- status pill -------------------------------------------------------------
const PILL_CLASS: Record<string, string> = {
  claimed: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  unclaimed: "bg-muted text-muted-foreground",
  replied: "bg-emerald-100 text-emerald-700",
  sent: "bg-sky-100 text-sky-700",
  delivered: "bg-sky-100 text-sky-700",
  bounced: "bg-rose-100 text-rose-700",
  unsubscribed: "bg-rose-100 text-rose-700",
  logged: "bg-muted text-muted-foreground",
  no_answer: "bg-amber-100 text-amber-700",
  left_message: "bg-amber-100 text-amber-700",
  queued: "bg-slate-100 text-slate-600",
};
export function Pill({ status, children }: { status?: string | null; children?: ReactNode }) {
  const key = (status ?? "").toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        PILL_CLASS[key] ?? "bg-muted text-muted-foreground",
      )}
    >
      {children ?? (status ? status.replace(/_/g, " ") : "—")}
    </span>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  ig_dm: "IG DM",
  text: "Text",
  call: "Call",
  other: "Other",
};
export function ChannelPill({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
      {CHANNEL_LABEL[channel] ?? channel}
    </span>
  );
}

// ---- search input ------------------------------------------------------------
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative max-w-xs flex-1">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search…"}
        className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
      />
    </div>
  );
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---- table state rows --------------------------------------------------------
export function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-muted-foreground">
        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
      </td>
    </tr>
  );
}
export function EmptyRow({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

// ---- pager -------------------------------------------------------------------
export function Pager({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1)
    return <div className="text-xs text-muted-foreground">{total.toLocaleString()} total</div>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span>
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-accent/40"
        >
          Prev
        </button>
        <button
          onClick={() => onPage(Math.min(pages, page + 1))}
          disabled={page >= pages}
          className="rounded border px-2 py-1 disabled:opacity-40 hover:bg-accent/40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ---- drawer (hand-rolled overlay, matches OrderDetailDrawer) ------------------
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cn(
          "relative flex h-full w-full flex-col overflow-y-auto bg-background shadow-2xl",
          width,
        )}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-background px-5 py-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold">{title}</div>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 hover:bg-accent/50"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 p-5">{children}</div>
      </div>
    </div>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ---- storage-not-provisioned banner ------------------------------------------
export function StorageBanner() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <div className="font-medium">Contact &amp; outreach storage not provisioned yet</div>
        <div className="text-xs text-amber-700">
          Apply migration{" "}
          <code className="rounded bg-amber-100 px-1">
            20260823_1200_growth_admin_contacts_outreach.sql
          </code>{" "}
          in the Supabase SQL editor to enable contacts, outreach events, and the follow-up queue.
          Everything else works now.
        </div>
      </div>
    </div>
  );
}

// ---- copy helper -------------------------------------------------------------
export function copy(text: string) {
  try {
    void navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
}

export const SITE_ORIGIN = "https://surviveaccounting.com";
