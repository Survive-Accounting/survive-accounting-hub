// /v3/$topic — the sets inside one topic.
//
// The middle door. Deliberately the same shape as the topic list: a column of
// big targets and nothing else, so moving down the tree never changes how the
// screen works.
//
// SUBCATEGORIES (2026-09-06, Lee: "Add subcategories to /strategy so I know what's for
// onboarding reps... order them in the same order a rep would view them. Any other
// subcategories, make them."). The grouping is lib/v3-topic-groups.ts — a topic with no
// groups there renders exactly as before, one column. A group whose order is the point
// (a rep's onboarding sequence) numbers its rows, since here the number IS information.
import { createFileRoute, Link } from "@tanstack/react-router";

import { useBank, findTopic, slugOf } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import { groupSets } from "@/lib/v3-topic-groups";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/$topic/")({
  component: V3Topic,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Topic() {
  const { topic: topicKey } = Route.useParams();
  const { topics, error } = useBank();
  const topic = topics ? findTopic(topics, topicKey) : undefined;
  const groups = topic ? groupSets(slugOf(topic.name), topic.sets) : [];

  return (
    <V3Shell crumbs={[{ label: "V3", to: "/v3" }, { label: topic?.name ?? topicKey }]}>
      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading…</V3Note>}
      {topics && !topic && <V3Note tone="bad">No topic called “{topicKey}” in the live bank.</V3Note>}

      {topic && (
        <>
          <h1 style={{ fontFamily: V3_DISPLAY, fontSize: 34, fontWeight: 900, letterSpacing: "-0.01em", margin: "0 0 4px", textWrap: "balance" }}>
            {topic.name}
          </h1>
          <div style={{ color: V3_MUTED, fontSize: 13, marginBottom: 22 }}>
            {topic.sets.length} set{topic.sets.length === 1 ? "" : "s"} — pick one to film
          </div>

          {topic.sets.length === 0 && <V3Note>No sets in this topic yet.</V3Note>}

          <div className="flex flex-col" style={{ gap: 26 }}>
            {groups.map((g, gi) => (
              <section key={g.label ?? `group-${gi}`}>
                {g.label && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_GOLD }}>
                      {g.label}
                      <span style={{ color: V3_MUTED, fontWeight: 600, letterSpacing: 0, textTransform: "none", marginLeft: 8 }}>
                        · {g.sets.length} short{g.sets.length === 1 ? "" : "s"}{g.ordered ? " · in order" : ""}
                      </span>
                    </div>
                    {g.blurb && <div style={{ color: V3_MUTED, fontSize: 12.5, marginTop: 3, maxWidth: 560, lineHeight: 1.45 }}>{g.blurb}</div>}
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {g.sets.map((s, i) => <SetRow key={s.id} topic={topic} set={s} n={g.ordered ? i + 1 : null} />)}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </V3Shell>
  );
}

function SetRow({ topic, set: s, n }: { topic: BoothTopic; set: BoothSetInfo; n: number | null }) {
  return (
    <Link
      to="/v3/$topic/$set"
      params={{ topic: slugOf(topic.name), set: slugOf(s.name) }}
      className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/5"
      style={{ border: `1px solid ${V3_EDGE}`, color: V3_CREAM, textDecoration: "none" }}
    >
      {n !== null && (
        <span style={{ fontFamily: V3_DISPLAY, fontSize: 13, fontWeight: 800, color: V3_GOLD, minWidth: 22, fontVariantNumeric: "tabular-nums" }} aria-label={`number ${n}`}>{n}</span>
      )}
      <span style={{ fontFamily: V3_DISPLAY, fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0 }}>{s.name}</span>
      <span style={{ color: V3_MUTED, fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
        {s.liveCount} q{s.draftCount ? ` · ${s.draftCount} draft` : ""}
      </span>
      <span style={{ color: V3_GOLD, fontSize: 18, lineHeight: 1 }} aria-hidden>→</span>
    </Link>
  );
}
