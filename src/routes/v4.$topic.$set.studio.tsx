// /v4/$topic/$set/studio — build a split and film it on one screen (components/v4/Studio.tsx).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { StudioPage } from "@/components/v4/Studio";

export const Route = createFileRoute("/v4/$topic/$set/studio")({
  component: V4Studio,
  head: () => ({ meta: [{ title: "Studio — Survive" }, { name: "robots", content: "noindex" }] }),
});

function V4Studio() {
  const { topic, set } = Route.useParams();
  return <AdminGate><StudioPage topicKey={topic} setKey={set} /></AdminGate>;
}
