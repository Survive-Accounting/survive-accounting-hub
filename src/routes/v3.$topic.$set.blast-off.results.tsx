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
import { listSessions, sessionMeta } from "@/components/canvas/talkthrough";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

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

  // Every session on this set, newest first — a CEQ sitting and an exhibit
  // sitting are separate sessions with separate boards, so Lee picks which
  // one he is reviewing. Newest by default.
  const sessions = useMemo(() => (set ? listSessions(tt.doc).filter((x) => x.setId === set.id) : []), [tt.doc, set]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === pickedId) ?? sessions[0] ?? null;

  const crumbs = [
    { label: "The Queue", to: "/v3" },
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
          {sessions.length > 1 && (
            <div className="flex items-center gap-2" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_MUTED }}>Session</span>
              {sessions.map((s) => {
                const on = s.id === session?.id;
                const m = sessionMeta(tt.doc, s);
                return (
                  <button
                    key={s.id}
                    onClick={() => setPickedId(s.id)}
                    className="rounded-lg px-2.5 py-1"
                    style={{ border: `1px solid ${on ? V3_GOLD : V3_EDGE}`, background: on ? "rgba(252,163,17,0.12)" : "transparent", color: on ? V3_CREAM : V3_MUTED, fontSize: 11.5, cursor: "pointer" }}
                    title={`${m.segments} segments · ${m.words} words${s.endedAt ? "" : " · still open"}`}
                  >
                    {new Date(s.startedAt).toLocaleString()} · {m.words} words{s.endedAt ? "" : " · open"}
                  </button>
                );
              })}
            </div>
          )}
          {session && (
            <SessionView
              tt={tt}
              session={session}
              set={set}
              onResume={() => void navigate({ to: blastOffPath(topic, set, "talkthrough") })}
              editBase={`${blastOffPath(topic, set)}/edit`}
            />
          )}
        </>
      )}
    </V3Shell>
  );
}
