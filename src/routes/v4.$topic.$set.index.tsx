// /v4/$topic/$set — a topic: the Start panel if it isn't a v4 topic yet, else straight to its step.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { V4TopicPage } from "@/components/v4/V4TopicPage";

export const Route = createFileRoute("/v4/$topic/$set/")({
  component: V4Topic,
  head: () => ({ meta: [{ title: "v4 — Survive Studio" }, { name: "robots", content: "noindex" }] }),
});

function V4Topic() {
  const { topic, set } = Route.useParams();
  return <AdminGate><V4TopicPage topicKey={topic} setKey={set} /></AdminGate>;
}
