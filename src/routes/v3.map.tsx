// /v3/map — kept as an alias: the map IS the /v3 home now (2026-09-10). Old links still land.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { LaneMapPage } from "@/components/v3/LaneMapPage";

export const Route = createFileRoute("/v3/map")({
  component: () => <AdminGate><LaneMapPage /></AdminGate>,
  head: () => ({ meta: [{ title: "🗺 The map — Blast Off" }, { name: "robots", content: "noindex" }] }),
});
