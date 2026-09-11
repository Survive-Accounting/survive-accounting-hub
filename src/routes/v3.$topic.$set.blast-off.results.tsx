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
import { usePlan } from "@/components/blastoff/BlastOffEditor";
import { ReviewDeck, type DeckApi } from "@/components/blastoff/ReviewDeck";
import { estimatedLengthSeconds, fmtRange, slideCounts } from "@/components/blastoff/film-summary";
import { frameForIdea } from "@/components/blastoff/idea-to-slide";
import { SplitPanel } from "@/components/blastoff/SplitPanel";
import { SessionView } from "@/components/talkthrough/SessionView";
import { SuggestedCards } from "@/components/v3/SuggestedCards";
import { refreshBank } from "@/components/v3/use-bank";
import { listSessions, sessionMeta } from "@/components/canvas/talkthrough";
import { startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { listIllustrationLibrary } from "@/lib/illustrate.functions";
import type { BoothSetInfo } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/results")({
  // ?frame=<id> opens with that slide selected (2026-09-06, the illustration bank's "open
  // slide in Review →" — Lee: "link straight to slide in review"). Absent → the first slide.
  // ?frame=<id> scrolls to one slide; ?take=N (1-based) opens ONE split and folds the rest —
  // Lee, 2026-09-10: "I am trying to go to the Editor for JUST a split."
  validateSearch: (s: Record<string, unknown>): { frame?: string; take?: number } => {
    const take = Number(s.take);
    return {
      ...(typeof s.frame === "string" && s.frame ? { frame: s.frame } : {}),
      ...(s.take !== undefined && s.take !== null && s.take !== "" && Number.isInteger(take) && take >= 1 ? { take } : {}),
    };
  },
  component: () => <AdminGate><V3Results /></AdminGate>,
  head: () => ({ meta: [{ title: "✨ Editor — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Results() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { frame: frameParam, take: takeParam } = Route.useSearch();
  const navigate = useNavigate();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  // THE KNIFE is open (SplitPanel) — off by default; the step bar's ✂ Split toggles it.
  const [split, setSplit] = useState(false);
  // THE PRE-FLIGHT FOLD is open — closed by default, and the readout inside is not mounted until
  // it opens (see the <details> below), so its fetches never run on an Editor visit that didn't
  // ask for them.
  const [preflightOpen, setPreflightOpen] = useState(false);

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
          {/* THE KNIFE (components/blastoff/SplitPanel.tsx) is a small button on the deck's own header
              row now — see the knife prop below. */}
          {split && <SplitPanel set={set} topic={topic} onClose={() => setSplit(false)} />}

          {/* SUGGESTED CARDS (docs/DESIGN-CEQ-QUEUE.md, 2026-09-10): what the queue made of the
              brainstorm, ticked into the deck as drafts. Applying refreshes the bank, so the new
              drafts reconcile into the plan below without a reload. */}
          <SuggestedCards deckId={set.id} deckName={set.name} onApplied={() => void refreshBank()} />
          <ReviewDeck set={set} topic={topic} register={register} initialSelectedId={frameParam ?? null} focusTake={takeParam ?? null}
            knife={
              <button onClick={() => setSplit((v) => !v)}
                style={{ background: split ? "rgba(252,163,17,0.12)" : "transparent", border: `1px solid ${split ? V3_GOLD : V3_EDGE}`, borderRadius: 8, color: split ? V3_CREAM : V3_MUTED, cursor: "pointer", padding: "3px 8px", fontSize: 11, lineHeight: 1 }}
                title={`Cut this set into sibling sets — ${set.liveCount} cards`}>✂ split set</button>
            } />

          {/* PRE-FLIGHT (2026-09-09): the film summary that sat under the /blast-off menu's doors.
              That menu is a redirect into this page now (blast-off.index.tsx — so Escape from
              /film lands here in one key), so the numbers live here, folded with the board.
              Closed by default; FilmPreflight is mounted only once the fold opens, so usePlan's
              fetch and the illustration-library call fire when Lee asks for the readout, not on
              every visit to the Editor. */}
          <details
            onToggle={(e) => setPreflightOpen(e.currentTarget.open)}
            style={{ marginTop: 22, border: `1px solid ${V3_EDGE}`, borderRadius: 12, padding: "8px 14px" }}
          >
            <summary style={{ cursor: "pointer", fontSize: 11, letterSpacing: "0.2em", color: V3_GOLD, textTransform: "uppercase", fontWeight: 800 }}>
              Pre-flight
            </summary>
            {preflightOpen && <FilmPreflight set={set} />}
          </details>

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

/** THE FILM SUMMARY (Lee, 2026-09-05: "just a summary of total slides... # of Q's, # of
 *  memorize this, # of cheat code, # of deep idea, # of illustration, and total production
 *  cost") — a pre-flight readout before Lee commits to a take. It lived under the /blast-off
 *  menu's doors until 2026-09-09, when that menu became a redirect into this page; its own
 *  component, mounted only while the Pre-flight fold is open, so usePlan's fetch and the
 *  illustration-library call never fire on an Editor visit that didn't ask for them.
 *
 *  It reads the STORED plan — ReviewDeck has the copy being edited, and usePlan saves that copy
 *  500 ms after the typing pauses — so a slide added a moment ago shows up here on the next open,
 *  not the same instant. This instance never commits, so the two hooks cannot fight over the
 *  save. */
function FilmPreflight({ set }: { set: BoothSetInfo }) {
  const { plan } = usePlan(set);
  const [illoCost, setIlloCost] = useState<number | null>(null);
  useEffect(() => {
    listIllustrationLibrary({ data: { setId: set.id } })
      .then((r) => setIlloCost(r.rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0)))
      .catch(() => setIlloCost(null));
  }, [set.id]);

  if (!plan) return <div style={{ marginTop: 12, fontSize: 12, color: V3_MUTED }}>Counting the slides…</div>;
  const counts = slideCounts(plan.frames);
  // Lee's own ask on the summary (2026-09-05): "an estimate range of video length based on how
  // many slides" — film-summary.ts's heuristic, a range and not a promise.
  const range = estimatedLengthSeconds(counts);
  const stat = (label: string, n: number) => (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: V3_CREAM, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 10.5, color: V3_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD }}>Before you film</span>
        <span style={{ fontSize: 12, color: V3_MUTED }}>≈ {fmtRange(range)} on camera</span>
        <span style={{ fontSize: 12, color: V3_MUTED, marginLeft: "auto" }}>🎙 Rehearsal lives on Rehearse &amp; Film — press R once you're there.</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(76px, 1fr))", gap: 10 }}>
        {stat("Slides", counts.total)}
        {stat("Questions", counts.questions)}
        {stat("Memorize this", counts.memorizeThis)}
        {stat("Cheat code", counts.cheatCode)}
        {stat("Deep question", counts.deeperIdea)}
        {stat("Illustrations", counts.illustrations)}
      </div>
      {illoCost !== null && illoCost > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${V3_EDGE}`, fontSize: 12, color: V3_MUTED }}>
          Production cost so far: <b style={{ color: V3_CREAM }}>${illoCost.toFixed(2)}</b> (illustrations — Mux joins this once Post is wired up)
        </div>
      )}
    </div>
  );
}
