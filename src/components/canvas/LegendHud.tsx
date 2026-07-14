// ON-CANVAS LEGEND ("Key") — Lee's memorization aid for the canvas vocabulary.
// Docked above the minimap (bottom-right stack), collapsible (state persists in
// localStorage), hidden in film mode + clean screen. Compact by design: legible
// at a glance, no scrolling.
import { useState } from "react";
import { ChevronDown, ChevronUp, Home, Layers3, MessageCircleQuestion, Shapes, SquareDashed, TrafficCone } from "lucide-react";

import { NEON } from "./theme";

const LS_KEY = "sa-canvas-legend-collapsed";

export function LegendHud() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(LS_KEY) === "1"; } catch { return false; }
  });
  const toggle = () => {
    setCollapsed((v) => {
      try { localStorage.setItem(LS_KEY, v ? "0" : "1"); } catch { /* ignore */ }
      return !v;
    });
  };

  return (
    <div
      className="absolute bottom-[190px] right-3 z-40 w-56 rounded-xl"
      style={{ background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
    >
      <button className="flex w-full items-center gap-1.5 px-2.5 py-1.5" onClick={toggle} title={collapsed ? "Expand the key" : "Collapse the key"}>
        <Shapes className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>Key</span>
        <span className="ml-auto" style={{ color: NEON.muted }}>
          {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      {!collapsed && (
        <div className="space-y-1.5 px-2.5 pb-2 text-[10.5px] leading-snug">
          {/* structure */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Structure</div>
            <div className="font-semibold" style={{ color: NEON.text }}>
              World <span style={{ color: NEON.muted }}>›</span> Region <span style={{ color: NEON.muted }}>›</span> Lesson <span style={{ color: NEON.muted }}>›</span> Card
            </div>
          </div>
          {/* the teaching arc */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>The arc</div>
            <div style={{ color: NEON.text }}>
              Hook → Teach → <span title="One card, one toggle: Guided models it, Practice makes them try">Model/Practice</span> → Check
            </div>
          </div>
          {/* categories */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Kinds</div>
            <div className="flex items-center gap-1.5"><Layers3 className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} /> <b>Cards</b><span style={{ color: NEON.muted }}>— teach; deal from the deck</span></div>
            <div className="flex items-center gap-1.5"><SquareDashed className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} /> <b>Elements</b><span style={{ color: NEON.muted }}>— design; never deck</span></div>
            <div className="flex items-center gap-1.5"><MessageCircleQuestion className="h-3 w-3 shrink-0" style={{ color: NEON.pinkSoft }} /> <b>Bridge</b><span style={{ color: NEON.muted }}>— features, soon</span></div>
          </div>
          {/* roles */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Roles</div>
            <div className="flex items-center gap-1.5"><Home className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} /> <b>Home</b><span style={{ color: NEON.muted }}>— a region's welcome lesson</span></div>
            <div className="flex items-center gap-1.5"><TrafficCone className="h-3 w-3 shrink-0" style={{ color: "#E8B84B" }} /> <b>Gate</b><span style={{ color: NEON.muted }}>— free/paid boundary</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
