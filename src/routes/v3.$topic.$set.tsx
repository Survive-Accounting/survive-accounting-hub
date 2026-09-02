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
// V3 is Blast Off only, so that is the one door that opens.
import { createFileRoute, Link } from "@tanstack/react-router";
import { GraduationCap, Rocket, ClipboardList } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useBank, findSet, findTopic, slugOf } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/$set")({
  component: V3Set,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Set() {
  const { topic: topicKey, set: setKey } = Route.useParams();
  const { topics, error } = useBank();
  const topic = topics ? findTopic(topics, topicKey) : undefined;
  const set = topic ? findSet(topic, setKey) : undefined;

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
              blurb="Arrange the running order, edit the slides, film it."
              to="/blast-off"
            />
            <Door icon={ClipboardList} title="Practice" blurb="The question set students work through." soon />
            <Door icon={GraduationCap} title="Review" blurb="The long-form walkthrough video." soon />
          </div>
        </>
      )}
    </V3Shell>
  );
}

/** One door. Big enough to hit without aiming, and honest about being closed. */
function Door({ icon: Icon, title, blurb, to, soon }: {
  icon: LucideIcon; title: string; blurb: string; to?: string; soon?: boolean;
}) {
  const body = (
    <>
      <Icon style={{ width: 30, height: 30, color: soon ? V3_MUTED : V3_GOLD }} />
      <span style={{ fontFamily: V3_DISPLAY, fontSize: 21, fontWeight: 900, marginTop: 12, color: soon ? V3_MUTED : V3_CREAM }}>
        {title}
      </span>
      <span style={{ fontSize: 12.5, color: V3_MUTED, marginTop: 6, lineHeight: 1.4 }}>{blurb}</span>
      {soon && (
        <span style={{ marginTop: 10, fontSize: 10, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: V3_MUTED, border: `1px solid ${V3_EDGE}`, borderRadius: 5, padding: "2px 7px" }}>
          later
        </span>
      )}
    </>
  );

  const box: React.CSSProperties = {
    width: 250, minHeight: 190,
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    border: `1.5px solid ${soon ? V3_EDGE : "rgba(252,163,17,0.55)"}`,
    borderRadius: 18, padding: "22px 20px",
    textAlign: "left", textDecoration: "none",
    background: soon ? "transparent" : "rgba(252,163,17,0.06)",
    opacity: soon ? 0.55 : 1,
    cursor: soon ? "not-allowed" : "pointer",
  };

  if (soon || !to) {
    return <div style={box} aria-disabled>{body}</div>;
  }
  return <Link to={to} style={box} className="transition-colors hover:bg-white/5">{body}</Link>;
}
