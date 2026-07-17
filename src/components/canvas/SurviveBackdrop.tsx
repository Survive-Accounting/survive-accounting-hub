// SURVIVE ACCOUNTING HUB (flow-space) — the canvas as a branded home:
//   • a colossal glowing "SURVIVE ACCOUNTING" header crowns the top;
//   • beneath it the LIT "Start Here" plate — a stained-glass window whose bounds
//     the region scaffold builds INSIDE (the scaffold lands here, not floating
//     over the hub), sized to hold the whole course at natural node scale;
//   • below, the four other courses (Intro 1 · Intro 2 · IA1 · IA2) sit as
//     DARKENED, clearly-unlit plates — "not yet developed."
// Geometry comes from hub-layout (the same source the scaffold reads), so the
// plate the scaffold fills is exactly the plate drawn here. Authoring-only (parent
// gates it to the cinema backstage, !film) + behind the nodes + pointer-events-none.
import { ViewportPortal } from "@xyflow/react";

import { hubLayout } from "./hub-layout";

const GOLD_GRADIENT = "linear-gradient(180deg, #FFEFD2 0%, #F2C75A 42%, #E86A2E 78%, #C2352A 100%)";
const FONT = "'Poppins','Inter',system-ui,sans-serif";

export function SurviveBackdrop() {
  const hub = hubLayout();
  const { header, label, startPlate, future } = hub;
  const span = 10000;

  return (
    <ViewportPortal>
      {/* ── SURVIVE ACCOUNTING — the crown header ─────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: startPlate.x + startPlate.w / 2 - span / 2, top: header.top, width: span, height: header.h, zIndex: 0 }}>
        <span
          style={{
            fontFamily: FONT, fontWeight: 900, fontSize: header.font, lineHeight: 1,
            letterSpacing: `${header.font * 0.01}px`, whiteSpace: "nowrap",
            background: GOLD_GRADIENT, WebkitBackgroundClip: "text", backgroundClip: "text",
            WebkitTextFillColor: "transparent", color: "transparent",
            filter: "drop-shadow(0 10px 46px rgba(255,84,54,0.55)) drop-shadow(0 2px 10px rgba(0,0,0,0.5))",
          }}
        >
          {header.text}
        </span>
      </div>

      {/* ── START HERE label (the lit centre) ─────────────────────────────── */}
      <div className="pointer-events-none absolute grid select-none place-items-center" style={{ left: startPlate.x + startPlate.w / 2 - span / 2, top: label.top, width: span, height: label.h, zIndex: 0 }}>
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: label.font, letterSpacing: `${label.font * 0.24}px`, textIndent: `${label.font * 0.24}px`, color: "rgba(255,236,214,0.94)", textShadow: "0 0 42px rgba(255,90,70,0.6), 0 6px 18px rgba(0,0,0,0.5)" }}>
          {label.text}
        </span>
      </div>

      {/* ── LIT stained-glass plate — the scaffold builds INSIDE these bounds ─ */}
      <div
        className="pointer-events-none absolute select-none"
        style={{
          left: startPlate.x, top: startPlate.y, width: startPlate.w, height: startPlate.h, zIndex: 0, borderRadius: 96,
          border: "8px solid rgba(242,199,90,0.4)",
          background: "radial-gradient(120% 120% at 50% 30%, rgba(255,120,90,0.06), rgba(20,4,7,0.10))",
          boxShadow: "0 0 320px 24px rgba(255,70,60,0.2), inset 0 0 420px 48px rgba(255,90,70,0.06)",
        }}
      >
        <div className="absolute inset-8" style={{ borderRadius: 72, border: "3px solid rgba(242,199,90,0.16)" }} />
      </div>

      {/* ── DARKENED future courses — mapped but unlit / not yet developed ─── */}
      {future.map((c) => (
        <div
          key={c.key}
          className="pointer-events-none absolute grid select-none place-items-center"
          style={{
            left: c.rect.x, top: c.rect.y, width: c.rect.w, height: c.rect.h, zIndex: 0, borderRadius: 64,
            border: "6px solid rgba(120,110,120,0.22)",
            background: "linear-gradient(180deg, rgba(6,4,8,0.82), rgba(4,2,5,0.9))",
            boxShadow: "inset 0 0 160px 28px rgba(0,0,0,0.7)",
          }}
        >
          <span style={{ fontFamily: FONT, fontWeight: 900, fontSize: c.rect.h * 0.24, letterSpacing: "8px", color: "rgba(210,196,206,0.22)", textShadow: "0 2px 10px rgba(0,0,0,0.6)" }}>{c.label}</span>
          <span style={{ position: "absolute", bottom: c.rect.h * 0.14, fontFamily: FONT, fontWeight: 700, fontSize: c.rect.h * 0.075, letterSpacing: "10px", textTransform: "uppercase", color: "rgba(180,168,178,0.16)" }}>not yet developed</span>
        </div>
      ))}
    </ViewportPortal>
  );
}
