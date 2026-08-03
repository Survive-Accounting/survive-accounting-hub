// LOGO LAB — the Survive Accounting brand kit, live. The FINAL system up top
// (the four logo modes + every bolt colourway, on both backgrounds it lives on),
// then the earlier concept explorations kept below for reference. Standalone route
// (/logo-lab), linked from nowhere.
import { createFileRoute } from "@tanstack/react-router";

import { BOLT_PRESETS, BrandLogo, LOGO_MODES, SEC_SCHOOLS, type ColorOption, type LogoMode } from "@/components/canvas/brand";
import { LOGO_CONCEPTS } from "@/lib/logo-concepts";

export const Route = createFileRoute("/logo-lab")({ component: LogoLab });

const PAGE_BG = "#070D1E";
const NAVY = "#0A1128";
const CREAM = "#FBF9F4";

/** A logo mode on both backgrounds (letters flip white/near-black by context). */
function ModeRow({ mode, name, c1, c2 }: { mode: LogoMode; name: string; c1: string; c2: string }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(244,246,250,0.62)" }}>{name}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 8 }}>
        {([["navy", NAVY, "#F4EFE6"], ["cream", CREAM, "#141414"]] as const).map(([k, bg, ink]) => (
          <div key={k} style={{ display: "grid", placeItems: "center", minWidth: 260, minHeight: mode === "bolt" ? 120 : 108, padding: "22px 28px", borderRadius: 14, background: bg, border: `1px solid ${k === "navy" ? "rgba(244,246,250,0.14)" : "rgba(10,17,40,0.16)"}` }}>
            <BrandLogo mode={mode} c1={c1} c2={c2} ink={ink} size={mode === "bolt" ? 84 : 44} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A bolt-alone swatch in one colourway, on navy (white keyline reads there). */
function BoltSwatch({ o }: { o: ColorOption }) {
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 8, padding: "16px 14px", borderRadius: 12, background: NAVY, border: "1px solid rgba(244,246,250,0.12)" }}>
      <div style={{ height: 74 }}><BrandLogo mode="bolt" c1={o.c1} c2={o.c2} size={74} /></div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", color: "rgba(244,246,250,0.7)", textAlign: "center" }}>{o.name}</div>
    </div>
  );
}

function LogoLab() {
  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, color: "#F4EFE6", fontFamily: "'Sora', 'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 24px 120px" }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em" }}>Logo Lab</h1>
        <p style={{ marginTop: 6, fontSize: 14, color: "rgba(244,246,250,0.6)", maxWidth: 760 }}>
          The Survive Accounting brand kit, rendered live from the same components the app uses
          (watermark, CEQ box, logo card). Bolt colours are data — presets, plus every SEC school.
        </p>

        <section style={{ marginTop: 40, paddingTop: 26, borderTop: "1px solid rgba(147,160,180,0.2)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}><span style={{ color: "#FCA311" }}>Final kit</span> — logo modes</h2>
          <p style={{ marginTop: 4, fontSize: 13, color: "rgba(244,246,250,0.6)" }}>The four modes the logo card toggles between. Letters flip white / near-black by background; the bolt keeps its colours.</p>
          {LOGO_MODES.map((m) => <ModeRow key={m.id} mode={m.id} name={m.name} c1={BOLT_PRESETS[0].c1} c2={BOLT_PRESETS[0].c2} />)}
        </section>

        <section style={{ marginTop: 40, paddingTop: 26, borderTop: "1px solid rgba(147,160,180,0.2)" }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}><span style={{ color: "#FCA311" }}>Bolt</span> — colourways</h2>
          <p style={{ marginTop: 4, fontSize: 13, color: "rgba(244,246,250,0.6)" }}>House presets (red/blue is primary; white + black are the single-colour versions), then every SEC school in its two colours.</p>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(244,246,250,0.5)", marginTop: 16 }}>House</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginTop: 8 }}>
            {BOLT_PRESETS.map((o) => <BoltSwatch key={o.id} o={o} />)}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(244,246,250,0.5)", marginTop: 22 }}>SEC schools</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12, marginTop: 8 }}>
            {SEC_SCHOOLS.map((o) => <BoltSwatch key={o.id} o={o} />)}
          </div>
        </section>

        <section style={{ marginTop: 44, paddingTop: 26, borderTop: "1px solid rgba(147,160,180,0.2)", opacity: 0.75 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: "rgba(244,246,250,0.7)" }}>Earlier concept explorations</h2>
          <p style={{ marginTop: 4, fontSize: 12.5, color: "rgba(244,246,250,0.5)" }}>Kept for reference — superseded by the final kit above.</p>
          {LOGO_CONCEPTS.map((c) => (
            <div key={c.id} style={{ marginTop: 18 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(244,246,250,0.6)" }}>Concept {c.id} — {c.name}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
                {c.marks.map((m) => (
                  <div key={m.id} style={{ display: "grid", placeItems: "center", padding: "14px 16px", borderRadius: 10, background: NAVY, border: "1px solid rgba(244,246,250,0.1)" }}>
                    <div style={{ height: 56, width: m.ratio ? Math.round(56 * m.ratio) : 56, color: "#F4EFE6" }} dangerouslySetInnerHTML={{ __html: m.svg }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
