// /v3/$topic/$set/blast-off/film — STEP 3. Capture.
//
// The /blast-off capture surface (components/blastoff/BlastOffEditor.tsx),
// full screen: one frame, spacebar forward, nothing else in the shot — OBS
// captures this window. No V3 shell here on purpose; Escape goes back to the
// step menu. The canvas film surface (bolt cursor, spotlight, pin) is still
// reached with "Send to film →" on the Arrange step.
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BlastOffCapture } from "@/components/blastoff/BlastOffCapture";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/film")({
  // ?popout=1 marks the 9:16 pop-out window (components/blastoff/capture/popout.ts).
  // Declared so TanStack keeps it through its search handling; the hook reads the location.
  validateSearch: (s: Record<string, unknown>): { popout?: 1 } => (s.popout === 1 || s.popout === "1" || s.popout === true ? { popout: 1 } : {}),
  component: () => <AdminGate><V3Film /></AdminGate>,
  head: () => ({ meta: [{ title: "🎬 Film — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Film() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  if (set && topic) {
    return <BlastOffCapture set={set} topicName={topic.name} onExit={() => void navigate({ to: blastOffPath(topic, set) })} />;
  }

  const crumbs = [
    { label: "V3", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Film" },
  ];
  return (
    <V3Shell crumbs={crumbs}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}
    </V3Shell>
  );
}
