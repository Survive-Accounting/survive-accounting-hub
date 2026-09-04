// /branding — Lee's private wall of the brand slides and the experiments.
//
// Lee (2026-09-04): "It just didn't work, but we can save it in a /branding
// route maybe? Just to return back to some of these experiments sometimes?"
// So: the three slides as they ship today (open, intro, summary), the bolt
// detour in all six animations, and the second-pass "gallery" look — the
// animated backdrop under a white wordmark — kept exactly as it was.
//
// Private = AdminGate + noindex. Nothing here writes anything.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { AdSlide } from "@/components/blastoff/AdSlide";
import { AD_KINDS } from "@/components/blastoff/plan";
import { BoltZoom, CampusBanner } from "@/components/brand-cards/BoltZoom";
import { ZOOM_VARIANTS } from "@/components/brand-cards/bolt-zoom";

export const Route = createFileRoute("/branding")({
  component: () => <AdminGate><Branding /></AdminGate>,
  head: () => ({ meta: [{ title: "Branding — Survive" }, { name: "robots", content: "noindex" }] }),
});

const W = 234;
const H = Math.round(W * 16 / 9);
const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const GOLD = "#FCA311";

function Tile({ title, blurb, children }: { title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(244,239,230,0.16)", width: W, height: H }}>{children}</div>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: CREAM }}>{title}</div>
      {blurb && <div style={{ fontSize: 11, color: MUTED, maxWidth: W }}>{blurb}</div>}
    </div>
  );
}

function Branding() {
  const [psych, setPsych] = useState(0.1);
  const [live, setLive] = useState(true);
  return (
    <div style={{ minHeight: "100vh", background: "#070B14", color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "28px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Branding</h1>
        <span style={{ fontSize: 12.5, color: MUTED }}>the slides as they ship, the bolt detour in every animation, and the experiments we set aside</span>
        <label style={{ marginLeft: "auto", fontSize: 11.5, color: MUTED, display: "flex", alignItems: "center", gap: 8 }}>
          psych <input type="range" min={0} max={1} step={0.05} value={psych} onChange={(e) => setPsych(Number(e.target.value))} />
          <span style={{ color: CREAM }}>{Math.round(psych * 100)}%</span>
        </label>
        <button onClick={() => setLive((v) => !v)} style={{ fontSize: 11.5, fontWeight: 800, color: live ? GOLD : MUTED, background: "none", border: `1px solid ${live ? GOLD : "rgba(244,239,230,0.2)"}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>{live ? "motion on" : "motion off"}</button>
      </div>

      <Section title="The slides that ship" blurb="One component, one wordmark position — slide one cuts to slide two without the wordmark moving. The summary glow is the powder one; the open and intro carry the brand sweep.">
        <Tile title="1 · Cold open" blurb="Black. The glow wordmark with the live bolt, the line, the Power Four ticker."><BoltZoom w={W} h={H} mode="open" live={live} /></Tile>
        <Tile title="2 · Intro" blurb="Same wordmark, same place; the set and the tutor."><BoltZoom w={W} h={H} mode="intro" topic="Internal vs. external users" live={live} /></Tile>
        <Tile title="3 · Found on your exam" blurb="Survive / Accounting in the powder glow — the card sits under it on the real slide."><BoltZoom w={W} h={H} mode="summary" live={live} /></Tile>
        <Tile title="Campus banner" blurb="The slow ticker, on any slide (the 🏫 chip on Review)."><div style={{ position: "relative", width: W, height: H, background: "#000" }}><CampusBanner w={W} h={H} live={live} /></div></Tile>
      </Section>

      <Section title="The bolt detour" blurb="Black + the animation, nothing else. Insert it on Review like a cheat code; pick the animation on the slide. Lee's OBS camera bed and the ad bed.">
        {ZOOM_VARIANTS.map((v) => (
          <Tile key={v.id} title={v.label} blurb={v.blurb}><BoltZoom w={W} h={H} mode="bolt" variant={v.id} psych={psych} live={live} /></Tile>
        ))}
      </Section>

      <Section title="The ads" blurb="Three ad slides, inserted like any detour. Copy lives in AdSlide.tsx.">
        {AD_KINDS.map((k) => <Tile key={k} title={`Ad · ${k}`}><AdSlide ad={k} w={W} h={H} live={live} /></Tile>)}
      </Section>

      <Section title="Set aside — the animated backdrop under the wordmark" blurb="The second pass (2026-09-03): the white wordmark firm over each animation. Lee: 'It just didn't work' — kept here to come back to.">
        {ZOOM_VARIANTS.map((v) => (
          <Tile key={v.id} title={`Gallery · ${v.label}`}><BoltZoom w={W} h={H} mode="gallery" variant={v.id} psych={psych} live={live} /></Tile>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, blurb, children }: { title: string; blurb: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD }}>{title}</div>
      <div style={{ fontSize: 12.5, color: MUTED, margin: "4px 0 14px", maxWidth: 760 }}>{blurb}</div>
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>{children}</div>
    </section>
  );
}
