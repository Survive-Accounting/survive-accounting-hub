// /v3/$topic/$set/blast-off/improve — STEP 5. Iterate.
//
// Lee, 2026-09-07: "I'd love a Step 5: Improve Process." Nested under the set like Brainstorm,
// Editor and Rehearse & Film (blastOffPath), with the same AdminGate + V3Shell + StepBar frame
// as the Editor step, so the door on the step picker leads somewhere real from day one. The
// body is components/v3/improve/ImprovePage.tsx.
//
// RENAMED the same day — Lee: "I want to call the improve process 'Iterate' instead." The
// label, the title and the crumb say Iterate; the URL segment stays `improve` so the pill's
// link, the timer's path detection and any bookmark still resolve.
//
// Not timed (lib/production-time.ts): the step reads the minutes the other four spent.
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { ImprovePage } from "@/components/v3/improve/ImprovePage";
import { useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/improve")({
  component: () => <AdminGate><V3Improve /></AdminGate>,
  head: () => ({ meta: [{ title: "📈 Iterate — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Improve() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  const crumbs = [
    { label: "V3", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Iterate" },
  ];

  return (
    <V3Shell crumbs={crumbs} wide>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <ImprovePage topic={topic} set={set} />
      )}
    </V3Shell>
  );
}
