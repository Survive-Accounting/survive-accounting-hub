// /v3/quick-post — post a batch of finished videos straight onto a set, each with a brand-kit
// thumbnail. No captions, transcript or plan splits (components/v3/QuickPost.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { QuickPost } from "@/components/v3/QuickPost";
import { V3Shell } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/quick-post")({
  component: () => <AdminGate><V3Shell crumbs={[{ label: "Quick post" }]}><QuickPost /></V3Shell></AdminGate>,
  head: () => ({ meta: [{ title: "Quick post — Blast Off" }, { name: "robots", content: "noindex" }] }),
});
