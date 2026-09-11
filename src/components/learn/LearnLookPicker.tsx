// THE LOOK PICKER (Lee, 2026-09-11: "give me a bunch of possible options to try with ?look=. I
// want to pick only the best one"). Mounted only when ?looks=1 is in the address — a floating
// strip, bottom-left, one chip per look in learn-theme's LOOK_ORDER, the live one filled with the
// room's accent, the look's one-line "why it might win" under the row. A click rewrites ?look=
// (the route's pickLook), so every look is flipped through on one page with a school picked and
// nothing else in the address changes. Chips only — an arrow-key shortcut was tried and dropped
// the same night (the look advanced on its own while the pane was driven; no keyboard shortcut,
// no mystery). Not a student surface: it never renders without the flag, and it is unmounted the
// day Lee picks.
import { BRAND_SANS } from "@/components/canvas/brand";
import { LK, LOOK_NOTES, LOOK_ORDER, type Look } from "@/components/learn/learn-theme";

export function LearnLookPicker({ look, onPick }: { look: Look; onPick: (look: Look) => void }) {
  return (
    <div role="group" aria-label="Look" className="fixed bottom-4 left-4 z-[130] flex flex-col" style={{ gap: 6, padding: "10px 12px", borderRadius: 14, background: LK.surface, border: `1px solid ${LK.border}`, boxShadow: LK.shadow, color: LK.text, fontFamily: BRAND_SANS, maxWidth: "min(92vw, 520px)" }}>
      <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: LK.muted, marginRight: 4 }}>Look</span>
        {LOOK_ORDER.map((k) => {
          const on = k === look;
          return (
            <button key={k} type="button" onClick={() => onPick(k)} aria-pressed={on} className="lk-chip" style={{ minHeight: 30, padding: "0 11px", fontSize: 12.5, background: on ? LK.acc : LK.surface2, color: on ? LK.accInk : LK.text, border: `1px solid ${on ? LK.acc : LK.border}` }}>
              {k}
            </button>
          );
        })}
      </div>
      <span style={{ fontSize: 12, lineHeight: 1.35, color: LK.muted }}>{LOOK_NOTES[look]}</span>
    </div>
  );
}
