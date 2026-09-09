// /v3/$topic/$set/blast-off/results — STEP 2. Review — named EDITOR since 2026-09-07 (Lee: "I
// think Review should be named Editor"); the URL segment stays "results".
//
// Lee (2026-09-03): "Talkthrough is just talking. Review is seeing the filming
// draft as it stands and adding new slides, editing current ones, removing,
// rearranging — just getting it SOLID before I do the film run."
//
// So the page IS the film draft (components/blastoff/ReviewDeck.tsx): the
// Blast Off plan as slides, the selected slide editable, the teleprompter
// column of his own words. The AI board — transcript, script, CEQ edits,
// ideas — is still here, folded underneath; an idea's "＋ slide" drops it
// onto the draft after the selected slide.
// 2026-09-07: no teleprompter on the Editor — lines are made on Rehearse & Film (rounds + the
// rehearsal review). The right column is two side-by-side buttons, Editor | Illustrator.
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { ReviewDeck, type DeckApi } from "@/components/blastoff/ReviewDeck";
import { frameForIdea } from "@/components/blastoff/idea-to-slide";
import { SplitPanel } from "@/components/blastoff/SplitPanel";
import { SessionView } from "@/components/talkthrough/SessionView";
import { listSessions, sessionMeta } from "@/components/canvas/talkthrough";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { StepBar } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/results")({
  // ?frame=<id> opens with that slide selected (2026-09-06, the illustration bank's "open
  // slide in Review →" — Lee: "link straight to slide in review"). Absent → the first slide.
  validateSearch: (s: Record<string, unknown>): { frame?: string } => (typeof s.frame === "string" && s.frame ? { frame: s.frame } : {}),
  component: () => <AdminGate><V3Results /></AdminGate>,
  head: () => ({ meta: [{ title: "✨ Editor — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Results() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { frame: frameParam } = Route.useSearch();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  // THE KNIFE is open (SplitPanel) — off by default; the step bar's ✂ Split toggles it.
  const [split, setSplit] = useState(false);

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

  // The deck's verbs, for the AI board's "＋ slide".
  const deck = useRef<DeckApi | null>(null);
  const register = useCallback((api: DeckApi | null) => { deck.current = api; }, []);
  // ONE BUILDER (2026-09-08, blastoff/idea-to-slide.ts). This used to shove the board item's
  // whole multi-line body into a cheat frame's `title` and set nothing else — Lee: "they just
  // ended up all in the title. Not the list part." The heading is the heading and the body is
  // the bullets now, and the Suggestions page adds slides through the same function.
  const addSlide = useCallback((kind: string, text: string, itemId: string, title?: string) => {
    const f = frameForIdea({ kind, text, itemId, title });
    const { id: _id, kind: frameKind, ...patch } = f;
    deck.current?.addSlide(frameKind, patch);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const crumbs = [
    { label: "V3", to: "/v3" },
    { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
    { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
    { label: "Blast Off", to: `/v3/${topicKey}/${setKey}/blast-off` },
    { label: "Editor" },
  ];

  return (
    <V3Shell crumbs={crumbs} wide>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          {/* THE KNIFE (2026-09-09, components/blastoff/SplitPanel.tsx). Lee: "the splitting has to
              be ruthless… a short for assets, one for liabilities, one for equity, one for revenue,
              one for expense." A Blast Off plan is one per set, so a set over the ceiling is cut
              into sibling sets from here, then each gets its own Editor and Film. */}
          <StepBar topic={topic} set={set} active="results" right={
            <button onClick={() => setSplit((v) => !v)} className="rounded-xl px-3.5 py-2"
              style={{ border: `1.5px solid ${split ? V3_GOLD : V3_EDGE}`, background: split ? "rgba(252,163,17,0.12)" : "transparent", color: split ? V3_CREAM : V3_MUTED, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              title={`Cut this set into sibling sets — ${set.liveCount} cards is ${set.liveCount > 12 ? "over" : "under"} the 12-card ceiling for one Short`}>
              ✂ Split{set.liveCount > 12 ? ` · ${set.liveCount} cards` : ""}
            </button>
          } />

          {split && <SplitPanel set={set} topic={topic} onClose={() => setSplit(false)} />}

          <ReviewDeck set={set} topic={topic} register={register} initialSelectedId={frameParam ?? null} />

          <details style={{ marginTop: 22, border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "8px 14px" }}>
            <summary style={{ cursor: "pointer", fontSize: 11, letterSpacing: "0.2em", color: V3_GOLD, textTransform: "uppercase", fontWeight: 800 }}>
              Transcript &amp; AI board {session ? "" : "— nothing captured yet"}
            </summary>
            <div style={{ marginTop: 12 }}>
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
                  onAddSlide={addSlide}
                />
              )}
            </div>
          </details>
        </>
      )}
    </V3Shell>
  );
}
