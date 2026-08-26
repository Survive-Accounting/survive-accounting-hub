// BOTTOM SHEET — the alternative to the accordion, for the A/B.
//
// Rises from the bottom over the list rather than pushing it down. Nested sheets stack:
// opening a chapter from inside a campus pushes a second sheet on top with a back path,
// so depth is visible instead of implied by indentation.
//
// Deliberately NOT a side drawer: the width is the full screen, so the wide tables
// (organizations, contacts, queue) get the room the side panel never had.
import { useEffect, type ReactNode } from "react";
import { ChevronLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomSheet({
  open,
  onClose,
  onBack,
  title,
  subtitle,
  children,
  depth = 0,
}: {
  open: boolean;
  onClose: () => void;
  /** Present on a stacked sheet — shows the back path instead of a bare close. */
  onBack?: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  depth?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (onBack) onBack();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    // Lock the page behind the sheet so a scroll gesture moves the sheet, not the list.
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
  }, [open, onClose, onBack]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-black/50"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-t-xl border-t border-border bg-background shadow-2xl",
          "animate-in slide-in-from-bottom duration-200",
        )}
        // Each stacked level sits slightly lower, so the one beneath stays visible.
        style={{ height: `calc(92vh - ${Math.min(depth, 2) * 28}px)` }}
      >
        {/* grab handle — reads as "this came from the bottom and can go back down" */}
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="flex shrink-0 items-start gap-3 border-b border-border px-4 py-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate">{title}</div>
            {subtitle}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

/** The header switch. Temporary — remove with layout-mode.ts once a style wins. */
export function LayoutSwitch({
  mode,
  onChange,
}: {
  mode: "accordion" | "sheet";
  onChange: (m: "accordion" | "sheet") => void;
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-0.5 rounded-md border border-border p-0.5">
      {(["accordion", "sheet"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          title={
            m === "accordion"
              ? "Campus opens in place, beneath its row"
              : "Campus rises from the bottom, over the list"
          }
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
            mode === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          {m === "accordion" ? "In place" : "Bottom sheet"}
        </button>
      ))}
    </div>
  );
}
