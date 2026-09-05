// /survive-bolt — the mark's candidates, for Lee to pick from (and tune).
//
// Two tabs. BOLT: the bolt from the picture, the red kept, the blue slid
// behind it, one keyline, no white seam — three weights. MOUNTAIN (Lee,
// 2026-09-05: "in between the V's there's a perfect spot to do like a mountain
// … we're trying to get you over the mountain of your course … the two school
// colors, the sun on one side, shade the other … keep the boiling … snow
// capped even"): five mountains built the bolt's way — a lit side, a shaded
// side sharing the ridge, a snow cap, the keyline, the boil.
//
// Each candidate: big, in the wordmark (standing in for the i), in four
// colourways, as the cursor; sliders; a notes box (localStorage) and a "copy"
// of the export a sitewide swap needs. The old mark sits at the top for
// comparison. Private (AdminGate, noindex); nothing here writes to the
// database — Lee's notes live in this browser until he pastes them.
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { AdminGate } from "@/components/AdminGate";
import { BoltBoil, BoltContext, DEFAULT_BOLT_SPEC, SurviveWordmark, type BoltSpec } from "@/components/brand-cards/bolt-boil";
import { SURVIVE_BOLTS, forgeSurviveBolt, surviveBoltExport, surviveBoltSpec, type SurviveBoltParams } from "@/lib/survive-bolt";
import { SURVIVE_MOUNTAINS, forgeMountain, mountainExport, mountainSpec, type MountainParams } from "@/lib/survive-mountain";

export const Route = createFileRoute("/survive-bolt")({
  component: () => <AdminGate><MarkLab /></AdminGate>,
  head: () => ({ meta: [{ title: "The Survive mark — bolt and mountain" }, { name: "robots", content: "noindex" }] }),
});

const CREAM = "#F4EFE6";
const MUTED = "#9AA3B8";
const GOLD = "#FCA311";
const EDGE = "rgba(244,239,230,0.16)";
const PANEL = "rgba(16,24,44,0.92)";

/** Colourways that have to work: the brand, and three schools. */
const WAYS = [
  { name: "Survive", red: "#006BA6", blue: "#00456E" },
  { name: "Ole Miss", red: "#CE1126", blue: "#14213D" },
  { name: "LSU", red: "#461D7C", blue: "#FDD023" },
  { name: "Michigan", red: "#00274C", blue: "#FFCB05" },
];

type Slider<P> = { key: keyof P; label: string; min: number; max: number; step: number };
const BOLT_SLIDERS: Slider<SurviveBoltParams>[] = [
  { key: "width", label: "width", min: 14, max: 36, step: 0.5 },
  { key: "lean", label: "lean", min: 10, max: 40, step: 0.5 },
  { key: "step", label: "jag", min: 6, max: 24, step: 0.5 },
  { key: "taper", label: "tip taper", min: 0.2, max: 0.8, step: 0.01 },
  { key: "tip", label: "tip length", min: 4, max: 24, step: 0.5 },
  { key: "echoX", label: "blue left", min: 0, max: 22, step: 0.5 },
  { key: "echoY", label: "blue down", min: 0, max: 24, step: 0.5 },
  { key: "handDrawn", label: "hand-drawn", min: 0, max: 2.5, step: 0.05 },
  { key: "seed", label: "seed", min: 1, max: 60, step: 1 },
];
const MOUNTAIN_SLIDERS: Slider<MountainParams>[] = [
  { key: "rise", label: "height", min: 0.6, max: 1.7, step: 0.01 },
  { key: "peakX", label: "peak across", min: 0.3, max: 0.7, step: 0.01 },
  { key: "ridges", label: "ridges", min: 0, max: 3, step: 1 },
  { key: "shade", label: "shade lean", min: 0.15, max: 0.85, step: 0.01 },
  { key: "snow", label: "snow", min: 0, max: 0.5, step: 0.01 },
  { key: "minor", label: "second summit", min: 0, max: 0.85, step: 0.01 },
  { key: "handDrawn", label: "hand-drawn", min: 0, max: 2.5, step: 0.05 },
  { key: "seed", label: "seed", min: 1, max: 60, step: 1 },
];

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback; } catch { return fallback; }
}
function writeJson(key: string, v: unknown): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* ignore */ } }

type Tab = "bolt" | "mountain";

function MarkLab() {
  const [tab, setTab] = useState<Tab>("bolt");
  const [live, setLive] = useState(true);
  useEffect(() => { const t = readJson<{ tab?: Tab }>("sa-mark-lab-tab", {}).tab; if (t === "bolt" || t === "mountain") setTab(t); }, []);
  const pick = (t: Tab) => { setTab(t); writeJson("sa-mark-lab-tab", { tab: t }); };
  return (
    <div style={{ minHeight: "100vh", background: "#070B14", color: CREAM, fontFamily: "'Rubik', system-ui, sans-serif", padding: "28px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>The Survive mark</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {(["bolt", "mountain"] as Tab[]).map((t) => (
            <button key={t} onClick={() => pick(t)} style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: tab === t ? "#0B0F1E" : MUTED, background: tab === t ? GOLD : "none", border: `1px solid ${tab === t ? GOLD : EDGE}`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}>{t}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, color: MUTED, maxWidth: 640 }}>
          {tab === "bolt"
            ? "the bolt from the picture: the red kept, the blue slid behind it so it follows every edge, one keyline, no white in the seam — three weights."
            : "the mountain between the v's: the sun on one side, shade on the other sharing the ridge, a snow cap, the keyline, the boil — five of them."}
        </span>
        <button onClick={() => setLive((v) => !v)} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 800, color: live ? GOLD : MUTED, background: "none", border: `1px solid ${live ? GOLD : EDGE}`, borderRadius: 999, padding: "4px 12px", cursor: "pointer" }}>{live ? "boil on" : "boil off"}</button>
      </div>

      {/* the mark as it is today, for the eye */}
      <section style={{ marginTop: 22, display: "flex", gap: 22, alignItems: "center", padding: "14px 18px", background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 14 }}>
        <BoltContext.Provider value={DEFAULT_BOLT_SPEC}>
          <BoltBoil height={110} boilFrame={live ? undefined : 0} />
          <SurviveWordmark size={44} boilFrame={live ? undefined : 0} />
        </BoltContext.Provider>
        <div style={{ fontSize: 12.5, color: MUTED, maxWidth: 520 }}>Today's mark — kept here so the candidates are judged against it, not against memory.</div>
      </section>

      {tab === "bolt" ? <Candidates kind="bolt" live={live} /> : <Candidates kind="mountain" live={live} />}

      <p style={{ marginTop: 22, fontSize: 12, color: MUTED, maxWidth: 760 }}>
        {tab === "bolt"
          ? "When one is the pick: its export goes into canvas/brand.tsx (BOLT_OUTER = the red, BOLT_RIGHT = the blue echo, drawn behind) and brand-cards/bolt-boil.tsx (the default spec, echo mode) — the wordmark, every slide, the homepage campus bolt, the flyer, the OG image and the cursor follow. Then a trademark clearance on the new mark."
          : "When one is the pick: its export (OUTER = the lit side, SHADE = the shaded side, CAP = the snow) becomes the default spec in brand-cards/bolt-boil.tsx and the paths in canvas/brand.tsx — the wordmark's i, every slide, the homepage mark, the flyer, the OG image and the cursor follow. Then a trademark clearance."}
      </p>
    </div>
  );
}

/** One tab's candidates: params, notes, colourways, cursor, export — the bolt and the mountain share this. */
function Candidates({ kind, live }: { kind: "bolt" | "mountain"; live: boolean }) {
  const list = kind === "bolt" ? SURVIVE_BOLTS : SURVIVE_MOUNTAINS;
  const defaults = useMemo(() => Object.fromEntries(list.map((b) => [b.id, b.params])) as Record<string, SurviveBoltParams | MountainParams>, [list]);
  const LS_P = `sa-mark-lab-${kind}-params`, LS_N = `sa-mark-lab-${kind}-notes`;
  const [params, setParams] = useState(defaults);
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => { setParams(readJson(LS_P, defaults)); setNotes(readJson(LS_N, {})); }, [LS_P, LS_N, defaults]);
  const saveParams = (next: typeof params) => { setParams(next); writeJson(LS_P, next); };
  const saveNotes = (next: Record<string, string>) => { setNotes(next); writeJson(LS_N, next); };
  const sliders = (kind === "bolt" ? BOLT_SLIDERS : MOUNTAIN_SLIDERS) as unknown as Slider<Record<string, number>>[];

  return (
    <>
      {list.map((b, i) => {
        const p = params[b.id] ?? b.params;
        const spec: BoltSpec = kind === "bolt" ? surviveBoltSpec(p as SurviveBoltParams) : mountainSpec(p as MountainParams);
        const points = kind === "bolt" ? forgeSurviveBolt(p as SurviveBoltParams).outerPts.length : forgeMountain(p as MountainParams).outerPts.length;
        const exportText = JSON.stringify({ params: p, ...(kind === "bolt" ? surviveBoltExport(p as SurviveBoltParams) : mountainExport(p as MountainParams)) }, null, 1);
        const set = (patch: Record<string, number>) => saveParams({ ...params, [b.id]: { ...p, ...patch } as SurviveBoltParams | MountainParams });
        const pr = p as unknown as Record<string, number>;
        return (
          <section key={b.id} style={{ marginTop: 26, padding: "18px 20px", background: PANEL, border: `1px solid ${EDGE}`, borderRadius: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", textTransform: "uppercase", color: GOLD }}>Option {i + 1}</span>
              <span style={{ fontSize: 20, fontWeight: 900 }}>{b.name}</span>
              <span style={{ fontSize: 12.5, color: MUTED }}>{b.blurb}</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: MUTED }}>{points} points · ratio {spec.ratio.toFixed(2)}</span>
            </div>

            <BoltContext.Provider value={spec}>
              <div style={{ display: "flex", gap: 28, alignItems: "flex-start", flexWrap: "wrap", marginTop: 16 }}>
                <div style={{ width: 300, height: 380, background: "#000", borderRadius: 18, border: `1px solid ${EDGE}`, display: "grid", placeItems: "center" }}>
                  <BoltBoil height={kind === "bolt" ? 320 : 240} boilFrame={live ? undefined : 0} />
                </div>
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
                    <div style={{ background: "#F4EFE6", borderRadius: 12, padding: "12px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: 120 }}>
                      <div style={{ transform: kind === "bolt" ? "scaleX(-1) rotate(-28deg)" : "rotate(-18deg)", transformOrigin: "50% 50%" }}><BoltBoil height={42} boilFrame={0} /></div>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: "#14213D" }}>cursor</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "6px 10px", alignItems: "center", fontSize: 11.5, color: MUTED, minWidth: 260 }}>
                  {sliders.map((s) => (
                    <div key={String(s.key)} style={{ display: "contents" }}>
                      <span>{s.label}</span>
                      <input type="range" min={s.min} max={s.max} step={s.step} value={pr[s.key as string]} onChange={(e) => set({ [s.key as string]: Number(e.target.value) })} />
                      <span style={{ color: CREAM, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>{pr[s.key as string]}</span>
                    </div>
                  ))}
                  <span />
                  <button onClick={() => saveParams({ ...params, [b.id]: b.params })} style={{ justifySelf: "start", fontSize: 11, fontWeight: 800, color: MUTED, background: "none", border: `1px solid ${EDGE}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>↺ my defaults</button>
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
                <button onClick={() => { void navigator.clipboard?.writeText(exportText); }} title="The params and the paths a sitewide swap pastes"
                  style={{ fontSize: 11.5, fontWeight: 800, color: GOLD, background: "none", border: `1px solid ${GOLD}66`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}>⧉ copy the export</button>
                <button onClick={() => { void navigator.clipboard?.writeText(`${b.name}: ${notes[b.id] ?? ""}`); }}
                  style={{ fontSize: 11.5, fontWeight: 800, color: MUTED, background: "none", border: `1px solid ${EDGE}`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}>⧉ copy my note</button>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
