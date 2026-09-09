// /v3/$topic/$set/blast-off/suggestions — THE BOARD, ON ITS OWN PAGE.
//
// Lee, 2026-09-08, after recording a brainstorm for Account classification: "Something isn't
// lined up correctly. I finished recording brainstorm for account-classification, now I can't
// find the 92 suggestions it said are there? I click 'Review →' and it takes me to the same
// link, but it's too hard to find the results. It should take me to a separate page honestly.
// The editor page is for AFTER we've reviewed. So create a new route to go to, then land back
// on editor when we're actually a bit closer to filming."
//
// He was right about the plumbing: the generation dock's "Review ↗" pointed at the EDITOR, and
// on the Editor the board lives inside a collapsed <details> ("Transcript & AI board") under
// the whole film deck. Ninety-two suggestions were one disclosure triangle and a long scroll
// below the fold. So the board gets its own door, and it is the FIRST thing on it.
//
// NOT A NUMBERED STEP. It sits between Brainstorm and the Editor in the bar without a number,
// so nothing renumbers — the step ids, URLs and the timer's path detection
// (lib/production-time.ts) are untouched. It reads as the landing between talking and building,
// which is what it is.
//
// The page is deliberately thin: it owns no review logic. SessionView / ReviewBoardV2 are the
// same components the Editor folded away, mounted here at full width, plus the session picker
// and one loud way onward — "To the Editor →".
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { addSlideFromIdea } from "@/components/blastoff/idea-to-slide";
import { loadBlastPlan, saveBlastPlan } from "@/lib/blastoff.functions";
import { reconcilePlan, type BlastFrame } from "@/components/blastoff/plan";
import { SessionView } from "@/components/talkthrough/SessionView";
import { listSessions, sessionBoard, sessionMeta } from "@/components/canvas/talkthrough";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/suggestions")({
  component: () => <AdminGate><V3Suggestions /></AdminGate>,
  head: () => ({ meta: [{ title: "💡 Suggestions — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Suggestions() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  const [added, setAdded] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    startTT();
    sweepStrandedReviews();
    const unReview = subscribeReview(() => forceReview((n) => n + 1));
    const unTT = subscribeTT(setTT);
    return () => { unReview(); unTT(); };
  }, []);

  const sessions = useMemo(() => (set ? listSessions(tt.doc).filter((x) => x.setId === set.id) : []), [tt.doc, set]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === pickedId) ?? sessions[0] ?? null;
  const open = session ? sessionBoard(tt.doc, session.id).filter((b) => !b.archivedAt).length : 0;

  // ＋ slide from here writes STRAIGHT TO THE STORED PLAN — this page has no deck mounted, so
  // there is no DeckApi to hand the idea to (the Editor's route passes one down to ReviewDeck).
  // Same builder either way (blastoff/idea-to-slide.ts), so a slide added here and a slide added
  // on the Editor are the same slide.
  const addSlide = useCallback(async (kind: string, text: string, itemId: string, title?: string) => {
    if (!set || busy) return;
    setBusy(true);
    try {
      const stored = await loadBlastPlan({ data: { setId: set.id } });
      const plan = reconcilePlan(stored, set.ceqs);
      const next: BlastFrame[] = addSlideFromIdea(plan.frames, null, { kind, text, itemId, title });
      await saveBlastPlan({ data: { setId: set.id, frames: next } });
      setAdded((n) => n + 1);
      setNote(null);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not add that slide.");
    } finally {
      setBusy(false);
    }
  }, [set, busy]);

  const crumbs = [
    { label: "V3", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Suggestions" },
  ];

  return (
    <V3Shell crumbs={crumbs} wide>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <StepBar topic={topic} set={set} active="suggestions" right={
            <Link to={blastOffPath(topic, set, "results")} className="rounded-xl px-3.5 py-2"
              style={{ border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: V3_CREAM, textDecoration: "none", fontWeight: 800, fontSize: 13 }}
              title="Everything you added lands on the film draft">
              To the Editor →
            </Link>
          } />

          <div className="flex items-baseline" style={{ gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <h1 style={{ fontFamily: "'League Spartan', Rubik, system-ui, sans-serif", fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: "-0.01em" }}>
              {open} suggestion{open === 1 ? "" : "s"}
            </h1>
            <span style={{ color: V3_MUTED, fontSize: 13 }}>
              from what you said out loud. Add the ones worth filming; the rest stay here.
            </span>
            {added > 0 && (
              <span style={{ marginLeft: "auto", color: V3_GOLD, fontSize: 12.5, fontWeight: 700 }}>
                {added} slide{added === 1 ? "" : "s"} added to the draft
              </span>
            )}
          </div>

          {note && <V3Note tone="bad">{note}</V3Note>}

          {!session && (
            <V3Note>
              Nothing captured for this set yet — {tt.loadedRemote ? "start with Step 1, Brainstorm." : "syncing your sessions…"}
            </V3Note>
          )}

          {sessions.length > 1 && (
            <div className="flex items-center gap-2" style={{ marginBottom: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: V3_MUTED }}>Session</span>
              {sessions.map((s) => {
                const on = s.id === session?.id;
                const m = sessionMeta(tt.doc, s);
                return (
                  <button key={s.id} onClick={() => setPickedId(s.id)} className="rounded-lg px-2.5 py-1"
                    style={{ border: `1px solid ${on ? V3_GOLD : V3_EDGE}`, background: on ? "rgba(252,163,17,0.12)" : "transparent", color: on ? V3_CREAM : V3_MUTED, fontSize: 11.5, cursor: "pointer" }}
                    title={`${m.segments} segments · ${m.words} words${s.endedAt ? "" : " · still open"}`}>
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
              onAddSlide={addSlide}
            />
          )}

          <div style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${V3_EDGE}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <Link to={blastOffPath(topic, set, "results")} className="rounded-xl px-4 py-2.5"
              style={{ border: `1.5px solid ${V3_GOLD}`, background: "rgba(252,163,17,0.12)", color: V3_CREAM, textDecoration: "none", fontWeight: 800, fontSize: 14 }}>
              To the Editor →
            </Link>
            <span style={{ color: V3_MUTED, fontSize: 12.5 }}>Order the slides, fix the cards, then film.</span>
          </div>
        </>
      )}
    </V3Shell>
  );
}
