// /v3 — THE MAIN MENU. Wordmark, the promise, and the Exam 1 topics.
//
// Lee's spec (2026-09-01): "I like the opening except change it to say cram
// what's on your exam, and instead of Open sets just list all the topics — I
// can click them to open, open a specific set, and go back."
//
// So the front page is a list of doors, not a dashboard. Nothing here loads the
// canvas, ReactFlow or a scene — it is a menu, and it should feel like one.
import { createFileRoute, Link } from "@tanstack/react-router";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { useBank, slugOf } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";

export const Route = createFileRoute("/v3/")({
  component: V3Home,
  head: () => ({ meta: [{ title: "⚡ Survive — Blast Off" }, { name: "robots", content: "noindex" }] }),
});

function V3Home() {
  const { topics, error } = useBank();

  return (
    <V3Shell crumbs={[{ label: "Home" }]}>
      <div className="flex flex-col items-center" style={{ textAlign: "center", marginBottom: 44 }}>
        <SurviveWordmark size={116} />
        <div style={{ marginTop: 20, fontSize: 22, fontWeight: 600, color: V3_CREAM }}>
          Cram what's on your exam.
        </div>
      </div>

      <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 12 }}>
        Exam 1 — pick a topic
      </h2>

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading the Exam 1 path…</V3Note>}

      {topics && topics.length === 0 && <V3Note>No topics in the live bank yet.</V3Note>}

      <div className="flex flex-col gap-2">
        {topics?.map((t) => {
          const questions = t.sets.reduce((n, s) => n + s.liveCount, 0);
          return (
            <Link
              key={t.id}
              to="/v3/$topic"
              params={{ topic: slugOf(t.name) }}
              className="flex items-center gap-4 rounded-2xl px-5 py-4 transition-colors hover:bg-white/5"
              style={{ border: `1px solid ${V3_EDGE}`, color: V3_CREAM, textDecoration: "none" }}
            >
              <span style={{ fontFamily: V3_DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: "0.01em", flex: 1, minWidth: 0 }}>
                {t.name}
              </span>
              <span style={{ color: V3_MUTED, fontSize: 12.5, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {t.sets.length} set{t.sets.length === 1 ? "" : "s"} · {questions} q
              </span>
              <span style={{ color: V3_GOLD, fontSize: 18, lineHeight: 1 }} aria-hidden>→</span>
            </Link>
          );
        })}
      </div>
    </V3Shell>
  );
}
