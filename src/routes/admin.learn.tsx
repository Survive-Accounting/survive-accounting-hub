// /admin/learn — reorder, normalize, sync and review the posted videos (components/learn/LearnAdmin.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { LearnAdmin } from "@/components/learn/LearnAdmin";

export const Route = createFileRoute("/admin/learn")({
  component: () => <AdminGate><LearnAdmin /></AdminGate>,
  head: () => ({ meta: [{ title: "/learn admin — Survive" }, { name: "robots", content: "noindex" }] }),
});
