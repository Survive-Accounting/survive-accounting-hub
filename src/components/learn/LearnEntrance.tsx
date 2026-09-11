// THE HERO (redesign, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md §2). Centred on
// every tier:
//
//                        Like Reels for exam prep.
//                Cram what's on your exam. Skip everything else.
//                       [ Start cramming for free ]
//                           ~2.4 min per video
//
// One button. "Start cramming for free" (the polish brief, 09-11 — was "Get started") opens the
// first playable video through the existing mechanism, or — with nothing playable yet — scrolls to
// Easy Points, focuses its first card and outlines the row once, so the click always lands.
//
// THE PANEL (the polish brief, 09-11: "The hero currently feels slightly bare floating on the cream
// background … a subtle contained hero treatment"): a rounded panel one step lighter than the
// canvas, a hairline border, the room's soft shadow, a campus-colour radial glow in two corners
// at low opacity and the real bolt (canvas/brand's BOLT_OUTER) as a faint watermark — CSS and the
// brand path only, no image. Padding is tighter than before so Easy Points starts higher.
// The caption is averageVideoCaption over the exam's timed sets (learn-gate.ts) and is simply
// absent until a runtime exists — a real number or none. "See what's on the exam" is gone, and so
// is the meta row: the navbar (LearnTop) carries the bolt, the campus, the course and the exam.
//
// THE HERO GROUND (2026-09-11): the entrance paints with --lk-hero-* — the canvas's own values in
// every look but "split", where LearnHome puts this section on a full-bleed navy band above the
// cream rows. Same JSX, one more set of variables.
//
// The display face and the button are the home page's tokens (learn-theme: DISPLAY = BRAND_DISPLAY,
// .lk-btn-cta = the door button's geometry). Copy rule: no "run" / "blast" / "pledge", no emoji.
import { BOLT_OUTER, BOLT_VIEWBOX } from "@/components/canvas/brand";
import { LK, SANS } from "@/components/learn/learn-theme";
import type { Tier } from "@/components/learn/use-tier";

export const HERO_CSS = `
.lk-hero { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; border-radius: 22px; border: 1px solid var(--lk-border); background: color-mix(in srgb, var(--lk-surface) 72%, var(--lk-hero-bg)); box-shadow: var(--lk-shadow); }
.lk-hero > * { position: relative; }
.lk-hero-glow { position: absolute; width: 380px; height: 380px; border-radius: 999px; pointer-events: none; background: radial-gradient(circle, color-mix(in srgb, var(--lk-acc) 16%, transparent), transparent 62%); }
.lk-hero-glow[data-corner="tl"] { left: -140px; top: -180px; }
.lk-hero-glow[data-corner="br"] { right: -150px; bottom: -200px; }
.lk-hero-mark { position: absolute; right: 3%; top: -12%; height: 124%; width: auto; color: var(--lk-acc); opacity: .055; transform: rotate(9deg); pointer-events: none; }
@media (prefers-reduced-motion: no-preference) { .lk-hero .lk-btn-cta { transition: transform 160ms ease, box-shadow 160ms ease; } }
`;

export function LearnEntrance({ tier, averageCaption, onStart }: {
  tier: Tier;
  /** "~2.4 min per video" from learn-gate's averageVideoCaption, or null when nothing has a runtime. */
  averageCaption: string | null;
  onStart: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const displaySize = narrow ? 29 : wide ? 42 : 34;
  return (
    <section aria-label="Welcome" className="lk-hero" data-tier={tier} style={{ gap: narrow ? 8 : 10, padding: narrow ? "22px 16px 20px" : wide ? "30px 32px 28px" : "26px 24px 24px" }}>
      <style>{HERO_CSS}</style>
      <span aria-hidden className="lk-hero-glow" data-corner="tl" />
      <span aria-hidden className="lk-hero-glow" data-corner="br" />
      <svg aria-hidden className="lk-hero-mark" viewBox={BOLT_VIEWBOX} focusable="false"><path d={BOLT_OUTER} fill="currentColor" /></svg>
      <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.05, letterSpacing: "-0.015em", color: LK.heroText, textWrap: "balance", maxWidth: 720 }}>
        Like <span style={{ color: LK.acc }}>Reels</span> for exam prep.
      </h1>
      <p style={{ margin: 0, fontSize: narrow ? 15 : 17, lineHeight: 1.45, color: LK.heroMuted, fontFamily: SANS, maxWidth: 560, textWrap: "balance" }}>
        Cram what's on your exam. Skip everything else.
      </p>
      <div className="flex flex-col items-center" style={{ gap: 6, marginTop: narrow ? 4 : 6 }}>
        <button type="button" onClick={onStart} className="lk-btn-cta" style={{ minWidth: narrow ? 240 : 260, boxShadow: LK.shadow }}>
          Start cramming for free
        </button>
        {averageCaption && (
          <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: LK.heroMuted, fontFamily: SANS }}>{averageCaption}</span>
        )}
      </div>
    </section>
  );
}
