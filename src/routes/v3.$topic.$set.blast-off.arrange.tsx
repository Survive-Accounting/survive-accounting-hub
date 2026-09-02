// /v3/$topic/$set/blast-off/arrange — STEP 2. The running order.
//
// The /blast-off editor (components/blastoff/BlastOffEditor.tsx), mounted on
// this set inside the V3 shell. Lee, on the move: "the design is right, the
// route is wrong" — so the editor is untouched; it just lives here now.
//
// Inserted cheat codes, phrases and exhibits preview as DETOUR cards — dark,
// gold label, key phrase highlighted — the same flag the sync writes into the
// set, so what Lee arranges here is what the film surface shows.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BlastOffEditor } from "@/components/blastoff/BlastOffEditor";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/arrange")({
  component: () => <AdminGate><V3Arrange /></AdminGate>,
  head: () => ({ meta: [{ title: "⚡ Arrange — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Arrange() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  const crumbs = [
    { label: "Home", to: "/v3" },
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
          <div className="flex items-center gap-3" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_GOLD }}>Step 2 · Arrange</span>
            <span style={{ fontSize: 12.5, color: V3_MUTED }}>
              Drop what you banked between the set's cards. Inserts film as dark detour cards. Then send it to film.
            </span>
          </div>
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
