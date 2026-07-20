// Film-mode overlays: cursor spotlight (soft radial glow that follows the pointer) and
// click ripple (expanding ring on every pointer-down). Sized and contrasted to survive
// 1080p YouTube compression on the dark background. Mounted only while film mode is on.
import { useEffect, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { NEON } from "./theme";

/** ARM CUE (space-walk) — Lee's teleprompter tell that the current frame is
 *  EXHAUSTED and the next space will transition. Rendered as FILMING CHROME: a
 *  fixed overlay (pointer-events-none), never part of the lesson DOM — so a
 *  future student view, which won't mount this, stays clean. Two states:
 *   • "ready" — a gently pulsing → on the leading (right) edge + soft edge glow.
 *   • "end"   — a red "end of lesson" bookend; space never advances past it.
 *  The optional rehearsal HUD adds a "next: Teach 2" pill (off by default).
 *  Shift+Space (item 3) mirrors this to the LEFT edge: "ready-back" pulses a ←
 *  toward the previous frame; "start" is a bookend — Shift+Space never steps
 *  before the lesson's first frame. */
export type ArmState = "ready" | "end" | "ready-back" | "start";
export function FrameArmCue({ state, nextLabel, showHud }: { state: ArmState; nextLabel: string; showHud: boolean }) {
  const back = state === "ready-back" || state === "start";
  const bookend = state === "end" || state === "start";
  const glow = bookend ? NEON.red : NEON.yellow;
  const edge = back ? "left-0" : "right-0";
  const gradTo = back ? "to right" : "to left";
  return (
    <div className="pointer-events-none fixed inset-0 z-[68]">
      {/* leading-edge glow bar — right toward the next frame, left toward the prev */}
      <div
        className={`absolute top-0 h-full ${edge}`}
        style={{ width: 90, background: `linear-gradient(${gradTo}, ${glow}, transparent)`, opacity: 0.16, animation: "sa-arm-pulse 1.5s ease-in-out infinite" }}
      />
      {/* the tell: a pulsing chevron (ready) or a stop bookend (end/start) */}
      <div className={`absolute top-1/2 -translate-y-1/2 ${back ? "left-6" : "right-6"}`} style={{ animation: "sa-arm-pulse 1.5s ease-in-out infinite" }}>
        {bookend ? (
          <div className="flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "rgba(11,15,30,0.55)", border: `1.5px solid ${glow}` }}>
            <span className="h-4 w-1 rounded" style={{ background: glow }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: glow }}>{state === "start" ? "Start" : "End"}</span>
          </div>
        ) : back ? (
          <ChevronsLeft className="h-9 w-9" style={{ color: glow, filter: `drop-shadow(0 0 6px ${glow})` }} />
        ) : (
          <ChevronsRight className="h-9 w-9" style={{ color: glow, filter: `drop-shadow(0 0 6px ${glow})` }} />
        )}
      </div>
      {/* rehearsal HUD (off by default) — the next-up read, top-center */}
      {showHud && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full px-3 py-1 text-[11px] font-semibold" style={{ background: "rgba(11,15,30,0.7)", border: `1px solid ${glow}`, color: glow }}>
          {back ? "back" : "next"}: {nextLabel}
        </div>
      )}
      <style>{`@keyframes sa-arm-pulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}

export function CursorSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const el = ref.current;
        if (el) el.style.transform = `translate(${e.clientX - 90}px, ${e.clientY - 90}px)`;
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-[70] h-[180px] w-[180px]"
      style={{
        background: `radial-gradient(circle, rgba(252,163,17,0.26) 0%, rgba(252,163,17,0.09) 45%, transparent 70%)`,
        mixBlendMode: "screen",
        transform: "translate(-200px, -200px)", // offscreen until first move
      }}
    />
  );
}

export function ClickRipples() {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  useEffect(() => {
    let seq = 0;
    const onDown = (e: PointerEvent) => {
      const id = ++seq;
      setRipples((rs) => [...rs, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setRipples((rs) => rs.filter((r) => r.id !== id)), 650);
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as never);
  }, []);

  return (
    <>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none fixed z-[71] rounded-full"
          style={{
            left: r.x,
            top: r.y,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
            border: `2.5px solid ${NEON.yellow}`,
            boxShadow: `0 0 12px ${NEON.yellow}`,
            animation: "canvas-ripple 0.6s ease-out forwards",
          }}
        />
      ))}
      <style>{`
        @keyframes canvas-ripple {
          0%   { transform: scale(1);   opacity: 0.95; }
          100% { transform: scale(7.5); opacity: 0;    }
        }
      `}</style>
    </>
  );
}

/** CARD TAP PULSE (#10) — a small, subtle silver ring on pointer-down anywhere
 *  ON A CARD (not the empty pane), always on. Reads as tactile "you grabbed
 *  this" feedback, quieter than the film-mode amber ripple. Ignores clicks in
 *  text fields so typing doesn't strobe. */
export function CardTapPulse() {
  const [pulses, setPulses] = useState<{ id: number; x: number; y: number }[]>([]);
  useEffect(() => {
    let seq = 0;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest(".react-flow__node")) return; // cards only
      if (t.closest("input, textarea, [contenteditable='true']")) return; // not while typing
      const id = ++seq;
      setPulses((ps) => [...ps, { id, x: e.clientX, y: e.clientY }]);
      setTimeout(() => setPulses((ps) => ps.filter((p) => p.id !== id)), 480);
    };
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    return () => window.removeEventListener("pointerdown", onDown, { capture: true } as never);
  }, []);
  return (
    <>
      {pulses.map((p) => (
        <span
          key={p.id}
          className="pointer-events-none fixed z-[72] rounded-full"
          style={{
            left: p.x, top: p.y, width: 10, height: 10, marginLeft: -5, marginTop: -5,
            border: "2px solid rgba(174,185,201,0.9)",
            boxShadow: "0 0 8px rgba(174,185,201,0.6)",
            animation: "canvas-tap-pulse 0.45s ease-out forwards",
          }}
        />
      ))}
      <style>{`@keyframes canvas-tap-pulse { 0% { transform: scale(0.6); opacity: 0.9; } 100% { transform: scale(4); opacity: 0; } }`}</style>
    </>
  );
}

// CUSTOM CARD CURSOR (#10) — replaces the OS grab-hand with an on-brand 4-way
// move glyph (platinum stroke + dark halo so it reads on any background). Built
// through encodeURIComponent so the data URI can't be malformed by a stray #.
const MOVE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M13 3.5 V22.5 M3.5 13 H22.5 M13 3.5 l-2.4 2.4 M13 3.5 l2.4 2.4 M13 22.5 l-2.4 -2.4 M13 22.5 l2.4 -2.4 M3.5 13 l2.4 -2.4 M3.5 13 l2.4 2.4 M22.5 13 l-2.4 -2.4 M22.5 13 l-2.4 2.4" stroke="#0B0F1E" stroke-width="3.4"/><path d="M13 3.5 V22.5 M3.5 13 H22.5 M13 3.5 l-2.4 2.4 M13 3.5 l2.4 2.4 M13 22.5 l-2.4 -2.4 M13 22.5 l2.4 -2.4 M3.5 13 l2.4 -2.4 M3.5 13 l2.4 2.4 M22.5 13 l-2.4 -2.4 M22.5 13 l-2.4 2.4" stroke="#AEB9C9" stroke-width="1.5"/></g></svg>`;
const MOVE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(MOVE_SVG)}") 13 13, move`;
export const CARD_CURSOR_CSS = `
  /* compound selector (0,2,0) so it beats React Flow's own
     .react-flow__node.draggable { cursor: grab }. Branded 4-way move glyph
     where SVG cursors are honored; reliable 'move' fallback otherwise —
     never the grab-hand. Containers keep grab. */
  .react-flow__node.react-flow__node-je, .react-flow__node.react-flow__node-taccount,
  .react-flow__node.react-flow__node-note, .react-flow__node.react-flow__node-computation,
  .react-flow__node.react-flow__node-memorize, .react-flow__node.react-flow__node-ceq,
  .react-flow__node.react-flow__node-list, .react-flow__node.react-flow__node-schedule,
  .react-flow__node.react-flow__node-image, .react-flow__node.react-flow__node-heading,
  .react-flow__node.react-flow__node-video, .react-flow__node.react-flow__node-formula {
    cursor: ${MOVE_CURSOR};
  }
  /* inner controls keep their own affordance (they're child elements — no
     specificity fight with the node div above) */
  .react-flow__node input, .react-flow__node textarea, .react-flow__node [contenteditable="true"] { cursor: text; }
  .react-flow__node button, .react-flow__node a, .react-flow__node select, .react-flow__node [role="button"] { cursor: pointer; }
  /* film/clean present views: no move cursor for the audience */
  .film-mode .react-flow__node, .sa-clean .react-flow__node { cursor: default; }
`;

/** DOUBLE-EMPHASIS 🔥 — an always-on (authoring + film) flame that runs across
 *  the BOTTOM of any target carrying data-flame="on" (toggled by Ctrl+Shift+click
 *  in SpotlightContext). A moving gradient bar + a 🔥 emoji that travels the
 *  width, so a memo or lesson row can be really-really emphasized in the moment. */
export const FLAME_CSS = `
  /* Super-spotlight → ~40% larger (Lee's call). !important beats the inline
     scale(1.2) from spotStyle so a target that is both spotlit AND flamed lands
     at 40%, not 20%. */
  [data-flame="on"] { position: relative; border-radius: 8px; transform: scale(1.4) !important; transform-origin: left center !important; transition: transform 150ms ease; }
  [data-flame="on"]::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -3px; height: 4px; border-radius: 4px;
    background: linear-gradient(90deg, transparent, #FF7A00 25%, #FFD23F 50%, #FF7A00 75%, transparent);
    background-size: 220% 100%; animation: sa-flame-run 1.1s linear infinite;
    filter: drop-shadow(0 0 6px rgba(255,122,0,0.85)); pointer-events: none; z-index: 7;
  }
  [data-flame="on"]::before {
    content: "🔥"; position: absolute; bottom: -11px; left: 0; font-size: 15px; line-height: 1;
    animation: sa-flame-emoji 1.5s linear infinite; pointer-events: none; z-index: 8;
    filter: drop-shadow(0 0 4px rgba(255,122,0,0.9));
  }
  @keyframes sa-flame-run { from { background-position: 220% 0; } to { background-position: 0% 0; } }
  @keyframes sa-flame-emoji {
    0%   { left: -3%;  transform: translateY(0)    scaleX(1); }
    50%  {             transform: translateY(-2px) scaleX(-1); }
    100% { left: 100%; transform: translateY(0)    scaleX(1); }
  }
`;

/** CSS that removes at-rest card chrome in film mode. Interactions keep working —
 *  drag (header), dbl-click edit, hotkeys — only passive affordances disappear. */
export const FILM_MODE_CSS = `
  /* AUTHORING CHROME SWEEP (Effect-Rubric #6): every authoring affordance is
     hidden on a take — the shot is teaching content only. .card-actions covers
     header buttons/chrome grids; .sa-chrome is the general hook for stragglers
     that live OUTSIDE a card-actions row (deck chip, scale % readout, pos-lock
     grip, DERIVED/override badges, component role pickers); connection dots and
     resize controls hide by their own classes. Audited leaks that this closes:
     deck chip, CardScaleHandle %, BaseCard pos-lock button, ConnectionDots,
     formula derived/override badge + component picker. */
  .film-mode .card-actions { display: none !important; }
  .film-mode .sa-chrome { display: none !important; }
  .film-mode .conn-dot,
  .film-mode .react-flow__handle { display: none !important; }
  /* RESIZE STAYS LIVE IN FILM (improvise while filming): a selected card keeps its
     NodeResizer handles so Lee can nudge size/position mid-take. They only show
     on the selected card, so an unselected shot is still clean. */
  .film-mode .zone-actions { display: none !important; }
  /* Legend V2 (item 4): the collection number is an authoring aid — off camera. */
  .film-mode .legend-collnum { display: none !important; }
  /* CINEMA BACKSTAGE (authoring): frames float OUT of the animated red stage with
     deep dimensional shadow + a lifted rim, so each reads as a solid plate emerging
     from the depth below. Applied to the frame node's beat surface. */
  .sa-cinema .react-flow__node:has(> [data-beat]) {
    filter: drop-shadow(0 26px 40px rgba(0,0,0,0.7)) drop-shadow(0 6px 14px rgba(0,0,0,0.55));
  }
  .sa-cinema [data-beat] {
    box-shadow: 0 2px 0 0 rgba(255,255,255,0.06) inset, 0 -18px 40px -20px rgba(0,0,0,0.8) inset, 0 40px 80px -24px rgba(0,0,0,0.85) !important;
  }
  /* a hair more contrast on the frame edge so it separates from the crimson field */
  .sa-cinema [data-beat] { border-width: 2px !important; }
  /* FG4: a frame's own chrome (header, beat chip, title, nav chevrons) never
     renders over a take — the shot is the cards only. */
  .film-mode [data-frame-chrome] { display: none !important; }
  /* AC5 film polish (both toggleable via body classes on the root):
     (a) dealt-card ENTRANCE POP — a crisp scale-pop with a touch of overshoot.
     Animates the independent \`scale\` property so it COMPOSES with a card's own
     transform:scale() (framed cards sit at ~60%) instead of wiping it. Fires on
     the node's mount, i.e. exactly when a tucked card is dealt. */
  @keyframes sa-deal-pop { 0% { scale: 0.82; opacity: 0; } 60% { scale: 1.05; opacity: 1; } 100% { scale: 1; opacity: 1; } }
  .film-mode.sa-entrance-pop .react-flow__node > * { animation: sa-deal-pop 180ms cubic-bezier(0.22,1,0.36,1) both; }
  /* (b) CHECK GATE GLOW — the red Check frame reads hotter on camera. */
  .film-mode.sa-check-glow [data-beat="cram"] { box-shadow: 0 0 0 2px rgba(206,17,38,0.65), 0 0 42px -6px rgba(206,17,38,0.75) !important; }
  /* FILM = STRUCTURE INERT, CONTENT LIVE. Every design/structure node
     (frame, lesson, region/zone, heading, text, gate) goes pointer-events:none
     so it can't be selected, dragged, resized, or hovered — clicks fall through
     to the canvas and the composed stage never nudges. React Flow renders child
     nodes as DOM SIBLINGS (not nested), so a frame/lesson going inert does NOT
     disable the CARDS inside it — cards stay fully live (select, drag, edit,
     reveal, flip, spotlight, deal). Exiting film restores everything (no
     persisted state — purely a mode gate). The camera bubble is a separate
     overlay, not a node, so it stays draggable. */
  .film-mode .react-flow__node-frame,
  .film-mode .react-flow__node-lesson,
  .film-mode .react-flow__node-zone,
  .film-mode .react-flow__node-heading,
  .film-mode .react-flow__node-text,
  .film-mode .react-flow__node-paygate,
  .film-mode .react-flow__node-signupgate {
    pointer-events: none !important;
  }
  /* SPOTLIGHT IN FILM (Lee): a heading / text block stays inert (no accidental
     drag mid-take) EXCEPT its spotlight TARGET — Ctrl+click / Ctrl+Shift+click
     must still emphasise it while filming. Only the target span re-arms. */
  .film-mode .react-flow__node-heading [data-spot-target],
  .film-mode .react-flow__node-text [data-spot-target] {
    pointer-events: auto !important;
  }
  /* FRAME FULLY LOCKED IN FILM: the frame node AND all its own descendants
     (letterbox, bg loop, chrome) go inert, so grabbing anywhere on the frame can
     never pick it up mid-take — only the CARDS (DOM siblings, not descendants)
     stay draggable. Move the cards, never the frame. */
  .film-mode .react-flow__node-frame * { pointer-events: none !important; }
`;
