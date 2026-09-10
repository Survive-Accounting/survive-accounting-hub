// THE HOTKEYS MODAL (2026-09-06). Lee, after a night of rehearsing: "Cold open / captions clear /
// hotkeys, put that all behind a modal link. It's a lot of text in bottom left." The chrome
// bar's one long sentence of every shortcut is gone; this is where it went — "?" (the button in
// the chrome bar, or Shift+/) opens it, Escape or a click outside closes it. Purely a reference
// card: nothing here fires a shortcut, the keydown handler in BlastOffCapture still does.
//
// Every shortcut the capture surface answers, grouped the way Lee reaches for them. When a key
// is added to BlastOffCapture it is added HERE — this list is the only place they're written
// down for him now.
import { CREAM, EDGE, GOLD, MUTED } from "../BlastOffEditor";

const INK = "#05070D";

interface Group { title: string; keys: readonly (readonly [string, string])[] }

export const HOTKEY_GROUPS: readonly Group[] = [
  { title: "Walking", keys: [
    ["space", "next slide (while rehearsing: also starts an armed round, and finishes it on the last slide)"],
    ["shift + space", "back a slide"],
    // "Rehearse & Film" — the step's name since 2026-09-07 (StepBar.tsx); the page is the same.
    ["esc", "exit Rehearse & Film (closes the rehearsal review or this card first when one is up)"],
  ] },
  { title: "Camera", keys: [
    ["B", "cycle the camera: home → corner → hero → top → off (until the next slide)"],
    ["wheel", "zoom the slide"],
    ["O", "pull back"],
    ["0", "reset the zoom"],
    ["alt + drag", "move the slide"],
    ["alt + hover", "the grips — resize"],
    ["ctrl + click the camera", "the hero: camera top, wordmark centre (again, ` or the next slide ends it)"],
  ] },
  // THE MAP (2026-09-07). Lee: "we can go swim around for it in the capture window." On a map
  // slide the walk and the camera act on the field: space walks the SHOTS, the wheel and alt-drag
  // roam the field, 0 and O snap to the shot and the bird's-eye. The card keys above still apply
  // to a set card sitting on the map.
  { title: "Map", keys: [
    ["space / shift + space", "next / previous SHOT — off the last shot, the next slide (and back off the first)"],
    ["wheel", "zoom the field about the pointer"],
    ["alt + drag", "pan the field"],
    ["0", "snap back to the shot's camera"],
    ["O", "the bird's-eye — the whole map (O again returns)"],
    ["click A / L / E", "cycle its arrow: ↑ → ↓ → ↑↓ → — (the take only; the map is not changed)"],
  ] },
  { title: "Marks", keys: [
    ["click a choice", "emphasise it — click it again to resolve"],
    ["ctrl + click", "the spotlight — a gold pill (re-click a lit one clears all)"],
    ["ctrl + shift + click", "the super (🔥)"],
    ["ctrl + shift + alt + click", "the siren (🚨)"],
    ["shift + click a word", "highlight it (drag to highlight a run)"],
    ["F1, F1", "draws an arrow — move the mouse between the two presses"],
    ["Delete", "removes the arrow"],
  ] },
  { title: "Take", keys: [
    ["`", "reset the take: emphasis, spotlight, highlights, hero, chrome off (while rehearsing: scratch this slide's take too)"],
    ["H", "hide / show the chrome bar (in the main window: the breadcrumbs too)"],
    ["P", "hide / show the prompter panel"],
    ["F", "fullscreen (in the 9:16 pop-out)"],
    // THE COUNTDOWN + NEXT-SLIDE PREVIEW (2026-09-07). Lee: "a 10 second countdown… like we're on
    // slide 0 at that point… this will help me to see what slide comes next."
    // 2026-09-09: the count is a LEAD-IN and F4 is the trigger. Lee: "the countdown from 10, at 0
    // I hit my recording hotkey F4. Animation begins."
    ["C", "10 s lead-in (in the 9:16 pop-out): the pop-out holds on black + the bolt while it counts, the number shows in the main window · space cancels it"],
    // 2026-09-09, later: F4 no longer jumps to slide 1. Lee: "I press it mid-split and it wrecks
    // the take." C is the key that goes to the top.
    ["F4", "records in OBS. On slide 1 it also assembles the cold open; anywhere else it leaves you where you are."],
    // THE ASSEMBLY COLD OPEN (2026-09-08). Lee: "this is a machine being put together… you're
    // about to get your system shocked. It's like a defibrillator."
    ["—", "the cold open BUILDS ITSELF over 10 s: camera in from the right, the line from the top, the topics left then right, the ticker, and the wordmark landing hard in the watermark corner. Talk over it. Outside the pop-out it plays short (2.2 s) whenever you land on slide 1"],
    ["—", "while the pop-out is open, the main /film window shows the NEXT slide, dimmed (during the countdown: slide 1) — its own space is ignored; the pop-out drives"],
  ] },
  { title: "Rehearsal", keys: [
    ["R", "arm a round · R again while armed cancels · R mid-round finishes it early"],
    ["space", "start the armed round from slide 1 (the clock and dictation start)"],
    // Lee, 2026-09-07: "Start over should give you another round 1."
    ["shift + R", "start over, from any phase: every round's transcript and the times wiped, armed on round 1 (your committed lines stay)"],
    ["`", "scratch this slide's take (this round only)"],
    ["?", "this card"],
  ] },
];

export function HotkeysModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.6)", display: "grid", placeItems: "center", fontFamily: "'Rubik', system-ui, sans-serif" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Keyboard shortcuts"
        style={{ width: "min(720px, 92vw)", maxHeight: "86vh", overflowY: "auto", background: INK, color: CREAM, border: `1px solid ${EDGE}`, borderRadius: 14, padding: "18px 22px 22px", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>Hotkeys</h2>
          <span style={{ fontSize: 11.5, color: MUTED }}>esc or click outside to close</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={{ font: "inherit", fontSize: 12, fontWeight: 700, color: CREAM, background: "transparent", border: `1px solid ${EDGE}`, borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>close</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px 24px", marginTop: 14 }}>
          {HOTKEY_GROUPS.map((g) => (
            <section key={g.title}>
              <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD, marginBottom: 6 }}>{g.title}</div>
              <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "max-content 1fr", gap: "5px 12px", fontSize: 12.5, lineHeight: 1.35 }}>
                {g.keys.map(([key, what]) => (
                  <div key={key + what} style={{ display: "contents" }}>
                    <dt style={{ margin: 0 }}><kbd style={{ font: "inherit", fontSize: 11.5, fontWeight: 700, color: CREAM, background: "rgba(255,255,255,0.06)", border: `1px solid ${EDGE}`, borderRadius: 5, padding: "1px 6px", whiteSpace: "nowrap" }}>{key}</kbd></dt>
                    <dd style={{ margin: 0, color: MUTED }}>{what}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
