// /admin/growth/activity — everything that is happening, everywhere, newest first.
//
// The campus list answers "where should we work"; this answers "where is anything actually
// happening". One plain-English line per event with a timestamp and a campus, filterable by
// type, exportable to CSV. No new tracking: it reads the rows the product already writes.
import { createFileRoute } from "@tanstack/react-router";
import { ActivityFeed } from "@/components/growth/ActivityFeed";

export const Route = createFileRoute("/admin/growth/activity")({
  component: ActivityPage,
});

function ActivityPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="sa-admin-display text-sm font-semibold uppercase tracking-wide">Activity</h1>
        <p className="text-[11px] text-muted-foreground">
          Every student action, outreach event, map approval and chapter claim across all campuses.
          Test data is excluded.
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-3">
        <ActivityFeed showFilters />
      </div>
    </div>
  );
}
