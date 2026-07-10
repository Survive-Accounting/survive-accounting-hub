// Shared pill toggle used by the outreach listening dashboards (Reddit,
// Parent-groups) for campus/status filter rows.
import type { ReactNode } from "react";

export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium capitalize transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
