// /blastoff-demo — every vertical Blast Off frame, mounted STANDALONE at true
// 1080x1920 and scaled to fit. This is the visual QA surface before filming:
// no canvas, no router state, no set data. If a frame renders here it renders
// on camera.
//
// The PROGRESS slider drives every card's reveal from one deterministic value —
// the same number always produces the same pixels, which is what makes these
// renderable offline later instead of screen-captured.
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AdminGate } from "@/components/AdminGate";
import { SurviveIntro } from "@/components/blastoff/SurviveIntro";
import { SurviveOutro } from "@/components/blastoff/SurviveOutro";
import { FoundOnYourExam } from "@/components/blastoff/FoundOnYourExam";
import { CheatCodeFrame, PhraseFrame, TipFrame } from "@/components/blastoff/ContentFrames";

export const Route = createFileRoute("/blastoff-demo")({
  component: BlastOffDemo,
  head: () => ({ meta: [{ title: "Blast Off frames — Survive" }, { name: "robots", content: "noindex" }] }),
});

// A real set's stems, so FOUND ON YOUR EXAM is generating from the actual bank
// shape rather than lorem.
const CYCLE_STEMS = [
  "What is the correct order?",
  "Which step comes FIRST in the accounting cycle?",
  "Which step comes LAST in the accounting cycle?",
  "Which step immediately follows journalizing?",
  "Which step immediately precedes the adjusted trial balance?",
  "When does closing happen?",
  "Adjusting entries are recorded BEFORE the unadjusted trial balance.",
  "Which list shows the full accounting cycle in the correct order?",
];

const SCALE = 0.29; // 1080 -> ~313px, six across a laptop

function BlastOffDemo() {
  const [p, setP] = useState(1);
  const [live, setLive] = useState(false);
  const progress = live ? undefined : p;

  const cards: [string, React.ReactNode][] = [
    ["Intro", <SurviveIntro topic="Accounting cycle order" progress={progress} scale={SCALE} />],
    ["Found On Your Exam", <FoundOnYourExam stems={CYCLE_STEMS} progress={progress} scale={SCALE} />],
    ["Phrase", <PhraseFrame text="Question order is teaching order." progress={progress} scale={SCALE} />],
    ["Cheat code", <CheatCodeFrame title="Anything “Payable” is always a liability" body="If the name ends in Payable, you OWE it. No exceptions on Exam 1." progress={progress} scale={SCALE} />],
    ["Tip / Trick", <TipFrame text="Put a 12/31 button in your brain — every adjusting entry happens there." progress={progress} scale={SCALE} />],
    ["Outro", <SurviveOutro progress={progress} scale={SCALE} />],
  ];

  return (
    <AdminGate>
      <div style={{ minHeight: "100vh", background: "#070B14", color: "#F4EFE6", fontFamily: "'Rubik', system-ui, sans-serif", padding: "22px 26px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginBottom: 6 }}>
          <h1 style={{ fontFamily: "'League Spartan', sans-serif", fontWeight: 800, fontSize: 22, letterSpacing: "0.06em", textTransform: "uppercase", margin: 0 }}>
            Blast Off frames · 9:16
          </h1>
          <span style={{ fontSize: 12, color: "#9AA3B8" }}>every card at true 1080×1920, scaled {Math.round(SCALE * 100)}%</span>
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            live boil (wall-clock)
          </label>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
          <span style={{ fontSize: 12, color: "#9AA3B8", minWidth: 76 }}>progress {live ? "—" : p.toFixed(2)}</span>
          <input type="range" min={0} max={1} step={0.01} value={p} disabled={live}
            onChange={(e) => setP(Number(e.target.value))} style={{ flex: 1, maxWidth: 520, accentColor: "#FCA311" }} />
          <span style={{ fontSize: 11, color: "#9AA3B8" }}>
            deterministic — the same value always renders the same pixels
          </span>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 26 }}>
          {cards.map(([label, node]) => (
            <div key={label}>
              <div style={{ fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "#FCA311", fontWeight: 800, marginBottom: 7 }}>{label}</div>
              <div style={{ border: "1px solid rgba(244,239,230,0.16)", borderRadius: 10, overflow: "hidden", lineHeight: 0 }}>{node}</div>
            </div>
          ))}
        </div>
      </div>
    </AdminGate>
  );
}
