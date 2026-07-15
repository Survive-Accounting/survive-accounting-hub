// ON-CANVAS LEGEND ("Key") — Lee's memorization aid for the canvas vocabulary.
// Docked above the minimap (bottom-right stack), collapsible (state persists in
// localStorage), hidden in film mode + clean screen. Compact by design: legible
// at a glance, no scrolling.
import { useState } from "react";
import { Boxes, ChevronDown, ChevronUp, Clapperboard, Flag, Home, Layers3, MessageCircleQuestion, Shapes, SquareDashed, StickyNote, TrafficCone } from "lucide-react";

import { NEON } from "./theme";

const LS_KEY = "sa-canvas-legend-collapsed";

export function LegendHud({ docked = false }: {
  /** DOCKED (declutter run): fills the drawer's Key panel — always expanded,
   *  no floating chrome. */
  docked?: boolean;
}) {
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
      className={docked ? "w-full" : "absolute bottom-[190px] right-3 z-40 w-56 rounded-xl"}
      style={docked ? { color: NEON.text } : { background: NEON.panel, border: `1px solid ${NEON.borderSoft}`, backdropFilter: "blur(8px)", color: NEON.text }}
    >
      {!docked && (
        <button className="flex w-full items-center gap-1.5 px-2.5 py-1.5" onClick={toggle} title={collapsed ? "Expand the key" : "Collapse the key"}>
          <Shapes className="h-3.5 w-3.5" style={{ color: NEON.yellow }} />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: NEON.yellow }}>Key</span>
          <span className="ml-auto" style={{ color: NEON.muted }}>
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
      )}
      {(docked || !collapsed) && (
        <div className="space-y-1.5 px-2.5 pb-2 text-[10.5px] leading-snug">
          {/* structure — the full path incl. FRAME */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Structure</div>
            <div className="font-semibold" style={{ color: NEON.text }}>
              World <span style={{ color: NEON.muted }}>›</span> Region <span style={{ color: NEON.muted }}>›</span> Lesson <span style={{ color: NEON.muted }}>›</span> <span style={{ color: NEON.cyan }}>Frame</span> <span style={{ color: NEON.muted }}>›</span> Card
            </div>
            <div style={{ color: NEON.muted }}>Frame = one 16:9 shot / one sitting</div>
          </div>
          {/* the teaching arc — beat is a TAG on a Frame */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>The arc</div>
            <div style={{ color: NEON.text }}>
              Hook → Teach → <span title="One card, one toggle: Guided models it, Practice makes them try">Model/Practice</span> → Check
            </div>
            <div style={{ color: NEON.muted }}>a <b style={{ color: NEON.text }}>beat</b> is a tag on a Frame</div>
          </div>
          {/* kinds */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Kinds</div>
            <div className="flex items-center gap-1.5"><Layers3 className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} /> <b>Cards</b><span style={{ color: NEON.muted }}>— teach; deal from the deck</span></div>
            <div className="flex items-center gap-1.5"><SquareDashed className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} /> <b>Elements</b><span style={{ color: NEON.muted }}>— design; never deck</span></div>
            <div className="flex items-center gap-1.5"><MessageCircleQuestion className="h-3 w-3 shrink-0" style={{ color: NEON.pinkSoft }} /> <b>Bridge</b><span style={{ color: NEON.muted }}>— features, soon</span></div>
          </div>
          {/* decks & memos */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Decks &amp; Memos</div>
            <div className="flex items-center gap-1.5"><Boxes className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} /> <b>Decks</b><span style={{ color: NEON.muted }}>— named; deal · shuffle · skeleton slots</span></div>
            <div className="flex items-center gap-1.5"><StickyNote className="h-3 w-3 shrink-0" style={{ color: "#F5D48F" }} /> <b>Memos</b><span style={{ color: NEON.muted }}>— cheat · trap · calc · tip</span></div>
            <div style={{ color: NEON.muted }}>atoms are <b style={{ color: NEON.text }}>Cards</b>, collections are <b style={{ color: NEON.text }}>Decks</b></div>
          </div>
          {/* roles */}
          <div>
            <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>Roles</div>
            <div className="flex items-center gap-1.5"><Home className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} /> <b>Home</b><span style={{ color: NEON.muted }}>— the region's start</span></div>
            <div className="flex items-center gap-1.5"><Flag className="h-3 w-3 shrink-0" style={{ color: "#FF8B9E" }} /> <b>Check</b><span style={{ color: NEON.muted }}>— red gate: where you get tested</span></div>
            <div className="flex items-center gap-1.5"><TrafficCone className="h-3 w-3 shrink-0" style={{ color: "#E8B84B" }} /> <b>Gate</b><span style={{ color: NEON.muted }}>— free/paid boundary</span></div>
            <div className="flex items-center gap-1.5"><Clapperboard className="h-3 w-3 shrink-0" style={{ color: NEON.text }} /> <b>Studio</b><span style={{ color: NEON.muted }}>— Solo · Solved · Live</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
