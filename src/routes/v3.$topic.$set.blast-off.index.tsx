// /v3/$topic/$set/blast-off — WHICH STEP ARE YOU ON?
//
// The production line for one Blast Off, as three doors in the order the work
// happens (V3 handoff, Lee's words):
//   TALKTHROUGH — pure brainstorming. Look through the set and stamp out ideas:
//                 phrases, trigger words, cheat codes, tips, real-world
//                 examples, exhibits. Nothing is arranged here.
//   ARRANGE     — the ideas become reusable elements dropped between slides.
//                 Review each slide, add and remove.
//   FILM        — capture.
//
// Every step is its own URL so browser back works and a step can be linked to.
// Nothing here loads the canvas; it is a menu.
import { createFileRoute } from "@tanstack/react-router";
import { Clapperboard, LayoutList, Mic } from "lucide-react";

import { Door } from "@/components/v3/Door";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_DISPLAY, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/blast-off/")({
  component: V3BlastOff,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3BlastOff() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  return (
    <V3Shell
      crumbs={[
        { label: "Home", to: "/v3" },
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

          <div className="flex flex-wrap gap-3">
            <Door
              kicker="Step 1"
              icon={Mic}
              title="Talkthrough"
              blurb="Look through the set and stamp out ideas — phrases, cheat codes, tips, real-world examples, exhibits."
              to={blastOffPath(topic, set, "talkthrough")}
            />
            <Door
              kicker="Step 2"
              icon={LayoutList}
              title="Arrange"
              blurb="The running order. Drop what you banked between the set's cards, then send it to film."
              to={blastOffPath(topic, set, "arrange")}
            />
            <Door
              kicker="Step 3"
              icon={Clapperboard}
              title="Film"
              blurb="One frame at a time, spacebar forward. Talk."
              to={blastOffPath(topic, set, "film")}
            />
          </div>
        </>
      )}
    </V3Shell>
  );
}
