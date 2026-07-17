// SURVIVE ACCOUNTING HUB (flow-space) — the canvas as a branded home. A colossal
// glowing "SURVIVE ACCOUNTING" header crowns the top; beneath it a labelled but
// EMPTY "Start Here" plate marks where that course's scaffolding will live (a
// stained-glass window — transparent, so the animated backstage glows through),
// with the future courses hinted below. Fixed flow layout centred on the origin
// so it's a stable landmark; authoring-only + behind the nodes + pointer-events-none.
import { ViewportPortal } from "@xyflow/react";

const GOLD_GRADIENT = "linear-gradient(180deg, #FFEFD2 0%, #F2C75A 42%, #E86A2E 78%, #C2352A 100%)";

// Future courses that will drop in under Start Here (placeholders only for now).
const FUTURE = ["Intro 1", "Intro 2", "IA1", "IA2"];

export function SurviveBackdrop() {
  // Deterministic flow layout (units) centred on x = 0.
  const headerFont = 460;
  const headerTop = 0;
  const headerH = headerFont * 1.25;

  const startTop = headerTop + headerH + 260;
  const winW = 7600;
  const winH = 3600;
  const winLeft = -winW / 2;
  const winTop = startTop + 220;

  return (
    <ViewportPortal>
      {/* ── SURVIVE ACCOUNTING — the crown header ─────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: -5000, top: headerTop, width: 10000, height: headerH, zIndex: 0 }}>
        <span
          style={{
            fontFamily: "'Poppins','Inter',system-ui,sans-serif",
            fontWeight: 900,
            fontSize: headerFont,
            lineHeight: 1,
            letterSpacing: `${headerFont * 0.01}px`,
            whiteSpace: "nowrap",
            background: GOLD_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            filter: "drop-shadow(0 10px 46px rgba(255,84,54,0.55)) drop-shadow(0 2px 10px rgba(0,0,0,0.5))",
          }}
        >
          SURVIVE ACCOUNTING
        </span>
      </div>

      {/* ── START HERE label ──────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: -5000, top: startTop, width: 10000, height: 240, zIndex: 0 }}>
        <span
          style={{
            fontFamily: "'Poppins','Inter',system-ui,sans-serif",
            fontWeight: 800,
            fontSize: 170,
            letterSpacing: "40px",
            textIndent: "40px",
            color: "rgba(255,236,214,0.92)",
            textShadow: "0 0 40px rgba(255,90,70,0.55), 0 6px 18px rgba(0,0,0,0.5)",
          }}
        >
          START HERE
        </span>
      </div>

      {/* ── STAINED-GLASS WINDOW — empty scaffold plate (glow shows through) ── */}
      <div
        className="pointer-events-none absolute select-none"
        style={{
          left: winLeft, top: winTop, width: winW, height: winH, zIndex: 0,
          borderRadius: 64,
          border: "6px solid rgba(242,199,90,0.35)",
          // barely-there fill so the animated backstage glows through like glass
          background: "radial-gradient(120% 120% at 50% 30%, rgba(255,120,90,0.05), rgba(20,4,7,0.10))",
          boxShadow: "0 0 160px 10px rgba(255,70,60,0.18), inset 0 0 220px 20px rgba(255,90,70,0.06)",
          backdropFilter: "saturate(1.15)",
        }}
      >
        {/* soft inner leading lines so it reads as a window, not a card */}
        <div className="absolute inset-6" style={{ borderRadius: 44, border: "2px solid rgba(242,199,90,0.14)" }} />
      </div>

      {/* ── future courses hint ───────────────────────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: -5000, top: winTop + winH + 180, width: 10000, height: 200, zIndex: 0 }}>
        <span
          style={{
            fontFamily: "'Poppins','Inter',system-ui,sans-serif",
            fontWeight: 700,
            fontSize: 96,
            letterSpacing: "16px",
            color: "rgba(255,220,200,0.20)",
            textShadow: "0 0 30px rgba(255,90,70,0.25)",
          }}
        >
          {FUTURE.join("   ·   ")}
          <span style={{ opacity: 0.5 }}>   — coming soon</span>
        </span>
      </div>
    </ViewportPortal>
  );
}
