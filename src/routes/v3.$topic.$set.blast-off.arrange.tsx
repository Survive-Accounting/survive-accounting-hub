// /v3/$topic/$set/blast-off/arrange — STEP 2. The running order.
//
// The /blast-off editor (components/blastoff/BlastOffEditor.tsx), mounted on
// this set inside the V3 shell. Lee, on the move: "the design is right, the
// route is wrong" — so the editor is untouched; it just lives here now.
//
// Inserted cheat codes, phrases and exhibits preview as DETOUR cards — dark,
// gold label, key phrase highlighted — the same flag the sync writes into the
// set, so what Lee arranges here is what the film surface shows.
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BlastOffEditor } from "@/components/blastoff/BlastOffEditor";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_EDGE, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/arrange")({
  component: () => <AdminGate><V3Arrange /></AdminGate>,
  head: () => ({ meta: [{ title: "⚡ Arrange — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Arrange() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  const crumbs = [
    { label: "The Queue", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Arrange" },
  ];

  return (
    <V3Shell crumbs={crumbs} wide>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <StepBar
            topic={topic}
            set={set}
            active="arrange"
            right={
              <Link
                to={blastOffPath(topic, set, "film")}
                className="rounded-lg px-2.5 py-1"
                style={{ border: `1px solid ${V3_EDGE}`, color: V3_MUTED, fontSize: 11.5, textDecoration: "none", whiteSpace: "nowrap" }}
                title="Capture in this window instead of the canvas — one frame at a time"
              >
                Capture in-page →
              </Link>
            }
          />
          <BlastOffEditor
            set={set}
            topicName={topic.name}
            onCapture={() => void navigate({ to: blastOffPath(topic, set, "film") })}
          />
        </>
      )}
    </V3Shell>
  );
}
