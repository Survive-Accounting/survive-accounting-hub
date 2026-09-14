// /v4/breathers — the recap beats between a set's videos, reached from /v4 (Lee, 2026-09-14: "Set up
// breathers as /v4/breathers and have a button to reach it from /v4/"). Same authoring as /v3/breathers.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BreatherAuthoring } from "@/components/v3/BreatherAuthoring";
import { V3Shell } from "@/components/v3/Shell";

export const Route = createFileRoute("/v4/breathers")({
  component: () => <AdminGate><V3Shell wide crumbs={[{ label: "V4", to: "/v4" }, { label: "Breathers" }]}><BreatherAuthoring /></V3Shell></AdminGate>,
  head: () => ({ meta: [{ title: "Breathers — v4" }, { name: "robots", content: "noindex" }] }),
});
