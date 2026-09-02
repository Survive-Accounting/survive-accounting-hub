// /v3/$topic — the sets inside one topic.
//
// The middle door. Deliberately the same shape as the topic list: a column of
// big targets and nothing else, so moving down the tree never changes how the
// screen works.
import { createFileRoute, Link } from "@tanstack/react-router";

import { useBank, findTopic, slugOf } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/$topic/")({
  component: V3Topic,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Topic() {
  const { topic: topicKey } = Route.useParams();
  const { topics, error } = useBank();
  const topic = topics ? findTopic(topics, topicKey) : undefined;

  return (
    <V3Shell crumbs={[{ label: "The Queue", to: "/v3" }, { label: topic?.name ?? topicKey }]}>
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

          <div className="flex flex-col gap-2">
            {topic.sets.map((s) => (
              <Link
                key={s.id}
                to="/v3/$topic/$set"
                params={{ topic: slugOf(topic.name), set: slugOf(s.name) }}
                className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/5"
                style={{ border: `1px solid ${V3_EDGE}`, color: V3_CREAM, textDecoration: "none" }}
              >
                <span style={{ fontFamily: V3_DISPLAY, fontSize: 18, fontWeight: 800, flex: 1, minWidth: 0 }}>{s.name}</span>
                <span style={{ color: V3_MUTED, fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                  {s.liveCount} q{s.draftCount ? ` · ${s.draftCount} draft` : ""}
                </span>
                <span style={{ color: V3_GOLD, fontSize: 18, lineHeight: 1 }} aria-hidden>→</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </V3Shell>
  );
}
