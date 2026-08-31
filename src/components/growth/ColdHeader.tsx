// Cold Outreach's own two-tab header — Enrichment | Upcoming Sends — shared by both routes so
// the surface reads as its own small app, separate from the broader Growth dashboard.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ColdHeader({ tab, right }: { tab: "enrichment" | "sends" | "activity" | "team"; right?: ReactNode }) {
  const cls = (on: boolean) => cn("px-3.5 py-1.5 font-medium transition-colors", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted");
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="sa-admin-display text-lg font-semibold uppercase tracking-wide">Cold Outreach</span>
      <nav className="inline-flex overflow-hidden rounded-lg border border-border text-xs">
        <Link to="/admin/growth/coldoutreach" className={cls(tab === "enrichment")}>Enrichment</Link>
        <Link to="/admin/growth/coldoutreach/schedule" className={cls(tab === "sends")}>Upcoming Sends</Link>
        <Link to="/admin/growth/coldoutreach/activity" className={cls(tab === "activity")}>Activity</Link>
        <Link to="/admin/growth/coldoutreach/team" className={cls(tab === "team")}>Team</Link>
      </nav>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
