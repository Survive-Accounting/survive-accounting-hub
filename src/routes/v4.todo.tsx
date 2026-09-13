// /v4/todo — every placeholder question and slide across the v4 topics (components/v4/V4Todo.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { V4Todo } from "@/components/v4/V4Todo";

export const Route = createFileRoute("/v4/todo")({
  component: () => <AdminGate><V4Todo /></AdminGate>,
  head: () => ({ meta: [{ title: "v4 to-do — Survive Studio" }, { name: "robots", content: "noindex" }] }),
});
