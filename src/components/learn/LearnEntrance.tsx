// THE HERO (redesign, 2026-09-11 — docs/LEARN-REDESIGN-PROPOSAL-2026-09-11.md §2). Centred on
// every tier:
//
//                        Like Reels for exam prep.
//                Cram what's on your exam. Skip everything else.
//                            [ Get started ]
//                           ~2.4 min per video
//
// One button. "Get started" opens the first playable video, or — with nothing playable yet —
// scrolls to the first row and outlines it once, so the click always lands somewhere visible.
// The caption is averageVideoCaption over the exam's timed sets (learn-gate.ts) and is simply
// absent until a runtime exists — a real number or none. "See what's on the exam" is gone, and so
// is the meta row: the navbar (LearnTop) carries the bolt, the campus, the course and the exam.
//
// The display face and the button are the home page's tokens (learn-theme: DISPLAY = BRAND_DISPLAY,
// .lk-btn-cta = the door button's geometry). Copy rule: no "run" / "blast" / "pledge", no emoji.
import { LK, SANS } from "@/components/learn/learn-theme";
import type { Tier } from "@/components/learn/use-tier";

export function LearnEntrance({ tier, averageCaption, onStart }: {
  tier: Tier;
  /** "~2.4 min per video" from learn-gate's averageVideoCaption, or null when nothing has a runtime. */
  averageCaption: string | null;
  onStart: () => void;
}) {
  const narrow = tier === "narrow";
  const wide = tier === "wide";
  const displaySize = narrow ? 30 : wide ? 48 : 38;
  return (
    <section aria-label="Welcome" className="flex flex-col items-center text-center" style={{ gap: narrow ? 10 : 14, paddingTop: narrow ? 18 : wide ? 44 : 30, paddingBottom: narrow ? 6 : wide ? 16 : 8 }}>
      <h1 className="lk-disp" style={{ margin: 0, fontSize: displaySize, lineHeight: 1.05, letterSpacing: "-0.015em", color: LK.text, textWrap: "balance", maxWidth: 720 }}>
        Like <span style={{ color: LK.acc }}>Reels</span> for exam prep.
      </h1>
      <p style={{ margin: 0, fontSize: narrow ? 15 : 18, lineHeight: 1.45, color: LK.muted, fontFamily: SANS, maxWidth: 560, textWrap: "balance" }}>
        Cram what's on your exam. Skip everything else.
      </p>
      <div className="flex flex-col items-center" style={{ gap: 8, marginTop: narrow ? 6 : 10 }}>
        <button type="button" onClick={onStart} className="lk-btn-cta" style={{ minWidth: narrow ? 220 : 240, boxShadow: "0 12px 30px -10px rgba(0,0,0,0.8)" }}>
          Get started
        </button>
        {averageCaption && (
          <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 600, color: LK.muted, fontFamily: SANS }}>{averageCaption}</span>
        )}
      </div>
    </section>
  );
}
