// THE SLOGAN SLIDE — the whole 9:16 frame: black, the bolt alive behind it, one line of Lee's
// set as big as the frame will take.
//
// Lee (2026-09-08): "I think main thing I'm wanting is more slides to use that captured the
// best stuff I've discussed recently." Then: "do the three slogan slides. B to an A is the
// picture, yes. Others just text." And on the third one: "That slogan just fucking rocks… I
// will say it word for word in outros." The words themselves are NEVER typed here — they come
// from slogans.ts, the one place the slide, the spoken line and anything later all read.
//
// THE RULES IT OBEYS, same as every other card in this folder:
//  · ONE BOLT PER CARD, and it is the house bolt (BoltBoil) — nothing new is drawn. Here it is
//    the backdrop rather than the "i", so it is dimmed right down: the words are the slide.
//  · A STILL RENDER NEVER ANIMATES. `live={false}` mounts no animation classes at all and pins
//    the boil to frame 0 — Review previews and thumbnails rely on that.
//  · NO WORDMARK. PhoneFrame owns the corner watermark; a second mark here would be two logos.
//  · prefers-reduced-motion: no travel.
//
// WHERE THE TYPE STOPS. The burned captions have one fixed band on every slide
// (blastoff/layout.ts CAPTION_RAIL) and the slogan has to stay off it, so the words end just
// above it — and with a picture, they sit in the band between the picture and the rail.
// That band is imported rather than copied: "Change a number here and all three follow" is the
// whole point of that module, and a 0.61 typed into a brand card would drift out of it the
// first time the rail moves. (This is the only place brand-cards reaches into blastoff/, and
// layout.ts is pure geometry — no React, no cycle back.)
import { CAPTION_RAIL, SAFE } from "@/components/blastoff/layout";

import { BoltBoil } from "./bolt-boil";
import { sloganSize } from "./slogans";

const HEAD_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";
const WHITE = "#FFFFFF";

/** How faint the bolt sits behind the words. Low enough that white type on black stays the
 *  whole subject, high enough that the frame is never a dead black rectangle. It is also the
 *  pulse's resting value, so the animation lands exactly on the still one — hence the CSS
 *  below being built from this number rather than repeating it. */
const BOLT_OPACITY = 0.13;

/** THE ONE MOTION BEAT. The words rise in — the same 18 px lift and fade every secondary line
 *  in the vertical family gets (blastoff/stage.tsx `riseIn`, restated here because brand-cards
 *  does not import blastoff components) — and the bolt behind them pulses ONCE and settles back
 *  to rest. Both `both`-filled, so the end state holds for the rest of the slide; neither loops,
 *  because a slogan is a two-second beat, not a backdrop. */
const SLOGAN_CSS = `
@keyframes sa-slogan-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0px); } }
@keyframes sa-slogan-charge { 0% { opacity: ${BOLT_OPACITY * 0.4}; transform: scale(0.9); } 45% { opacity: ${BOLT_OPACITY * 2}; transform: scale(1.06); } 100% { opacity: ${BOLT_OPACITY}; transform: scale(1); } }
.sa-slogan-rise { animation: sa-slogan-rise 620ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.sa-slogan-charge { animation: sa-slogan-charge 1150ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .sa-slogan-rise, .sa-slogan-charge { animation: none; } }
`;

/** THE WORDS' BAND, as fractions of the height. Without a picture the words own the frame and
 *  sit optically above centre (a block from .20 h to .60 h reads as centred at this size, where
 *  a true centre reads low); with one they take the strip between the picture and the caption
 *  rail — .43 h to .60 h, which holds three lines at the picture-sized type (sloganSize's `art`
 *  cap) with room to spare. The picture itself is NOT drawn here — PhoneFrame mounts it as its
 *  own layer at illustration.ts `defaultPlacement("slogan")`, whose bottom edge lands at ≈ .41 h
 *  — which is why this band is a fixed number rather than a measurement. */
export function sloganBand(art: boolean): { top: number; bottom: number } {
  return { top: art ? 0.43 : 0.2, bottom: CAPTION_RAIL.top - 0.01 };
}

export function SloganCard({ w, h, text, art = false, live = true, style }: {
  /** The frame this fills, in px. */
  w: number; h: number;
  /** The slogan, verbatim (frame.text). */
  text: string;
  /** This slide carries an illustration — the words move down under it and step smaller. */
  art?: boolean;
  /** false = a still render: no animation anywhere, the boil pinned. */
  live?: boolean;
  style?: React.CSSProperties;
}) {
  const words = text.trim();
  const size = sloganSize(h, words, art);
  const band = sloganBand(art);
  // Never wider than the Shorts safe column, and centred on the frame the way the intro's topic
  // line is — a slogan is a brand card and has to read centred; `textWrap: balance` keeps the
  // lines even instead of leaving one orphan word on the last line.
  const maxWidth = Math.round(w * (SAFE.right - SAFE.left));
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", ...style }}>
      {live && <style>{SLOGAN_CSS}</style>}
      {/* THE BOLT, BEHIND — the house bolt at low intensity, one pulse on arrival. Pinned to a
          single boil frame when still, so a thumbnail is the same pixels every time. */}
      <div className={live ? "sa-slogan-charge" : undefined} aria-hidden
        style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: BOLT_OPACITY, pointerEvents: "none" }}>
        <BoltBoil height={Math.round(h * 0.46)} boilSeconds={1.2} boilFrame={live ? undefined : 0} />
      </div>

      {/* THE WORDS. Pure white, lifted off the black by a contact edge + a near shadow + a wide
          ambient rather than by a glow — the same three stages GlowWordmark uses, for the same
          reason: a single soft glow is the first thing H.264 smears. */}
      <div className={live ? "sa-slogan-rise" : undefined}
        style={{
          position: "absolute", left: 0, right: 0, top: Math.round(h * band.top), height: Math.round(h * (band.bottom - band.top)),
          display: "grid", placeItems: "center", padding: `0 ${Math.round(w * SAFE.left)}px`, pointerEvents: "none",
        }}>
        <div style={{
          fontFamily: HEAD_FONT, fontWeight: 900, fontSize: size, lineHeight: 0.98, letterSpacing: "-0.015em",
          color: WHITE, textAlign: "center", maxWidth, textWrap: "balance" as never,
          textShadow: `0 ${Math.max(1, Math.round(size * 0.012))}px 0 rgba(0,0,0,0.55), 0 ${Math.round(size * 0.03)}px ${Math.round(size * 0.05)}px rgba(0,0,0,0.5), 0 ${Math.round(size * 0.09)}px ${Math.round(size * 0.2)}px rgba(0,0,0,0.4)`,
        }}>
          {words}
        </div>
      </div>
    </div>
  );
}
