// THE BOLT LAB — /lab/bolt
//
// An internal tuning bench for the animated campus bolt, and nothing else. It imports the SAME
// component the hero will ship (@/components/site/bolt) and only feeds it different props, so
// whatever you settle on here is literally what production renders — there is no lab-only drawing
// code to diverge from.
//
// The sliders write a `tuning` object. When a value looks right, copy it into the matching constant
// in src/components/site/bolt/bolt-config.ts — the panel prints a ready-made diff for exactly that.
//
// Not production UI. Plain inputs, no design system, noindex.
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { BRAND_DISPLAY, BRAND_SANS } from "@/components/canvas/brand";
import {
  ANIMATED_CAMPUS_BOLT_CSS,
  AnimatedCampusBolt,
  BOLT_ASPECT,
  CURATED_CAMPUS_ORDER,
  DEFAULT_BOLT_TUNING,
  allBoltCampuses,
  curatedBoltCampuses,
  getBoltPalette,
  type BoltCampus,
  type BoltTuning,
} from "@/components/site/bolt";

export const Route = createFileRoute("/lab/bolt")({
  head: () => ({
    meta: [{ title: "⚡ Bolt Lab — Survive Accounting" }, { name: "robots", content: "noindex" }],
  }),
  component: BoltLabPage,
});

const NAVY = "#0B1220";
const PANEL = "#131C2E";
const CREAM = "#F5EFE6";

type RotationMode = "curated" | "table" | "pinned";

function BoltLabPage() {
  const [tuning, setTuning] = useState<BoltTuning>({ ...DEFAULT_BOLT_TUNING });
  const [autoplay, setAutoplay] = useState(true);
  const [showLabel, setShowLabel] = useState(true);
  const [mode, setMode] = useState<RotationMode>("curated");
  const [pinnedId, setPinnedId] = useState("ole-miss");
  const [dominant, setDominant] = useState<BoltCampus | null>(null);

  const table = useMemo(() => allBoltCampuses(), []);
  const curated = useMemo(() => curatedBoltCampuses(), []);
  const pinned = useMemo(() => table.find((c) => c.id === pinnedId) ?? table[0], [table, pinnedId]);

  const campuses = mode === "pinned" ? [pinned] : mode === "table" ? table : curated;

  const set =
    <K extends keyof BoltTuning>(k: K) =>
    (v: BoltTuning[K]) =>
      setTuning((t) => ({ ...t, [k]: v }));

  // What the bolt is showing right now — the component tells us via onCampusChange.
  const shown = dominant ?? campuses[0];
  const shownPalette = shown
    ? getBoltPalette(shown, {
        useLightFallback: tuning.useLightFallback,
        useDarkFallback: tuning.useDarkFallback,
      })
    : null;

  const bolt = (opts: { width: number; label?: boolean }) => (
    <div style={{ width: opts.width }}>
      <AnimatedCampusBolt
        campuses={campuses}
        autoplay={autoplay}
        showLabel={opts.label ?? showLabel}
        tuning={tuning}
        onCampusChange={setDominant}
        ariaLabel="Bolt lab preview"
      />
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: NAVY,
        color: CREAM,
        fontFamily: BRAND_SANS,
        padding: "24px 20px 80px",
      }}
    >
      <style>{ANIMATED_CAMPUS_BOLT_CSS}</style>
      <style>{LAB_CSS}</style>

      <header style={{ maxWidth: 1400, margin: "0 auto 20px" }}>
        <h1
          style={{
            fontFamily: BRAND_DISPLAY,
            fontWeight: 900,
            fontSize: 26,
            letterSpacing: "-0.01em",
          }}
        >
          Bolt Lab{" "}
          <span style={{ opacity: 0.4, fontSize: 15, fontWeight: 700 }}>
            /lab/bolt · tuning only
          </span>
        </h1>
        <p style={{ opacity: 0.6, fontSize: 13.5, marginTop: 6, maxWidth: "70ch" }}>
          Same component the hero ships. Move the sliders, then copy the values into{" "}
          <code className="lab-code">src/components/site/bolt/bolt-config.ts</code>. The campus
          order lives in the same file, as <code className="lab-code">CURATED_CAMPUS_ORDER</code>.
        </p>
      </header>

      <div className="lab-shell">
        {/* ── CONTROLS ────────────────────────────────────────────────────────────────────── */}
        <div className="lab-panel lab-controls">
          <Section title="Rotation">
            <Row label="Mode">
              <select
                className="lab-input"
                value={mode}
                onChange={(e) => setMode(e.target.value as RotationMode)}
              >
                <option value="curated">Curated order ({curated.length})</option>
                <option value="table">Table order — alphabetical ({table.length})</option>
                <option value="pinned">Pinned campus</option>
              </select>
            </Row>
            <Row label="Campus">
              <select
                className="lab-input"
                value={pinnedId}
                onChange={(e) => {
                  setPinnedId(e.target.value);
                  setMode("pinned");
                }}
              >
                {table.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Row>
            <Toggle label="Autoplay" on={autoplay} set={setAutoplay} />
            <Toggle label="Show label plate" on={showLabel} set={setShowLabel} />
          </Section>

          <Section title="Motion">
            <Slider
              label="Campus duration"
              unit="ms"
              min={1200}
              max={8000}
              step={100}
              value={tuning.campusDurationMs}
              onChange={set("campusDurationMs")}
              hint="CAMPUS_DURATION_MS — also the flow speed: one panel per campus."
            />
            <Slider
              label="Panel span"
              unit="× bolt height"
              min={1}
              max={4}
              step={0.1}
              value={tuning.panelSpan}
              onChange={set("panelSpan")}
              hint={`PANEL_SPAN — hand-over takes ${Math.round(100 / tuning.panelSpan)}% of each cycle; the rest is one campus alone.`}
            />
            <Slider
              label="Ribbon count"
              unit="per panel"
              min={1}
              max={12}
              step={1}
              value={tuning.ribbonCount}
              onChange={set("ribbonCount")}
              hint={`RIBBON_COUNT — each crest is ~${(tuning.panelSpan / tuning.ribbonCount).toFixed(2)} bolt-heights. Below 0.15 it starts to stripe.`}
            />
            <Slider
              label="Ribbon angle"
              unit="°"
              min={-20}
              max={20}
              step={1}
              value={tuning.ribbonAngle}
              onChange={set("ribbonAngle")}
              hint="RIBBON_ANGLE — lean of the flow and of the campus hand-over edge."
            />
            <Slider
              label="Ribbon light"
              unit=""
              min={0}
              max={0.45}
              step={0.01}
              value={tuning.ribbonToneLight}
              onChange={set("ribbonToneLight")}
              hint="RIBBON_TONE_LIGHT"
            />
            <Slider
              label="Ribbon deep"
              unit=""
              min={0}
              max={0.45}
              step={0.01}
              value={tuning.ribbonToneDeep}
              onChange={set("ribbonToneDeep")}
              hint="RIBBON_TONE_DEEP"
            />
            <Slider
              label="Label switch"
              unit="of hand-over"
              min={0}
              max={1}
              step={0.05}
              value={tuning.labelSwitchProgress}
              onChange={set("labelSwitchProgress")}
              hint="LABEL_SWITCH_PROGRESS"
            />
          </Section>

          <Section title="Render">
            <Slider
              label="Outline width"
              unit="units"
              min={0}
              max={9}
              step={0.1}
              value={tuning.outlineWidth}
              onChange={set("outlineWidth")}
              hint={`OUTLINE_WIDTH — visible white ≈ ${(tuning.outlineWidth / 2).toFixed(2)} units. The old hero showed 3.5.`}
            />
            <Slider
              label="Seam overlap"
              unit="units"
              min={0}
              max={3}
              step={0.1}
              value={tuning.seamOverlap}
              onChange={set("seamOverlap")}
              hint="SEAM_OVERLAP — dilates the right region across the divider."
            />
            <Slider
              label="Glow blur"
              unit="units"
              min={0}
              max={30}
              step={0.5}
              value={tuning.glowBlur}
              onChange={set("glowBlur")}
              hint="GLOW_BLUR"
            />
            <Slider
              label="Glow opacity"
              unit=""
              min={0}
              max={1}
              step={0.02}
              value={tuning.glowOpacity}
              onChange={set("glowOpacity")}
              hint="GLOW_OPACITY"
            />
          </Section>

          <Section title="Colour rule">
            <Toggle
              label="Use accent when secondary is too light"
              on={tuning.useLightFallback}
              set={(v) => set("useLightFallback")(v)}
            />
            <Toggle
              label="Also swap near-black secondaries (off by default)"
              on={tuning.useDarkFallback}
              set={(v) => set("useDarkFallback")(v)}
            />
          </Section>

          <Section title="Copy into bolt-config.ts">
            <pre className="lab-pre">{configDiff(tuning)}</pre>
          </Section>
        </div>

        {/* ── PREVIEWS + DIAGNOSTICS ──────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gap: 20 }}>
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            }}
          >
            <Preview title="Large — judge the outline and the divider here">
              <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                {bolt({ width: 300 })}
              </div>
            </Preview>

            <Preview title="Hero — desktop, as the homepage lays it out">
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.05fr 0.95fr",
                  gap: 20,
                  alignItems: "center",
                }}
              >
                <div>
                  <p
                    style={{
                      fontFamily: BRAND_DISPLAY,
                      fontWeight: 900,
                      fontSize: 21,
                      lineHeight: 1.12,
                      letterSpacing: "-0.015em",
                    }}
                  >
                    Intro accounting is where GPAs quietly slip.
                  </p>
                  <p
                    style={{
                      fontFamily: BRAND_DISPLAY,
                      fontWeight: 800,
                      fontSize: 14.5,
                      marginTop: 12,
                    }}
                  >
                    Practice what gets tested. Score higher.
                  </p>
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 14,
                      borderRadius: 10,
                      background: "var(--accent, #FCA311)",
                      color: NAVY,
                      fontWeight: 900,
                      fontSize: 12.5,
                      padding: "9px 16px",
                    }}
                  >
                    Cram Exam 1 Free ⚡
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {bolt({ width: 190 })}
                </div>
              </div>
            </Preview>

            <Preview title="Mobile — 375 px viewport">
              <div
                style={{
                  width: 335,
                  margin: "0 auto",
                  border: "1px solid rgba(245,239,230,0.14)",
                  borderRadius: 18,
                  padding: "16px 14px",
                  background: NAVY,
                }}
              >
                <p
                  style={{
                    fontFamily: BRAND_DISPLAY,
                    fontWeight: 900,
                    fontSize: 19,
                    lineHeight: 1.1,
                    textAlign: "center",
                  }}
                >
                  Intro accounting is where GPAs quietly slip.
                </p>
                <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                  {bolt({ width: 132 })}
                </div>
              </div>
            </Preview>

            <Preview title="Tiny — the mark at navbar size (aspect check)">
              <div
                style={{
                  display: "flex",
                  gap: 22,
                  alignItems: "flex-end",
                  justifyContent: "center",
                  padding: "18px 0",
                }}
              >
                {[34, 56, 88].map((h) => (
                  <div key={h} style={{ width: Math.round(h * BOLT_ASPECT) }}>
                    <AnimatedCampusBolt
                      campuses={campuses}
                      autoplay={autoplay}
                      showLabel={false}
                      tuning={tuning}
                      ariaLabel={`Bolt at ${h}px`}
                    />
                  </div>
                ))}
              </div>
            </Preview>
          </div>

          {/* DIAGNOSTICS — what the bolt is wearing at this instant. */}
          <Preview title="Now showing">
            {shown && shownPalette ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 18,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <b style={{ fontSize: 15 }}>{shown.name}</b>
                <span style={{ opacity: 0.6 }}>{shown.code ?? "no course code"}</span>
                <Swatch label="primary (left)" hex={shownPalette.leftColor} />
                <Swatch label="secondary (stored)" hex={shownPalette.originalRight} />
                <Swatch label="right side used" hex={shownPalette.rightColor} />
                <span
                  style={{
                    padding: "3px 9px",
                    borderRadius: 999,
                    fontWeight: 800,
                    fontSize: 11.5,
                    background: shownPalette.usedFallback
                      ? "rgba(252,163,17,0.18)"
                      : "rgba(245,239,230,0.08)",
                    color: shownPalette.usedFallback ? "#FCA311" : CREAM,
                  }}
                >
                  {shownPalette.usedFallback
                    ? `fallback: ${shownPalette.reason} → ${shownPalette.accentSource} accent`
                    : "secondary used as-is"}
                </span>
              </div>
            ) : null}
          </Preview>

          {/* THE SEQUENCE — every campus in play order, with its resolved palette. */}
          <Preview
            title={`Campus sequence — ${mode === "curated" ? "curated" : mode === "table" ? "table order" : "pinned"} (${campuses.length})`}
          >
            <p style={{ fontSize: 12.5, opacity: 0.55, margin: "0 0 10px" }}>
              Edit the order in <code className="lab-code">CURATED_CAMPUS_ORDER</code>{" "}
              (bolt-config.ts). It currently names {CURATED_CAMPUS_ORDER.length} of {table.length}{" "}
              schools; anything unnamed plays after the rest.
            </p>
            <div className="lab-grid">
              {campuses.map((c, i) => {
                const p = getBoltPalette(c, {
                  useLightFallback: tuning.useLightFallback,
                  useDarkFallback: tuning.useDarkFallback,
                });
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPinnedId(c.id);
                      setMode("pinned");
                    }}
                    className="lab-row"
                    style={{
                      outline:
                        shown?.id === c.id
                          ? "1px solid rgba(252,163,17,0.7)"
                          : "1px solid rgba(245,239,230,0.08)",
                    }}
                    title={`${c.id} — click to pin`}
                  >
                    <span
                      style={{
                        opacity: 0.35,
                        width: 22,
                        textAlign: "right",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        borderRadius: 4,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.35)",
                      }}
                    >
                      <i style={{ width: 14, height: 14, background: p.leftColor }} />
                      <i style={{ width: 14, height: 14, background: p.rightColor }} />
                    </span>
                    <span style={{ flex: 1, textAlign: "left", fontWeight: 700 }}>{c.name}</span>
                    <span style={{ opacity: 0.45, fontSize: 11 }}>{c.code ?? "—"}</span>
                    {p.usedFallback ? (
                      <span
                        title={`${p.originalRight} → ${p.rightColor} (${p.reason}, ${p.accentSource})`}
                        style={{ color: "#FCA311", fontSize: 11, fontWeight: 900 }}
                      >
                        ▲
                      </span>
                    ) : (
                      <span style={{ opacity: 0.15, fontSize: 11 }}>·</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Preview>
        </div>
      </div>
    </div>
  );
}

// ── tiny lab widgets ──────────────────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.45,
          marginBottom: 8,
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Preview({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="lab-panel">
      <h2
        style={{
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: 0.45,
          marginBottom: 12,
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "84px 1fr",
        alignItems: "center",
        gap: 8,
        marginBottom: 8,
        fontSize: 12.5,
      }}
    >
      <span style={{ opacity: 0.6 }}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        marginBottom: 7,
        fontSize: 12.5,
        cursor: "pointer",
      }}
    >
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function Slider({
  label,
  unit,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div style={{ marginBottom: 11 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12.5,
          marginBottom: 3,
        }}
      >
        <span style={{ opacity: 0.75 }}>{label}</span>
        <b style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
          {unit ? ` ${unit}` : ""}
        </b>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
      />
      {hint ? <div style={{ fontSize: 10.5, opacity: 0.35, marginTop: 2 }}>{hint}</div> : null}
    </div>
  );
}

function Swatch({ label, hex }: { label: string; hex: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <i
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: hex,
          border: "1px solid rgba(255,255,255,0.35)",
        }}
      />
      <span style={{ opacity: 0.55, fontSize: 11.5 }}>{label}</span>
      <code className="lab-code">{hex}</code>
    </span>
  );
}

/** The panel prints the exact constants to paste back, so tuning ends in the config file rather
 *  than in someone's memory of where they left the slider. */
function configDiff(t: BoltTuning) {
  return [
    `const CAMPUS_DURATION_MS = ${t.campusDurationMs}`,
    `const PANEL_SPAN = ${t.panelSpan}`,
    `const RIBBON_ANGLE = ${t.ribbonAngle}`,
    `const RIBBON_COUNT = ${t.ribbonCount}`,
    `const RIBBON_TONE_LIGHT = ${t.ribbonToneLight}`,
    `const RIBBON_TONE_DEEP = ${t.ribbonToneDeep}`,
    `const LABEL_SWITCH_PROGRESS = ${t.labelSwitchProgress}`,
    `const OUTLINE_WIDTH = ${t.outlineWidth}`,
    `const SEAM_OVERLAP = ${t.seamOverlap}`,
    `const GLOW_BLUR = ${t.glowBlur}`,
    `const GLOW_OPACITY = ${t.glowOpacity}`,
    `const USE_DARK_FALLBACK = ${t.useDarkFallback}`,
  ].join("\n");
}

const LAB_CSS = `
.lab-shell { max-width: 1400px; margin: 0 auto; display: grid; gap: 20px; grid-template-columns: minmax(280px, 340px) 1fr; }
.lab-controls { align-self: start; position: sticky; top: 16px; }
/* The lab is a desktop bench, but it must not scroll sideways on a laptop or a phone. */
@media (max-width: 1000px) {
  .lab-shell { grid-template-columns: 1fr; }
  .lab-controls { position: static; }
}
.lab-panel { background: ${PANEL}; border: 1px solid rgba(245,239,230,0.09); border-radius: 14px; padding: 16px; }
.lab-input { width: 100%; background: #0B1220; color: ${CREAM}; border: 1px solid rgba(245,239,230,0.16); border-radius: 8px; padding: 5px 7px; font-size: 12.5px; }
.lab-code { background: rgba(245,239,230,0.09); border-radius: 4px; padding: 1px 5px; font-size: 11.5px; }
.lab-pre { background: #0B1220; border: 1px solid rgba(245,239,230,0.12); border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.6; overflow-x: auto; margin: 0; }
.lab-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 5px; }
.lab-row { display: flex; align-items: center; gap: 8px; background: rgba(245,239,230,0.03); border: 0; border-radius: 7px; padding: 5px 8px; color: ${CREAM}; font-size: 12px; cursor: pointer; font-family: inherit; }
.lab-row:hover { background: rgba(245,239,230,0.08); }
`;
