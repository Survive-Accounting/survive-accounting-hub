// THE BREATHER CARD — one recap beat between two videos (lib/breathers.ts). The same component the
// student player shows and the authoring view previews, so the preview is exactly what students see.
//
// Navy ground, cream type, League Spartan heading, Rubik body, gold for the position; the boiling
// bolt is the visual (the existing BoltBoil, not a new loader). A thin gold line runs the time down;
// any tap skips. Under reduced motion the bolt holds still and the line doesn't animate.
import { useEffect, useState } from "react";

import { BoltBoil } from "@/components/brand-cards/bolt-boil";
import { BREATHER_MS } from "@/lib/breathers";

const NAVY = "#14213D", CREAM = "#F5EFE6", GOLD = "#FCA311";

const CSS = `
@keyframes br-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes br-run { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.br-card { animation: br-in 220ms ease-out; }
.br-run { transform-origin: left; animation: br-run var(--br-ms) linear forwards; }
@media (prefers-reduced-motion: reduce) { .br-card { animation: none; } .br-run { animation: none; } }
`;

export function BreatherCard({ heading, body, position, onDone, preview = false, ms = BREATHER_MS }: {
  heading: string;
  body: string;
  /** "3 of 14" — the video just watched. */
  position: string;
  /** Time's up or tapped. Absent in the static preview. */
  onDone?: () => void;
  /** The authoring preview: no timer, loops the countdown line. */
  preview?: boolean;
  ms?: number;
}) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => { setReduced(!!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches); }, []);
  useEffect(() => {
    if (preview || !onDone) return;
    const t = window.setTimeout(onDone, ms);
    return () => window.clearTimeout(t);
  }, [preview, onDone, ms]);

  return (
    <div role="status" aria-live="polite" onClick={onDone} className="br-card" style={{
      position: "absolute", inset: 0, zIndex: 5, background: NAVY, color: CREAM, cursor: onDone ? "pointer" : "default",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 9%",
      ["--br-ms" as string]: `${ms}ms`,
    }}>
      <style>{CSS}</style>
      <div style={{ lineHeight: 0, marginBottom: 18 }}>
        <BoltBoil height={64} boilSeconds={reduced ? 0 : 1.2} />
      </div>
      <div style={{ fontFamily: "'League Spartan', 'Rubik', system-ui, sans-serif", fontWeight: 800, fontSize: 15, letterSpacing: "0.14em", textTransform: "uppercase", color: GOLD }}>
        {heading}
      </div>
      <div style={{ marginTop: 12, fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 700, fontSize: "clamp(20px, 5.4cqw, 28px)", lineHeight: 1.25, maxWidth: 420, textWrap: "balance" as never }}>
        {body || <span style={{ opacity: 0.4 }}>Your takeaway goes here</span>}
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 20px 22px", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
        <div style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontSize: 12, fontWeight: 600, color: CREAM, opacity: 0.6 }}>
          {position} · tap to skip
        </div>
        <div style={{ width: "100%", maxWidth: 260, height: 3, borderRadius: 2, background: "rgba(245,239,230,0.14)", overflow: "hidden" }}>
          <div key={preview ? "p" : "run"} className={reduced ? undefined : "br-run"} style={{ height: "100%", background: GOLD, animationIterationCount: preview ? "infinite" : 1 }} />
        </div>
      </div>
    </div>
  );
}
