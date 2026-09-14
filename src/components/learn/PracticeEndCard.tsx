// THE PRACTICE END SCREEN — the real buttons over a video that ends on a practice slide
// (components/blastoff/practice-cta.ts). The filmed slide says "Practice at surviveaccounting.com" for the
// socials; here, on the site, the player lays the buttons over its last frame.
//
// Lee, 2026-09-14: "[Start Practice →] [Skip practice] surviveaccounting.com. Make Start Practice
// prominent and Skip practice a smaller text link." And on practice first: "[Try Practice Questions]
// surviveaccounting.com. And I'll say, keep watching if you want."
import { PRACTICE_COPY, PRACTICE_DOMAIN, type PracticeVariant } from "@/components/blastoff/practice-cta";

const CREAM = "#F5EFE6", GOLD = "#FCA311", RED = "#EF4B3F";

export function PracticeEndCard({ variant, onPractice, onSkip }: { variant: PracticeVariant; onPractice: () => void; onSkip: () => void }) {
  const c = PRACTICE_COPY[variant];
  return (
    <div role="dialog" aria-label={c.heading} style={{
      position: "absolute", inset: 0, zIndex: 5, display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center",
      padding: "0 8% 12%", gap: 12, background: "linear-gradient(to top, rgba(8,12,26,0.94) 0%, rgba(8,12,26,0.78) 38%, rgba(8,12,26,0) 70%)", color: CREAM,
    }}>
      <button type="button" autoFocus onClick={onPractice} style={{
        width: "100%", maxWidth: 320, padding: "14px 18px", borderRadius: 999, border: 0, cursor: "pointer",
        background: RED, color: "#fff", fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 800, fontSize: 18,
        boxShadow: "0 0 24px rgba(239,75,63,0.45)",
      }}>{c.primary}</button>
      <button type="button" onClick={onSkip} style={{ background: "none", border: 0, cursor: "pointer", color: CREAM, opacity: 0.75, fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 13, fontWeight: 600, textDecoration: "underline", textUnderlineOffset: 3 }}>
        {c.secondary}
      </button>
      <div style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: GOLD }}>{PRACTICE_DOMAIN}</div>
    </div>
  );
}
