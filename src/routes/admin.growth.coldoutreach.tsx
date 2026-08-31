// /admin/growth/coldoutreach — layout for the Cold Outreach surface. It only renders the child
// route (the enrichment index at /coldoutreach, or the schedule at /coldoutreach/schedule). The
// pages carry their own two-tab ColdHeader. Without this Outlet the /schedule child never showed.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/admin/growth/coldoutreach")({
  component: () => <Outlet />,
});
