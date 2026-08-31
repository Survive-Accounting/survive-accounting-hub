// LEARN INTRO — the drawn wordmark, full screen for a beat on a student's FIRST arrival at
// /learn, then it settles away into the nav (the static mark up there is the same mark — the
// overlay fading is the settle). Once per visitor (localStorage), skippable with a click/key,
// and prefers-reduced-motion never shows it at all: a student who asked for less motion gets
// their course list immediately, not a still frame blocking it.
import { useEffect, useState } from "react";

import { AnimatedWordmark } from "@/components/brand/AnimatedWordmark";

const SEEN_KEY = "sa-learn-intro";
const FADE_MS = 420;

export function LearnIntro() {
  const [phase, setPhase] = useState<"hidden" | "drawing" | "fading">("hidden");

  useEffect(() => {
    try {
      if (localStorage.getItem(SEEN_KEY) === "seen") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
        localStorage.setItem(SEEN_KEY, "seen");
        return;
      }
      localStorage.setItem(SEEN_KEY, "seen"); // marked on show — once per visitor, even mid-draw reloads
      setPhase("drawing");
    } catch { /* private mode: no way to remember it — skip rather than replay forever */ }
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
      <AnimatedWordmark
        speed={1.15}
        showAccounting
        size={92}
        onDone={() => window.setTimeout(() => setPhase("fading"), 380)}
      />
    </div>
  );
}
