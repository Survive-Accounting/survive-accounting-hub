// /v3/breathers — author the recap beats between a set's videos (components/v3/BreatherAuthoring.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BreatherAuthoring } from "@/components/v3/BreatherAuthoring";
import { V3Shell } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/breathers")({
  component: () => <AdminGate><V3Shell wide crumbs={[{ label: "Breathers" }]}><BreatherAuthoring /></V3Shell></AdminGate>,
  head: () => ({ meta: [{ title: "Breathers — Blast Off" }, { name: "robots", content: "noindex" }] }),
});
