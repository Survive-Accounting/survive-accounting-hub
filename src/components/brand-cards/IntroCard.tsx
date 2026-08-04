// INTRO CARD — "survive" wordmark (dominant) + a chapter plate. NO tagline, NO url (that's
// the outro's payoff). Entrance: a single white flash on the bolt, the wordmark SNAPS in
// from 0.94, then the plate wipes in. 1920x1080, transparent-capable. React only. ~1.2s.
import { Stage, SurviveWordmark, BRAND_CREAM } from "./bolt-boil";

const WORD = 230;

const INTRO_CSS = `
@keyframes sa-intro-snap { from { transform: scale(0.94); } to { transform: scale(1); } }
@keyframes sa-intro-flash { 0% { opacity: 0; } 10% { opacity: 0.95; } 100% { opacity: 0; } }
@keyframes sa-intro-wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
.sa-intro-word { animation: sa-intro-snap 120ms cubic-bezier(0.2,0,0,1) both; }
.sa-intro-flash { position: absolute; inset: -6% -3%; background: radial-gradient(closest-side, #FFFFFF, rgba(255,255,255,0)); pointer-events: none; opacity: 0; animation: sa-intro-flash 140ms steps(2, jump-none) both; }
.sa-intro-plate { animation: sa-intro-wipe 80ms ease-out 120ms both; }
@media (prefers-reduced-motion: reduce) {
  .sa-intro-word, .sa-intro-plate { animation: none; }
  .sa-intro-flash { display: none; }
}`;

export function IntroCard({ chapter = "1", title = "Chapter Title", scale = 1, transparent = false, playKey = 0 }:
  { chapter?: string; title?: string; scale?: number; transparent?: boolean; playKey?: number }) {
  return (
    <Stage scale={scale} transparent={transparent}>
      <style>{INTRO_CSS}</style>
      <div key={playKey} style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <div className="sa-intro-word" style={{ position: "relative" }}>
          <SurviveWordmark size={WORD} />
          <div className="sa-intro-flash" />
        </div>
        <div className="sa-intro-plate" style={{ marginTop: 32, padding: "10px 24px", border: "2px solid rgba(245,239,230,0.28)", borderRadius: 6, color: "#B9C3D8", fontFamily: "'Space Grotesk', ui-monospace, monospace", fontWeight: 700, fontSize: Math.round(WORD * 0.2), letterSpacing: "0.18em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          CH. {chapter} &mdash; {title.toUpperCase()}
        </div>
      </div>
    </Stage>
  );
}
