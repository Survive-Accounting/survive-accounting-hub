// /v3 — THE MAP IS THE HOME (Lee, 2026-09-10: "make the cram map the sort of home page of /v3,
// where we start there, plan out the map, and I can navigate to brainstorm, edit, film pop out,
// posting, etc. from one place"). The queue list it replaced lives on at /v3/queue.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { LaneMapPage } from "@/components/v3/LaneMapPage";

export const Route = createFileRoute("/v3/")({
  component: () => <AdminGate><LaneMapPage /></AdminGate>,
  head: () => ({ meta: [{ title: "⚡ Survive — V3" }, { name: "robots", content: "noindex" }] }),
});
