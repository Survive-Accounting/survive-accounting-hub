// BRAND BAR + DRAWER (workspace chrome) — NO top bar (it blocked controls in
// full screen). Instead a floating toggle sits at the BOTTOM-RIGHT and opens the
// left dashboard drawer. The drawer is the workspace MENU (declutter run): Cards
// (the palette), Outline, and Key (the legend) open as panels inside it, and its
// own header carries the wordmark — so branding lives in the drawer, not across
// the top of the canvas. Open state + active panel persist. In film/clean modes
// the toggle hides and a small corner WATERMARK takes over.
import { useState } from "react";
import { Menu, X } from "lucide-react";

import { NEON } from "./theme";

const LS_KEY = "sa-canvas-drawer-open";

export interface DrawerItem {
  key: string;
  label: string;
}

export function Wordmark({ size = 13 }: { size?: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 select-none" style={{ lineHeight: 1 }}>
      <span className="font-black tracking-[0.14em]" style={{ color: "#F4EFE6", fontSize: size }}>SURVIVE</span>
      <span className="font-bold" style={{ color: "#E8B84B", fontSize: Math.round(size * 0.62), letterSpacing: "0.34em" }}>ACCOUNTING</span>
    </span>
  );
}

export function BrandBar({ items = [], activeItem = null, onItem, children }: {
  /** Drawer menu entries (Cards, Key, …). Empty = the old placeholder. */
  items?: DrawerItem[];
  /** Which entry's panel is open (its body arrives via children). */
  activeItem?: string | null;
  onItem?: (key: string | null) => void;
  /** The open panel's body, rendered under the menu (drawer widens for it). */
  children?: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const toggle = () => {
    setDrawerOpen((v) => {
      try { localStorage.setItem(LS_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  };
  const panelOpen = drawerOpen && activeItem != null && !!children;

  return (
    <>
      {/* floating toggle — BOTTOM-RIGHT (no top bar; it blocked full-screen controls) */}
      <button
        className="absolute bottom-3 right-3 z-[56] grid h-10 w-10 place-items-center rounded-full transition-colors"
        style={{
          background: NEON.bg2,
          border: `1px solid ${drawerOpen ? "rgba(252,163,17,0.55)" : NEON.borderSoft}`,
          color: drawerOpen ? NEON.yellow : NEON.muted,
          boxShadow: "0 10px 30px -12px rgba(0,0,0,0.7)",
        }}
        title={drawerOpen ? "Close menu" : "Menu"}
        onClick={toggle}
      >
        {drawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {/* left drawer — the workspace menu (Cards / Outline / Key panels live here) */}
      <div
        className={`absolute bottom-0 left-0 top-0 z-[54] flex flex-col transition-all duration-200 ease-out ${panelOpen ? "w-80" : "w-64"}`}
        style={{
          background: NEON.bg2,
          borderRight: `1px solid ${NEON.borderSoft}`,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          boxShadow: drawerOpen ? "12px 0 40px -20px rgba(0,0,0,0.7)" : "none",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
          <Wordmark size={15} />
          <button className="grid h-6 w-6 place-items-center rounded-md" style={{ color: NEON.muted }} title="Close menu" onClick={toggle}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        {items.length === 0 ? (
          <div className="grid place-items-center px-4 py-10">
            <div
              className="w-full rounded-lg px-3 py-6 text-center text-[11px] font-semibold uppercase tracking-wider"
              style={{ border: `1px dashed ${NEON.borderSoft}`, color: NEON.muted }}
            >
              menu coming soon
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1 px-2 py-1.5" style={{ borderBottom: `1px solid ${NEON.borderSoft}` }}>
              {items.map((it) => (
                <button
                  key={it.key}
                  className="rounded-md px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider transition-colors"
                  style={{
                    color: activeItem === it.key ? NEON.yellow : NEON.muted,
                    background: activeItem === it.key ? "rgba(252,163,17,0.12)" : "transparent",
                    border: `1px solid ${activeItem === it.key ? "rgba(252,163,17,0.45)" : "transparent"}`,
                  }}
                  onClick={() => onItem?.(activeItem === it.key ? null : it.key)}
                >
                  {it.label}
                </button>
              ))}
            </div>
            {panelOpen && <div className="min-h-0 flex-1 overflow-hidden p-2">{children}</div>}
          </>
        )}
      </div>
    </>
  );
}

/** Corner watermark for film/clean modes — subtle, ~24px, TOP-RIGHT (matches the
 *  camera-safe guide's watermark zone, and leaves the bottom-right free for the
 *  camera bubble). Visible on 1080p, never loud. */
export function BrandWatermark() {
  // Film/clean-mode corner watermark: the REAL brand wordmark (white-on-transparent
  // PNG with the gold dot) reads cleanly on the dark stage. Top-right so it sits in
  // the guide's WATERMARK zone and never fights the bottom-right camera bubble.
  return (
    <div className="pointer-events-none absolute top-3 right-3 z-[45]" style={{ opacity: 0.55 }}>
      <img src="/brand-logo.png" alt="Survive Accounting" style={{ height: 24, width: "auto" }} />
    </div>
  );
}
