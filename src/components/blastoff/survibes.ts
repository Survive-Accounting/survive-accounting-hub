// SURVIBES — the data and the clock behind the flip (SurvibesFrame.tsx draws it). Pure.
//
// Prompt 4 of the Editor session brief (2026-09-11), matched to end-of-topic-frames.html's
// "Survibes": the normal wordmark, large and centred; at ~0.7 s a white-blue flash, a big split
// red/blue bolt strikes in from above, the "ve" flips on its X axis and comes back as "bes", the
// background lights red-left / blue-right with faint scanlines; then the wordmark glides to the
// top and the camera and a LARGE captions box take the frame. Props pop in from a reveal queue
// — the first is Luca Pacioli — while the wordmark shrinks to the corner and the camera to a
// small circle.
//
// THE CLOCK is the mockup's, to the millisecond (its `later(…)` calls): 700 strike, 760 flip,
// 930 "bes", 1000 lit, 1700 settled. `lookAt` turns a time into the six booleans the frame
// keys its styles on; reduced motion (or a still render) is the settled look at once.
//
// THE COUNTDOWN is authoring-only: 2:00 in the main window's chrome so Lee paces the monologue
// (the mockup's "Monologue timer (authoring only, never exported)"). It never draws in the pop-
// out and never in the shot.

export const SURVIBES_T = { strike: 700, flip: 760, bes: 930, lit: 1000, settled: 1700, flashEnd: 1200, glide: 700, camIn: 2400 } as const;

export interface SurvibesLook {
  /** The bolt is striking (from `strike` until settled). */
  strike: boolean;
  /** The white-blue flash is on screen. */
  flash: boolean;
  /** The tail is mid-flip (rotated away). */
  flipping: boolean;
  tail: "ve" | "bes";
  /** The room is lit red-left / blue-right. */
  lit: boolean;
  /** The wordmark is at the top, the camera and captions are in. */
  settled: boolean;
}

export const SETTLED_LOOK: SurvibesLook = { strike: false, flash: false, flipping: false, tail: "bes", lit: true, settled: true };

/** What the frame looks like `ms` after it arrived. `still` (reduced motion, a non-film surface)
 *  is the settled look regardless of time. */
export function lookAt(ms: number, still = false): SurvibesLook {
  if (still) return SETTLED_LOOK;
  const T = SURVIBES_T;
  return {
    strike: ms >= T.strike && ms < T.settled,
    flash: ms >= T.strike && ms < T.flashEnd,
    flipping: ms >= T.flip && ms < T.bes,
    tail: ms >= T.bes ? "bes" : "ve",
    lit: ms >= T.lit,
    settled: ms >= T.settled,
  };
}

/** A PROP — a card that pops over the top area on a spacebar step. */
export interface SurvibesProp {
  id: string;
  chip: string;
  title: string;
  who: string;
  timeline: readonly { when: string; what: string }[];
}

/** The reveal queue. One so far — the mockup's; more are added here, never typed on a slide. */
export const SURVIBES_PROPS: readonly SurvibesProp[] = [
  {
    id: "pacioli", chip: "Memorize this", title: "Luca Pacioli", who: "The “Father of Accounting.” Exams love it.",
    timeline: [
      { when: "3200 BC", what: "Clay tablets track debts" },
      { when: "1300s", what: "Merchants go double-entry" },
      { when: "1494", what: "Pacioli writes the manual" },
      { when: "Now", what: "A = L + E, on your exam" },
    ],
  },
];

/** Spacebar states: the camera alone, then one per prop. */
export function survibesSteps(): number {
  return 1 + SURVIBES_PROPS.length;
}

/** The prop up at `step` (0 = none). `undefined` = at rest: none — the settled look, the camera
 *  alone (the Editor stage, the thumbnails, reduced motion). */
export function propAt(step: number | undefined): SurvibesProp | null {
  if (step === undefined) return null;
  if (step <= 0) return null;
  return SURVIBES_PROPS[Math.min(step, SURVIBES_PROPS.length) - 1] ?? null;
}

/** Where the camera goes while a prop is up: a small circle (the free spot's .26w default) under
 *  the prop card, above the large captions box — top-left as fractions of the phone. */
export const SURVIBES_PROP_CAM = { x: 0.05, y: 0.45 } as const;

export const SURVIBES_COUNTDOWN_S = 120;
export const SURVIBES_WARN_S = 15;

/** m:ss, never below 0:00. */
export function clockLabel(secondsLeft: number): string {
  const s = Math.max(0, Math.floor(secondsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
