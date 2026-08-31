// THE BOLT, THREE WAYS — one drawing, three states of charge.
//
// The bolt silhouette is IDENTICAL in all three modes on purpose. What changes is what is
// happening to it, because the modes are a progression through one product rather than three
// products: you cram, then you build the power, then you arrive.
//
//   CRAM      the standard bolt. Still, confident, nothing to prove.
//   PRACTICE  charged. Arcs crackle off the edges at an irregular rhythm — building, not idling.
//   REVIEW    monolithic, against a nebula, breathing very slowly while waves push outward
//             behind it (the waves live in LEARN_MODE_CSS's .lm-nebula, not here, because they
//             belong to the surface rather than to the mark).
//
// SVG AND CSS ONLY — no motion library, per the brief. Every animation is a class from
// learn-modes.ts, so reduced-motion turns all of it off in one place.
import type { LearnMode } from "./learn-modes";

export function ModeBolt({ mode, height = 96 }: { mode: LearnMode; height?: number }) {
  const w = Math.round(height * (34 / 96));
  return (
    <svg
      viewBox="0 0 34 96"
      width={w}
      height={height}
      fill="none"
      aria-hidden
      style={{ display: "block", overflow: "visible" }}
    >
      {/* THE SILHOUETTE — the same path in every mode. It wears the mode's accent, so the bolt
          recolours with the room without being redrawn. */}
      <path
        d="M20 2 L6 44 L15 44 L11 94 L28 40 L18 40 L26 2 Z"
        fill="var(--lm-accent)"
        stroke="var(--lm-accent)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={mode === "review" ? "lm-monolith" : undefined}
        style={{
          // REVIEW's bolt is a monolith: a hard glow that makes it read as lit from within
          // rather than drawn on top.
          filter: mode === "review" ? "drop-shadow(0 0 18px var(--lm-glow))" : undefined,
          transition: "fill 420ms ease, stroke 420ms ease, filter 420ms ease",
        }}
      />

      {/* PRACTICE — the charge. Four arcs off the bolt's edges, each crackling on its own offset
          so the flicker never lands in a rhythm. An even pulse would read as breathing; charge
          is supposed to be uneven. */}
      {mode === "practice" && (
        <g stroke="var(--lm-accent)" strokeWidth={2} strokeLinecap="round" fill="none">
          <path d="M6 30 L-4 24" className="lm-crackle" style={{ animationDelay: "0s" }} />
          <path d="M27 22 L37 15" className="lm-crackle" style={{ animationDelay: "0.35s" }} />
          <path d="M9 58 L-2 63" className="lm-crackle" style={{ animationDelay: "0.7s" }} />
          <path d="M25 52 L36 57" className="lm-crackle" style={{ animationDelay: "1.05s" }} />
          {/* Two shorter sparks nearer the core, faster, so the charge has depth. */}
          <path d="M13 38 L5 36" className="lm-crackle" strokeWidth={1.4} style={{ animationDelay: "0.2s" }} />
          <path d="M22 62 L30 65" className="lm-crackle" strokeWidth={1.4} style={{ animationDelay: "0.85s" }} />
        </g>
      )}

      {/* REVIEW — a faint outer halo ring, so the monolith sits in something rather than on it.
          The moving waves are the surface's job; this is the bolt's own edge. */}
      {mode === "review" && (
        <ellipse
          cx="17" cy="48" rx="26" ry="46"
          fill="none"
          stroke="var(--lm-glow)"
          strokeWidth={1}
          opacity={0.5}
          className="lm-monolith"
        />
      )}
    </svg>
  );
}
