// OUTRO CARD — "survive" wordmark (dominant) + tagline + url, vertically stacked & centered.
// The tagline is the payoff, so it (and the url) fade up in a stagger; the bolt boils
// throughout. 1920x1080, transparent-capable. React only. Hold ~2.5s.
import { Stage, SurviveWordmark, BRAND_CREAM } from "./bolt-boil";

const WORD = 230; // cap-height px

const OUTRO_CSS = `
@keyframes sa-outro-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
.sa-outro-tag { opacity: 0; animation: sa-outro-up 200ms cubic-bezier(0.2,0.7,0.3,1) 140ms both; }
.sa-outro-url-in { opacity: 0; animation: sa-outro-up 180ms cubic-bezier(0.2,0.7,0.3,1) 420ms both; }
@media (prefers-reduced-motion: reduce) { .sa-outro-tag, .sa-outro-url-in { animation: none; opacity: 1; } }`;

export function OutroCard({ tagline = "Only what’s on your exam.", scale = 1, transparent = false, playKey = 0 }:
  { tagline?: string; scale?: number; transparent?: boolean; playKey?: number }) {
  return (
    <Stage scale={scale} transparent={transparent}>
      <style>{OUTRO_CSS}</style>
      <div key={playKey} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", fontFamily: "'Rubik', system-ui, sans-serif" }}>
        <SurviveWordmark size={WORD} />
        <div className="sa-outro-tag" style={{ marginTop: 48, fontWeight: 600, fontSize: Math.round(WORD * 0.28), color: BRAND_CREAM, lineHeight: 1 }}>{tagline}</div>
        <div style={{ marginTop: 24, opacity: 0.6 }}>
          <div className="sa-outro-url-in" style={{ fontWeight: 600, fontSize: Math.round(WORD * 0.18), color: BRAND_CREAM, letterSpacing: "0.01em", lineHeight: 1 }}>surviveaccounting.com</div>
        </div>
      </div>
    </Stage>
  );
}
