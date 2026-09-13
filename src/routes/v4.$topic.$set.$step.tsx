// /v4/$topic/$set/$step — one step of a v4 topic (questions · slides · chain · split · film).
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { V4TopicPage } from "@/components/v4/V4TopicPage";

export const Route = createFileRoute("/v4/$topic/$set/$step")({
  component: V4Step,
  head: () => ({ meta: [{ title: "v4 — Survive Studio" }, { name: "robots", content: "noindex" }] }),
});

function V4Step() {
  const { topic, set, step } = Route.useParams();
  return <AdminGate><V4TopicPage topicKey={topic} setKey={set} step={step} /></AdminGate>;
}
