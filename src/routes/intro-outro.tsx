// INTRO / OUTRO CARDS — a review surface for the branded video cards (OutroCard, IntroCard,
// CornerBolt). Renders all three at a preview scale side-by-side, with editable chapter/title
// and a Play/Replay that re-mounts them so the entrance animations run again. Capture each
// full-size (scale 1) in OBS. No browser storage.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type CSSProperties } from "react";

import { OutroCard } from "@/components/brand-cards/OutroCard";
import { IntroCard } from "@/components/brand-cards/IntroCard";
import { AnimatedIntro } from "@/components/brand-cards/AnimatedIntro";
import { CornerBolt } from "@/components/brand-cards/CornerBolt";
import { BRAND_NAVY, BRAND_CREAM, BoltContext, DEFAULT_BOLT_SPEC, type BoltSpec } from "@/components/brand-cards/bolt-boil";
import { boltSpecFromLogoState } from "@/components/brand-cards/bolt-from-preset";

export const Route = createFileRoute("/intro-outro")({
  head: () => ({ meta: [{ title: "⚡ Intro / Outro Cards — Survive Accounting" }, { name: "robots", content: "noindex" }] }),
  component: IntroOutroPreview,
});

const PREVIEW_SCALE = 0.44; // 1920x1080 -> ~845x475 for review
const LS_PRESETS = "sa-logo-lab-presets-v1"; // Logo Lab presets: [{ name, state }]
const DEFAULT_OPT = "— built-in default —";

function IntroOutroPreview() {
  const [playKey, setPlayKey] = useState(0);
  const [title, setTitle] = useState("Trial Balance");
  const [transparent, setTransparent] = useState(false);
  // ANIMATED INTRO controls — sound + the two timing anchors + the editable slogan/tagline.
  const [sound, setSound] = useState(true);
  const [beatMs, setBeatMs] = useState(1820); // beat drop in intro-music.mp3 (warp reference)
  const [sloganMs, setSloganMs] = useState(640); // gap after the drop before the slogan
  const [slogan, setSlogan] = useState("Cram videos by Lee Ingram");
  const [tagline, setTagline] = useState("Only what’s on your exam.");
  // Bolt comes from a saved Logo Lab preset (default: "FINAL"), read from THIS browser's
  // localStorage at runtime — presets are per-browser, so they can't be baked at build time.
  const [presetNames, setPresetNames] = useState<string[]>([]);
  // Default to the BAKED bolt (Lee's FINAL, canonical in brand.tsx / bolt-boil.tsx) so the
  // cards never depend on browser storage. The picker still lets you preview a live Logo Lab
  // preset from this browser if you want to iterate.
  const [presetName, setPresetName] = useState<string>(DEFAULT_OPT);
  const [spec, setSpec] = useState<BoltSpec>(DEFAULT_BOLT_SPEC);
  const [note, setNote] = useState<string>("");

  useEffect(() => {
    let arr: { name: string; state: unknown }[] = [];
    try { arr = JSON.parse(localStorage.getItem(LS_PRESETS) ?? "[]"); } catch { arr = []; }
    setPresetNames(Array.isArray(arr) ? arr.map((p) => p.name) : []);
    if (presetName === DEFAULT_OPT) { setSpec(DEFAULT_BOLT_SPEC); setNote(""); return; }
    if (!Array.isArray(arr) || !arr.length) {
      setSpec(DEFAULT_BOLT_SPEC);
      setNote("No Logo Lab presets found in this browser — showing the built-in default bolt. Open /logo-lab, perfect your bolt, and Save a preset named “FINAL”.");
      return;
    }
    const want = arr.find((p) => p.name === presetName) ?? arr.find((p) => p.name === "FINAL") ?? arr[arr.length - 1];
    try {
      setSpec(boltSpecFromLogoState(want.state as never));
      setNote(want.name === presetName ? "" : `Preset “${presetName}” not found — showing “${want.name}”.`);
    } catch {
      setSpec(DEFAULT_BOLT_SPEC);
      setNote(`Could not rebuild preset “${want.name}” — showing the built-in default bolt.`);
    }
  }, [presetName]);

  const inp: CSSProperties = { background: "#0e131b", color: "#e7ecf3", border: "1px solid #2a3342", borderRadius: 6, padding: "6px 9px", fontSize: 13 };
  const cap: CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#8b96a6", marginBottom: 8 };
  const presetOpts = [DEFAULT_OPT, ...presetNames.filter((n) => n !== DEFAULT_OPT)];
  if (!presetOpts.includes(presetName)) presetOpts.unshift(presetName); // keep "FINAL" selectable even before it exists

  return (
    <div style={{ minHeight: "100vh", background: "#0b0e14", color: BRAND_CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: 28 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Intro / Outro cards</h1>
        <button onClick={() => setPlayKey((k) => k + 1)} style={{ ...inp, cursor: "pointer", background: "#FCA31122", borderColor: "#FCA311", color: "#FCA311", fontWeight: 800 }}>&#9654; Play / Replay</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} /> transparent (keying)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Title <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inp, width: 220 }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Bolt preset
          <select value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            {presetOpts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {note && <p style={{ fontSize: 12.5, color: "#F0B24A", margin: "8px 0 0", maxWidth: 900, lineHeight: 1.5 }}>{note}</p>}
      <p style={{ fontSize: 12.5, color: "#8b96a6", margin: "0 0 24px", maxWidth: 900, lineHeight: 1.5 }}>
        Previewed at {Math.round(PREVIEW_SCALE * 100)}% &mdash; each is exactly 1920&times;1080 at full size. The built-in bolt is your FINAL logo, baked into the code (canonical everywhere, incl. the film watermark). The bolt boils continuously (~8fps); Play/Replay re-runs the entrance animations. Screen-capture each full-size card in OBS. The checkerboard shows through where a card is transparent.
      </p>
      <BoltContext.Provider value={spec}>
      {/* FEATURED — the music-synced ANIMATED INTRO. Big boiling bolt loops through the
          music build, flies into the wordmark on the beat drop (white flash), then the
          slogan lands just before the VO. Play/Replay restarts it in lock-step with the
          audio. Dial the two timings against the music, then bake the values you like. */}
      <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: "1px solid #1c2330" }}>
        <div style={{ ...cap, marginBottom: 10 }}>Animated intro — music-synced (capture at full size)</div>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, marginBottom: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> play intro music
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Beat drop
            <input type="number" step={20} value={beatMs} onChange={(e) => setBeatMs(Math.max(0, +e.target.value || 0))} style={{ ...inp, width: 90 }} /> ms
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Slogan after
            <input type="number" step={20} value={sloganMs} onChange={(e) => setSloganMs(Math.max(0, +e.target.value || 0))} style={{ ...inp, width: 80 }} /> ms
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Slogan
            <input value={slogan} onChange={(e) => setSlogan(e.target.value)} style={{ ...inp, width: 240 }} />
          </label>
        </div>
        <div style={{ display: "inline-block", borderRadius: 12, overflow: "hidden", background: transparent ? "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" : BRAND_NAVY }}>
          <AnimatedIntro slogan={slogan} beatMs={beatMs} sloganMs={sloganMs} audioSrc="/audio/intro-music.mp3" soundOn={sound} scale={0.5} transparent={transparent} playKey={playKey} />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div>
          <div style={cap}>Outro (hold ~2.5s)</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 8 }}>Tagline
            <input value={tagline} onChange={(e) => setTagline(e.target.value)} style={{ ...inp, width: 240 }} />
          </label>
          <div style={{ borderRadius: 10, overflow: "hidden", background: transparent ? "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" : BRAND_NAVY }}>
            <OutroCard tagline={tagline} scale={PREVIEW_SCALE} transparent={transparent} playKey={playKey} />
          </div>
        </div>
        <div>
          <div style={cap}>Intro (~1.2s)</div>
          <div style={{ borderRadius: 10, overflow: "hidden", background: transparent ? "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" : BRAND_NAVY }}>
            <IntroCard title={title} scale={PREVIEW_SCALE} transparent={transparent} playKey={playKey} />
          </div>
        </div>
        <div>
          <div style={cap}>Corner bolt (short-form watermark)</div>
          <div style={{ borderRadius: 10, overflow: "hidden", background: "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" }}>
            <CornerBolt corner="tr" scale={PREVIEW_SCALE} transparent />
          </div>
        </div>
      </div>
      </BoltContext.Provider>
    </div>
  );
}
