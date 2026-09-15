// THE PRACTICE END SCREEN — the real buttons over a video that ends on a practice slide
// (components/blastoff/practice-cta.ts). The filmed slide says "Practice at surviveaccounting.com" for the
// socials; here, on the site, the player lays the buttons over its last frame.
//
// Lee, 2026-09-14: "[Start Practice →] [Skip practice] surviveaccounting.com. Make Start Practice
// prominent and Skip practice a smaller text link." And on practice first: "[Try Practice Questions]
// surviveaccounting.com. And I'll say, keep watching if you want."
import { useEffect, useRef, useState } from "react";

import { PRACTICE_COPY, PRACTICE_DOMAIN, type PracticeVariant } from "@/components/blastoff/practice-cta";

const CREAM = "#F5EFE6", GOLD = "#FCA311", RED = "#EF4B3F";

export function PracticeEndCard({ variant, onPractice, onSkip, countdown }: {
  variant: PracticeVariant; onPractice: () => void; onSkip: () => void;
  /** Seconds the offer stands before the next video rolls on its own (Lee, 2026-09-15: "let the button sit on
   *  screen for a couple of seconds with the electricity on it … even do like a countdown from 5"). */
  countdown?: number;
}) {
  const c = PRACTICE_COPY[variant];
  const [left, setLeft] = useState(countdown ?? 0);
  const skip = useRef(onSkip); skip.current = onSkip;
  useEffect(() => {
    if (!countdown) return;
    setLeft(countdown);
    const t = window.setInterval(() => setLeft((n) => {
      if (n <= 1) { window.clearInterval(t); skip.current(); return 0; }
      return n - 1;
    }), 1000);
    return () => window.clearInterval(t);
  }, [countdown]);
  return (
    <div role="dialog" aria-label={c.heading} style={{
      position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
      padding: "0 8% 12%", gap: 12, background: "linear-gradient(to top, rgba(8,12,26,0.94) 0%, rgba(8,12,26,0.78) 38%, rgba(8,12,26,0) 70%)", color: CREAM,
    }}>
      <style>{CHARGE_CSS}</style>
      <button type="button" autoFocus onClick={onPractice} className="sa-pec-charged" style={{
        position: "relative", width: "100%", maxWidth: 320, padding: "14px 18px", borderRadius: 999, border: 0, cursor: "pointer",
        background: RED, color: "#fff", fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 800, fontSize: 18,
      }}>{c.primary}{countdown && left > 0 ? <span style={{ marginLeft: 8, opacity: 0.85, fontVariantNumeric: "tabular-nums" }}>{left}</span> : null}</button>
      <button type="button" onClick={onSkip} style={{ background: "none", border: 0, cursor: "pointer", color: CREAM, opacity: 0.75, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 13, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {c.secondary}
      </button>
      <div style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: GOLD }}>{PRACTICE_DOMAIN}</div>
    </div>
  );
}

// The bolt''s charge, on the button: a breathing arc and a glow (the same electric look as the outro).
const CHARGE_CSS = `
@keyframes sa-pec-glow { 0%,100% { box-shadow: 0 0 0 2px rgba(140,215,255,.55), 0 0 22px 4px rgba(239,75,63,.45); } 50% { box-shadow: 0 0 0 2px rgba(215,245,255,.95), 0 0 36px 10px rgba(239,75,63,.6); } }
@keyframes sa-pec-sweep { to { transform: translateX(120%); } }
.sa-pec-charged { animation: sa-pec-glow 2.1s ease-in-out infinite; overflow: hidden; }
.sa-pec-charged::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(180,230,255,.55), transparent); transform: translateX(-120%); animation: sa-pec-sweep 2.1s ease-in-out infinite; pointer-events: none; }
.sa-pec-charged:hover { animation-duration: .5s; }
@media (prefers-reduced-motion: reduce) { .sa-pec-charged, .sa-pec-charged::after { animation: none; } }
`;