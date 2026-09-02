// /v3/$topic/$set/blast-off/talkthrough — STEP 1. The booth, on this set.
//
// The same Booth /talkthrough mounts (components/talkthrough/Booth.tsx), with
// V3's rules around it: one set, reached by URL, breadcrumb to come back. The
// path tree on the left shows only this set and its questions — switching
// sets is a menu decision in V3, not a sidebar one.
//
// Sessions are the booth's own: the set's open session is resumed, or a fresh
// one starts (one open session per set, the same rule as the booth home).
// "End Session → Review" runs the usual pre-flight and queues the AI review;
// the review itself is read in the Talkthrough studio (/talkthrough), which
// stays the place for sessions, boards and the bank.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { Booth, boothToPassCeq } from "@/components/talkthrough/Booth";
import { PreFlight } from "@/components/canvas/ReviewBoard";
import { queueReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { listSessions, makeSession, touchRow, type TalkSession } from "@/components/canvas/talkthrough";
import { putSession, startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, topicOfSet, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/talkthrough")({
  component: () => <AdminGate><V3Talkthrough /></AdminGate>,
  head: () => ({ meta: [{ title: "🎙 Talkthrough — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Talkthrough() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [booted, setBooted] = useState(false);
  const [preflight, setPreflight] = useState<TalkSession | null>(null);

  useEffect(() => {
    startTT();
    sweepStrandedReviews();
    setBooted(true);
    return subscribeTT(setTT);
  }, []);

  // The set's open session, if it has one. Reads the store on every change,
  // so a session started on another device shows up once the pull lands.
  const session = useMemo(
    () => (set ? listSessions(tt.doc).find((x) => x.setId === set.id && !x.endedAt) ?? null : null),
    [tt.doc, set],
  );

  // No open session: start one — but only once the local doc is loaded and the
  // server has been asked (or cannot be), so an open session that just has not
  // arrived yet is never doubled.
  const settled = booted && (tt.loadedRemote || !!tt.error || !tt.online);
  useEffect(() => {
    if (!set || session || !settled) return;
    putSession(makeSession(set.id, set.name));
  }, [set, session, settled]);

  const crumbs = [
    { label: "The Queue", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Talkthrough" },
  ];

  if (error) return <V3Shell crumbs={crumbs} wide><V3Note tone="bad">Could not load the bank: {error}</V3Note></V3Shell>;
  if (!topics) return <V3Shell crumbs={crumbs} wide><V3Note>Loading…</V3Note></V3Shell>;
  if (!set || !topic) return <V3Shell crumbs={crumbs} wide><V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note></V3Shell>;

  return (
    <V3Shell crumbs={crumbs} wide>
      <StepBar topic={topic} set={set} active="talkthrough" />

      {!session && <V3Note>{settled ? "Starting a session…" : "Syncing your sessions…"}</V3Note>}

      {session && (
        <Booth
          key={session.id}
          tt={tt}
          session={session}
          set={set}
          // Just this set: V3 changes sets from the menu, not the sidebar.
          topics={[{ ...topic, sets: [set] }]}
          onSwitchSet={(other) => {
            const t = topicOfSet(topics, other.id) ?? topic;
            void navigate({ to: blastOffPath(t, other, "talkthrough") });
          }}
          onEnd={() => setPreflight(session)}
        />
      )}

      {preflight && (
        <PreFlight
          doc={tt.doc}
          session={preflight}
          onCancel={() => setPreflight(null)}
          onGo={(excludedKinds, wantVibePlan) => {
            const ses = preflight;
            setPreflight(null);
            putSession(touchRow(ses, { endedAt: new Date().toISOString() } as Partial<TalkSession>));
            queueReview({ session: ses, ceqs: set.ceqs.map(boothToPassCeq), excludedKinds, wantVibePlan });
            // Step 2 — the results land there as the pass finishes.
            void navigate({ to: blastOffPath(topic, set, "results") });
          }}
        />
      )}
    </V3Shell>
  );
}
