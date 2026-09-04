// /survive-bolt — three original bolts for Lee to pick from (and tune).
//
// Lee (2026-09-05): the current mark reads as "Survive's version of the Dead
// bolt" — the elongated multi-zigzag, red/blue, white keyline, the same
// rhythm. "Reproduce 3 new versions of our bolt that could be the Survive
// Bolt … the bolts updated sitewide for whichever one we pick … the school
// colours ideas keep working … the cursor even needs to change … set up a
// route with your three options and I'll go comment from there … I definitely
// don't want to lose the hand-drawn animation style, the boiling."
//
// Each candidate: the boiling bolt big, in the wordmark, in three school
// colourways, as the cursor; sliders to tune it; a notes box (localStorage)
// and a "copy" of the export a sitewide swap needs. The old mark sits at the
// top for comparison. Private (AdminGate, noindex); nothing here writes to the
// database — Lee's notes live in this browser until he pastes them.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BoltBoil, BoltContext, DEFAULT_BOLT_SPEC, SurviveWordmark } from "@/components/brand-cards/bolt-boil";
import { SURVIVE_BOLTS, forgeSurviveBolt, surviveBoltExport, surviveBoltSpec, type SurviveBoltFamily, type SurviveBoltParams } from "@/lib/survive-bolt";

export const Route = createFileRoute("/survive-bolt")({
  component: () => <AdminGate><SurviveBoltLab /></AdminGate>,
  head: () => ({ meta: [{ title: "The Survive bolt — three options" }, { name: "robots", content: "noindex" }] }),
});

const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const GOLD = "#FCA311";
const EDGE = "rgba(244,239,230,0.16)";
const PANEL = "rgba(16,24,44,0.92)";
const LS_PARAMS = "sa-survive-bolt-params";
const LS_NOTES = "sa-survive-bolt-notes";

/** Three colourways that have to work: the brand, and two schools. */
const WAYS = [
  { name: "Survive", red: "#C62828", blue: "#1565C0" },
  { name: "Ole Miss", red: "#CE1126", blue: "#14213D" },
  { name: "LSU", red: "#461D7C", blue: "#FDD023" },
  { name: "Michigan", red: "#00274C", blue: "#FFCB05" },
];

const SLIDERS: { key: keyof SurviveBoltParams; label: string; min: number; max: number; step: number }[] = [
  { key: "lean", label: "lean", min: 0, max: 0.5, step: 0.01 },
  { key: "width", label: "width", min: 10, max: 26, step: 0.5 },
  { key: "elbow", label: "elbow", min: 0.25, max: 0.65, step: 0.01 },
  { key: "jut", label: "jut", min: 8, max: 40, step: 0.5 },
  { key: "notch", label: "notch", min: 0, max: 16, step: 0.5 },
  { key: "seamS", label: "seam S", min: 0, max: 12, step: 0.5 },
  { key: "handDrawn", label: "hand-drawn", min: 0, max: 2.5, step: 0.05 },
  { key: "seed", label: "seed", min: 1, max: 60, step: 1 },
];

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback; } catch { return fallback; }
}

function SurviveBoltLab() {
  const defaults = useMemo(() => Object.fromEntries(SURVIVE_BOLTS.map((b) => [b.id, b.params])) as Record<SurviveBoltFamily, SurviveBoltParams>, []);
  const [params, setParams] = useState<Record<SurviveBoltFamily, SurviveBoltParams>>(defaults);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [live, setLive] = useState(true);
  useEffect(() => { setParams(readJson(LS_PARAMS, defaults)); setNotes(readJson(LS_NOTES, {})); }, [defaults]);
  const saveParams = (next: Record<SurviveBoltFamily, SurviveBoltParams>) => { setParams(next); try { localStorage.setItem(LS_PARAMS, JSON.stringify(next)); } catch { /* ignore */ } };
  const saveNotes = (next: Record<string, string>) => { setNotes(next); try { localStorage.setItem(LS_NOTES, JSON.stringify(next)); } catch { /* ignore */ } };

  return (
    <div style={{ minHeight: "100vh", background: "#070B14", color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "28px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>The Survive bolt</h1>
        <span style={{ fontSize: 12.5, color: MUTED, maxWidth: 760 }}>three original silhouettes — one elbow each, taller, asymmetric, their own top and bottom — with the boil, the two halves, the keyline and the "i" untouched. Tune, write a note, and the export is one copy away.</span>
        <button onClick={() => setLive((v) => !v)} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: live ? GOLD : MUTED, background: "none", border: `1px solid ${live ? GOLD : EDGE}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>{live ? "boil on" : "boil off"}</button>
      </div>

      {/* the mark as it is today, for the eye */}
      <section style={{ marginTop: 22, display: "flex", gap: 22, alignItems: "center", padding: "14px 18px", background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14 }}>
        <BoltContext.Provider value={DEFAULT_BOLT_SPEC}>
          <BoltBoil height={110} boilFrame={live ? undefined : 0} />
          <SurviveWordmark size={44} boilFrame={live ? undefined : 0} />
        </BoltContext.Provider>
        <div style={{ fontSize: 12.5, color: MUTED, maxWidth: 520 }}>Today's mark — the 13-point zigzag with the same tooth on both flanks. Kept here so the three below are judged against it, not against memory.</div>
      </section>

      {SURVIVE_BOLTS.map((b, i) => {
        const p = params[b.id];
        const spec = surviveBoltSpec(p);
        const geom = forgeSurviveBolt(p);
        const set = (patch: Partial<SurviveBoltParams>) => saveParams({ ...params, [b.id]: { ...p, ...patch } });
        const exportText = JSON.stringify({ params: p, ...surviveBoltExport(p) }, null, 1);
        return (
          <section key={b.id} style={{ marginTop: 26, padding: "18px 20px", background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD }}>Option {i + 1}</span>
              <span style={{ fontSize: 20, fontWeight: 900 }}>{b.name}</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>{b.blurb}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>{geom.outerPts.length} points · ratio {geom.ratio.toFixed(2)}</span>
            </div>

            <BoltContext.Provider value={spec}>
              <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap", marginTop: 16 }}>
                {/* the bolt, big, on black — the way it lands on a slide */}
                <div style={{ width: 300, height: 380, background: "#000", borderRadius: 18, border: `1px solid ${EDGE}`, display: "grid", placeItems: "center" }}>
                  <BoltBoil height={320} boilFrame={live ? undefined : 0} />
                </div>
                {/* the wordmark, and the colourways */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: "1 1 420px" }}>
                  <div style={{ background: "#000", borderRadius: 14, padding: "22px 26px", display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap" }}>
                    <SurviveWordmark size={64} cream="#FFFFFF" boilFrame={live ? undefined : 0} />
                    <SurviveWordmark size={26} cream="#FFFFFF" boilFrame={live ? undefined : 0} />
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                    {WAYS.map((way) => (
                      <div key={way.name} style={{ background: "#111A32", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 120 }}>
                        <BoltBoil height={78} red={way.red} blue={way.blue} boilFrame={live ? undefined : 0} />
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED }}>{way.name}</span>
                      </div>
                    ))}
                    {/* the cursor: the bolt small, tipped like an arrow, on the paper it points at */}
                    <div style={{ background: "#F4EFE6", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 120 }}>
                      <div style={{ transform: "scaleX(-1) rotate(-28deg)", transformOrigin: "50% 50%" }}><BoltBoil height={42} boilFrame={0} /></div>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#14213D" }}>cursor</span>
                    </div>
                  </div>
                </div>
                {/* the knobs */}
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px 10px", alignItems: "center", fontSize: 11.5, color: MUTED, minWidth: 260 }}>
                  {SLIDERS.map((s) => (
                    <div key={s.key} style={{ display: "contents" }}>
                      <span>{s.label}</span>
                      <input type="range" min={s.min} max={s.max} step={s.step} value={p[s.key] as number} onChange={(e) => set({ [s.key]: Number(e.target.value) } as Partial<SurviveBoltParams>)} />
                      <span style={{ color: CREAM, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{p[s.key] as number}</span>
                    </div>
                  ))}
                  <span />
                  <button onClick={() => set(b.params)} style={{ justifySelf: "start", fontSize: 11, fontWeight: 800, color: MUTED, background: "none", border: `1px solid ${EDGE}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>↺ my defaults</button>
                  <span />
                </div>
              </div>
            </BoltContext.Provider>

            <div style={{ display: "flex", gap: 14, marginTop: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
              <label style={{ flex: "1 1 360px", fontSize: 11, color: MUTED }}>Your notes on {b.name}
                <textarea value={notes[b.id] ?? ""} onChange={(e) => saveNotes({ ...notes, [b.id]: e.target.value })} placeholder="what works, what doesn't, what to change…"
                  style={{ display: "block", width: "100%", minHeight: 72, marginTop: 4, background: "rgba(0,0,0,0.3)", color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 10, padding: "8px 10px", fontFamily: "inherit", fontSize: 13 }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button onClick={() => { void navigator.clipboard?.writeText(exportText); }} title="The params and the paths a sitewide swap pastes into brand.tsx and bolt-boil.tsx"
                  style={{ fontSize: 11.5, fontWeight: 800, color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}>⧉ copy the export</button>
                <button onClick={() => { void navigator.clipboard?.writeText(`${b.name}: ${notes[b.id] ?? ""}`); }}
                  style={{ fontSize: 11.5, fontWeight: 800, color: MUTED, background: "none", border: `1px solid ${EDGE}`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}>⧉ copy my note</button>
              </div>
            </div>
          </section>
        );
      })}
      <p style={{ marginTop: 22, fontSize: 12, color: MUTED, maxWidth: 760 }}>When one is the pick: its export replaces BOLT_OUTER / BOLT_RIGHT / BOLT_VIEWBOX in canvas/brand.tsx and FINAL_OUTER / FINAL_SEAM in brand-cards/bolt-boil.tsx — the wordmark, every slide, the homepage campus bolt, the flyer, the OG image and the cursor all read from those two places. Then a trademark clearance on the new mark.</p>
    </div>
  );
}
