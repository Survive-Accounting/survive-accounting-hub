// Cold Outreach's own two-tab header — Enrichment | Upcoming Sends — shared by both routes so
// the surface reads as its own small app, separate from the broader Growth dashboard.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ColdHeader({ tab, right }: { tab: "enrichment" | "sends"; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Cold Outreach</span>
      <nav className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
        <Link to="/admin/growth/coldoutreach" className={cn("px-3.5 py-1.5 font-medium transition-colors", tab === "enrichment" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Enrichment</Link>
        <Link to="/admin/growth/coldoutreach/schedule" className={cn("px-3.5 py-1.5 font-medium transition-colors", tab === "sends" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>Upcoming Sends</Link>
      </nav>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
