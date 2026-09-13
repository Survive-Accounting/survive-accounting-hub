// /v4 — one topic, five steps (components/v4). v3 stays exactly as it was.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { V4Home } from "@/components/v4/V4Home";

export const Route = createFileRoute("/v4/")({
  component: () => <AdminGate><V4Home /></AdminGate>,
  head: () => ({ meta: [{ title: "v4 — Survive Studio" }, { name: "robots", content: "noindex" }] }),
});
