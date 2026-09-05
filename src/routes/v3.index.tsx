// /v3 — THE QUEUE, which is also the home.
//
// Lee (2026-09-02): "the queue may just be the home? At any point we can go
// back there." So this is where production starts and returns to. Two lists:
//
//   1. BLAST OFFS — every Exam 1 set, grouped by topic, one row each. The
//      first items in the queue are always these. Each row shows how far the
//      set has come (talked · results ready · …) and three icon buttons that
//      go straight to the step: 🎙 Talkthrough · ✨ Generate results ·
//      🎬 Send to filming.
//   2. IDEAS IN PRODUCTION — content ideas pushed here from a review board
//      (status "in production"). Each points back at the set's results and
//      can be marked done.
//
// Nothing here loads the canvas or ReactFlow. The Talkthrough store is read
// local-first (startTT), so the status chips are live without a server round
// trip per set.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Check, Clapperboard, Mic, Wand2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { listSessions, touchRow, type BoardItem, type TalkSession } from "@/components/canvas/talkthrough";
import { putBoardItem, startTT, subscribeTT, ttState, type TTState } from "@/components/canvas/talkthrough-sync";
import { reviewStateOf, subscribeReview, sweepStrandedReviews } from "@/components/canvas/talkthrough-review";
import { useBank, slugOf, blastOffPath, type BlastOffStep } from "@/components/v3/use-bank";
import { V3Shell, V3Note, V3_CREAM, V3_DISPLAY, V3_EDGE, V3_GOLD, V3_MUTED } from "@/components/v3/Shell";
import type { BoothSetInfo, BoothTopic } from "@/lib/talkthrough.functions";

export const Route = createFileRoute("/v3/")({
  component: V3Queue,
  head: () => ({ meta: [{ title: "⚡ Survive — V3" }, { name: "robots", content: "noindex" }] }),
});

const STEP_BUTTONS: { step: BlastOffStep; icon: LucideIcon; title: string }[] = [
  { step: "talkthrough", icon: Mic, title: "Step 1 · Talkthrough" },
  { step: "results", icon: Wand2, title: "Step 2 · Generate results" },
  { step: "arrange", icon: Clapperboard, title: "Step 3 · Send to filming" },
];

/** Where a set stands, from its newest session. */
function setStatus(tt: TTState, set: BoothSetInfo): { label: string; color: string } | null {
  const latest: TalkSession | undefined = listSessions(tt.doc).find((s) => s.setId === set.id);
  if (!latest) return null;
  const rs = reviewStateOf(tt.doc, latest);
  switch (rs.state) {
    case "capturing": return { label: "talking", color: "#3BF5A0" };
    case "stale": return { label: "session open", color: V3_MUTED };
    case "queued": return { label: "queued", color: V3_MUTED };
    case "generating": return { label: "generating…", color: "#7DD3FC" };
    case "ready": return { label: "results ready", color: V3_GOLD };
    case "error": return { label: "review failed", color: "#FF8B7E" };
    default: return { label: "talked", color: V3_MUTED };
  }
}

function V3Queue() {
  const { topics, error } = useBank();
  const [tt, setTT] = useState<TTState>(() => ttState());
  const [, forceReview] = useState(0);
  useEffect(() => {
    startTT();
    sweepStrandedReviews();
    const unReview = subscribeReview(() => forceReview((n) => n + 1));
    const unTT = subscribeTT(setTT);
    return () => { unReview(); unTT(); };
  }, []);

  // IDEAS IN PRODUCTION — pushed from a review board. Resolved to their set
  // through the session they came from.
  const sessionSet = useMemo(() => new Map(tt.doc.sessions.map((s) => [s.id, s.setId])), [tt.doc.sessions]);
  const setById = useMemo(() => {
    const m = new Map<string, { set: BoothSetInfo; topic: BoothTopic }>();
    for (const t of topics ?? []) for (const s of t.sets) m.set(s.id, { set: s, topic: t });
    return m;
  }, [topics]);
  const inProduction = useMemo(
    () => tt.doc.boardItems.filter((b) => !b.archivedAt && b.status === "in_production").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [tt.doc.boardItems],
  );

  const totalSets = (topics ?? []).reduce((n, t) => n + t.sets.length, 0);

  return (
    <V3Shell crumbs={[{ label: "V3" }]}>
      <div className="flex flex-col items-center" style={{ textAlign: "center", marginBottom: 36 }}>
        <SurviveWordmark size={96} />
        <div style={{ marginTop: 16, fontSize: 20, fontWeight: 600, color: V3_CREAM }}>
          Cram what's on your exam.
        </div>
      </div>

      {error && <V3Note tone="bad">Could not load the bank: {error}</V3Note>}
      {!topics && !error && <V3Note>Loading the Exam 1 path…</V3Note>}

      {topics && (
        <>
          <div className="flex items-baseline gap-3" style={{ marginBottom: 12 }}>
            <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, margin: 0 }}>
              The queue — Blast Offs
            </h2>
            <span style={{ fontSize: 12, color: V3_MUTED }}>{totalSets} sets · Exam 1</span>
            <span className="ml-auto flex items-center gap-3" style={{ fontSize: 11, color: V3_MUTED }}>
              <span className="flex items-center gap-1"><Mic style={{ width: 12, height: 12 }} /> talk</span>
              <span className="flex items-center gap-1"><Wand2 style={{ width: 12, height: 12 }} /> results</span>
              <span className="flex items-center gap-1"><Clapperboard style={{ width: 12, height: 12 }} /> film</span>
            </span>
          </div>

          <div className="flex flex-col gap-5" style={{ marginBottom: 40 }}>
            {topics.map((t) => (
              <section key={t.id}>
                <Link
                  to="/v3/$topic"
                  params={{ topic: slugOf(t.name) }}
                  style={{ display: "block", fontFamily: V3_DISPLAY, fontSize: 15, fontWeight: 800, color: V3_CREAM, textDecoration: "none", marginBottom: 6 }}
                >
                  {t.name} <span style={{ color: V3_MUTED, fontWeight: 600, fontSize: 12 }}>· {t.sets.length} set{t.sets.length === 1 ? "" : "s"}</span>
                </Link>
                <div className="flex flex-col gap-1.5">
                  {t.sets.map((s) => {
                    const st = setStatus(tt, s);
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ border: `1px solid ${V3_EDGE}` }}>
                        <Link
                          to="/v3/$topic/$set"
                          params={{ topic: slugOf(t.name), set: slugOf(s.name) }}
                          style={{ flex: 1, minWidth: 0, color: V3_CREAM, fontWeight: 700, fontSize: 14, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {s.name}
                        </Link>
                        <span style={{ color: V3_MUTED, fontSize: 12, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{s.liveCount} q</span>
                        <span style={{ minWidth: 96, textAlign: "right", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: st?.color ?? V3_EDGE, whiteSpace: "nowrap" }}>
                          {st?.label ?? "not started"}
                        </span>
                        <div className="flex items-center gap-1">
                          {STEP_BUTTONS.map((b) => (
                            <Link
                              key={b.step}
                              to={blastOffPath(t, s, b.step)}
                              title={b.title}
                              className="flex items-center justify-center rounded-lg transition-colors hover:bg-white/10"
                              style={{ width: 34, height: 30, border: `1px solid ${V3_EDGE}`, color: V3_GOLD }}
                            >
                              <b.icon style={{ width: 14, height: 14 }} />
                            </Link>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <h2 style={{ fontFamily: V3_DISPLAY, fontSize: 12, fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: V3_MUTED, marginBottom: 12 }}>
            Ideas in production <span style={{ fontWeight: 600, letterSpacing: 0, textTransform: "none" }}>· pushed from a review board</span>
          </h2>
          {inProduction.length === 0 ? (
            <V3Note>
              Nothing pushed yet. On a results board, set an idea's status to <b style={{ color: V3_CREAM }}>in_production</b> and it lands here.
            </V3Note>
          ) : (
            <div className="flex flex-col gap-1.5">
              {inProduction.map((b) => {
                const home = setById.get(sessionSet.get(b.sessionId) ?? "");
                return <IdeaRow key={b.id} item={b} home={home} />;
              })}
            </div>
          )}
        </>
      )}
    </V3Shell>
  );
}

function IdeaRow({ item, home }: { item: BoardItem; home?: { set: BoothSetInfo; topic: BoothTopic } }) {
  const kind = String((item.payload as { kind?: string }).kind ?? item.kind).replace(/_/g, " ");
  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-2.5" style={{ border: `1px solid ${V3_EDGE}` }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: V3_GOLD, minWidth: 90 }}>{kind}</span>
      <span style={{ flex: 1, minWidth: 0, color: V3_CREAM, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
      {home ? (
        <Link to={blastOffPath(home.topic, home.set, "results")} style={{ color: V3_MUTED, fontSize: 12, textDecoration: "none", whiteSpace: "nowrap" }} title="Open the set's results board">
          {home.set.name} →
        </Link>
      ) : (
        <span style={{ color: V3_MUTED, fontSize: 12 }}>unplaced</span>
      )}
      <button
        className="flex items-center gap-1 rounded-lg px-2.5 py-1"
        style={{ border: `1px solid ${V3_EDGE}`, color: V3_MUTED, background: "transparent", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}
        title="Mark done — it leaves the queue (status done, never deleted)"
        onClick={() => putBoardItem(touchRow(item, { status: "done" } as Partial<BoardItem>))}
      >
        <Check style={{ width: 12, height: 12 }} /> done
      </button>
    </div>
  );
}
