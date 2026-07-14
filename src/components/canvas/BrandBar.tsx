// BRAND BAR + DRAWER (workspace chrome) — a slim (~44px) dark top bar: Survive
// Accounting wordmark centered, hamburger top-LEFT opening an empty-scaffold
// left drawer ("menu coming soon"; state persisted). Deliberately NOT the red
// homepage navbar — this is the workspace, not marketing. In film/clean modes
// the bar hides and a small corner WATERMARK takes over (every filmed video
// carries the brand); the Esc ladder restores the full bar.
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { NEON } from "./theme";

const LS_KEY = "sa-canvas-drawer-open";

export function Wordmark({ size = 13 }: { size?: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 select-none" style={{ lineHeight: 1 }}>
      <span className="font-black tracking-[0.14em]" style={{ color: "#F4EFE6", fontSize: size }}>SURVIVE</span>
      <span className="font-bold" style={{ color: "#E8B84B", fontSize: Math.round(size * 0.62), letterSpacing: "0.34em" }}>ACCOUNTING</span>
    </span>
  );
}

export function BrandBar() {
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const toggle = () => {
    setDrawerOpen((v) => {
      try { localStorage.setItem(LS_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  };

  return (
    <>
      <div
        className="absolute inset-x-0 top-0 z-[55] flex h-11 items-center px-3"
        style={{ background: NEON.bg2, borderBottom: `1px solid ${NEON.borderSoft}` }}
      >
        <button
          className="grid h-8 w-8 place-items-center rounded-md"
          style={{ color: NEON.muted }}
          title={drawerOpen ? "Close menu" : "Menu"}
          onClick={toggle}
        >
          {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <div className="pointer-events-none absolute inset-x-0 flex justify-center">
          <Wordmark />
        </div>
      </div>

      {/* left drawer — empty scaffolding; real menu arrives with World v1 */}
      <div
        className="absolute bottom-0 left-0 top-11 z-[54] w-64 transition-transform duration-200 ease-out"
        style={{
          background: NEON.bg2,
          borderRight: `1px solid ${NEON.borderSoft}`,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          boxShadow: drawerOpen ? "12px 0 40px -20px rgba(0,0,0,0.7)" : "none",
        }}
      >
        <div className="px-4 py-4" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
          <Wordmark size={15} />
        </div>
        <div className="grid place-items-center px-4 py-10">
          <div
            className="w-full rounded-lg px-3 py-6 text-center text-[11px] font-semibold uppercase tracking-wider"
            style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}
          >
            menu coming soon
          </div>
        </div>
      </div>
    </>
  );
}

/** Corner watermark for film/clean modes — subtle, ~20px, above the legend
 *  spot. Visible on 1080p, never loud. */
export function BrandWatermark() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[45]" style={{ opacity: 0.55, height: 20 }}>
      <Wordmark size={12} />
    </div>
  );
}
