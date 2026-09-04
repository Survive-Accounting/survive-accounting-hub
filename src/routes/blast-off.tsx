// /blast-off — the filming room. Pick a set, EDIT the running order, then
// CAPTURE it: one vertical frame at a time, spacebar forward, and talk.
//
// 2026-09-02: the editor, preview and capture moved to components/blastoff/
// BlastOffEditor.tsx so they also mount under /v3/$topic/$set/blast-off. This
// route is now the set list plus those screens; nothing on it was redesigned.
//
// Deliberately NOT the study canvas. The canvas is an authoring surface with
// 41 node types and a whole stage; a Blast Off is a list of nine-by-sixteen
// cards Lee talks over. Putting the frames on the canvas made them elements
// floating inside a CEQ frame, which is not what they are.
//
// The plan lives ON THE SET (deck.blastOff in scene JSON), so it travels with
// the questions it films and reconciles against them every time it loads: add
// a question to the bank and it shows up here rather than going unfilmed.
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Clapperboard, Pencil } from "lucide-react";

import { AdminGate } from "@/components/AdminGate";
import { loadBoothBank, type BoothSetInfo, type BoothTopic } from "@/lib/talkthrough.functions";
import { BG, BlastOffEditor, CREAM, EDGE, GOLD, MUTED, PANEL } from "@/components/blastoff/BlastOffEditor";
import { BlastOffCapture } from "@/components/blastoff/BlastOffCapture";

export const Route = createFileRoute("/blast-off")({
  component: BlastOffRoute,
  head: () => ({ meta: [{ title: "Blast Off — Survive" }, { name: "robots", content: "noindex" }] }),
});

type View = { mode: "home" } | { mode: "edit" | "capture"; setId: string };

function BlastOffRoute() {
  return <AdminGate><BlastOff /></AdminGate>;
}

function BlastOff() {
  const [topics, setTopics] = useState<BoothTopic[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "home" });

  useEffect(() => {
    loadBoothBank().then((r) => setTopics(r.topics)).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  // The set AND the topic it lives under — the topic name is the kicker the
  // canvas prints above a question stem ("EASY POINTS"), so the preview needs it.
  const found = useMemo(() => {
    if (view.mode === "home" || !topics) return null;
    for (const t of topics) for (const s of t.sets) if (s.id === view.setId) return { set: s, topicName: t.name };
    return null;
  }, [topics, view]);
  const set = found?.set ?? null;

  if (view.mode === "capture" && set) {
    return <BlastOffCapture set={set} topicName={found?.topicName} onExit={() => setView({ mode: "edit", setId: set.id })} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "20px 26px 70px" }}>
      <header className="flex items-center gap-3" style={{ marginBottom: 20, flexWrap: "wrap" }}>
        {view.mode !== "home" && (
          <button onClick={() => setView({ mode: "home" })}
            style={{ border: `1px solid ${EDGE}`, color: CREAM, background: "transparent", borderRadius: 10, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>
            ← All sets
          </button>
        )}
        <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 21, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
          ⚡ Blast Off
        </h1>
        <span style={{ fontSize: 12, color: MUTED }}>
          {view.mode === "home" ? "pick a set — edit the running order, then capture it" : set?.name}
        </span>
      </header>

      {err && <div style={{ color: "#F87171", fontSize: 13, marginBottom: 12 }}>Could not load the bank: {err}</div>}
      {!topics && !err && <div style={{ color: MUTED, fontSize: 13 }}>Loading the Exam 1 path…</div>}

      {view.mode === "home" && topics && (
        <SetList topics={topics}
          onEdit={(s) => setView({ mode: "edit", setId: s.id })}
          onCapture={(s) => setView({ mode: "capture", setId: s.id })} />
      )}
      {view.mode === "edit" && set && (
        <BlastOffEditor set={set} topicName={found?.topicName} onCapture={() => setView({ mode: "capture", setId: set.id })} />
      )}
      {view.mode === "edit" && !set && topics && <div style={{ color: MUTED }}>Set not found.</div>}
    </div>
  );
}

// ------------------------------------------------------------------ home

function SetList({ topics, onEdit, onCapture }: {
  topics: BoothTopic[]; onEdit: (s: BoothSetInfo) => void; onCapture: (s: BoothSetInfo) => void;
}) {
  return (
    <div style={{ maxWidth: 900 }}>
      {topics.map((t) => (
        <section key={t.id} style={{ marginBottom: 26 }}>
          <h2 style={{ fontFamily: "'League Spartan', sans-serif", fontSize: 12.5, letterSpacing: "0.2em", color: MUTED, textTransform: "uppercase", marginBottom: 9 }}>
            {t.name}
          </h2>
          <div className="flex flex-col gap-1.5">
            {t.sets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl px-4 py-2.5"
                style={{ background: PANEL, border: `1px solid ${EDGE}` }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, minWidth: 260 }}>{s.name}</div>
                <div style={{ color: MUTED, fontSize: 12 }}>{s.liveCount} q</div>
                <button className="ml-auto flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{ border: `1px solid ${EDGE}`, color: CREAM, background: "transparent", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                  onClick={() => onEdit(s)}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
                  style={{ background: GOLD, color: "#0B1322", fontSize: 12, fontWeight: 800, border: "none", cursor: "pointer" }}
                  onClick={() => onCapture(s)}>
                  <Clapperboard className="h-3 w-3" /> Capture
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
