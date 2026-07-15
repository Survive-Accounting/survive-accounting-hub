// ON-CANVAS LEGEND ("Key") — Lee's memorization aid for the canvas vocabulary.
// Docked above the minimap (bottom-right stack), collapsible (state persists in
// localStorage), hidden in film mode + clean screen. Compact by design: legible
// at a glance, no scrolling.
import { useState } from "react";
import { Boxes, ChevronDown, ChevronRight, ChevronUp, Clapperboard, Film, Flag, Home, Layers3, MessageCircleQuestion, Scissors, Shapes, SquareDashed, StickyNote, TrafficCone } from "lucide-react";

import { NEON } from "./theme";

const LS_KEY = "sa-canvas-legend-collapsed";

// Lee's on-camera reminders — text only, so they stay one edit away from Lee.
const FILMING_PRINCIPLES = [
  "No preambles — jump in.",
  "Build the space-walk first, rehearse it, then roll.",
  "One unedited take. Accept the imperfection — it sells.",
  "Have fun, smile, be extremely helpful.",
  "Never shame a student for not knowing something.",
  'Never say "obviously," "simply," or "just."',
  "End on the student's next action, not on yourself.",
  'Same outro every time: "Hope this helped and best of luck on your exam."',
  "≤5 minutes is still good and worth posting.",
];
const SHORTS_CUES = [
  "Highly recommend memorizing this.",
  "This is where the exam gets you.",
  "Tons of students misunderstand ___. Let's clear it up.",
  "This is the ultimate cheat code for ___.",
  "Let's make ___ way easier.",
  "Now we're cooking with gas.", // marks the end of a big tip
];

/** A Lee-facing collapsible section in the Key panel (own persisted open state). */
/** A little keycap glyph for the Space-walk section. */
function KeyCap({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="shrink-0 rounded px-1 text-[9.5px] font-bold not-italic" style={{ color: NEON.yellow, border: `1px solid ${NEON.borderSoft}`, background: "rgba(0,0,0,0.3)" }}>
      {children}
    </kbd>
  );
}

function KeySection({ id, icon, title, children }: { id: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const key = `sa-canvas-legend-${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== "0"; } catch { return true; } });
  const toggle = () => setOpen((v) => { try { localStorage.setItem(key, v ? "0" : "1"); } catch { /* ignore */ } return !v; });
  return (
    <div className="border-t pt-1.5" style={{ borderColor: NEON.borderSoft }}>
      <button className="flex w-full items-center gap-1" onClick={toggle}>
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: NEON.muted }}>{title}</span>
        <span className="ml-auto" style={{ color: NEON.muted }}>{open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

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

          {/* LEE-FACING filming reminders — below the vocabulary, collapsible. */}
          <KeySection id="filming" icon={<Film className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />} title="Filming principles">
            <ul className="space-y-0.5" style={{ color: NEON.text }}>
              {FILMING_PRINCIPLES.map((p, i) => (
                <li key={i} className="flex gap-1.5"><span className="shrink-0" style={{ color: NEON.muted }}>·</span><span>{p}</span></li>
              ))}
            </ul>
          </KeySection>

          <KeySection id="shorts" icon={<Scissors className="h-3 w-3 shrink-0" style={{ color: NEON.cyan }} />} title="Shorts cues">
            <div className="mb-0.5" style={{ color: NEON.muted }}>say these on camera — they mark the clip</div>
            <ul className="space-y-0.5">
              {SHORTS_CUES.map((c, i) => (
                <li key={i} className="italic" style={{ color: NEON.cyan }}>“{c}”</li>
              ))}
            </ul>
          </KeySection>

          {/* SPACE-WALK (item 3) — the one-key performance, forward + reverse. The
              full binding list lives in the "?" overlay; this is the at-a-glance. */}
          <KeySection id="spacewalk" icon={<MessageCircleQuestion className="h-3 w-3 shrink-0" style={{ color: NEON.yellow }} />} title="Space-walk">
            <ul className="space-y-0.5" style={{ color: NEON.text }}>
              <li className="flex gap-1.5"><KeyCap>Space</KeyCap><span style={{ color: NEON.muted }}>reveal → deal → arm → next frame</span></li>
              <li className="flex gap-1.5"><KeyCap>⇧ Space</KeyCap><span style={{ color: NEON.muted }}>un-reveal → un-deal → back a frame</span></li>
            </ul>
          </KeySection>
        </div>
      )}
    </div>
  );
}
