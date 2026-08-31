// THE THREE MODES — CRAM, PRACTICE, REVIEW.
//
// ── ONE LAYOUT, THREE SKINS ───────────────────────────────────────────────────────────────────
// A mode is a THEME LAYER: a set of CSS custom properties published on the /learn root, plus a
// bolt variant. It is deliberately NOT three copies of the page. Every component below reads
// var(--lm-*) and knows nothing about which mode is active, so adding a fourth mode is an entry
// in this file and a bolt variant — not a fork of the surface.
//
// ── WHY THE VARIABLES TRANSITION AND THE LAYOUT DOES NOT ──────────────────────────────────────
// Switching modes should feel like the room changing around you, not like a page load. Colours
// and glows animate; nothing moves position. That is what makes the switch read as "immediate and
// total" without anything jumping — a layout that re-flows on a mode change would look broken
// even at the same duration.
//
// NO NEW DEPENDENCIES. Every animation here is CSS keyframes over these variables, and every bolt
// treatment is inline SVG. Nothing imports a motion library.

export type LearnMode = "cram" | "practice" | "review";

export const LEARN_MODES: LearnMode[] = ["cram", "practice", "review"];

export const MODE_LABEL: Record<LearnMode, string> = {
  cram: "Cram",
  practice: "Practice",
  review: "Review",
};

/** One line each, shown under the switcher — what this mode is FOR, in the student's terms. */
export const MODE_BLURB: Record<LearnMode, string> = {
  cram: "Get the idea fast.",
  practice: "Build the power.",
  review: "Put it all together.",
};

/** The variables each mode publishes. Named with an --lm- prefix (learn mode) so they cannot
 *  collide with the site-wide --bg- and --text- tokens a page outside /learn might also be
 *  setting. (Spelled out rather than globbed: the glob form closes this comment.) */
export type ModeVars = {
  /** Page background — a gradient, so REVIEW can be a nebula rather than a flat colour. */
  bg: string;
  /** Panel surfaces: spine, cards, player frame. */
  surface: string;
  /** Panel borders. */
  border: string;
  /** Body text. */
  text: string;
  /** Secondary text. */
  muted: string;
  /** The one action colour for this mode. */
  accent: string;
  /** Readable text ON the accent. */
  accentInk: string;
  /** The glow a card lifts into on hover, and the player frame's halo. */
  glow: string;
};

export const MODE_VARS: Record<LearnMode, ModeVars> = {
  // CRAM — the current look, unchanged. Navy and orange, fast and focused. This is the baseline
  // every other mode is a departure from, so it is deliberately the existing palette rather than
  // a new interpretation of it.
  cram: {
    bg: "radial-gradient(1200px 800px at 50% -10%, #16233F 0%, #0A1220 55%, #060A14 100%)",
    surface: "linear-gradient(160deg, #12203E, #070C1A)",
    border: "rgba(120,140,180,0.22)",
    text: "#E8ECF5",
    muted: "#93A0B4",
    accent: "#FCA311",
    accentInk: "#0B1322",
    glow: "rgba(252,163,17,0.35)",
  },

  // PRACTICE — seafoam. You made it through the cram; now you build the power. Cooler and
  // brighter than cram, and the bolt crackles rather than boils (see ModeBolt).
  practice: {
    bg: "radial-gradient(1200px 800px at 50% -10%, #0E3A34 0%, #072520 55%, #04120F 100%)",
    surface: "linear-gradient(160deg, #0F3A33, #051A16)",
    border: "rgba(94,232,192,0.24)",
    text: "#E6FFF8",
    muted: "#7FB8A8",
    accent: "#4EE8B4",
    accentInk: "#03201A",
    glow: "rgba(78,232,180,0.4)",
  },

  // REVIEW — the destination. Deep space, a monolithic bolt, slow pulsing waves pushing outward
  // like a subwoofer. The palette is the darkest of the three on purpose: it should feel like
  // arriving somewhere, not like another tab.
  review: {
    bg: "radial-gradient(1400px 900px at 50% -5%, #2A1B4E 0%, #140D2B 45%, #07040F 100%)",
    surface: "linear-gradient(160deg, #1C1440, #0A0620)",
    border: "rgba(167,139,250,0.26)",
    text: "#EFE9FF",
    muted: "#A093C8",
    accent: "#A78BFA",
    accentInk: "#0B0618",
    glow: "rgba(167,139,250,0.45)",
  },
};

/** The style object a mode publishes on the /learn root. Everything downstream reads var(--lm-*). */
export function modeStyle(mode: LearnMode): React.CSSProperties {
  const v = MODE_VARS[mode];
  return {
    ["--lm-bg" as string]: v.bg,
    ["--lm-surface" as string]: v.surface,
    ["--lm-border" as string]: v.border,
    ["--lm-text" as string]: v.text,
    ["--lm-muted" as string]: v.muted,
    ["--lm-accent" as string]: v.accent,
    ["--lm-accent-ink" as string]: v.accentInk,
    ["--lm-glow" as string]: v.glow,
  } as React.CSSProperties;
}

/** Mode CSS — the transitions, the card hover, the spine slide, and REVIEW's nebula waves.
 *  Injected once by the /learn root. */
export const LEARN_MODE_CSS = `
/* THE MODE TRANSITION. Colours cross-fade; nothing moves. 420ms is long enough to read as a
   change of place and short enough that a student switching back and forth is not waiting. */
.lm-root, .lm-surface, .lm-accent-text, .lm-accent-bg {
  transition: background 420ms ease, background-color 420ms ease, border-color 420ms ease,
              color 420ms ease, box-shadow 420ms ease;
}

.lm-root { background: var(--lm-bg); color: var(--lm-text); }
.lm-surface { background: var(--lm-surface); border-color: var(--lm-border); }

/* VIDEO CARDS — the existing hover was good, so it is kept: a small lift, nothing else moving,
   and the play affordance fading in rather than popping. */
.lm-card { transition: transform 180ms ease, box-shadow 180ms ease, border-color 420ms ease; }
.lm-card:hover { transform: translateY(-3px); box-shadow: 0 18px 40px -20px var(--lm-glow); }
.lm-card .lm-play { opacity: 0; transition: opacity 160ms ease; }
.lm-card:hover .lm-play { opacity: 1; }

/* THE SPINE SLIDE. The highlight is a moving block behind the rows, not a class on the active
   row — that is what makes it travel between topics instead of blinking from one to the next.
   cubic-bezier overshoots a hair and settles, which is the "slot machine" feel: it arrives
   rather than stopping. */
.lm-spine-marker {
  transition: transform 420ms cubic-bezier(0.22, 1.15, 0.36, 1), height 260ms ease;
}

/* REVIEW'S NEBULA — two slow waves pushing outward from behind the bolt, like a subwoofer cone.
   Pure CSS on two pseudo-layers; no canvas, no library. Only rendered in review mode. */
@keyframes lm-wave {
  0%   { transform: scale(0.72); opacity: 0.55; }
  70%  { opacity: 0.10; }
  100% { transform: scale(2.1); opacity: 0; }
}
.lm-nebula { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.lm-nebula::before, .lm-nebula::after {
  content: ""; position: absolute; left: 50%; top: 42%;
  width: 46vmin; height: 46vmin; margin: -23vmin 0 0 -23vmin; border-radius: 50%;
  background: radial-gradient(circle, var(--lm-glow) 0%, rgba(0,0,0,0) 68%);
  animation: lm-wave 7.5s cubic-bezier(0.25, 0.6, 0.3, 1) infinite;
}
/* The second wave is the same pulse, half a cycle behind — one cone, two ripples. */
.lm-nebula::after { animation-delay: 3.75s; }

/* PRACTICE'S CRACKLE — a fast, irregular flicker on the bolt's charge paths. Deliberately not a
   smooth loop: crackling is the point, and an even sine reads as breathing, not charge. */
@keyframes lm-crackle {
  0%, 100% { opacity: 0.15; }
  8%       { opacity: 0.95; }
  12%      { opacity: 0.25; }
  26%      { opacity: 0.8; }
  31%      { opacity: 0.2; }
  55%      { opacity: 0.9; }
  60%      { opacity: 0.3; }
  78%      { opacity: 0.7; }
}
.lm-crackle { animation: lm-crackle 1.9s linear infinite; }

/* REVIEW'S MONOLITH — a very slow breath, so the bolt reads as massive rather than idle. */
@keyframes lm-monolith { 0%, 100% { opacity: 0.85; } 50% { opacity: 1; } }
.lm-monolith { animation: lm-monolith 5.5s ease-in-out infinite; }

/* EVERY mode animation stops for reduced motion. The colours still change — that is information,
   not decoration — but nothing pulses, crackles or slides. */
@media (prefers-reduced-motion: reduce) {
  .lm-nebula::before, .lm-nebula::after, .lm-crackle, .lm-monolith { animation: none; }
  .lm-spine-marker { transition: none; }
  .lm-card, .lm-card:hover { transform: none; transition: none; }
}
`;
