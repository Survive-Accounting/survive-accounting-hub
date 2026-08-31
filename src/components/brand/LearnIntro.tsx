// LEARN INTRO — the REAL wordmark (surv⚡ve, bolt boiling — same mark as the homepage footer)
// full screen for a beat with "Loading cram videos..." beneath, then it fades and you're in the
// dashboard. A boot splash, not a performance: it shows on every arrival, covers the moment the
// student tree is actually loading, and stays SHORT.
//
// (The hand-drawn stroke-on wordmark that used to live here was rejected 2026-08-31 — see
// docs/BRAND-ANIMATION.md. The boil IS the brand animation.)
//
// prefers-reduced-motion never shows it: those students get their course list immediately.
// A click skips it early.
import { useEffect, useState } from "react";

import { BRAND_CREAM, SurviveWordmark } from "@/components/brand-cards/bolt-boil";

const HOLD_MS = 1400;
const FADE_MS = 420;

export function LearnIntro() {
  const [phase, setPhase] = useState<"hidden" | "showing" | "fading">("hidden");

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setPhase("showing");
    const hold = window.setTimeout(() => setPhase("fading"), HOLD_MS);
    return () => window.clearTimeout(hold);
  }, []);

  useEffect(() => {
    if (phase !== "fading") return;
    const t = window.setTimeout(() => setPhase("hidden"), FADE_MS);
    return () => window.clearTimeout(t);
  }, [phase]);

  if (phase === "hidden") return null;

  return (
    <div
      role="presentation"
      onClick={() => setPhase("fading")}
      className="fixed inset-0 z-[130] grid cursor-pointer place-items-center"
      style={{ background: "#0A1220", opacity: phase === "fading" ? 0 : 1, transition: `opacity ${FADE_MS}ms ease` }}
    >
      <div className="flex flex-col items-center gap-4">
        {/* No boilFrame → the wordmark's own CSS boil runs, exactly like the footer mark. */}
        <SurviveWordmark size={72} />
        <p style={{ fontFamily: "'Rubik', system-ui, sans-serif", fontWeight: 600, fontSize: 14, letterSpacing: "0.04em", color: BRAND_CREAM, opacity: 0.7 }}>
          Loading cram videos...
        </p>
      </div>
    </div>
  );
}
