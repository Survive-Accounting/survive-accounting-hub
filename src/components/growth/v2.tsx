// GROWTH V2 SHARED PRIMITIVES — the vocabulary the whole dashboard is written in.
//
// Five things live here because every screen needs them and they must look identical
// everywhere: the dark-theme switch, the explain-anything tooltip, the campus bolt at
// list size, the in-place accordion, and the small formatters.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BOLT_OUTER, BOLT_RIGHT, BOLT_VIEWBOX } from "@/components/canvas/brand";
import { cn } from "@/lib/utils";

/* ── THEME ──────────────────────────────────────────────────────────────────────────────── */

/** Put the admin into the product's navy. Mirrors useNavyDocument (SiteHeader) but points the
 *  shadcn tokens at the surface ladder instead of aliasing --accent to brand gold — see the
 *  .sa-admin-dark block in styles.css for why those are different jobs. */
export function useAdminDarkDocument(): void {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("sa-admin-dark");
    return () => el.classList.remove("sa-admin-dark");
  }, []);
}

/* ── EXPLAIN ANYTHING ───────────────────────────────────────────────────────────────────── */

/** Wrap any element to give it a hover/focus explanation. King should never have to guess
 *  what a column, badge or number means, so nearly everything on screen has one of these. */
export function Hint({
  children,
  text,
  side = "top",
  className,
}: {
  children: ReactNode;
  text: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("cursor-help", className)}>{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          className="max-w-xs border border-border bg-popover text-[11px] font-normal leading-relaxed text-popover-foreground"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The ⓘ affordance — for labels where the explanation is the whole point. */
export function InfoDot({ text, className }: { text: ReactNode; className?: string }) {
  return (
    <Hint text={text}>
      <Info className={cn("inline size-3 shrink-0 opacity-50 hover:opacity-100", className)} />
    </Hint>
  );
}

/** A metric with a built-in definition. Clickable when `onClick` is given (opens its log). */
export function Metric({
  label,
  value,
  hint,
  onClick,
  tone = "default",
}: {
  label: string;
  value: string | number | null;
  hint?: ReactNode;
  onClick?: () => void;
  tone?: "default" | "good" | "warn";
}) {
  const body = (
    <>
      <div
        className={cn(
          "sa-admin-display text-lg font-semibold tabular-nums",
          tone === "good" && "text-emerald-400",
          tone === "warn" && "text-amber-400",
          value == null && "text-muted-foreground",
        )}
      >
        {value ?? "—"}
      </div>
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
        {label}
        {hint && <InfoDot text={hint} />}
      </div>
    </>
  );
  const cls = "rounded-md border border-border bg-card px-2 py-1.5 text-center";
  return onClick ? (
    <button
      onClick={onClick}
      className={cn(cls, "transition-colors hover:border-primary/60 hover:bg-muted")}
    >
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/* ── THE BOLT AT LIST SIZE ──────────────────────────────────────────────────────────────── */

/** The real brand mark in a campus's colours, small enough for a table row.
 *  Same two paths as the animated hero bolt (brand.tsx) — this is the mark, not a lookalike. */
export function MiniBolt({
  primary,
  secondary,
  size = 22,
  title,
  className,
}: {
  primary: string | null;
  secondary: string | null;
  size?: number;
  title?: string;
  className?: string;
}) {
  const c1 = primary || "#CE1126";
  const c2 = secondary || "#14213D";
  return (
    <svg
      viewBox={BOLT_VIEWBOX}
      height={size}
      width={size * 0.74}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={title ? `${title} bolt` : "campus bolt"}
    >
      {title && <title>{title}</title>}
      <path d={BOLT_OUTER} fill={c1} />
      <path d={BOLT_RIGHT} fill={c2} />
    </svg>
  );
}

/* ── ACCORDION (in place, never a side panel) ───────────────────────────────────────────── */

/** A disclosure row. The header stays exactly where it was clicked and the body opens beneath
 *  it, so the list keeps its context; nested Accordions indent against the same rail. */
export function Accordion({
  open,
  onToggle,
  header,
  children,
  className,
  bodyClassName,
  level = 1,
}: {
  open: boolean;
  onToggle: () => void;
  header: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  level?: 1 | 2 | 3;
}) {
  return (
    <div className={cn("border-b border-border/60 last:border-b-0", className)}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 text-left transition-colors hover:bg-muted/60",
          level === 1 ? "px-3 py-2" : "px-2 py-1.5",
        )}
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90 text-primary",
          )}
        />
        <span className="min-w-0 flex-1">{header}</span>
      </button>
      {open && (
        <div
          className={cn(
            "sa-accordion-body ml-3 pl-3",
            level === 1 ? "py-3 pr-3" : "py-2 pr-2",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** Section heading inside an accordion body. */
export function Panel({
  title,
  right,
  children,
  hint,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <section className="mb-3 last:mb-0">
      <div className="mb-1.5 flex items-center gap-1.5">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h4>
        {hint && <InfoDot text={hint} />}
        {right && <div className="ml-auto">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** Small status chip. `tone` carries the meaning; the label carries the words. */
export function Chip({
  children,
  tone = "neutral",
  hint,
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  hint?: ReactNode;
}) {
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
        tone === "neutral" && "bg-muted text-muted-foreground",
        tone === "good" && "bg-emerald-500/15 text-emerald-400",
        tone === "warn" && "bg-amber-500/15 text-amber-400",
        tone === "bad" && "bg-rose-500/15 text-rose-400",
        tone === "info" && "bg-sky-500/15 text-sky-400",
      )}
    >
      {children}
    </span>
  );
  return hint ? <Hint text={hint}>{chip}</Hint> : chip;
}

/* ── FORMATTERS ─────────────────────────────────────────────────────────────────────────── */

export const money = (cents: number | null | undefined): string =>
  cents == null ? "—" : `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

/** "~$0.12" — enrichment costs are always estimates off published list prices. */
export const estMoney = (usd: number): string => (usd < 0.01 ? "~<$0.01" : `~$${usd.toFixed(2)}`);

export const when = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = (Date.now() - d.getTime()) / 86400000;
  if (days < 1) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: "short", hour: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Debounced value — used by every search box. */
export function useDebounced<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Stable id → colour pair for a campus, for the bolt. */
export function useBoltColors(primary: string | null, secondary: string | null) {
  return useMemo(
    () => ({ c1: primary || "#CE1126", c2: secondary || "#14213D" }),
    [primary, secondary],
  );
}
