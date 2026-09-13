// /v3/$topic/chain — every video planned for a topic, in play order, with Now / Later / Skip (D).
// The page is components/v3/ChainPage.tsx.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { ChainPage } from "@/components/v3/ChainPage";

export const Route = createFileRoute("/v3/$topic/chain")({
  component: V3Chain,
  head: () => ({ meta: [{ title: "⛓ Chain — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Chain() {
  const { topic } = Route.useParams();
  return <AdminGate><ChainPage topicKey={topic} /></AdminGate>;
}
