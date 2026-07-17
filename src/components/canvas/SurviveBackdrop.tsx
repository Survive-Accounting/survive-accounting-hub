// SURVIVE ACCOUNTING HUB (flow-space) — the canvas as a branded home, mapped out
// as five course plates in fixed spots:
//   • a colossal glowing "SURVIVE ACCOUNTING" header crowns the top;
//   • directly beneath, the LIT "Start Here" plate (a stained-glass window — the
//     backstage glow shows through) marks where that course's scaffold will build;
//   • below it, the four other courses (Intro 1 · Intro 2 · IA1 · IA2) sit as
//     DARKENED, clearly-unlit plates — "not yet developed."
// Fixed flow layout centred on the origin so it's a stable landmark; authoring-only
// (parent gates it to the cinema backstage, !film) + behind the nodes +
// pointer-events-none.
import { ViewportPortal } from "@xyflow/react";

const GOLD_GRADIENT = "linear-gradient(180deg, #FFEFD2 0%, #F2C75A 42%, #E86A2E 78%, #C2352A 100%)";

const FUTURE = [
  { key: "intro1", label: "Intro 1" },
  { key: "intro2", label: "Intro 2" },
  { key: "ia1", label: "IA1" },
  { key: "ia2", label: "IA2" },
];

const FONT = "'Poppins','Inter',system-ui,sans-serif";

export function SurviveBackdrop() {
  // Deterministic flow layout (units) centred on x = 0.
  const headerFont = 460;
  const headerTop = 0;
  const headerH = headerFont * 1.25;

  const startLabelTop = headerTop + headerH + 200;
  const startLabelH = 240;

  // LIT "Start Here" plate — the scaffold home.
  const winW = 7600;
  const winH = 3000;
  const winLeft = -winW / 2;
  const winTop = startLabelTop + startLabelH + 40;

  // DARKENED future-course plates — a row of four spanning the same width.
  const futGap = 300;
  const futW = (winW - futGap * (FUTURE.length - 1)) / FUTURE.length;
  const futH = 1500;
  const futTop = winTop + winH + 520;

  return (
    <ViewportPortal>
      {/* ── SURVIVE ACCOUNTING — the crown header ─────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: -5000, top: headerTop, width: 10000, height: headerH, zIndex: 0 }}>
        <span
          style={{
            fontFamily: FONT, fontWeight: 900, fontSize: headerFont, lineHeight: 1,
            letterSpacing: `${headerFont * 0.01}px`, whiteSpace: "nowrap",
            background: GOLD_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text",
            WebkitTextFillColor: "transparent", color: "transparent",
            filter: "drop-shadow(0 10px 46px rgba(255,84,54,0.55)) drop-shadow(0 2px 10px rgba(0,0,0,0.5))",
          }}
        >
          SURVIVE ACCOUNTING
        </span>
      </div>

      {/* ── START HERE label (the lit centre) ─────────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: -5000, top: startLabelTop, width: 10000, height: startLabelH, zIndex: 0 }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 170, letterSpacing: "40px", textIndent: "40px", color: "rgba(255,236,214,0.94)", textShadow: "0 0 42px rgba(255,90,70,0.6), 0 6px 18px rgba(0,0,0,0.5)" }}>
          START HERE
        </span>
      </div>

      {/* ── LIT stained-glass plate — where the Start Here scaffold builds ─── */}
      <div
        className="pointer-events-none absolute select-none"
        style={{
          left: winLeft, top: winTop, width: winW, height: winH, zIndex: 0, borderRadius: 64,
          border: "6px solid rgba(242,199,90,0.4)",
          background: "radial-gradient(120% 120% at 50% 30%, rgba(255,120,90,0.06), rgba(20,4,7,0.10))",
          boxShadow: "0 0 180px 12px rgba(255,70,60,0.2), inset 0 0 240px 24px rgba(255,90,70,0.07)",
        }}
      >
        <div className="absolute inset-6" style={{ borderRadius: 44, border: "2px solid rgba(242,199,90,0.16)" }} />
      </div>

      {/* ── DARKENED future courses — mapped but unlit / not yet developed ─── */}
      {FUTURE.map((c, i) => {
        const left = winLeft + i * (futW + futGap);
        return (
          <div
            key={c.key}
            className="pointer-events-none absolute grid select-none place-items-center"
            style={{
              left, top: futTop, width: futW, height: futH, zIndex: 0, borderRadius: 48,
              border: "4px solid rgba(120,110,120,0.22)",
              // blacked-out over the stained glass — the glow barely survives
              background: "linear-gradient(180deg, rgba(6,4,8,0.82), rgba(4,2,5,0.9))",
              boxShadow: "inset 0 0 120px 20px rgba(0,0,0,0.7)",
            }}
          >
            <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: 220, letterSpacing: "8px", color: "rgba(210,196,206,0.22)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{c.label}</span>
            <span style={{ position: "absolute", bottom: 80, fontFamily: FONT, fontWeight: 700, fontSize: 78, letterSpacing: "10px", textTransform: "uppercase", color: "rgba(180,168,178,0.16)" }}>not yet developed</span>
          </div>
        );
      })}
    </ViewportPortal>
  );
}
