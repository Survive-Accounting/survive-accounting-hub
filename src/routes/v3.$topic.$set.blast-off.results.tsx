// /v3/$topic/$set/blast-off/results — STEP 2. Generate results.
//
// The set's latest talkthrough session, with the review board the AI pass
// builds from it: the script, the ideas Lee stamped, the exhibit prompt (a
// Claude Code prompt grounded in what he said about the exhibit), CEQ edits.
// This is the studio's SessionView (components/talkthrough/SessionView.tsx)
// mounted inside V3, so nothing here leaves the breadcrumb trail.
//
// "Generate review" runs on whatever is captured so far — the session does
// not have to be ended first. "resume talking" goes back to Step 1.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { SessionView } from "@/components/talkthrough/SessionView";
import { listSessions } from "@/components/canvas/talkthrough";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/results")({
  component: () => <AdminGate><V3Results /></AdminGate>,
  head: () => ({ meta: [{ title: "✨ Results — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Results() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);

  useEffect(() => {
    startTT();
    sweepStrandedReviews();
    const unReview = subscribeReview(() => forceReview((n) => n + 1));
    const unTT = subscribeTT(setTT);
    return () => { unReview(); unTT(); };
  }, []);

  // The set's newest session — open or ended. listSessions is newest first.
  const session = useMemo(() => (set ? listSessions(tt.doc).find((x) => x.setId === set.id) ?? null : null), [tt.doc, set]);

  const crumbs = [
    { label: "Home", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Generate results" },
  ];

  return (
    <V3Shell crumbs={crumbs} wide>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <StepBar topic={topic} set={set} active="results" />
          {!session && (
            <V3Note>
              Nothing captured for this set yet — {tt.loadedRemote ? "start with Step 1." : "syncing your sessions…"}
            </V3Note>
          )}
          {session && (
            <SessionView
              tt={tt}
              session={session}
              set={set}
              onResume={() => void navigate({ to: blastOffPath(topic, set, "talkthrough") })}
            />
          )}
        </>
      )}
    </V3Shell>
  );
}
