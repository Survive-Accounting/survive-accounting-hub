// INTRO / OUTRO CARDS — a review surface for the branded video cards (OutroCard, IntroCard,
// CornerBolt). Renders all three at a preview scale side-by-side, with editable chapter/title
// and a Play/Replay that re-mounts them so the entrance animations run again. Capture each
// full-size (scale 1) in OBS. No browser storage.
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, type CSSProperties } from "react";

import { OutroCard } from "@/components/brand-cards/OutroCard";
import { IntroCard } from "@/components/brand-cards/IntroCard";
import { CornerBolt } from "@/components/brand-cards/CornerBolt";
import { BRAND_NAVY, BRAND_CREAM, BoltContext, DEFAULT_BOLT_SPEC, type BoltSpec } from "@/components/brand-cards/bolt-boil";
import { boltSpecFromLogoState } from "@/components/brand-cards/bolt-from-preset";

export const Route = createFileRoute("/intro-outro")({ component: IntroOutroPreview });

const PREVIEW_SCALE = 0.44; // 1920x1080 -> ~845x475 for review
const LS_PRESETS = "sa-logo-lab-presets-v1"; // Logo Lab presets: [{ name, state }]
const DEFAULT_OPT = "— built-in default —";

function IntroOutroPreview() {
  const [playKey, setPlayKey] = useState(0);
  const [chapter, setChapter] = useState("8");
  const [title, setTitle] = useState("Trial Balance");
  const [transparent, setTransparent] = useState(false);
  // Bolt comes from a saved Logo Lab preset (default: "FINAL"), read from THIS browser's
  // localStorage at runtime — presets are per-browser, so they can't be baked at build time.
  const [presetNames, setPresetNames] = useState<string[]>([]);
  const [presetName, setPresetName] = useState<string>("FINAL");
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
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Ch <input value={chapter} onChange={(e) => setChapter(e.target.value)} style={{ ...inp, width: 52 }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Title <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inp, width: 220 }} /></label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>Bolt preset
          <select value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
            {presetOpts.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      {note && <p style={{ fontSize: 12.5, color: "#F0B24A", margin: "8px 0 0", maxWidth: 900, lineHeight: 1.5 }}>{note}</p>}
      <p style={{ fontSize: 12.5, color: "#8b96a6", margin: "0 0 24px", maxWidth: 900, lineHeight: 1.5 }}>
        Previewed at {Math.round(PREVIEW_SCALE * 100)}% &mdash; each is exactly 1920&times;1080 at full size. The bolt boils continuously (~8fps); Play/Replay re-runs the entrance animations. Screen-capture each full-size card in OBS. The checkerboard shows through where a card is transparent.
      </p>
      <BoltContext.Provider value={spec}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32, alignItems: "flex-start" }}>
        <div>
          <div style={cap}>Outro (hold ~2.5s)</div>
          <div style={{ borderRadius: 10, overflow: "hidden", background: transparent ? "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" : BRAND_NAVY }}>
            <OutroCard scale={PREVIEW_SCALE} transparent={transparent} playKey={playKey} />
          </div>
        </div>
        <div>
          <div style={cap}>Intro (~1.2s)</div>
          <div style={{ borderRadius: 10, overflow: "hidden", background: transparent ? "conic-gradient(#1b2330 90deg, #10151d 0 180deg, #1b2330 0 270deg, #10151d 0) 0 0 / 24px 24px" : BRAND_NAVY }}>
            <IntroCard chapter={chapter} title={title} scale={PREVIEW_SCALE} transparent={transparent} playKey={playKey} />
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
