// THE BIG CALLOUT — a Memorize this / Cheat code / Deep question / Tricky slide drawn as the
// WHOLE 9:16 frame instead of as a card on a stage.
//
// Lee (2026-09-08, a film blocker): "I want a way to have a memorize this, cheat code slide,
// deep ideas, tricky in two formats… either it's in the current format, or it's more emphatic
// where it's a slide just like the slogan one. Bolt in background. BIG letters. Same style as
// that. So I add the slide then choose the mode. The reason is that some of my slides are so
// short that they can fill up the whole screen. Other times it will be better to have current
// version then illustration."
//
// So this is deliberately the SLOGAN CARD's treatment, not a new look: black, the house bolt
// alive behind at low intensity, one line of type as big as the frame will take, the same rise
// on arrival and the same single bolt pulse. The differences are the two things a callout has
// and a slogan does not — the KIND CHIP (a cheat code has to announce that it is one) and the
// BULLETS under the heading — and both are sized down from the heading so the heading stays the
// slide. When there is nothing but a heading, this is a slogan card that happens to say
// "CHEAT CODE" at the top, which is exactly what Lee described.
//
// The same house rules as SloganCard, for the same reasons: one bolt per card and it is the
// house bolt; a still render mounts no animation at all and pins the boil; the type stops above
// the burned-caption rail; no wordmark (PhoneFrame owns the corner mark — and unlike the brand
// cards this slide KEEPS it, because a cheat code is content in the middle of a rip, not a
// brand card standing in for the logo).
import { CONTENT_BOTTOM, SAFE } from "@/components/blastoff/layout";

import { renderInline } from "@/components/canvas/inline-md";

import { BoltBoil } from "./bolt-boil";

const HEAD_FONT = "'League Spartan', 'Rubik', system-ui, sans-serif";
const BODY_FONT = "'Rubik', system-ui, sans-serif";
const WHITE = "#FFFFFF";

/** Matched to SloganCard's, so the two read as one family when they sit next to each other. */
const BOLT_OPACITY = 0.13;

const BIG_CSS = `
@keyframes sa-bigc-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0px); } }
@keyframes sa-bigc-charge { 0% { opacity: ${BOLT_OPACITY * 0.4}; transform: scale(0.9); } 45% { opacity: ${BOLT_OPACITY * 2}; transform: scale(1.06); } 100% { opacity: ${BOLT_OPACITY}; transform: scale(1); } }
.sa-bigc-rise { animation: sa-bigc-rise 620ms cubic-bezier(0.22, 1, 0.36, 1) both; }
.sa-bigc-bullets { animation: sa-bigc-rise 620ms cubic-bezier(0.22, 1, 0.36, 1) 240ms both; }
.sa-bigc-charge { animation: sa-bigc-charge 1150ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .sa-bigc-rise, .sa-bigc-bullets, .sa-bigc-charge { animation: none; } }
`;

/** THE HEADING'S SIZE, as px, from the frame height.
 *
 *  The whole reason this mode exists is Lee's: "some of my slides are so short that they can
 *  fill up the whole screen." So a three-word heading goes enormous and a long one steps down,
 *  measured against a reference length rather than a fixed scale — the same idea as
 *  slogans.sloganSize, kept separate because a callout's frame is shared with a chip and a
 *  bullet list and the caps have to be lower.
 *
 *  Three things take room away from the heading, and each lowers the cap: a bullet list under
 *  it, a picture above it, and simply having more words. Pure and clamped — never past the cap,
 *  never under the floor, so no combination of inputs can produce type that overflows the band
 *  or type too small to read at phone size. */
/** THE HEADING'S CAP per configuration, as a fraction of the frame's height. Every one of them
 *  went up on 2026-09-12: the band used to stop at the caption rail (.61h) and now runs to the
 *  content floor, so the same words can be set bigger. */
export const BIG_CALLOUT_CAP = { plain: 0.108, bullets: 0.08, bullets3: 0.066, art: 0.058 } as const;

export function bigCalloutSize(h: number, text: string, opts: { bullets?: number; art?: boolean } = {}): number {
  const bullets = Math.max(0, opts.bullets ?? 0);
  const art = !!opts.art;
  // The cap: how big the shortest heading is allowed to go in this configuration.
  const cap = art ? BIG_CALLOUT_CAP.art : bullets >= 3 ? BIG_CALLOUT_CAP.bullets3 : bullets > 0 ? BIG_CALLOUT_CAP.bullets : BIG_CALLOUT_CAP.plain;
  const floor = art ? 0.03 : 0.032;
  // 28 characters is about the longest line that still reads as ONE statement on a phone; past
  // that the heading is a sentence and steps down toward the floor.
  const n = Math.max(1, text.trim().length);
  const k = Math.min(1, Math.sqrt(28 / n));
  return Math.round(h * Math.min(cap, Math.max(floor, cap * k)));
}

/** The band the words live in, as fractions of the height — the counterpart of
 *  SloganCard.sloganBand, and both run to the content floor since 2026-09-12. With a picture the
 *  words take the strip beneath it; without one they own the frame and sit optically above centre. */
export function bigCalloutBand(art: boolean): { top: number; bottom: number } {
  return { top: art ? 0.43 : 0.18, bottom: CONTENT_BOTTOM - 0.02 };
}

export function BigCallout({ w, h, label, accent, text, bullets = [], art = false, live = true, style }: {
  /** The frame this fills, in px. */
  w: number; h: number;
  /** "CHEAT CODE", "MEMORIZE THIS", "TRICKY", "DEEP QUESTION" — the callout's own chip words. */
  label: string;
  /** The kind's accent, from the one place callout colours live (canvas/cards/CalloutCard). */
  accent: string;
  /** The heading — the whole point of the slide. */
  text: string;
  /** The lines under it, if any. */
  bullets?: string[];
  /** This slide carries an illustration — everything moves down under it and steps smaller. */
  art?: boolean;
  /** false = a still render: no animation anywhere, the boil pinned. */
  live?: boolean;
  style?: React.CSSProperties;
}) {
  const words = text.trim();
  const lines = bullets.map((b) => b.trim()).filter(Boolean);
  const size = bigCalloutSize(h, words, { bullets: lines.length, art });
  const band = bigCalloutBand(art);
  const maxWidth = Math.round(w * (SAFE.right - SAFE.left));
  // The chip and the bullets are both derived from the heading's size, so the whole block scales
  // as one thing — a short heading gets a bigger chip and bigger bullets, which is right: the
  // slide is emptier, so everything on it can breathe.
  const chipSize = Math.max(11, Math.round(size * 0.2));
  const bulletSize = Math.max(13, Math.round(size * 0.34));

  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden", background: "#000", ...style }}>
      {live && <style>{BIG_CSS}</style>}
      {/* THE BOLT, BEHIND — the house bolt at low intensity, one pulse on arrival. */}
      <div className={live ? "sa-bigc-charge" : undefined} aria-hidden
        style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: BOLT_OPACITY, pointerEvents: "none" }}>
        <BoltBoil height={Math.round(h * 0.46)} boilSeconds={1.2} boilFrame={live ? undefined : 0} />
      </div>

      <div style={{
        position: "absolute", left: 0, right: 0, top: Math.round(h * band.top), height: Math.round(h * (band.bottom - band.top)),
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: Math.round(size * 0.28), padding: `0 ${Math.round(w * SAFE.left)}px`, pointerEvents: "none",
      }}>
        {/* THE CHIP — the callout's own accent and words, so a big cheat code still says it is
            one. Same shape as the card's KindChip; drawn here rather than imported because
            brand-cards must not reach into the canvas's card components. */}
        <div className={live ? "sa-bigc-rise" : undefined}>
          <span style={{
            display: "inline-flex", padding: `${Math.round(chipSize * 0.3)}px ${Math.round(chipSize * 0.85)}px`,
            borderRadius: Math.round(chipSize * 0.45), fontFamily: BODY_FONT, fontSize: chipSize, fontWeight: 900,
            letterSpacing: "0.16em", textTransform: "uppercase", lineHeight: 1.15,
            color: accent, background: `${accent}24`, border: `1px solid ${accent}66`,
          }}>{label}</span>
        </div>

        {/* THE HEADING. Pure white, lifted off the black by a contact edge + a near shadow + a
            wide ambient rather than a glow — the three stages GlowWordmark uses, because a
            single soft glow is the first thing H.264 smears. */}
        <div className={live ? "sa-bigc-rise" : undefined} style={{
          fontFamily: HEAD_FONT, fontWeight: 900, fontSize: size, lineHeight: 0.98, letterSpacing: "-0.015em",
          color: WHITE, textAlign: "center", maxWidth, textWrap: "balance" as never,
          textShadow: `0 ${Math.max(1, Math.round(size * 0.012))}px 0 rgba(0,0,0,0.55), 0 ${Math.round(size * 0.03)}px ${Math.round(size * 0.05)}px rgba(0,0,0,0.5), 0 ${Math.round(size * 0.09)}px ${Math.round(size * 0.2)}px rgba(0,0,0,0.4)`,
          // LINE BREAKS (2026-09-11): a new line typed in the heading (Shift+Enter) stays a new line.
          whiteSpace: "pre-line",
        }}>
          {/* THE MARKERS WORK HERE TOO (2026-09-09). Lee: "When I'm editing text, I have == ==
              to highlight. Be sure this applies to the big format for a callout too." The big
              format was rendering the raw string, so a ==highlight== he typed on a card and then
              switched to Big showed its own equals signs on camera. Same renderer as the card
              (canvas/inline-md), with the highlight tuned for white-on-black: the card's amber
              wash on cream paper is unreadable here, so the mark carries the gold and the ink
              stays white. */}
          {renderInline(words, { bg: "rgba(252,163,17,0.30)", color: WHITE })}
        </div>

        {/* THE LINES UNDER IT — a beat later than the heading, so the eye takes the statement
            first. Centred like everything else on this slide; the card format is the one that
            reads as a list. */}
        {lines.length > 0 && (
          <div className={live ? "sa-bigc-bullets" : undefined} style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(bulletSize * 0.42),
            maxWidth, fontFamily: BODY_FONT, fontSize: bulletSize, fontWeight: 600, lineHeight: 1.25,
            color: "rgba(245,239,230,0.86)", textAlign: "center", textWrap: "balance" as never,
          }}>
            {lines.map((l, i) => <div key={i}>{renderInline(l, { bg: "rgba(252,163,17,0.30)", color: WHITE })}</div>)}
          </div>
        )}
      </div>
    </div>
  );
}
