// /v3/$topic/$set — WHAT ARE YOU MAKING? Three doors, one live.
//
// Lee's spec (2026-09-01): "there's three options — you can do the rocket ship
// which is blast off, the exam icon is the practice which we'll build later, and
// the review video is the grad cap. Make these kind of big buttons."
//
// Practice and Review render as REAL, VISIBLY DISABLED doors rather than being
// hidden. The shape of the thing is the point: every set gets three kinds of
// video, and seeing the two that don't exist yet is what makes that obvious —
// to Lee tomorrow, and to whoever builds them.
//
// V3 is Blast Off only, so that is the one door that opens — and it opens
// INTO V3 (/v3/$topic/$set/blast-off), not out to the old /blast-off. Lee, on
// the move (2026-09-02): "the design is right, the route is wrong."
//
// This is an INDEX route (v3.$topic.$set.index.tsx) so the blast-off screens
// are flat siblings under the same URL prefix rather than children rendered
// inside this one — each screen is its own whole surface.
import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Rocket, ClipboardList } from "lucide-react";

import { Door } from "@/components/v3/Door";
import { blastOffPath, useV3Set } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_DISPLAY, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set/")({
  component: V3Set,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Set() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error, topic, set } = useV3Set(topicKey, setKey);

  return (
    <V3Shell
      crumbs={[
        { label: "Home", to: "/v3" },
        { label: topic?.name ?? topicKey, to: `/v3/${topicKey}` },
        { label: set?.name ?? setKey },
      ]}
    >
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !set && <V3Note tone="bad">No set called “{setKey}” under {topic?.name ?? topicKey}.</V3Note>}

      {set && topic && (
        <>
          <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 36, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 6px", textWrap: "balance" }}>
            {set.name}
          </h1>
          <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 30 }}>
            {topic.name} · {set.liveCount} question{set.liveCount === 1 ? "" : "s"}
            {set.draftCount ? ` · ${set.draftCount} draft` : ""}
          </div>

          <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 14 }}>
            What are you making?
          </h2>

          <div className="flex flex-wrap gap-3">
            <Door
              icon={Rocket}
              title="Blast Off"
              blurb="Talk through the set, arrange the running order, film it."
              to={blastOffPath(topic, set)}
            />
            <Door icon={ClipboardList} title="Practice" blurb="The question set students work through." soon />
            <Door icon={GraduationCap} title="Review" blurb="The long-form walkthrough video." soon />
          </div>
        </>
      )}
    </V3Shell>
  );
}
