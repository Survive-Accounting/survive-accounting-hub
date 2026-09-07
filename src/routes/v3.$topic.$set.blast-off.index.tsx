// /v3/$topic/$set/blast-off — WHICH STEP ARE YOU ON?
//
// The production line for one Blast Off, as four doors in the order the work
// happens (2026-09-05, "fold Arrange into Review, renumber the steps"):
//   TALKTHROUGH — pure brainstorming. Look through the set and stamp out ideas:
//                 phrases, trigger words, cheat codes, tips, real-world
//                 examples, exhibits. Nothing is arranged here.
//   REVIEW      — the film draft: see the slides, edit, add, skip, rearrange,
//                 drop in what you've banked (what "Arrange" used to be its
//                 own step for — retired into a redirect, since Review
//                 already did all of it).
//   FILM        — capture. Its own door for the first time.
//   POST        — queue what's filmed, process it, publish it. Its own page
//                 since 2026-09-06 (/v3/post, cross-set — blastOffPath sends
//                 this door there); until then it rendered as Door's own
//                 "soon" state, not a broken link.
//
// Every step is its own URL so browser back works and a step can be linked to.
// Nothing here loads the canvas; it is a menu.
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard, Mic, Send, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { usePlan } from "@/components/blastoff/BlastOffEditor";
import { estimatedLengthSeconds, fmtRange, slideCounts } from "@/components/blastoff/film-summary";
import { Door } from "@/components/v3/Door";
import { STEPS, type NumberedStep } from "@/components/v3/StepBar";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_DISPLAY, V3_MUTED, V3_GOLD, V3_EDGE, V3_CREAM } from "@/components/v3/Shell";
import { listIllustrationLibrary } from "@/lib/illustrate.functions";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/")({
  component: V3BlastOff,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

// Icons for the four numbered steps only — "arrange" (still in the BlastOffStep vocabulary as a
// redirect into Review) has had no door since 2026-09-05, so it gets no icon.
const STEP_ICON: Record<NumberedStep, LucideIcon> = { talkthrough: Mic, results: Wand2, film: Clapperboard, post: Send };

function V3BlastOff() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  return (
    <V3Shell
      crumbs={[
        { label: "V3", to: "/v3" },
        { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
        { label: set?.name ?? setKey, to: `/v3/${topicKey}/${setKey}` },
        { label: "Blast Off" },
      ]}
    >
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 36, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px", textWrap: "balance" }}>
            ⚡ {set.name}
          </h1>
          <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 30 }}>
            Blast Off · {topic.name} · {set.liveCount} question{set.liveCount === 1 ? "" : "s"}
          </div>

          <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 14 }}>
            Which step are you on?
          </h2>

          {/* The same steps the StepBar shows on every step screen (four since 2026-09-05) —
              one list, so the doors and the bar can never disagree. */}
          <div className="flex flex-wrap gap-3">
            {STEPS.map((s) => (
              <Door
                key={s.step}
                kicker={`Step ${s.n}`}
                icon={STEP_ICON[s.step]}
                title={s.label}
                blurb={s.blurb}
                to={blastOffPath(topic, set, s.step)}
                soon={s.soon}
              />
            ))}
          </div>

          <FilmPreflight set={set} topic={topic} />
        </>
      )}
    </V3Shell>
  );
}

/** THE FILM SUMMARY (Lee, 2026-09-05: "just a summary of total slides... # of Q's, # of
 *  memorize this, # of cheat code, # of deep idea, # of illustration, and total production
 *  cost") — a pre-flight readout before Lee commits to a take. Its own component, mounted only
 *  once a real set exists, so usePlan's fetch never fires against a placeholder id. */
function FilmPreflight({ set, topic }: { set: BoothSetInfo; topic: BoothTopic }) {
  const { plan } = usePlan(set);
  const [illoCost, setIlloCost] = useState<number | null>(null);
  useEffect(() => {
    listIllustrationLibrary({ data: { setId: set.id } })
      .then((r) => setIlloCost(r.rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0)))
      .catch(() => setIlloCost(null));
  }, [set.id]);

  if (!plan) return null;
  const counts = slideCounts(plan.frames);
  const range = estimatedLengthSeconds(counts);
  const stat = (label: string, n: number) => (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: V3_CREAM, fontVariantNumeric: "tabular-nums" }}>{n}</div>
      <div style={{ fontSize: 10.5, color: V3_MUTED, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    </div>
  );
  return (
    <div style={{ marginTop: 26, padding: "14px 18px", border: `1px solid ${V3_EDGE}`, borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD }}>Before you film</span>
        <span style={{ fontSize: 12, color: V3_MUTED, marginLeft: "auto" }}>🎙 Rehearse lives on Film itself now — press R once you're there.</span>
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
